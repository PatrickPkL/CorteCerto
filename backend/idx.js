/* ============================================================
   Corte Certo – backend/idx.js
   Índices em memória (Map) sobre o espelho do PostgreSQL.
   Transforma buscas O(n) dos hot paths de autenticação/RPC em
   lookups O(1). Inválida por coleção e é auto-reparável:

     - versão: db.js incrementa _versoes[colecao] quando a coleção
       muda e é sincronizada com sucesso.
     - tamanho: captura mutações em memória ANTES do sync (push/
       filter/map) sem esperar a versão.

   Coleções grandes e de escrita frequente (appointments) NÃO são
   indexadas de propósito — manteriam o custo de reconstrução alto.
   ============================================================ */

'use strict';

const DB = global.DB;

var _cache = {};   // nome -> { len, versao, map1, map2, ... }

function _arr(colecao) { const db = DB._d(); return (db && db[colecao]) || []; }
function _versaoColecao(nome) {
  try { return (DB.versao && DB.versao(nome)) || 0; } catch (e) { return 0; }
}

/* Constrói (ou revalida) o cache de um índice. Retorna o objeto de
   cache; quem chama sabe quais Mapas usar. */
function _cacheIndice(nome, colecao, len, construir) {
  let c = _cache[nome];
  const v = _versaoColecao(colecao);
  if (!c || c.len !== len || c.versao !== v) {
    c = { len, versao: v, map: construir() };
    _cache[nome] = c;
  }
  return c;
}

module.exports = {
  /* sessões: token -> sessão */
  sessaoPorToken() {
    const arr = _arr('sessions');
    return _cacheIndice('sessaoToken', 'sessions', arr.length, () => {
      const m = new Map(arr.map(s => [s.token, s]));
      return m;
    }).map;
  },

  /* sessões: id -> sessão */
  sessaoPorId() {
    const arr = _arr('sessions');
    return _cacheIndice('sessaoId', 'sessions', arr.length, () => {
      const m = new Map();
      arr.forEach(s => m.set(s.id, s));
      return m;
    }).map;
  },

  /* sessões ativas por usuário: user_id -> [sessões] */
  sessoesPorUsuario() {
    const arr = _arr('sessions');
    return _cacheIndice('sessaoUser', 'sessions', arr.length, () => {
      const m = new Map();
      arr.forEach(s => {
        let l = m.get(s.user_id);
        if (!l) { l = []; m.set(s.user_id, l); }
        l.push(s);
      });
      return m;
    }).map;
  },

  /* usuários: id -> user */
  usuarioPorId() {
    const arr = _arr('users');
    return _cacheIndice('user-id', 'users', arr.length, () => {
      const m = new Map();
      arr.forEach(u => m.set(u.id, u));
      return m;
    }).map;
  },

  /* usuários: e-mail -> user */
  usuarioPorEmail() {
    const arr = _arr('users');
    return _cacheIndice('user-email', 'users', arr.length, () => {
      const m = new Map();
      arr.forEach(u => { if (u && u.email) m.set(String(u.email).toLowerCase(), u); });
      return m;
    }).map;
  },

  /* usuários: telefone (só dígitos) -> user */
  usuarioPorTelefone() {
    const arr = _arr('users');
    return _cacheIndice('user-fone', 'users', arr.length, () => {
      const m = new Map();
      arr.forEach(u => {
        if (!u || !u.phone) return;
        m.set(String(u.phone).replace(/\D/g, ''), u);
      });
      return m;
    }).map;
  },

  /* barbershops: id -> loja */
  lojaPorId() {
    const arr = _arr('barbershops');
    return _cacheIndice('shop-id', 'barbershops', arr.length, () => {
      const m = new Map();
      arr.forEach(b => m.set(b.id, b));
      return m;
    }).map;
  },

  /* barbershops: slug -> loja */
  lojaPorSlug() {
    const arr = _arr('barbershops');
    return _cacheIndice('shop-slug', 'barbershops', arr.length, () => {
      const m = new Map();
      arr.forEach(b => { if (b && b.slug) m.set(b.slug, b); });
      return m;
    }).map;
  },

  /* barbershops: codigo_unico (sempre maiúsculo) -> loja
     O lookup real faz codigo.toUpperCase() === b.codigo_unico (api.js);
     normalizamos na chave para casar independente da caixa gravada. */
  lojaPorCodigo() {
    const arr = _arr('barbershops');
    return _cacheIndice('shop-codigo', 'barbershops', arr.length, () => {
      const m = new Map();
      arr.forEach(b => {
        if (!b || !b.codigo_unico) return;
        m.set(String(b.codigo_unico).toUpperCase(), b);
      });
      return m;
    }).map;
  },

  /* barbershops: owner_user_id -> loja */
  lojaPorDono() {
    const arr = _arr('barbershops');
    return _cacheIndice('shop-owner', 'barbershops', arr.length, () => {
      const m = new Map();
      arr.forEach(b => { if (b && b.owner_user_id) m.set(b.owner_user_id, b); });
      return m;
    }).map;
  },

  /* profissionais: user_id -> profissional */
  profissionalPorUsuario() {
    const arr = _arr('professionals');
    return _cacheIndice('prof-user', 'professionals', arr.length, () => {
      const m = new Map();
      arr.forEach(p => { if (p && p.user_id) m.set(p.user_id, p); });
      return m;
    }).map;
  },

  /* profissionais: barbershop_id -> [profissionais] */
  profissionaisPorLoja() {
    const arr = _arr('professionals');
    return _cacheIndice('prof-shop', 'professionals', arr.length, () => {
      const m = new Map();
      arr.forEach(p => {
        if (!p || !p.barbershop_id) return;
        let l = m.get(p.barbershop_id);
        if (!l) { l = []; m.set(p.barbershop_id, l); }
        l.push(p);
      });
      return m;
    }).map;
  },

  reset() { _cache = {}; }
};