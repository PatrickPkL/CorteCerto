/* ============================================================
   Corte Certo - admin/js/relatorios-unica.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_SA = localStorage.getItem('cc_superadmin_token') ||
    localStorage.getItem('cc_super_admin_token');
  const modoPlataforma = !!TOKEN_SA;

  const usuario = modoPlataforma ? null : exigirLogin('dono');
  const loja = modoPlataforma
    ? null
    : (usuario ? Auth.salaoDoUsuario(usuario) : null);

  if (!modoPlataforma) {
    if (!usuario) return;
    if (!loja) {
      showToast('Nenhum sal├úo vinculado a esta conta.', 'error');
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
      return;
    }
  }

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function setDelta(id, texto, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'stat-delta' + (cls ? ' ' + cls : '');
    el.textContent = texto;
  }

  /* ---------- eixos ---------- */
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function rotuloMes(key) {
    if (!key || key.length < 7) return key || '';
    const m = parseInt(key.slice(5, 7), 10) - 1;
    const a = parseInt(key.slice(0, 4), 10);
    return MESES[m] + '/' + String(a).slice(2);
  }

  function ultimosMeses(n) {
    const out = [];
    const agora = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push({ key, rotulo: rotuloMes(key) });
    }
    return out;
  }

  function ultimosDias(n) {
    const out = [];
    const agora = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      out.push({ key, rotulo: String(d.getDate()) });
    }
    return out;
  }

  function agregarPorMes(mapChave, meses) {
    return meses.map(m => mapChave[m.key] || 0);
  }

  /* ---------- cores do tema ---------- */
  function corVar(nome, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  const C = {
    muted: corVar('--text-muted', '#6B6558'),
    line: corVar('--line', '#DCD4C2'),
    brass: corVar('--brass', '#B8863B'),
    brassSoft: corVar('--brass-soft', '#D9B87A'),
    success: corVar('--success', '#4C7A5E'),
    danger: corVar('--danger', '#A1433C'),
    paper: corVar('--paper-soft', '#F5F1E7')
  };

  /* ---------- desenho b├ísico (DPI) ---------- */
  function prepCanvas(cv) {
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth || cv.parentElement.clientWidth || 400;
    const ch = cv.clientHeight || 240;
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    return { ctx, cw, ch };
  }

  function arredondarEixo(max) {
    if (!max || max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const m = max / p;
    if (m <= 1) return p;
    if (m <= 2) return 2 * p;
    if (m <= 5) return 5 * p;
    return 10 * p;
  }

  function gradeHorizontal(ctx, cw, padL, padT, w, h, maxRounded) {
    ctx.strokeStyle = C.line;
    ctx.fillStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    for (let i = 0; i <= 4; i++) {
      const y = padT + h - (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
      ctx.fillText(String(Math.round((maxRounded * i) / 4)), 4, y + 4);
    }
  }

  /* ---------- gr├ífico de barras ---------- */
  function desenharBarras(cv, rotulos, valores, cor) {
    const { ctx, cw, ch } = prepCanvas(cv);
    const padL = 34, padR = 6, padT = 12, padB = 24;
    const w = cw - padL - padR, h = ch - padT - padB;
    const max = Math.max.apply(null, valores.concat([1]));
    const maxRounded = arredondarEixo(max);
    gradeHorizontal(ctx, cw, padL, padT, w, h, maxRounded);

    const n = rotulos.length;
    const slot = n ? w / n : 1;
    const bw = Math.max(4, Math.min(slot * 0.55, 26));
    valores.forEach((v, i) => {
      const bh = (v / maxRounded) * h;
      const x = padL + slot * i + (slot - bw) / 2;
      const y = padT + h - bh;
      ctx.fillStyle = cor;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 3);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, bw, bh);
      }
      if (bh > 14 && v > 0) {
        ctx.fillStyle = C.paper;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(String(v), x + (bw - ctx.measureText(String(v)).width) / 2, y + 10);
      }
      ctx.fillStyle = C.muted;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(rotulos[i], padL + slot * i + (slot - ctx.measureText(rotulos[i]).width) / 2, padT + h + 16);
    });
  }

  /* ---------- gr├ífico de linhas (├írea) ---------- */
  function desenharLinhas(cv, rotulos, valores, cor) {
    const { ctx, cw, ch } = prepCanvas(cv);
    const padL = 30, padR = 6, padT = 12, padB = 24;
    const w = cw - padL - padR, h = ch - padT - padB;
    const max = Math.max.apply(null, valores.concat([1]));
    const maxRounded = arredondarEixo(max);
    gradeHorizontal(ctx, cw, padL, padT, w, h, maxRounded);

    const n = rotulos.length;
    const passo = n > 1 ? w / (n - 1) : 0;
    const pts = valores.map((v, i) => ({
      x: padL + passo * i,
      y: padT + h - (v / maxRounded) * h,
      v
    }));

    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, cor + '66');
    grad.addColorStop(1, cor + '00');
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineTo(pts[pts.length - 1].x, padT + h);
    ctx.lineTo(pts[0].x, padT + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = cor;
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });

    const step = Math.max(1, Math.ceil(n / 8));
    ctx.fillStyle = C.muted;
    ctx.font = '10px "JetBrains Mono", monospace';
    rotulos.forEach((r, i) => {
      if (i % step) return;
      ctx.fillText(r, pts[i].x - ctx.measureText(r).width / 2, padT + h + 16);
    });
  }

  /* ---------- barras empilhadas por plano (plataforma) ---------- */
  function desenharPlanos(cv, planos) {
    const { ctx, cw, ch } = prepCanvas(cv);
    const padL = 34, padR = 6, padT = 12, padB = 26;
    const w = cw - padL - padR, h = ch - padT - padB;
    const comPlano = planos.filter(p => p.total > 0);
    const max = Math.max.apply(null, comPlano.map(p => p.total).concat([1]));
    const maxRounded = arredondarEixo(max);
    gradeHorizontal(ctx, cw, padL, padT, w, h, maxRounded);

    if (!comPlano.length) {
      ctx.fillStyle = C.muted;
      ctx.font = '13px "Work Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nenhuma assinatura ativa ainda.', cw / 2, ch / 2);
      ctx.textAlign = 'start';
      return;
    }

    const n = comPlano.length;
    const slot = w / n;
    const bw = Math.max(10, Math.min(slot * 0.6, 44));

    comPlano.forEach((p, i) => {
      const x = padL + slot * i + (slot - bw) / 2;
      const bh = (p.total / maxRounded) * h;
      const y0 = padT + h;
      const segs = [
        { n: p.ativas, cor: C.success },
        { n: p.trial, cor: C.brass },
        { n: p.canceladas, cor: C.danger }
      ];
      let y = y0;
      segs.forEach(s => {
        if (!s.n) return;
        const sh = Math.round((s.n / p.total) * bh);
        if (sh < 3) return;
        y -= sh;
        ctx.fillStyle = s.cor;
        if (typeof ctx.roundRect === 'function' && s.n === p.ativas) {
          ctx.beginPath(); ctx.roundRect(x, y, bw, sh, 3); ctx.fill();
        } else {
          ctx.fillRect(x, y, bw, sh);
        }
      });
      if (bh > 4) {
        ctx.fillStyle = C.paper;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(String(p.total), x + (bw - ctx.measureText(String(p.total)).width) / 2, y0 - bh + 10);
      }
      ctx.fillStyle = C.muted;
      ctx.font = '10px "JetBrains Mono", monospace';
      const nome = p.name.length > 12 ? p.name.slice(0, 12) + 'ÔÇª' : p.name;
      ctx.fillText(nome, padL + slot * i + (slot - ctx.measureText(nome).width) / 2, padT + h + 16);
    });
  }

  function mensagemVazia(cv, texto) {
    const { ctx, cw, ch } = prepCanvas(cv);
    ctx.fillStyle = C.muted;
    ctx.font = '13px "Work Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(texto, cw / 2, ch / 2);
    ctx.textAlign = 'start';
  }

  function marcarAtualizacao() {
    setText('ult-atual', 'atualizado ' + new Date().toLocaleTimeString('pt-BR'));
  }

  function nossoDolar(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  /* ============================================================
     MODO PLATAFORMA (super-admin)
     ============================================================ */
  async function carregarPlataforma() {
    try {
      const resp = await fetch('/api/super-admin/relatorios', {
        headers: { 'authorization': TOKEN_SA, 'content-type': 'application/json' }
      });
      const json = await resp.json().catch(() => ({ ok: false }));
      if (!json || !json.ok || !json.data) throw new Error('sem acesso');
      renderizarPlataforma(json.data);
      marcarAtualizacao();
    } catch (e) {
      setText('lbl-subtitulo', 'Falha ao carregar dados da plataforma. Verifique o acesso de super-admin.');
    }
  }

  function renderizarPlataforma(d) {
    setText('lbl-eyebrow', 'An├ílise da plataforma ┬À todas as lojas');
    setText('lbl-subtitulo', 'N├║meros reais de todo o site, em tempo real.');

    const meses = d.meses || [];
    const totais = d.totais || {};
    const serie = s => (s || []).filter(x => x && meses.indexOf(x.mes) >= 0).map(x => x.valor);

    /* cards */
    const clientesSite = (d.series.clientes_por_mes || []).reduce((a, x) => a + x.valor, 0);
    const agendSite = (d.series.uso_por_mes || []).reduce((a, x) => a + x.valor, 0);

    setText('lbl-clientes', 'Clientes na plataforma');
    setText('stat-clientes', clientesSite);
    setDelta('stat-clientes-delta', clientesSite > 0
      ? '+ ' + clientesSite + ' no total ┬À ' + (d.meses.length || 12) + ' meses'
      : 'nenhum cliente cadastrado');

    setText('lbl-agendamentos', 'Agendamentos ┬À plataforma');
    setText('stat-agendamentos', agendSite);
    setDelta('stat-agendamentos-delta',
      'hoje: ' + (totais.agendamentos_hoje || 0) + ' ┬À total: ' + (totais.total_agendamentos || 0));

    const ass = d.assinaturas || {};
    setText('lbl-assinatura', 'Assinaturas ativas');
    setText('stat-assinatura', ass.ativas || 0);
    setDelta('stat-assinatura-delta',
      'trial: ' + (ass.trial || 0) + ' ┬À canceladas: ' + (ass.canceladas || 0) +
      ' ┬À proj. mensal: ' + nossoDolar(ass.receita_mensal_projetada));

    setText('lbl-logins', 'Logins ┬À 30 dias');
    setText('stat-logins', totais.logins_30d || 0);
    setDelta('stat-logins-delta', 'logins na plataforma');

    /* charts */
    setText('lbl-chart-uso', 'Uso da plataforma');
    setText('lbl-chart-uso-sub', 'Agendamentos em todas as lojas (12 meses)');
    const cvUso = document.getElementById('chart-uso');
    if (cvUso) {
      const v = serie(d.series.uso_por_mes);
      desenharBarras(cvUso, meses.map(rotuloMes), v, C.brass);
    }

    setText('lbl-chart-logins', 'Fluxo de logins');
    setText('lbl-chart-logins-sub', 'Logins na plataforma por m├¬s (12 meses)');
    const cvLogins = document.getElementById('chart-logins');
    if (cvLogins) {
      const v = serie(d.series.logins_por_mes);
      desenharLinhas(cvLogins, meses.map(rotuloMes), v, C.success);
    }

    setText('lbl-chart-clientes', 'Novos clientes');
    setText('lbl-chart-clientes-sub', 'Clientes cadastrados no site por m├¬s (12 meses)');
    const cvCx = document.getElementById('chart-clientes');
    if (cvCx) {
      const v = serie(d.series.clientes_por_mes);
      desenharBarras(cvCx, meses.map(rotuloMes), v, C.brassSoft);
    }

    /* assinaturas por plano */
    setText('lbl-planos-sub', 'Quantidade de lojas por plano, com o status de cada assinatura.');
    const cvPlanos = document.getElementById('chart-planos');
    if (cvPlanos) desenharPlanos(cvPlanos, d.planos || []);
    renderTabelaPlanos(d.planos || [], d.sem_plano || 0);
  }

  function renderTabelaPlanos(planos, semPlano) {
    const tbody = document.getElementById('planos-tbody');
    if (!tbody) return;
    const vazio = document.getElementById('planos-vazio');
    if (vazio) vazio.hidden = true;

    const maxTotal = Math.max(1, Math.max.apply(null, planos.map(p => p.total).concat([1])));
    const maisUsado = planos.reduce((a, p) => (p.total > (a ? a.total : 0) ? p : a), null);

    let html = planos.map(p => {
      const pct = Math.round((p.total / maxTotal) * 100);
      const top = maisUsado && p.plan_id === maisUsado.plan_id && p.total > 0;
      return '<tr class="' + (top ? 'plan-top' : '') + '">' +
        '<td>' + (p.name || 'ÔÇö') + (top ? ' <span class="plan-badge">mais usado</span>' : '') + '</td>' +
        '<td>' + nossoDolar(p.price_monthly) + '</td>' +
        '<td>' + p.ativas + '</td>' +
        '<td>' + p.trial + '</td>' +
        '<td>' + p.canceladas + '</td>' +
        '<td><div class="plan-total"><span style="width:' + pct + '%"></span></div>' + p.total + '</td>' +
        '</tr>';
    }).join('');

    const totalGeral = planos.reduce((a, p) => a + p.total, 0);
    html += '<tr class="plan-final">' +
      '<td>Total (com plano)</td><td>ÔÇö</td>' +
      '<td>' + planos.reduce((a, p) => a + p.ativas, 0) + '</td>' +
      '<td>' + planos.reduce((a, p) => a + p.trial, 0) + '</td>' +
      '<td>' + planos.reduce((a, p) => a + p.canceladas, 0) + '</td>' +
      '<td>' + totalGeral + '</td></tr>';

    if (semPlano > 0) {
      html += '<tr class="plan-final"><td>Sem plano</td><td>ÔÇö</td><td colspan="4">' + semPlano + ' loja(s) sem assinatura</td></tr>';
    }
    tbody.innerHTML = html;
  }

  /* ============================================================
     MODO SAL├âO (dono/profissional)
     ============================================================ */
  let stats = null;
  let logs = [];
  let assinatura = null;
  let clientes = [];

  function consultarTudo() {
    try { stats = API.dashboardStats('year'); } catch (e) { stats = null; }
    try { logs = API.meusLogsDeAcesso() || []; } catch (e) { logs = []; }
    try { assinatura = API.minhaAssinatura(); } catch (e) { assinatura = null; }
    clientes = [];
    try {
      for (let p = 1; p <= 10; p++) {
        const r = API.listarClientes({ page: p, limit: 200 });
        clientes = clientes.concat(r.items || []);
        if (!r.items || r.items.length < r.limit) break;
      }
    } catch (e) { /* sem acesso ├ás listas */ }
  }

  function prepararModoSalao() {
    const vazio = document.getElementById('planos-vazio');
    if (vazio) vazio.hidden = false;
    const cv = document.getElementById('chart-planos');
    if (cv) { cv.hidden = true; }
    const tb = document.getElementById('tabela-planos');
    if (tb) { tb.hidden = true; }
    setText('lbl-planos-sub', 'Para acompanhar as assinaturas da plataforma, entre como super-admin.');
  }

  function renderizarSalao() {
    const meses = ultimosMeses(12);

    const totalClientes = clientes.length;
    const clientesPorMes = {};
    clientes.forEach(c => {
      const k = String(c.created_at || '').slice(0, 7);
      if (k) clientesPorMes[k] = (clientesPorMes[k] || 0) + 1;
    });
    const novosAno = agregarPorMes(clientesPorMes, meses).reduce((a, b) => a + b, 0);

    const usoPorDia = (stats && stats.series_by_day) || {};
    const usoPorMes = {};
    Object.keys(usoPorDia).forEach(day => {
      const k = day.slice(0, 7);
      usoPorMes[k] = (usoPorMes[k] || 0) + usoPorDia[day];
    });
    const totalUso = Object.values(usoPorMes).reduce((a, b) => a + b, 0);

    const logins = logs.filter(l => String(l.acao || '').indexOf('login') === 0);
    const loginsPorDia = {};
    logins.forEach(l => {
      const k = String(l.timestamp || '').slice(0, 10);
      if (k) loginsPorDia[k] = (loginsPorDia[k] || 0) + 1;
    });
    const totalLogins = logins.length;

    setText('stat-clientes', totalClientes);
    setDelta('stat-clientes-delta', novosAno + ' novo(s) nos ├║ltimos 12 meses');

    setText('stat-agendamentos', totalUso);
    if (stats && stats.summary) {
      setDelta('stat-agendamentos-delta',
        stats.summary.concluded + ' conclu├¡do(s) ┬À ' +
        stats.summary.cancelled + ' cancelado(s) ┬À ' +
        stats.summary.completion_rate_pct + '% de conclus├úo');
    } else {
      setDelta('stat-agendamentos-delta', 'sem dados no per├¡odo');
    }

    if (assinatura) {
      const plano = assinatura.plan ? assinatura.plan.name : 'ÔÇö';
      let status = String(assinatura.status || '');
      if (status === 'trial') status = 'Trial';
      setText('stat-assinatura', plano + (status ? ' ┬À ' + status : ''));
      const delta = assinatura.on_trial
        ? (assinatura.days_left_in_trial + ' dia(s) restantes no trial')
        : (status === 'ativa' && assinatura.current_period_end
          ? 'V├ílida at├® ' + String(assinatura.current_period_end).slice(0, 10)
          : 'Plano ' + status);
      setDelta('stat-assinatura-delta', delta);
    } else {
      setText('stat-assinatura', 'ÔÇö');
      setDelta('stat-assinatura-delta', 'sem assinatura encontrada');
    }

    setText('stat-logins', totalLogins);
    const melhorDia = Object.keys(loginsPorDia).sort((a, b) => loginsPorDia[b] - loginsPorDia[a])[0];
    setDelta('stat-logins-delta', totalLogins > 0
      ? (melhorDia ? 'Pico: ' + melhorDia.slice(8, 10) + '/' + melhorDia.slice(5, 7) + ' ┬À ' + loginsPorDia[melhorDia] + ' login(s)' : '├║ltimos 30 dias')
      : '├║ltimos 30 dias ┬À sem registros');

    const valoresUso = agregarPorMes(usoPorMes, meses);
    const cvUso = document.getElementById('chart-uso');
    if (cvUso) {
      if (totalUso > 0) desenharBarras(cvUso, meses.map(m => m.rotulo), valoresUso, C.brass);
      else mensagemVazia(cvUso, 'Sem agendamentos no per├¡odo.');
    }

    const dias = ultimosDias(30);
    const valoresLogins = dias.map(d => loginsPorDia[d.key] || 0);
    const cvLogins = document.getElementById('chart-logins');
    if (cvLogins) {
      if (totalLogins > 0) desenharLinhas(cvLogins, dias.map(d => d.rotulo), valoresLogins, C.success);
      else mensagemVazia(cvLogins, 'Sem registros de login no per├¡odo.');
    }

    const valoresCx = agregarPorMes(clientesPorMes, meses);
    const cvCx = document.getElementById('chart-clientes');
    if (cvCx) {
      if (totalClientes > 0) desenharBarras(cvCx, meses.map(m => m.rotulo), valoresCx, C.brassSoft);
      else mensagemVazia(cvCx, 'Sem clientes cadastrados.');
    }
  }

  /* ============================================================
     INICIALIZA├ç├âO
     ============================================================ */
  const intervalo = modoPlataforma ? 30000 : 60000;

  if (modoPlataforma) {
    carregarPlataforma();
    setInterval(carregarPlataforma, intervalo);
  } else {
    prepararModoSalao();
    consultarTudo();
    renderizarSalao();
    marcarAtualizacao();
    setInterval(() => {
      consultarTudo();
      renderizarSalao();
      marcarAtualizacao();
    }, intervalo);
  }

  document.getElementById('btn-atualizar')?.addEventListener('click', () => {
    if (modoPlataforma) carregarPlataforma();
    else { consultarTudo(); renderizarSalao(); }
    marcarAtualizacao();
    showToast('Relat├│rio atualizado.');
  });

  let timerRedraw = null;
  window.addEventListener('resize', () => {
    clearTimeout(timerRedraw);
    timerRedraw = setTimeout(() => {
      if (modoPlataforma) carregarPlataforma();
      else renderizarSalao();
    }, 150);
  });
});
