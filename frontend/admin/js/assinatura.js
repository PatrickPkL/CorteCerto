/* ============================================================
   Corte Certo – admin/js/assinatura.js
   Status da assinatura, troca de planos via PIX (AbacatePay)
   e histórico de cobranças (RF-057..061, DT-12).
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

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function setHTML(id, v) { const el = document.getElementById(id); if (el) el.innerHTML = v; }

  const STATUS_LABEL = {
    trial: ['badge-pendente', 'Em trial'],
    ativa: ['badge-confirmado', 'Ativa'],
    cancelada: ['badge-cancelado', 'Cancelada']
  };

  let planos = [];
  try { planos = API.listarPlanos(); } catch (e) { /* noop */ }

  function render() {
    let sub;
    try { sub = API.minhaAssinatura(); } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }

    const [cls, label] = STATUS_LABEL[sub.status] || ['', sub.status];
    setText('st-plano', sub.plan ? sub.plan.name : '—');
    setHTML('st-status', '<span class="badge ' + cls + '">' + label + '</span>');
    setText('st-preco', sub.plan ? DB.fmtBRL(sub.plan.price_monthly) + '/mês' : '—');

    if (sub.on_trial) {
      setText('st-cobranca', DB.fmtDataBR(sub.trial_ends_at));
      setText('st-cobranca-nota', 'trial ativo — assine para continuar');
      setHTML('st-trial', 'Trial termina em <strong>' + sub.days_left_in_trial +
        ' dia(s)</strong> (' + DB.fmtDataBR(sub.trial_ends_at) + '). Assine um plano para continuar após o trial.');
      document.getElementById('box-trial').hidden = false;
    } else {
      const venceu = sub.current_period_end && sub.current_period_end < DB.hojeISO();
      setText('st-cobranca', sub.current_period_end ? DB.fmtDataBR(sub.current_period_end) : '—');
      setText('st-cobranca-nota', venceu ? 'período encerrado — renove o plano'
                                         : 'renovação ao pagar o PIX');
      document.getElementById('box-trial').hidden = true;
    }

    renderPlanos(sub);
    renderHistorico(sub);
  }

  /* ---------- cards de planos ---------- */
  function opcoesParcelas(plano) {
    const total = Math.round(plano.price_monthly * 12 * 100) / 100;
    const opcoes = [1, 2, 3, 6, 12].map(n => {
      const valor = Math.round((total / n) * 100) / 100;
      const rotulo = n === 1 ? ' (à vista)'
        : n === 12 ? ' (valor mensal)'
        : '';
      return '<option value="' + n + '">' + n + '× de ' + DB.fmtBRL(valor) + rotulo + '</option>';
    });
    return opcoes.join('');
  }

  let periodoGlobal = 'mensal';

  function aplicarPeriodoGlobal() {
    const anual = periodoGlobal === 'anual';
    document.querySelectorAll('#lista-planos .plan-card').forEach(card => {
      const plano = planos.find(p => String(p.id) === card.dataset.plano);
      if (!plano) return;
      const valorEl = card.querySelector('.plan-preco-valor');
      const unidEl = card.querySelector('.plan-preco-unidade');
      const nota = card.querySelector('.plan-anual-nota');
      const parc = card.querySelector('.plan-parcelas');
      valorEl.textContent = anual ? DB.fmtBRL(plano.price_monthly * 12) : DB.fmtBRL(plano.price_monthly);
      unidEl.textContent = anual ? '/ano' : '/mês';
      if (nota) nota.hidden = !anual;
      if (parc) parc.hidden = !anual;
    });
  }

  function renderPlanos(subAtual) {
    const box = document.getElementById('lista-planos');
    if (!box) return;

    const anual = periodoGlobal === 'anual';
    box.innerHTML = planos.map(p => {
      const atual = subAtual.plan && subAtual.plan.id === p.id;
      const limite = p.max_professionals == null
        ? 'Profissionais ilimitados'
        : 'Até ' + p.max_professionals + ' profissional(is)';
      const feats = (p.features || []).map(f => '<li>' + esc(f) + '</li>').join('');
      return '<div class="card plan-card' + (atual ? ' plan-card-highlight' : '') + '" data-plano="' + p.id + '">' +
        (atual ? '<span class="plan-badge">Plano atual</span>' : '') +
        '<h3 class="plan-nome">' + esc(p.name) + '</h3>' +
        '<div class="plan-preco mono">' +
          '<span class="plan-preco-valor">' + DB.fmtBRL(anual ? p.price_monthly * 12 : p.price_monthly) + '</span>' +
          '<small class="plan-preco-unidade">' + (anual ? '/ano' : '/mês') + '</small>' +
        '</div>' +
        '<div class="plan-anual-nota"' + (anual ? '' : ' hidden') + '>12 meses · mesmo valor mensal (' +
          DB.fmtBRL(p.price_monthly) + '/mês)</div>' +
        '<div class="plan-parcelas"' + (anual ? '' : ' hidden') + '>' +
          '<label>Parcelar em</label>' +
          '<select class="plan-parcelas-sel">' + opcoesParcelas(p) + '</select>' +
        '</div>' +
        '<ul class="plan-feats"><li>' + limite + '</li>' + feats + '</ul>' +
        '<button type="button" class="btn btn-brass btn-assinar" data-id="' + p.id + '">' +
          (atual ? 'Renovar' : 'Assinar via PIX') + '</button>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.btn-assinar').forEach(btn => {
      btn.addEventListener('click', () => {
        const plano = planos.find(p => String(p.id) === btn.dataset.id);
        const parcelas = periodoGlobal === 'anual'
          ? Number(btn.closest('.plan-card').querySelector('.plan-parcelas-sel').value) || 12
          : 1;
        if (plano) abrirPagamento(plano, periodoGlobal, parcelas);
      });
    });
  }

  /* ---------- modal de pagamento PIX ---------- */
  const modalPg = document.getElementById('modal-pagamento');
  let cobrancaId = null;
  let timerPoll = null;
  let timerRelogio = null;

  function pararTimers() {
    clearInterval(timerPoll);
    clearInterval(timerRelogio);
    timerPoll = timerRelogio = null;
  }

  function fecharPagamento() {
    pararTimers();
    cobrancaId = null;
    fecharModal(modalPg);
    render();
    montarShellAdmin();
  }

  function statusTexto(c) {
    if (c.status === 'paid') return 'Pagamento confirmado!';
    if (c.status === 'expired') return 'PIX expirado — clique em Assinar novamente para gerar outro.';
    if (c.status === 'cancelled') return 'Cobrança cancelada.';
    return 'Aguardando pagamento…';
  }

  function atualizarStatus(c) {
    const el = document.getElementById('pg-status');
    if (!el) return;
    el.textContent = statusTexto(c);
    if (c.status === 'paid') el.style.color = 'var(--success)';
    else if (c.status === 'expired' || c.status === 'cancelled') el.style.color = 'var(--warn-text)';
    else el.style.color = 'var(--text-muted)';
  }

  function iniciarRelogio(expiresAt) {
    const fim = new Date(expiresAt).getTime();
    clearInterval(timerRelogio);
    const tick = () => {
      const rest = Math.max(0, Math.floor((fim - Date.now()) / 1000));
      const mm = String(Math.floor(rest / 60)).padStart(2, '0');
      const ss = String(rest % 60).padStart(2, '0');
      const el = document.getElementById('pg-status');
      if (el && cobrancaId && rest > 0 &&
        el.textContent.indexOf('Aguardando') === 0) {
        el.textContent = 'Aguardando pagamento… expira em ' + mm + ':' + ss;
      }
      if (rest <= 0) clearInterval(timerRelogio);
    };
    tick();
    timerRelogio = setInterval(tick, 1000);
  }

  function mostrarCobranca(c, plano) {
    cobrancaId = c.id;
    const anual = c.billing_period === 365;
    let rotulo = 'Plano ' + c.plan_name + ' · ' + (anual ? 'anual' : '30 dias');
    if (anual && c.installments > 1) rotulo += ' · ' + c.installments + '×';
    if (anual && c.installments === 1) rotulo += ' · à vista';
    setText('pg-plano', rotulo);
    setText('pg-valor', DB.fmtBRL(c.amount_cents / 100));

    const qr = document.getElementById('pg-qrcode');
    const semqr = document.getElementById('pg-semqr');
    if (c.qr_base64) {
      qr.src = c.qr_base64;
      qr.hidden = false;
      semqr.hidden = true;
    } else {
      qr.hidden = true;
      semqr.hidden = false;
    }
    document.getElementById('pg-codigo').value = c.br_code || '';
    const btnSim = document.getElementById('pg-simular');
    const devAbacate = c.provider === 'abacatepay' && c.abacate_id;
    btnSim.hidden = !(c.provider === 'demo' || devAbacate);
    btnSim.textContent = devAbacate ? 'Simular pagamento (Dev mode)'
                                    : 'Simular pagamento (modo teste)';
    atualizarStatus(c);
    iniciarRelogio(c.expires_at);

    pararTimers(); // limpa poll anterior antes de recomeçar
    timerPoll = setInterval(() => {
      if (!cobrancaId) return;
      let st = null;
      try { st = API.statusCobranca(cobrancaId); }
      catch (e) { return; /* rede indisponível — tenta no próximo ciclo */ }
      atualizarStatus(st);
      if (st.status !== 'pending') {
        pararTimers();
        if (st.status === 'paid') {
          showToast('Pagamento confirmado! Plano ' + st.plan_name + ' ativo.', 'success');
          setTimeout(fecharPagamento, 900);
        }
      }
    }, 4000);

    abrirModal(modalPg);
  }

  function abrirPagamento(plano, periodo, parcelas) {
    let c;
    try { c = API.criarCobrancaPlano(plano.id, periodo || 'mensal', parcelas || 1); }
    catch (e) { showToast(msgErro(e), 'error'); return; }
    mostrarCobranca(c, plano);
  }

  document.getElementById('btn-fechar-pagamento')?.addEventListener('click', fecharPagamento);
  modalPg?.addEventListener('click', e => {
    if (e.target === modalPg) fecharPagamento();
  });

  document.getElementById('pg-copiar')?.addEventListener('click', () => {
    const inp = document.getElementById('pg-codigo');
    inp.select();
    const done = () => showToast('Código PIX copiado!', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(done).catch(() => {
        document.execCommand('copy'); done();
      });
    } else {
      document.execCommand('copy'); done();
    }
  });

  document.getElementById('pg-simular')?.addEventListener('click', () => {
    if (!cobrancaId) return;
    try {
      const c = API.simularCobranca(cobrancaId);
      atualizarStatus(c);
      if (c.status === 'paid') {
        showToast('Pagamento confirmado! Plano ' + c.plan_name + ' ativo.', 'success');
        setTimeout(fecharPagamento, 900);
      } else {
        showToast('Simulação enviada — confirmando…', 'info');
      }
    } catch (e) {
      showToast(msgErro(e), 'error');
    }
  });

  /* ---------- histórico real de cobranças ---------- */
  function badgeDe(status) {
    if (status === 'paid') return ['badge-confirmado', 'Pago'];
    if (status === 'pending') return ['badge-pendente', 'Aguardando'];
    if (status === 'expired') return ['badge-cancelado', 'Expirado'];
    return ['badge-cancelado', 'Cancelada'];
  }

  function renderHistorico(sub) {
    const tb = document.getElementById('tbody-cobrancas');
    if (!tb) return;

    let cobrancas = [];
    try { cobrancas = API.listarMinhasCobrancas() || []; } catch (e) { /* noop */ }

    const linhas = [];
    if (sub.on_trial) {
      linhas.push(
        '<tr><td>—</td><td>Trial — plano ' + esc(sub.plan ? sub.plan.name : '') + '</td>' +
        '<td class="mono">R$ 0,00</td><td><span class="badge badge-pendente">Trial</span></td></tr>');
    }
    cobrancas.forEach(c => {
      const [bCls, bTxt] = badgeDe(c.status);
      const anual = c.billing_period === 365;
      let desc = 'Plano ' + esc(c.plan_name) + (anual ? ' — anual' : ' — mensalidade');
      if (anual && c.installments > 1) desc += ' em ' + c.installments + '×';
      if (c.provider === 'demo') desc += ' <small>(teste)</small>';
      linhas.push(
        '<tr><td class="mono">' + DB.fmtDataBR(String(c.created_at).slice(0, 10)) + '</td>' +
        '<td>' + desc + '</td>' +
        '<td class="mono">' + DB.fmtBRL(c.amount_cents / 100) + '</td>' +
        '<td><span class="badge ' + bCls + '">' + bTxt + '</span></td></tr>');
    });

    tb.innerHTML = linhas.join('') ||
      '<tr><td colspan="4" style="color:var(--text-muted)">Sem cobranças registradas.</td></tr>';
  }

  /* ---------- cancelar assinatura ---------- */
  document.getElementById('btn-cancelar-assinatura')?.addEventListener('click', () => {
    if (!confirm('Cancelar a assinatura? O painel seguirá acessível até o fim do período já pago.')) return;
    try {
      API.cancelarAssinatura();
      showToast('Assinatura cancelada.', 'error');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- seletor global Mensal/Anual ---------- */
  document.querySelectorAll('.plan-tgl-global .plan-tgl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const per = btn.dataset.per;
      document.querySelectorAll('.plan-tgl-global .plan-tgl-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.per === per);
      });
      periodoGlobal = per;
      aplicarPeriodoGlobal();
    });
  });

  render();
});
