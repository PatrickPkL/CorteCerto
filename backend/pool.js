'use strict';
/* ============================================================
   Corte Certo – pool.js
   Pool de conexões PostgreSQL (via Knex) para a aplicação.

   Conecta como `cortecerto_app` (role com RLS ativo). Operações
   que precisam de visão global (catálogo público, busca, login
   por identidade, super-admin) assumem `cortecerto_admin` dentro
   de uma transação através de `setupSessao(...)`.
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const _url = process.env.DATABASE_URL ||
  'postgres://cortecerto_app:SUA_SENHA@127.0.0.1:5432/cortecerto';

/* Hosts gerenciados (Render/Neon) pedem SSL self-signed; o pg moderno
   trata "sslmode=require/ssl=true" como verify-full e exige cert válido.
   Parseamos a URL nós mesmos e repassamos ssl com rejectUnauthorized:false
   para não depender da versão do pg-connection-string no servidor. */
const _temSsl = /(ssl=true|sslmode)/i.test(_url);
let _conn;
if (_temSsl) {
  const _p = new URL(_url);
  _conn = {
    host: _p.hostname,
    port: Number(_p.port || 5432),
    database: (_p.pathname || '').replace(/^\//, ''),
    user: decodeURIComponent(_p.username || ''),
    password: decodeURIComponent(_p.password || ''),
    ssl: { rejectUnauthorized: false }
  };
} else {
  _conn = _url;
}

const knex = require('knex')({
  client: 'pg',
  connection: _conn,
  pool: { min: 0, max: 10 },
  searchPath: ['public'],
  timezone: process.env.TZ || 'America/Sao_Paulo'
});

/**
 * Executa uma transação com contexto de RLS configurado.
 * @param {object} ctx { barbershop_id, user_id, role }
 * @param {Function} fn (trx) => Promise
 */
async function withTrx(ctx, fn) {
  if (typeof ctx === 'function') { fn = ctx; ctx = undefined; }
  return knex.transaction(async (trx) => {
    if (ctx) {
      const c = ctx;
      if (c.barbershop_id) await trx.raw(`SET LOCAL app.barbershop_id = ?`, [String(c.barbershop_id)]);
      if (c.user_id) await trx.raw(`SET LOCAL app.user_id = ?`, [String(c.user_id)]);
      if (c.role) await trx.raw(`SET LOCAL app.role = ?`, [String(c.role)]);
    }
    return fn(trx);
  });
}

/**
 * Executa uma consulta como admin (BYPASSRLS) — visão global.
 * Usado para ler dados que a role tenant não enxergaria.
 */
async function asAdmin(fn) {
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL ROLE cortecerto_admin`);
    return fn(trx);
  });
}

module.exports = { knex, withTrx, asAdmin };
