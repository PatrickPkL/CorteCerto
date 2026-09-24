/* ============================================================
   Corte Comigo – public/js/telainicial.js
   Coreografia da splash: logo surge (fade-in), pausa, a tela
   preta some (fade-out) e o nó é removido do DOM revelando a
   página. Total ≈ 2,8s em toda visita.
   Também renderiza os planos e preços (sempre visíveis) para
   que qualquer visitante possa ver e assinar.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;

  /* fallback: se a imagem faltar, troca por marca em texto */
  const logo = document.getElementById('splash-logo');
  logo?.addEventListener('error', () => {
    const marca = document.createElement('div');
    marca.className = 'splash-marca';
    marca.innerHTML = 'Corte<span>Certo</span>';
    logo.replaceWith(marca);
  });

  /* logo do hero: se a imagem faltar, esconde */
  document.querySelectorAll('img.hero-logo').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  /* respeita quem prefere menos movimento */
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T_ENTRA = reduz ? 0 : 900;   // fade-in da logo
  const T_PARA  = reduz ? 300 : 1200; // pausa com a tela cheia
  const T_SAI   = reduz ? 0 : 700;   // fade-out da tela preta

  requestAnimationFrame(() => splash.classList.add('splash-pronta'));

  setTimeout(() => {
    splash.classList.add('splash-saindo');
    setTimeout(() => splash.remove(), T_SAI + 60);
  }, T_ENTRA + T_PARA);

  /* área de autenticação no header (shared.js) */
  if (typeof renderNavAuth === 'function') renderNavAuth();

  renderPlanosHome();
});

/* ---------------- Planos e preços (sempre visíveis) ----------------
   Dono de salão já logado vai direto assinar no painel (/assinatura).
   Qualquer outro visitante passa pelo login para criar/entrar na conta
   do salão — pois assinar exige um salão vinculado. */

function destinoAssinatura() {
  try {
    const u = Auth.usuarioAtual();
    if (u && u.role === 'dono' && Auth.salaoDoUsuario(u)) return '/assinatura';
  } catch (e) { /* noop */ }
  return '/login';
}

function renderPlanosHome() {
  const box = document.getElementById('lista-planos-home');
  if (!box) return;

  let planos = [];
  try { planos = API.listarPlanos() || []; } catch (e) { planos = []; }

  if (!planos.length) {
    box.innerHTML = '<p class="planos-vazio">Em breve você confere aqui os planos do salão. ' +
      'Enquanto isso, entre na sua conta para conhecer o painel.</p>';
    return;
  }

  planos.sort((a, b) => Number(a.price_monthly) - Number(b.price_monthly));
  let periodo = 'mensal';

  function precoHTML(p) {
    const anual = periodo === 'anual';
    if (p.is_free) {
      const compare = p.price_compare != null ? Number(p.price_compare) : 0;
      return '<div class="plan-preco mono">' +
        (compare > 0 ? '<span class="plan-preco-riscado">' + DB.fmtBRL(compare) + '</span>' : '') +
        '<span class="plan-preco-valor">R$ 0,00</span>' +
        '<small class="plan-preco-unidade">sempre</small>' +
        '</div>' +
        '<div class="plan-preco-depois">Sem cartão · sem surpresa</div>';
    }
    const base = anual && Number(p.price_annual) > 0
      ? Number(p.price_annual) : Number(p.price_monthly);
    return '<div class="plan-preco mono">' +
      '<span class="plan-preco-valor">' + DB.fmtBRL(base) + '</span>' +
      '<small class="plan-preco-unidade">' + (anual ? '/ano' : '/mês') + '</small>' +
      '</div>' +
      (anual && Number(p.price_annual) > 0
        ? '<div class="plan-anual-nota">12 meses · parcelas a partir de ' +
          DB.fmtBRL(Math.round((Number(p.price_annual) / 12) * 100) / 100) + '/mês</div>'
        : '');
  }

  function cartaoHTML(p) {
    const limite = p.max_professionals == null
      ? 'Profissionais ilimitados'
      : 'Até ' + p.max_professionals + ' profissional(is)';
    const feats = (p.features || []).map(f => '<li>' + esc(f) + '</li>').join('');
    const badge = p.is_free
      ? '<span class="plan-badge">Grátis</span>'
      : '<span class="plan-badge">10 dias grátis</span>';
    const cta = p.is_free
      ? '<button type="button" class="btn" disabled ' +
        'title="Plano base — assine um plano pago para liberar todos os recursos">Plano grátis</button>'
      : '<a class="btn btn-brass" href="' + destinoAssinatura() + '">Assinar agora</a>';
    return '<div class="plan-card' + (p.is_free ? ' plan-card-free' : '') + '">' +
      badge +
      '<h3 class="plan-nome">' + esc(p.name) + '</h3>' +
      precoHTML(p) +
      '<ul class="plan-feats"><li>' + limite + '</li>' + feats + '</ul>' +
      cta +
      '</div>';
  }

  function render() {
    box.innerHTML = planos.map(cartaoHTML).join('');
  }

  document.querySelectorAll('.planos-home .plan-tgl-global .plan-tgl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const per = btn.dataset.per;
      document.querySelectorAll('.planos-home .plan-tgl-global .plan-tgl-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.per === per);
      });
      periodo = per;
      render();
    });
  });

  render();
}
