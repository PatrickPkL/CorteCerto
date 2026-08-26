/* ============================================================
   Corte Certo – db.js  (PRD v2 · Seção 5 / Seção 7)
   Persistência client-side versionada em localStorage.
   Única fonte de verdade do esquema (mata DT-01).
   Carregado ANTES de auth.js, local-api.js, shared.js e páginas.
   ============================================================ */

window.DB = (function () {
  'use strict';

  const DB_KEY = 'cc_db';
  const DB_VERSION = 5;

  /* ---------------- helpers de data (hora local, mata DT-11) ---------------- */

  function pad2(n) { return String(n).padStart(2, '0'); }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function agoraMinutos() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function addDiasISO(n, base) {
    const d = base ? parseISO(base) : new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function diaSemana(iso) { return parseISO(iso).getDay(); } // 0=Dom..6=Sáb

  function hhmmToMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  }

  function minToHHMM(t) { return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }

  function fmtDataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return d + '/' + m + '/' + y;
  }

  function fmtBRL(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  function iniciais(nome) {
    return (nome || '?').trim().split(/\s+/).slice(0, 2)
      .map(p => p[0].toUpperCase()).join('');
  }

  /* ---------------- estado ---------------- */

  let db;

  function nextId() { db.meta.seq += 1; save(); return db.meta.seq; }

  function save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('[DB] Falha ao gravar localStorage (quota?):', e);
      throw { status: 500, error: 'Armazenamento local cheio. Remova fotos antigas e tente novamente.' };
    }
  }

  function migrar(p) {
    /* v1/v2: garante campos básicos (não sabemos o esquema exato — preserva o que existe) */
    if (p.v <= 2) {
      if (!p.professionals) p.professionals = [];
      if (!p.services)     p.services = [];
      p.v = 3;
    }
    /* v3 → v4: cobranças dos planos (AbacatePay) */
    if (p.v === 3) {
      p.v = 4;
      p.payments = Array.isArray(p.payments) ? p.payments : [];
    }
    /* v4 → v5: magic tokens */
    if (p.v === 4) {
      p.v = 5;
      p.magic_tokens = Array.isArray(p.magic_tokens) ? p.magic_tokens : [];
      p.superadmin_sessions = Array.isArray(p.superadmin_sessions) ? p.superadmin_sessions : [];
    }
    try { localStorage.setItem(DB_KEY, JSON.stringify(p)); }
    catch (e) { console.error('[DB] Falha ao persistir migração.', e); }
    return p;
  }

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        let parsed = JSON.parse(raw);
        /* recupera arquivo com encoding duplo (bug antigo do store) */
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
        }
        if (parsed && parsed.meta) {
          /* aplica migrações encadeadas até atingir a versão atual */
          while (parsed.v !== undefined && parsed.v < DB_VERSION) {
            parsed = migrar(parsed);
          }
          if (parsed.v === DB_VERSION) return parsed;
        }
      }
    } catch (e) { console.warn('[DB] Estado corrompido — recriando dados demo.', e); }
    const fresh = seed();
    try { localStorage.setItem(DB_KEY, JSON.stringify(fresh)); }
    catch (e) { console.error('[DB] Quota excedida no seed.', e); }
    return fresh;
  }

  /* RNF-22: purge de sessões expiradas no load */
  function purgeSessoes() {
    const agora = new Date().toISOString();
    const antes = db.sessions.length;
    db.sessions = db.sessions.filter(s => s.expires_at > agora);
    if (db.sessions.length !== antes) save();
  }

  function purgeCodigosSMS() {
    const antes = db.sms_codes.length;
    db.sms_codes = db.sms_codes.filter(c => !c.used);
    if (db.sms_codes.length !== antes) save();
  }

  function reset() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('barbershop');
    localStorage.removeItem(DB_KEY);
    db = load();
  }

  /* ============================================================
     SEED DE DEMONSTRAÇÃO (RF-071)
     Lojas: São Jorge, Nova Era, Zé, Bela Vista, Barber Class, Trato Fino
     ============================================================ */

  function seed() {
    const D = addDiasISO;
    const hoje = hojeISO();
    const agoraISO = () => new Date().toISOString().slice(0, 16);

    const planos = [
      {
        id: 1, name: 'Autonomo', price_monthly: 19.90, price_per_employee: 0,
        max_professionals: 1,
        features: ['1 profissional', 'Link de agendamento', 'Relatório básico']
      },
      {
        id: 2, name: 'Salao', price_monthly: 29.90, price_per_employee: 10,
        max_professionals: 10,
        features: ['Até 10 profissionais', 'Multi-funcionário', 'Resumo financeiro']
      },
      {
        id: 3, name: 'Salao Pro', price_monthly: 59.90, price_per_employee: 0,
        max_professionals: null,
        features: ['Tudo do Salão', 'Profissionais ilimitados', 'Relatórios avançados']
      }
    ];

    const usuarios = [
      {
        id: 1, role: 'dono', name: 'Marcos Silva', email: 'marcos@saolojorge.com',
        phone: '7132124455', verified: 1, created_at: D(-400) + 'T09:00'
      },
      {
        id: 2, role: 'cliente', name: 'João Silva', email: 'joao@email.com',
        phone: '71991234455', verified: 1, created_at: D(-180) + 'T14:30',
        prefs: { notif_email: 'sim', notif_sms: 'não', lembrete: '30' }
      }
    ];

    /* ---- lojas ---- */
    const barbershops = [
      {
        id: 1, owner_user_id: 1, name: 'Barbearia São Jorge',
        description: 'Tradição e precisão em cortes clássicos e modernos.',
        slug: 'barbearia-sao-jorge', phone: '(71) 3212-4455', whatsapp: '7132124455',
        email: 'contato@saolojorge.com', instagram: '@saolojorge.barber',
        address: 'Rua das Flores, 120', city: 'Salvador', uf: 'BA',
        lat: -12.9714, lng: -38.5014, logo_url: null, cover_url: null,
        tags: ['Corte', 'Barba', 'Corte + Barba'],
        ratingBase: 4.8, ratingCountBase: 132,
        created_at: D(-400) + 'T09:00', updated_at: D(-10) + 'T09:00'
      },
      {
        id: 2, owner_user_id: null, name: 'Studio Nova Era',
        description: 'Coloração e tratamentos capilares especializados.',
        slug: 'studio-nova-era', phone: '(71) 3344-1020', whatsapp: '',
        email: '', instagram: '',
        address: 'Av. Oceânica, 800', city: 'Salvador', uf: 'BA',
        lat: -13.0101, lng: -38.4985, logo_url: null, cover_url: null,
        tags: ['Corte', 'Coloração', 'Hidratação'],
        ratingBase: 4.6, ratingCountBase: 98,
        created_at: D(-300) + 'T10:00', updated_at: D(-20) + 'T10:00'
      },
      {
        id: 3, owner_user_id: null, name: 'Barbearia do Zé',
        description: 'Barbearia de bairro com atendimento de qualidade.',
        slug: 'barbearia-do-ze', phone: '(75) 3612-7788', whatsapp: '',
        email: '', instagram: '',
        address: 'Rua Barão do Rio Branco, 55', city: 'Feira de Santana', uf: 'BA',
        lat: -12.2664, lng: -38.9663, logo_url: null, cover_url: null,
        tags: ['Corte', 'Barba', 'Sobrancelha'],
        ratingBase: 4.9, ratingCountBase: 210,
        created_at: D(-350) + 'T08:00', updated_at: D(-15) + 'T08:00'
      },
      {
        id: 4, owner_user_id: null, name: 'Espaço Bela Vista',
        description: 'Beleza e bem-estar para todos os estilos.',
        slug: 'espaco-bela-vista', phone: '(71) 3621-3030', whatsapp: '',
        email: '', instagram: '',
        address: 'Praça Desembargador Hugo Gomes, 12', city: 'Camaçari', uf: 'BA',
        lat: -12.6976, lng: -38.3229, logo_url: null, cover_url: null,
        tags: ['Coloração', 'Corte'],
        ratingBase: 4.5, ratingCountBase: 76,
        created_at: D(-250) + 'T09:00', updated_at: D(-25) + 'T09:00'
      },
      {
        id: 5, owner_user_id: null, name: 'Barber Class',
        description: 'Experiência premium em barbearia.',
        slug: 'barber-class', phone: '(71) 3025-5050', whatsapp: '',
        email: '', instagram: '',
        address: 'Rua Chile, 40', city: 'Salvador', uf: 'BA',
        lat: -12.9277, lng: -38.5098, logo_url: null, cover_url: null,
        tags: ['Corte + Barba', 'Barba'],
        ratingBase: 4.7, ratingCountBase: 88,
        created_at: D(-200) + 'T10:00', updated_at: D(-18) + 'T10:00'
      },
      {
        id: 6, owner_user_id: null, name: 'Trato Fino Barbearia',
        description: 'Seu estilo, nosso compromisso.',
        slug: 'trato-fino-barbearia', phone: '(71) 3411-9090', whatsapp: '',
        email: '', instagram: '',
        address: 'Av. Tancredo Neves, 1283', city: 'Salvador', uf: 'BA',
        lat: -12.9787, lng: -38.4586, logo_url: null, cover_url: null,
        tags: ['Corte', 'Barba'],
        ratingBase: 4.4, ratingCountBase: 54,
        created_at: D(-150) + 'T09:00', updated_at: D(-12) + 'T09:00'
      }
    ];

    /* ---- serviços (duration_min 5–480, price ≥0, active, sort_order) ---- */
    const svcDefs = [
      [1, 'Corte', 30, 45, 1], [1, 'Barba', 20, 30, 2], [1, 'Corte + Barba', 45, 65, 3],
      [1, 'Pezinho', 15, 20, 4], [1, 'Coloração', 60, 90, 5],
      [2, 'Corte Feminino', 45, 70, 1], [2, 'Coloração', 60, 120, 2], [2, 'Hidratação', 40, 80, 3],
      [3, 'Corte', 30, 35, 1], [3, 'Barba', 20, 25, 2], [3, 'Sobrancelha', 15, 15, 3],
      [4, 'Coloração', 90, 130, 1], [4, 'Corte', 45, 60, 2],
      [5, 'Corte + Barba', 50, 75, 1], [5, 'Barba', 25, 35, 2],
      [6, 'Corte', 30, 40, 1], [6, 'Barba', 20, 28, 2]
    ];
    const services = svcDefs.map((s, i) => ({
      id: 100 + i,
      barbershop_id: s[0], name: s[1], category: s[1].includes('Barba') ? 'Barba' : 'Cabelo',
      description: '', duration_min: s[2], price: s[3],
      active: !(s[0] === 1 && s[1] === 'Coloração') ? 1 : 0,
      sort_order: s[4], created_at: D(-100) + 'T09:00'
    }));
    const svcId = (shop, nome) =>
      services.find(s => s.barbershop_id === shop && s.name === nome).id;

    /* ---- profissionais ---- */
    const profDefs = [
      [1, 11, 'Marcos Silva', '#b8863b', 'Barbeiro · dono', '7132124455'],
      [1, 12, 'Bianca Rocha', '#4c7a5e', 'Colorista', ''],
      [1, 13, 'Tiago Andrade', '#a1433c', 'Barbeiro', ''],
      [2, 21, 'Carla Mendes', '#3b82f6', 'Hair stylist', ''],
      [3, 31, 'Zé Carlos', '#b8863b', 'Barbeiro · dono', ''],
      [4, 41, 'Rita Vieira', '#4c7a5e', 'Colorista', ''],
      [5, 51, 'Duda Prado', '#3b82f6', 'Barbeira', ''],
      [6, 61, 'Nando Lima', '#b8863b', 'Barbeiro', '']
    ];
    const professionals = profDefs.map(p => ({
      id: p[1], barbershop_id: p[0], name: p[2], color: p[3], bio: p[4],
      phone: p[5], is_active: 1, created_at: D(-90) + 'T09:00'
    }));

    /* vínculo N:N com override de preço */
    const professionalServices = [
      { professional_id: 11, service_id: svcId(1, 'Corte'), price_override: null },
      { professional_id: 11, service_id: svcId(1, 'Barba'), price_override: null },
      { professional_id: 11, service_id: svcId(1, 'Corte + Barba'), price_override: 60 },
      { professional_id: 12, service_id: svcId(1, 'Coloração'), price_override: null },
      { professional_id: 13, service_id: svcId(1, 'Corte'), price_override: 40 },
      { professional_id: 13, service_id: svcId(1, 'Barba'), price_override: null },
      { professional_id: 21, service_id: svcId(2, 'Corte Feminino'), price_override: null },
      { professional_id: 21, service_id: svcId(2, 'Hidratação'), price_override: null },
      { professional_id: 31, service_id: svcId(3, 'Corte'), price_override: null },
      { professional_id: 31, service_id: svcId(3, 'Barba'), price_override: null },
      { professional_id: 41, service_id: svcId(4, 'Coloração'), price_override: null },
      { professional_id: 51, service_id: svcId(5, 'Corte + Barba'), price_override: null },
      { professional_id: 61, service_id: svcId(6, 'Corte'), price_override: null },
      { professional_id: 61, service_id: svcId(6, 'Barba'), price_override: null }
    ];

    /* ---- horários de funcionamento (loja: professional_id null) ---- */
    const workingHours = [];
    let whId = 1;
    function wh(shop, prof, dow, ini, fim, lIni, lFim, aberto) {
      workingHours.push({
        id: whId++, barbershop_id: shop, professional_id: prof, day_of_week: dow,
        start_time: ini, end_time: fim, lunch_start: lIni, lunch_end: lFim,
        is_open: aberto
      });
    }
    /* loja 1: seg–sex 09–19 (almoço 12–13), sáb 09–14, dom fechada */
    for (let dow = 1; dow <= 5; dow++) wh(1, null, dow, '09:00', '19:00', '12:00', '13:00', 1);
    wh(1, null, 6, '09:00', '14:00', null, null, 1);
    wh(1, null, 0, '10:00', '15:00', null, null, 0);
    /* profissionais da loja 1 (subconjunto dos dias, preservando expediente da loja) */
    [1, 2, 3, 4, 5].forEach(dow => wh(1, 11, dow, '09:00', '19:00', '12:00', '13:00', 1));
    wh(1, 11, 6, '09:00', '14:00', null, null, 1);
    [2, 3, 4, 5, 6].forEach(dow => wh(1, 12, dow, '10:00', '18:00', '12:00', '13:00', 1));
    [3, 4, 5, 6].forEach(dow => wh(1, 13, dow, '12:00', '19:00', null, null, 1));
    /* demais lojas: só linhas da loja */
    const grades = {
      2: [[1, 5, '09:00', '18:00'], [6, '09:00', '16:00']],
      3: [[1, 5, '08:00', '18:00'], [6, '08:00', '14:00'], [0, '08:00', '12:00']],
      4: [[1, 5, '09:00', '18:00'], [6, '09:00', '13:00']],
      5: [[1, 4, '10:00', '20:00'], [5, '10:00', '22:00'], [6, '09:00', '18:00']],
      6: [[1, 5, '09:00', '19:00'], [6, '09:00', '15:00']]
    };
    Object.keys(grades).forEach(shopId => {
      const g = grades[shopId];
      g.forEach(([iniDow, fimDow, ini, fim]) => {
        const endDow = typeof fimDow === 'string' ? iniDow : fimDow;
        const hFim = typeof fimDow === 'string' ? fimDow : fim;
        const hIni = typeof fimDow === 'string' ? ini : ini;
        for (let dow = typeof fimDow === 'string' ? iniDow : iniDow; dow <= endDow; dow++) {
          wh(Number(shopId), null, dow, hIni, hFim,
            (dow >= 1 && dow <= 5) ? '12:00' : null, (dow >= 1 && dow <= 5) ? '13:00' : null, 1);
        }
      });
    });
    /* domingo das lojas 2..6 fechado */
    for (let shop = 2; shop <= 6; shop++) {
      if (!workingHours.some(w => w.barbershop_id === shop && w.day_of_week === 0)) {
        wh(shop, null, 0, '09:00', '18:00', null, null, 0);
      }
    }

    /* ---- exceções de agenda (folgas demo) ---- */
    const exceptions = [
      {
        id: 1, barbershop_id: 1, professional_id: 12, type: 'folga',
        starts_at: D(3) + 'T00:00', ends_at: D(4) + 'T23:59', reason: 'Folga programada'
      }
    ];

    /* ---- clientes (CRM com métricas RF-044) ---- */
    const clients = [
      { id: 201, barbershop_id: 1, name: 'João Silva', phone: '71991234455', email: 'joao@email.com', notes: 'Prefere degradê baixo.', total_visits: 3, total_spent: 175, last_visit_at: D(-21) + 'T11:30', user_id: 2, created_at: D(-180) + 'T10:00' },
      { id: 202, barbershop_id: 1, name: 'João Pedro', phone: '71998881122', email: '', notes: '', total_visits: 1, total_spent: 65, last_visit_at: D(-40) + 'T09:30', user_id: null, created_at: D(-40) + 'T09:00' },
      { id: 203, barbershop_id: 1, name: 'Ana Souza', phone: '71988772211', email: '', notes: 'Alergia a amônia.', total_visits: 1, total_spent: 90, last_visit_at: D(-60) + 'T15:00', user_id: null, created_at: D(-60) + 'T14:00' },
      { id: 204, barbershop_id: 1, name: 'Carlos Dias', phone: '71996540099', email: '', notes: '', total_visits: 2, total_spent: 60, last_visit_at: D(-30) + 'T14:20', user_id: null, created_at: D(-70) + 'T10:00' },
      { id: 205, barbershop_id: 1, name: 'Pedro Alves', phone: '71985554433', email: '', notes: '', total_visits: 1, total_spent: 30, last_visit_at: D(-45) + 'T13:50', user_id: null, created_at: D(-45) + 'T13:00' },
      { id: 206, barbershop_id: 1, name: 'Rafael Lima', phone: '71997775566', email: '', notes: '', total_visits: 1, total_spent: 45, last_visit_at: D(-35) + 'T10:45', user_id: null, created_at: D(-35) + 'T10:00' },
      { id: 207, barbershop_id: 1, name: 'Otávio Reis', phone: '71993217788', email: '', notes: '', total_visits: 0, total_spent: 0, last_visit_at: null, user_id: null, created_at: D(-5) + 'T11:00' }
    ];

    /* ---- agendamentos (starts_at/ends_at locais "YYYY-MM-DDTHH:MM") ---- */
    const appointments = [];
    const appointmentServices = [];
    let agSeq = 1000;
    function ag(opts) {
      const svcList = opts.services.map(n => {
        const s = services.find(x => x.barbershop_id === opts.shop && x.name === n);
        return { service_id: s.id, name_snapshot: s.name, price_snapshot: s.price, duration_snapshot: s.duration_min };
      });
      const durTotal = svcList.reduce((a, s) => a + s.duration_snapshot, 0);
      const precoTotal = svcList.reduce((a, s) => a + s.price_snapshot, 0);
      const cliente = clients.find(c => c.id === opts.clienteId);
      appointments.push({
        id: ++agSeq,
        barbershop_id: opts.shop,
        client_id: opts.clienteId || null,
        professional_id: opts.prof || null,
        user_id: opts.user_id || (cliente && cliente.user_id) || null,
        client_name: cliente ? cliente.name : opts.nome,
        client_phone: cliente ? cliente.phone : (opts.tel || ''),
        client_email: cliente ? cliente.email : '',
        starts_at: opts.data + 'T' + opts.hora,
        ends_at: opts.data + 'T' + minToHHMM(hhmmToMin(opts.hora) + durTotal),
        status: opts.status,
        origin: opts.origin || 'online',
        price_total: precoTotal,
        cancellation_reason: opts.motivo || null,
        notes: opts.notas || null,
        created_at: (opts.criadoEm || opts.data) + 'T08:00'
      });
      svcList.forEach(svc => appointmentServices.push({
        id: appointmentServices.length + 1,
        appointment_id: agSeq, ...svc
      }));
    }

    /* hoje */
    ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte + Barba'], data: hoje, hora: '09:00', status: 'confirmado', criadoEm: D(-3), origin: 'admin' });
    ag({ shop: 1, clienteId: 203, prof: 12, services: ['Coloração'], data: hoje, hora: '11:15', status: 'pendente' });
    ag({ shop: 1, clienteId: 204, prof: 11, services: ['Barba'], data: hoje, hora: '14:00', status: 'confirmado', origin: 'admin' });
    ag({ shop: 1, clienteId: 207, prof: 12, services: ['Corte'], data: hoje, hora: '15:40', status: 'cancelado', motivo: 'Cliente desistiu' });
    /* futuros do cliente demo */
    ag({ shop: 1, clienteId: 201, prof: 11, services: ['Corte + Barba'], data: D(2), hora: '10:30', status: 'confirmado', criadoEm: D(-1) });
    ag({ shop: 1, clienteId: 201, prof: 13, services: ['Corte'], data: D(6), hora: '16:00', status: 'pendente' });
    /* passados (histórico + métricas) */
    ag({ shop: 1, clienteId: 206, prof: 11, services: ['Corte'], data: D(-1), hora: '10:30', status: 'concluido' });
    ag({ shop: 1, clienteId: 201, prof: 11, services: ['Corte + Barba'], data: D(-7), hora: '09:00', status: 'concluido' });
    ag({ shop: 1, clienteId: 205, prof: 13, services: ['Barba'], data: D(-10), hora: '13:30', status: 'nao_compareceu' });
    ag({ shop: 1, clienteId: 204, prof: 11, services: ['Barba'], data: D(-30), hora: '14:20', status: 'concluido' });
    ag({ shop: 1, clienteId: 203, prof: 12, services: ['Coloração'], data: D(-60), hora: '15:00', status: 'concluido' });
    ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte'], data: D(-35), hora: '11:00', status: 'concluido' });
    ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte + Barba'], data: D(-21), hora: '10:30', status: 'concluido' });

    /* ---- avaliações (RF-055/056) ---- */
    const reviews = [
      { id: 301, barbershop_id: 1, client_id: 201, user_id: 2, client_name: 'João Silva', rating: 5, comment: 'Melhor barbearia da região, atendimento impecável!', created_at: D(-20) + 'T18:00' },
      { id: 302, barbershop_id: 1, client_name: 'Ana Souza', rating: 4, comment: 'Ótimo corte, só demorou um pouco.', created_at: D(-40) + 'T12:00' },
      { id: 303, barbershop_id: 1, client_name: 'Carlos Dias', rating: 5, comment: '', created_at: D(-29) + 'T16:00' },
      { id: 304, barbershop_id: 2, client_name: 'Mariana P.', rating: 5, comment: 'Amei a coloração!', created_at: D(-30) + 'T17:00' },
      { id: 305, barbershop_id: 2, client_name: 'Luiza T.', rating: 4, comment: '', created_at: D(-50) + 'T11:00' },
      { id: 306, barbershop_id: 3, client_name: 'Felipe M.', rating: 5, comment: 'Zé é o melhor barbeiro de Feira.', created_at: D(-25) + 'T10:00' },
      { id: 307, barbershop_id: 3, client_name: 'Diego S.', rating: 5, comment: '', created_at: D(-48) + 'T15:00' },
      { id: 308, barbershop_id: 4, client_name: 'Paula R.', rating: 4, comment: 'Bom atendimento.', created_at: D(-35) + 'T14:00' },
      { id: 309, barbershop_id: 5, client_name: 'Bruno C.', rating: 5, comment: 'Ambiente premium, vale cada centavo.', created_at: D(-22) + 'T19:00' },
      { id: 310, barbershop_id: 6, client_name: 'Igor N.', rating: 4, comment: '', created_at: D(-42) + 'T13:00' }
    ];

    /* ---- assinaturas (RF-058): loja 1 em trial do plano Salao ---- */
    const subscriptions = [
      {
        id: 401, barbershop_id: 1, plan_id: 2, status: 'trial',
        trial_ends_at: D(7), current_period_end: D(7),
        created_at: D(-400) + 'T09:00', updated_at: D(-400) + 'T09:00'
      }
    ];
    for (let shop = 2; shop <= 6; shop++) {
      subscriptions.push({
        id: 400 + shop, barbershop_id: shop, plan_id: (shop % 3) + 1,
        status: 'ativa', trial_ends_at: D(-320), current_period_end: D(15),
        created_at: D(-330) + 'T09:00', updated_at: D(-30) + 'T09:00'
      });
    }

    /* ---- galeria ---- */
    const galleryImages = [];

    /* ---- cobranças dos planos (AbacatePay) ---- */
    const payments = [];

    /* ---- notificações demo ---- */
    const notifications = [
      {
        id: 501, barbershop_id: 1, user_id: 1, type: 'new_appointment',
        title: 'Novo agendamento',
        message: 'Ana Souza solicitou Coloração para ' + fmtDataBR(hoje) + ' às 11:15.',
        data: '{}', read: 0, created_at: agoraISO()
      },
      {
        id: 502, barbershop_id: null, user_id: 2, type: 'appointment_status',
        title: 'Agendamento confirmado',
        message: 'Seu agendamento na Barbearia São Jorge foi confirmado.',
        data: '{}', read: 0, created_at: agoraISO()
      }
    ];

    const favorites = [];
    const sms_codes = [];
    const sessions = [];
    const tickets = [];
    const magic_tokens = [];
    const superadmin_sessions = [];

    return {
      v: DB_VERSION,
      meta: { seq: 2000 },
      users: usuarios,
      sessions,
      sms_codes,
      barbershops,
      services,
      professionals,
      professional_services: professionalServices,
      working_hours: workingHours,
      schedule_exceptions: exceptions,
      clients,
      appointments,
      appointment_services: appointmentServices,
      reviews,
      plans: planos,
      subscriptions,
      payments,
      gallery_images: galleryImages,
      notifications,
      favorites,
      magic_tokens,
      superadmin_sessions,
      tickets
    };
  }

  db = load();
  purgeSessoes();
  purgeCodigosSMS();

  /* ---------------- API pública ---------------- */

  return {
    _d: () => db,
    salvar: save,
    proximoId: nextId,
    reset,

    // datas/horas
    hojeISO, addDiasISO, parseISO, diaSemana, agoraMinutos,
    hhmmToMin, minToHHMM, pad2,
    fmtDataBR, fmtBRL, iniciais
  };
})();
