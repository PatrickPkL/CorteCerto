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

/* Render/Neon não têm rota IPv6 — sem isso o envio de e-mail (Gmail)
   falha com "connect ENETUNREACH <ipv6>". Obriga IPv4 primeiro no DNS. */
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (e) { /* Node antigo */ }

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

/* ---- Segurança (fail-closed): sem DB_ENCRYPT_KEY o servidor NÃO sobe.
   A ausência da chave faria o crypt.js persistir PII (e-mails/telefones)
   em texto puro silenciosamente. Desative a proteção apenas em ambientes
   de demonstração com CC_CRYPT_INSECURE_PLAINTEXT=1 (default inseguro). ---- */
if (!String(process.env.DB_ENCRYPT_KEY || '').trim() &&
    !String(process.env.CC_CRYPT_INSECURE_PLAINTEXT || '').trim()) {
  console.error(
    '[SEGURANÇA][BOOT] DB_ENCRYPT_KEY não configurado. ' +
    'Sem a chave a aplicação falha fechada (não sobe) para nunca gravar ' +
    'dados sensíveis em claro. Defina DB_ENCRYPT_KEY no .env ' +
    'ou, APENAS em demo, CC_CRYPT_INSECURE_PLAINTEXT=1.'
  );
  process.exit(1);
}

const { API, Auth, Bot } = require('./backend/boot');

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
  'gerarCodigoExclusao', 'confirmarExclusao',
  'alternarFavorito', 'meusFavoritos',
  'criarTicket', 'ticketsDoSalao',
  'definirLogo', 'definirCapa',
  'galeriaDaLoja', 'adicionarGaleria', 'removerGaleria',
  'servicosDaLoja', 'profissionaisDaLoja', 'horariosDaLoja',
  'gerarLembretesAmanha', 'gerarLembretesPendentes',
  'ativarTrial',
  'criarCobrancaPlano', 'statusCobranca', 'listarMinhasCobrancas',
  'confirmarCobrancaDemo', 'simularCobranca',
  'criarReview', 'minhasReviews',
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
  'saAtualizarPlano', 'saExcluirLoja', 'saDashboard', 'saRelatorios',
  'saTickets', 'saResponderTicket'
]);
const _RPC_AUTH_PUBLICOS = new Set([
  'requestCode', 'reenviarCodigo', 'reenviarCodigoIdentidade', 'verifyCode',
  'recuperarAcesso', 'logout'
]);
const _RPC_API = new Set();
Object.keys(API).forEach(nome => {
  if (_RPC_BLOQUEADOS.has(nome)) return;
  if (nome.charCodeAt(0) === 95) return; // _-prefixo = interno
  if (!Object.prototype.hasOwnProperty.call(API, nome)) return;
  if (typeof API[nome] !== 'function') return;
  _RPC_API.add(nome);
});

/* ---- Invariante de segurança (fail-closed): nenhum método
   administrativo/super-admin pode vazar para o RPC público. Se isso
   acontecer, o servidor NÃO sobe — impede regressões silenciosas. ---- */
for (const nome of _RPC_API) {
  if (/^sa[A-Z]/.test(nome) || /^superAdmin[A-Z]/.test(nome)) {
    throw new Error(
      '[SEGURANÇA][BOOT] Método restrito exposto no RPC público: ' + nome +
      '. Adicione-o a _RPC_BLOQUEADOS ou remova da exportação do API.'
    );
  }
}

/* Métodos públicos do Bot (atendente + chat do site) expostos via RPC.
   Mesmo critério da allowlist de API: nenhum `_`-prefixo, nenhum interno.
   Bot atendente e chats do painel saíram do RPC: são super-admin agora
   (rotas REST /api/super-admin/*). Só restam os 2 públicos do widget. */
const _RPC_BOT = new Set(['chatEnviar', 'chatBuscar']);

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
/* Allowlist estrita: só métodos próprios e aprovados. Métodos
       inexistentes/não permitidos respondem 401 idêntico ao de sessão
       inválida — impede enumeração de métodos pelo erro. A allowlist
       cobre API, métodos públicos de Auth e o Bot (chat + painel). */
    let fn = null;
    if (_RPC_API.has(metodo) && typeof API[metodo] === 'function') {
      fn = API[metodo];
    } else if (_RPC_AUTH_PUBLICOS.has(metodo) && typeof Auth[metodo] === 'function') {
      fn = Auth[metodo];
    } else if (_RPC_BOT.has(metodo) && typeof Bot[metodo] === 'function') {
      fn = Bot[metodo];
    }

    /* método inexistente/não permitido: responde 401 idêntico ao de
       sessão inválida — sem enumeração e sem vazar dados (fail-closed) */
    if (!fn) {
      return json(res, 401, { ok: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    /* argumentos: apenas array; qualquer outra forma é rejeitada.
       Sanitiza __proto__/prototype/constructor em payloads aninhados. */
    const argList = Array.isArray(args) ? args.map(a => sanitizarParams(a, 0)) : [];

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
      const dados = fn.apply(null, argList);
      /* função assíncrona: resolve a resposta fora daqui — sem isso,
         uma Promise rejeitada seria serializada como {} com status 200 */
      if (dados && typeof dados.then === 'function') {
        return void dados
          .then(
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
            })
          .finally(() => {
            /* limpa o contexto HTTP somente depois de a Promise resolver —
               funções async chamam Auth.usuarioAtual() internamente. */
            delete global.__CC_REQUEST_TOKEN;
            delete global.__CC_HTTP;
          });
      }
      if (metodo === 'verifyCode') _failedAuth.delete(ip);
      const saida = json(res, 200, { ok: true, data: dados === undefined ? null : dados });
      delete global.__CC_REQUEST_TOKEN;
      delete global.__CC_HTTP;
      return saida;
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
      const saida = json(res, status, { ok: false, status, error: (e && e.error) || 'Erro interno.' });
      delete global.__CC_REQUEST_TOKEN;
      delete global.__CC_HTTP;
      return saida;
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

  /* GET /api/super-admin/tickets?status=... */
  if (rota === 'tickets' && req.method === 'GET') {
    try {
      var qs = new URL(url, 'http://localhost').searchParams;
      var r = API.saTickets({ status: qs.get('status') || 'todos' });
      json(res, 200, { ok: true, data: r });
    } catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* PUT /api/super-admin/ticket/:id — responde/atualiza status */
  if (rota === 'ticket' && idParam && req.method === 'PUT') {
    return readBody().then(dados => {
      const r = API.saResponderTicket(idParam, dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* ---------------- bot atendente + chats (super-admin) ---------------- */

  /* GET /api/super-admin/bot — config atual */
  if (rota === 'bot' && !idParam && req.method === 'GET') {
    try { const r = Bot.saBotConfig(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* PUT /api/super-admin/bot — salva config */
  if (rota === 'bot' && !idParam && req.method === 'PUT') {
    return readBody().then(dados => {
      const r = Bot.saBotSalvar(dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* POST /api/super-admin/bot/verificar — testa a config (sem salvar) */
  if (rota === 'bot' && idParam === 'verificar' && req.method === 'POST') {
    return readBody().then(dados => {
      const r = Bot.saBotVerificar(dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* POST /api/super-admin/bot/testar — dispara processamento manual */
  if (rota === 'bot' && idParam === 'testar' && req.method === 'POST') {
    return readBody().then(dados => {
      const r = Bot.saBotTestar(dados);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
  }

  /* GET /api/super-admin/bot/historico */
  if (rota === 'bot' && idParam === 'historico' && req.method === 'GET') {
    try {
      const r = Bot.saBotHistorico();
      json(res, 200, { ok: true, data: r });
    } catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* DELETE /api/super-admin/bot/historico */
  if (rota === 'bot' && idParam === 'historico' && req.method === 'DELETE') {
    try { const r = Bot.saBotLimparHistorico(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* GET /api/super-admin/chats */
  if (rota === 'chats' && !idParam && req.method === 'GET') {
    try { const r = Bot.saChatsListar(); json(res, 200, { ok: true, data: r }); }
    catch (e) { json(res, 500, { ok: false, error: e.message || 'Erro.' }); }
    return;
  }

  /* POST /api/super-admin/chats/:id/responder */
  if (rota === 'chats' && idParam && parts[2] === 'responder' && req.method === 'POST') {
    return readBody().then(dados => {
      const r = Bot.saChatsResponder(idParam, dados.texto);
      json(res, 200, { ok: true, data: r });
    }).catch(e => json(res, 400, { ok: false, error: e.message || 'Erro.' }));
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
  res.writeHead(405);
  res.end('Método não permitido');
});

/* Inicializa a persistência (PostgreSQL) antes de atender requisições */
const boot = require('./backend/boot');

/* Se o PostgreSQL local (portátil em .pg/) não estiver na porta 5432,
   inicia-o automaticamente — assim `npm run dev` funciona sem setup. */
const net = require('net');
const child_process = require('child_process');

function portaAberta(porta, ms) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port: porta });
    s.setTimeout(ms || 1200);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

function iniciarPostgresLocal() {
  const pgCtl = path.join(__dirname, '.pg', 'pgsql', 'bin', 'pg_ctl.exe');
  const dataDir = path.join(__dirname, '.pg', 'data');
  const logFile = path.join(__dirname, '.pg', 'pg.log');
  if (!fs.existsSync(pgCtl) || !fs.existsSync(dataDir)) return Promise.resolve(false);
  console.log('  [postgres] porta 5432 fechada — iniciando banco local (.pg)...');
  return new Promise(resolve => {
    child_process.execFile(pgCtl, ['-D', dataDir, '-l', logFile, 'start'], { timeout: 30000 }, err => {
      if (err) {
        console.log('  [postgres] já estava em execução ou houve erro: ' + (err.message || err));
        return resolve(true);
      }
      resolve(true);
    });
  });
}

/* Banco é remoto (Render/Neon etc.) quando DATABASE_URL existe e aponta
   para um host diferente de localhost. Nesse caso NÃO checamos a porta
   local 5432 — a conexão é do pool e o boot decide por ela. */
function bancoRemoto() {
  const url = process.env.DATABASE_URL || '';
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return !(h === '127.0.0.1' || h === 'localhost' || h === '::1');
  } catch (e) {
    return false;
  }
}

(async function iniciar() {
  if (!bancoRemoto()) {
    let bancoOk = await portaAberta(5432);
    if (!bancoOk) {
      await iniciarPostgresLocal();
      for (let i = 0; i < 24 && !bancoOk; i++) {
        await new Promise(r => setTimeout(r, 500));
        bancoOk = await portaAberta(5432);
      }
    }
    if (!bancoOk) {
      console.error('[boot] PostgreSQL não está rodando na porta 5432.');
      console.error('[boot] Instale/aloque um PostgreSQL local ou rode `npm run db:start` (se usou o banco portátil de .pg/).');
      process.exit(1);
    }
  }

  try {
    await boot.init();
  } catch (e) {
    console.error('[boot] Falha ao carregar o banco de dados:', e);
    process.exit(1);
  }

  Bot.start(); // monitora a caixa do Gmail (somente se ativo no painel)
  server.listen(PORTA, () => {
    console.log('');
    console.log('  Corte Certo rodando:');
    console.log('  Catálogo público : http://localhost:' + PORTA + '/public/catalogo.html');
    console.log('  Painel admin     : http://localhost:' + PORTA + '/admin/login.html');
    console.log('  Banco de dados   : PostgreSQL (cortecerto)');
    console.log('  Códigos de acesso são enviados por e-mail (Gmail), com código demo no terminal e na tela de login.');
    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      console.log('  E-mail (código)  : Gmail real (' + process.env.GMAIL_USER + ')');
    } else {
      console.log('  E-mail (código)  : MODO DEMO — configure GMAIL_USER/GMAIL_PASS no painel do Render para o código chegar no e-mail.');
    }
    console.log(process.env.ABACATEPAY_API_KEY
      ? '  Pagamentos PIX   : AbacatePay (' +
        (/^abc_/.test(process.env.ABACATEPAY_API_KEY) ? 'dev mode' : 'chave configurada') + ')'
      : '  Pagamentos PIX   : MODO SIMULADO — configure ABACATEPAY_API_KEY no .env');
    if (process.env.GEMINI_API_KEY) {
      console.log('  Atendente bot    : IA Gemini ativa (' + (process.env.GEMINI_MODEL || 'gemini-2.0-flash') + ')');
    } else {
      console.log('  Atendente bot    : classificação por palavras-chave — coloque GEMINI_API_KEY no .env para usar a IA Gemini');
    }
    console.log('');
  });
})();
