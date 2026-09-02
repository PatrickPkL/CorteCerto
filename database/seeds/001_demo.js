'use strict';
/* ============================================================
   Corte Certo – seeds/001_demo.js
   Seed de demonstração: planos e dados demo
   (6 salões SEM usuário vinculado, serviços, profissionais,
   horários, clientes, agendamentos, avaliações, assinaturas).
   Sem usuários: ninguém loga como dono demo; contas reais vem do SMS.

   Usa UUIDs determinísticos para referências cruzadas consistentes.
   Roda como superuser (knexfile) — imune ao RLS.
   ============================================================ */

const crypt = require('../../backend/crypt');

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

/* ---------- helpers de data (timezone America/Sao_Paulo) ---------- */
function pad2(n) { return String(n).padStart(2, '0'); }
function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function addDiasISO(n, base) {
  const d = base ? new Date(base + 'T12:00:00') : new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function agoraISO() { return new Date().toISOString().slice(0, 16); }
function fmtDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d + '/' + m + '/' + y;
}

exports.seed = async function (knex) {
  // ---------- plans ----------
  const plans = [
    { id: uuid(4), name: 'Free', price_monthly: 0, price_per_employee: 0, max_professionals: 0, features: ['Painel somente leitura', 'Perfil da loja', 'Upgrade a qualquer momento'], permissions: [], is_free: true, active: true },
    { id: uuid(1), name: 'Autonomo', price_monthly: 9.90, price_per_employee: 0, max_professionals: 1, features: ['1 profissional', 'Link de agendamento', 'Relatório básico'], permissions: ['servicos', 'profissionais', 'clientes', 'agendar', 'horarios', 'galeria'], active: true },
    { id: uuid(2), name: 'Salao', price_monthly: 19.90, price_per_employee: 10, max_professionals: 10, features: ['Até 10 profissionais', 'Multi-funcionário', 'Resumo financeiro'], permissions: ['servicos', 'profissionais', 'clientes', 'agendar', 'horarios', 'galeria', 'relatorios', 'notificacoes'], active: true },
    { id: uuid(3), name: 'Salao Pro', price_monthly: 26.90, price_per_employee: 0, max_professionals: null, features: ['Tudo do Salão', 'Profissionais ilimitados', 'Relatórios avançados'], permissions: ['servicos', 'profissionais', 'clientes', 'agendar', 'horarios', 'galeria', 'relatorios', 'notificacoes', 'exportar_csv'], active: true }
  ];

  // ---------- users (dados sensíveis cifrados) ----------
  const mkUser = (id, role, name, email, phone, verified, created) => {
    function tele(v) { return String(v || '').replace(/\D/g, ''); }
    return {
      id: uuid(id), role, name,
      email: crypt.criptografar(email || ''),
      email_hash: crypt.hashSHA256((email || '').toLowerCase()),
      phone: crypt.criptografar(tele(phone)),
      phone_hash: crypt.hashSHA256(tele(phone)),
      verified,
      prefs: { notif_email: 'sim', notif_sms: 'não', lembrete: '30' },
      consentimentos: [
        { tipo: 'privacidade', data: created, versao: '1.0', origem: 'seed' }
      ],
      created_at: created
    };
  };

  const D = addDiasISO;
  const hoje = hojeISO();
  /* Sem usuários demo desde 28/08/2026: ninguém pode logar como dono
     solto na plataforma. Os salões seguem no catálogo público sem dono
     vinculado (owner_user_id null). Usuários reais entram pelo SMS. */
  const users = [];

  // ---------- barbershops ----------
  const barbershops = [
    { id: uuid(1), owner_user_id: null, name: 'Barbearia São Jorge', description: 'Tradição e precisão em cortes clássicos e modernos.', slug: 'barbearia-sao-jorge', phone: '(71) 3212-4455', whatsapp: '7132124455', email: 'contato@saolojorge.com', instagram: '@saolojorge.barber', address: 'Rua das Flores, 120', city: 'Salvador', uf: 'BA', lat: -12.9714, lng: -38.5014, logo_url: null, cover_url: null, tags: ['Corte', 'Barba', 'Corte + Barba'], rating_base: 4.8, rating_count_base: 132, created_at: D(-400) + 'T09:00', updated_at: D(-10) + 'T09:00' },
    { id: uuid(2), owner_user_id: null, name: 'Studio Nova Era', description: 'Coloração e tratamentos capilares especializados.', slug: 'studio-nova-era', phone: '(71) 3344-1020', whatsapp: '', email: '', instagram: '', address: 'Av. Oceânica, 800', city: 'Salvador', uf: 'BA', lat: -13.0101, lng: -38.4985, logo_url: null, cover_url: null, tags: ['Corte', 'Coloração', 'Hidratação'], rating_base: 4.6, rating_count_base: 98, created_at: D(-300) + 'T10:00', updated_at: D(-20) + 'T10:00' },
    { id: uuid(3), owner_user_id: null, name: 'Barbearia do Zé', description: 'Barbearia de bairro com atendimento de qualidade.', slug: 'barbearia-do-ze', phone: '(75) 3612-7788', whatsapp: '', email: '', instagram: '', address: 'Rua Barão do Rio Branco, 55', city: 'Feira de Santana', uf: 'BA', lat: -12.2664, lng: -38.9663, logo_url: null, cover_url: null, tags: ['Corte', 'Barba', 'Sobrancelha'], rating_base: 4.9, rating_count_base: 210, created_at: D(-350) + 'T08:00', updated_at: D(-15) + 'T08:00' },
    { id: uuid(4), owner_user_id: null, name: 'Espaço Bela Vista', description: 'Beleza e bem-estar para todos os estilos.', slug: 'espaco-bela-vista', phone: '(71) 3621-3030', whatsapp: '', email: '', instagram: '', address: 'Praça Desembargador Hugo Gomes, 12', city: 'Camaçari', uf: 'BA', lat: -12.6976, lng: -38.3229, logo_url: null, cover_url: null, tags: ['Coloração', 'Corte'], rating_base: 4.5, rating_count_base: 76, created_at: D(-250) + 'T09:00', updated_at: D(-25) + 'T09:00' },
    { id: uuid(5), owner_user_id: null, name: 'Barber Class', description: 'Experiência premium em barbearia.', slug: 'barber-class', phone: '(71) 3025-5050', whatsapp: '', email: '', instagram: '', address: 'Rua Chile, 40', city: 'Salvador', uf: 'BA', lat: -12.9277, lng: -38.5098, logo_url: null, cover_url: null, tags: ['Corte + Barba', 'Barba'], rating_base: 4.7, rating_count_base: 88, created_at: D(-200) + 'T10:00', updated_at: D(-18) + 'T10:00' },
    { id: uuid(6), owner_user_id: null, name: 'Trato Fino Barbearia', description: 'Seu estilo, nosso compromisso.', slug: 'trato-fino-barbearia', phone: '(71) 3411-9090', whatsapp: '', email: '', instagram: '', address: 'Av. Tancredo Neves, 1283', city: 'Salvador', uf: 'BA', lat: -12.9787, lng: -38.4586, logo_url: null, cover_url: null, tags: ['Corte', 'Barba'], rating_base: 4.4, rating_count_base: 54, created_at: D(-150) + 'T09:00', updated_at: D(-12) + 'T09:00' }
  ];

  // ---------- services ----------
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
    id: uuid(100 + i),
    barbershop_id: uuid(s[0]),
    name: s[1],
    category: s[1].includes('Barba') ? 'Barba' : 'Cabelo',
    description: '',
    duration_min: s[2],
    price: s[3],
    active: !(s[0] === 1 && s[1] === 'Coloração'),
    sort_order: s[4],
    created_at: D(-100) + 'T09:00'
  }));
  const svcId = (shop, nome) => {
    const s = services.find(x => x.barbershop_id === uuid(shop) && x.name === nome);
    return s ? s.id : null;
  };

  // ---------- professionals ----------
  const profDefs = [
    [1, 11, 'Marcos Silva', '#b8863b', 'Barbeiro · dono', '7132124455', null],
    [1, 12, 'Bianca Rocha', '#4c7a5e', 'Colorista', '', null],
    [1, 13, 'Tiago Andrade', '#a1433c', 'Barbeiro', '', null],
    [2, 21, 'Carla Mendes', '#3b82f6', 'Hair stylist', '', null],
    [3, 31, 'Zé Carlos', '#b8863b', 'Barbeiro · dono', '', null],
    [4, 41, 'Rita Vieira', '#4c7a5e', 'Colorista', '', null],
    [5, 51, 'Duda Prado', '#3b82f6', 'Barbeira', '', null],
    [6, 61, 'Nando Lima', '#b8863b', 'Barbeiro', '', null]
  ];
  const professionals = profDefs.map(p => ({
    id: uuid(p[1]),
    barbershop_id: uuid(p[0]),
    name: p[2], color: p[3], bio: p[4], phone: p[5],
    user_id: p[6] ? uuid(p[6]) : null,
    is_active: true,
    created_at: D(-90) + 'T09:00'
  }));

  // ---------- professional_services ----------
  const profServices = [
    [11, 1, 'Corte', null], [11, 1, 'Barba', null], [11, 1, 'Corte + Barba', 60],
    [12, 1, 'Coloração', null], [13, 1, 'Corte', 40], [13, 1, 'Barba', null],
    [21, 2, 'Corte Feminino', null], [21, 2, 'Hidratação', null],
    [31, 3, 'Corte', null], [31, 3, 'Barba', null],
    [41, 4, 'Coloração', null],
    [51, 5, 'Corte + Barba', null],
    [61, 6, 'Corte', null], [61, 6, 'Barba', null]
  ];
  const professional_services = profServices
    .filter(([prof, shop, nome]) => svcId(shop, nome))
    .map(([prof, shop, nome, override]) => ({
      professional_id: uuid(prof),
      service_id: svcId(shop, nome),
      price_override: override
    }));

  // ---------- working_hours ----------
  const working_hours = [];
  function wh(shop, prof, dow, ini, fim, lIni, lFim, aberto) {
    working_hours.push({
      id: uuid(working_hours.length + 5000),
      barbershop_id: uuid(shop),
      professional_id: prof ? uuid(prof) : null,
      day_of_week: dow,
      start_time: ini, end_time: fim,
      lunch_start: lIni, lunch_end: lFim,
      is_open: aberto
    });
  }
  for (let dow = 1; dow <= 5; dow++) wh(1, null, dow, '09:00', '19:00', '12:00', '13:00', true);
  wh(1, null, 6, '09:00', '14:00', null, null, true);
  wh(1, null, 0, '10:00', '15:00', null, null, false);
  [1, 2, 3, 4, 5].forEach(dow => wh(1, 11, dow, '09:00', '19:00', '12:00', '13:00', true));
  wh(1, 11, 6, '09:00', '14:00', null, null, true);
  [2, 3, 4, 5, 6].forEach(dow => wh(1, 12, dow, '10:00', '18:00', '12:00', '13:00', true));
  [3, 4, 5, 6].forEach(dow => wh(1, 13, dow, '12:00', '19:00', null, null, true));
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
          (dow >= 1 && dow <= 5) ? '12:00' : null, (dow >= 1 && dow <= 5) ? '13:00' : null, true);
      }
    });
  });
  for (let shop = 2; shop <= 6; shop++) {
    if (!working_hours.some(w => w.barbershop_id === uuid(shop) && w.day_of_week === 0)) {
      wh(shop, null, 0, '09:00', '18:00', null, null, false);
    }
  }

  // ---------- schedule_exceptions ----------
  const schedule_exceptions = [
    { id: uuid(1), barbershop_id: uuid(1), professional_id: uuid(12), type: 'folga', starts_at: D(3) + 'T00:00', ends_at: D(4) + 'T23:59', reason: 'Folga programada' }
  ];

  // ---------- clients ----------
  const clients = [
    { id: uuid(201), barbershop_id: uuid(1), name: 'João Silva', phone: '71991234455', email: 'joao@email.com', notes: 'Prefere degradê baixo.', total_visits: 3, total_spent: 175, last_visit_at: D(-21) + 'T11:30', user_id: null, created_at: D(-180) + 'T10:00' },
    { id: uuid(202), barbershop_id: uuid(1), name: 'João Pedro', phone: '71998881122', email: '', notes: '', total_visits: 1, total_spent: 65, last_visit_at: D(-40) + 'T09:30', user_id: null, created_at: D(-40) + 'T09:00' },
    { id: uuid(203), barbershop_id: uuid(1), name: 'Ana Souza', phone: '71988772211', email: '', notes: 'Alergia a amônia.', total_visits: 1, total_spent: 90, last_visit_at: D(-60) + 'T15:00', user_id: null, created_at: D(-60) + 'T14:00' },
    { id: uuid(204), barbershop_id: uuid(1), name: 'Carlos Dias', phone: '71996540099', email: '', notes: '', total_visits: 2, total_spent: 60, last_visit_at: D(-30) + 'T14:20', user_id: null, created_at: D(-70) + 'T10:00' },
    { id: uuid(205), barbershop_id: uuid(1), name: 'Pedro Alves', phone: '71985554433', email: '', notes: '', total_visits: 1, total_spent: 30, last_visit_at: D(-45) + 'T13:50', user_id: null, created_at: D(-45) + 'T13:00' },
    { id: uuid(206), barbershop_id: uuid(1), name: 'Rafael Lima', phone: '71997775566', email: '', notes: '', total_visits: 1, total_spent: 45, last_visit_at: D(-35) + 'T10:45', user_id: null, created_at: D(-35) + 'T10:00' },
    { id: uuid(207), barbershop_id: uuid(1), name: 'Otávio Reis', phone: '71993217788', email: '', notes: '', total_visits: 0, total_spent: 0, last_visit_at: null, user_id: null, created_at: D(-5) + 'T11:00' }
  ];

  // ---------- reviews ----------
  const reviews = [
    { id: uuid(301), barbershop_id: uuid(1), user_id: null, rating: 5, comment: 'Melhor barbearia da região, atendimento impecável!', created_at: D(-20) + 'T18:00' },
    { id: uuid(302), barbershop_id: uuid(1), user_id: null, rating: 4, comment: 'Ótimo corte, só demorou um pouco.', created_at: D(-40) + 'T12:00' },
    { id: uuid(303), barbershop_id: uuid(1), user_id: null, rating: 5, comment: '', created_at: D(-29) + 'T16:00' },
    { id: uuid(304), barbershop_id: uuid(2), user_id: null, rating: 5, comment: 'Amei a coloração!', created_at: D(-30) + 'T17:00' },
    { id: uuid(305), barbershop_id: uuid(2), user_id: null, rating: 4, comment: '', created_at: D(-50) + 'T11:00' },
    { id: uuid(306), barbershop_id: uuid(3), user_id: null, rating: 5, comment: 'Zé é o melhor barbeiro de Feira.', created_at: D(-25) + 'T10:00' },
    { id: uuid(307), barbershop_id: uuid(3), user_id: null, rating: 5, comment: '', created_at: D(-48) + 'T15:00' },
    { id: uuid(308), barbershop_id: uuid(4), user_id: null, rating: 4, comment: 'Bom atendimento.', created_at: D(-35) + 'T14:00' },
    { id: uuid(309), barbershop_id: uuid(5), user_id: null, rating: 5, comment: 'Ambiente premium, vale cada centavo.', created_at: D(-22) + 'T19:00' },
    { id: uuid(310), barbershop_id: uuid(6), user_id: null, rating: 4, comment: '', created_at: D(-42) + 'T13:00' }
  ];

  // ---------- subscriptions ----------
  const subscriptions = [
    { id: uuid(401), barbershop_id: uuid(1), plan_id: uuid(2), status: 'trial', trial_ends_at: D(7), current_period_end: D(7), created_at: D(-400) + 'T09:00', updated_at: D(-400) + 'T09:00' }
  ];
  for (let shop = 2; shop <= 6; shop++) {
    subscriptions.push({
      id: uuid(400 + shop), barbershop_id: uuid(shop),
      plan_id: uuid((shop % 3) + 1),
      status: 'ativa', trial_ends_at: D(-320), current_period_end: D(15),
      created_at: D(-330) + 'T09:00', updated_at: D(-30) + 'T09:00'
    });
  }

  // ---------- appointments + appointment_services ----------
  const appointments = [];
  const appointment_services = [];
  function hhmmToMin(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; }
  function minToHHMM(t) { return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }
  function ag(opts) {
    const svcList = opts.services.map(n => {
      const s = services.find(x => x.barbershop_id === uuid(opts.shop) && x.name === n);
      return { service_id: s.id, name_snapshot: s.name, price_snapshot: s.price, duration_snapshot: s.duration_min };
    });
    const durTotal = svcList.reduce((a, s) => a + s.duration_snapshot, 0);
    const cliente = clients.find(c => c.id === uuid(opts.clienteId));
    const id = uuid(appointments.length + 1001);
    const iniMin = hhmmToMin(opts.hora);
    appointments.push({
      id,
      barbershop_id: uuid(opts.shop),
      client_id: cliente ? cliente.id : null,
      professional_id: opts.prof ? uuid(opts.prof) : null,
      user_id: opts.user_id ? uuid(opts.user_id) : null,
      client_name: cliente ? cliente.name : opts.nome,
      client_phone: cliente ? cliente.phone : (opts.tel || ''),
      client_email: cliente ? cliente.email : '',
      starts_at: opts.data + 'T' + opts.hora,
      ends_at: opts.data + 'T' + minToHHMM(iniMin + durTotal),
      status: opts.status,
      origin: opts.origin || 'online',
      price_total: svcList.reduce((a, s) => a + s.price_snapshot, 0),
      cancellation_reason: opts.motivo || null,
      notes: opts.notas || null,
      created_at: (opts.criadoEm || opts.data) + 'T08:00'
    });
    svcList.forEach(svc => {
      appointment_services.push({
        id: uuid(6000 + appointment_services.length + 1),
        appointment_id: id,
        service_id: svc.service_id,
        name_snapshot: svc.name_snapshot,
        price_snapshot: svc.price_snapshot,
        duration_snapshot: svc.duration_snapshot
      });
    });
  }

  ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte + Barba'], data: hoje, hora: '09:00', status: 'confirmado', criadoEm: D(-3), origin: 'admin' });
  ag({ shop: 1, clienteId: 203, prof: 12, services: ['Coloração'], data: hoje, hora: '11:15', status: 'pendente' });
  ag({ shop: 1, clienteId: 204, prof: 11, services: ['Barba'], data: hoje, hora: '14:00', status: 'confirmado', origin: 'admin' });
  ag({ shop: 1, clienteId: 207, prof: 12, services: ['Corte'], data: hoje, hora: '15:40', status: 'cancelado', motivo: 'Cliente desistiu' });
  ag({ shop: 1, clienteId: 201, prof: 11, services: ['Corte + Barba'], data: D(2), hora: '10:30', status: 'confirmado', criadoEm: D(-1) });
  ag({ shop: 1, clienteId: 201, prof: 13, services: ['Corte'], data: D(6), hora: '16:00', status: 'pendente' });
  ag({ shop: 1, clienteId: 206, prof: 11, services: ['Corte'], data: D(-1), hora: '10:30', status: 'concluido' });
  ag({ shop: 1, clienteId: 201, prof: 11, services: ['Corte + Barba'], data: D(-7), hora: '09:00', status: 'concluido' });
  ag({ shop: 1, clienteId: 205, prof: 13, services: ['Barba'], data: D(-10), hora: '13:30', status: 'concluido' });
  ag({ shop: 1, clienteId: 204, prof: 11, services: ['Barba'], data: D(-30), hora: '14:20', status: 'concluido' });
  ag({ shop: 1, clienteId: 203, prof: 12, services: ['Coloração'], data: D(-60), hora: '15:00', status: 'concluido' });
  ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte'], data: D(-35), hora: '11:00', status: 'concluido' });
  ag({ shop: 1, clienteId: 202, prof: 11, services: ['Corte + Barba'], data: D(-21), hora: '10:30', status: 'concluido' });

  // ---------- notifications ----------
  const notifications = [
    { id: uuid(501), barbershop_id: uuid(1), user_id: null, type: 'new_appointment', title: 'Novo agendamento', message: 'Ana Souza solicitou Coloração para ' + fmtDataBR(hoje) + ' às 11:15.', read: false, created_at: agoraISO() },
    { id: uuid(502), barbershop_id: null, user_id: null, type: 'appointment_status', title: 'Agendamento confirmado', message: 'Seu agendamento na Barbearia São Jorge foi confirmado.', read: false, created_at: agoraISO() }
  ];

  // ---------- grava tudo ----------
  await knex('superadmin_sessions').del();
  await knex('notifications').del();
  await knex('audit_log').del();
  await knex('appointment_services').del();
  await knex('appointments').del();
  await knex('reviews').del();
  await knex('subscriptions').del();
  await knex('payments').del();
  await knex('plans').del();
  await knex('plans').insert(plans);
  await knex('clients').del();
  await knex('schedule_exceptions').del();
  await knex('working_hours').del();
  await knex('professional_services').del();
  await knex('professionals').del();
  await knex('services').del();
  await knex('barbershops').del();
  await knex('users').del();

  if (users.length) await knex('users').insert(users);
  await knex('barbershops').insert(barbershops);
  await knex('services').insert(services);
  await knex('professionals').insert(professionals);
  await knex('professional_services').insert(professional_services);
  await knex('working_hours').insert(working_hours);
  await knex('schedule_exceptions').insert(schedule_exceptions);
  await knex('clients').insert(clients);
  await knex('reviews').insert(reviews);
  await knex('subscriptions').insert(subscriptions);
  await knex('appointments').insert(appointments);
  await knex('appointment_services').insert(appointment_services);
  await knex('notifications').insert(notifications);
};
