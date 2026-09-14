/* RF-070: remoção do plano gratuito. Sem camada Free, toda loja
   precisa de um plano pago (trial ou período ativo). Lojas que ainda
   estavam no plano Free ficam sem assinatura — o painel continua
   legível, mas funcionalidades pagas (relatórios, profissionais,
   escritas) exigem assinar. Confirmação de pagamento / ativarTrial /
   trocarPlano recriam a assinatura automaticamente. */

exports.up = async (knex) => {
  await knex.raw(`
    DELETE FROM subscriptions
    WHERE plan_id = (SELECT id FROM plans WHERE is_free = TRUE LIMIT 1)
  `);
  await knex.raw(`DELETE FROM plans WHERE is_free = TRUE`);
};

exports.down = async (knex) => {
  await knex.raw(`
    INSERT INTO plans (id, name, price_monthly, price_per_employee,
      max_professionals, features, permissions, is_free, active, nivel_relatorio)
    VALUES ('00000000-0000-4000-8000-000000000004', 'Free', 0, 0, 0,
      '{}'::text[], '{}'::text[], TRUE, TRUE, NULL)
  `);
};