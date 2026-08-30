'use strict';
/* ============================================================
   Corte Certo – 006_slot_interval.js
   Intervalo de slots de agendamento configurável por salão.
   ============================================================ */

exports.up = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.integer('slot_interval_min').notNullable().defaultTo(15);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.dropColumn('slot_interval_min');
  });
};
