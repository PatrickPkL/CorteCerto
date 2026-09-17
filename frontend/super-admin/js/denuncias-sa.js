/* ============================================================
   Corte Certo – super-admin/js/denuncias-sa.js
   Denúncias: lista todas as denúncias recebidas, filtra por
   status e tipo, e permite resolver/rejeitar cada uma.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  saAuth.check();

  var tbody = document.getElementById('tbody-denuncias');
  var totalPendentes = document.getElementById('sa-total-pendentes');
  var btnSair = document.getElementById('btn-sair');

  var filtroAtual = { status: 'todos', tipo: 'todos' };

  var MOTIVOS = {
    conteudo_inadequado: 'Conteúdo inadequado',
    descricao_falsa: 'Descrição falsa',
    precos_enganosos: 'Preços enganosos',
    comportamento_abusivo: 'Comportamento abusivo',
    nao_comparecimento: 'Não comparecimento',
    spam: 'Spam',
    outro: 'Outro'
  };

  var TIPO_LABELS = {
    salao: 'Barbearia',
    barbeiro: 'Barbeiro',
    cliente: 'Cliente'
  };

  function badgeTipo(tipo) {
    var cls = { salao: 'badge-tipo-salao', barbeiro: 'badge-tipo-barbeiro', cliente: 'badge-tipo-cliente' };
    var span = document.createElement('span');
    span.className = 'badge ' + (cls[tipo] || '');
    span.textContent = TIPO_LABELS[tipo] || tipo;
    return span;
  }

  function badgeStatus(status) {
    var cls = { pendente: 'badge-pendente', investigando: 'badge-investigando', resolvido: 'badge-resolvido', rejeitado: 'badge-rejeitado' };
    var lbl = status.charAt(0).toUpperCase() + status.slice(1);
    var span = document.createElement('span');
    span.className = 'badge ' + (cls[status] || '');
    span.textContent = lbl;
    return span;
  }

  /* ---------- carregar ---------- */
  function carregar() {
    var url = '/api/super-admin/denuncias?status=' + encodeURIComponent(filtroAtual.status) +
      '&tipo=' + encodeURIComponent(filtroAtual.tipo);
    fetch(url, { headers: saAuth.headers() })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) { saAuth.logout(); return; }
        return res.json();
      })
      .then(function (data) {
        if (!data || data.error) { if (data && data.error) showToast(data.error, 'error'); return; }
        renderizar(data.data || []);
        carregarContador();
      })
      .catch(function () { showToast('Erro ao carregar denúncias.', 'error'); });
  }

  function carregarContador() {
    fetch('/api/super-admin/denuncias?status=pendente&tipo=todos', { headers: saAuth.headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.error) return;
        if (totalPendentes) totalPendentes.textContent = (data.data || []).length;
      })
      .catch(function () { /* noop */ });
  }

  /* ---------- renderizar ---------- */
  function renderizar(lista) {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'sa-vazio';
      td.textContent = 'Nenhuma denúncia encontrada.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    lista.forEach(function (d) {
      var tr = document.createElement('tr');

      var tdData = document.createElement('td');
      tdData.className = 'sa-data';
      tdData.textContent = d.created_at ? formatarData(d.created_at) : '—';

      var tdAlvo = document.createElement('td');
      tdAlvo.appendChild(badgeTipo(d.target_type));
      tdAlvo.appendChild(document.createTextNode(' '));
      var nomeAlvo = d.target_barbershop_name || d.target_user_name || d.target_display || '—';
      tdAlvo.appendChild(document.createElement('br'));
      tdAlvo.appendChild(document.createTextNode(nomeAlvo));

      var tdDenunciante = document.createElement('td');
      tdDenunciante.textContent = (d.reporter_name || 'Anônimo') +
        (d.reporter_role ? ' (' + d.reporter_role + ')' : '');

      var tdMotivo = document.createElement('td');
      tdMotivo.textContent = MOTIVOS[d.reason] || d.reason || '—';

      var tdDetalhes = document.createElement('td');
      tdDetalhes.className = 'sa-msg-trunc';
      tdDetalhes.textContent = d.description || 'Sem detalhes.';
      tdDetalhes.title = d.description || '';

      var tdStatus = document.createElement('td');
      tdStatus.appendChild(badgeStatus(d.status));

      var tdAcoes = document.createElement('td');
      var btn = document.createElement('button');
      btn.className = 'sa-btn sa-btn-brass';
      btn.textContent = 'Revisar';
      btn.addEventListener('click', function () { abrirModal(d); });
      tdAcoes.appendChild(btn);

      tr.appendChild(tdData);
      tr.appendChild(tdAlvo);
      tr.appendChild(tdDenunciante);
      tr.appendChild(tdMotivo);
      tr.appendChild(tdDetalhes);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });
  }

  /* ---------- filtros de status ---------- */
  document.querySelectorAll('#sa-filtros .sa-filtro-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#sa-filtros .sa-filtro-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      filtroAtual.status = btn.getAttribute('data-status');
      carregar();
    });
  });

  /* ---------- filtros de tipo ---------- */
  document.querySelectorAll('#sa-filtros-tipo .sa-filtro-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#sa-filtros-tipo .sa-filtro-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      filtroAtual.tipo = btn.getAttribute('data-tipo');
      carregar();
    });
  });

  /* ---------- modal ---------- */
  var modal = document.getElementById('sa-modal');
  var modalId = document.getElementById('sa-modal-id');
  var modalMeta = document.getElementById('sa-modal-meta');
  var modalAlvo = document.getElementById('sa-modal-alvo');
  var modalDetalhes = document.getElementById('sa-modal-detalhes');
  var modalStatus = document.getElementById('sa-modal-status');
  var modalNota = document.getElementById('sa-modal-nota');

  function abrirModal(d) {
    modalId.value = d.id;
    modalMeta.textContent =
      'Denunciante: ' + (d.reporter_name || 'Anônimo') +
      (d.reporter_role ? ' (' + d.reporter_role + ')' : '') +
      ' · ' + (d.created_at ? formatarData(d.created_at) : '');
    modalAlvo.textContent =
      TIPO_LABELS[d.target_type] + ': ' + (d.target_barbershop_name || d.target_user_name || d.target_display || '—');
    modalDetalhes.textContent = d.description || 'Sem detalhes.';
    modalStatus.value = d.status || 'pendente';
    modalNota.value = d.status_note || '';
    modal.classList.add('show');
  }

  document.getElementById('sa-modal-cancel')?.addEventListener('click', function () {
    modal.classList.remove('show');
  });
  modal?.addEventListener('click', function (e) {
    if (e.target === modal) modal.classList.remove('show');
  });

  document.getElementById('sa-modal-salvar')?.addEventListener('click', function () {
    var id = modalId.value;
    var status = modalStatus.value;
    var nota = modalNota.value.trim();

    var btnSalvar = document.getElementById('sa-modal-salvar');
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';

    fetch('/api/super-admin/denuncia/' + id, {
      method: 'PUT',
      headers: saAuth.headers(),
      body: JSON.stringify({ status: status, status_note: nota })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Denúncia atualizada com sucesso!');
          modal.classList.remove('show');
          carregar();
        }
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar';
      })
      .catch(function () {
        showToast('Erro ao salvar.', 'error');
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar';
      });
  });

  /* ---------- logout ---------- */
  btnSair?.addEventListener('click', function (e) {
    e.preventDefault();
    saAuth.logout();
  });

  /* ---------- formatadores ---------- */
  function formatarData(valor) {
    var d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('pt-BR');
  }

  /* ---------- init ---------- */
  carregar();
});