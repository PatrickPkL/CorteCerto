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

  /* motivo do redirecionamento (ação bloqueada por falta de assinatura) */
  try {
    const aviso = sessionStorage.getItem('cc_assinatura_aviso');
    if (aviso) {
      sessionStorage.removeItem('cc_assinatura_aviso');
      showToast(aviso, 'error');
    }
  } catch (e) { /* sessionStorage indisponível */ }

  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function setHTML(id, v) { const el = document.getElementById(id); if (el) el.innerHTML = v; }

  const STATUS_LABEL = {
    trial: ['badge-pendente', '10 dias grátis'],
    ativa: ['badge-confirmado', 'Ativa'],
    cancelada: ['badge-cancelado', 'Cancelada'],
    expirada: ['badge-cancelado', 'Expirada']
  };

  let planos = [];
  try { planos = API.listarPlanos(); } catch (e) { /* noop */ }

  /* Ao expirar os 10 dias grátis, abre automaticamente a cobrança PIX
     (código + QR Code) uma vez por carregamento da página. */
  let cobrancaAutoAberta = false;

  function render() {
    let sub;
    try { sub = API.minhaAssinatura(); } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }

    const [cls, label] = STATUS_LABEL[sub.status] || ['', 'Sem assinatura'];
    setHTML('st-status', '<span class="badge ' + cls + '">' + label + '</span>');
    setText('st-plano', sub.plano_efetivo ? sub.plano_efetivo.name : (sub.plan ? sub.plan.name : '—'));
    setText('st-preco', sub.plano_efetivo ? DB.fmtBRL(sub.plano_efetivo.price_monthly) + '/mês' : '—');

    let liberado = false;
    try { liberado = !!API.acessoLiberado(loja.id); } catch (e) { liberado = false; }

    if (sub.on_trial) {
      const valorPlano = sub.plan ? DB.fmtBRL(sub.plan.price_monthly) + '/mês' : '—';
      setText('st-cobranca', DB.fmtDataBR(sub.trial_ends_at));
      setText('st-cobranca-nota', 'fim dos 10 dias grátis');
      setHTML('st-trial', 'Você está nos <strong>10 dias grátis</strong> do plano ' +
        esc(sub.plan ? sub.plan.name : '') + ' — termina em <strong>' + sub.days_left_in_trial +
        ' dia(s)</strong> (' + DB.fmtDataBR(sub.trial_ends_at) + '). Depois disso, o sistema gera ' +
        'automaticamente a cobrança de ' + valorPlano + '.');
      document.getElementById('box-trial').hidden = false;
    } else {
      const venceu = sub.current_period_end && sub.current_period_end < DB.hojeISO();
      setText('st-cobranca', sub.current_period_end ? DB.fmtDataBR(sub.current_period_end) : '—');
      setText('st-cobranca-nota', venceu ? 'período encerrado — renove o plano'
                                         : 'renovação ao pagar o PIX');
      document.getElementById('box-trial').hidden = true;
    }

    const devePagar = !liberado && !sub.on_trial && !!(sub.plan || sub.trial_usado);
    const boxPend = document.getElementById('box-pendente');
    if (boxPend) {
      boxPend.hidden = !devePagar;
      if (devePagar) {
        setText('st-pendente', 'Seus 10 dias grátis terminaram. Pague o PIX abaixo para ' +
          'reativar o acesso' + (sub.plan ? ' ao plano ' + sub.plan.name : '') + '.');
      }
    }

    renderPlanos(sub);
    renderHistorico(sub);

    /* Assinatura inativa (trial expirado/cancelado): leva direto para a
       cobrança PIX com o código copia-e-cola e o QR Code. */
    if (devePagar && sub.plan && !cobrancaAutoAberta) {
      cobrancaAutoAberta = true;
      setTimeout(() => {
        try {
          /* força PIX (código + QR) como método da cobrança pós-trial */
          const pixBtn = modalPg.querySelector('.plan-metodo-tgl .plan-tgl-btn[data-metodo="pix"]');
          if (pixBtn && !pixBtn.classList.contains('active')) pixBtn.click();
          abrirPagamento(sub.plan, 'mensal', 1);
        } catch (e) { showToast(msgErro(e), 'error'); }
      }, 60);
    }
  }

  /* ---------- cards de planos ---------- */
  function opcoesParcelas(plano) {
    const total = Math.round(
      ((plano.price_annual != null && Number(plano.price_annual) > 0
        ? Number(plano.price_annual)
        : Number(plano.price_monthly) * 12) * 100)
    ) / 100;
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
      const base = anual
        ? (plano.price_annual != null && Number(plano.price_annual) > 0
          ? Number(plano.price_annual) : Number(plano.price_monthly) * 12)
        : Number(plano.price_monthly);
      const riscado = card.querySelector('.plan-preco-riscado');
      const valorEl = card.querySelector('.plan-preco-valor');
      const unidEl = card.querySelector('.plan-preco-unidade');
      const nota = card.querySelector('.plan-anual-nota');
      const parc = card.querySelector('.plan-parcelas');
      if (riscado) {
        /* card em trial: preço cheio riscado + R$ 0,00 nos 10 primeiros dias */
        riscado.textContent = DB.fmtBRL(base);
        if (valorEl) valorEl.textContent = 'R$ 0,00';
        if (unidEl) unidEl.textContent = 'nos primeiros 10 dias';
        const depois = card.querySelector('.plan-preco-depois');
        if (depois) depois.textContent = 'Depois ' + DB.fmtBRL(base) +
          (anual ? '/ano' : '/mês') + ' · cancele quando quiser';
        return;
      }
      if (valorEl) valorEl.textContent = DB.fmtBRL(base);
      if (unidEl) unidEl.textContent = anual ? '/ano' : '/mês';
      if (nota) nota.hidden = !anual;
      if (parc) parc.hidden = !anual;
    });
  }

  function renderPlanos(subAtual) {
    const box = document.getElementById('lista-planos');
    if (!box) return;

    const podeTrial = !subAtual.trial_usado && !subAtual.on_trial;
    const anual = periodoGlobal === 'anual';
    box.innerHTML = planos.map(p => {
      const atual = subAtual.plano_efetivo && subAtual.plano_efetivo.id === p.id;
      const anualBase = p.price_annual != null && Number(p.price_annual) > 0
        ? Number(p.price_annual)
        : Number(p.price_monthly) * 12;
      const limite = p.max_professionals == null
        ? 'Profissionais ilimitados'
        : 'Até ' + p.max_professionals + ' profissional(is)';
      const feats = (p.features || []).map(f => '<li>' + esc(f) + '</li>').join('');

      let botao;
      if (p.is_free) {
        botao = '<button type="button" class="btn" disabled title="Plano base gratuito — assine para liberar recursos">' +
          (atual ? 'Plano atual' : 'Plano base') + '</button>';
      } else if (podeTrial) {
        botao = '<button type="button" class="btn btn-brass btn-assinar-trial" data-id="' + p.id + '">' +
          'Começar 10 dias grátis</button>';
      } else {
        botao = '<button type="button" class="btn btn-brass btn-assinar" data-id="' + p.id + '">' +
          (atual ? 'Renovar' : 'Assinar agora') + '</button>';
      }

      const preco = podeTrial
        ? '<div class="plan-preco mono">' +
            '<span class="plan-preco-riscado">' + DB.fmtBRL(anual ? anualBase : p.price_monthly) + '</span>' +
            '<span class="plan-preco-valor">R$ 0,00</span>' +
            '<small class="plan-preco-unidade">nos primeiros 10 dias</small>' +
          '</div>' +
          '<div class="plan-preco-depois">Depois ' + DB.fmtBRL(anual ? anualBase : p.price_monthly) +
            (anual ? '/ano' : '/mês') + ' · cancele quando quiser</div>'
        : '<div class="plan-preco mono">' +
            '<span class="plan-preco-valor">' + DB.fmtBRL(anual ? anualBase : p.price_monthly) + '</span>' +
            '<small class="plan-preco-unidade">' + (anual ? '/ano' : '/mês') + '</small>' +
          '</div>' +
          '<div class="plan-anual-nota"' + (anual ? '' : ' hidden') + '>12 meses · parcelas a partir de ' +
            DB.fmtBRL(Math.round(anualBase / 12 * 100) / 100) + '/mês</div>' +
          '<div class="plan-parcelas"' + (anual ? '' : ' hidden') + '>' +
            '<label>Parcelar em</label>' +
            '<select class="plan-parcelas-sel">' + opcoesParcelas(p) + '</select>' +
          '</div>';

      return '<div class="card plan-card' + (atual ? ' plan-card-highlight' : '') + '" data-plano="' + p.id + '"' +
          (podeTrial ? ' data-trial="1"' : '') + '>' +
        (atual ? '<span class="plan-badge">Plano atual</span>' : '') +
        '<h3 class="plan-nome">' + esc(p.name) + '</h3>' +
        preco +
        '<ul class="plan-feats"><li>' + limite + '</li>' + feats + '</ul>' +
        botao +
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

    box.querySelectorAll('.btn-assinar-trial').forEach(btn => {
      btn.addEventListener('click', () => {
        const plano = planos.find(p => String(p.id) === btn.dataset.id);
        if (!plano) return;
        if (!confirm('Começar 10 dias grátis no plano ' + plano.name +
          '? Depois do período, a cobrança do plano é gerada automaticamente.')) return;
        try {
          API.assinarComTrial(plano.id);
          showToast('10 dias grátis ativados no plano ' + plano.name + '!', 'success');
          render();
          montarShellAdmin();
        } catch (e) {
          showToast(msgErro(e), 'error');
          render();
        }
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
    ['pg-card-numero', 'pg-card-titular', 'pg-card-validade', 'pg-card-cvv'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const marca = document.getElementById('pg-card-marca');
    if (marca) marca.textContent = '';
    fecharModal(modalPg);
    render();
  }

  function metodoSelecionado() {
    const ativo = modalPg?.querySelector('.plan-metodo-tgl .plan-tgl-btn.active');
    return ativo ? ativo.dataset.metodo : 'pix';
  }

  /* troca de método dentro do modal */
  modalPg?.querySelectorAll('.plan-metodo-tgl .plan-tgl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modalPg.querySelectorAll('.plan-metodo-tgl .plan-tgl-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.dataset.metodo;
      const titulo = document.getElementById('pg-titulo');
      if (titulo) titulo.textContent = m === 'cartao' ? 'Pagar com Cartão' : 'Pagar com PIX';
      const pixBox = document.getElementById('pg-pix-box');
      const cartaoBox = document.getElementById('pg-cartao-box');
      if (pixBox) pixBox.style.display = m === 'pix' ? 'block' : 'none';
      if (cartaoBox) cartaoBox.style.display = m === 'cartao' ? 'block' : 'none';
      const st = document.getElementById('pg-status');
      if (st) { st.textContent = 'Escolha o método e confirme.'; st.style.color = 'var(--text-muted)'; }
    });
  });

  /* máscaras do formulário de cartão */
  const inpNumero = document.getElementById('pg-card-numero');
  inpNumero?.addEventListener('input', () => {
    inpNumero.value = (inpNumero.value.replace(/\D/g, '').slice(0, 16).match(/.{1,4}/g) || []).join(' ');
  });
  const inpVal = document.getElementById('pg-card-validade');
  inpVal?.addEventListener('input', () => {
    let v = inpVal.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    inpVal.value = v;
  });
  const inpCvv = document.getElementById('pg-card-cvv');
  inpCvv?.addEventListener('input', () => { inpCvv.value = inpCvv.value.replace(/\D/g, '').slice(0, 4); });

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
    const titulo = document.getElementById('pg-titulo');
    if (titulo) titulo.textContent = c.metodo === 'cartao' ? 'Pagar com Cartão' : 'Pagar com PIX';
    setText('pg-plano', rotulo);
    setText('pg-valor', DB.fmtBRL(c.amount_cents / 100));

    const pixBox = document.getElementById('pg-pix-box');
    const cartaoBox = document.getElementById('pg-cartao-box');
    if (pixBox) pixBox.style.display = c.metodo === 'cartao' ? 'none' : 'block';
    if (cartaoBox) cartaoBox.style.display = c.metodo === 'cartao' ? 'block' : 'none';

    if (c.metodo === 'cartao') {
      const marca = document.getElementById('pg-card-marca');
      if (marca) {
        marca.textContent = c.card_brand
          ? 'Cartão ' + c.card_brand + (c.card_last4 ? ' •••• ' + c.card_last4 : '')
          : '';
      }
      document.querySelectorAll('.plan-metodo-tgl .plan-tgl-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.metodo === 'cartao'));
    }

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
    const metodo = metodoSelecionado();
    let c;
    try {
      if (metodo === 'cartao') {
        const cardData = {
          numero: document.getElementById('pg-card-numero').value.replace(/\s/g, ''),
          titular: document.getElementById('pg-card-titular').value.trim(),
          validade: document.getElementById('pg-card-validade').value.trim(),
          cvv: document.getElementById('pg-card-cvv').value.trim()
        };
        c = API.criarCobrancaPlano(plano.id, periodo || 'mensal', parcelas || 1, 'cartao', cardData);
      } else {
        c = API.criarCobrancaPlano(plano.id, periodo || 'mensal', parcelas || 1, 'pix');
      }
    } catch (e) { showToast(msgErro(e), 'error'); return; }
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

  /* ---------- pagar a cobrança gerada ao fim dos 10 dias ---------- */
  document.getElementById('btn-pagar-pendente')?.addEventListener('click', () => {
    let sub = null;
    try { sub = API.minhaAssinatura(); } catch (e) { /* noop */ }
    const plano = planos.find(p => String(p.id) === (sub && sub.plan && sub.plan.id));
    if (!plano) { showToast('Plano não encontrado.', 'error'); return; }
    abrirPagamento(plano, 'mensal', 1);
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
