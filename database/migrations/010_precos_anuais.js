'use strict';
/* ============================================================
   Corte Comigo – 010_precos_anuais.js
   RF-033 (preços v3): preço anual próprio por plano.

   Esta migration é independente da 009. Ela não depende de nada
   que a 009 tenha feito, apenas da tabela `plans` e das colunas
   `price_monthly` (que já existem).

   - Rodar só a 010: faz tudo (adiciona price_annual e ajusta os
     dois preços).
   - Rodar 009 e depois 010: funciona normalmente (o UPDATE mensal
     da 010 apenas sobrescreve os valores já ajustados pela 009).
   - Idempotente: ADD COLUMN IF NOT EXISTS / ELSE price_* não
     quebram re-execuções.

   Novos valores:
     Autonomo   mensal  9,90 | anual 118,00
     Salao      mensal 19,90 | anual 199,99
     Salao Pro  mensal 25,99 | anual 249,99
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_annual DECIMAL(10,2);`);

  await knex.raw(`
    UPDATE plans SET price_monthly = CASE name
      WHEN 'Autonomo'  THEN 9.90
      WHEN 'Salao'     THEN 19.90
      WHEN 'Salao Pro' THEN 25.99
      ELSE price_monthly
    END;
  `);

  await knex.raw(`
    UPDATE plans SET price_annual = CASE name
      WHEN 'Autonomo'  THEN 118.00
      WHEN 'Salao'     THEN 199.99
      WHEN 'Salao Pro' THEN 249.99
      ELSE price_annual
    END;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE plans DROP COLUMN IF EXISTS price_annual;`);
};