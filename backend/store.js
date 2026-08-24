'use strict';
/* ============================================================
   Corte Certo – store.js ("banco")
   Persistência da aplicação em arquivo JSON (database/db.json).
   Implementa o contrato de localStorage exigido por
   db.js / auth.js / api.js quando rodam no Node.

   Apenas a chave cc_db (o banco em si) é gravada em disco;
   chaves de sessão (token/user/barbershop) vivem só em memória.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ARQUIVO = process.env.CC_DB_FILE ||
  path.join(__dirname, '..', 'database', 'db.json');
const CHAVE_PRINCIPAL = 'cc_db';
const PERSISTIDAS = /^cc_/;

const memoria = new Map();
let carregado = false;

function carregar() {
  if (carregado) return;
  carregado = true;
  try {
    /* mantém o texto cru: localStorage devolve STRINGS e quem
       interpreta é o db.js (JSON.parse) — igual ao navegador */
    memoria.set(CHAVE_PRINCIPAL, fs.readFileSync(ARQUIVO, 'utf8'));
  } catch (e) {
    /* primeiro boot: arquivo ainda não existe — db.js cria o seed */
  }
}

function persistir() {
  const valor = memoria.get(CHAVE_PRINCIPAL);
  if (valor === undefined) return;
  /* pelo contrato de localStorage o valor já É uma string JSON;
     serializar de novo gerava arquivo com encoding duplo e o
     banco recriava o seed a cada reinício */
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2));
}

module.exports = {
  getItem(chave) {
    carregar();
    const v = memoria.get(String(chave));
    return v === undefined ? null : v;
  },
  setItem(chave, valor) {
    carregar();
    memoria.set(String(chave), String(valor));
    if (PERSISTIDAS.test(chave)) persistir();
  },
  removeItem(chave) {
    carregar();
    memoria.delete(String(chave));
    if (PERSISTIDAS.test(chave)) persistir();
  },
  clear() {
    carregar();
    memoria.clear();
    persistir();
  }
};
