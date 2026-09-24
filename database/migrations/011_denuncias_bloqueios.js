'use strict';
/* ============================================================
   Corte Comigo – 011_denuncias_bloqueios.js
   Denúncia de perfil (barbeiro/salão/cliente) e bloqueio de
   cliente por parte do barbeiro/salão.

   - reports         : registra denúncias de perfis (RF de
                       moderação). Alvo pode ser um salão
                       (target_barbershop_id), um barbeiro
                       (target_user_id) ou um cliente
                       (target_client_id + target_user_id).
   - blocked_clients : barbeiro/salão impede que um determinado
                       cliente agende com ele (bloqueio).
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`CREATE TYPE report_status AS ENUM ('pendente', 'investigando', 'resolvido', 'rejeitado');`);
  await knex.raw(`CREATE TYPE report_target AS ENUM ('salao', 'barbeiro', 'cliente');`);

  await knex.raw(`CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_role VARCHAR(20),
    reporter_name VARCHAR(150),
    target_type report_target NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
    target_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    target_display VARCHAR(200),
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status report_status NOT NULL DEFAULT 'pendente',
    status_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE blocked_clients (
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (barbershop_id, client_id)
  );`);

  await knex.raw(`CREATE INDEX idx_reports_status ON reports(status);`);
  await knex.raw(`CREATE INDEX idx_reports_created ON reports(created_at);`);
  await knex.raw(`CREATE INDEX idx_blocked_clients_shop ON blocked_clients(barbershop_id);`);
};

exports.down = async function (knex) {
  await knex.raw(`DROP TABLE IF EXISTS blocked_clients CASCADE;`);
  await knex.raw(`DROP TABLE IF EXISTS reports CASCADE;`);
  await knex.raw(`DROP TYPE IF EXISTS report_target;`);
  await knex.raw(`DROP TYPE IF EXISTS report_status;`);
};
