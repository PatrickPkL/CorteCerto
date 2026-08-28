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

/* ---------------- auth-brute-force ---------------- */
const _failedAuth = new Map();
const AUTH_FAIL_MAX = 5;
const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000;
const AUTH_BLOCK_MS = 15 * 60 * 1000;

/* Métodos RPC que exigem sessão válida (segunda camada de defesa) */
const _authRequired = new Set([
  'criarAgendamento', 'listarAgendamentos', 'atualizarAgendamento',
  'excluirAgendamento', 'meusAgendamentos', 'getAgendamento',
  'listarClientes', 'getCliente', 'criarCliente', 'atualizarCliente', 'agendamentosDoCliente',
  'dashboardStats', 'exportarCSV',
  'minhaLoja', 'atualizarLoja', 'excluirLoja',
  'criarServico', 'atualizarServico', 'excluirServico',
  'criarProfissional', 'atualizarProfissional', 'desativarProfissional',
  'salvarHorariosLoja', 'atualizarLinhaHorario',
  'listarExcecoes', 'criarExcecao', 'excluirExcecao',
  'minhaAssinatura', 'trocarPlano', 'cancelarAssinatura',
  'minhasNotificacoes', 'naoLidasCount', 'marcarNotificacaoLida', 'marcarTodasLidas',
  'mePerfil', 'atualizarMe', 'atualizarPreferencias', 'excluirMinhaConta',
  'exportarMeusDados', 'revogarConsentimento', 'solicitarExclusao',
  'enviarSolicitacaoLGPD', 'meusLogsDeAcesso', 'logoutTodosDispositivos',
  'alternarFavorito', 'meusFavoritos',
  'criarTicket', 'ticketsDoSalao',
  'definirLogo', 'definirCapa',
  'galeriaDaLoja', 'adicionarGaleria', 'removerGaleria',
  'servicosDaLoja', 'profissionaisDaLoja', 'horariosDaLoja',
  'gerarLembretesAmanha', 'gerarLembretesPendentes',
  'logout'
]);

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
      return json(res, 400, { ok: false, error: 'Requisição inválida.' });
    }
    // métodos de sessão vivem em Auth; o resto, em API
    const fn = typeof API[metodo] === 'function' ? API[metodo]
      : (typeof Auth[metodo] === 'function' ? Auth[metodo] : null);
    if (!fn) {
      return json(res, 400, { ok: false, error: 'Requisição inválida.' });
    }

    /* segunda camada: métodos autenticados exigem token válido */
    if (_authRequired.has(metodo)) {
      const tk = req.headers['x-cc-token'] || null;
      if (!tk) {
        return json(res, 401, { ok: false, error: 'Sessão expirada. Faça login novamente.' });
      }
      global.__CC_REQUEST_TOKEN = tk;
      global.__CC_HTTP = true;
      try {
        const u = Auth.usuarioAtual();
        if (!u) {
          return json(res, 401, { ok: false, error: 'Sessão expirada. Faça login novamente.' });
        }
      } catch (e) {
        return json(res, 401, { ok: false, error: 'Sessão expirada. Faça login novamente.' });
      } finally {
        delete global.__CC_REQUEST_TOKEN;
        delete global.__CC_HTTP;
      }
    }

    global.__CC_REQUEST_TOKEN = req.headers['x-cc-token'] || null;
    global.__CC_HTTP = true;
    const ip = req.socket.remoteAddress || '0.0.0.0';
    const ts = new Date().toISOString();
    const argsStr = JSON.stringify(Array.isArray(args) ? args : []).slice(0, 200);

    /* brute-force guard para verifyCode */
    if (metodo === 'verifyCode') {
      const rec = _failedAuth.get(ip);
      if (rec && Date.now() < rec.blockedUntil) {
        const retryAfter = Math.ceil((rec.blockedUntil - Date.now()) / 1000);
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) });
        return res.end(JSON.stringify({ ok: false, status: 429, error: 'Muitas tentativas. Aguarde ' + retryAfter + 's.' }));
      }
    }

    try {
      const dados = fn.apply(null, Array.isArray(args) ? args : []);
      /* função assíncrona: resolve a resposta fora daqui — sem isso,
         uma Promise rejeitada seria serializada como {} com status 200 */
      if (dados && typeof dados.then === 'function') {
        return void dados.then(
          valor => {
            if (metodo === 'verifyCode') _failedAuth.delete(ip);
            json(res, 200, { ok: true, data: valor === undefined ? null : valor });
          },
          e => {
            const st = (e && e.status) || 500;
            if (metodo === 'verifyCode' && st >= 400 && st < 500) {
              const prev = _failedAuth.get(ip) || { count: 0, blockedUntil: 0 };
              prev.count++;
              if (prev.count >= AUTH_FAIL_MAX) {
                prev.blockedUntil = Date.now() + AUTH_BLOCK_MS;
              }
              prev.windowStart = prev.windowStart || Date.now();
              if (Date.now() - prev.windowStart > AUTH_FAIL_WINDOW_MS) {
                prev.count = 1;
                prev.windowStart = Date.now();
                prev.blockedUntil = 0;
              }
              _failedAuth.set(ip, prev);
            }
            if (st >= 500) console.error('[rpc][ERR]', ts, 'method=' + metodo, 'ip=' + ip, 'status=' + st, 'args=' + argsStr, e);
            json(res, st, { ok: false, status: st, error: (e && e.error) || 'Erro interno.' });
          });
      }
      if (metodo === 'verifyCode') _failedAuth.delete(ip);
      return json(res, 200, { ok: true, data: dados === undefined ? null : dados });
    } catch (e) {
      const status = (e && e.status) || 500;
      if (metodo === 'verifyCode' && status >= 400 && status < 500) {
        const prev = _failedAuth.get(ip) || { count: 0, blockedUntil: 0 };
        prev.count++;
        if (prev.count >= AUTH_FAIL_MAX) {
          prev.blockedUntil = Date.now() + AUTH_BLOCK_MS;
        }
        prev.windowStart = prev.windowStart || Date.now();
        if (Date.now() - prev.windowStart > AUTH_FAIL_WINDOW_MS) {
          prev.count = 1;
          prev.windowStart = Date.now();
          prev.blockedUntil = 0;
        }
        _failedAuth.set(ip, prev);
      }
      if (status >= 500) console.error('[rpc][ERR]', ts, 'method=' + metodo, 'ip=' + ip, 'status=' + status, 'args=' + argsStr, e);
      return json(res, status, { ok: false, status, error: (e && e.error) || 'Erro interno.' });
    } finally {
      delete global.__CC_REQUEST_TOKEN;
      delete global.__CC_HTTP;
    }
  });
}

/* ---------------- super-admin routes ---------------- */

function handleSuperAdmin(req, res, pathname, url) {
  const sub = pathname.replace('/api/super-admin/', '');
  const parts = sub.split('/').filter(Boolean);
  const rota = parts[0] || '';
  const idParam = parts[1] || null;

  const authHeader = req.headers['authorization'] || req.headers['x-super-admin-token'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  function readBody() {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); }
        catch (e) { reject(new Error('JSON inválido.')); }
      });
    });
  }

  function needAuth() {
    if (!token) { json(res, 401, { ok: false, error: 'Token ausente.' }); return false; }
    try { API.superAdminAuth(token); }
    catch (e) { json(res, 401, { ok: false, error: (e && e.error) || 'Não autorizado.' }); return false; }
    return true;
  }

  /* POST /api/super-admin/login — sem auth */
  if (rota === 'login' && req.method === 'POST') {
    return readBody().then(dados => {
      const r = API.superAdminLogin(dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* rotas autenticadas abaixo */
  if (!needAuth()) return;

  /* POST /api/super-admin/logout */
  if (rota === 'logout' && req.method === 'POST') {
    try { const r = API.superAdminLogout(token); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* GET /api/super-admin/dashboard */
  if (rota === 'dashboard' && req.method === 'GET') {
    try { const r = API.saDashboard(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* GET /api/super-admin/lojas */
  if (rota === 'lojas' && req.method === 'GET' && !idParam) {
    try { const r = API.saListarLojas(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* GET /api/super-admin/usuarios */
  if (rota === 'usuarios' && req.method === 'GET') {
    try { const r = API.saListarUsuarios(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* GET /api/super-admin/loja/:id */
  if (rota === 'loja' && idParam && parts[2] === undefined && req.method === 'GET') {
    try { const r = API.saDetalheLoja(idParam); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* PUT /api/super-admin/loja/:id/plan */
  if (rota === 'loja' && idParam && parts[2] === 'plan' && req.method === 'PUT') {
    return readBody().then(dados => {
      const r = API.saAtualizarPlano(idParam, dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* DELETE /api/super-admin/loja/:id */
  if (rota === 'loja' && idParam && parts[2] === undefined && req.method === 'DELETE') {
    try { const r = API.saExcluirLoja(idParam); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  json(res, 404, { ok: false, error: 'Rota super-admin não encontrada.' });
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
    var urlOk = false;
    var hmacOk = false;
    if (secretEnv) {
      const secretUrl = url.searchParams.get('webhookSecret') || '';
      if (secretUrl) {
        const a = Buffer.from(secretEnv, 'utf8');
        const b = Buffer.from(secretUrl, 'utf8');
        urlOk = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
      if (!urlOk) {
        hmacOk = assinaturaValida(corpo, req.headers['x-webhook-signature']);
      }
      if (!urlOk && !hmacOk) {
        return json(res, 401, { ok: false, error: 'Unauthorized' });
      }
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
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/health') {
    return void (async () => {
      let db = null;
      let err = null;
      try {
        const { knex } = require('./backend/pool');
        const r = await knex.raw(
          'SELECT current_database() AS db, now() AS ts, 1 AS ok'
        );
        const linha = (r && r.rows && r.rows[0]) || {};
        db = { database: linha.db || null, ok: linha.ok === 1 };
      } catch (e) { err = e.message || 'erro'; }
      if (db && db.ok) {
        json(res, 200, { ok: true, status: 'up', postgres: db });
      } else {
        json(res, 503, { ok: false, status: 'down', error: err || 'banco indisponível' });
      }
    })();
  }
  /* magic-link */
  if (req.method === 'GET' && url.pathname === '/magic-link') {
    const tk = url.searchParams.get('token');
    if (!tk) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Token ausente.'); }
    const html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=../admin/">\n<title>Entrando...</title></head>\n<body><p>Entrando no Corte Certo...</p><script>\nvar params = new URLSearchParams(location.search);\nvar tk = params.get(\'token\');\nif (tk) { localStorage.setItem(\'cc_magic_token\', tk); }\nlocation.href = \'../admin/\';\n</script></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  /* super-admin routes */
  if (pathname.indexOf('/api/super-admin/') === 0) {
    return void handleSuperAdmin(req, res, pathname, url);
  }
  if (req.method === 'POST' && pathname === '/api/rpc') return handleRpc(req, res);
  if (req.method === 'POST' && pathname === '/webhooks/abacatepay') {
    return handleWebhookAbacate(req, res, url);
  }
  if (req.method === 'GET' || req.method === 'HEAD') return servirEstatico(req, res, url);
  res.writeHead(405);
  res.end('Método não permitido');
});

/* Inicializa a persistência (PostgreSQL) antes de atender requisições */
const boot = require('./backend/boot');
boot.init().then(() => {
  server.listen(PORTA, () => {
    console.log('');
    console.log('  Corte Certo rodando:');
    console.log('  Catálogo público : http://localhost:' + PORTA + '/public/catalogo.html');
    console.log('  Painel admin     : http://localhost:' + PORTA + '/admin/login.html');
    console.log('  Banco de dados   : PostgreSQL (cortecerto)');
    console.log('  Códigos SMS demo aparecem no terminal e na tela de login.');
    console.log(process.env.ABACATEPAY_API_KEY
      ? '  Pagamentos PIX   : AbacatePay (' +
        (/^abc_/.test(process.env.ABACATEPAY_API_KEY) ? 'dev mode' : 'chave configurada') + ')'
      : '  Pagamentos PIX   : MODO SIMULADO — configure ABACATEPAY_API_KEY no .env');
    console.log('');
  });
}).catch(e => {
  console.error('[boot] Falha ao carregar o banco de dados:', e);
  process.exit(1);
});
