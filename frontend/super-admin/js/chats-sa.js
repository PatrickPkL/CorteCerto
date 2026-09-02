/* ============================================================
   Corte Certo – super-admin/js/chats-sa.js
   Chat do site (super-admin): lista conversas e responde
   via REST /api/super-admin/chats*.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var tbody = document.getElementById('tbody-chats');
  var totalChats = document.getElementById('sa-total-chats');
  var botoesFiltro = document.querySelectorAll('#sa-filtros .sa-filtro-btn');
  var btnSair = document.getElementById('btn-sair');
  var filtroAtual = 'todos';
  var chats = [];
  var lojas = {};

  /* ---------- badge de estado ---------- */
  function badgeEstado(estado, criticidade) {
    var map = {
      novo: ['badge-novo', 'Novo'],
      humano: ['badge-humano', 'Necessita humano'],
      respondido: ['badge-respondido', 'Respondido']
    };
    var par = map[estado] || [null, estado || 'novo'];
    var span = document.createElement('span');
    span.className = 'badge ' + (par[0] || 'badge-novo');
    span.textContent = par[1];
    if (criticidade === 'critica') {
      var c = document.createElement('span');
      c.className = 'badge badge-critico';
      c.textContent = 'Crítico';
      span.appendChild(document.createElement('br'));
      span.appendChild(c);
    }
    return span;
  }

  function nomeLoja(id) {
    return lojas[id] || '—';
  }

  function formatarContato(c) {
    c = c || {};
    return (c.nome || c.email || c.telefone || '—') +
      (c.telefone ? ' · ' + c.telefone : '');
  }

  /* ---------- carregar ---------- */
  function carregar() {
    fetch('/api/super-admin/chats', { headers: saAuth.headers() })
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
        lojas = (data.data && data.data.lojas) || {};
        var lbl = document.getElementById('lbl-atendente');
        if (lbl) {
          var atendente = (data.data && data.data.chatAtendente);
          lbl.textContent = atendente
            ? 'Conversas do chat do site. Respostas chegam ao cliente como ' + atendente + '.'
            : 'Conversas do chat do site.';
        }
        chats = (data.data && data.data.chats) || [];
        renderizar();
      })
      .catch(function () {
        showToast('Erro ao carregar conversas.', 'error');
      });
  }

  /* ---------- renderizar ---------- */
  function renderizar() {
    if (!tbody) return;
    var lista = chatMatchesFiltro();
    tbody.innerHTML = '';
    totalChats.textContent = String(chats.length);

    if (!lista.length) {
      var trVazio = document.createElement('tr');
      var tdVazio = document.createElement('td');
      tdVazio.colSpan = 7;
      tdVazio.className = 'sa-vazio';
      tdVazio.textContent = 'Nenhuma conversa encontrada.';
      trVazio.appendChild(tdVazio);
      tbody.appendChild(trVazio);
      return;
    }

    lista.forEach(function (c) {
      var tr = document.createElement('tr');

      var tdData = document.createElement('td');
      tdData.className = 'sa-data';
      tdData.textContent = c.atualizadoEm ? formatarData(c.atualizadoEm) : '—';

      var tdLoja = document.createElement('td');
      tdLoja.textContent = nomeLoja(c.lojaId);
      tdLoja.title = String(c.lojaId || '');

      var tdContato = document.createElement('td');
      tdContato.textContent = formatarContato(c.contato);
      if (c.pagina) {
        tdContato.appendChild(document.createElement('br'));
        var pag = document.createElement('span');
        pag.style.cssText = 'font-size:11px;color:#777;';
        pag.textContent = 'página: ' + c.pagina;
        tdContato.appendChild(pag);
      }

      var tdEstado = document.createElement('td');
      tdEstado.appendChild(badgeEstado(c.estado, c.criticidade));
      if (c.prazo) {
        tdEstado.appendChild(document.createElement('br'));
        var pz = document.createElement('span');
        pz.style.cssText = 'font-size:11px;color:#f1c40f;';
        pz.textContent = 'prazo: ' + c.prazo;
        tdEstado.appendChild(pz);
      }

      var tdMsgs = document.createElement('td');
      tdMsgs.textContent = String(c.totalMsgs || 0);

      var tdUlt = document.createElement('td');
      tdUlt.className = 'sa-msg-trunc';
      var ult = c.ultimaMsg || {};
      tdUlt.textContent = ult.texto || '—';
      tdUlt.title = ult.texto || '';

      var tdAcoes = document.createElement('td');
      var btn = document.createElement('button');
      btn.className = 'sa-btn sa-btn-brass';
      btn.textContent = 'Abrir';
      btn.addEventListener('click', function () { abrirModal(c); });
      tdAcoes.appendChild(btn);

      tr.appendChild(tdData);
      tr.appendChild(tdLoja);
      tr.appendChild(tdContato);
      tr.appendChild(tdEstado);
      tr.appendChild(tdMsgs);
      tr.appendChild(tdUlt);
      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });
  }

  function chatMatchesFiltro() {
    if (filtroAtual === 'todos') return chats;
    return chats.filter(function (c) { return (c.estado || 'novo') === filtroAtual; });
  }

  /* ---------- filtros ---------- */
  if (botoesFiltro.length) {
    botoesFiltro.forEach(function (btn) {
      btn.addEventListener('click', function () {
        botoesFiltro.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filtroAtual = btn.getAttribute('data-estado');
        renderizar();
      });
    });
  }

  /* ---------- modal ---------- */
  var modal = document.getElementById('sa-modal');
  var modalId = document.getElementById('sa-chat-thread-id');
  var modalTitulo = document.getElementById('sa-modal-titulo');
  var modalMeta = document.getElementById('sa-modal-meta');
  var modalThread = document.getElementById('sa-chat-thread');
  var modalResposta = document.getElementById('sa-chat-resposta');

  function bubbleDoChave(rem) {
    return (rem === 'atendente') ? 'atendente' : 'cliente';
  }

  function abrirModal(c) {
    modalId.value = c.threadId;
    modalTitulo.textContent = 'Conversa com ' + formatarContato(c.contato);
    modalMeta.textContent =
      'Loja: ' + nomeLoja(c.lojaId) +
      ' · ' + (c.atualizadoEm ? formatarData(c.atualizadoEm) : '') +
      (c.pagina ? ' · página: ' + c.pagina : '') +
      ' · Estado: ' + (c.estado || 'novo');

    modalThread.innerHTML = '';
    var msgs = c.msgs || [];
    if (!msgs.length) {
      modalThread.innerHTML = '<div class="sa-vazio">Sem mensagens.</div>';
    }
    msgs.forEach(function (m) {
      var b = document.createElement('div');
      b.className = 'sa-bubble ' + bubbleDoChave(m.rem);
      var tag = document.createElement('span');
      tag.className = 'sa-b-tag';
      tag.textContent = m.rem === 'atendente' ? 'Atendente' : 'Cliente';
      var txt = document.createElement('div');
      txt.textContent = m.texto || '';
      var ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = m.ts ? formatarData(m.ts) : '';
      b.appendChild(tag);
      b.appendChild(txt);
      b.appendChild(ts);
      modalThread.appendChild(b);
    });

    modalResposta.value = '';
    modal.classList.add('show');
  }

  function fecharModal() {
    modal.classList.remove('show');
  }

  document.getElementById('sa-modal-cancel').addEventListener('click', fecharModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) fecharModal();
  });

  document.getElementById('sa-modal-responder').addEventListener('click', function () {
    var id = modalId.value;
    var texto = modalResposta.value.trim();
    if (!texto) {
      showToast('Escreva sua resposta.', 'error');
      return;
    }
    var btn = document.getElementById('sa-modal-responder');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    fetch('/api/super-admin/chats/' + encodeURIComponent(id) + '/responder', {
      method: 'POST',
      headers: saAuth.headers(),
      body: JSON.stringify({ texto: texto })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Resposta enviada ao cliente.');
          fecharModal();
          carregar();
        }
        btn.disabled = false;
        btn.textContent = 'Enviar';
      })
      .catch(function () {
        showToast('Erro ao enviar resposta.', 'error');
        btn.disabled = false;
        btn.textContent = 'Enviar';
      });
  });

  /* ---------- ações ---------- */
  document.getElementById('btn-atualizar').addEventListener('click', carregar);

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
});