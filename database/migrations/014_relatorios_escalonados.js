'use strict';
/* ============================================================
   Corte Certo – 014_relatorios_escalonados.js
   Relatórios escalonados por plano (RF-070 v3.1):

   - plans.nivel_relatorio : 'basico' | 'intermediario' | 'completo'
     Free fica NULL → sem acesso a relatórios.
   - Concede a permissão 'relatorios' ao plano Autonomo para que o
     relatório BÁSICO (faturamento total) seja exibido no painel.

   Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE por nome.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS nivel_relatorio VARCHAR(20);`);

  await knex.raw(`ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_nivel_relatorio_check;`);
  await knex.raw(`ALTER TABLE plans ADD CONSTRAINT plans_nivel_relatorio_check
    CHECK (nivel_relatorio IN ('basico', 'intermediario', 'completo'));`);

  await knex.raw(`
    UPDATE plans SET nivel_relatorio = NULL
    WHERE name = 'Free' OR nivel_relatorio IS NULL;
  `);

  await knex.raw(`
    UPDATE plans SET nivel_relatorio = CASE name
      WHEN 'Autonomo'  THEN 'basico'
      WHEN 'Salao'     THEN 'intermediario'
      WHEN 'Salao Pro' THEN 'completo'
      ELSE NULL
    END;
  `);

  // Autonomo passa a ter relatórios (nível básico); demais planos
  // mantêm as permissões atuais sem duplicar 'relatorios'.
  await knex.raw(`
    UPDATE plans SET permissions = CASE
      WHEN 'relatorios' = ANY(permissions) THEN permissions
      WHEN name = 'Autonomo' THEN permissions || ARRAY['relatorios']
      ELSE permissions
    END;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`UPDATE plans SET permissions = array_remove(permissions, 'relatorios');`);
  await knex.raw(`ALTER TABLE plans DROP COLUMN IF EXISTS nivel_relatorio;`);
};