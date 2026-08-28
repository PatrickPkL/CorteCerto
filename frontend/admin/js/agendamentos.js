/* ============================================================
   Corte Certo – admin/js/agendamentos.js
   Listagem com filtros e paginação (RF-040), criação com slots
   reais, edição com revalidação (DT-07) e mudanças de status.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin(['dono', 'barbeiro']);
  if (!usuario) return;
  const loja = Auth.salaoDoUsuario(usuario);
  if (!loja) {
    showToast('Nenhum salão vinculado a esta conta.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return;
  }

  const tbody = document.getElementById('tbody-agendamentos');
  if (!tbody) return;

  const busca = document.getElementById('busca-agendamento');
  const filtroProf = document.getElementById('filtro-profissional');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroData = document.getElementById('filtro-data');

  let pagina = 1;
  const POR_PAGINA = 50;
  let totalItens = 0;

  /* ---------- filtros: profissionais ---------- */
  let profs = [];
  try { profs = API.profissionaisDaLoja(loja.id); } catch (e) { /* noop */ }

  const opcoesProf = '<option value="">Todos os profissionais</option>' +
    profs.filter(p => p.is_active)
      .map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
  if (filtroProf) filtroProf.innerHTML = opcoesProf;

  function filtrosAtuais() {
    return {
      q: (busca?.value || '').trim() || undefined,
      professional_id: filtroProf?.value || undefined,
      status: filtroStatus?.value || undefined,
      date: filtroData?.value || undefined
    };
  }

  /* ---------- listagem com paginação (RF-040) ---------- */
  function render() {
    aguardarSkeleton(tbody);
    let lista;
    try {
      lista = API.listarAgendamentos(Object.assign(
        {}, filtrosAtuais(), { ordem: 'desc', limit: POR_PAGINA, page: pagina }));
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>Erro ao carregar</h3><p>' +
        esc(msgErro(e)) + '</p></div></td></tr>';
      return;
    }

    totalItens = lista.total;
    renderPaginacao();

    if (!lista.items.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>Nenhum agendamento encontrado</h3><p>Ajuste os filtros para ver outros períodos.</p></div></td></tr>';
      return;
    }

    const hoje = DB.hojeISO();
    tbody.innerHTML = lista.items.map(a => {
      let acoes =
        '<button class="btn btn-outline btn-acao" data-acao="editar" data-id="' + a.id + '">Editar</button>';
      if (a.status === 'pendente') {
        acoes += '<button class="btn btn-outline btn-acao" data-acao="confirmar" data-id="' + a.id + '">Confirmar</button>';
      }
      if (a.status === 'confirmado') {
        acoes += '<button class="btn btn-outline btn-acao" data-acao="concluir" data-id="' + a.id + '"' +
          (a.date > hoje ? ' disabled title="Disponível no dia"' : '') + '>Concluir</button>';
      }
      if (a.status === 'pendente' || a.status === 'confirmado') {
        acoes += '<button class="btn btn-danger btn-acao" data-acao="cancelar" data-id="' + a.id + '">Cancelar</button>';
      }
      if (a.status === 'cancelado' || a.status === 'nao_compareceu') {
        acoes += '<button class="btn btn-outline btn-acao" data-acao="reagendar" data-id="' + a.id + '">Reagendar</button>';
        acoes += '<button class="btn btn-danger btn-acao" data-acao="excluir" data-id="' + a.id + '">Excluir</button>';
      }

      return '<tr>' +
        '<td>' + DB.fmtDataBR(a.date) + '</td>' +
        '<td class="mono">' + esc(a.time) + '</td>' +
        '<td>' + esc(a.client_name) +
          (a.client_phone ? '<br><small style="color:var(--text-muted)" class="mono">' + esc(a.client_phone) + '</small>' : '') + '</td>' +
        '<td>' + esc(a.services.map(s => s.name).join(' + ') || '—') + '</td>' +
        '<td>' + esc(a.professional_name || '—') + '</td>' +
        '<td class="mono">' + DB.fmtBRL(a.price_total) + '</td>' +
        '<td>' + badgeStatus(a.status) + '</td>' +
        '<td style="white-space:nowrap;">' + acoes + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderPaginacao() {
    const info = document.getElementById('pag-info');
    const prev = document.getElementById('btn-pag-prev');
    const next = document.getElementById('btn-pag-next');
    const totalPaginas = Math.max(1, Math.ceil(totalItens / POR_PAGINA));
    if (pagina > totalPaginas) pagina = totalPaginas;
    if (info) info.textContent = 'Página ' + pagina + ' de ' + totalPaginas +
      ' · ' + totalItens + ' agendamento(s)';
    if (prev) prev.disabled = pagina <= 1;
    if (next) next.disabled = pagina >= totalPaginas;
  }

  document.getElementById('btn-pag-prev')?.addEventListener('click', () => {
    if (pagina > 1) { pagina--; render(); }
  });
  document.getElementById('btn-pag-next')?.addEventListener('click', () => {
    if (pagina < Math.ceil(totalItens / POR_PAGINA)) { pagina++; render(); }
  });

  busca?.addEventListener('input', debounce(() => { pagina = 1; render(); }, 300));
  [filtroProf, filtroStatus, filtroData].forEach(el =>
    el?.addEventListener('change', () => { pagina = 1; render(); }));

  /* ---------- ações de status ---------- */
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-acao');
    if (!btn || btn.disabled) return;
    const { acao, id } = btn.dataset;

    if (acao === 'editar') { abrirEdicao(id); return; }
    if (acao === 'reagendar') { abrirEdicao(id); return; }

    try {
      if (acao === 'confirmar') {
        API.atualizarAgendamento(id, { status: 'confirmado' });
        showToast('Agendamento confirmado!');
      }
      if (acao === 'concluir') {
        if (!confirm('Confirmar conclusão deste atendimento?')) return;
        API.atualizarAgendamento(id, { status: 'concluido' });
        showToast('Atendimento concluído.');
      }
      if (acao === 'cancelar') {
        const motivo = prompt('Motivo do cancelamento (opcional):');
        if (motivo === null) return;
        API.atualizarAgendamento(id, { status: 'cancelado', cancellation_reason: motivo });
        showToast('Agendamento cancelado.', 'error');
      }
      if (acao === 'excluir') {
        if (!confirm('Excluir este agendamento permanentemente?')) return;
        API.excluirAgendamento(id);
        showToast('Agendamento excluído.', 'error');
      }
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- criação manual pelo staff ("Agendar Cliente") ----------
     O atendente escolhe um cliente JÁ CADASTRADO na loja + serviço,
     profissional, data e hora. O backend revalida sessão, posse da
     loja e conflito de horário. */
  const modalNovo = document.getElementById('modal-novo-agendamento');
  let clientesNovo = [];

  function carregarOpcoesNovo() {
    const selCli = document.getElementById('na-cliente');
    const selSvc = document.getElementById('na-servico');
    const selPro = document.getElementById('na-profissional');
    if (!selCli || !selSvc || !selPro) return;

    try { clientesNovo = API.listarClientes({}).items || []; }
    catch (e) { clientesNovo = []; }
    selCli.innerHTML = clientesNovo.length
      ? clientesNovo.map(c =>
          '<option value="' + c.id + '">' +
          esc(c.name) + (c.phone ? ' · ' + esc(c.phone) : '') + '</option>').join('')
      : '<option value="">Nenhum cliente cadastrado</option>';

    let svcs = [];
    try { svcs = API.servicosDaLoja(loja.id, false); } catch (e) { /* noop */ }
    selSvc.innerHTML = svcs.map(s =>
      '<option value="' + s.id + '">' + esc(s.name) + ' · ' +
      DB.fmtBRL(s.price) + '</option>').join('');

    selPro.innerHTML = '<option value="">Primeiro disponível</option>' +
      profs.filter(p => p.is_active)
        .map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');

    const hoje = DB.hojeISO();
    document.getElementById('na-data').min = hoje;
    document.getElementById('na-data').value = hoje;
    document.getElementById('na-hora').value = '';
    document.getElementById('na-notas').value = '';
  }

  document.getElementById('btn-novo-agendamento')?.addEventListener('click', () => {
    if (!modalNovo) return;
    carregarOpcoesNovo();
    abrirModal(modalNovo);
  });
  document.getElementById('btn-fechar-modal-novo-ag')?.addEventListener('click', () =>
    fecharModal(modalNovo));
  modalNovo?.addEventListener('click', (e) => {
    if (e.target === modalNovo) fecharModal(modalNovo);
  });

  document.getElementById('form-novo-agendamento')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const selCli = document.getElementById('na-cliente');
    const selSvc = document.getElementById('na-servico');
    const selPro = document.getElementById('na-profissional');
    const data = document.getElementById('na-data').value;
    const hora = document.getElementById('na-hora').value;
    if (!selCli.value) { showToast('Cadastre o cliente antes de agendar.', 'error'); return; }
    if (!selSvc.value || !data || !hora) { showToast('Preencha serviço, data e horário.', 'error'); return; }

    const cli = clientesNovo.find(c => String(c.id) === String(selCli.value));
    if (!cli) { showToast('Cliente não encontrado.', 'error'); return; }

    const payload = {
      barbershop_id: loja.id,
      origin: 'admin',
      date: data,
      start_time: hora,
      service_ids: [String(selSvc.value)],
      client_name: cli.name,
      client_phone: cli.phone || '',
      notes: document.getElementById('na-notas').value
    };
    if (selPro.value) payload.professional_id = selPro.value;

    try {
      API.criarAgendamento(payload);
      fecharModal(modalNovo);
      showToast('Agendamento criado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error'); /* 409 traz horários livres na msg */
    }
  });

  /* ---------- editar agendamento (PATCH c/ DT-07) ---------- */
  const modalEdicao = document.getElementById('modal-editar-agendamento');
  let idEmEdicao = null;

  function abrirEdicao(id) {
    if (!modalEdicao) return;
    let ag;
    try { ag = API.getAgendamento(id); } catch (e) { showToast(msgErro(e), 'error'); return; }
    idEmEdicao = ag.id;

    document.getElementById('ea-titulo').textContent = 'Editar · ' + ag.client_name;
    document.getElementById('ea-data').value = ag.date;
    document.getElementById('ea-hora').value = ag.time;
    const selP = document.getElementById('ea-profissional');
    selP.innerHTML = profs.filter(p => p.is_active)
      .map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
    if (ag.professional_id) selP.value = String(ag.professional_id);
    else selP.selectedIndex = -1;
    document.getElementById('ea-status').value = ag.status;
    document.getElementById('ea-notas').value = ag.notes || '';

    abrirModal(modalEdicao);
  }

  document.getElementById('btn-fechar-modal-editar-ag')?.addEventListener('click', () =>
    fecharModal(modalEdicao));
  modalEdicao?.addEventListener('click', (e) => {
    if (e.target === modalEdicao) fecharModal(modalEdicao);
  });

  document.getElementById('form-editar-agendamento')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!idEmEdicao) return;
    const patch = {
      date: document.getElementById('ea-data').value,
      start_time: document.getElementById('ea-hora').value,
      professional_id: document.getElementById('ea-profissional').value
        ? document.getElementById('ea-profissional').value
        : null,
      status: document.getElementById('ea-status').value,
      notes: document.getElementById('ea-notas').value
    };
    try {
      API.atualizarAgendamento(idEmEdicao, patch);
      fecharModal(modalEdicao);
      showToast('Agendamento atualizado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  render();
});
