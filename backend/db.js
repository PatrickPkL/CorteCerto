/* ============================================================
   Corte Certo – db.js  (PRD v2 · Seção 5 / Seção 7)
   Persistência cuja FONTE DE VERDADE é o PostgreSQL.

   Estratégia "espelho PG->memória":
     - init() carrega todas as tabelas do PostgreSQL para a memória
       (formato compatível com api.js/auth.js), descriptografando
       dados sensíveis.
     - A lógica de negócio continua SÍNCRONA lendo de _d().
     - Em cada salvar() as coleções alteradas são sincronizadas de
       volta ao PostgreSQL (upsert + delete) via fila assíncrona.

   Mantém a API pública original: _d / salvar / proximoId / reset /
   helpers de data / criptografar / descriptografar.
   ============================================================ */

window.DB = (function () {
  'use strict';

  const crypto = require('crypto');
  const { asAdmin } = require('./pool');
  const crypt = require('./crypt');
  const pg_map = require('./pg_map');

  const DB_VERSION = 7;

  var _loaded = false;
  var db = null;              // working copy (memória)
  var _orig = {};             // snapshot por coleção (detecção de mudanças)
  var _queue = Promise.resolve();

  /* ---------------- helpers de data (hora local, mata DT-11) ---------------- */

  function pad2(n) { return String(n).padStart(2, '0'); }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function agoraMinutos() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function addDiasISO(n, base) {
    const d = base ? parseISO(base) : new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function diaSemana(iso) { return parseISO(iso).getDay(); }

  function hhmmToMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  }

  function minToHHMM(t) { return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }

  function fmtDataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return d + '/' + m + '/' + y;
  }

  function fmtBRL(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  function iniciais(nome) {
    return (nome || '?').trim().split(/\s+/).slice(0, 2)
      .map(p => p[0].toUpperCase()).join('');
  }

  /* ---------------- criptografia ---------------- */

  function criptografar(texto) { return crypt.criptografar(texto); }
  function descriptografar(texto) { return crypt.descriptografar(texto); }

  /* ---------------- estado ---------------- */

  function nextId() {
    // ids agora são UUID (colunas UUID no PostgreSQL)
    return crypto.randomUUID();
  }

  function _deep(v) { return JSON.parse(JSON.stringify(v)); }

  function salvar() {
    if (!_loaded) return;
    _scheduleSync();
  }

  function _scheduleSync() {
    _queue = _queue.then(() => syncAll()).catch(e => {
      console.error('[db][sync]', e && e.stack ? e.stack : e);
    });
  }

  async function syncAll() {
    if (!_loaded) return;
    for (const m of pg_map.MAP) {
      const cur = db[m.colecao] || [];
      const prev = _orig[m.colecao];
      const prevJson = prev === undefined ? '[]' : JSON.stringify(prev);
      if (JSON.stringify(cur) !== prevJson) {
        await writeCol(m, cur, prev || []);
        _orig[m.colecao] = _deep(cur);
      }
    }
  }

  /* ---------------- escrita no PostgreSQL ---------------- */

  function _iso(v) {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toISOString();
  }

  function _val(colType, v) {
    if (v === null || v === undefined) return { sql: 'NULL', binds: [] };
    switch (colType) {
      case 'uuid': return { sql: '?::uuid', binds: [String(v)] };
      case 'jsonb': return { sql: '?::jsonb', binds: [typeof v === 'string' ? v : JSON.stringify(v)] };
      case 'jsonb[]': {
        const arr = v || [];
        return {
          sql: 'ARRAY[' + arr.map(() => '?::jsonb').join(',') + ']',
          binds: arr.map(x => (typeof x === 'string' ? x : JSON.stringify(x)))
        };
      }
      case 'text[]': return { sql: '?::text[]', binds: [v || []] };
      case 'time': return { sql: '?::time', binds: [String(v)] };
      case 'timestamptz': return { sql: '?::timestamptz', binds: [_iso(v)] };
      case 'inet': return { sql: '?::inet', binds: [String(v)] };
      case 'numeric':
      case 'int':
      case 'boolean':
      default: return { sql: '?', binds: [v] };
    }
  }

  function _pkWhere(pk, row) {
    if (Array.isArray(pk)) {
      return pk.map(c => `"${c}" = ?::uuid`).join(' AND ');
    }
    return `"${pk}" = ?::uuid`;
  }
  function _pkBinds(pk, row) {
    return Array.isArray(pk) ? pk.map(c => String(row[c])) : [String(row[pk])];
  }
  function _pkCols(pk) {
    return Array.isArray(pk) ? pk : [pk];
  }

  async function writeCol(m, rows, prevRows) {
    // detecta removidos (diff de pk entre estado anterior e atual)
    const curKeys = new Set(rows.map(r => _pkCols(m.pk).map(c => String(r[c])).join('|')));
    const removed = (prevRows || []).filter(r => !curKeys.has(_pkCols(m.pk).map(c => String(r[c])).join('|')));

    await asAdmin(async trx => {
      if (removed.length) {
        const pkCols = _pkCols(m.pk);
        const cond = pkCols.map(c => {
          if (pkCols.length === 1) return `"${c}" = ANY(?::uuid[])`;
          return `("${c}") IN (${removed.map(() => pkCols.map(() => '?::uuid').join(',')).join('),(')})`;
        }).join('');
        let sql, binds;
        if (pkCols.length === 1) {
          sql = `DELETE FROM "${m.tabela}" WHERE ${cond}`;
          binds = [removed.map(r => String(r[pkCols[0]]))];
        } else {
          sql = `DELETE FROM "${m.tabela}" WHERE ${cond}`;
          binds = removed.flatMap(r => pkCols.map(c => String(r[c])));
        }
        await trx.raw(sql, binds);
      }

      if (!rows.length) return;

      // monta INSERT multirow com upsert
      const cols = Object.keys(m.toPg(rows[0]));
      const conflictTarget = _pkCols(m.pk).map(c => `"${c}"`).join(', ');
      const placeholders = rows.map((row, idx) => {
        const rowPg = m.toPg(row);
        const vals = cols.map(col => _val((pg_map.CASTS[m.tabela] || {})[col], rowPg[col]));
        return '(' + vals.map(v => v.sql).join(', ') + ')';
      }).join(', ');

      const allRowBinds = [];
      rows.forEach(row => {
        const rowPg = m.toPg(row);
        cols.forEach(col => {
          const v = _val((pg_map.CASTS[m.tabela] || {})[col], rowPg[col]);
          allRowBinds.push(...v.binds);
        });
      });

      const updateSet = cols.filter(c => !_pkCols(m.pk).includes(c))
        .map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

      const sql = `INSERT INTO "${m.tabela}" ("${cols.join('", "')}")
        VALUES ${placeholders}
        ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
      await trx.raw(sql, allRowBinds);
    });
  }

  /* ---------------- carga do PostgreSQL ---------------- */

  async function init() {
    if (_loaded) return;
    const obj = { v: DB_VERSION, meta: { seq: 2000 } };
    pg_map.BY_COLECAO.favorites = null;

    for (const m of pg_map.MAP) {
      const rows = await asAdmin(trx => trx(m.tabela).select('*'));
      obj[m.colecao] = rows.map(r => m.toMem(r));
    }

    // coleções presentes no modelo antigo mas sem tabela própria
    obj.favorites = [];
    obj.sessions = obj.sessions || [];
    obj.sms_codes = obj.sms_codes || [];

    // normaliza coleções ausentes (seed vazio)
    pg_map.MAP.forEach(m => { obj[m.colecao] = obj[m.colecao] || []; });

    db = obj;
    _orig = {};
    pg_map.MAP.forEach(m => { _orig[m.colecao] = _deep(db[m.colecao]); });
    _orig.favorites = [];

    // purge de sessões/códigos expirados
    await purgePersistidos();

    _loaded = true;
  }

  async function purgePersistidos() {
    const now = new Date();
    await asAdmin(async trx => {
      await trx('sessions').where('expires_at', '<=', now).del();
      await trx('sms_codes').where('used', true).orWhere('expires_at', '<=', now).del();
      await trx('magic_tokens').where('used', true).orWhere('expires_at', '<=', now).del();
      await trx('superadmin_sessions').where('expires_at', '<=', now).del();
    });
  }

  /* reset: esvazia tudo (dev/tests) */
  async function reset() {
    if (!_loaded) { await init(); }
    await asAdmin(async trx => {
      const tabelas = [
        'superadmin_sessions', 'audit_log', 'tickets', 'gallery_images', 'reviews',
        'notifications', 'magic_tokens', 'sms_codes', 'sessions', 'appointment_services',
        'appointments', 'payments', 'subscriptions', 'plans', 'clients',
        'schedule_exceptions', 'working_hours', 'professional_services', 'professionals',
        'services', 'barbershops', 'users'
      ];
      for (const t of tabelas) await trx.raw(`TRUNCATE TABLE "${t}" CASCADE;`);
    });
    db = { v: DB_VERSION, meta: { seq: 1 } };
    pg_map.MAP.forEach(m => { db[m.colecao] = []; });
    db.favorites = [];
    _orig = {};
    pg_map.MAP.forEach(m => { _orig[m.colecao] = [] });
    _orig.favorites = [];
  }

  /* ---------------- API pública ---------------- */

  return {
    init,
    _d: () => db,
    salvar,
    proximoId: nextId,
    reset,

    // datas/horas
    hojeISO, addDiasISO, parseISO, diaSemana, agoraMinutos,
    hhmmToMin, minToHHMM, pad2,
    fmtDataBR, fmtBRL, iniciais,

    // criptografia
    criptografar, descriptografar
  };
})();
