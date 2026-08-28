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

/* Hosts gerenciados (Render/Neon) usam SSL self-signed; "ssl=true" faz o
   cliente verificar o cert e falhar. Normaliza para aceitar o certificado. */
const _ssl = /(ssl=true|sslmode=(require|prefer|verify-ca|verify-full))/i.test(_url)
  ? { rejectUnauthorized: false }
  : undefined;

const knex = require('knex')({
  client: 'pg',
  connection: _ssl ? { connectionString: _url, ssl: _ssl } : _url,
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
