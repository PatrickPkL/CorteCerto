/* ============================================================
   Corte Certo – super-admin/js/super-admin.js
   Dashboard: estatísticas, lista de lojas e busca.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var elTotalLojas = document.getElementById('stat-lojas');
  var elTotalUsers = document.getElementById('stat-users');
  var elAgendHoje = document.getElementById('stat-agendamentos');
  var elReceita = document.getElementById('stat-receita');
  var tbodyLojas = document.getElementById('tbody-lojas');
  var inputBusca = document.getElementById('input-busca');
  var btnSair = document.getElementById('btn-sair');

  var todasLojas = [];

  /* ---------- carregar dashboard ---------- */
  function carregarDashboard() {
    fetch('/api/super-admin/dashboard', { headers: saAuth.headers() })
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
        if (elTotalLojas) elTotalLojas.textContent = data.total_lojas || 0;
        if (elTotalUsers) elTotalUsers.textContent = data.total_users || 0;
        if (elAgendHoje) elAgendHoje.textContent = data.agendamentos_hoje || 0;
        if (elReceita) elReceita.textContent = formatarMoeda(data.receita || 0);
      })
      .catch(function () {
        showToast('Erro ao carregar dashboard.', 'error');
      });
  }

  /* ---------- carregar lojas ---------- */
  function carregarLojas() {
    fetch('/api/super-admin/lojas', { headers: saAuth.headers() })
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
        todasLojas = data.lojas || data || [];
        renderizarLojas(todasLojas);
      })
      .catch(function () {
        showToast('Erro ao carregar lojas.', 'error');
      });
  }

  /* ---------- renderizar tabela ---------- */
  function renderizarLojas(lojas) {
    if (!tbodyLojas) return;
    tbodyLojas.innerHTML = '';

    if (!lojas.length) {
      var trVazio = document.createElement('tr');
      var tdVazio = document.createElement('td');
      tdVazio.colSpan = 5;
      tdVazio.textContent = 'Nenhuma loja encontrada.';
      tdVazio.style.textAlign = 'center';
      tdVazio.style.color = '#888';
      tdVazio.style.padding = '32px 0';
      trVazio.appendChild(tdVazio);
      tbodyLojas.appendChild(trVazio);
      return;
    }

    lojas.forEach(function (loja) {
      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function () {
        window.location.href = 'loja.html?id=' + loja.id;
      });

      var tdId = document.createElement('td');
      tdId.textContent = loja.id;

      var tdNome = document.createElement('td');
      tdNome.textContent = loja.nome || loja.salon_name || '—';

      var tdCidade = document.createElement('td');
      tdCidade.textContent = loja.cidade || '—';

      var tdOwner = document.createElement('td');
      tdOwner.textContent = loja.owner_name || loja.owner || '—';

      var tdPlano = document.createElement('td');
      var spanPlano = document.createElement('span');
      spanPlano.textContent = loja.plano || loja.plan || 'free';
      spanPlano.className = 'badge badge-' + (loja.plano || loja.plan || 'free');
      tdPlano.appendChild(spanPlano);

      tr.appendChild(tdId);
      tr.appendChild(tdNome);
      tr.appendChild(tdCidade);
      tr.appendChild(tdOwner);
      tr.appendChild(tdPlano);
      tbodyLojas.appendChild(tr);
    });
  }

  /* ---------- busca ---------- */
  if (inputBusca) {
    inputBusca.addEventListener('input', function () {
      var termo = inputBusca.value.trim().toLowerCase();
      if (!termo) {
        renderizarLojas(todasLojas);
        return;
      }
      var filtradas = todasLojas.filter(function (loja) {
        var nome = (loja.nome || loja.salon_name || '').toLowerCase();
        var cidade = (loja.cidade || '').toLowerCase();
        var owner = (loja.owner_name || loja.owner || '').toLowerCase();
        return nome.indexOf(termo) !== -1 || cidade.indexOf(termo) !== -1 || owner.indexOf(termo) !== -1;
      });
      renderizarLojas(filtradas);
    });
  }

  /* ---------- logout ---------- */
  if (btnSair) {
    btnSair.addEventListener('click', function (e) {
      e.preventDefault();
      saAuth.logout();
    });
  }

  /* ---------- formatador ---------- */
  function formatarMoeda(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ---------- init ---------- */
  carregarDashboard();
  carregarLojas();
});
