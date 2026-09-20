'use strict';
/* ============================================================
   Corte Certo – 024_plano_free_retomada.js
   Retoma o plano base Free (RF-070/DT-12 sem camada pagante única):

   - Reinsere o plano Free (is_free = TRUE) na vitrine de planos para
     o cliente ver o valor real RISCADO e pagar R$ 0,00.
   - Adiciona a coluna price_compare (preço de comparação exibido
     riscado no card Free / usado também na tela do super-admin).
   - Idempotente (hasColumn / INSERT ... ON CONFLICT DO NOTHING).
   ============================================================ */

exports.up = async function (knex) {
  // coluna de preço de comparação (valor "real" exibido riscado)
  const tem = await knex.schema.hasColumn('plans', 'price_compare');
  if (!tem) {
    await knex.schema.alterTable('plans', t => t.decimal('price_compare', 10, 2).nullable());
  }

  const temMaxDep = await knex.schema.hasColumn('plans', 'max_dependents');
  if (!temMaxDep) {
    await knex.schema.alterTable('plans', t => t.integer('max_dependents').nullable());
  }

  // plano Free recriado (removido pela 016) — uma única linha, guarda por id fixo
  const existe = await knex('plans').where({ is_free: true }).first();
  if (!existe) {
    await knex('plans').insert({
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Free',
      price_monthly: 0,
      price_annual: 0,
      price_per_employee: 0,
      price_compare: 19.90,
      max_professionals: 1,
      max_dependents: 1,
      features: knex.raw(`ARRAY['Catálogo público no site','Perfil próprio para clientes','Agendamento pelo site']`),
      permissions: knex.raw(`ARRAY[]::text[]`),
      is_free: true,
      active: true,
      nivel_relatorio: null,
      created_at: new Date()
    });
  }
};

exports.down = async function (knex) {
  await knex('plans').where({ name: 'Free' }).del();
  await knex.schema.alterTable('plans', t => t.dropColumn('price_compare'));
};