'use strict';
/* ============================================================
   Corte Certo – 021_dependentes_codigo_unico.js
   Contas "Dependente/Funcionário":

   - usr_role += 'dependente'  : 3º papel (Cliente / Empresa-Beiro
     / Dependente). O dependente acessa DADOS e AGENDA da empresa
     a partir do Código Único; fica BLOQUEADO de relatórios
     financeiros/gerenciais (gate no backend via exigirDono).
   - users.password_hash       : credencial própria do funcionário
     (Login + Senha), hash scrypt gerado na aplicação (auth.js).
   - users.barbershop_id       : vínculo do dependente à loja.
   - barbershops.codigo_unico  : código alfanumérico único por
     empresa (visível no painel, com copiar/compartilhar).
   - plans.max_dependents      : cota por plano (Básico/Autonomo=1,
     Salao=5, Salao Pro=ilimitado NULL) — erro exato "Já está no
     número de dependentes desta conta" quando a cota acaba.
   ============================================================ */

const ALCARISO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

function gerarCodigo() {
  let c = '';
  for (let i = 0; i < 8; i++) {
    c += ALCARISO.charAt(Math.floor(Math.random() * ALCARISO.length));
  }
  return c;
}

exports.up = async function (knex) {
  /* ADD VALUE é idempotente aqui via guarda em pg_enum (PG12+ permite
     ADD VALUE dentro de transação; só não pode ser USADO na mesma). */
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                     WHERE t.typname = 'usr_role' AND e.enumlabel = 'dependente') THEN
        EXECUTE 'ALTER TYPE usr_role ADD VALUE ''dependente''';
      END IF;
    END $$;
  `);

  await knex.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await knex.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL;`);

  await knex.raw(`ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS codigo_unico VARCHAR(20);`);
  /* backfill: lojas existentes ganham um código único determinístico local */
  const lojas = await knex('barbershops').select('id');
  const usados = new Set();
  for (const loja of lojas) {
    let code = gerarCodigo();
    let tentativas = 0;
    while (usados.has(code) && tentativas < 30) { code = gerarCodigo(); tentativas++; }
    usados.add(code);
    await knex('barbershops').where({ id: loja.id }).update({ codigo_unico: code });
  }
  await knex.raw(`ALTER TABLE barbershops ALTER COLUMN codigo_unico SET NOT NULL;`);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS barbershops_codigo_unico_uniq
    ON barbershops (codigo_unico);
  `);

  await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_dependents INT;`);
  await knex.raw(`
    UPDATE plans SET max_dependents = CASE name
      WHEN 'Autonomo'  THEN 1
      WHEN 'Salao'     THEN 5
      WHEN 'Salao Pro' THEN NULL
      ELSE max_dependents
    END;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS barbershops_codigo_unico_uniq;`);
  await knex.raw(`ALTER TABLE barbershops DROP COLUMN IF EXISTS codigo_unico;`);
  await knex.raw(`ALTER TABLE users DROP COLUMN IF EXISTS barbershop_id;`);
  await knex.raw(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash;`);
  await knex.raw(`ALTER TABLE plans DROP COLUMN IF EXISTS max_dependents;`);
  /* remover o valor do enum só é possível após nenhum uso; dependentes
     já existentes seriam órfãos — por isso o down é manual via SQL direto */
  await knex.raw(`
    DELETE FROM users WHERE role = 'dependente';
  `);
};