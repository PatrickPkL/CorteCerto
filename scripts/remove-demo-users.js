'use strict';
/* ============================================================
   Corte Certo – scripts/remove-demo-users.js
   DELETE CIRÚRGICO das contas demo do seed (Marcos/João).

   Diferente de re-seed, apaga SOMENTE os 2 usuários determinísticos
   e mantém todo o resto (salões, serviços, agendamentos, reviews).
   As FKs são ON DELETE SET NULL / CASCADE, então as referências a
   esses usuários (owner_user_id, professionals.user_id, clients.user_id,
   reviews.user_id, notifications.user_id) são automaticamente nulas.

   Roda como admin (BYPASSRLS) para não esbarrar na RLS da role app.

   Uso:
     node scripts/remove-demo-users.js
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { knex, asAdmin } = require('../backend/pool');

const DEMO_UUIDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
];

async function main() {
  await asAdmin(async (trx) => {
    const usuariosAntes = await trx('users').select('id', 'name').whereIn('id', DEMO_UUIDS);
    const saloesAntes = await trx('barbershops').count({ n: '*' }).first();
    const usersTotais = await trx('users').count({ n: '*' }).first();

    if (!usuariosAntes.length) {
      console.log('[remove-demo-users] Nenhum usuário demo encontrado. Nada a fazer.');
      console.log('[remove-demo-users] Total de usuários: ' + usersTotais.n);
      return;
    }

    console.log('[remove-demo-users] Removendo:');
    usuariosAntes.forEach(u => console.log('  - ' + u.name + ' (' + u.id + ')'));

    const removidos = await trx('users').whereIn('id', DEMO_UUIDS).del();

    const saloesDepois = await trx('barbershops').count({ n: '*' }).first();
    const usersTotais2 = await trx('users').count({ n: '*' }).first();

    console.log('[remove-demo-users] ' + removidos + ' usuário(s) excluído(s).');
    console.log('[remove-demo-users] Salões mantidos: ' + saloesAntes.n + ' -> ' + saloesDepois.n);
    console.log('[remove-demo-users] Total de usuários agora: ' + usersTotais2.n);
  });

  await knex.destroy();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('[remove-demo-users] Falha:', e);
  try { await knex.destroy(); } catch (e2) { /* ignore */ }
  process.exit(1);
});