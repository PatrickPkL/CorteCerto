/* ============================================================
   Corte Certo – admin/js/horarios.js
   Página dedicada de horários: expediente por dia (DT-09),
   intervalo de slots configurável e folgas/feriados (exceções).
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

  const DIAS_LABEL = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
  const TIPO_LABEL = { folga: 'Folga', feriado: 'Feriado', fechamento: 'Fechamento', evento: 'Evento' };

  /* ================= expediente por dia ================= */

  function atualizarStatusRow(row, aberto) {
    const badge = row.querySelector('.schedule-status');
    if (!badge) return;
    if (aberto) {
      badge.textContent = 'Aberto';
      badge.className = 'badge badge-confirmado schedule-status';
      row.classList.remove('schedule-folga');
    } else {
      badge.textContent = 'Folga';
      badge.className = 'badge badge-pendente schedule-status';
      row.classList.add('schedule-folga');
    }
  }

  function renderHorarios() {
    let linhas = [];
    try { linhas = API.horariosDaLoja(loja.id, true); } catch (e) { /* noop */ }

    document.querySelectorAll('.schedule-row').forEach(row => {
      const dow = Number(row.dataset.dia);
      const h = linhas.find(w => w.day_of_week === dow);
      if (!h) return;
      row.querySelector('[data-toggle]').checked = !!h.is_open;
      row.querySelector('[data-open]').value = h.start_time || '09:00';
      row.querySelector('[data-close]').value = h.end_time || '18:00';
      row.querySelector('[data-lunch-ini]').value = h.lunch_start || '';
      row.querySelector('[data-lunch-fim]').value = h.lunch_end || '';
      atualizarStatusRow(row, !!h.is_open);
    });
  }

  document.querySelectorAll('.schedule-row').forEach(row => {
    row.querySelector('[data-toggle]')?.addEventListener('change', function () {
      atualizarStatusRow(row, this.checked);
    });
  });

  document.getElementById('btn-aplicar-todos')?.addEventListener('click', () => {
    const primeira = document.querySelector('.schedule-row[data-dia="1"]');
    if (!primeira) return;
    const abrir = primeira.querySelector('[data-toggle]').value === '';
    const open = primeira.querySelector('[data-open]')?.value || '09:00';
    const close = primeira.querySelector('[data-close]')?.value || '18:00';
    document.querySelectorAll('.schedule-row').forEach(row => {
      if (row.dataset.dia === '1') return;
      const lIni = row.querySelector('[data-lunch-ini]').value;
      const lFim = row.querySelector('[data-lunch-fim]').value;
      row.querySelector('[data-open]').value = open;
      row.querySelector('[data-close]').value = close;
      row.querySelector('[data-lunch-ini]').value = lIni;
      row.querySelector('[data-lunch-fim]').value = lFim;
    });
  });

  document.getElementById('form-config-horario')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dias = [];
    document.querySelectorAll('.schedule-row').forEach(row => {
      const aberto = row.querySelector('[data-toggle]').checked;
      const li = row.querySelector('[data-lunch-ini]').value;
      const lf = row.querySelector('[data-lunch-fim]').value;
      dias.push({
        day_of_week: Number(row.dataset.dia),
        is_open: aberto,
        start_time: row.querySelector('[data-open]').value,
        end_time: row.querySelector('[data-close]').value,
        lunch_start: li || null,
        lunch_end: lf || null
      });
    });
    try {
      API.salvarHorariosLoja(dias);
      showToast('Expediente salvo! Já vale no agendamento público.');
      renderHorarios();
    } catch (err2) { showToast(msgErro(err2), 'error'); }
  });

  /* ================= intervalo dos slots ================= */

  function carregarIntervalo() {
    let l = loja;
    try { l = API.minhaLoja(); } catch (e) { /* usa cache */ }
    const sel = document.getElementById('cfg-slot-intervalo');
    const v = Number(l.slotIntervalMin || l.slot_interval_min || 15);
    if (sel) sel.value = String(v);
  }

  document.getElementById('btn-salvar-intervalo')?.addEventListener('click', () => {
    const sel = document.getElementById('cfg-slot-intervalo');
    if (!sel) return;
    try {
      const l = API.atualizarLoja({ slot_interval_min: Number(sel.value) });
      Auth.sincronizarLoja(l);
      showToast('Intervalo de agendamentos atualizado!');
    } catch (e) { showToast(msgErro(e), 'error'); }
  });

  /* ================= folgas e feriados ================= */

  function fmtData(valor) {
    if (!valor) return '—';
    const s = String(valor).replace('T', ' ').slice(0, 16);
    return s;
  }

  function renderExcecoes() {
    let lista = [];
    try { lista = API.listarExcecoes(); } catch (e) { showToast(msgErro(e), 'error'); return; }
    const box = document.getElementById('exc-list');
    if (!box) return;
    if (!lista.length) {
      box.innerHTML = '<p style="color:var(--text-muted); font-size:14px;">Nenhuma folga ou feriado cadastrado.</p>';
      return;
    }
    box.innerHTML = lista.map(x => {
      const label = TIPO_LABEL[x.type] || x.type || 'Folga';
      return '<div class="exc-item">' +
        '<div class="exc-info">' +
          '<strong>' + esc(label) + '</strong>' +
          '<span>' + esc(fmtData(x.starts_at)) + (x.ends_at ? ' até ' + esc(fmtData(x.ends_at)) : '') + '</span>' +
          (x.reason ? '<span style="color:var(--text-muted);">' + esc(x.reason) + '</span>' : '') +
        '</div>' +
        '<button class="btn btn-outline btn-exc-del" data-id="' + esc(x.id) + '" type="button">Excluir</button>' +
      '</div>';
    }).join('');
  }

  document.getElementById('btn-add-excecao')?.addEventListener('click', () => {
    const tipo = document.getElementById('exc-tipo')?.value || 'folga';
    const inicio = document.getElementById('exc-inicio')?.value;
    const fim = document.getElementById('exc-fim')?.value || null;
    const motivo = document.getElementById('exc-motivo')?.value.trim() || '';
    if (!inicio) {
      showToast('Informe a data/hora de início.', 'error');
      return;
    }
    try {
      API.criarExcecao({ type: tipo, starts_at: inicio, ends_at: fim, reason: motivo });
      if (document.getElementById('exc-inicio')) document.getElementById('exc-inicio').value = '';
      if (document.getElementById('exc-fim')) document.getElementById('exc-fim').value = '';
      if (document.getElementById('exc-motivo')) document.getElementById('exc-motivo').value = '';
      showToast('Folga/feriado cadastrado!');
      renderExcecoes();
    } catch (e) { showToast(msgErro(e), 'error'); }
  });

  document.getElementById('exc-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-exc-del');
    if (!btn) return;
    try {
      API.excluirExcecao(btn.dataset.id);
      showToast('Exceção removida.');
      renderExcecoes();
    } catch (err2) { showToast(msgErro(err2), 'error'); }
  });

  renderHorarios();
  carregarIntervalo();
  renderExcecoes();
});
