'use strict';
/* ============================================================
   Corte Certo – 009_precos_planos_limpeza.js
   RF-032 (preços v2) + limpeza de dados de demonstração:

   1. Preços mensais dos planos:
      Autônomo = 9,90 | Salão = 19,90 | Salão Pro = 26,90
      (anual é calculado no backend como 12× mensal; sem desconto)
   2. Remove as 6 barbearias de demonstração (owner_user_id IS NULL),
      com limpeza explícita dos filhos antes do delete pai, pois alguns
      bancos antigos não possuem FK com CASCADE em todas as tabelas.

   Idempotente: rodar de novo não duplica trabalho nem quebra nada.
   ============================================================ */

exports.up = async function (knex) {
  await knex.raw(`
    UPDATE plans SET price_monthly = CASE name
      WHEN 'Autonomo'  THEN 9.90
      WHEN 'Salao'     THEN 19.90
      WHEN 'Salao Pro' THEN 26.90
      ELSE price_monthly
    END, is_free = (name = 'Free');
  `);

  await knex.raw(`
    CREATE TEMP TABLE _fake_shops ON COMMIT DROP AS
      SELECT id FROM barbershops WHERE owner_user_id IS NULL;
  `);

  if ((await knex('_fake_shops').count('* as n')).map(x => x.n)[0] > 0) {
    await knex.raw(`DELETE FROM appointment_services WHERE appointment_id IN
      (SELECT id FROM appointments WHERE barbershop_id IN (SELECT id FROM _fake_shops))`);
    const limpeza = [
      `DELETE FROM appointments        WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM reviews             WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM gallery_images      WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM notifications       WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM tickets             WHERE salao_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM payments            WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM subscriptions       WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM schedule_exceptions WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM working_hours       WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM professionals       WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM services            WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM clients             WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM bot_chats   WHERE loja_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM bot_history WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM bot_config  WHERE barbershop_id IN (SELECT id FROM _fake_shops)`,
      `DELETE FROM barbershops WHERE id IN (SELECT id FROM _fake_shops)`
    ];
    for (const sql of limpeza) {
      await knex.raw(sql);
    }
  }
};

exports.down = async function (knex) {
  /* irreversível por natureza (dados removidos). Nada a fazer. */
};