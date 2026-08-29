'use strict';
/* ============================================================
   Corte Certo – 006_bot.js
   Persistência do Atendente automático no PostgreSQL:

   - bot_config   : config global do bot (linha única).
   - bot_history  : histórico de mensagens processadas.
   - bot_chats    : conversas do chat do site (threads).

   PII (e-mail do remetente, contatos, forward_to) NUNCA é
   gravada em texto plano: a aplicação salva com crypt.js
   (AES-256-GCM) e mantém *_hash (SHA-256) só para busca.

   Acesso: o bot opera via `asAdmin` (cortecerto_admin, que tem
   BYPASSRLS) — padrão usado pelo resto da persistência. As
   políticas RLS abaixo isolam os dados por salão quando a role
   de aplicação rodar com contexto (defesa em profundidade).
   bot_config fica restrita ao admin (dado global de sistema).
   ============================================================ */

exports.up = async function (knex) {
  // ---- bot_config (linha única) ----
  await knex.raw(`CREATE TABLE IF NOT EXISTS bot_config (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    forward_to TEXT,
    forward_to_hash TEXT,
    assistant_name TEXT NOT NULL DEFAULT 'Equipe Corte Certo',
    barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
    seconds INT NOT NULL DEFAULT 30 CHECK (seconds BETWEEN 10 AND 3600),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  // ---- bot_history ----
  await knex.raw(`CREATE TABLE IF NOT EXISTS bot_history (
    id TEXT PRIMARY KEY,
    barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    de TEXT,
    de_hash TEXT,
    nome TEXT,
    assunto TEXT,
    texto TEXT,
    decisao VARCHAR(20),
    motivo TEXT,
    categorias JSONB NOT NULL DEFAULT '[]'::jsonb,
    motor VARCHAR(20) NOT NULL DEFAULT 'palavras-chave',
    destino TEXT,
    simulado BOOLEAN NOT NULL DEFAULT TRUE,
    erro TEXT
  );`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_bot_history_ts ON bot_history (ts DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_bot_history_hash ON bot_history (de_hash);`);

  // ---- bot_chats (threads do widget) ----
  await knex.raw(`CREATE TABLE IF NOT EXISTS bot_chats (
    thread_id TEXT PRIMARY KEY,
    loja_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'novo',
    criticidade VARCHAR(10),
    prazo INT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contato_nome TEXT,
    contato_nome_hash TEXT,
    contato_telefone TEXT,
    contato_telefone_hash TEXT,
    contato_email TEXT,
    contato_email_hash TEXT,
    localizacao JSONB,
    pagina TEXT,
    msgs JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT bot_chats_estado_check CHECK (estado IN ('novo','humano','respondido'))
  );`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_bot_chats_loja ON bot_chats (loja_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_bot_chats_atualizado ON bot_chats (atualizado_em DESC);`);

  // ---- grants ---
  // bot_config: restrita ao admin (linha global de sistema)
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON bot_config TO cortecerto_admin;`);
  // histórico e chats seguem o padrão 005 (app + readonly + admin), mas com RLS
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON bot_history, bot_chats TO cortecerto_app;`);
  await knex.raw(`GRANT SELECT ON bot_history, bot_chats TO cortecerto_readonly;`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON bot_history, bot_chats TO cortecerto_admin;`);

  // ---- RLS (tenant por salão; o bot fora disso passa via cortecerto_admin) ----
  const sid = `NULLIF(BTRIM(current_setting('app.barbershop_id', true)), '')`;

  await knex.raw(`ALTER TABLE bot_history ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`ALTER TABLE bot_chats ENABLE ROW LEVEL SECURITY;`);

  await knex.raw(`DROP POLICY IF EXISTS bot_history_salao ON bot_history;`);
  await knex.raw(`CREATE POLICY bot_history_salao ON bot_history
    FOR ALL
    USING (barbershop_id::text = ${sid})
    WITH CHECK (barbershop_id::text = ${sid});`);

  await knex.raw(`DROP POLICY IF EXISTS bot_chats_salao ON bot_chats;`);
  await knex.raw(`CREATE POLICY bot_chats_salao ON bot_chats
    FOR ALL
    USING (loja_id::text = ${sid})
    WITH CHECK (loja_id::text = ${sid});`);

  // bot_config não tem contexto por salão — mantém fora de RLS,
  // e sem grants para a role de app (só o bot/admin acessa).
};

exports.down = async function (knex) {
  await knex.raw(`DROP POLICY IF EXISTS bot_chats_salao ON bot_chats;`);
  await knex.raw(`DROP POLICY IF EXISTS bot_history_salao ON bot_history;`);
  await knex.raw(`ALTER TABLE bot_chats DISABLE ROW LEVEL SECURITY;`);
  await knex.raw(`ALTER TABLE bot_history DISABLE ROW LEVEL SECURITY;`);
  await knex.raw(`REVOKE ALL ON bot_config, bot_history, bot_chats FROM cortecerto_app, cortecerto_readonly, cortecerto_admin;`);
  await knex.raw(`DROP TABLE IF EXISTS bot_chats;`);
  await knex.raw(`DROP TABLE IF EXISTS bot_history;`);
  await knex.raw(`DROP TABLE IF EXISTS bot_config;`);
};