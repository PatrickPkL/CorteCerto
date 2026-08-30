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

/* Hosts gerenciados (Render/Neon) pedem SSL self-signed; o pg moderno
   trata "sslmode=require/ssl=true" como verify-full e exige cert válido.
   Parseamos a URL nós mesmos e repassamos ssl com rejectUnauthorized:false
   para não depender da versão do pg-connection-string no servidor. */
const TEM_SSL = /(ssl=true|sslmode)/i.test(MIGRATION_URL);
const CONN = TEM_SSL
  ? (function () {
      const p = new URL(MIGRATION_URL);
      return {
        host: p.hostname,
        port: Number(p.port || 5432),
        database: (p.pathname || '').replace(/^\//, ''),
        user: decodeURIComponent(p.username || ''),
        password: decodeURIComponent(p.password || ''),
        ssl: { rejectUnauthorized: false }
      };
    })()
  : MIGRATION_URL;

const base = {
  client: 'pg',
  connection: CONN,
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
