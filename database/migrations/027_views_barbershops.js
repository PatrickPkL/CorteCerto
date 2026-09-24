'use strict';
/* ============================================================
   Corte Comigo – 027_views_barbershops.js
   Contador de visualizações do perfil público do salão (para o
   catálogo exibir "· N visualizações" de forma discreta).
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;`);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE barbershops DROP COLUMN IF EXISTS views;`);
};