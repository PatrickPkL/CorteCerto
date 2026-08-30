'use strict';
/* ============================================================
   Corte Certo – 007_ticket_resposta.js
   Coluna `resposta` em tickets (usada pelo super-admin ao
   responder um chamado). A migração 006 velha do pg_map já
   referenciava o campo; aqui materializamos no schema.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resposta TEXT;`);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE tickets DROP COLUMN IF EXISTS resposta;`);
};