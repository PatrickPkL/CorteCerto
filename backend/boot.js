'use strict';
/* ============================================================
   Corte Certo – boot.js
   Bootstrap do backend em Node: simula o ambiente de browser
   (window/localStorage) e carrega as camadas na ordem certa.
   ============================================================ */

global.window = global;
global.localStorage = require('./store');

require('./db.js');     // window.DB  — persistência + seed demo
require('./auth.js');   // window.Auth — SMS + sessões por token
require('./api.js');    // window.API  — regras de negócio

module.exports = { DB: global.DB, Auth: global.Auth, API: global.API };
