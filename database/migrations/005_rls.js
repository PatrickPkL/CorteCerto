'use strict';
/* ============================================================
   Corte Certo ÔÇô 005_rls.js
   Roles, grants e Row Level Security (multi-tenant).

   Modelo:
   - cortecerto_app   : role da aplica├º├úo em runtime, SEM bypass.
     As queries do dono/equipe rodam com `app.barbershop_id` setado
     (e `app.user_id`) e o RLS restringe ├ás linhas da pr├│pria loja.
   - cortecerto_admin : role de super-admin, COM BYPASSRLS. Usada
     (via SET ROLE controlado) para cat├ílogo p├║blico, busca, login
     por identidade e painel super-admin.
   - cortecerto_readonly: somente leitura.
   ============================================================ */

exports.up = async function (knex) {
  /* Senhas das roles via ambiente ÔÇö evita credenciais reais no c├│digo-fonte.
     Configure CC_APP_DB_PASSWORD, CC_READONLY_DB_PASSWORD e CC_ADMIN_DB_PASSWORD
     no seu .env para a instala├º├úo local (ver .env.example). */
  function senhaRole(v) { return process.env[v] || 'cc_DEMO_altere_esta_senha'; }

  // Roles idempotentes
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortecerto_app') THEN
        CREATE ROLE cortecerto_app LOGIN PASSWORD '${senhaRole('CC_APP_DB_PASSWORD')}';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortecerto_readonly') THEN
        CREATE ROLE cortecerto_readonly LOGIN PASSWORD '${senhaRole('CC_READONLY_DB_PASSWORD')}';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortecerto_admin') THEN
        CREATE ROLE cortecerto_admin LOGIN PASSWORD '${senhaRole('CC_ADMIN_DB_PASSWORD')}';
      END IF;
    END $$;`);

  // Super-admin ignora RLS ÔÇö somente quando o executor ├® superuser
  // (ex.: Postgres local). Em hosts gerenciados (Render/Neon/etc.) o
  // executor n├úo ├® superuser; a├¡ o bypass ├® garantido pelas policies
  // "<tabela>_sa_*" criadas ao final desta migra├º├úo.
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
        EXECUTE 'ALTER ROLE cortecerto_admin BYPASSRLS';
      END IF;
    END $$;`);

  // Permite que a aplica├º├úo assuma o papel admin em transa├º├Áes controladas.
  // WITHOUT INHERIT: o app continua podendo fazer SET ROLE cortecerto_admin
  // (sempre parte do papel), mas N├âO herda pol├¡ticas/permiss├Áes do admin nas
  // queries normais ÔÇö isso preserva o isolamento por loja (RLS) enquanto o
  // admin enxerga tudo via policies "_sa_all".
  await knex.raw(`GRANT cortecerto_admin TO cortecerto_app WITH INHERIT FALSE;`);

  // Grants de schema
  await knex.raw(`GRANT USAGE ON SCHEMA public TO cortecerto_app, cortecerto_readonly;`);
  await knex.raw(`GRANT USAGE ON SCHEMA public TO cortecerto_admin;`);

  // Aplica├º├úo
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cortecerto_app;`);
  await knex.raw(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cortecerto_app;`);
  await knex.raw(`GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO cortecerto_app;`);

  // Read-only
  await knex.raw(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO cortecerto_readonly;`);

  // Admin
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cortecerto_admin;`);
  await knex.raw(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cortecerto_admin;`);

  // ================= pol├¡ticas RLS =================
  const sid = `NULLIF(BTRIM(current_setting('app.barbershop_id', true)), '')`;
  const uid = `NULLIF(BTRIM(current_setting('app.user_id', true)), '')`;
  const bId = `${sid}::uuid`;
  const uId = `${uid}::uuid`;

  // --- barbershops: dono/equipe enxerga a pr├│pria ---
  await knex.raw(`ALTER TABLE barbershops ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`DROP POLICY IF EXISTS barbershops_owner ON barbershops;`);
  await knex.raw(`CREATE POLICY barbershops_owner ON barbershops
    USING (id = ${bId})
    WITH CHECK (id = ${bId});`);

  // --- services ---
  await knex.raw(`ALTER TABLE services ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY services_tenant ON services
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- professionals ---
  await knex.raw(`ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY professionals_tenant ON professionals
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- working_hours ---
  await knex.raw(`ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY working_hours_tenant ON working_hours
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- schedule_exceptions ---
  await knex.raw(`ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY schedule_exceptions_tenant ON schedule_exceptions
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- clients ---
  await knex.raw(`ALTER TABLE clients ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY clients_tenant ON clients
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- subscriptions ---
  await knex.raw(`ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY subscriptions_tenant ON subscriptions
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- payments ---
  await knex.raw(`ALTER TABLE payments ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY payments_tenant ON payments
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- appointments: dono/equipe pela loja; cliente pelos pr├│prios ---
  await knex.raw(`ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY appointments_tenant ON appointments
    USING (barbershop_id = ${bId} OR user_id = ${uId})
    WITH CHECK (barbershop_id = ${bId});`);

  // --- notifications ---
  await knex.raw(`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY notifications_tenant ON notifications
    USING (barbershop_id = ${bId} OR user_id = ${uId})
    WITH CHECK (barbershop_id = ${bId} OR user_id = ${uId});`);

  // --- reviews ---
  await knex.raw(`ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY reviews_tenant ON reviews
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- gallery_images ---
  await knex.raw(`ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY gallery_images_tenant ON gallery_images
    USING (barbershop_id = ${bId}) WITH CHECK (barbershop_id = ${bId});`);

  // --- tickets ---
  await knex.raw(`ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY tickets_tenant ON tickets
    USING (salao_id = ${bId} OR user_id = ${uId})
    WITH CHECK (salao_id = ${bId} OR user_id = ${uId});`);

  // --- users: s├│ os pr├│prios dados (superadmin via bypass) ---
  await knex.raw(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY users_self ON users
    USING (id = ${uId}) WITH CHECK (id = ${uId});`);

  // --- audit_log: usu├írio v├¬ o pr├│prio rastro ---
  await knex.raw(`ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`CREATE POLICY audit_log_self ON audit_log
    USING (user_id = ${uId});`);

  // ===== Policies do super-admin (vis├úo total) =====
  // Garantem acesso global ao cortecerto_admin mesmo quando BYPASSRLS
  // n├úo pode ser concedido (executor sem privil├®gio de superuser).
  const tabelasSa = [
    'barbershops', 'services', 'professionals', 'working_hours',
    'schedule_exceptions', 'clients', 'subscriptions', 'payments',
    'appointments', 'notifications', 'reviews', 'gallery_images',
    'tickets', 'users', 'audit_log'
  ];
  for (const t of tabelasSa) {
    await knex.raw(`DROP POLICY IF EXISTS ${t}_sa_all ON ${t};`);
    await knex.raw(`CREATE POLICY ${t}_sa_all ON ${t}
      TO cortecerto_admin
      USING (true) WITH CHECK (true);`);
  }
};

exports.down = async function (knex) {
  const tabelas = [
    'audit_log', 'users', 'tickets', 'gallery_images', 'reviews',
    'notifications', 'appointments', 'payments', 'subscriptions', 'clients',
    'schedule_exceptions', 'working_hours', 'professionals', 'services', 'barbershops'
  ];
  const tabelasSa = [
    'barbershops', 'services', 'professionals', 'working_hours',
    'schedule_exceptions', 'clients', 'subscriptions', 'payments',
    'appointments', 'notifications', 'reviews', 'gallery_images',
    'tickets', 'users', 'audit_log'
  ];
  for (const t of tabelasSa) {
    await knex.raw(`DROP POLICY IF EXISTS ${t}_sa_all ON ${t};`);
  }
  for (const t of tabelas) {
    await knex.raw(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
  }
  await knex.raw(`REVOKE cortecerto_admin FROM cortecerto_app;`);
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
        EXECUTE 'ALTER ROLE cortecerto_admin NOBYPASSRLS';
      END IF;
    END $$;`);
  await knex.raw(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM cortecerto_app;`);
  await knex.raw(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM cortecerto_app, cortecerto_readonly, cortecerto_admin;`);
  await knex.raw(`REVOKE USAGE ON SCHEMA public FROM cortecerto_app, cortecerto_readonly;`);
};
