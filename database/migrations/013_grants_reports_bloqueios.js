'use strict';
/* ============================================================
   Corte Certo – 013_grants_reports_bloqueios.js
   Backfill: as migrations 005/006 concederam privilégios com
   "ON ALL TABLES IN SCHEMA public", que não cobre tabelas
   criadas posteriormente. Concede explicitamente os DMLs em
   reports/blocked_clients para as roles da aplicação.

   Idempotente: rode novamente sem risco.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON reports, blocked_clients TO cortecerto_app;`);
  await knex.raw(`GRANT SELECT ON reports, blocked_clients TO cortecerto_readonly;`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON reports, blocked_clients TO cortecerto_admin;`);
};

exports.down = async function (knex) {
  await knex.raw(`REVOKE ALL ON reports, blocked_clients FROM cortecerto_app, cortecerto_readonly, cortecerto_admin;`);
};