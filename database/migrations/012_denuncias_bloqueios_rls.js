'use strict';
/* ============================================================
   Corte Certo – 012_denuncias_bloqueios_rls.js
   RLS + grants para as tabelas reports e blocked_clients.

   - reports: o denunciante cria a linha (inserção com
     reporter_user_id = app.user_id); cada usuário enxerga apenas
     as próprias denúncias. O super-admin enxerga tudo.
   - blocked_clients: a loja (barbeiro/dono) gerencia os seus
     bloqueios; escopo por barbershop_id.
   ============================================================ */

exports.up = async function (knex) {
  const sid = `NULLIF(BTRIM(current_setting('app.barbershop_id', true)), '')`;
  const uid = `NULLIF(BTRIM(current_setting('app.user_id', true)), '')`;
  const bId = `${sid}::uuid`;
  const uId = `${uid}::uuid`;

  // ---- reports: cada usuário vê/cria apenas as próprias ----
  await knex.raw(`ALTER TABLE reports ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`DROP POLICY IF EXISTS reports_self ON reports;`);
  await knex.raw(`CREATE POLICY reports_self ON reports
    USING (reporter_user_id = ${uId})
    WITH CHECK (reporter_user_id = ${uId} OR reporter_user_id IS NULL);`);

  // ---- blocked_clients: escopo por loja ----
  await knex.raw(`ALTER TABLE blocked_clients ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`DROP POLICY IF EXISTS blocked_clients_tenant ON blocked_clients;`);
  await knex.raw(`CREATE POLICY blocked_clients_tenant ON blocked_clients
    USING (barbershop_id = ${bId})
    WITH CHECK (barbershop_id = ${bId});`);

  // ---- super-admin: visão total ----
  for (const t of ['reports', 'blocked_clients']) {
    await knex.raw(`DROP POLICY IF EXISTS ${t}_sa_all ON ${t};`);
    await knex.raw(`CREATE POLICY ${t}_sa_all ON ${t}
      TO cortecerto_admin
      USING (true) WITH CHECK (true);`);
  }

  // ---- grants (tabelas criadas após 005, que usava ALL TABLES) ----
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON reports, blocked_clients TO cortecerto_app;`);
  await knex.raw(`GRANT SELECT ON reports, blocked_clients TO cortecerto_readonly;`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON reports, blocked_clients TO cortecerto_admin;`);
};

exports.down = async function (knex) {
  for (const t of ['reports', 'blocked_clients']) {
    await knex.raw(`DROP POLICY IF EXISTS ${t}_sa_all ON ${t};`);
    await knex.raw(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
  }
};
