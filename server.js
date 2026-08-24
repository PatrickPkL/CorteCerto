'use strict';
/* ============================================================
   Corte Certo – server.js
   Servidor de desenvolvimento, sem dependências externas.

   POST /api/rpc  → dispatch direto para as funções do backend
   GET  /*        → arquivos estáticos de frontend/

   O token de sessão viaja no header "x-cc-token".
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { API, Auth } = require('./backend/boot');

const PORTA = Number(process.env.PORT || 3000);
const RAIZ = path.join(__dirname, 'frontend');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

function json(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
    'Cache-Control': 'no-store'
  });
  res.end(corpo);
}

/* ---------------- RPC ---------------- */

function handleRpc(req, res) {
  let corpo = '';
  req.on('data', c => {
    corpo += c;
    if (corpo.length > 2e6) req.destroy();
  });
  req.on('end', () => {
    let metodo;
    let args;
    try {
      ({ method: metodo, args } = JSON.parse(corpo || '{}'));
    } catch (e) {
      return json(res, 400, { ok: false, error: 'JSON inválido.' });
    }
    if (!metodo) {
      return json(res, 400, { ok: false, error: 'Informe o método.' });
    }
    // métodos de sessão vivem em Auth; o resto, em API
    const fn = typeof API[metodo] === 'function' ? API[metodo]
      : (typeof Auth[metodo] === 'function' ? Auth[metodo] : null);
    if (!fn) {
      return json(res, 404, { ok: false, error: 'Método desconhecido: ' + metodo });
    }

    global.__CC_REQUEST_TOKEN = req.headers['x-cc-token'] || null;
    global.__CC_HTTP = true;
    try {
      const dados = fn.apply(null, Array.isArray(args) ? args : []);
      /* função assíncrona: resolve a resposta fora daqui — sem isso,
         uma Promise rejeitada seria serializada como {} com status 200 */
      if (dados && typeof dados.then === 'function') {
        return void dados.then(
          valor => json(res, 200, { ok: true, data: valor === undefined ? null : valor }),
          e => {
            const st = (e && e.status) || 500;
            if (st >= 500) console.error('[rpc]', metodo, e);
            json(res, st, { ok: false, status: st, error: (e && e.error) || 'Erro interno.' });
          });
      }
      return json(res, 200, { ok: true, data: dados === undefined ? null : dados });
    } catch (e) {
      const status = (e && e.status) || 500;
      if (status >= 500) console.error('[rpc]', metodo, e);
      return json(res, status, { ok: false, status, error: (e && e.error) || 'Erro interno.' });
    } finally {
      delete global.__CC_REQUEST_TOKEN;
      delete global.__CC_HTTP;
    }
  });
}

/* ---------------- estáticos ---------------- */

function servirEstatico(req, res, url) {
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/') {
    res.writeHead(302, { Location: '/public/catalogo.html' });
    return res.end();
  }

  const alvo = path.normalize(path.join(RAIZ, caminho));
  if (!alvo.startsWith(RAIZ)) {
    res.writeHead(403);
    return res.end('Proibido');
  }

  let arquivo = alvo;
  try {
    if (fs.statSync(alvo).isDirectory()) arquivo = path.join(alvo, 'index.html');
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — não encontrado: ' + caminho);
  }

  fs.readFile(arquivo, (err, dados) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — não encontrado: ' + caminho);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': dados.length,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : dados);
  });
}

/* ---------------- servidor ---------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/rpc') return handleRpc(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return servirEstatico(req, res, url);
  res.writeHead(405);
  res.end('Método não permitido');
});

server.listen(PORTA, () => {
  console.log('');
  console.log('  Corte Certo rodando:');
  console.log('  Catálogo público : http://localhost:' + PORTA + '/public/catalogo.html');
  console.log('  Painel admin     : http://localhost:' + PORTA + '/admin/login.html');
  console.log('  Banco de dados   : database/db.json');
  console.log('  Códigos SMS demo aparecem no terminal e na tela de login.');
  console.log('');
});
