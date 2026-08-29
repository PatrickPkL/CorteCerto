'use strict';
/* ============================================================
   Corte Certo – boot.js
   Bootstrap do backend em Node: simula o ambiente de browser
   (window/localStorage) e carrega as camadas na ordem certa.
   Exige await DB.init() (carga do PostgreSQL) antes de servir.
   ============================================================ */

global.window = global;
global.localStorage = require('./store');

require('./db.js');        // window.DB  — persistência (fonte: PostgreSQL)
require('./auth.js');      // window.Auth — SMS + sessões por token
require('./api.js');       // window.API  — regras de negócio
require('./payments.js');  // mescla cobranças PIX na window.API

// Atendente automático de e-mail (bot.js):
// usa window.DB para montar respostas e window.Auth para o painel admin.
const Bot = require('./bot.js');

// remove helper de 'favorites' (não é tabela) do mapa de coleções
const pg_map = require('./pg_map');
pg_map.BY_COLECAO.favorites = null;

module.exports = {
  DB: global.DB,
  Auth: global.Auth,
  API: global.API,
  Bot,
  init: () => global.DB.init()
};
