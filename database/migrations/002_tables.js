'use strict';
/* ============================================================
   Corte Certo – 002_tables.js
   Cria as 22 tabelas do domínio.
   Dados sensíveis (users.email/phone) são criptografados em
   repouso na aplicação (AES-256-GCM). Para manter unicidade e
   permitir lookup sem quebrar a criptografia, armazenamos também
   um SHA-256 do valor em *_hash com índice UNIQUE.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role usr_role NOT NULL DEFAULT 'cliente',
    name VARCHAR(150) NOT NULL,
    email TEXT,
    email_hash TEXT,
    phone TEXT,
    phone_hash TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    prefs JSONB NOT NULL DEFAULT '{"notif_email":"sim","notif_sms":"não","lembrete":"30"}'::jsonb,
    consentimentos JSONB[] NOT NULL DEFAULT ARRAY[]::jsonb[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_hash_unique UNIQUE (email_hash),
    CONSTRAINT users_phone_hash_unique UNIQUE (phone_hash)
  );`);

  await knex.raw(`CREATE TABLE barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    phone VARCHAR(20),
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    instagram VARCHAR(100),
    address VARCHAR(300),
    city VARCHAR(100),
    uf CHAR(2),
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    logo_url TEXT,
    cover_url TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    rating_base DECIMAL(2,1) NOT NULL DEFAULT 0,
    rating_count_base INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    duration_min INT NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 5 AND 480),
    price DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    color VARCHAR(7),
    bio TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE professional_services (
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    price_override DECIMAL(10,2),
    PRIMARY KEY (professional_id, service_id)
  );`);

  await knex.raw(`CREATE TABLE working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    lunch_start TIME,
    lunch_end TIME,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT working_hours_uniq UNIQUE (barbershop_id, professional_id, day_of_week)
  );`);

  await knex.raw(`CREATE TABLE schedule_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE,
    "type" exc_tipo NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT
  );`);

  await knex.raw(`CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    notes TEXT,
    total_visits INT NOT NULL DEFAULT 0,
    total_spent DECIMAL(10,2) NOT NULL DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT clients_barbershop_phone_unique UNIQUE (barbershop_id, phone)
  );`);

  await knex.raw(`CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_per_employee DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_professionals INT,
    features TEXT[] NOT NULL DEFAULT '{}'::text[],
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status sub_status NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
    amount_cents INT NOT NULL,
    status pay_status NOT NULL DEFAULT 'pending',
    provider VARCHAR(50) NOT NULL DEFAULT 'demo',
    abacate_id VARCHAR(100),
    br_code TEXT,
    qr_base64 TEXT,
    dev_mode BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ
  );`);

  await knex.raw(`CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    client_name VARCHAR(150),
    client_phone VARCHAR(20),
    client_email VARCHAR(255),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status ag_status NOT NULL DEFAULT 'pendente',
    origin ag_origin NOT NULL DEFAULT 'online',
    price_total DECIMAL(10,2),
    cancellation_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE appointment_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    name_snapshot VARCHAR(100),
    price_snapshot DECIMAL(10,2),
    duration_snapshot INT
  );`);

  await knex.raw(`CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE sms_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ident VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    next_allowed_at TIMESTAMPTZ,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE magic_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    "type" VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_barbershop_user_unique UNIQUE (barbershop_id, user_id)
  );`);

  await knex.raw(`CREATE TABLE gallery_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    caption VARCHAR(200),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salao_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status tik_status NOT NULL DEFAULT 'aberto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    acao VARCHAR(100) NOT NULL,
    extra JSONB,
    ip_address INET,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);

  await knex.raw(`CREATE TABLE superadmin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );`);
};

exports.down = async function (knex) {
  const tabelas = [
    'superadmin_sessions', 'audit_log', 'tickets', 'gallery_images', 'reviews',
    'notifications', 'magic_tokens', 'sms_codes', 'sessions', 'appointment_services',
    'appointments', 'payments', 'subscriptions', 'plans', 'clients',
    'schedule_exceptions', 'working_hours', 'professional_services', 'professionals',
    'services', 'barbershops', 'users'
  ];
  for (const t of tabelas) {
    await knex.raw(`DROP TABLE IF EXISTS ${t} CASCADE;`);
  }
};
