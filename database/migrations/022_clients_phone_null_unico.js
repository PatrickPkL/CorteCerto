'use strict';
/* ============================================================
   Corte Certo – 022_clients_phone_null_unico.js
   Clientes sem telefone (cadastro só por e-mail/nome) NÃO devem
   colidir na unicidade (barbershop_id, phone): antes, dois clientes
   sem telefone do mesmo salão geravam conflito e derrubavam TODO o
   sync para o PostgreSQL (pagamentos/assinaturas/agendamentos).

   - Dropa a CONSTRAINT clients_barbershop_phone_unique.
   - Normaliza phone '' -> NULL  (coluna já é NULL-able).
   - Recria a unicidade como índice único COMUM em
     (barbershop_id, phone): telefones reais continuam únicos por
     loja; múltiplos NULL continuam permitidos (NULL != NULL em
     índices únicos) e o ON CONFLICT do writeCol continua válido.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_barbershop_phone_unique;`);
  await knex.raw(`UPDATE clients SET phone = NULL WHERE phone = '';`);
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS clients_barbershop_phone_uq
     ON clients (barbershop_id, phone);`
  );
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS clients_barbershop_phone_uq;`);
  await knex.raw(
    `ALTER TABLE clients ADD CONSTRAINT clients_barbershop_phone_unique UNIQUE (barbershop_id, phone);`
  );
};