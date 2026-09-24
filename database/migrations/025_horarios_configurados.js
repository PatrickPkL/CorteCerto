'use strict';
/* ============================================================
   Corte Comigo – 025_horarios_configurados.js
   Marca quando o dono do salão configura os horários (expediente
   ou intervalo). Enquanto false, o agendamento fica "zerado" para
   o cliente (RF-035) — só aparecem horários após o barbeiro salvar.
   ============================================================ */

exports.up = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.boolean('horarios_configurados').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.dropColumn('horarios_configurados');
  });
};