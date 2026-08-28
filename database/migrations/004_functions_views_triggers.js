'use strict';
/* ============================================================
   Corte Certo – 004_functions_views_triggers.js
   Funções SQL, triggers de updated_at e views.
   ============================================================ */

exports.up = async function (knex) {
  const tabUpdated = [
    'users', 'barbershops', 'services', 'professionals', 'clients',
    'subscriptions', 'appointments', 'tickets'
  ];

  // Função genérica de updated_at
  await knex.raw(`
    CREATE OR REPLACE FUNCTION atualizar_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;`);

  for (const t of tabUpdated) {
    await knex.raw(`
      DROP TRIGGER IF EXISTS trg_${t}_updated_at ON ${t};
      CREATE TRIGGER trg_${t}_updated_at
        BEFORE UPDATE ON ${t}
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();`);
  }

  // 1) Conflito de agendamento
  await knex.raw(`
    CREATE OR REPLACE FUNCTION verificar_conflito_agendamento(
      p_professional_id UUID,
      p_starts_at TIMESTAMPTZ,
      p_ends_at TIMESTAMPTZ
    ) RETURNS BOOLEAN AS $$
    DECLARE conflito BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.professional_id = p_professional_id
          AND a.status IN ('pendente', 'confirmado', 'concluido')
          AND a.starts_at < p_ends_at
          AND a.ends_at > p_starts_at
      ) INTO conflito;
      RETURN conflito;
    END;
    $$ LANGUAGE plpgsql;`);

  // 2) Rating da loja (reviews + base)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION calcular_rating_loja(p_barbershop_id UUID)
    RETURNS TABLE (media NUMERIC, count BIGINT) AS $$
    DECLARE b RECORD;
    BEGIN
      SELECT rating_base, rating_count_base INTO b
      FROM barbershops WHERE id = p_barbershop_id;

      RETURN QUERY
      SELECT
        CASE
          WHEN (b.rating_count_base + COUNT(r.id)) = 0 THEN 0
          ELSE ROUND(((b.rating_base * b.rating_count_base) + COALESCE(SUM(r.rating), 0)) /
                     (b.rating_count_base + COUNT(r.id))::numeric, 1)
        END AS media,
        (b.rating_count_base + COUNT(r.id))::bigint AS count
      FROM reviews r
      WHERE r.barbershop_id = p_barbershop_id
      GROUP BY b.rating_base, b.rating_count_base;
    END;
    $$ LANGUAGE plpgsql;`);

  // 3) Assinatura ativa (trial vigente ou período pago)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION verificar_assinatura_ativa(p_barbershop_id UUID)
    RETURNS BOOLEAN AS $$
    DECLARE ativa BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.barbershop_id = p_barbershop_id
          AND s.status IN ('trial', 'ativa')
          AND (
            (s.status = 'trial' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW()))
            OR
            (s.status = 'ativa' AND (s.current_period_end IS NULL OR s.current_period_end > NOW()))
          )
      ) INTO ativa;
      RETURN ativa;
    END;
    $$ LANGUAGE plpgsql;`);

  // 4) Purge de dados expirados
  await knex.raw(`
    CREATE OR REPLACE FUNCTION purge_sessoes_expiradas()
    RETURNS INT AS $$
    DECLARE total INT := 0;
            n INT;
    BEGIN
      DELETE FROM sessions WHERE expires_at <= NOW();
      GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      DELETE FROM sms_codes WHERE used OR expires_at <= NOW();
      GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      DELETE FROM magic_tokens WHERE used OR expires_at <= NOW();
      GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      DELETE FROM superadmin_sessions WHERE expires_at <= NOW();
      GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      RETURN total;
    END;
    $$ LANGUAGE plpgsql;`);

  // ================= views =================

  await knex.raw(`
    CREATE OR REPLACE VIEW vw_barbershops_publicas AS
    SELECT
      b.id, b.name, b.slug, b.description, b.phone, b.whatsapp, b.email,
      b.instagram, b.address, b.city, b.uf, b.lat, b.lng, b.logo_url,
      b.cover_url, b.tags, b.created_at,
      r.media AS rating_avg, r.count AS rating_count
    FROM barbershops b
    LEFT JOIN LATERAL calcular_rating_loja(b.id) r ON true;`);

  await knex.raw(`
    CREATE OR REPLACE VIEW vw_dashboard_dono AS
    SELECT
      b.id AS barbershop_id, b.name AS barbershop_name,
      (SELECT COUNT(*) FROM appointments a WHERE a.barbershop_id = b.id
         AND a.created_at::date = CURRENT_DATE) AS agendamentos_hoje,
      (SELECT COUNT(*) FROM appointments a WHERE a.barbershop_id = b.id
         AND a.status = 'pendente') AS pendentes,
      (SELECT COUNT(*) FROM appointments a WHERE a.barbershop_id = b.id
         AND a.starts_at::date = CURRENT_DATE AND a.status IN ('pendente','confirmado')) AS agendados_hoje,
      (SELECT COALESCE(SUM(a.price_total), 0) FROM appointments a
         WHERE a.barbershop_id = b.id AND a.status = 'concluido') AS receita_total,
      (SELECT COUNT(*) FROM appointments a
         WHERE a.barbershop_id = b.id AND a.status = 'concluido') AS concluidos,
      (SELECT COUNT(*) FROM clients c WHERE c.barbershop_id = b.id) AS total_clientes
    FROM barbershops b;`);

  await knex.raw(`
    CREATE OR REPLACE VIEW vw_cliente_historico AS
    SELECT
      a.user_id, a.client_id, a.barbershop_id,
      a.id AS appointment_id, a.starts_at, a.ends_at, a.status, a.origin,
      a.price_total, a.client_name,
      b.name AS barbershop_name
    FROM appointments a
    LEFT JOIN barbershops b ON b.id = a.barbershop_id;`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP VIEW IF EXISTS vw_cliente_historico;`);
  await knex.raw(`DROP VIEW IF EXISTS vw_dashboard_dono;`);
  await knex.raw(`DROP VIEW IF EXISTS vw_barbershops_publicas;`);
  await knex.raw(`DROP FUNCTION IF EXISTS purge_sessoes_expiradas();`);
  await knex.raw(`DROP FUNCTION IF EXISTS verificar_assinatura_ativa(UUID);`);
  await knex.raw(`DROP FUNCTION IF EXISTS calcular_rating_loja(UUID);`);
  await knex.raw(`DROP FUNCTION IF EXISTS verificar_conflito_agendamento(UUID, TIMESTAMPTZ, TIMESTAMPTZ);`);
  const tabUpdated = [
    'users', 'barbershops', 'services', 'professionals', 'clients',
    'subscriptions', 'appointments', 'tickets'
  ];
  for (const t of tabUpdated) {
    await knex.raw(`DROP TRIGGER IF EXISTS trg_${t}_updated_at ON ${t};`);
  }
  await knex.raw(`DROP FUNCTION IF EXISTS atualizar_updated_at();`);
};
