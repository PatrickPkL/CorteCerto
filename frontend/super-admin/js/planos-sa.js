/* ============================================================
   Corte Certo – super-admin/js/planos-sa.js
   CRUD completo de planos + modo grátis global.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var btnSair = document.getElementById('btn-sair');
  var tglGratis = document.getElementById('tgl-site-gratis');
  var lblGratis = document.getElementById('lbl-site-gratis');
  var avisoGratis = document.getElementById('aviso-site-gratis');
  var tbodyPlanos = document.getElementById('tbody-planos');
  var modal = document.getElementById('modal-plano');
  var formPlano = document.getElementById('form-plano');
  var modalTitulo = document.getElementById('modal-titulo');
  var btnSalvarPlano = document.getElementById('btn-salvar-plano');

  var planoEditando = null;
  var _lista = [];

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

  /* ---------- lista de planos ---------- */
  function carregarPlanos() {
    fetch('/api/super-admin/planos', { headers: saAuth.headers() })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) { showToast(env.error, 'error'); return; }
        _lista = env.data || [];
        renderPlanos(_lista);
      })
      .catch(function () {
        if (tbodyPlanos) {
          tbodyPlanos.innerHTML = '<tr><td colspan="7" class="sa-loading">Erro ao carregar planos.</td></tr>';
        }
      });
  }

  function valorInput(v) {
    return (Number(v) || 0).toFixed(2);
  }

  function limiteTexto(p) {
    var partes = [];
    partes.push(p.max_professionals == null ? 'Prof. ∞' : 'Prof. ' + p.max_professionals);
    partes.push(p.max_dependents == null ? 'Dep. ∞' : 'Dep. ' + p.max_dependents);
    return partes.join(' · ');
  }

  function renderPlanos(planos) {
    if (!tbodyPlanos) return;
    if (!planos.length) {
      tbodyPlanos.innerHTML = '<tr><td colspan="7" class="sa-loading">Nenhum plano cadastrado.</td></tr>';
      return;
    }
    tbodyPlanos.innerHTML = planos.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '">' +
        '<td><strong>' + esc(p.name) + '</strong>' +
          (p.is_free ? ' <span class="sa-tag">grátis</span>' : '') +
          (p.active ? '' : ' <span class="sa-tag">inativo</span>') + '</td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_monthly" value="' + valorInput(p.price_monthly) + '"></td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_annual" value="' + valorInput(p.price_annual) + '"></td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_per_employee" value="' + valorInput(p.price_per_employee) + '"></td>' +
        '<td><input type="number" min="0" step="0.01" class="sa-input" data-campo="price_compare" value="' + valorInput(p.price_compare != null ? p.price_compare : 0) + '"></td>' +
        '<td><span style="font-size:.85rem; color:#aaa;">' + limiteTexto(p) + '</span></td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="sa-btn-salvar" style="margin-right:8px;">Salvar</button>' +
          '<button type="button" class="sa-btn-cancelar btn-editar" style="margin-right:8px;">Editar</button>' +
          '<button type="button" class="sa-btn-perigo btn-excluir">Excluir</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    tbodyPlanos.querySelectorAll('.sa-btn-salvar').forEach(function (btn) {
      btn.addEventListener('click', function () { salvarPrecos(btn.closest('tr')); });
    });
    tbodyPlanos.querySelectorAll('.btn-editar').forEach(function (btn) {
      btn.addEventListener('click', function () { editarPlano(btn.closest('tr').getAttribute('data-id')); });
    });
    tbodyPlanos.querySelectorAll('.btn-excluir').forEach(function (btn) {
      btn.addEventListener('click', function () { excluirPlano(btn.closest('tr').getAttribute('data-id')); });
    });
  }

  function salvarPrecos(tr) {
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var dados = {};
    tr.querySelectorAll('.sa-input').forEach(function (inp) {
      var v = String(inp.value).replace(',', '.');
      dados[inp.getAttribute('data-campo')] = v === '' ? null : Number(v);
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
            var campos = { price_monthly: p.price_monthly, price_annual: p.price_annual,
              price_per_employee: p.price_per_employee, price_compare: p.price_compare };
            Object.keys(campos).forEach(function (campo) {
              var inp = linha.querySelector('.sa-input[data-campo="' + campo + '"]');
              if (inp) inp.value = valorInput(campos[campo]);
            });
          }
        }
        showToast('Preços atualizados.', 'success');
      })
      .catch(function () { showToast('Erro ao salvar preços.', 'error'); })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      });
  }

  /* ---------- modal criar/editar ---------- */
  function abrirModal(plano) {
    planoEditando = plano || null;
    if (!modal) return;
    modalTitulo.textContent = plano ? 'Editar plano' : 'Novo plano';
    formPlano.reset();
    var nome = document.getElementById('f-nome');
    var pm = document.getElementById('f-price_monthly');
    var pa = document.getElementById('f-price_annual');
    var ppe = document.getElementById('f-price_per_employee');
    var pc = document.getElementById('f-price_compare');
    var prof = document.getElementById('f-max_professionals');
    var dep = document.getElementById('f-max_dependents');
    var nivel = document.getElementById('f-nivel_relatorio');
    var isFree = document.getElementById('f-is_free');
    var active = document.getElementById('f-active');
    var feats = document.getElementById('f-features');
    var perms = document.getElementById('f-permissions');

    if (!nome) return;
    if (plano) {
      nome.value = plano.name || '';
      pm.value = valorInput(plano.price_monthly);
      pa.value = valorInput(plano.price_annual);
      ppe.value = valorInput(plano.price_per_employee);
      pc.value = valorInput(plano.price_compare != null ? plano.price_compare : 0);
      prof.value = plano.max_professionals == null ? '' : plano.max_professionals;
      dep.value = plano.max_dependents == null ? '' : plano.max_dependents;
      nivel.value = plano.nivel_relatorio == null ? '' : plano.nivel_relatorio;
      isFree.checked = !!plano.is_free;
      active.checked = !!plano.active;
      feats.value = (plano.features || []).join('\n');
      perms.value = (plano.permissions || []).join('\n');
    }
    modal.classList.add('show');
    if (btnSalvarPlano) { btnSalvarPlano.disabled = false; btnSalvarPlano.textContent = 'Salvar plano'; }
    setTimeout(function () { nome.focus(); }, 0);
  }

  function fecharModal() {
    if (modal) modal.classList.remove('show');
    planoEditando = null;
  }

  function linhasParaArray(texto) {
    return String(texto || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  formPlano.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var dados = {
      name: document.getElementById('f-nome').value.trim(),
      price_monthly: Number(String(document.getElementById('f-price_monthly').value).replace(',', '.')),
      price_annual: Number(String(document.getElementById('f-price_annual').value).replace(',', '.')),
      price_per_employee: Number(String(document.getElementById('f-price_per_employee').value).replace(',', '.')),
      price_compare: Number(String(document.getElementById('f-price_compare').value).replace(',', '.')),
      max_professionals: document.getElementById('f-max_professionals').value,
      max_dependents: document.getElementById('f-max_dependents').value,
      nivel_relatorio: document.getElementById('f-nivel_relatorio').value,
      is_free: document.getElementById('f-is_free').checked,
      active: document.getElementById('f-active').checked,
      features: linhasParaArray(document.getElementById('f-features').value),
      permissions: linhasParaArray(document.getElementById('f-permissions').value)
    };
    salvarPlano(dados);
  });

  function salvarPlano(dados) {
    if (btnSalvarPlano) { btnSalvarPlano.disabled = true; btnSalvarPlano.textContent = 'Salvando...'; }
    var isNovo = !planoEditando;
    fetch(isNovo ? '/api/super-admin/planos' : '/api/super-admin/plano/' + encodeURIComponent(planoEditando.id), {
      method: isNovo ? 'POST' : 'PUT',
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
        showToast(isNovo ? 'Plano criado.' : 'Plano atualizado.', 'success');
        fecharModal();
        carregarPlanos();
      })
      .catch(function () { showToast('Erro ao salvar plano.', 'error'); })
      .then(function () {
        if (btnSalvarPlano && modal.classList.contains('show')) {
          btnSalvarPlano.disabled = false;
          btnSalvarPlano.textContent = 'Salvar plano';
        }
      });
  }

  function editarPlano(id) {
    if (typeof id === 'string') id = id.replace(/^string:/, '');
    var p = _lista.find(function (x) { return String(x.id) === String(id); });
    if (p) abrirModal(p);
  }

  function excluirPlano(id) {
    if (typeof id === 'string') id = id.replace(/^string:/, '');
    var p = _lista.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    if (!confirm('Excluir o plano "' + p.name + '"?\n\nAção não pode ser desfeita. Planos em uso por assinaturas ou cobranças não podem ser excluídos.')) return;
    fetch('/api/super-admin/plano/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: saAuth.headers()
    })
      .then(function (res) {
        if (tratarNaoAutorizado(res)) return;
        return res.json();
      })
      .then(function (env) {
        if (!env) return;
        if (env.error) { showToast(env.error, 'error'); return; }
        showToast('Plano excluído.', 'success');
        carregarPlanos();
      })
      .catch(function () { showToast('Erro ao excluir plano.', 'error'); });
  }

  document.getElementById('btn-novo-plano').addEventListener('click', function () { abrirModal(null); });
  document.getElementById('btn-fechar-modal').addEventListener('click', fecharModal);
  modal.addEventListener('click', function (ev) {
    if (ev.target === modal) fecharModal();
  });

  atualizarRotulos();
  carregarConfig();
  carregarPlanos();
});