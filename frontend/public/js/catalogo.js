/* ============================================================
   Corte Certo – public/js/catalogo.js
   Catálogo público com busca server-like (RF-050..054).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid-saloes');
  const estadoVazio = document.getElementById('estado-vazio');
  const busca = document.getElementById('busca-salao');
  const filtroCidade = document.getElementById('filtro-cidade');
  const filtroServico = document.getElementById('filtro-servico');
  const sugestoesBox = document.getElementById('sugestoes');
  if (!grid) return;

  function cardLoja(l) {
    const capa = l.logo_url || l.cover_url; // foto de perfil manda no card
    const capaStyle = capa ? ' style="background:#000 url(&quot;' + esc(capa) + '&quot;) center/cover no-repeat;"' : '';
    const tags = (l.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    const match = l.type === 'service' && l.matched_service
      ? '<div class="salon-match">Serviço: <strong>' + esc(l.matched_service.name) + '</strong></div>'
      : (l.type === 'professional' && l.matched_professional
        ? '<div class="salon-match">Profissional: <strong>' + esc(l.matched_professional.name) + '</strong></div>'
        : '');
    const rating = Number(l.rating_avg || 0).toFixed(1);

    return '<a href="salao-publico.html?id=' + l.id + '" class="salon-card">' +
      '<div class="salon-card-cover"' + capaStyle + '></div>' +
      '<div class="salon-card-body">' +
        '<div class="salon-name">' + esc(l.name) + '</div>' +
        '<div class="salon-meta"><span class="rating">★ ' + rating + '</span>' +
          (l.rating_count ? ' (' + l.rating_count + ')' : '') +
          ' · ' + esc((l.city || 'Cidade não informada') + (l.uf ? ', ' + l.uf : '')) + '</div>' +
        match +
        '<div class="tag-list">' + tags + '</div>' +
        '<span class="btn btn-outline">Ver barbearia</span>' +
      '</div>' +
    '</a>';
  }

  /* ---------- filtros dinâmicos (cidades e serviços reais) ---------- */
  function popularFiltros() {
    let lojas = [];
    try { lojas = API.buscar({ type: 'shops', limit: 100 }).items; } catch (e) { return; }

    if (filtroCidade) {
      const cidades = Array.from(new Set(
        lojas.filter(l => l.city).map(l => JSON.stringify({ city: l.city.toLowerCase(), label: l.city + (l.uf ? ', ' + l.uf : '') }))
      )).map(s => JSON.parse(s)).sort((a, b) => a.label.localeCompare(b.label));

      filtroCidade.innerHTML = '<option value="">Todas as cidades</option>' +
        cidades.map(c => '<option value="' + esc(c.city) + '">' + esc(c.label) + '</option>').join('');
    }

    if (filtroServico) {
      const nomes = new Set();
      lojas.forEach(l => (l.tags || []).forEach(t => nomes.add(t)));
      try {
        API.servicosPublicos().forEach(s => nomes.add(s.name));
      } catch (e) { /* noop */ }
      const ordenados = Array.from(nomes).sort((a, b) => a.localeCompare(b));
      filtroServico.innerHTML = '<option value="">Todos os serviços</option>' +
        ordenados.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
    }
  }

  /* ---------- listagem ---------- */
  function render() {
    const termo = busca?.value.trim() || '';
    const cidade = filtroCidade?.value || '';
    const servico = filtroServico?.value || '';

    let res;
    try {
      res = API.buscar({
        type: servico ? 'services' : 'shops',
        q: servico || termo,
        city: cidade,
        limit: 60,
        sort: termo ? 'relevance' : 'rating'
      });
    } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }

    grid.innerHTML = res.items.map(cardLoja).join('');
    if (estadoVazio) estadoVazio.style.display = res.items.length ? 'none' : '';
  }

  /* ---------- autocomplete (RF-054) ---------- */
  function renderSugestoes() {
    if (!sugestoesBox) return;
    const q = busca.value.trim();
    if (q.length < 2) { sugestoesBox.innerHTML = ''; sugestoesBox.hidden = true; return; }

    let sugs = [];
    try { sugs = API.sugestoes(q).suggestions; } catch (e) { /* noop */ }
    if (!sugs.length) { sugestoesBox.innerHTML = ''; sugestoesBox.hidden = true; return; }

    sugestoesBox.hidden = false;
    sugestoesBox.innerHTML = sugs.map((s, i) =>
      '<button type="button" class="suggestion-item" data-texto="' + esc(s.text) + '">' +
        '<strong>' + esc(s.text) + '</strong>' +
        '<small>' + (s.type === 'service' ? 'Serviço · ' : '') + esc(s.sub || '') + '</small>' +
      '</button>').join('');

    sugestoesBox.querySelectorAll('.suggestion-item').forEach(btn => {
      btn.addEventListener('click', () => {
        busca.value = btn.dataset.texto;
        sugestoesBox.hidden = true;
        render();
      });
    });
  }

  busca?.addEventListener('input', debounce(() => { renderSugestoes(); render(); }, 250));
  busca?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sugestoesBox) sugestoesBox.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (sugestoesBox && !sugestoesBox.contains(e.target) && e.target !== busca) {
      sugestoesBox.hidden = true;
    }
  });
  filtroCidade?.addEventListener('change', render);
  filtroServico?.addEventListener('change', render);

  popularFiltros();
  render();

  /* geolocation: lojas perto de mim */
  var btnGeo = document.getElementById('btn-proximas');
  if (btnGeo) {
    btnGeo.addEventListener('click', function() {
      if (!navigator.geolocation) {
        showToast('Geolocalização não suportada.', 'error');
        return;
      }
      function buscarLojas() {
        btnGeo.disabled = true;
        btnGeo.textContent = 'Buscando...';
        navigator.geolocation.getCurrentPosition(function(pos) {
        try {
          var res = API.lojasProximas({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            raio: 30
          });
          grid.innerHTML = res.items.map(cardLoja).join('');
          if (estadoVazio) estadoVazio.style.display = res.items.length ? 'none' : '';
          showToast(res.items.length + ' barbearia(s) encontrada(s) perto de você!');
        } catch (e) {
          showToast(msgErro(e), 'error');
        }
        btnGeo.disabled = false;
        btnGeo.textContent = 'Lojas perto de mim';
      }, function(err) {
        showToast('Não foi possível obter sua localização.', 'error');
        btnGeo.disabled = false;
        btnGeo.textContent = 'Lojas perto de mim';
      }, { timeout: 10000 });
      }
      if (localStorage.getItem('cc_geo_consent')) {
        buscarLojas();
      } else {
        if (confirm('O Corte Certo deseja acessar sua localização para encontrar barbearias perto de você. Você pode revogar este acesso a qualquer momento nas configurações do navegador. Continuar?')) {
          localStorage.setItem('cc_geo_consent', '1');
          buscarLojas();
        } else {
          showToast('Acesso à localização negado. Use a busca por CEP.', 'error');
        }
      }
    });
  }
});
