'use strict';
/* Teste rápido de conexão com o Supabase.
   Uso:  node scripts/testar-supabase.js <tabela>
   Lê SUPABASE_URL e SUPABASE_API_KEY do .env. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error('[supabase] Configure SUPABASE_URL e SUPABASE_API_KEY no .env antes.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

const tabela = process.argv[2] || 'sua_tabela';

supabase
  .from(tabela)
  .select('*')
  .limit(1)
  .then(({ data, error }) => {
    if (error) {
      console.error('Erro de conexão:', error.message || error);
      process.exit(1);
    }
    console.log('Conectado ao Supabase. Amostra de "' + tabela + '":', data);
    process.exit(0);
  });