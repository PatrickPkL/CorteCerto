/* ============================================================
   Corte Certo – public/js/perfil.js
   Perfil do cliente: estatísticas reais, próximos/histórico,
   favoritos (UC-15), avaliações (RF-056) e configurações.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin('cliente');
  if (!usuario) return;

  /* sincroniza com o servidor antes de renderizar: o cache do navegador
     pode estar defasado (causa de "salvei mas ao recarregar voltou o antigo") */
  try {
    const fresco = API.mePerfil().user;
    if (fresco && fresco.id === usuario.id) {
      Object.assign(usuario, fresco);
      Auth.sincronizarUsuario(usuario);
    }
  } catch (e) { /* sessão inválida: segue com o cache */ }

  /* ---------- abas ---------- */
  const tabsPerfil = document.querySelectorAll('.profile-tab');
  const conteudosPerfil = document.querySelectorAll('.profile-tab-content');
  tabsPerfil.forEach(tab => {
    tab.addEventListener('click', () => {
      tabsPerfil.forEach(t => t.classList.remove('active'));
      conteudosPerfil.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
      if (tab.dataset.tab === 'favoritos') renderFavoritos();
    });
  });

  /* ---------- cabeçalho ---------- */
  const avatar = document.getElementById('pf-avatar');
  if (avatar) avatar.textContent = DB.iniciais(usuario.name);
  const h1 = document.getElementById('pf-nome');
  if (h1) h1.textContent = usuario.name;
  const metaEl = document.getElementById('pf-meta');
  if (metaEl) metaEl.textContent =
    (usuario.phone ? String(usuario.phone).replace(/^(\d{2})(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3-$4') || usuario.phone : '—') +
    (usuario.email ? ' · ' + usuario.email : '');
  const desde = document.getElementById('pf-desde');
  if (desde && usuario.created_at) {
    const [y, m] = String(usuario.created_at).slice(0, 7).split('-');
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    desde.textContent = 'Cliente desde ' + (meses[Number(m) - 1] || m) + ' de ' + y;
  }

  /* ---------- dados ---------- */
  let ags = [];
  try { ags = API.meusAgendamentos(); } catch (e) { /* noop */ }
  const hojeISO = DB.hojeISO();

  const validos = ags.filter(a => a.status !== 'cancelado');
  const gastos = ags.filter(a => a.status === 'concluido')
    .reduce((acc, a) => acc + Number(a.price_total || 0), 0);
  let minhaContagemReviews = 0;
  try { minhaContagemReviews = API.minhasReviews().length; } catch (e) { /* sessão inválida */ }

  setText('st-total', validos.length);
  setText('st-gasto', DB.fmtBRL(gastos));
  setText('st-avaliacoes', minhaContagemReviews);

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

  /* marca reviews já feitas por agendamento (controle local da demo) */
  const CHAVE_REVIEWS = 'cc_reviews_feitos';
  function reviewsFeitos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_REVIEWS) || '{}'); }
    catch (e) { return {}; }
  }
  function marcarReviewFeita(agId) {
    const m = reviewsFeitos();
    m[agId] = true;
    localStorage.setItem(CHAVE_REVIEWS, JSON.stringify(m));
  }

  /* ---------- próximos ---------- */
  const tbProx = document.getElementById('tb-proximos');

  function renderProximos() {
    if (!tbProx) return;
    const prox = ags.filter(a =>
      a.date >= hojeISO && (a.status === 'pendente' || a.status === 'confirmado'));

    /* banner lembrete 24h */
    const banner = document.getElementById('banner-lembrete');
    if (banner) {
      const em24h = prox.find(a => {
        const ms = new Date(a.date + 'T' + a.time).getTime() - Date.now();
        return ms > 0 && ms < 86400000;
      });
      if (em24h) {
        banner.style.display = 'block';
        banner.textContent = 'Lembrete: você tem agendamento amanhã às ' + em24h.time +
          ' no ' + em24h.barbershop_name + ' (' + em24h.services.map(s => s.name).join(', ') + ').';
      } else if (banner) {
        banner.style.display = 'none';
      }
    }

    if (!prox.length) {
      tbProx.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>Nada agendado por aqui</h3><p>Escolha um salão no catálogo e marque seu próximo horário.</p></div></td></tr>';
      return;
    }

    tbProx.innerHTML = prox.map(a =>
      '<tr>' +
        '<td>' + DB.fmtDataBR(a.date) + '</td>' +
        '<td class="mono">' + esc(a.time) + '</td>' +
        '<td>' + esc(a.barbershop_name) + '</td>' +
        '<td>' + esc(a.services.map(s => s.name).join(' + ') || '—') + '</td>' +
        '<td>' + badgeStatus(a.status) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-acao" data-acao="reagendar" data-id="' + a.id + '" ' +
            'data-shop="' + a.barbershop_id + '" data-date="' + a.date + '" data-time="' + a.time + '">Alterar</button> ' +
          '<button class="btn btn-danger btn-cancelar" data-id="' + a.id + '">Cancelar</button>' +
        '</td>' +
      '</tr>'
    ).join('');
  }

  tbProx?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cancelar');
    if (!btn) return;
    if (!confirm('Cancelar este agendamento?')) return;
    try {
      API.atualizarAgendamento(btn.dataset.id, { status: 'cancelado' });
      showToast('Agendamento cancelado.', 'error');
      recarregar();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- reagendamento (P3-1) ---------- */
  const modalReag = document.getElementById('modal-reagendar');
  const inputReagData = document.getElementById('reagendar-data');
  const selReagHora = document.getElementById('reagendar-hora');
  let agParaReagendar = null;

  tbProx?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-acao="reagendar"]');
    if (!btn || !modalReag) return;
    agParaReagendar = { id: btn.dataset.id, shopId: Number(btn.dataset.shop) };
    inputReagData.value = btn.dataset.date || '';
    inputReagData.min = hojeISO;
    carregarSlotsReagendar(btn.dataset.date);
    abrirModal(modalReag);
  });

  inputReagData?.addEventListener('change', () => {
    if (inputReagData.value) carregarSlotsReagendar(inputReagData.value);
  });

  function carregarSlotsReagendar(dateISO) {
    if (!selReagHora || !agParaReagendar) return;
    selReagHora.innerHTML = '<option value="">Carregando…</option>';
    try {
      const disp = API.disponibilidade(agParaReagendar.shopId, dateISO);
      selReagHora.innerHTML = disp.available_slots.length
        ? disp.available_slots.map(h => '<option value="' + h + '">' + h + '</option>').join('')
        : '<option value="">Nenhum horário livre</option>';
    } catch (e) {
      selReagHora.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  document.getElementById('btn-fechar-reagendar')
    ?.addEventListener('click', () => fecharModal(modalReag));
  modalReag?.addEventListener('click', e => { if (e.target === modalReag) fecharModal(modalReag); });

  document.getElementById('form-reagendar')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!agParaReagendar) return;
    const novaData = inputReagData.value;
    const novaHora = selReagHora.value;
    if (!novaData || !novaHora) { showToast('Selecione data e horário.', 'error'); return; }
    try {
      API.atualizarAgendamento(agParaReagendar.id, { date: novaData, start_time: novaHora });
      showToast('Horário alterado com sucesso!');
      fecharModal(modalReag);
      recarregar();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- histórico ---------- */
  const tbHist = document.getElementById('tb-historico');

  function renderHistorico() {
    if (!tbHist) return;
    const passados = ags.filter(a =>
      a.status === 'concluido' || a.status === 'nao_compareceu' ||
      (a.date < hojeISO && a.status !== 'cancelado'));

    if (!passados.length) {
      tbHist.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>Sem histórico ainda</h3><p>Seus atendimentos concluídos aparecem aqui.</p></div></td></tr>';
      return;
    }

    tbHist.innerHTML = passados.map(a => {
      const jaAvaliado = !!reviewsFeitos()[a.id];
      let acao = '';
      if (jaAvaliado) acao = '<button class="btn btn-outline" disabled>Avaliado</button>';
      else if (a.status === 'concluido') {
        acao = '<button class="btn btn-outline btn-avaliar" data-id="' + a.id +
          '" data-shop="' + a.barbershop_id + '">Avaliar</button>';
      }
      return '<tr>' +
        '<td>' + DB.fmtDataBR(a.date) + '</td>' +
        '<td>' + esc(a.barbershop_name) + '</td>' +
        '<td>' + esc(a.services.map(s => s.name).join(' + ') || '—') + '</td>' +
        '<td>' + esc(a.professional_name || '—') + '</td>' +
        '<td class="mono">' + DB.fmtBRL(a.price_total) + '</td>' +
        '<td>' + acao + '</td>' +
      '</tr>';
    }).join('');
  }

  function recarregar() {
    try { ags = API.meusAgendamentos(); } catch (e) { /* noop */ }
    renderProximos();
    renderHistorico();
    setText('st-total', ags.filter(a => a.status !== 'cancelado').length);
  }

  renderProximos();
  renderHistorico();

  /* ---------- modal de avaliação (RF-056 · POST autenticado) ---------- */
  const modalAv = document.getElementById('modal-avaliacao');
  const stars = document.querySelectorAll('#star-rating .star');
  const avNota = document.getElementById('av-nota');
  let agParaAvaliar = null;

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-avaliar');
    if (!btn || !modalAv) return;
    agParaAvaliar = { id: btn.dataset.id, shop: Number(btn.dataset.shop) };
    avNota.value = '0';
    stars.forEach(s => s.classList.remove('active'));
    abrirModal(modalAv);
  });

  stars.forEach(star => {
    star.addEventListener('click', () => {
      const v = Number(star.dataset.value);
      avNota.value = v;
      stars.forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= v));
    });
  });

  document.getElementById('btn-fechar-modal-avaliacao')
    ?.addEventListener('click', () => fecharModal(modalAv));
  modalAv?.addEventListener('click', e => { if (e.target === modalAv) fecharModal(modalAv); });

  document.getElementById('form-avaliacao')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nota = Number(avNota.value);
    if (!nota) { showToast('Escolha uma nota de 1 a 5 estrelas.', 'error'); return; }
    if (!agParaAvaliar) return;

    try {
      API.criarReview(agParaAvaliar.shop, {
        rating: nota,
        comment: document.getElementById('av-comentario')?.value || ''
      });
      marcarReviewFeita(agParaAvaliar.id);
      minhaContagemReviews++;
      setText('st-avaliacoes', minhaContagemReviews);
      showToast('Avaliação enviada! Obrigado.');
      fecharModal(modalAv);
      renderHistorico();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- favoritos (UC-15) ---------- */
  function renderFavoritos() {
    const box = document.getElementById('lista-favoritos');
    const vazio = document.getElementById('favoritos-vazio');
    if (!box) return;

    let favs = [];
    try { favs = API.meusFavoritos(); } catch (e) { /* noop */ }

    box.style.display = favs.length ? '' : 'none';
    if (vazio) vazio.style.display = favs.length ? 'none' : '';

    box.innerHTML = favs.map(l =>
      cardSalao(l)
    ).join('');

    box.querySelectorAll('.btn-fav-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          API.alternarFavorito(btn.dataset.shop);
          showToast('Removido dos favoritos.', 'error');
          renderFavoritos();
        } catch (err2) {
          showToast(msgErro(err2), 'error');
        }
      });
    });
  }

  function cardSalao(l) {
    const capa = l.logo_url || l.cover_url; // foto de perfil manda no card
    const capaStyle = capa ? ' style="background:#000 url(&quot;' + esc(capa) + '&quot;) center/cover no-repeat;"' : '';
    return '<div class="fav-card">' +
      '<a href="salao-publico.html?id=' + l.id + '" class="salon-card">' +
        '<div class="salon-card-cover"' + capaStyle + '></div>' +
        '<div class="salon-card-body">' +
          '<div class="salon-name">' + esc(l.name) + '</div>' +
          '<div class="salon-meta"><span class="rating">★ ' +
            Number(l.rating_avg || 0).toFixed(1) + '</span> · ' +
            esc((l.city || '') + (l.uf ? ', ' + l.uf : '')) + '</div>' +
        '</div>' +
      '</a>' +
      '<button class="btn btn-danger btn-fav-remover" data-shop="' + l.id + '">Remover</button>' +
    '</div>';
  }

  /* ---------- configurações da conta ---------- */
  const fDados = document.getElementById('form-perfil-dados');
  if (fDados) {
    fDados.querySelector('[name=nome]').value = usuario.name || '';
    fDados.querySelector('[name=telefone]').value = usuario.phone || '';
    fDados.querySelector('[name=email]').value = usuario.email || '';
    fDados.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const u = API.atualizarMe({
          name: fDados.querySelector('[name=nome]').value,
          phone: fDados.querySelector('[name=telefone]').value,
          email: fDados.querySelector('[name=email]').value
        });
        Object.assign(usuario, u);
        Auth.sincronizarUsuario(usuario); // cache local acompanha o servidor
        h1.textContent = u.name;
        avatar.textContent = DB.iniciais(u.name);
        showToast('Dados pessoais atualizados!');
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    });
  }

  const fPrefs = document.getElementById('form-perfil-preferencias');
  if (fPrefs) {
    const prefs = usuario.prefs || {};
    fPrefs.querySelector('[name=notif_email]').value = prefs.notif_email || 'sim';
    fPrefs.querySelector('[name=notif_sms]').value = prefs.notif_sms || 'não';
    fPrefs.querySelector('[name=lembrete]').value = prefs.lembrete || '30';
    fPrefs.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try {
        const prefsRet = API.atualizarPreferencias({
          notif_email: fPrefs.querySelector('[name=notif_email]').value,
          notif_sms: fPrefs.querySelector('[name=notif_sms]').value,
          lembrete: fPrefs.querySelector('[name=lembrete]').value
        });
        usuario.prefs = Object.assign({}, usuario.prefs || {}, prefsRet || {});
        Auth.sincronizarUsuario(usuario); // cache local acompanha o servidor
        showToast('Preferências salvas!');
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    });
  }

  document.getElementById('btn-sair-perfil')?.addEventListener('click', () => {
    Auth.logout();
    showToast('Você saiu da sua conta.');
    setTimeout(() => { window.location.href = 'catalogo.html'; }, 600);
  });

  /* ---------- exclusão de conta com código (P3-3) ---------- */
  const modalExcluirCli = document.getElementById('modal-excluir-cliente');
  const stepCli1 = document.getElementById('excluir-cli-step-1');
  const stepCli2 = document.getElementById('excluir-cli-step-2');
  const inputCodigoCli = document.getElementById('input-codigo-excluir-cli');
  const btnGerarCli = document.getElementById('btn-gerar-codigo-excluir-cli');
  const btnConfirmarCli = document.getElementById('btn-confirmar-excluir-cli');
  const btnCancelarExcluirCli = document.getElementById('btn-cancelar-excluir-cli');

  document.getElementById('btn-excluir-conta-cliente')?.addEventListener('click', () => {
    if (!modalExcluirCli) return;
    stepCli1.style.display = 'block';
    stepCli2.style.display = 'none';
    if (inputCodigoCli) inputCodigoCli.value = '';
    if (btnConfirmarCli) btnConfirmarCli.disabled = true;
    abrirModal(modalExcluirCli);
  });

  btnGerarCli?.addEventListener('click', () => {
    try {
      API.gerarCodigoExclusao();
      stepCli1.style.display = 'none';
      stepCli2.style.display = 'block';
      showToast('Código gerado. Verifique e digite abaixo.');
      if (inputCodigoCli) inputCodigoCli.focus();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  inputCodigoCli?.addEventListener('input', () => {
    if (btnConfirmarCli) btnConfirmarCli.disabled = inputCodigoCli.value.length !== 4;
  });

  btnConfirmarCli?.addEventListener('click', () => {
    const code = (inputCodigoCli?.value || '').trim();
    if (code.length !== 4) return;
    try {
      API.confirmarExclusao(code);
      Auth.limparSessao();
      showToast('Conta excluída.', 'error');
      setTimeout(() => { window.location.href = 'catalogo.html'; }, 1200);
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  btnCancelarExcluirCli?.addEventListener('click', () => fecharModal(modalExcluirCli));
  modalExcluirCli?.addEventListener('click', e => { if (e.target === modalExcluirCli) fecharModal(modalExcluirCli); });

  renderFavoritos();
});
