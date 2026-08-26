/* ============================================================
   Corte Certo – auth.js  (PRD v2 · Seção 3.1 / RNF-06 / RNF-10)
   Autenticação SEM SENHA: telefone + código de 6 dígitos.
   O código é exibido na UI (modo demonstração — RNF-19).
   Sessão: token opaco de 256 bits, validade 30 dias.
   Chaves de compatibilidade: token / user / barbershop.
   Requer db.js carregado antes.
   ============================================================ */

window.Auth = (function () {
  'use strict';

  var SMS = require('./sms');
  var Mailer = require('./mailer');

  const TOKEN_TTL_DIAS = 30;
  const CODIGO_TTL_MS = 10 * 60 * 1000;   // RF-002: 10 minutos
  const MAX_TENTATIVAS = 5;               // RNF-10
  const COOLDOWN_MS = 30 * 1000;          // RNF-10

  /* ---------------- utilidades ---------------- */

  function normalizarTelefone(v) {
    return String(v || '').replace(/\D/g, '');
  }

  /* Identidade de login: aceita telefone (só dígitos) OU e-mail (RBAC ajudante) */
  function normalizarIdentidade(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (s.includes('@')) return s.toLowerCase();
    return s.replace(/\D/g, '');
  }

  function ehEmail(ident) { return String(ident || '').includes('@'); }

  function usuarioPorIdentidade(db, ident) {
    if (!ident) return null;
    if (ehEmail(ident)) {
      return db.users.find(u => String(u.email || '').toLowerCase() === ident) || null;
    }
    return db.users.find(u => u.phone === ident) || null;
  }

  function agoraMs() { return Date.now(); }

  function gerarToken() {
    const bytes = new Uint8Array(32); // 256 bits
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function slugify(nome) {
    return String(nome || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function slugUnico(nome) {
    const base = slugify(nome);
    if (!base) return 'salao-' + Math.floor(Math.random() * 900 + 100);
    const db = DB._d();
    if (!db.barbershops.some(b => b.slug === base)) return base;
    for (let i = 0; i < 50; i++) {
      const cand = base + '-' + Math.floor(Math.random() * 900 + 100);
      if (!db.barbershops.some(b => b.slug === cand)) return cand;
    }
    throw { status: 500, error: 'Não foi possível gerar um identificador único para o salão.' };
  }

  /* ---------------- sessão ---------------- */

  function usuarioAtual() {
    // em contexto HTTP o token vem SEMPRE da requisição (header x-cc-token)
    const token = window.__CC_HTTP
      ? (window.__CC_REQUEST_TOKEN || null)
      : localStorage.getItem('token');
    if (!token) return null;
    const db = DB._d();
    const s = db.sessions.find(x => x.token === token);
    if (!s) { limparSessao(); return null; }
    if (s.expires_at <= new Date().toISOString()) {
      // RF-006: purga na verificação
      db.sessions = db.sessions.filter(x => x.token !== token);
      DB.salvar();
      limparSessao();
      return null;
    }
    return db.users.find(u => u.id === s.user_id) || null;
  }

  function salaoDoUsuario(user) {
    if (!user) return null;
    const db = DB._d();
    if (user.role === 'dono') {
      return db.barbershops.find(b => b.owner_user_id === user.id) || null;
    }
    if (user.role === 'barbeiro') {
      const prof = db.professionals.find(p => p.user_id === user.id);
      if (!prof) return null;
      return db.barbershops.find(b => b.id === prof.barbershop_id) || null;
    }
    return null;
  }

  function criarSessao(userId) {
    const db = DB._d();
    /* limita a 5 sessões ativas por usuário */
    const ativas = db.sessions.filter(s => s.user_id === userId);
    if (ativas.length >= 5) {
      const maisAntiga = ativas.sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0];
      db.sessions = db.sessions.filter(s => s.id !== maisAntiga.id);
    }
    const expira = new Date(Date.now() + TOKEN_TTL_DIAS * 24 * 3600 * 1000).toISOString();
    const sessao = { id: DB.proximoId(), user_id: userId, token: gerarToken(), expires_at: expira };
    db.sessions.push(sessao);
    DB.salvar();
    localStorage.setItem('token', sessao.token);
    const u = db.users.find(x => x.id === userId);
    const shop = salaoDoUsuario(u);
    localStorage.setItem('user', JSON.stringify(publicUser(u)));
    localStorage.setItem('barbershop', shop ? JSON.stringify(shop) : '');
    return sessao;
  }

  function limparSessao() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('barbershop');
  }

  function logout(tokenAtual) {
    const db = DB._d();
    const token = tokenAtual || (window.__CC_HTTP
      ? (window.__CC_REQUEST_TOKEN || null)
      : localStorage.getItem('token'));
    // RF-008: invalida somente o token atual
    db.sessions = db.sessions.filter(s => s.token !== token);
    DB.salvar();
    limparSessao();
  }

  function publicUser(u) {
    return u ? {
      id: u.id, role: u.role, name: u.name,
      email: u.email || '', phone: u.phone, verified: !!u.verified,
      prefs: u.prefs || null
    } : null;
  }

  /* ============================================================
     FLUXO SMS (RF-001..RF-004, DT-13)
     ============================================================ */

  function codigoAtivo(ident) {
    return DB._d().sms_codes.find(c => c.ident === ident && !c.used) || null;
  }

  function cooldownRestanteSeg(ident) {
    const c = codigoAtivo(ident);
    if (!c || !c.next_allowed_at) return 0;
    const rest = Math.ceil((c.next_allowed_at - agoraMs()) / 1000);
    return rest > 0 ? rest : 0;
  }

  /**
   * Etapa 1 — solicitar código.
   * modo 'login' exige identidade (telefone OU e-mail) existente;
   * 'registro' exige telefone novo.
   * Retorna { ok:true, expires_in_seconds, demo_code } — o campo demo_code
   * existe porque não há servidor de SMS (RNF-19): a UI exibe o código.
   */
  function requestCode(dados) {
    const db = DB._d();
    const ident = normalizarIdentidade(dados && dados.phone);
    const porEmail = ehEmail(ident);

    if (porEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident)) {
        throw { status: 400, error: 'E-mail inválido.' };
      }
    } else if (ident.length < 10) {
      throw { status: 400, error: 'Informe um telefone válido (ao menos 10 dígitos com DDD) ou um e-mail.' };
    }

    const cooldown = cooldownRestanteSeg(ident);
    if (cooldown > 0) throw { status: 429, error: 'Aguarde ' + cooldown + 's para solicitar um novo código.' };

    const existente = usuarioPorIdentidade(db, ident);

    if (dados.modo === 'login') {
      if (!existente) {
        throw { status: 404, error: porEmail
          ? 'E-mail não cadastrado. Verifique o e-mail ou entre pelo telefone.'
          : 'Número não cadastrado. Crie uma conta.' };
      }
    } else if (dados.modo === 'registro') {
      if (porEmail) throw { status: 400, error: 'O cadastro é feito por telefone. Use a opção Entrar com e-mail.' };
      if (existente) throw { status: 409, error: 'Número já cadastrado. Faça login.' };
      const nome = String(dados.name || '').trim();
      if (!nome) throw { status: 400, error: 'Informe seu nome.' };
      const email = String(dados.email || '').trim();
      if (email && !email.includes('@')) throw { status: 400, error: 'E-mail inválido.' };
      const role = dados.role === 'dono' ? 'dono' : 'cliente';
      if (role === 'dono' && !String(dados.salon_name || '').trim()) {
        throw { status: 400, error: 'Informe o nome do salão.' };
      }
    } else {
      throw { status: 400, error: 'Modo inválido (use login ou registro).' };
    }

    // limpa códigos usados/expirados da mesma identidade
    db.sms_codes = db.sms_codes.filter(c => c.ident !== ident || (c.used && agoraMs() > c.expires_at));
    // RF-002: novo pedido substitui o código anterior da mesma identidade
    db.sms_codes = db.sms_codes.filter(c => c.ident !== ident);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const registro = {
      id: DB.proximoId(),
      ident,
      phone: porEmail ? '' : ident,
      code,
      expires_at: agoraMs() + CODIGO_TTL_MS,
      attempts: 0,
      used: 0,
      next_allowed_at: agoraMs() + COOLDOWN_MS,
      payload: dados.modo === 'registro'
        ? {
            modo: 'registro',
            name: String(dados.name || '').trim(),
            email: String(dados.email || '').trim(),
            role: dados.role === 'dono' ? 'dono' : 'cliente',
            salon_name: String(dados.salon_name || '').trim()
          }
        : { modo: 'login' },
      created_at: new Date().toISOString()
    };
    db.sms_codes.push(registro);
    DB.salvar();

    console.info('[Auth][DEMO] Código para ' + ident + ': ' + code);

    /* envio de SMS (real ou demo) */
    var phoneDigits = ident.replace(/\D/g, '');
    if (!porEmail && phoneDigits.length >= 10) {
      SMS.enviarSMS(phoneDigits, 'Seu código Corte Certo: ' + code)
        .catch(function(e) { console.error('[sms] falha:', e); });
    }

    /* link mágico por e-mail (se usuário tem email) */
    var emailDestino = porEmail ? ident : (dados.email || '');
    if (!emailDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
      /* tenta buscar email do usuário existente */
      if (existente && existente.email) emailDestino = existente.email;
    }
    if (emailDestino && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
      var crypto = require('crypto');
      var token = crypto.randomBytes(32).toString('hex');
      var agora = new Date();
      var expira = new Date(agora.getTime() + 15 * 60 * 1000);
      db.magic_tokens = (db.magic_tokens || []).filter(function(t) {
        return t.user_id !== (existente ? existente.id : -1) || !t.used;
      });
      var ativos = (db.magic_tokens || []).filter(function(t) {
        return t.user_id === (existente ? existente.id : -1) && !t.used;
      });
      if (ativos.length >= 3) {
        db.magic_tokens = db.magic_tokens.filter(function(t) {
          return t.user_id !== (existente ? existente.id : -1) || t.used;
        });
      }
      db.magic_tokens.push({
        id: DB.proximoId(),
        token: token,
        user_id: existente ? existente.id : 0,
        email: emailDestino,
        expires_at: expira.toISOString(),
        used: 0,
        created_at: agora.toISOString()
      });
      DB.salvar();
      var nomeUser = existente ? existente.name : (dados.name || 'Usuário');
      Mailer.enviarLinkMagico(emailDestino, token, nomeUser)
        .catch(function(e) { console.error('[mailer] falha:', e); });
    }

    return {
      ok: true,
      expires_in_seconds: 600,
      cooldown_seconds: COOLDOWN_MS / 1000,
      demo_code: code // RNF-19: exibido na UI como banner de demonstração
    };
  }

  /** Reenvio usa a mesma validação de cooldown do request original. */
  function reenviarCodigo(phone, modo) {
    return requestCode({ phone, modo });
  }

  /**
   * Etapa 2 — verificar código e abrir sessão (RF-004/RF-005).
   * Aceita telefone OU e-mail como identidade (RBAC ajudante).
   * Provisionamento atômico do dono: usuário + loja + horários + trial.
   */
  function verifyCode(identBruto, codeBruto) {
    const db = DB._d();
    const ident = normalizarIdentidade(identBruto);
    const code = String(codeBruto || '').replace(/\D/g, '');

    const reg = codigoAtivo(ident);
    if (!reg) throw { status: 400, error: 'Nenhum código ativo. Solicite um novo código.' };
    if (reg.attempts >= MAX_TENTATIVAS) {
      db.sms_codes = db.sms_codes.filter(c => c.id !== reg.id);
      DB.salvar();
      throw { status: 400, error: 'Código bloqueado após 5 tentativas. Solicite um novo.' };
    }
    if (agoraMs() > reg.expires_at) {
      db.sms_codes = db.sms_codes.filter(c => c.id !== reg.id);
      DB.salvar();
      throw { status: 400, error: 'Código expirado. Solicite um novo código.' };
    }
    if (code.length !== 6) throw { status: 400, error: 'Informe o código de 6 dígitos.' };
    if (reg.code !== code) {
      reg.attempts += 1;
      DB.salvar();
      const restantes = MAX_TENTATIVAS - reg.attempts;
      throw { status: 400, error: 'Código incorreto.' + (restantes > 0 ? ' Tentativas restantes: ' + restantes + '.' : '') };
    }

    // uso único (RF-002)
    db.sms_codes = db.sms_codes.filter(c => c.id !== reg.id);

    let usuario = usuarioPorIdentidade(db, ident);
    let barbearia = null;
    const p = reg.payload || {};

    if (!usuario) {
      // criação no verify (RF-004) — apenas por telefone
      usuario = {
        id: DB.proximoId(),
        role: p.role === 'dono' ? 'dono' : 'cliente',
        name: p.name || 'Usuário',
        email: p.email || '',
        phone: ident,
        verified: 1,
        created_at: DB.hojeISO() + 'T' + DB.minToHHMM(DB.agoraMinutos()),
        prefs: { notif_email: 'sim', notif_sms: 'não', lembrete: '30' }
      };
      db.users.push(usuario);
      if (usuario.role === 'dono') barbearia = provisionarSalao(usuario, p.salon_name);
      /* email de onboarding para novo dono */
      if (usuario.role === 'dono' && usuario.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario.email)) {
        Mailer.enviarBoasVindas({
          email: usuario.email, nome: usuario.name,
          nomeSalao: p.salon_name || (barbearia && barbearia.name) || 'Seu salão',
          trialDias: 10
        }).catch(function(e) { console.error('[onboarding] falha:', e); });
      }
      DB.salvar();
    } else {
      usuario.verified = 1;
      if (p.name) usuario.name = p.name;
      if (p.email) usuario.email = p.email;
      DB.salvar();
      if (usuario.role === 'dono' || usuario.role === 'barbeiro') {
        barbearia = salaoDoUsuario(usuario);
      }
    }

    criarSessao(usuario.id);

    return { token: localStorage.getItem('token'), user: publicUser(usuario), barbershop: barbearia };
  }

  /**
   * RF-005 — provisionamento do dono:
   * barbearia + slug único + horários padrão seg–sáb 09–18 + trial Salao 10 dias.
   */
  function provisionarSalao(usuario, nomeSalao) {
    const db = DB._d();
    const slug = slugUnico(nomeSalao);

    const loja = {
      id: DB.proximoId(),
      owner_user_id: usuario.id,
      name: nomeSalao,
      description: '',
      slug,
      phone: '(' + String(usuario.phone).slice(0, 2) + ') ' + String(usuario.phone).slice(2),
      whatsapp: '', email: usuario.email || '', instagram: '',
      address: '', city: '', uf: '',
      lat: null, lng: null,
      logo_url: null, cover_url: null,
      tags: ['Corte', 'Barba'],
      ratingBase: 0, ratingCountBase: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    db.barbershops.push(loja);

    /* horários padrão da LOJA: seg–sáb 09–18 sem almoço, dom fechado */
    for (let dow = 1; dow <= 6; dow++) {
      db.working_hours.push({
        id: DB.proximoId(), barbershop_id: loja.id, professional_id: null,
        day_of_week: dow, start_time: '09:00', end_time: '18:00',
        lunch_start: null, lunch_end: null, is_open: 1
      });
    }
    db.working_hours.push({
      id: DB.proximoId(), barbershop_id: loja.id, professional_id: null,
      day_of_week: 0, start_time: '09:00', end_time: '18:00',
      lunch_start: null, lunch_end: null, is_open: 0
    });

    /* serviços iniciais para o catálogo já ter conteúdo */
    [
      { nome: 'Corte', dur: 30, preco: 40 },
      { nome: 'Barba', dur: 20, preco: 25 },
      { nome: 'Corte + Barba', dur: 45, preco: 60 }
    ].forEach((s, i) => {
      db.services.push({
        id: DB.proximoId(), barbershop_id: loja.id, name: s.nome,
        category: s.nome.includes('Barba') ? 'Barba' : 'Cabelo',
        description: '', duration_min: s.dur, price: s.preco,
        active: 1, sort_order: i + 1, created_at: new Date().toISOString()
      });
    });

    /* assinatura trial do plano Salao por 10 dias (RF-058) */
    const planoSalao = db.plans.find(p => p.name === 'Salao');
    db.subscriptions.push({
      id: DB.proximoId(),
      barbershop_id: loja.id,
      plan_id: planoSalao ? planoSalao.id : 2,
      status: 'trial',
      trial_ends_at: DB.addDiasISO(10),
      current_period_end: DB.addDiasISO(10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return loja;
  }

  /* ---------------- API pública ---------------- */

  return {
    normalizarTelefone,
    normalizarIdentidade,
    requestCode,
    reenviarCodigo,
    verifyCode,
    usuarioAtual,
    publicUser,
    salaoDoUsuario,
    logout,
    limparSessao
  };
})();
