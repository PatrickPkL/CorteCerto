/* ============================================================
   Corte Certo – admin/js/dashboard.js
   Estatísticas por período (RF-048) + exportação CSV (RF-049).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin('dono');
  if (!usuario) return;
  const loja = Auth.salaoDoUsuario(usuario);
  if (!loja) {
    showToast('Nenhum salão vinculado a esta conta.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return;
  }

  /* saudação dinâmica */
  const h1 = document.querySelector('.page-header h1');
  const eyebrow = document.querySelector('.page-header .eyebrow');
  const agora = new Date();
  const hora = agora.getHours();
  if (h1) h1.textContent = (hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + usuario.name.split(' ')[0];
  if (eyebrow) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    eyebrow.textContent = dias[agora.getDay()] + ', ' + agora.getDate() + ' de ' + meses[agora.getMonth()];
  }

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function setDelta(id, texto, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'stat-delta' + (cls ? ' ' + cls : '');
    el.textContent = texto;
  }

  /* ---------- estatísticas por período ---------- */
  const selPeriodo = document.getElementById('sel-periodo');
  let statsAtual = null;

  function renderStats() {
    const periodo = selPeriodo ? selPeriodo.value : 'today';
    try {
      statsAtual = API.dashboardStats(periodo);
    } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }
    const s = statsAtual.summary;

    setText('stat-agendamentos', s.appointments_total);
    setDelta('stat-delta-agendamentos',
      s.concluded + ' concluído(s) · ' + s.pending + ' pendente(s)');
    setText('stat-faturamento', DB.fmtBRL(s.revenue));
    setDelta('stat-delta-fat', 'Ticket médio: ' + DB.fmtBRL(s.avg_ticket));
    setText('stat-novos', statsAtual.clients.novos_no_periodo);
    setDelta('stat-delta-novos', statsAtual.clients.total + ' cliente(s) no total');
    setText('stat-cancel', s.cancelled);
    setDelta('stat-delta-cancel',
      s.completion_rate_pct + '% de conclusão' +
      (s.no_show ? ' · ' + s.no_show + ' falta(s)' : ''));

    renderProximos();
    renderProfissionais();
  }

  selPeriodo?.addEventListener('change', renderStats);

  /* RF-049 — exportar CSV do período exibido */
  document.getElementById('btn-exportar-csv')?.addEventListener('click', () => {
    if (!statsAtual) return;
    try {
      const statuses = Array.from(document.querySelectorAll('.csv-status:checked')).map(cb => cb.value);
      const csv = API.exportarCSV(statsAtual.start_date, statsAtual.end_date, statuses);
      baixarArquivo('agendamentos_' + statsAtual.start_date + '_a_' + statsAtual.end_date + '.csv', csv);
      showToast('CSV exportado!');
    } catch (e) {
      showToast(msgErro(e), 'error');
    }
  });

  /* ---------- próximos agendamentos de hoje ---------- */
  let agsHoje = [];

  function renderProximos() {
    const tb = document.getElementById('tb-proximos');
    if (!tb) return;
    aguardarSkeleton(tb);
    const hoje = DB.hojeISO();
    try {
      agsHoje = API.listarAgendamentos({ de: hoje, ordem: 'asc', limit: 10 }).items;
    } catch (e) { agsHoje = []; }

    const prox = agsHoje
      .filter(a => a.status === 'pendente' || a.status === 'confirmado')
      .slice(0, 10);

    tb.innerHTML = prox.map(a =>
      '<tr>' +
        '<td class="mono">' + esc(a.time) + '</td>' +
        '<td>' + esc(a.client_name) + '</td>' +
        '<td>' + esc(a.services.map(s => s.name).join(' + ') || '—') + '</td>' +
        '<td>' + badgeStatus(a.status) + '</td>' +
      '</tr>'
    ).join('') ||
    '<tr><td colspan="4"><div class="empty-state"><h3>Agenda livre</h3><p>Sem agendamentos pendentes a partir de hoje.</p></div></td></tr>';
  }

  /* ---------- profissionais em atendimento agora ---------- */
  function renderProfissionais() {
    const tb = document.getElementById('tb-profs');
    if (!tb) return;

    let profs = [];
    try { profs = API.profissionaisDaLoja(loja.id, true); } catch (e) { /* noop */ }

    const agoraMin = DB.agoraMinutos();
    const toMin = hhmm => DB.hhmmToMin(hhmm);

    tb.innerHTML = profs.map(p => {
      const doProf = agsHoje.filter(a => a.professional_id === p.id);
      let status, cls;
      if (doProf.some(a =>
        ['confirmado', 'concluido'].includes(a.status) &&
        toMin(a.time) <= agoraMin && agoraMin < toMin(String(a.ends_at).slice(11)))) {
        status = 'Em atendimento'; cls = 'badge-confirmado';
      } else if (doProf.some(a => a.status === 'pendente')) {
        status = 'Aguardando confirmação'; cls = 'badge-pendente';
      } else {
        status = 'Livre'; cls = 'badge-neutro';
      }
      return '<tr><td>' + esc(p.name) + '</td><td><span class="badge ' + cls + '">' + status + '</span></td></tr>';
    }).join('') ||
    '<tr><td colspan="2"><div class="empty-state"><h3>Sem profissionais</h3><p>Cadastre sua equipe em Profissionais.</p></div></td></tr>';
  }

  renderStats();

  try { API.gerarLembretesAmanha(); } catch(e) { /* best-effort */ }
});
