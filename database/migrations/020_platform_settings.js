'use strict';
/* ============================================================
   Corte Certo – 020_platform_settings.js
   Configurações globais da plataforma (chave/valor), editáveis
   pelo super-admin. Primeiro uso: "site_gratis" — quando ligado,
   TODO o site fica liberado (todas as funcionalidades/relatórios)
   sem exigir assinatura ativa, mantendo os preços cadastrados.
   Tabela global (não pertence a um salão) → sem RLS; apenas
   grants para os papéis da aplicação.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      chave VARCHAR(80) PRIMARY KEY,
      valor JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings TO cortecerto_app;`);
  await knex.raw(`GRANT SELECT ON platform_settings TO cortecerto_readonly;`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings TO cortecerto_admin;`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP TABLE IF EXISTS platform_settings;`);
};
