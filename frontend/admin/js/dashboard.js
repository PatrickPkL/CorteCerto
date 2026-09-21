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

  /* ---------- link exclusivo de agendamento ---------- */
  (function montarLinkAgendamento() {
    const input = document.getElementById('link-agendamento');
    if (!input) return;
    const url = location.origin + '/salao-publico.html?id=' + encodeURIComponent(loja.id);
    input.value = url;

    /* Usar o link de agendamento é ação produtiva: exige assinatura ativa
       (no modo grátis da plataforma, acessoLiberado devolve true). */
    let liberado = true;
    try { liberado = !!API.acessoLiberado(loja.id); } catch (e) { liberado = true; }
    const irAssinar = () => {
      sessionStorage.setItem('cc_assinatura_aviso',
        'Assine um plano para usar o link de agendamento e as demais funções.');
      window.location.href = 'assinatura.html';
    };

    const btnAbrir = document.getElementById('btn-abrir-link');
    if (btnAbrir) {
      btnAbrir.href = url;
      btnAbrir.addEventListener('click', (ev) => {
        if (!liberado) { ev.preventDefault(); irAssinar(); }
      });
    }
    /* Compartilhar genérico: no celular abre as opções de qualquer app
       (Instagram, Telegram, WhatsApp, etc.); no desktop copia o link. */
    const btnCompartilhar = document.getElementById('btn-compartilhar-link');
    if (btnCompartilhar) btnCompartilhar.addEventListener('click', () => {
      if (!liberado) return irAssinar();
      const texto = 'Agende seu horário na ' + (loja.name || 'nossa barbearia') + ': ';
      if (navigator.share) {
        navigator.share({ title: loja.name || 'Corte Certo', text: texto, url: url })
          .catch(() => { /* usuário cancelou */ });
        return;
      }
      const copiar = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto + url).then(() => showToast('Link copiado!'));
        } else {
          input.select(); document.execCommand('copy'); showToast('Link copiado!');
        }
      };
      copiar();
    });

    const btnCopiar = document.getElementById('btn-copiar-link');
    if (btnCopiar) btnCopiar.addEventListener('click', () => {
      if (!liberado) return irAssinar();
      const ok = () => showToast('Link copiado!');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(ok).catch(() => { input.select(); document.execCommand('copy'); ok(); });
      } else {
        input.select(); document.execCommand('copy'); ok();
      }
    });
  })();

  /* ---------- código único da empresa (acesso dos funcionários) ---------- */
  (function montarCodigoUnico() {
    const input = document.getElementById('codigo-unico');
    if (!input) return;

    let dados = null;
    try { dados = API.meuCodigoEmpresa(); }
    catch (e) { showToast(msgErro(e), 'error'); return; }

    input.value = dados.codigo_unico || '';

    const cota = document.getElementById('codigo-unico-cota');
    if (cota) {
      cota.textContent = dados.max_dependents == null
        ? (dados.dependentes_ativos + ' funcionário(s) · ilimitado no plano ' + dados.plano)
        : (dados.dependentes_ativos + ' de ' + dados.max_dependents + ' funcionário(s) no plano ' + dados.plano);
    }

    const acao = (fn) => {
      try { fn(); } catch (e) { showToast(msgErro(e), 'error'); }
    };
    const copiar = (ok) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(ok).catch(() => {
          input.select(); document.execCommand('copy'); ok();
        });
      } else {
        input.select(); document.execCommand('copy'); ok();
      }
    };

    document.getElementById('btn-copiar-codigo')?.addEventListener('click', () => {
      acao(() => copiar(() => showToast('Código único copiado!')));
    });

    document.getElementById('btn-compartilhar-codigo')?.addEventListener('click', () => {
      const texto = 'Meu Código Único na Corte Certo: ' + dados.codigo_unico +
        ' — use com seu Login e Senha para acessar agenda e clientes.';
      if (navigator.share) {
        navigator.share({ text: texto }).catch(() => { /* cancelado */ });
        return;
      }
      acao(() => copiar(() => {
        showToast('Código copiado para compartilhar!');
      }));
    });
  })();

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
  if (!CC.temFunc('exportar_csv')) {
    showToast('Exportar CSV está bloqueado no seu plano. Faça upgrade na aba Assinatura.', 'error');
    return;
  }
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
