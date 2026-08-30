/* ============================================================
   Corte Certo – admin/js/chats.js
   Painel de Chats do site: lista conversas do salão e permite
   responder pelo painel (entrega instantânea no widget).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin('dono');
  if (!usuario) return;

  const listaEl = document.getElementById('lista-chats');
  const convEl = document.getElementById('painel-conversa');
  const totalEl = document.getElementById('chats-total');

  let chats = [];
  let selecionado = null;
  let polling = null;

  function estadoBadge(t) {
    const m = {
      novo: ['badge-pendente', 'Novo'],
      humano: ['badge-pendente', 'Aguarda atendente'],
      respondido: ['badge-confirmado', 'Respondido'],
      resolvido: ['badge-confirmado', 'Resolvido']
    };
    const v = m[t.estado] || m.novo;
    return '<span class="badge ' + v[0] + '">' + v[1] + '</span>';
  }

  function resumoContato(t) {
    const c = t.contato || {};
    return c.nome || c.email || c.telefone || 'Visitante do site';
  }

  function renderLista() {
    if (!chats.length) {
      listaEl.innerHTML =
        '<div class="empty-state" style="padding:40px 20px;">' +
          '<h3>Nenhum chat ainda</h3>' +
          '<p>Quando alguém conversar no chat do seu catálogo, a conversa aparece aqui.</p>' +
        '</div>';
      return;
    }
    listaEl.innerHTML = chats.map(t => {
      const ativo = selecionado === t.threadId;
      const c = t.contato || {};
      const msgs = t.ultimaMsg;
      const quando = msgs && msgs.ts
        ? fmtDataHoraBR(String(msgs.ts).slice(0, 16))
        : '';
      return '<button type="button" class="item-chat' + (ativo ? ' ativo' : '') + '" data-thread="' + esc(t.threadId) + '"' +
        ' style="display:block;width:100%;text-align:left;padding:14px 16px;border:none;border-bottom:1px solid var(--line);background:' +
        (ativo ? 'var(--paper-soft)' : 'transparent') + ';cursor:pointer;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
            '<strong style="font-size:14px;">' + esc(resumoContato(t)) + '</strong>' +
            estadoBadge(t) +
          '</div>' +
          (c.email ? '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + esc(c.email) + '</div>' : '') +
          '<div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            (msgs ? (msgs.rem + ': ').replace(/:$/, ' — ') + esc(msgs.texto) : '—') +
          '</div>' +
          (quando ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(quando) + '</div>' : '') +
      '</button>';
    }).join('');
    listaEl.querySelectorAll('.item-chat').forEach(btn => {
      btn.addEventListener('click', () => selecionar(btn.dataset.thread));
    });
  }

  function renderConversa() {
    const t = chats.find(x => x.threadId === selecionado);
    if (!t) {
      convEl.innerHTML =
        '<div class="empty-state" style="margin:auto;padding:40px;">' +
          '<h3>Selecione uma conversa</h3>' +
          '<p>Escolha um chat na lista ao lado para ler e responder.</p>' +
        '</div>';
      return;
    }

    const c = t.contato || {};
    const msgs = (typeof t._detalhe !== 'undefined' && t._detalhe) ? t._detalhe.msgs : (t.ultimaMsg ? [t.ultimaMsg] : []);

    convEl.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid var(--line);">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">' +
          '<div>' +
            '<strong style="font-size:15px;">' + esc(resumoContato(t)) + '</strong>' +
            (c.email || c.telefone
              ? '<div style="font-size:12.5px;color:var(--text-muted);">' +
                [c.email, c.telefone].filter(Boolean).join(' · ') + '</div>'
              : '') +
          '</div>' +
          estadoBadge(t) +
        '</div>' +
        (t.criticidade === 'critica'
          ? '<div class="badge badge-cancelado" style="margin-top:8px;">Pedido priorizado — aguarda menos tempo</div>' : '') +
        (t.prazo ? '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">Promessa de resposta: até ' + esc(String(t.prazo)) + 'h</div>' : '') +
      '</div>' +
      '<div id="msgs-chat" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px;"></div>' +
      '<div style="padding:14px 16px;border-top:1px solid var(--line);">' +
        '<form id="form-resposta">' +
          '<div style="display:flex;gap:10px;align-items:flex-end;">' +
            '<textarea id="txt-resposta" rows="2" placeholder="Escreva sua resposta…" required' +
              ' style="flex:1;resize:none;"></textarea>' +
            '<button type="submit" class="btn btn-brass" style="white-space:nowrap;">Enviar</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    const box = document.getElementById('msgs-chat');
    box.innerHTML = msgs.map(m => {
      const eu = m.rem === 'atendente';
      const nome = eu ? 'Você' : (m.rem === 'bot' ? 'IA · ' + (m.texto || '').replace(/^\(IA\)\s*/, '').slice(0, 24) + '…' : 'Cliente');
      return '<div style="align-self:' + (eu ? 'flex-end' : 'flex-start') + ';max-width:78%;">' +
        '<div style="font-size:11px;color:var(--text-muted);' + (eu ? 'text-align:right;' : '') + '">' +
          esc(m.rem) + ' · ' + esc(fmtDataHoraBR(String(m.ts).slice(0, 16))) + '</div>' +
        '<div style="padding:9px 12px;border-radius:12px;font-size:14px;background:' +
          (eu ? 'var(--brass);color:var(--ink);' : 'var(--paper-soft);color:var(--text);') + ';">' +
          esc(String(m.texto || '').replace(/^\(IA\)\s*/, '')) +
        '</div>' +
      '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;

    document.getElementById('form-resposta')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = document.getElementById('txt-resposta').value.trim();
      if (!texto) return;
      try {
        const r = API.botResponderChat(t.threadId, texto);
        showToast('Resposta enviada ao cliente no chat do site.');
        document.getElementById('txt-resposta').value = '';
        selecionado = r.threadId;
        carregar();
      } catch (err2) { showToast(msgErro(err2), 'error'); }
    });
  }

  function selecionar(threadId) {
    selecionado = threadId;
    renderLista();
    carregarDetalhe();
  }

  function carregarDetalhe() {
    const t = chats.find(x => x.threadId === selecionado);
    if (!t) { renderConversa(); return; }
    try {
      const d = API.chatBuscar(selecionado);
      t._detalhe = d;
      t.estado = d.estado || t.estado;
    } catch (e) { /* noop */ }
    renderConversa();
  }

  function carregar(cb) {
    let r = null;
    try { r = API.botListarChats(); } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }
    chats = r.chats || [];
    totalEl.textContent = chats.length
      ? (chats.length === 1 ? '1 conversa' : chats.length + ' conversas')
      : 'Sem conversas';
    renderLista();
    if (selecionado && !chats.some(x => x.threadId === selecionado)) selecionado = null;
    if (cb) cb(); else { carregarDetalhe(); }
  }

  document.getElementById('btn-refresh').addEventListener('click', () => carregar());

  window.addEventListener('resize', () => { /* noop */ });

  carregar();

  /* atualização automática para não perder respostas novas do site */
  polling = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    carregar(() => carregarDetalhe());
  }, 12000);
});