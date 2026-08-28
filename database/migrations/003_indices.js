'use strict';
/* ============================================================
   Corte Certo – 003_indices.js
   Índices de desempenho + full-text search (português) + tags.
   ============================================================ */

exports.up = async function (knex) {
  // Coluna gerada de full-text search para barbershops
  await knex.raw(`ALTER TABLE barbershops
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
      to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(description,''))
    ) STORED;`);

  // 1. barbershops
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_owner ON barbershops (owner_user_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_city ON barbershops (city);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_uf ON barbershops (uf);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_geo ON barbershops (lat, lng);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_tags ON barbershops USING GIN (tags);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_barbershops_fts ON barbershops USING GIN (search_tsv);`);

  // 2. services
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_services_barbershop ON services (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_services_active ON services (active);`);

  // 3. professionals
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_professionals_barbershop ON professionals (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_professionals_user ON professionals (user_id);`);

  // 4. appointments
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_appointments_barbershop ON appointments (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments (professional_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_appointments_starts ON appointments (starts_at);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);`);
  // 5. conflito de horário
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_appointments_conflict
    ON appointments (professional_id, starts_at, ends_at);`);

  // 6. clients (phone já faz parte de UNIQUE composto; índice extra em barbershop)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_clients_barbershop ON clients (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients (phone);`);

  // 7. subscriptions
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_subscriptions_barbershop ON subscriptions (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);`);

  // 8. payments
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_payments_barbershop ON payments (barbershop_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);`);

  // 9. sessions
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);`);

  // 10. sms_codes
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sms_codes_ident ON sms_codes (ident);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sms_codes_expires ON sms_codes (expires_at);`);

  // 11. notifications
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (read);`);

  // 12. reviews
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_reviews_barbershop ON reviews (barbershop_id);`);

  // 13. audit_log
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp);`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS idx_audit_timestamp;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_audit_user;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_reviews_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_notifications_read;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_notifications_user;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sms_codes_expires;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sms_codes_ident;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sessions_expires;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sessions_token;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sessions_user;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_payments_status;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_payments_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_subscriptions_status;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_subscriptions_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_clients_phone;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_clients_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_appointments_conflict;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_appointments_status;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_appointments_starts;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_appointments_professional;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_appointments_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_professionals_user;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_professionals_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_services_active;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_services_barbershop;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_fts;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_tags;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_geo;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_uf;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_city;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_barbershops_owner;`);
  await knex.raw(`ALTER TABLE barbershops DROP COLUMN IF EXISTS search_tsv;`);
};
