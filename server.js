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

/* Cabeçalhos de segurança aplicados a TODAS as respostas (RNF-14) */
function headersPadrao(extra) {
  const base = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
      "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; " +
      "base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
  };
  return Object.assign(base, extra || {});
}

function json(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, headersPadrao({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
    'Cache-Control': 'no-store'
  }));
  res.end(corpo);
}

/* IP real do cliente (o Render/Proxy seta x-forwarded-for; sem ele,
   tudo cairia na mesma "caixa" e o limite valeria globalmente) */
function ipCliente(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (fwd) return fwd;
  return req.socket.remoteAddress || '0.0.0.0';
}

/* ---------------- rate-limit ---------------- */
const _rateMap = new Map();
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 120;

/* Limpeza periódica dos mapas para não crescer sem limite */
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of _rateMap) {
    if (now >= rec.reset) _rateMap.delete(ip);
  }
  for (const [ip, rec] of _failedAuth) {
    if (!rec.blockedUntil || now >= rec.blockedUntil) _failedAuth.delete(ip);
  }
}, 60 * 1000).unref();

/* ---------------- auth-brute-force ---------------- */
const _failedAuth = new Map();
const AUTH_FAIL_MAX = 5;
const AUTH_FAIL_WINDOW_MS = 10 * 60 * 1000;
const AUTH_BLOCK_MS = 5 * 60 * 1000; // 5 min de bloqueio — não punir erro de digitação

/* Registra uma falha de autenticação por IP; bloqueia após AUTH_FAIL_MAX */
function registrarFalhaAuth(ip) {
  const prev = _failedAuth.get(ip) || {};
  const now = Date.now();
  if (!prev.windowStart || now - prev.windowStart > AUTH_FAIL_WINDOW_MS) {
    prev.count = 0;
    prev.windowStart = now;
    prev.blockedUntil = 0;
  }
  prev.count += 1;
  if (prev.count >= AUTH_FAIL_MAX) prev.blockedUntil = now + AUTH_BLOCK_MS;
  _failedAuth.set(ip, prev);
}

function bloqueadoAuth(ip) {
  const rec = _failedAuth.get(ip);
  if (!rec || !rec.blockedUntil) return 0;
  return Date.now() < rec.blockedUntil ? Math.ceil((rec.blockedUntil - Date.now()) / 1000) : 0;
}

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

/* Allowlist do RPC: apenas métodos PROPRIEDADES PRÓPRIAS do API/Auth
   (nunca herdadas do protótipo — elimina `constructor`, `__proto__`
   etc.). Bloqueia ainda internos e todo o super-admin, que tem rotas
   REST próprias com needAuth() + rate-limit. */
const _RPC_BLOQUEADOS = new Set([
  'err', '_auditLog', 'processarEventoWebhook',
  'superAdminLogin', 'superAdminAuth', 'superAdminLogout',
  'saListarLojas', 'saListarUsuarios', 'saDetalheLoja',
  'saAtualizarPlano', 'saExcluirLoja', 'saDashboard', 'saRelatorios'
]);
const _RPC_AUTH_PUBLICOS = new Set([
  'requestCode', 'reenviarCodigo', 'verifyCode', 'logout'
]);
const _RPC_API = new Set();
Object.keys(API).forEach(nome => {
  if (_RPC_BLOQUEADOS.has(nome)) return;
  if (nome.charCodeAt(0) === 95) return; // _-prefixo = interno
  if (!Object.prototype.hasOwnProperty.call(API, nome)) return;
  if (typeof API[nome] !== 'function') return;
  _RPC_API.add(nome);
});

/* Rejeita chaves perigosas em payloads aninhados (defesa em
   profundidade contra prototype pollution via dados mesclados). */
function sanitizarParams(v, profundidade) {
  if (profundidade > 12) return undefined;
  if (Array.isArray(v)) {
    return v.map(x => sanitizarParams(x, profundidade + 1))
            .filter(x => x !== undefined);
  }
  if (v && typeof v === 'object' && v.constructor === Object) {
    const limpo = {};
    for (const chave of Object.keys(v)) {
      if (chave === '__proto__' || chave === 'prototype' || chave === 'constructor') continue;
      limpo[chave] = sanitizarParams(v[chave], profundidade + 1);
    }
    return limpo;
  }
  return v;
}

function handleRpc(req, res) {
  /* rate-limit por IP */
  const ip = ipCliente(req);
  const now = Date.now();
  const rec = _rateMap.get(ip);
  if (rec && now < rec.reset) {
    rec.count++;
    if (rec.count > RATE_MAX) {
      const retryAfter = Math.ceil((rec.reset - now) / 1000);
      return json(res, 429, {
        ok: false, status: 429,
        error: 'Muitas requisições. Aguarde ' + retryAfter + 's.'
      });
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
      return json(res, 400, { ok: false, status: 400, error: 'JSON malformado.' });
    }
    if (!metodo || typeof metodo !== 'string') {
      return json(res, 400, { ok: false, status: 400, error: 'Método inválido.' });
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(metodo)) {
      return json(res, 400, { ok: false, status: 400, error: 'Método inválido.' });
    }
    /* Allowlist estrita: só métodos próprios e aprovados. Métodos
       inexistentes/não permitidos respondem 401 idêntico ao de sessão
       inválida — impede enumeração de métodos pelo erro. */
    let fn = null;
    if (_RPC_API.has(metodo) && typeof API[metodo] === 'function') {
      fn = API[metodo];
    } else if (_RPC_AUTH_PUBLICOS.has(metodo) && typeof Auth[metodo] === 'function') {
      fn = Auth[metodo];
    }
    if (!fn) {
      return json(res, 401, { ok: false, status: 401, error: 'Não autorizado.' });
    }

    /* argumentos: apenas array; qualquer outra forma é rejeitada.
       Sanitiza __proto__/prototype/constructor em payloads aninhados. */
    const argList = Array.isArray(args) ? args.map(a => sanitizarParams(a, 0)) : [];

    /* segunda camada: métodos autenticados exigem token válido */
    if (_authRequired.has(metodo)) {
      const tk = req.headers['x-cc-token'] || null;
      if (!tk) {
        return json(res, 401, { ok: false, status: 401, error: 'Sessão expirada. Faça login novamente.' });
      }
      global.__CC_REQUEST_TOKEN = tk;
      global.__CC_HTTP = true;
      try {
        const u = Auth.usuarioAtual();
        if (!u) {
          return json(res, 401, { ok: false, status: 401, error: 'Sessão expirada. Faça login novamente.' });
        }
      } catch (e) {
        return json(res, 401, { ok: false, status: 401, error: 'Sessão expirada. Faça login novamente.' });
      } finally {
        delete global.__CC_REQUEST_TOKEN;
        delete global.__CC_HTTP;
      }
    }

    global.__CC_REQUEST_TOKEN = req.headers['x-cc-token'] || null;
    global.__CC_HTTP = true;
    const ts = new Date().toISOString();
    const argsStr = JSON.stringify(argList).slice(0, 200);

    /* brute-force guard para verifyCode */
    if (metodo === 'verifyCode') {
      const bloqueio = bloqueadoAuth(ip);
      if (bloqueio > 0) {
        return json(res, 429, {
          ok: false, status: 429,
          error: 'Muitas tentativas. Aguarde ' + bloqueio + 's.'
        });
      }
    }

    function responderErro(e) {
      const status = (e && e.status) || 500;
      if (metodo === 'verifyCode' && status >= 400 && status < 500) registrarFalhaAuth(ip);
      if (status >= 500) console.error('[rpc][ERR]', ts, 'method=' + metodo, 'ip=' + ip, 'status=' + status, 'args=' + argsStr, e);
      return json(res, status, {
        ok: false, status,
        error: (e && e.error) || 'Erro interno.'
      });
    }

    try {
      const dados = fn.apply(null, argList);
      /* função assíncrona: resolve a resposta fora daqui */
      if (dados && typeof dados.then === 'function') {
        return void dados.then(
          valor => {
            if (metodo === 'verifyCode') _failedAuth.delete(ip);
            json(res, 200, { ok: true, data: valor === undefined ? null : valor });
          },
          e => responderErro(e));
      }
      if (metodo === 'verifyCode') _failedAuth.delete(ip);
      return json(res, 200, { ok: true, data: dados === undefined ? null : dados });
    } catch (e) {
      return responderErro(e);
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

  /* POST /api/super-admin/login — sem auth, mas com rate-limit */
  if (rota === 'login' && req.method === 'POST') {
    const ip = ipCliente(req);
    const now = Date.now();
    const rec = _rateMap.get(ip);
    if (rec && now < rec.reset && rec.count > RATE_MAX / 2) {
      const retryAfter = Math.ceil((rec.reset - now) / 1000);
      return json(res, 429, {
        ok: false, status: 429,
        error: 'Muitas tentativas. Aguarde ' + retryAfter + 's.'
      });
    }
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

  /* GET /api/super-admin/relatorios */
  if (rota === 'relatorios' && req.method === 'GET') {
    try { const r = API.saRelatorios(); json(res, 200, { ok: true, data: r }); }
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
    res.writeHead(302, headersPadrao({ Location: '/public/telainicial.html' }));
    return res.end();
  }

  const alvo = path.normalize(path.join(RAIZ, caminho));
  if (!alvo.startsWith(RAIZ)) {
    res.writeHead(403, headersPadrao({ 'Content-Type': 'text/plain; charset=utf-8' }));
    return res.end('Proibido');
  }

  let arquivo = alvo;
  try {
    if (fs.statSync(alvo).isDirectory()) arquivo = path.join(alvo, 'index.html');
  } catch (e) {
    res.writeHead(404, headersPadrao({ 'Content-Type': 'text/plain; charset=utf-8' }));
    return res.end('404 — não encontrado.');
  }

  fs.readFile(arquivo, (err, dados) => {
    if (err) {
      res.writeHead(404, headersPadrao({ 'Content-Type': 'text/plain; charset=utf-8' }));
      return res.end('404 — não encontrado.');
    }
    res.writeHead(200, headersPadrao({
      'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': dados.length,
      'Cache-Control': 'no-store'
    }));
    res.end(req.method === 'HEAD' ? undefined : dados);
  });
}

/* ---------------- servidor ---------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/health') {
    return void (async () => {
      let ok = false;
      try {
        const { knex } = require('./backend/pool');
        const r = await knex.raw('SELECT 1 AS ok');
        ok = !!(r && r.rows && r.rows[0] && r.rows[0].ok === 1);
      } catch (e) { ok = false; }
      /* resposta mínima — sem versão/stack/nome de servidor */
      json(res, ok ? 200 : 503, { ok });
    })();
  }
  /* magic-link */
  if (req.method === 'GET' && url.pathname === '/magic-link') {
    const tk = url.searchParams.get('token');
    if (!tk) { res.writeHead(400, headersPadrao({ 'Content-Type': 'text/plain; charset=utf-8' })); return res.end('Token ausente.'); }
    const html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=../admin/">\n<title>Entrando...</title></head>\n<body><p>Entrando no Corte Certo...</p><script src="../shared/js/magic-link.js"></script></body></html>';
    res.writeHead(200, headersPadrao({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-store' }));
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
  res.writeHead(405, headersPadrao({ 'Content-Type': 'text/plain; charset=utf-8' }));
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
