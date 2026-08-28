'use strict';
/* ============================================================
   Corte Certo – 001_extension_and_types.js
   Extensão pgcrypto + tipos ENUM do domínio.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await knex.raw(`CREATE TYPE usr_role AS ENUM ('dono', 'cliente', 'barbeiro');`);
  await knex.raw(`CREATE TYPE exc_tipo AS ENUM ('folga', 'fechamento', 'feriado', 'evento');`);
  await knex.raw(`CREATE TYPE ag_status AS ENUM ('pendente', 'confirmado', 'concluido', 'nao_compareceu', 'cancelado');`);
  await knex.raw(`CREATE TYPE ag_origin AS ENUM ('online', 'admin', 'telefone');`);
  await knex.raw(`CREATE TYPE sub_status AS ENUM ('trial', 'ativa', 'cancelada', 'expirada');`);
  await knex.raw(`CREATE TYPE pay_status AS ENUM ('pending', 'paid', 'expired', 'cancelled');`);
  await knex.raw(`CREATE TYPE tik_status AS ENUM ('aberto', 'em_andamento', 'resolvido', 'fechado');`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP TYPE IF EXISTS tik_status;`);
  await knex.raw(`DROP TYPE IF EXISTS pay_status;`);
  await knex.raw(`DROP TYPE IF EXISTS sub_status;`);
  await knex.raw(`DROP TYPE IF EXISTS ag_origin;`);
  await knex.raw(`DROP TYPE IF EXISTS ag_status;`);
  await knex.raw(`DROP TYPE IF EXISTS exc_tipo;`);
  await knex.raw(`DROP TYPE IF EXISTS usr_role;`);
};
