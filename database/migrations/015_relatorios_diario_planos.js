'use strict';
/* ============================================================
   Corte Certo – 015_relatorios_diario_planos.js
   Relatórios escalonados v2 (RF-070 evolução):

   1. Tabela relatorios_diarios — snapshot diário (padrão de TODOS
      os planos pagos) gerado às 00:00: faturamento, agendamentos,
      ticket médio e faixa de pico do dia.
   2. RLS + grants (padrão 012/013 para tabelas criadas após 005).
   3. Salão passa de 10 para 5 profissionais (limites: Autonomo=1,
      Salão=5, Salão Pro=ilimitado) e textos de features atualizados
      para refletir os novos relatórios (diário/semanal/mensal/best-day/
      detalhado), mantendo preços atuais.
   ============================================================ */

exports.up = async function (knex) {
  // ---- 1. tabela de snapshots diários ----
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS relatorios_diarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      faturamento NUMERIC(10,2) NOT NULL DEFAULT 0,
      agendamentos INT NOT NULL DEFAULT 0,
      ticket NUMERIC(10,2),
      faixa_pico VARCHAR(16),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT relatorios_diarios_uniq UNIQUE (barbershop_id, data)
    );
  `);

  // ---- 2. RLS (dono/equipe pela loja; super-admin vê tudo) ----
  const sid = `NULLIF(BTRIM(current_setting('app.barbershop_id', true)), '')`;
  await knex.raw(`ALTER TABLE relatorios_diarios ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`DROP POLICY IF EXISTS relatorios_diarios_tenant ON relatorios_diarios;`);
  await knex.raw(`CREATE POLICY relatorios_diarios_tenant ON relatorios_diarios
    USING (barbershop_id = ${sid}::uuid) WITH CHECK (barbershop_id = ${sid}::uuid);`);
  await knex.raw(`DROP POLICY IF EXISTS relatorios_diarios_sa_all ON relatorios_diarios;`);
  await knex.raw(`CREATE POLICY relatorios_diarios_sa_all ON relatorios_diarios
    TO cortecerto_admin
    USING (true) WITH CHECK (true);`);

  // ---- 3. grants ----
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON relatorios_diarios TO cortecerto_app;`);
  await knex.raw(`GRANT SELECT ON relatorios_diarios TO cortecerto_readonly;`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON relatorios_diarios TO cortecerto_admin;`);

  // ---- 4. limites e features dos planos ----
  await knex.raw(`UPDATE plans SET max_professionals = CASE name
    WHEN 'Autonomo'  THEN 1
    WHEN 'Salao'     THEN 5
    WHEN 'Salao Pro' THEN NULL
    ELSE max_professionals END
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro');`);

  await knex.raw(`UPDATE plans SET features = CASE name
    WHEN 'Autonomo' THEN ARRAY[
      '1 profissional',
      'Link de agendamento',
      'Relatório diário (00:00)',
      'Relatório semanal de resultado'
    ]
    WHEN 'Salao' THEN ARRAY[
      'Até 5 profissionais',
      'Multi-funcionário',
      'Resumo financeiro',
      'Relatório diário (00:00)',
      'Relatório semanal',
      'Relatório mensal',
      'Gráfico do dia com mais lucro'
    ]
    WHEN 'Salao Pro' THEN ARRAY[
      'Tudo do Salão',
      'Profissionais ilimitados',
      'Relatório diário (00:00)',
      'Relatório semanal',
      'Relatório mensal',
      'Relatório detalhado por cliente',
      'Horários de pico',
      'Exportar CSV'
    ]
    ELSE features END
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro');`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP POLICY IF EXISTS relatorios_diarios_sa_all ON relatorios_diarios;`);
  await knex.raw(`DROP POLICY IF EXISTS relatorios_diarios_tenant ON relatorios_diarios;`);
  await knex.raw(`DROP TABLE IF EXISTS relatorios_diarios;`);
  await knex.raw(`UPDATE plans SET max_professionals = CASE name
    WHEN 'Autonomo'  THEN 1
    WHEN 'Salao'     THEN 10
    WHEN 'Salao Pro' THEN NULL
    ELSE max_professionals END
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro');`);
};