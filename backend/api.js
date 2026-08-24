/* ============================================================
   Corte Certo – local-api.js  (PRD v2 · RNF-03 / Seção 3)
   Camada de API local que ESPELHA os contratos REST do backend v1:
   mesmos paths lógicos, payloads e respostas; erros simulados via
   throw { status, error } (códigos HTTP simulados).
   Requer db.js + auth.js carregados antes.
   ============================================================ */

window.API = (function () {
  'use strict';

  /* ================= helpers ================= */

  function err(status, error) { throw { status, error }; }

  function agoraISO() { return new Date().toISOString(); }
  function agoraLocal() { return DB.hojeISO() + 'T' + DB.minToHHMM(DB.agoraMinutos()); }

  function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  /* ---------- sessão / papéis (RF-011, RNF-06) ---------- */

  function sessao() {
    const u = Auth.usuarioAtual();
    if (!u) err(401, 'Sessão expirada. Faça login novamente.');
    return u;
  }

  function exigirDono() {
    const user = sessao();
    const shop = Auth.salaoDoUsuario(user);
    if (!shop) err(404, 'Nenhum salão vinculado a esta conta.');
    if (user.role !== 'dono') err(403, 'Acesso restrito ao dono do salão.');
    return { user, shop };
  }

  /* Equipe = dono OU barbeiro ajudante vinculado à loja (RBAC) */
  function exigirEquipe() {
    const user = sessao();
    const shop = Auth.salaoDoUsuario(user);
    if (!shop) err(404, 'Nenhum salão vinculado a esta conta.');
    if (user.role !== 'dono' && user.role !== 'barbeiro') {
      err(403, 'Acesso restrito à equipe do salão.');
    }
    return { user, shop };
  }

  function podeVerAgendamento(user, ag) {
    if (!user) return false;
    if (ag.user_id === user.id) return true;
    const loja = DB._d().barbershops.find(b => b.id === ag.barbershop_id);
    return !!(loja && loja.owner_user_id === user.id);
  }

  /* ---------- avaliações agregadas (RF-056) ---------- */

  function ratingDeLoja(shopId) {
    const db = DB._d();
    const loja = db.barbershops.find(b => b.id == shopId);
    if (!loja) return { media: 0, count: 0 };
    const avs = db.reviews.filter(r => r.barbershop_id == shopId);
    const soma = avs.reduce((a, r) => a + r.rating, 0);
    const baseCount = loja.ratingCountBase || 0;
    const baseSum = (loja.ratingBase || 0) * baseCount;
    const total = baseCount + avs.length;
    const mediaNum = total ? ((baseSum + soma) / total) : 0;
    return { media: Math.round(mediaNum * 10) / 10, count: total };
  }

  /* ================= BARBERSHOPS (RF-012..017) ================= */

  function listarLojasPublicas(opts) {
    opts = opts || {};
    const db = DB._d();
    const limite = clampInt(opts.limit, 1, 100, 100);
    const page = clampInt(opts.page, 1, 9999, 1);
    let lista = db.barbershops.slice();

    const q = String(opts.q || '').toLowerCase().trim();
    if (q) lista = lista.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.city || '').toLowerCase().includes(q));

    lista.sort((a, b) => a.name.localeCompare(b.name));
    const total = lista.length;
    const items = lista.slice((page - 1) * limite, page * limite).map(lojaPublica);
    return { items, total, page, limit: limite };
  }

  function lojaPublica(l) {
    const r = ratingDeLoja(l.id);
    return {
      id: l.id, name: l.name, slug: l.slug, description: l.description || '',
      address: l.address || '', city: l.city || '', uf: l.uf || '',
      phone: l.phone || '', whatsapp: l.whatsapp || '', instagram: l.instagram || '',
      logo_url: l.logo_url || null, cover_url: l.cover_url || null,
      tags: l.tags || [],
      lat: l.lat ?? null, lng: l.lng ?? null,
      rating_avg: r.media, rating_count: r.count,
      created_at: l.created_at
    };
  }

  function getLoja(id) {
    const l = DB._d().barbershops.find(x => x.id == id);
    if (!l) err(404, 'Salão não encontrado.');
    return lojaPublica(l);
  }

  function minhaLoja() {
    const { user, shop } = exigirDono();
    const sub = DB._d().subscriptions.find(s => s.barbershop_id === shop.id);
    const plano = sub && DB._d().plans.find(p => p.id === sub.plan_id);
    return Object.assign({}, shop, { subscription: sub ? assinaturaPublica(sub) : null });
  }

  function atualizarLoja(patch) {
    const { shop } = exigirDono();
    const campos = ['name', 'description', 'phone', 'email', 'whatsapp',
      'instagram', 'address', 'city', 'uf', 'logo_url', 'cover_url', 'tags'];
    campos.forEach(c => {
      if (patch[c] !== undefined) shop[c] = patch[c];
    });
    if (!shop.name.trim()) err(400, 'Nome do salão é obrigatório.');
    shop.updated_at = agoraISO();
    DB.salvar();
    localStorage.setItem('barbershop', JSON.stringify(shop)); // mantém chave compat
    return shop;
  }

  function excluirLoja() {
    const { user } = sessao();
    deletarLojaCascade(Auth.salaoDoUsuario(user));
    DB.salvar();
    return { ok: true };
  }

  /** Cascata completa (RF-010/RF-016). */
  function deletarLojaCascade(shop) {
    if (!shop) return;
    const db = DB._d();
    db.services = db.services.filter(s => s.barbershop_id !== shop.id);
    db.professionals = db.professionals.filter(p => p.barbershop_id !== shop.id);
    db.professional_services = db.professional_services.filter(ps =>
      !db.services.some(s => s.barbershop_id === shop.id && s.id === ps.service_id));
    db.working_hours = db.working_hours.filter(w => w.barbershop_id !== shop.id);
    db.schedule_exceptions = db.schedule_exceptions.filter(x => x.barbershop_id !== shop.id);
    db.appointments = db.appointments.filter(a => a.barbershop_id !== shop.id);
    db.gallery_images = db.gallery_images.filter(g => g.barbershop_id !== shop.id);
    db.subscriptions = db.subscriptions.filter(s => s.barbershop_id !== shop.id);
    db.reviews = db.reviews.filter(r => r.barbershop_id !== shop.id);
    db.clients = db.clients.filter(c => c.barbershop_id !== shop.id);
    db.tickets = db.tickets.filter(t => t.salaoId !== shop.id);
    db.barbershops = db.barbershops.filter(b => b.id !== shop.id);
  }

  /* RF-015 — nearby Haversine */
  function lojasProximas(lat, lng, raioKm) {
    const R = 6371;
    function haversine(a, b) {
      const toRad = d => d * Math.PI / 180;
      const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    const origem = { lat: Number(lat), lng: Number(lng) };
    if (isNaN(origem.lat) || isNaN(origem.lng)) err(400, 'Informe latitude e longitude.');
    const raio = Number(raioKm) || 20;
    return DB._d().barbershops
      .filter(l => l.lat != null && l.lng != null)
      .map(l => ({ loja: lojaPublica(l), dist: haversine(origem, l) }))
      .filter(x => x.dist <= raio)
      .sort((a, b) => a.dist - b.dist)
      .map(x => Object.assign(x.loja, { distance_km: Math.round(x.dist * 10) / 10 }));
  }

  /* ================= SERVIÇOS (RF-018..021) ================= */

  function validarServico(dados, parcial) {
    if (!parcial || dados.name !== undefined) {
      const nome = String(dados.name ?? '').trim();
      if (nome.length < 2 || nome.length > 100) err(400, 'Nome do serviço deve ter entre 2 e 100 caracteres.');
    }
    if (!parcial || dados.duration_min !== undefined) {
      const dur = Number(dados.duration_min);
      if (!Number.isFinite(dur) || dur < 5 || dur > 480) err(400, 'Duração deve estar entre 5 e 480 minutos.');
    }
    if (!parcial || dados.price !== undefined) {
      const p = Number(dados.price);
      if (!Number.isFinite(p) || p < 0) err(400, 'Preço deve ser um valor maior ou igual a zero.');
    }
  }

  function servicosDaLoja(shopId, apenasAtivos) {
    return DB._d().services
      .filter(s => s.barbershop_id == shopId && (!apenasAtivos || s.active))
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
  }

  function criarServico(dados) {
    const { shop } = exigirDono();
    validarServico(dados, false);
    const svc = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      name: String(dados.name).trim(),
      category: String(dados.category || '').trim(),
      description: String(dados.description || '').trim(),
      duration_min: Number(dados.duration_min),
      price: Number(dados.price),
      active: dados.active === undefined ? 1 : (dados.active ? 1 : 0),
      sort_order: Number(dados.sort_order) ||
        (servicosDaLoja(shop.id, false).reduce((m, s) => Math.max(m, s.sort_order), 0) + 1),
      created_at: agoraISO()
    };
    DB._d().services.push(svc);
    DB.salvar();
    return svc;
  }

  function atualizarServico(id, patch) {
    const { shop } = exigirDono();
    const svc = DB._d().services.find(s => s.id == id && s.barbershop_id === shop.id);
    if (!svc) err(404, 'Serviço não encontrado.');
    validarServico(patch, true);
    ['name', 'category', 'description', 'duration_min', 'price'].forEach(c => {
      if (patch[c] !== undefined) svc[c] = c === 'name' ? String(patch[c]).trim() : patch[c];
    });
    if (patch.active !== undefined) svc.active = patch.active ? 1 : 0;
    if (patch.sort_order !== undefined) svc.sort_order = Number(patch.sort_order);
    DB.salvar();
    return svc;
  }

  function excluirServico(id) {
    const { shop } = exigirDono();
    const db = DB._d();
    const svc = db.services.find(s => s.id == id && s.barbershop_id === shop.id);
    if (!svc) err(404, 'Serviço não encontrado.');
    // DELETE físico (RF-020); snapshots em appointment_services são preservados
    db.professional_services = db.professional_services.filter(ps => ps.service_id != id);
    db.services = db.services.filter(s => s.id != id);
    DB.salvar();
    return { ok: true };
  }

  /* ================= PROFISSIONAIS (RF-022..026, DT-09/DT-12) ================= */

  function precoEfetivo(profissionalId, servico) {
    const link = DB._d().professional_services.find(ps =>
      ps.professional_id == profissionalId && ps.service_id === servico.id);
    return { ...servico, effective_price: (link && link.price_override != null) ? link.price_override : servico.price };
  }

  function profissionaisDaLoja(shopId, apenasAtivos) {
    const db = DB._d();
    return db.professionals
      .filter(p => p.barbershop_id == shopId && (!apenasAtivos || p.is_active))
      .map(p => ({
        id: p.id, name: p.name, phone: p.phone || '', color: p.color,
        bio: p.bio || '', is_active: p.is_active, created_at: p.created_at,
        services: db.professional_services
          .filter(ps => ps.professional_id === p.id)
          .map(ps => {
            const svc = db.services.find(s => s.id === ps.service_id);
            return svc
              ? { id: svc.id, name: svc.name, duration_min: svc.duration_min, price: svc.price, active: svc.active, effective_price: ps.price_override ?? svc.price }
              : null;
          }).filter(Boolean)
      }));
  }

  function gravarHorariosProfissional(shopId, profId, inicio, fim, lunchStart, lunchEnd) {
    const db = DB._d();
    const diasLoja = db.working_hours.filter(w => w.barbershop_id == shopId && w.professional_id == null);
    // regrava dom–sáb [0..6] preservando os horários da loja (DT-09);
    // linha nova só é criada em dias em que a loja abre
    for (let dow = 0; dow <= 6; dow++) {
      const linhaLoja = diasLoja.find(w => w.day_of_week === dow);
      const aberto = linhaLoja ? linhaLoja.is_open : (dow === 0 ? 0 : 1);
      const existente = db.working_hours.find(w =>
        w.barbershop_id == shopId && w.professional_id == profId && w.day_of_week === dow);
      if (!existente) {
        if (!aberto) continue;
        db.working_hours.push({
          id: DB.proximoId(), barbershop_id: Number(shopId), professional_id: profId,
          day_of_week: dow,
          start_time: inicio, end_time: fim,
          lunch_start: lunchStart || null, lunch_end: lunchEnd || null,
          is_open: aberto
        });
      } else {
        existente.start_time = inicio; existente.end_time = fim;
        existente.lunch_start = lunchStart || null;
        existente.lunch_end = lunchEnd || null;
        existente.is_open = aberto;
      }
    }
  }

  /* Localiza conta de usuário existente por telefone OU e-mail (RBAC) */
  function usuarioContaAcesso(db, { email, tel }) {
    if (tel) {
      const porFone = db.users.find(u => u.phone === tel);
      if (porFone) return porFone;
    }
    if (email) {
      return db.users.find(u => String(u.email || '').toLowerCase() === email.toLowerCase()) || null;
    }
    return null;
  }

  function criarProfissional(dados) {
    const { shop } = exigirDono();
    const db = DB._d();

    const nome = String(dados.name || '').trim();
    if (nome.length < 2) err(400, 'Informe o nome do profissional.');

    const email = String(dados.email || '').trim();
    if (email && !email.includes('@')) err(400, 'E-mail inválido.');
    const tel = String(dados.phone || '').replace(/\D/g, '');

    /* RF-026 / DT-12: plano limita nº de profissionais */
    const sub = db.subscriptions.find(s => s.barbershop_id === shop.id);
    const plano = sub && db.plans.find(p => p.id === sub.plan_id);
    const atuais = db.professionals.filter(p => p.barbershop_id === shop.id && p.is_active).length;
    if (plano && plano.max_professionals != null && atuais >= plano.max_professionals) {
      err(409, 'Limite do plano "' + plano.name + '" atingido (' + plano.max_professionals +
        ' profissional(is)). Faça upgrade para adicionar mais.');
    }

    /* RBAC: com e-mail ou telefone informado, o dono convida um barbeiro
       ajudante — cria (ou reaproveita) a conta de acesso usada no login */
    let contaAcesso = null;
    if (email || tel) {
      contaAcesso = usuarioContaAcesso(db, { email, tel });
      if (contaAcesso && contaAcesso.role === 'dono') {
        err(409, 'Este telefone/e-mail já pertence à conta de um dono de salão.');
      }
      if (contaAcesso &&
          db.professionals.some(p => p.barbershop_id === shop.id && p.user_id === contaAcesso.id)) {
        err(409, 'Já existe um profissional vinculado a este telefone/e-mail nesta loja.');
      }
      if (!contaAcesso) {
        contaAcesso = {
          id: DB.proximoId(),
          role: 'barbeiro',
          name: nome,
          email,
          phone: tel,
          verified: 1,
          created_at: DB.hojeISO() + 'T' + DB.minToHHMM(DB.agoraMinutos()),
          prefs: { notif_email: 'sim', notif_sms: 'não', lembrete: '30' }
        };
        db.users.push(contaAcesso);
      } else {
        if (contaAcesso.role === 'cliente') contaAcesso.role = 'barbeiro';
        contaAcesso.name = nome;
        if (email) contaAcesso.email = email;
        if (tel) contaAcesso.phone = tel;
      }
    }

    const prof = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      name: nome,
      phone: String(dados.phone || ''),
      color: dados.color || '#3b82f6',
      bio: String(dados.bio || '').trim(),
      is_active: 1,
      user_id: contaAcesso ? contaAcesso.id : null,
      created_at: agoraISO()
    };
    db.professionals.push(prof);

    /* almoço configurável (DT-09): chaves presentes no payload são
       respeitadas — enviar null/null grava SEM almoço; quando ausentes
       (chamada programática), vale o padrão 12:00–13:00 */
    gravarHorariosProfissional(
      shop.id, prof.id,
      dados.start_time || '09:00',
      dados.end_time || '19:00',
      dados.lunch_start !== undefined ? dados.lunch_start : '12:00',
      dados.lunch_end !== undefined ? dados.lunch_end : '13:00'
    );

    /* vínculos com serviços */
    if (Array.isArray(dados.service_ids)) substituirVinculos(prof.id, dados.service_ids);

    DB.salvar();
    return prof;
  }

  function substituirVinculos(profId, serviceIds) {
    const db = DB._d();
    db.professional_services = db.professional_services.filter(ps => ps.professional_id !== profId);
    serviceIds.forEach(sid => {
      if (!db.services.some(s => s.id == sid)) return;
      db.professional_services.push({ professional_id: profId, service_id: Number(sid), price_override: null });
    });
  }

  function atualizarProfissional(id, patch) {
    const { shop } = exigirDono();
    const db = DB._d();
    const prof = db.professionals.find(p => p.id == id && p.barbershop_id === shop.id);
    if (!prof) err(404, 'Profissional não encontrado.');

    if (patch.name !== undefined) {
      const nome = String(patch.name).trim();
      if (nome.length < 2) err(400, 'Informe o nome do profissional.');
      prof.name = nome;
    }
    if (patch.phone !== undefined) prof.phone = String(patch.phone);
    if (patch.color !== undefined) prof.color = patch.color;
    if (patch.bio !== undefined) prof.bio = String(patch.bio).trim();
    if (patch.is_active !== undefined) prof.is_active = patch.is_active ? 1 : 0;

    /* regrava expediente usando os valores atuais como base (DT-09):
       um patch que só muda o almoço não reseta início/fim para o padrão */
    if (patch.start_time || patch.end_time || patch.lunch_start !== undefined || patch.lunch_end !== undefined) {
      const atual = db.working_hours.find(w =>
        w.barbershop_id === shop.id && w.professional_id === prof.id && w.day_of_week === 1) ||
        db.working_hours.find(w => w.barbershop_id === shop.id && w.professional_id === prof.id);
      gravarHorariosProfissional(
        shop.id, prof.id,
        patch.start_time || (atual && atual.start_time) || '09:00',
        patch.end_time || (atual && atual.end_time) || '19:00',
        patch.lunch_start !== undefined ? patch.lunch_start : (atual ? atual.lunch_start : null),
        patch.lunch_end !== undefined ? patch.lunch_end : (atual ? atual.lunch_end : null)
      );
    }

    if (Array.isArray(patch.service_ids)) substituirVinculos(prof.id, patch.service_ids);

    DB.salvar();
    return prof;
  }

  /** Soft-delete preferível (UC-09.4): is_active = 0. */
  function desativarProfissional(id) {
    return atualizarProfissional(id, { is_active: false });
  }

  /* ================= HORÁRIOS DE FUNCIONAMENTO (RF-027..031, DT-09) ================= */

  function horariosDaLoja(shopId, apenasLoja) {
    return DB._d().working_hours
      .filter(w => w.barbershop_id == shopId && (!apenasLoja || w.professional_id == null))
      .sort((a, b) => (a.day_of_week - b.day_of_week) || ((a.professional_id || 0) - (b.professional_id || 0)));
  }

  /** Upsert POR DIA da loja (preserva horários dos profissionais — DT-09). */
  function salvarHorariosLoja(dias) {
    const { shop } = exigirDono();
    const db = DB._d();
    if (!Array.isArray(dias)) err(400, 'Envie a grade de horários.');

    dias.forEach(dia => {
      const dow = Number(dia.day_of_week);
      if (!(dow >= 0 && dow <= 6)) err(400, 'Dia da semana inválido.');
      const existente = db.working_hours.find(w =>
        w.barbershop_id === shop.id && w.professional_id == null && w.day_of_week === dow);
      const payload = {
        start_time: dia.start_time || '09:00',
        end_time: dia.end_time || '18:00',
        lunch_start: dia.lunch_start || null,
        lunch_end: dia.lunch_end || null,
        is_open: dia.is_open ? 1 : 0
      };
      if (payload.is_open && payload.lunch_start && payload.lunch_end &&
          payload.lunch_start >= payload.lunch_end) {
        payload.lunch_start = payload.lunch_end = null;
      }
      if (existente) Object.assign(existente, payload);
      else db.working_hours.push({
        id: DB.proximoId(), barbershop_id: shop.id,
        professional_id: null, day_of_week: dow, ...payload
      });
    });

    /* sincroniza flag de abertura nos profissionais para o mesmo dia */
    dias.forEach(dia => {
      const dow = Number(dia.day_of_week);
      const lojaAberta = dias.find(d => Number(d.day_of_week) === dow).is_open ? 1 : 0;
      db.working_hours.forEach(w => {
        if (w.barbershop_id === shop.id && w.professional_id != null && w.day_of_week === dow) {
          w.is_open = lojaAberta;
        }
      });
    });

    DB.salvar();
    return horariosDaLoja(shop.id, true);
  }

  function atualizarLinhaHorario(rowId, patch) {
    const { shop } = exigirDono();
    const w = DB._d().working_hours.find(x => x.id == rowId && x.barbershop_id === shop.id);
    if (!w) err(404, 'Linha de horário não encontrada.');
    ['start_time', 'end_time', 'lunch_start', 'lunch_end'].forEach(c => {
      if (patch[c] !== undefined) w[c] = patch[c] || null;
    });
    if (patch.is_open !== undefined) w.is_open = patch.is_open ? 1 : 0;
    DB.salvar();
    return w;
  }

  /* ---- exceções de agenda / folgas (RF-031 — GAP corrigido) ---- */

  function listarExcecoes() {
    const { shop } = exigirDono();
    return DB._d().schedule_exceptions.filter(x => x.barbershop_id === shop.id);
  }

  function criarExcecao(dados) {
    const { shop } = exigirDono();
    if (!dados.starts_at) err(400, 'Informe a data inicial da folga.');
    const exc = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      professional_id: dados.professional_id || null,
      type: dados.type === 'fechamento' ? 'fechamento' : 'folga',
      starts_at: dados.starts_at,
      ends_at: dados.ends_at || null,
      reason: String(dados.reason || '')
    };
    DB._d().schedule_exceptions.push(exc);
    DB.salvar();
    return exc;
  }

  function excluirExcecao(id) {
    const { shop } = exigirDono();
    const db = DB._d();
    const x = db.schedule_exceptions.find(e => e.id == id && e.barbershop_id === shop.id);
    if (!x) err(404, 'Exceção não encontrada.');
    db.schedule_exceptions = db.schedule_exceptions.filter(e => e.id != id);
    DB.salvar();
    return { ok: true };
  }

  /* ================= MOTOR DE DISPONIBILIDADE (RF-032..036) ================= */

  const STEP_MIN = 15;

  function periodosDeTrabalho(linhaWh) {
    if (!linhaWh || !linhaWh.is_open) return [];
    const ini = DB.hhmmToMin(linhaWh.start_time);
    const fim = DB.hhmmToMin(linhaWh.end_time);
    if (ini == null || fim == null || fim <= ini) return [];
    const lIni = linhaWh.lunch_start ? DB.hhmmToMin(linhaWh.lunch_start) : null;
    const lFim = linhaWh.lunch_end ? DB.hhmmToMin(linhaWh.lunch_end) : null;
    const temAlmoco = lIni != null && lFim != null && lIni < lFim;
    if (!temAlmoco) return [[ini, fim]];
    const periodos = [];
    if (ini < lIni) periodos.push([ini, lIni]);
    if (lFim < fim) periodos.push([lFim, fim]);
    return periodos;
  }

  function bloqueiosDoDia(db, shopId, profId, dataISO) {
    const prefixo = dataISO + 'T';
    const blocks = [];

    db.appointments.forEach(a => {
      if (a.barbershop_id != shopId) return;
      if (!a.starts_at.startsWith(prefixo)) return;
      if (a.status === 'cancelado' || a.status === 'nao_compareceu') return;
      if (profId != null) {
        if (a.professional_id != profId) return;   // conflito por profissional
      } else if (a.professional_id != null) {
        return;                                     // modo loja: só bloqueios "da casa"
      }
      blocks.push([
        DB.hhmmToMin(a.starts_at.slice(11)),
        DB.hhmmToMin(a.ends_at.slice(11))
      ]);
    });

    db.schedule_exceptions.forEach(x => {
      if (x.barbershop_id != shopId) return;
      if (x.professional_id != null && profId != null && x.professional_id != profId) return;
      if (profId == null && x.professional_id != null) return;
      const xIni = String(x.starts_at).slice(0, 10);
      const xFim = x.ends_at ? String(x.ends_at).slice(0, 10) : null;
      if (dataISO < xIni) return;
      if (xFim && dataISO > xFim) return;
      if (!xFim && dataISO > xIni) { blocks.push([0, 24 * 60]); return; } // folga sem fim
      const bIni = xIni === dataISO ? (DB.hhmmToMin(String(x.starts_at).slice(11)) || 0) : 0;
      const bFim = xFim === dataISO ? (DB.hhmmToMin(String(x.ends_at).slice(11)) ?? 24 * 60) : 24 * 60;
      blocks.push([bIni, bFim]);
    });

    return blocks;
  }

  function slotsLivres(periodos, durMin, bloqueios) {
    const out = new Set();
    periodos.forEach(([pIni, pFim]) => {
      for (let t = pIni; t + durMin <= pFim; t += STEP_MIN) {
        const conflita = bloqueios.some(([bIni, bFim]) => t < bFim && bIni < t + durMin);
        if (!conflita) out.add(DB.minToHHMM(t));
      }
    });
    return Array.from(out).sort();
  }

  /**
   * RF-032 — GET availability.
   * Retorna mapa per_professional + união ordenada.
   * Sem profissionais cadastrados: valida contra o expediente da LOJA
   * usando todos os agendamentos do dia como bloqueio (RF-036 / DT-03).
   */
  function disponibilidade(barbershopId, dateISO, durMin, professionalId) {
    const db = DB._d();
    const shop = db.barbershops.find(b => b.id == barbershopId);
    if (!shop) err(404, 'Salão não encontrado.');
    if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) err(400, 'Informe uma data válida (AAAA-MM-DD).');
    const dur = clampInt(durMin, 5, 600, 30);

    const dow = DB.diaSemana(dateISO);
    const linhaLoja = db.working_hours.find(w =>
      w.barbershop_id == shop.id && w.professional_id == null && w.day_of_week === dow);

    const respostaBase = {
      date: dateISO, duration_min: dur,
      is_open: !!(linhaLoja && linhaLoja.is_open),
      per_professional: [], union: [], available_slots: []
    };
    if (!respostaBase.is_open) return respostaBase;

    const periodosLoja = periodosDeTrabalho(linhaLoja);

    /* filtro "passou" para hoje (UX coerente) */
    const ehHoje = dateISO === DB.hojeISO();
    const agoraMin = DB.agoraMinutos();
    const passou = t => ehHoje && t <= agoraMin;

    let profsAtivos = db.professionals.filter(p => p.barbershop_id == shop.id && p.is_active);
    if (professionalId) profsAtivos = profsAtivos.filter(p => p.id == professionalId);

    if (profsAtivos.length === 0) {
      /* DT-03: valida contra a LOJA mesmo sem profissionais */
      const bloqueios = bloqueiosDoDia(db, shop.id, null, dateISO)
        .concat(db.appointments
          .filter(a => a.barbershop_id == shop.id && a.professional_id == null &&
            a.starts_at.startsWith(dateISO + 'T') &&
            a.status !== 'cancelado' && a.status !== 'nao_compareceu')
          .map(a => [DB.hhmmToMin(a.starts_at.slice(11)), DB.hhmmToMin(a.ends_at.slice(11))]));
      const slots = slotsLivres(periodosLoja, dur, bloqueios).filter(h => !passou(DB.hhmmToMin(h)));
      respostaBase.union = slots;
      respostaBase.available_slots = slots;
      respostaBase.shop_only = true;
      return respostaBase;
    }

    const uniaoSet = new Set();
    profsAtivos.forEach(p => {
      const linha = db.working_hours.find(w =>
        w.barbershop_id == shop.id && w.professional_id === p.id && w.day_of_week === dow);
      const periodos = (linha && linha.is_open) ? periodosDeTrabalho(linha) : [];
      if (!periodos.length) periodos.push(...periodosLoja); // fallback ao expediente da loja
      const slots = slotsLivres(periodos, dur, bloqueiosDoDia(db, shop.id, p.id, dateISO))
        .filter(h => !passou(DB.hhmmToMin(h)));
      respostaBase.per_professional.push({
        professional_id: p.id, professional_name: p.name, color: p.color, slots
      });
      slots.forEach(h => uniaoSet.add(h));
    });

    respostaBase.union = Array.from(uniaoSet).sort();
    respostaBase.available_slots = respostaBase.union;
    return respostaBase;
  }

  /** Dado um slot livre na união, escolhe o profissional que pode atendê-lo (DT-04). */
  function profissionalParaSlot(barbershopId, dateISO, hora, durMin) {
    const disp = disponibilidade(barbershopId, dateISO, durMin);
    const alvo = DB.hhmmToMin(hora);
    const aptos = disp.per_professional.filter(p =>
      p.slots.some(h => DB.hhmmToMin(h) === alvo));
    if (!aptos.length) return null;
    return { professional_id: aptos[0].professional_id, professional_name: aptos[0].professional_name };
  }

  /* ================= AGENDAMENTOS (RF-037..043, DT-07) ================= */

  const STATUS_VALIDOS = ['pendente', 'confirmado', 'concluido', 'nao_compareceu', 'cancelado'];

  function itensDoAgendamento(agId) {
    return DB._d().appointment_services
      .filter(i => i.appointment_id == agId)
      .map(i => ({
        service_id: i.service_id, name: i.name_snapshot,
        price: i.price_snapshot, duration_min: i.duration_snapshot
      }));
  }

  function agendamentoPublico(a) {
    const db = DB._d();
    const prof = a.professional_id ? db.professionals.find(p => p.id === a.professional_id) : null;
    const cliente = a.client_id ? db.clients.find(c => c.id === a.client_id) : null;
    const loja = db.barbershops.find(b => b.id === a.barbershop_id);
    return {
      id: a.id,
      barbershop_id: a.barbershop_id,
      barbershop_name: loja ? loja.name : '',
      client_id: a.client_id,
      client_name: a.client_name,
      client_phone: a.client_phone || '',
      client_email: a.client_email || '',
      professional_id: a.professional_id,
      professional_name: prof ? prof.name : null,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      date: a.starts_at.slice(0, 10),
      time: a.starts_at.slice(11),
      status: a.status,
      origin: a.origin,
      price_total: a.price_total,
      cancellation_reason: a.cancellation_reason || null,
      notes: a.notes || null,
      created_at: a.created_at,
      services: itensDoAgendamento(a.id),
      client_metrics: cliente
        ? { total_visits: cliente.total_visits, total_spent: cliente.total_spent }
        : null
    };
  }

  /**
   * Upsert de cliente por telefone → nome → usuário (RF-039.5).
   * Idempotente por telefone na mesma loja (RF-046).
   */
  function upsertCliente(shopId, dados, userId) {
    const db = DB._d();
    const tel = String(dados.client_phone || '').replace(/\D/g, '');
    let c = null;
    if (tel) c = db.clients.find(x => x.barbershop_id == shopId && x.phone === tel);
    if (!c && dados.client_name) {
      c = db.clients.find(x => x.barbershop_id == shopId &&
        x.name.toLowerCase().trim() === String(dados.client_name).toLowerCase().trim());
    }
    if (c) {
      c.name = c.name || dados.client_name;
      c.phone = tel || c.phone;
      c.email = dados.client_email || c.email;
      if (!c.user_id && userId) c.user_id = userId;
      return c;
    }
    c = {
      id: DB.proximoId(),
      barbershop_id: Number(shopId),
      name: dados.client_name,
      phone: tel,
      email: dados.client_email || '',
      notes: '',
      total_visits: 0, total_spent: 0, last_visit_at: null,
      user_id: userId || null,
      created_at: agoraLocal()
    };
    db.clients.push(c);
    return c;
  }

  /**
   * RF-039 — criação de agendamento.
   * Funciona anônimo (UC-14.7); usuário logado é vinculado quando existe.
   */
  function criarAgendamento(payload) {
    const db = DB._d();
    const user = Auth.usuarioAtual(); // opcional

    let shopId = payload.barbershop_id;
    let origin = payload.origin || 'online';
    if (!shopId && user && user.role === 'dono') {
      const loja = Auth.salaoDoUsuario(user);
      if (loja) { shopId = loja.id; origin = origin === 'online' ? 'admin' : origin; }
    }
    if (!shopId) err(400, 'Informe o salão do agendamento.');
    const shop = db.barbershops.find(b => b.id == shopId);
    if (!shop) err(404, 'Salão não encontrado.');

    const date = String(payload.date || '');
    const hora = String(payload.start_time || payload.hora || '');
    const clientName = String(payload.client_name || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(400, 'Data inválida.');
    if (!/^\d{2}:\d{2}$/.test(hora)) err(400, 'Horário inválido.');
    if (!clientName) err(400, 'Nome do cliente é obrigatório.');

    /* duração = soma dos serviços | informado | 30 (RF-039.2) */
    const idsServicos = Array.isArray(payload.service_ids) && payload.service_ids.length
      ? payload.service_ids.map(Number)
      : (payload.service_id ? [Number(payload.service_id)] : []);
    const svcs = idsServicos
      .map(id => db.services.find(s => s.id == id && s.barbershop_id == shop.id))
      .filter(Boolean);
    const durMin = svcs.length
      ? svcs.reduce((a, s) => a + s.duration_min, 0)
      : clampInt(payload.duration_min, 5, 600, 30);

    /* profissional informado ou primeiro ativo (RF-039.3) */
    let profId = payload.professional_id ? Number(payload.professional_id) : null;
    if (profId) {
      const p = db.professionals.find(p => p.id == profId && p.barbershop_id == shop.id && p.is_active);
      if (!p) profId = null;
    }
    if (!profId) {
      const primeiro = db.professionals.find(p => p.barbershop_id == shop.id && p.is_active);
      profId = primeiro ? primeiro.id : null;
    }

    const iniMin = DB.hhmmToMin(hora);
    const fimMin = iniMin + durMin;
    const startsAt = date + 'T' + hora;

    /* validação de conflito (RF-039.4) — contra profissional OU loja (DT-03) */
    const disponivel = verificarSlot(db, shop.id, profId, date, iniMin, durMin);
    if (!disponivel.ok) {
      const disp = disponibilidade(shop.id, date, durMin, profId);
      err(409, 'Conflito de horário para este profissional. Horários livres: ' +
        (disp.available_slots.join(', ') || 'nenhum neste dia.'));
    }

    const endsAt = date + 'T' + DB.minToHHMM(fimMin);

    /* preço vigente com override do profissional (RF-039.6) */
    const precoTotal = svcs.reduce((acc, s) => {
      const link = db.professional_services.find(ps =>
        ps.professional_id === profId && ps.service_id === s.id);
      return acc + ((link && link.price_override != null) ? link.price_override : s.price);
    }, 0);

    const ag = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      client_id: null,
      professional_id: profId,
      user_id: user ? user.id : null,
      client_name: clientName,
      client_phone: String(payload.client_phone || ''),
      client_email: String(payload.client_email || ''),
      starts_at: startsAt,
      ends_at: endsAt,
      status: STATUS_VALIDOS.includes(payload.status) ? payload.status : 'pendente',
      origin,
      price_total: precoTotal,
      cancellation_reason: null,
      notes: String(payload.notes || '') || null,
      created_at: agoraLocal()
    };
    db.appointments.push(ag);

    /* snapshot dos itens (imune a edições futuras do catálogo) */
    svcs.forEach(s => db.appointment_services.push({
      id: DB.proximoId(),
      appointment_id: ag.id,
      service_id: s.id,
      name_snapshot: s.name,
      price_snapshot: s.price,
      duration_snapshot: s.duration_min
    }));

    /* resolução de cliente */
    ag.client_id = upsertCliente(shop.id, {
      client_name: clientName,
      client_phone: ag.client_phone,
      client_email: ag.client_email
    }, user ? user.id : null).id;

    DB.salvar();

    /* notificações (UC-17 / RF-066) */
    const nomesSvc = svcs.map(s => s.name).join(' + ') || 'atendimento';
    notificar({
      user_id: user ? user.id : null,
      barbershop_id: shop.id,
      type: 'appointment_created',
      title: 'Agendamento solicitado',
      message: 'Seu pedido de ' + nomesSvc + ' na ' + shop.name +
        ' foi registrado para ' + DB.fmtDataBR(date) + ' às ' + hora + '.',
      extra: { appointment_id: ag.id }
    });
    if (shop.owner_user_id) {
      notificar({
        user_id: shop.owner_user_id,
        barbershop_id: shop.id,
        type: 'new_appointment',
        title: 'Novo agendamento',
        message: clientName + ' solicitou ' + nomesSvc + ' para ' +
          DB.fmtDataBR(date) + ' às ' + hora + '.',
        extra: { appointment_id: ag.id }
      });
    }

    return agendamentoPublico(ag);
  }

  function verificarSlot(db, shopId, profId, dateISO, iniMin, durMin) {
    const dow = DB.diaSemana(dateISO);

    let linha = null;
    if (profId != null) {
      linha = db.working_hours.find(w =>
        w.barbershop_id == shopId && w.professional_id === profId && w.day_of_week === dow);
      if (!linha || !linha.is_open) {
        linha = db.working_hours.find(w =>
          w.barbershop_id == shopId && w.professional_id == null && w.day_of_week === dow);
      }
    } else {
      linha = db.working_hours.find(w =>
        w.barbershop_id == shopId && w.professional_id == null && w.day_of_week === dow);
    }

    const cabe = periodosDeTrabalho(linha).some(([pi, pf]) => iniMin >= pi && iniMin + durMin <= pf);
    if (!cabe) return { ok: false, motivo: 'fora-do-expediente' };

    const ocupado = profId != null
      ? bloqueiosDoDia(db, shopId, profId, dateISO)
      : bloqueiosDoDia(db, shopId, null, dateISO)
        .concat(db.appointments
          .filter(a => a.barbershop_id == shopId && a.professional_id != null &&
            a.starts_at.startsWith(dateISO + 'T') &&
            a.status !== 'cancelado' && a.status !== 'nao_compareceu')
          .map(a => [DB.hhmmToMin(a.starts_at.slice(11)), DB.hhmmToMin(a.ends_at.slice(11))]));

    const conflita = ocupado.some(([bi, bf]) => iniMin < bf && bi < iniMin + durMin);
    return conflita ? { ok: false, motivo: 'conflito' } : { ok: true };
  }

  function listarAgendamentos(filtros) {
    filtros = filtros || {};
    const db = DB._d();
    let escopo;

    if (filtros.scope === 'me') {
      const user = sessao();
      escopo = db.appointments.filter(a => a.user_id === user.id);
    } else {
      const { shop } = exigirEquipe();
      escopo = db.appointments.filter(a => a.barbershop_id === shop.id);
    }

    if (filtros.date) escopo = escopo.filter(a => a.starts_at.startsWith(filtros.date));
    if (filtros.status) escopo = escopo.filter(a => a.status === filtros.status);
    if (filtros.professional_id) escopo = escopo.filter(a => a.professional_id == filtros.professional_id);
    if (filtros.client_id) escopo = escopo.filter(a => a.client_id == filtros.client_id);
    if (filtros.q) {
      const q = String(filtros.q).toLowerCase();
      escopo = escopo.filter(a => a.client_name.toLowerCase().includes(q));
    }
    if (filtros.de) escopo = escopo.filter(a => a.starts_at.slice(0, 10) >= filtros.de);
    if (filtros.ate) escopo = escopo.filter(a => a.starts_at.slice(0, 10) <= filtros.ate);

    const ordem = filtros.ordem === 'asc' ? 1 : -1;
    escopo.sort((a, b) => ordem * a.starts_at.localeCompare(b.starts_at));

    const limite = clampInt(filtros.limit, 1, 200, 200);
    const page = clampInt(filtros.page, 1, 99999, 1);
    const total = escopo.length;
    const items = escopo.slice((page - 1) * limite, page * limite).map(agendamentoPublico);
    return { items, total, page, limit: limite };
  }

  /**
   * RF-041 — PATCH parcial com autorização por papel e revalidação
   * de conflito (DT-07) + métricas do cliente ao concluir (RF-042).
   */
  function atualizarAgendamento(id, patch) {
    const user = sessao();
    const db = DB._d();
    const ag = db.appointments.find(a => a.id == id);
    if (!ag) err(404, 'Agendamento não encontrado.');

    const lojaAg = db.barbershops.find(b => b.id === ag.barbershop_id);
    const ehEquipe = !!lojaAg && (
      lojaAg.owner_user_id === user.id ||
      (user.role === 'barbeiro' && (Auth.salaoDoUsuario(user) || {}).id === lojaAg.id)
    );
    const ehCliente = ag.user_id === user.id;
    if (!ehEquipe && !ehCliente) err(403, 'Você não tem permissão sobre este agendamento.');

    /* cliente só cancela o próprio (RF-041) */
    if (!ehEquipe) {
      if (patch.status !== 'cancelado') err(403, 'Cliente só pode cancelar o próprio agendamento.');
      if (ag.status === 'concluido' || ag.status === 'cancelado') {
        err(400, 'Este agendamento já está ' + ag.status + ' e não pode ser cancelado.');
      }
    }

    /* enum de status válido (DT-07) */
    let novoStatus = ag.status;
    if (patch.status !== undefined) {
      if (!STATUS_VALIDOS.includes(patch.status)) {
        err(400, 'Status inválido. Use: ' + STATUS_VALIDOS.join(', ') + '.');
      }
      novoStatus = patch.status;
    }

    /* reagendamento: recalcula fim e revalida conflito (DT-07) */
    let novaData = ag.starts_at.slice(0, 10);
    let novaHora = ag.starts_at.slice(11);
    if (ehEquipe) {
      if (patch.date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) err(400, 'Data inválida.');
        novaData = patch.date;
      }
      if (patch.start_time || patch.hora) {
        novaHora = String(patch.start_time || patch.hora);
        if (!/^\d{2}:\d{2}$/.test(novaHora)) err(400, 'Horário inválido.');
      }
      if (patch.professional_id !== undefined) {
        const pid = patch.professional_id ? Number(patch.professional_id) : null;
        if (pid) {
          const p = db.professionals.find(x => x.id == pid && x.barbershop_id === ag.barbershop_id);
          if (!p) err(400, 'Profissional inválido para esta loja.');
        }
        ag.professional_id = pid;
      }
    }

    if (novaData !== ag.starts_at.slice(0, 10) || novaHora !== ag.starts_at.slice(11) ||
        patch.professional_id !== undefined) {
      const itens = itensDoAgendamento(ag.id);
      const dur = itens.length
        ? itens.reduce((a, i) => a + i.duration_min, 0)
        : clampInt(patch.duration_min, 5, 600, 30);
      const okSlot = verificarSlot(db, ag.barbershop_id, ag.professional_id, novaData,
        DB.hhmmToMin(novaHora), dur);
      if (!okSlot.ok) {
        const disp = disponibilidade(ag.barbershop_id, novaData, dur, ag.professional_id);
        err(409, 'Conflito de horário. Livres: ' + (disp.available_slots.join(', ') || 'nenhum neste dia.'));
      }
      ag.starts_at = novaData + 'T' + novaHora;
      ag.ends_at = novaData + 'T' + DB.minToHHMM(DB.hhmmToMin(novaHora) + dur);
    }

    const statusAnterior = ag.status;
    ag.status = novoStatus;

    if (ehEquipe) {
      if (patch.notes !== undefined) ag.notes = String(patch.notes || '') || null;
      if (patch.cancellation_reason !== undefined) {
        ag.cancellation_reason = String(patch.cancellation_reason || '') || null;
      }
    }

    /* RF-042: ao concluir, cria/atualiza cliente e incrementa métricas
       apenas se ainda não havia client_id (DT-11) */
    if (novoStatus === 'concluido' && statusAnterior !== 'concluido' && !ag.client_id) {
      const c = upsertCliente(ag.barbershop_id, {
        client_name: ag.client_name,
        client_phone: ag.client_phone,
        client_email: ag.client_email
      }, ag.user_id);
      ag.client_id = c.id;
      c.total_visits += 1;
      c.total_spent += Number(ag.price_total || 0);
      c.last_visit_at = ag.ends_at;
    }

    DB.salvar();

    /* notificação de mudança de status para o cliente (RF-066) */
    if (novoStatus !== statusAnterior && ag.user_id) {
      const rotulos = {
        pendente: 'pendente', confirmado: 'confirmado', concluido: 'concluído',
        nao_compareceu: 'marcado como não compareceu', cancelado: 'cancelado'
      };
      notificar({
        user_id: ag.user_id,
        barbershop_id: ag.barbershop_id,
        type: 'appointment_status',
        title: 'Agendamento ' + rotulos[novoStatus],
        message: 'Seu agendamento na ' + nomeLoja(ag.barbershop_id) +
          ' foi ' + rotulos[novoStatus] + '.',
        extra: { appointment_id: ag.id, old_status: statusAnterior, new_status: novoStatus }
      });
    }

    return agendamentoPublico(ag);
  }

  function excluirAgendamento(id) {
    const { shop } = exigirDono();
    const db = DB._d();
    const ag = db.appointments.find(a => a.id == id && a.barbershop_id === shop.id);
    if (!ag) err(404, 'Agendamento não encontrado.');
    db.appointment_services = db.appointment_services.filter(i => i.appointment_id != id);
    db.appointments = db.appointments.filter(a => a.id != id);
    DB.salvar();
    return { ok: true };
  }

  /* me/appointments — todas as lojas, mais recentes primeiro (RF-009) */
  function meusAgendamentos() {
    const user = sessao();
    return listarAgendamentos({ scope: 'me', ordem: 'desc', limit: 200 }).items
      .map(agendamentoPublico);
  }

  /* ================= CLIENTES / CRM (RF-044..047) ================= */

  function listarClientes(filtros) {
    filtros = filtros || {};
    const { shop } = exigirEquipe();
    let lista = DB._d().clients.filter(c => c.barbershop_id === shop.id);

    const q = String(filtros.q || '').toLowerCase().trim();
    if (q) lista = lista.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q.replace(/\D/g, '')));

    lista.sort((a, b) => a.name.localeCompare(b.name));

    const limite = clampInt(filtros.limit, 1, 200, 200);
    const page = clampInt(filtros.page, 1, 9999, 1);
    const total = lista.length;
    return {
      items: lista.slice((page - 1) * limite, page * limite).map(c => clientePublico(c)),
      total, page, limit: limite
    };
  }

  function clientePublico(c) {
    return {
      id: c.id, name: c.name, phone: c.phone || '', email: c.email || '',
      notes: c.notes || '', total_visits: c.total_visits,
      total_spent: c.total_spent, last_visit_at: c.last_visit_at,   // campo correto (DT-23)
      user_id: c.user_id || null, created_at: c.created_at
    };
  }

  function getCliente(id) {
    const { shop } = exigirEquipe();
    const c = DB._d().clients.find(x => x.id == id && x.barbershop_id === shop.id);
    if (!c) err(404, 'Cliente não encontrado.');
    return clientePublico(c);
  }

  function criarCliente(dados) {
    const { shop } = exigirDono();
    const nome = String(dados.name || '').trim();
    if (!nome) err(400, 'Nome é obrigatório.');
    const tel = String(dados.phone || '').replace(/\D/g, '');

    /* idempotente por telefone (RF-046) */
    if (tel) {
      const existe = DB._d().clients.find(c =>
        c.barbershop_id === shop.id && c.phone === tel);
      if (existe) return clientePublico(existe);
    }

    const c = {
      id: DB.proximoId(), barbershop_id: shop.id,
      name: nome, phone: tel, email: String(dados.email || ''),
      notes: String(dados.notes || ''), total_visits: 0, total_spent: 0,
      last_visit_at: null, user_id: null, created_at: agoraLocal()
    };
    DB._d().clients.push(c);
    DB.salvar();
    return clientePublico(c);
  }

  function atualizarCliente(id, patch) {
    const { shop } = exigirEquipe();
    const c = DB._d().clients.find(x => x.id == id && x.barbershop_id === shop.id);
    if (!c) err(404, 'Cliente não encontrado.');
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) err(400, 'Nome é obrigatório.');
      c.name = n;
    }
    if (patch.phone !== undefined) c.phone = String(patch.phone).replace(/\D/g, '');
    if (patch.email !== undefined) c.email = String(patch.email);
    if (patch.notes !== undefined) c.notes = String(patch.notes);
    DB.salvar();
    return clientePublico(c);
  }

  function agendamentosDoCliente(clienteId) {
    const { shop } = exigirEquipe();
    const db = DB._d();
    const c = db.clients.find(x => x.id == clienteId && x.barbershop_id === shop.id);
    if (!c) err(404, 'Cliente não encontrado.');
    return db.appointments
      .filter(a => a.client_id == clienteId)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .map(agendamentoPublico);
  }

  /* ================= DASHBOARD (RF-048..049) ================= */

  function janelaPeriodo(periodo) {
    const hoje = DB.hojeISO();
    switch (periodo) {
      case 'today': return { inicio: hoje, fim: hoje };
      case 'week': return { inicio: DB.addDiasISO(-6), fim: hoje };
      case 'year': return { inicio: DB.addDiasISO(-364), fim: hoje };
      case 'month':
      default: return { inicio: DB.addDiasISO(-29), fim: hoje };
    }
  }

  function dashboardStats(periodo) {
    const { shop } = exigirDono();
    const db = DB._d();
    const { inicio, fim } = janelaPeriodo(periodo);

    const noPeriodo = db.appointments.filter(a =>
      a.barbershop_id === shop.id &&
      a.starts_at.slice(0, 10) >= inicio && a.starts_at.slice(0, 10) <= fim);

    const concluidos = noPeriodo.filter(a => a.status === 'concluido');
    const receita = concluidos.reduce((acc, a) => acc + Number(a.price_total || 0), 0);
    const ticketMedio = concluidos.length ? receita / concluidos.length : 0;
    const taxaConclusao = noPeriodo.length
      ? Math.round(concluidos.length / noPeriodo.length * 1000) / 10
      : 0;

    /* clientes */
    const clientesTotal = db.clients.filter(c => c.barbershop_id === shop.id).length;
    const clientesNovos = db.clients.filter(c =>
      c.barbershop_id === shop.id &&
      (c.created_at || '').slice(0, 10) >= inicio &&
      (c.created_at || '').slice(0, 10) <= fim).length;

    /* top serviços (por aparições em concluídos) */
    const contagemSvc = {};
    concluidos.forEach(a => itensDoAgendamento(a.id).forEach(i => {
      if (!contagemSvc[i.name]) contagemSvc[i.name] = { name: i.name, count: 0, revenue: 0 };
      contagemSvc[i.name].count++;
      contagemSvc[i.name].revenue += i.price;
    }));
    const topServices = Object.values(contagemSvc)
      .sort((a, b) => b.count - a.count).slice(0, 5);

    /* top profissionais */
    const contagemProf = {};
    concluidos.forEach(a => {
      if (a.professional_id == null) return;
      const p = db.professionals.find(x => x.id === a.professional_id);
      const key = a.professional_id;
      if (!contagemProf[key]) contagemProf[key] = { name: p ? p.name : '—', count: 0, revenue: 0 };
      contagemProf[key].count++;
      contagemProf[key].revenue += Number(a.price_total || 0);
    });
    const topProfessionals = Object.values(contagemProf)
      .sort((a, b) => b.count - a.count).slice(0, 5);

    /* séries temporais */
    const serieDia = {};
    const d = DB.parseISO(inicio);
    while (true) {
      const iso = d.getFullYear() + '-' + DB.pad2(d.getMonth() + 1) + '-' + DB.pad2(d.getDate());
      if (iso > fim) break;
      serieDia[iso] = 0;
      d.setDate(d.getDate() + 1);
    }
    const serieHora = {};
    noPeriodo.forEach(a => {
      const dia = a.starts_at.slice(0, 10);
      const hora = a.starts_at.slice(11, 13) + ':00';
      if (serieDia[dia] !== undefined) serieDia[dia]++;
      serieHora[hora] = (serieHora[hora] || 0) + 1;
    });

    return {
      period: periodo || 'month', start_date: inicio, end_date: fim,
      summary: {
        appointments_total: noPeriodo.length,
        concluded: concluidos.length,
        cancelled: noPeriodo.filter(a => a.status === 'cancelado').length,
        no_show: noPeriodo.filter(a => a.status === 'nao_compareceu').length,
        pending: noPeriodo.filter(a => a.status === 'pendente').length,
        completion_rate_pct: taxaConclusao,
        revenue: Math.round(revenue(receita)),
        avg_ticket: Math.round(ticketMedio * 100) / 100
      },
      clients: { total: clientesTotal, novos_no_periodo: clientesNovos },
      top_services: topServices,
      top_professionals: topProfessionals,
      series_by_day: serieDia,
      series_by_hour: serieHora
    };
  }

  function revenue(v) { return v * 100 / 100; }

  /** RF-049 — CSV com BOM UTF-8 e escaping de aspas. */
  function exportarCSV(inicio, fim) {
    const { shop } = exigirDono();
    const db = DB._d();
    const linhas = db.appointments
      .filter(a => a.barbershop_id === shop.id &&
        a.starts_at.slice(0, 10) >= (inicio || '0000-00-00') &&
        a.starts_at.slice(0, 10) <= (fim || '9999-99-99'))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    function campo(v) {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    const cab = ['ID', 'Cliente', 'Telefone', 'Email', 'Data Início', 'Data Fim',
      'Status', 'Valor Total', 'Profissional', 'Serviços', 'Observações'];
    const corpo = linhas.map(a => {
      const prof = a.professional_id ? db.professionals.find(p => p.id === a.professional_id) : null;
      const svcs = itensDoAgendamento(a.id).map(i => i.name).join('; ');
      return [
        a.id, a.client_name, a.client_phone, a.client_email,
        a.starts_at, a.ends_at, a.status,
        Number(a.price_total).toFixed(2),
        prof ? prof.name : '', svcs, a.notes || ''
      ].map(campo).join(';');
    });

    return '\uFEFF' + cab.map(campo).join(';') + '\r\n' + corpo.join('\r\n');
  }

  /* ================= BUSCA PÚBLICA (RF-050..054) ================= */

  function buscar(params) {
    params = params || {};
    const db = DB._d();
    const tipo = params.type || 'all';
    const q = String(params.q || '').toLowerCase().trim();
    const cidade = params.city ? String(params.city).toLowerCase() : '';
    const uf = params.uf ? String(params.uf).toUpperCase() : '';
    const minRating = Number(params.min_rating) || 0;
    const sort = params.sort || 'relevance';
    const limite = clampInt(params.limit, 1, 100, 20);
    const page = clampInt(params.page, 1, 9999, 1);

    function passaFiltros(l) {
      if (cidade && (l.city || '').toLowerCase() !== cidade) return false;
      if (uf && (l.uf || '').toUpperCase() !== uf) return false;
      if (minRating && ratingDeLoja(l.id).media < minRating) return false;
      return true;
    }

    function enriquecer(l) {
      const pub = lojaPublica(l);
      pub.type = 'shop';
      return pub;
    }

    let resultados = [];

    if (tipo === 'all' || tipo === 'shops') {
      let shops = db.barbershops.filter(passaFiltros);
      if (q) {
        shops = shops.filter(l =>
          l.name.toLowerCase().includes(q) ||
          (l.description || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          (l.tags || []).some(t => t.toLowerCase().includes(q)));
      }
      resultados = resultados.concat(shops.map(enriquecer));
    }

    if (tipo === 'services') {
      const svcs = db.services.filter(s => s.active && q &&
        s.name.toLowerCase().includes(q));
      svcs.forEach(svc => {
        const l = db.barbershops.find(b => b.id === svc.barbershop_id);
        if (!l || !passaFiltros(l)) return;
        const pub = lojaPublica(l);
        pub.type = 'service';
        pub.matched_service = { id: svc.id, name: svc.name, price: svc.price };
        resultados.push(pub);
      });
    }

    if (tipo === 'professionals') {
      const pros = db.professionals.filter(p => p.is_active && q &&
        p.name.toLowerCase().includes(q));
      pros.forEach(p => {
        const l = db.barbershops.find(b => b.id === p.barbershop_id);
        if (!l || !passaFiltros(l)) return;
        const pub = lojaPublica(l);
        pub.type = 'professional';
        pub.matched_professional = { id: p.id, name: p.name, bio: p.bio };
        resultados.push(pub);
      });
    }

    /* dedup de lojas quando type=all */
    if (tipo === 'all') {
      const visto = new Set();
      resultados = resultados.filter(r =>
        !visto.has(r.id + ':' + r.type) && visto.add(r.id + ':' + r.type));
    }

    switch (sort) {
      case 'rating': resultados.sort((a, b) => b.rating_avg - a.rating_avg); break;
      case 'name': resultados.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'newest': resultados.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); break;
      default:
        resultados.sort((a, b) => {
          if (q) {
            const ai = a.name.toLowerCase().startsWith(q) ? 0 : 1;
            const bi = b.name.toLowerCase().startsWith(q) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          }
          return b.rating_avg - a.rating_avg;
        });
    }

    const total = resultados.length;
    const items = resultados.slice((page - 1) * limite, page * limite);
    return { items, total, page, limit: limite };
  }

  /** RF-054 — autocomplete (≥2 chars): até 5 lojas + 5 serviços. */
  function sugestoes(qBruto) {
    const q = String(qBruto || '').toLowerCase().trim();
    if (q.length < 2) return { suggestions: [] };
    const db = DB._d();
    const out = [];

    db.barbershops
      .filter(l => l.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 5)
      .forEach(l => out.push({ type: 'shop', text: l.name, sub: (l.city || '') + (l.uf ? ', ' + l.uf : '') }));

    db.services
      .filter(s => s.active && s.name.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach(s => {
        const l = db.barbershops.find(b => b.id === s.barbershop_id);
        if (l) out.push({ type: 'service', text: s.name, sub: l.name });
      });

    return { suggestions: out };
  }

  /* ================= AVALIAÇÕES (RF-055..056, DT-08) ================= */

  function reviewsDaLoja(shopId) {
    return DB._d().reviews
      .filter(r => r.barbershop_id == shopId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(r => ({
        id: r.id, client_name: r.client_name, rating: r.rating,
        comment: r.comment || '', created_at: r.created_at
      }));
  }

  function criarReview(shopId, dados) {
    const user = sessao(); // POST autenticado (corrige DT-08)
    const nota = parseInt(dados.rating, 10);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      err(400, 'Avaliação inválida: informe uma nota de 1 a 5.');
    }
    const loja = DB._d().barbershops.find(b => b.id == shopId);
    if (!loja) err(404, 'Salão não encontrado.');
    const r = {
      id: DB.proximoId(),
      barbershop_id: loja.id,
      client_id: null,
      user_id: user.id,
      client_name: user.name,
      rating: nota,
      comment: String(dados.comment || '').trim(),
      created_at: agoraLocal()
    };
    DB._d().reviews.push(r);
    DB.salvar();
    return r;
  }

  /* ================= ASSINATURAS E PLANOS (RF-057..061, DT-12) ================= */

  function listarPlanos() {
    return DB._d().plans
      .slice()
      .sort((a, b) => a.price_monthly - b.price_monthly)
      .map(p => ({ ...p }));
  }

  function assinaturaPublica(sub) {
    const db = DB._d();
    const plano = db.plans.find(p => p.id === sub.plan_id);
    const hoje = DB.hojeISO();
    return {
      id: sub.id,
      plan: plano ? { id: plano.id, name: plano.name, price_monthly: plano.price_monthly, max_professionals: plano.max_professionals, features: plano.features } : null,
      status: sub.status,
      trial_ends_at: sub.trial_ends_at,
      current_period_end: sub.current_period_end,
      on_trial: sub.status === 'trial' && sub.trial_ends_at >= hoje,
      days_left_in_trial: sub.trial_ends_at
        ? Math.max(0, Math.round((DB.parseISO(sub.trial_ends_at) - DB.parseISO(hoje)) / 86400000))
        : 0
    };
  }

  function minhaAssinatura() {
    const { shop } = exigirDono();
    const sub = DB._d().subscriptions.find(s => s.barbershop_id === shop.id);
    if (!sub) err(404, 'Nenhuma assinatura encontrada.');
    return assinaturaPublica(sub);
  }

  /**
   * RF-060 com regra explícita da v2 (DT-12):
   * troca dentro do trial MANTÉM o prazo original; fora dele vira ativa.
   */
  function trocarPlano(planId) {
    const { shop } = exigirDono();
    const db = DB._d();
    const plano = db.plans.find(p => p.id == planId);
    if (!plano) err(404, 'Plano não encontrado.');

    let sub = db.subscriptions.find(s => s.barbershop_id === shop.id);
    if (!sub) {
      sub = {
        id: DB.proximoId(), barbershop_id: shop.id, plan_id: plano.id,
        status: 'ativa', trial_ends_at: null,
        current_period_end: DB.addDiasISO(30),
        created_at: agoraISO(), updated_at: agoraISO()
      };
      db.subscriptions.push(sub);
    } else {
      sub.plan_id = plano.id;
      if (sub.status === 'trial' && sub.trial_ends_at >= DB.hojeISO()) {
        /* mantém trial original — sem loop infinito de graça */
      } else {
        sub.status = 'ativa';
        sub.current_period_end = DB.addDiasISO(30);
      }
      sub.updated_at = agoraISO();
    }
    DB.salvar();
    return assinaturaPublica(sub);
  }

  function cancelarAssinatura() {
    const { shop } = exigirDono();
    const sub = DB._d().subscriptions.find(s => s.barbershop_id === shop.id);
    if (!sub) err(404, 'Nenhuma assinatura encontrada.');
    sub.status = 'cancelada';
    sub.updated_at = agoraISO();
    DB.salvar();
    return assinaturaPublica(sub);
  }

  /* ================= UPLOADS E GALERIA (RF-062..065, RNF-11) ================= */

  /**
   * Reencoda imagem via canvas (mitiga arquivo malicioso) e comprime
   * até ~300KB (DECISÃO v2 do RF-063). Tipos: JPEG/PNG/WebP/GIF ≤ 5MB.
   */
  function processarImagem(file) {
    return new Promise((resolve, reject) => {
      const tiposOk = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!tiposOk.includes(file.type)) {
        return reject(err(400, 'Formato inválido. Use JPEG, PNG, WebP ou GIF.'));
      }
      if (file.size > 5 * 1024 * 1024) {
        return reject(err(400, 'Imagem muito grande (máx. 5MB).'));
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1000;
          let w = img.width, h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            const escala = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * escala); h = Math.round(h * escala);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          let qualidade = 0.82;
          let url = canvas.toDataURL('image/jpeg', qualidade);
          while (url.length > 300 * 1024 && qualidade > 0.45) {
            qualidade -= 0.08;
            url = canvas.toDataURL('image/jpeg', qualidade);
          }
          resolve(url);
        };
        img.onerror = () => reject(err(400, 'Não foi possível ler a imagem.'));
        img.src = ev.target.result;
      };
      reader.onerror = () => reject(err(400, 'Falha ao carregar o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  function definirLogo(dataUrl) {
    const { shop } = exigirDono();
    shop.logo_url = dataUrl;
    shop.updated_at = agoraISO();
    DB.salvar();
    localStorage.setItem('barbershop', JSON.stringify(shop));
    return { logo_url: shop.logo_url };
  }

  function definirCapa(dataUrl) {
    const { shop } = exigirDono();
    const db = DB._d();
    let galleryId = null;
    if (!shop.cover_url) {
      const g = {
        id: DB.proximoId(), barbershop_id: shop.id,
        url: dataUrl, sort_order: 0, created_at: agoraISO()
      };
      db.gallery_images.push(g);
      galleryId = g.id;
    }
    shop.cover_url = dataUrl;
    shop.updated_at = agoraISO();
    DB.salvar();
    localStorage.setItem('barbershop', JSON.stringify(shop));
    return { cover_url: shop.cover_url, gallery_image_id: galleryId };
  }

  function galeriaDaLoja(shopId) {
    return DB._d().gallery_images
      .filter(g => g.barbershop_id == shopId)
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
  }

  /** Escrita restrita ao dono — corrige DT-08. */
  function adicionarGaleria(dataUrls) {
    const { shop } = exigirDono();
    const db = DB._d();
    const criadas = (Array.isArray(dataUrls) ? dataUrls : [dataUrls]).map(url => {
      const g = {
        id: DB.proximoId(), barbershop_id: shop.id, url,
        sort_order: db.gallery_images.filter(g2 => g2.barbershop_id === shop.id).length,
        created_at: agoraISO()
      };
      db.gallery_images.push(g);
      return g;
    });
    DB.salvar();
    return criadas;
  }

  function removerGaleria(imageId) {
    const { shop } = exigirDono();
    const db = DB._d();
    const g = db.gallery_images.find(g2 => g2.id == imageId && g2.barbershop_id === shop.id);
    if (!g) err(404, 'Imagem não encontrada.');
    db.gallery_images = db.gallery_images.filter(g2 => g2.id != imageId);
    if (shop.logo_url === g.url) shop.logo_url = null;
    if (shop.cover_url === g.url) shop.cover_url = null;   // RF-064
    DB.salvar();
    localStorage.setItem('barbershop', JSON.stringify(shop));
    return { ok: true };
  }

  /* ================= NOTIFICAÇÕES (RF-066..068) ================= */

  function notificar(n) {
    const db = DB._d();
    if (!n.user_id) return;
    db.notifications.push({
      id: DB.proximoId(),
      barbershop_id: n.barbershop_id || null,
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: JSON.stringify(n.extra || {}),
      read: 0,
      created_at: agoraISO()
    });
  }

  function minhasNotificacoes(opts) {
    opts = opts || {};
    const user = sessao();
    const db = DB._d();
    let lista = db.notifications.filter(n => n.user_id === user.id);
    if (opts.unreadOnly) lista = lista.filter(n => !n.read);
    lista.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const limite = clampInt(opts.limit, 1, 100, 30);
    const page = clampInt(opts.page, 1, 9999, 1);
    return {
      items: lista.slice((page - 1) * limite, page * limite),
      unread: db.notifications.filter(n => n.user_id === user.id && !n.read).length
    };
  }

  function naoLidasCount() {
    const user = sessao();
    return DB._d().notifications.filter(n => n.user_id === user.id && !n.read).length;
  }

  function marcarNotificacaoLida(id) {
    const user = sessao();
    const n = DB._d().notifications.find(x => x.id == id && x.user_id === user.id);
    if (!n) err(404, 'Notificação não encontrada.');
    n.read = 1;
    DB.salvar();
    return { ok: true };
  }

  function marcarTodasLidas() {
    const user = sessao();
    DB._d().notifications.forEach(n => { if (n.user_id === user.id) n.read = 1; });
    DB.salvar();
    return { ok: true };
  }

  /**
   * RF-068 — lembretes calculados no load do painel:
   * varre agendamentos de amanhã ainda sem lembrete.
   */
  function gerarLembretesPendentes() {
    const { shop } = exigirDono();
    const db = DB._d();
    const amanha = DB.addDiasISO(1);
    let criados = 0;

    db.appointments
      .filter(a => a.barbershop_id === shop.id &&
        a.starts_at.startsWith(amanha + 'T') &&
        (a.status === 'pendente' || a.status === 'confirmado'))
      .forEach(a => {
        const jaTem = n => n.type === 'reminder' &&
          n.user_id === shop.owner_user_id &&
          String(n.data || '').includes('"appointment_id":' + a.id);
        if (!db.notifications.some(jaTem) && shop.owner_user_id) {
          notificar({
            user_id: shop.owner_user_id, barbershop_id: shop.id,
            type: 'reminder', title: 'Lembrete',
            message: 'Você tem um agendamento amanhã: ' + a.client_name +
              ' às ' + a.starts_at.slice(11) + '.',
            extra: { appointment_id: a.id }
          });
          criados++;
        }
        if (a.user_id) {
          const jaTemCli = n => n.type === 'reminder' && n.user_id === a.user_id &&
            String(n.data || '').includes('"appointment_id":' + a.id);
          if (!db.notifications.some(jaTemCli)) {
            notificar({
              user_id: a.user_id, barbershop_id: shop.id,
              type: 'reminder', title: 'Lembrete',
              message: 'Você tem um agendamento amanhã (' + nomeLoja(shop.id) +
                ') às ' + a.starts_at.slice(11) + '.',
              extra: { appointment_id: a.id }
            });
            criados++;
          }
        }
      });

    if (criados) DB.salvar();
    return { reminders_created: criados };
  }

  /* ================= ME (RF-007..010) ================= */

  function mePerfil() {
    const user = sessao();
    return { user: Auth.publicUser(user), barbershop: Auth.salaoDoUsuario(user) || null };
  }

  function atualizarMe(patch) {
    const user = sessao();
    const db = DB._d();
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) err(400, 'Nome é obrigatório.');
      user.name = n;
    }
    if (patch.email !== undefined) user.email = String(patch.email).trim();
    if (patch.phone !== undefined) {
      const tel = String(patch.phone).replace(/\D/g, '');
      if (tel.length < 10) err(400, 'Telefone inválido: mínimo de 10 dígitos.');
      const outro = db.users.find(u => u.phone === tel && u.id !== user.id);
      if (outro) err(409, 'Este telefone já está cadastrado.');
      user.phone = tel;
    }
    DB.salvar();
    localStorage.setItem('user', JSON.stringify(Auth.publicUser(user)));
    return Auth.publicUser(user);
  }

  function atualizarPreferencias(prefs) {
    const user = sessao();
    user.prefs = Object.assign({}, user.prefs || {}, prefs || {});
    DB.salvar();
    localStorage.setItem('user', JSON.stringify(Auth.publicUser(user)));
    return user.prefs;
  }

  /** RF-010 — exclusão de conta com cascata completa. */
  function excluirMinhaConta() {
    const user = sessao();
    const db = DB._d();

    if (user.role === 'dono') {
      deletarLojaCascade(Auth.salaoDoUsuario(user));
    }

    /* cancela agendamentos futuros do usuário como cliente */
    db.appointments.forEach(a => {
      if (a.user_id === user.id && a.starts_at >= agoraLocal() &&
          (a.status === 'pendente' || a.status === 'confirmado')) {
        a.status = 'cancelado';
        a.cancellation_reason = 'Conta do cliente excluída';
      }
    });

    db.sessions = db.sessions.filter(s => s.user_id !== user.id);
    db.notifications = db.notifications.filter(n => n.user_id !== user.id);
    db.favorites = db.favorites.filter(f => f.user_id !== user.id);
    db.users = db.users.filter(u => u.id !== user.id);

    DB.salvar();
    Auth.logout();
    return { ok: true };
  }

  /* ================= FAVORITOS (UC-15 · DECISÃO v2: implementar) ================= */

  function alternarFavorito(shopId) {
    const user = sessao();
    const db = DB._d();
    if (!db.barbershops.some(b => b.id == shopId)) err(404, 'Salão não encontrado.');
    const existente = db.favorites.find(f => f.user_id === user.id && f.barbershop_id == shopId);
    if (existente) {
      db.favorites = db.favorites.filter(f => f.id !== existente.id);
      DB.salvar();
      return { favorito: false };
    }
    db.favorites.push({
      id: DB.proximoId(), user_id: user.id,
      barbershop_id: Number(shopId), created_at: agoraISO()
    });
    DB.salvar();
    return { favorito: true };
  }

  function meusFavoritos() {
    const user = sessao();
    const db = DB._d();
    return db.favorites
      .filter(f => f.user_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(f => {
        const l = db.barbershops.find(b => b.id === f.barbershop_id);
        return l ? lojaPublica(l) : null;
      })
      .filter(Boolean);
  }

  /* ================= SUPORTE (página extra mantida) ================= */

  function criarTicket(salaoId, assunto, mensagem) {
    const user = sessao();
    const t = {
      id: DB.proximoId(),
      salaoId: Number(salaoId),
      assunto: assunto || 'Outro',
      mensagem: (mensagem || '').trim(),
      status: 'aberto',
      criadoEm: DB.hojeISO()
    };
    DB._d().tickets.push(t);
    DB.salvar();
    return t;
  }

  function ticketsDoSalao(salaoId) {
    return DB._d().tickets.filter(t => t.salaoId == salaoId).slice().reverse();
  }

  function nomeLoja(id) {
    const l = DB._d().barbershops.find(b => b.id == id);
    return l ? l.name : '';
  }

  /* Catálogo público: serviços ativos (alimenta filtros do catálogo). */
  function servicosPublicos() {
    return DB._d().services.filter(s => s.active)
      .map(s => ({ id: s.id, name: s.name }));
  }

  /* Avaliações do usuário logado (contador do perfil). */
  function minhasReviews() {
    const user = sessao();
    return DB._d().reviews.filter(r => r.user_id === user.id);
  }

  /* ================= API pública ================= */

  return {
    err,

    // lojas
    listarLojasPublicas, getLoja, minhaLoja, atualizarLoja, excluirLoja,
    lojasProximas, ratingDeLoja, lojaPublica,

    // serviços
    servicosDaLoja, criarServico, atualizarServico, excluirServico, servicosPublicos,

    // profissionais
    profissionaisDaLoja, criarProfissional, atualizarProfissional,
    desativarProfissional, precoEfetivo,

    // horários
    horariosDaLoja, salvarHorariosLoja, atualizarLinhaHorario,
    listarExcecoes, criarExcecao, excluirExcecao,

    // disponibilidade
    disponibilidade, profissionalParaSlot,

    // agendamentos
    criarAgendamento, listarAgendamentos, atualizarAgendamento,
    excluirAgendamento, meusAgendamentos, agendamentoPublico,
    getAgendamento: id => {
      const a = DB._d().appointments.find(x => x.id == id);
      return a ? agendamentoPublico(a) : err(404, 'Agendamento não encontrado.');
    },

    // clientes
    listarClientes, getCliente, criarCliente, atualizarCliente, agendamentosDoCliente,

    // dashboard
    dashboardStats, exportarCSV,

    // busca
    buscar, sugestoes,

    // reviews
    reviewsDaLoja, criarReview, minhasReviews,

    // assinatura
    listarPlanos, minhaAssinatura, trocarPlano, cancelarAssinatura,

    // uploads / galeria
    processarImagem, definirLogo, definirCapa,
    galeriaDaLoja, adicionarGaleria, removerGaleria,

    // notificações
    minhasNotificacoes, naoLidasCount, marcarNotificacaoLida,
    marcarTodasLidas, gerarLembretesPendentes,

    // me
    mePerfil, atualizarMe, atualizarPreferencias, excluirMinhaConta,

    // favoritos
    alternarFavorito, meusFavoritos,

    // suporte
    criarTicket, ticketsDoSalao
  };
})();
