/* ============================================================
   Corte Certo – admin/js/assinatura.js
   Status da assinatura e troca de planos (RF-057..061, DT-12).
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
      setHTML('st-trial', 'Trial termina em <strong>' + sub.days_left_in_trial +
        ' dia(s)</strong> (' + DB.fmtDataBR(sub.trial_ends_at) + '). Escolha um plano para continuar.');
      document.getElementById('box-trial').hidden = false;
    } else {
      document.getElementById('box-trial').hidden = true;
    }

    renderPlanos(sub);
    renderHistorico(sub);
  }

  /* ---------- cards de planos ---------- */
  function renderPlanos(subAtual) {
    const box = document.getElementById('lista-planos');
    if (!box) return;

    box.innerHTML = planos.map(p => {
      const atual = subAtual.plan && subAtual.plan.id === p.id;
      const limite = p.max_professionals == null
        ? 'Profissionais ilimitados'
        : 'Até ' + p.max_professionals + ' profissional(is)';
      const feats = (p.features || []).map(f => '<li>' + esc(f) + '</li>').join('');
      return '<div class="card plan-card' + (atual ? ' plan-card-highlight' : '') + '" data-plano="' + p.id + '">' +
        (atual ? '<span class="plan-badge">Plano atual</span>' : '') +
        '<h3 class="plan-nome">' + esc(p.name) + '</h3>' +
        '<div class="plan-preco mono">' + DB.fmtBRL(p.price_monthly) + '<small>/mês</small></div>' +
        '<ul class="plan-feats"><li>' + limite + '</li>' + feats + '</ul>' +
        '<button type="button" class="btn ' + (atual ? 'btn-outline' : 'btn-brass') +
          ' btn-trocar-plano" data-id="' + p.id + '"' + (atual ? ' disabled' : '') + '>' +
          (atual ? 'Seu plano atual' : 'Selecionar') + '</button>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.btn-trocar-plano:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const plano = planos.find(p => String(p.id) === btn.dataset.id);
        if (!plano) return;
        if (!confirm('Mudar para o plano "' + plano.name + '" (' +
          DB.fmtBRL(plano.price_monthly) + '/mês)?')) return;
        try {
          API.trocarPlano(plano.id);
          showToast('Plano alterado para ' + plano.name + '!' +
            (subAtual.on_trial ? ' Seu trial continua até o prazo original.' : ''));
          montarShellAdmin();
          render();
        } catch (err2) {
          showToast(msgErro(err2), 'error');
        }
      });
    });
  }

  /* ---------- histórico simples a partir do período atual ---------- */
  function renderHistorico(sub) {
    const tb = document.getElementById('tbody-cobrancas');
    if (!tb) return;
    const linhas = [];
    const hojeISO = DB.hojeISO();

    if (sub.on_trial) {
      linhas.push(
        '<tr><td>—</td><td>Trial — plano ' + esc(sub.plan ? sub.plan.name : '') + '</td>' +
        '<td class="mono">R$ 0,00</td><td><span class="badge badge-pendente">Trial</span></td></tr>');
    }
    if (sub.current_period_end && !sub.on_trial) {
      linhas.push(
        '<tr><td class="mono">' + DB.fmtDataBR(sub.current_period_end) + '</td>' +
        '<td>Mensalidade — plano ' + esc(sub.plan ? sub.plan.name : '') + '</td>' +
        '<td class="mono">' + (sub.plan ? DB.fmtBRL(sub.plan.price_monthly) : '—') + '</td>' +
        '<td><span class="badge ' + (sub.status === 'cancelada' ? 'badge-cancelado' : 'badge-confirmado') + '">' +
          (sub.status === 'cancelada' ? 'Cancelada' : 'A vencer') + '</span></td></tr>');
    }
    void hojeISO;

    tb.innerHTML = linhas.join('') ||
      '<tr><td colspan="4" style="color:var(--text-muted)">Sem cobranças registradas.</td></tr>';
  }

  /* ---------- cancelar assinatura ---------- */
  document.getElementById('btn-cancelar-assinatura')?.addEventListener('click', () => {
    if (!confirm('Cancelar a assinatura? O painel seguirá acessível, mas novos recursos podem ser bloqueados.')) return;
    try {
      API.cancelarAssinatura();
      showToast('Assinatura cancelada.', 'error');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  render();
});
