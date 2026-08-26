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
const crypto = require('crypto');
const { URL } = require('url');

/* Carrega o .env da raiz (KEY=VALUE por linha) antes do boot —
   sem sobrescrever variáveis já definidas no ambiente */
(function carregarDotEnv() {
  try {
    const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    conteudo.split(/\r?\n/).forEach(linha => {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    });
  } catch (e) { /* projeto sem .env — ok */ }
})();

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

/* ---------------- rate-limit ---------------- */
const _rateMap = new Map();
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 60;

/* ---------------- RPC ---------------- */

function handleRpc(req, res) {
  /* rate-limit por IP */
  const ip = req.socket.remoteAddress || '0.0.0.0';
  const now = Date.now();
  const rec = _rateMap.get(ip);
  if (rec && now < rec.reset) {
    rec.count++;
    if (rec.count > RATE_MAX) {
      const retryAfter = Math.ceil((rec.reset - now) / 1000);
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) });
      return res.end(JSON.stringify({ ok: false, error: 'Muitas requisições. Aguarde ' + retryAfter + 's.' }));
    }
  } else {
    _rateMap.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
  }

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

/* ---------------- webhook AbacatePay ---------------- */

/* Assinatura HMAC-SHA256 (base64) no header x-webhook-signature */
function assinaturaValida(corpo, recebida) {
  try {
    const pub = String(process.env.ABACATEPAY_PUBLIC_KEY || '').trim();
    if (!pub || !recebida) return false;
    const esperada = crypto.createHmac('sha256', pub)
      .update(Buffer.from(corpo, 'utf8')).digest('base64');
    const a = Buffer.from(esperada);
    const b = Buffer.from(String(recebida));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

function handleWebhookAbacate(req, res, url) {
  let corpo = '';
  req.on('data', c => {
    corpo += c;
    if (corpo.length > 2e6) req.destroy();
  });
  req.on('end', () => {
    const secretEnv = String(process.env.ABACATEPAY_WEBHOOK_SECRET || '').trim();
    if (secretEnv) {
      const secretUrl = url.searchParams.get('webhookSecret') || '';
      const a = Buffer.from(secretEnv, 'utf8');
      const b = Buffer.from(secretUrl, 'utf8');
      const urlOk = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!urlOk && !assinaturaValida(corpo, req.headers['x-webhook-signature'])) {
        return json(res, 401, { ok: false, error: 'Unauthorized' });
      }
    } else {
      return json(res, 401, { ok: false, error: 'Webhook secret não configurado no servidor.' });
    }
    let ev;
    try { ev = JSON.parse(corpo || '{}'); }
    catch (e) { return json(res, 400, { ok: false, error: 'JSON inválido.' }); }
    try {
      const r = API.processarEventoWebhook(ev);
      console.log('[webhook] ' + (ev.event || '?') + ' → ' + JSON.stringify(r));
      return json(res, 200, { ok: true, data: r });
    } catch (e) {
      console.error('[webhook]', e);
      /* 500 faz a AbacatePay retentar — o processamento é idempotente */
      return json(res, 500, { ok: false, error: 'Falha ao processar evento.' });
    }
  });
}

/* ---------------- estáticos ---------------- */

function servirEstatico(req, res, url) {
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/') {
    res.writeHead(302, { Location: '/public/telainicial.html' });
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
  if (req.method === 'POST' && url.pathname === '/webhooks/abacatepay') {
    return handleWebhookAbacate(req, res, url);
  }
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
  console.log(process.env.ABACATEPAY_API_KEY
    ? '  Pagamentos PIX   : AbacatePay (' +
      (/^abc_/.test(process.env.ABACATEPAY_API_KEY) ? 'dev mode' : 'chave configurada') + ')'
    : '  Pagamentos PIX   : MODO SIMULADO — configure ABACATEPAY_API_KEY no .env');
  console.log('');
});
