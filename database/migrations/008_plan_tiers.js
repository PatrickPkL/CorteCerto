'use strict';
/* ============================================================
   Corte Certo – 008_plan_tiers.js
   Sistema de travamento por plano (RF planos v3):

   - plans.permissions  : funcionalidades liberadas por plano
     (chaves machine-readable usadas no gate das escritas).
   - plans.is_free      : marca o plano base (Free) que o novo
     cadastro recebe, permanente e sem benefícios ativos.
   - subscriptions.trial_usado : impede repetir o trial opcional
     ("10 dias grátis") — só pode ser ativado uma vez por loja.

   Dados incluídos de forma idempotente (ON CONFLICT), para que
   bancos já existentes ganhem o plano Free e as permissões sem
   depender de re-run do seed.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}'::text[];`);
  await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;`);
  await knex.raw(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_usado BOOLEAN NOT NULL DEFAULT FALSE;`);

  // plano Free com UUID determinístico (mesma regra da seed: uuid(4))
  await knex.raw(`
    INSERT INTO plans (id, name, price_monthly, price_per_employee, max_professionals, features, permissions, is_free, active)
    VALUES ('00000000-0000-4000-8000-000000000004', 'Free', 0, 0, 0, '{}'::text[], '{}'::text[], TRUE, TRUE)
    ON CONFLICT (name) DO NOTHING;
  `);

  // permissões dos planos pagos (sem bot/chats — são super-admin agora)
  await knex.raw(`
    UPDATE plans SET permissions = CASE name
      WHEN 'Autonomo' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria']
      WHEN 'Salao' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios','notificacoes']
      WHEN 'Salao Pro' THEN ARRAY['servicos','profissionais','clientes','agendar','horarios','galeria','relatorios','notificacoes','exportar_csv']
      ELSE permissions
    END,
    is_free = (name = 'Free');
  `);

  // lojas que já usaram o trial legado não podem repetir o trial opcional
  await knex.raw(`UPDATE subscriptions SET trial_usado = TRUE WHERE status = 'trial';`);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS trial_usado;`);
  await knex.raw(`ALTER TABLE plans DROP COLUMN IF EXISTS is_free;`);
  await knex.raw(`ALTER TABLE plans DROP COLUMN IF EXISTS permissions;`);
};