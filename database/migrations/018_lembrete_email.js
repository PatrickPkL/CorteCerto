'use strict';
/* ============================================================
   Corte Comigo – 018_lembrete_email.js
   Marca de envio do lembrete por e-mail (Gmail) do agendamento.

   Guarda QUANDO o lembrete de véspera foi enviado ao cliente para
   que o job de lembretes nunca reenvie o mesmo agendamento — o
   controle é persistido no banco, resistindo a reinícios.
   ============================================================ */

exports.up = async function (knex) {
  await knex.schema.alterTable('appointments', function (table) {
    table.timestamp('lembrete_email_em', { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('appointments', function (table) {
    table.dropColumn('lembrete_email_em');
  });
};
