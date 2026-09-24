'use strict';
/* ============================================================
   Corte Comigo – supabase.js
   Cliente Supabase para leitura/consulta externa (SaaS).
   O core da aplicação continua usando o PostgreSQL próprio via
   pool.js; este módulo é opcional e só ativa quando
   SUPABASE_URL e SUPABASE_API_KEY estiverem no .env.
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.warn('[supabase] SUPABASE_URL/SUPABASE_API_KEY ausentes no .env — cliente desativado.');
  module.exports = null;
} else {
  const { createClient } = require('@supabase/supabase-js');
  console.log('[supabase] cliente inicializado (URL: ' + SUPABASE_URL + ')');
  module.exports = createClient(SUPABASE_URL, SUPABASE_API_KEY);
}