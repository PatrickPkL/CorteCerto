'use strict';
/* ============================================================
   Corte Certo – 017_planos_beneficios_iguais.js
   Benefícios unificados (v4):

   Todos os planos pagos passam a ter EXATAMENTE os mesmos
   benefícios (agendamento online + link exclusivo, agenda
   sincronizada em tempo real, totais financeiros diário/
   semanal/mensal, lembretes automáticos no app, relatório
   completo e exportação CSV). A ÚNICA diferença entre os
   planos passa a ser o número de profissionais:
     Autonomo  = 1
     Salao     = 5
     Salao Pro = ilimitado (NULL)

   Preços, `active` e `max_professionals` são preservados.
   ============================================================ */

const PERMISSOES_COMUNS =
  `ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios','notificacoes','exportar_csv']`;

exports.up = async function (knex) {
  await knex.raw(`
    UPDATE plans SET permissions = ${PERMISSOES_COMUNS}::text[],
      nivel_relatorio = 'completo',
      features = CASE name
        WHEN 'Autonomo' THEN ARRAY[
          'Link de agendamento exclusivo',
          'Agenda sincronizada em tempo real com o app dos clientes',
          'Relatórios financeiros: diário, semanal e mensal',
          'Relatório completo (detalhado por cliente, horários de pico)',
          'Exportar CSV',
          'Lembretes automáticos por notificação no app'
        ]
        WHEN 'Salao' THEN ARRAY[
          'Link de agendamento exclusivo',
          'Agenda sincronizada em tempo real com o app dos clientes',
          'Relatórios financeiros: diário, semanal e mensal',
          'Relatório completo (detalhado por cliente, horários de pico)',
          'Exportar CSV',
          'Lembretes automáticos por notificação no app'
        ]
        WHEN 'Salao Pro' THEN ARRAY[
          'Link de agendamento exclusivo',
          'Agenda sincronizada em tempo real com o app dos clientes',
          'Relatórios financeiros: diário, semanal e mensal',
          'Relatório completo (detalhado por cliente, horários de pico)',
          'Exportar CSV',
          'Lembretes automáticos por notificação no app'
        ]
        ELSE features
      END
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro');
  `);

  // Autonomo também ganha notificaçoes/exportar_csv explicitamente
  // (o UPDATE acima já cobre, este passo é redundância defensiva).
  await knex.raw(`
    UPDATE plans SET permissions = ${PERMISSOES_COMUNS}::text[]
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro') AND NOT (
      permissions @> ${PERMISSOES_COMUNS}::text[]
    );
  `);
};

exports.down = async function (knex) {
  // Restaura permissions/nível/features do estado anterior (v3).
  await knex.raw(`UPDATE plans SET permissions = CASE name
    WHEN 'Autonomo' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios']
    WHEN 'Salao' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios','notificacoes']
    WHEN 'Salao Pro' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios','notificacoes','exportar_csv']
    ELSE permissions END,
    nivel_relatorio = CASE name
      WHEN 'Autonomo' THEN 'basico'
      WHEN 'Salao' THEN 'intermediario'
      WHEN 'Salao Pro' THEN 'completo'
      ELSE nivel_relatorio END,
    features = CASE name
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
    WHERE name IN ('Autonomo', 'Salao', 'Salao Pro');
  `);
};