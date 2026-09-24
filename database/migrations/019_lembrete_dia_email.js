'use strict';
/* ============================================================
   Corte Comigo – 019_lembrete_dia_email.js
   Marca de envio do lembrete por e-mail (Gmail) NO DIA do agendamento.

   Complementa 018_lembrete_email.js (véspera). O lembrete é enviado
   duas vezes: 1 dia antes e no próprio dia. Cada marca é persistida
   para que o job nunca reenvie o mesmo agendamento.
   ============================================================ */

exports.up = async function (knex) {
  const existe = await knex.schema.hasColumn('appointments', 'lembrete_dia_email_em');
  if (!existe) {
    await knex.schema.alterTable('appointments', function (table) {
      table.timestamp('lembrete_dia_email_em', { useTz: true }).nullable();
    });
  }
};

exports.down = async function (knex) {
  const existe = await knex.schema.hasColumn('appointments', 'lembrete_dia_email_em');
  if (existe) {
    await knex.schema.alterTable('appointments', function (table) {
      table.dropColumn('lembrete_dia_email_em');
    });
  }
};
