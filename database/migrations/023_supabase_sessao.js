'use strict';
/* ============================================================
   Corte Certo – 023_supabase_sessao.js
   Em bancos gerenciados (Supabase) o usuário dono (postgres) NÃO é
   superuser, então "SET LOCAL ROLE cortecerto_admin" falha com
   "permission denied to set role". Damos membership nos roles
   internos ao usuário que roda as migrações (CURRENT_USER):
   com membership, o SET ROLE funciona igual ao banco local.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`GRANT cortecerto_app, cortecerto_admin TO CURRENT_USER;`);
};

exports.down = async function (knex) {
  await knex.raw(`REVOKE cortecerto_app, cortecerto_admin FROM CURRENT_USER;`);
};