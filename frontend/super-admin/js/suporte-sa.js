/* ============================================================
   Corte Certo – super-admin/js/suporte-sa.js
   Suporte: lista todos os tickets, filtra por status e responde.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var tbody = document.getElementById('tbody-tickets');
  var totalAbertos = document.getElementById('sa-total-abertos');
  var botoesFiltro = document.querySelectorAll('#sa-filtros .sa-filtro-btn');
  var btnSair = document.getElementById('btn-sair');

  var filtroAtual = 'todos';
  var tickets = [];

  /* ---------- carregar tickets ---------- */
  function carregar() {
    var url = '/api/super-admin/tickets?status=' + encodeURIComponent(filtroAtual);
    fetch(url, { headers: saAuth.headers() })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          saAuth.logout();
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        tickets = data.data || [];
        renderizar();
      })
      .catch(function () {
        showToast('Erro ao carregar tickets.', 'error');
      });
  }

  /* ---------- contador de abertos (carregado à parte) ---------- */
  function carregarContador() {
    fetch('/api/super-admin/tickets?status=todos', { headers: saAuth.headers() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.error) return;
        var todos = data.data || [];
        var abertos = todos.filter(function (t) { return t.status === 'aberto'; }).length;
        if (totalAbertos) totalAbertos.textContent = abertos;
      })
      .catch(function () { /* noop */ });
  }

  /* ---------- badge ---------- */
  function badgeStatus(status) {
    var map = {
      aberto: ['badge-aberto', 'Aberto'],
      respondido: ['badge-respondido', 'Respondido'],
      resolvido: ['badge-resolvido', 'Resolvido'],
      fechado: ['badge-fechado', 'Fechado'],
      em_andamento: ['badge-em_andamento', 'Em Andamento']
    };
    var par = map[status] || [null, status];
    var span = document.createElement('span');
    span.className = 'badge ' + (par[0] || 'badge-fechado');
    span.textContent = par[1];
    return span;
  }

  /* ---------- renderizar ---------- */
  function renderizar() {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!tickets.length) {
      var trVazio = document.createElement('tr');
      var tdVazio = document.createElement('td');
      tdVazio.colSpan = 7;
      tdVazio.className = 'sa-vazio';
      tdVazio.textContent = 'Nenhum ticket encontrado.';
      trVazio.appendChild(tdVazio);
      tbody.appendChild(trVazio);
      return;
    }

    tickets.forEach(function (t) {
      var tr = document.createElement('tr');

      var tdData = document.createElement('td');
      tdData.className = 'sa-data';
      tdData.textContent = t.criadoEm ? formatarData(t.criadoEm) : '—';

      var tdLoja = document.createElement('td');
      tdLoja.textContent = t.lojaNome || '—';

      var tdCidade = document.createElement('td');
      tdCidade.textContent = t.lojaCidade || '—';

      var tdAssunto = document.createElement('td');
      tdAssunto.textContent = t.assunto || '—';

      var tdMsg = document.createElement('td');
      tdMsg.className = 'sa-msg-trunc';
      tdMsg.textContent = t.mensagem || '—';
      tdMsg.title = t.mensagem || '';

      var tdStatus = document.createElement('td');
      tdStatus.appendChild(badgeStatus(t.status));

      var tdAcoes = document.createElement('td');
      var btn = document.createElement('button');
      btn.className = 'sa-btn sa-btn-brass';
      btn.textContent = 'Responder';
      btn.addEventListener('click', function () { abrirModal(t); });
      tdAcoes.appendChild(btn);

      tr.appendChild(tdData);
      tr.appendChild(tdLoja);
      tr.appendChild(tdCidade);
      tr.appendChild(tdAssunto);
      tr.appendChild(tdMsg);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });
  }

  /* ---------- filtros ---------- */
  if (botoesFiltro.length) {
    botoesFiltro.forEach(function (btn) {
      btn.addEventListener('click', function () {
        botoesFiltro.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filtroAtual = btn.getAttribute('data-status');
        carregar();
      });
    });
  }

  /* ---------- modal ---------- */
  var modal = document.getElementById('sa-modal');
  var modalId = document.getElementById('sa-modal-ticket-id');
  var modalAssunto = document.getElementById('sa-modal-assunto');
  var modalMensagem = document.getElementById('sa-modal-mensagem');
  var modalMeta = document.getElementById('sa-modal-meta');
  var modalStatus = document.getElementById('sa-modal-status');
  var modalResposta = document.getElementById('sa-modal-resposta');

  function abrirModal(t) {
    modalId.value = t.id;
    modalAssunto.textContent = t.assunto || '—';
    modalMensagem.textContent = t.mensagem || '—';
    modalMeta.textContent =
      'Loja: ' + (t.lojaNome || '—') +
      (t.lojaCidade ? ' · ' + t.lojaCidade : '') +
      ' · ' + (t.criadoEm ? formatarData(t.criadoEm) : '') +
      ' · Status atual: ' + (t.status || 'aberto');
    modalStatus.value = (t.status === 'aberto') ? 'respondido' : (t.status || 'respondido');
    modalResposta.value = t.resposta || '';
    modal.classList.add('show');
  }

  function fecharModal() {
    modal.classList.remove('show');
  }

  if (document.getElementById('sa-modal-cancel')) {
    document.getElementById('sa-modal-cancel').addEventListener('click', fecharModal);
  }

  if (modal && modal.addEventListener) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) fecharModal();
    });
  }

  var btnSalvar = document.getElementById('sa-modal-salvar');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', function () {
      var id = modalId.value;
      var status = modalStatus.value;
      var resposta = modalResposta.value.trim();

      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando...';

      fetch('/api/super-admin/ticket/' + id, {
        method: 'PUT',
        headers: saAuth.headers(),
        body: JSON.stringify({ status: status, resposta: resposta })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) {
            showToast(data.error, 'error');
          } else {
            showToast('Ticket atualizado com sucesso!');
            fecharModal();
            carregar();
            carregarContador();
          }
          btnSalvar.disabled = false;
          btnSalvar.textContent = 'Salvar';
        })
        .catch(function () {
          showToast('Erro ao salvar ticket.', 'error');
          btnSalvar.disabled = false;
          btnSalvar.textContent = 'Salvar';
        });
    });
  }

  /* ---------- logout ---------- */
  if (btnSair) {
    btnSair.addEventListener('click', function (e) {
      e.preventDefault();
      saAuth.logout();
    });
  }

  /* ---------- formatadores ---------- */
  function formatarData(valor) {
    var d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('pt-BR');
  }

  /* ---------- init ---------- */
  carregar();
  carregarContador();
});
