/* ============================================================
   Corte Certo – super-admin/js/super-admin.js
   Dashboard: estatísticas, lista de lojas, busca e filtros.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var elTotalLojas = document.getElementById('stat-lojas');
  var elTotalUsers = document.getElementById('stat-users');
  var elAgendHoje = document.getElementById('stat-agendamentos');
  var elReceita = document.getElementById('stat-receita');
  var elTrial = document.getElementById('stat-trial');
  var elAtivas = document.getElementById('stat-ativas');
  var elConversao = document.getElementById('stat-conversao');
  var tbodyLojas = document.getElementById('tbody-lojas');
  var inputBusca = document.getElementById('input-busca');
  var filtroStatus = document.getElementById('filtro-status');
  var filtroPlano = document.getElementById('filtro-plano');
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
        if (elTotalLojas) elTotalLojas.textContent = data.totalLojas || 0;
        if (elTotalUsers) elTotalUsers.textContent = data.totalUsuarios || 0;
        if (elAgendHoje) elAgendHoje.textContent = data.agendamentosHoje || 0;
        if (elReceita) elReceita.textContent = formatarMoeda(data.totalReceita || 0);
        if (elTrial) elTrial.textContent = data.lojasTrial || 0;
        if (elAtivas) elAtivas.textContent = data.lojasAtivas || 0;
        if (elConversao) {
          var trial = data.lojasTrial || 0;
          var ativas = data.lojasAtivas || 0;
          var base = trial + ativas;
          var pct = base > 0 ? (ativas / base) * 100 : 0;
          elConversao.textContent = pct.toFixed(1).replace('.', ',') + '%';
        }
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
      tdVazio.colSpan = 7;
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

      var plano = loja.plano || loja.plan_name || 'nenhum';

      var tdId = document.createElement('td');
      tdId.textContent = loja.id;

      var tdNome = document.createElement('td');
      tdNome.textContent = loja.name || loja.nome || loja.salon_name || '—';

      var tdCidade = document.createElement('td');
      tdCidade.textContent = loja.city || loja.cidade || '—';

      var tdPlano = document.createElement('td');
      tdPlano.textContent = plano;

      var tdStatus = document.createElement('td');
      var status = loja.status || 'nenhum';
      var spanStatus = document.createElement('span');
      spanStatus.textContent = status;
      spanStatus.className = 'badge badge-' + status;
      tdStatus.appendChild(spanStatus);

      var tdProf = document.createElement('td');
      tdProf.textContent = loja.profissionais || 0;

      var tdAg = document.createElement('td');
      tdAg.textContent = loja.agendamentos || 0;

      tr.appendChild(tdId);
      tr.appendChild(tdNome);
      tr.appendChild(tdCidade);
      tr.appendChild(tdPlano);
      tr.appendChild(tdStatus);
      tr.appendChild(tdProf);
      tr.appendChild(tdAg);
      tbodyLojas.appendChild(tr);
    });
  }

  /* ---------- aplicar busca + filtros ---------- */
  function aplicarFiltros() {
    var termo = (inputBusca ? inputBusca.value : '').trim().toLowerCase();
    var status = filtroStatus ? filtroStatus.value : 'todas';
    var plano = filtroPlano ? filtroPlano.value : 'todos';

    var filtradas = todasLojas.filter(function (loja) {
      var nome = (loja.name || loja.nome || loja.salon_name || '').toLowerCase();
      var cidade = (loja.city || loja.cidade || '').toLowerCase();
      var owner = (loja.owner_name || loja.owner || '').toLowerCase();
      var passaBusca = !termo || nome.indexOf(termo) !== -1 || cidade.indexOf(termo) !== -1 || owner.indexOf(termo) !== -1;

      var lojaStatus = loja.status || 'nenhum';
      var passaStatus = status === 'todas' || lojaStatus === status;

      var lojaPlano = loja.plan_name || loja.plano || 'nenhum';
      var passaPlano = plano === 'todos' ||
        (plano === 'nenhum' && lojaPlano === 'nenhum') ||
        lojaPlano === plano;

      return passaBusca && passaStatus && passaPlano;
    });

    renderizarLojas(filtradas);
  }

  /* ---------- eventos de busca/filtros ---------- */
  if (inputBusca) inputBusca.addEventListener('input', aplicarFiltros);
  if (filtroStatus) filtroStatus.addEventListener('change', aplicarFiltros);
  if (filtroPlano) filtroPlano.addEventListener('change', aplicarFiltros);

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
