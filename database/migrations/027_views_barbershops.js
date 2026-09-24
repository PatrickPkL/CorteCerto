'use strict';
/* ============================================================
   Corte Certo – 027_views_barbershops.js
   Contador de visualizações do perfil público do salão (para o
   catálogo exibir "· N visualizações" de forma discreta).
   ============================================================ */

exports.up = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.integer('views').notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('barbershops', function (table) {
    table.dropColumn('views');
  });
};