/* ============================================================
   Corte Certo – super-admin/js/planos-sa.js
   Edição de preços dos planos e modo grátis global.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var btnSair = document.getElementById('btn-sair');
  var tglGratis = document.getElementById('tgl-site-gratis');
  var lblGratis = document.getElementById('lbl-site-gratis');
  var avisoGratis = document.getElementById('aviso-site-gratis');
  var tbodyPlanos = document.getElementById('tbody-planos');

  if (btnSair) {
    btnSair.addEventListener('click', function (e) {
      e.preventDefault();
      saAuth.logout();
    });
  }

  function tratarNaoAutorizado(res) {
    if (res.status === 401 || res.status === 403) {
      saAuth.logout();
      return true;
    }
    return false;
  }

  function atualizarRotulos() {
    var ativo = !!(tglGratis && tglGratis.checked);
    if (lblGratis) lblGratis.textContent = ativo ? 'Ligado' : 'Desligado';
    if (avisoGratis) avisoGratis.hidden = !ativo;
  }

  /* ---------- configuração global ---------- */
  function carregarConfig() {
    fetch('/api/super-admin/config', { headers: saAuth.headers() })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) { showToast(env.error, 'error'); return; }
        var cfg = env.data || {};
        if (tglGratis) tglGratis.checked = !!cfg.site_gratis;
        atualizarRotulos();
      })
      .catch(function () { showToast('Erro ao carregar configuração.', 'error'); });
  }

  function salvarConfig(ativo) {
    fetch('/api/super-admin/config', {
      method: 'PUT',
      headers: saAuth.headers(),
      body: JSON.stringify({ site_gratis: ativo })
    })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) {
          showToast(env.error, 'error');
          if (tglGratis) tglGratis.checked = !ativo;
          atualizarRotulos();
          return;
        }
        showToast(ativo ? 'Modo grátis ATIVADO para todo o site.'
                        : 'Modo grátis desativado.', ativo ? 'success' : 'info');
        atualizarRotulos();
      })
      .catch(function () {
        showToast('Erro ao salvar configuração.', 'error');
        if (tglGratis) tglGratis.checked = !ativo;
        atualizarRotulos();
      });
  }

  if (tglGratis) {
    tglGratis.addEventListener('change', function () { salvarConfig(!!tglGratis.checked); });
  }

  /* ---------- preços dos planos ---------- */
  function carregarPlanos() {
    fetch('/api/super-admin/planos', { headers: saAuth.headers() })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) { showToast(env.error, 'error'); return; }
        renderPlanos(env.data || []);
      })
      .catch(function () {
        if (tbodyPlanos) {
          tbodyPlanos.innerHTML = '<tr><td colspan="5" class="sa-loading">Erro ao carregar planos.</td></tr>';
        }
      });
  }

  function valorInput(v) {
    return (Number(v) || 0).toFixed(2);
  }

  function renderPlanos(planos) {
    if (!tbodyPlanos) return;
    if (!planos.length) {
      tbodyPlanos.innerHTML = '<tr><td colspan="5" class="sa-loading">Nenhum plano cadastrado.</td></tr>';
      return;
    }
    tbodyPlanos.innerHTML = planos.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><strong>' + esc(p.name) + '</strong>' +
          (p.is_free ? ' <span class="sa-tag">grátis</span>' : '') + '</td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_monthly" value="' + valorInput(p.price_monthly) + '"></td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_annual" value="' + valorInput(p.price_annual) + '"></td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_per_employee" value="' + valorInput(p.price_per_employee) + '"></td>' +
        '<td><button type="button" class="sa-btn-salvar">Salvar</button></td>' +
      '</tr>';
    }).join('');

    tbodyPlanos.querySelectorAll('.sa-btn-salvar').forEach(function (btn) {
      btn.addEventListener('click', function () { salvarPlano(btn.closest('tr')); });
    });
  }

  function salvarPlano(tr) {
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var dados = {};
    tr.querySelectorAll('.sa-input').forEach(function (inp) {
      dados[inp.getAttribute('data-campo')] = Number(String(inp.value).replace(',', '.'));
    });
    var btn = tr.querySelector('.sa-btn-salvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    fetch('/api/super-admin/plano/' + encodeURIComponent(id) + '/precos', {
      method: 'PUT',
      headers: saAuth.headers(),
      body: JSON.stringify(dados)
    })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) { showToast(env.error, 'error'); return; }
        var p = env.data && env.data.plano;
        if (p && p.id) {
          var linha = tbodyPlanos.querySelector('tr[data-id="' + p.id + '"]');
          if (linha) {
            var campos = { price_monthly: p.price_monthly, price_annual: p.price_annual, price_per_employee: p.price_per_employee };
            Object.keys(campos).forEach(function (campo) {
              var inp = linha.querySelector('.sa-input[data-campo="' + campo + '"]');
              if (inp) inp.value = valorInput(campos[campo]);
            });
          }
        }
        showToast('Preços de "' + (p ? p.name : 'plano') + '" atualizados.', 'success');
      })
      .catch(function () { showToast('Erro ao salvar preços.', 'error'); })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      });
  }

  atualizarRotulos();
  carregarConfig();
  carregarPlanos();
});
