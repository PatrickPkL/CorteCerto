'use strict';
/* ============================================================
   Corte Certo – knexfile.js
   Configuração do Knex (query builder + migrações + seeds).

   - Migrações/seed rodam com o usuário superuser (postgres) para
     poder criar extensões, tipos, funções e RLS com segurança.
   - A aplicação em runtime usa `cortecerto_app` via DATABASE_URL.
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MIGRATION_URL =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:SUA_SENHA@127.0.0.1:5432/cortecerto';

const SSL = /(ssl=true|sslmode=(require|prefer|verify-ca|verify-full))/i.test(MIGRATION_URL)
  ? { rejectUnauthorized: false }
  : undefined;

const base = {
  client: 'pg',
  connection: SSL ? { connectionString: MIGRATION_URL, ssl: SSL } : MIGRATION_URL,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.join(__dirname, 'database', 'migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.join(__dirname, 'database', 'seeds')
  }
};

module.exports = {
  development: Object.assign({}, base),
  production: Object.assign({}, base),
  test: Object.assign({}, base)
};
