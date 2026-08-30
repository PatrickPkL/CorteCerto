/* ============================================================
   Corte Certo – public/js/chatbot.js
   Widget "Fale com a gente" — disponível em TODAS as páginas
   do site. O bot se apresenta como assistente do SITE Corte
   Certo (não da barbearia). Se a página já é de um salão
   (?id=...), usa esse salão; senão, o visitante escolhe o
   salão num seletor.

   - NÃO pede nenhuma informação: se o visitante está logado,
     o bot já sabe quem é (nome/e-mail/telefone vêm do login).
   - Resolve a maioria das dúvidas sozinho com os dados do salão.
   - Enquanto o bot "pensa", aparece uma bolha com indicador
     animado de digitação — nunca fica parado.
   - Se algo falhar, aparece uma bolha de erro no próprio chat
     (nunca fica mudo).
   - Não conseguiu (ou pediu pessoa)? Encaminha para o e-mail do
     atendente e avisa o prazo: 32h no geral, 24h em assuntos
     críticos (o próprio bot identifica).
   - A resposta do atendente volta por aqui (ponte e-mail → chat).
   ============================================================ */

(function () {
  'use strict';

  function injetaEstilos() {
    if (document.getElementById('cc-chat-css')) return;
    const el = document.createElement('style');
    el.id = 'cc-chat-css';
    el.textContent = [
      '#cc-chat-btn {',
      '  position: fixed; bottom: 22px; right: 22px; z-index: 9999;',
      '  display: flex; align-items: center; gap: 10px;',
      '  background: #b8863b; color: #fff; border: none; cursor: pointer;',
      '  border-radius: 999px; padding: 13px 20px;',
      '  box-shadow: 0 6px 22px rgba(0,0,0,.45);',
      '  font-family: inherit; font-size: 14px; font-weight: 600;',
      '}',
      '#cc-chat-btn:hover { background: #c99a4a; }',
      '#cc-chat-btn .cc-icone { font-size: 18px; line-height: 1; }',
      '#cc-chat-btn { animation: cc-pulse-in 1.6s ease-out 1; }',
      '@keyframes cc-pulse-in {',
      '  0% { transform: scale(.5); opacity: 0; }',
      '  60% { transform: scale(1.08); opacity: 1; }',
      '  100% { transform: scale(1); opacity: 1; }',
      '}',
      '#cc-chat-panel {',
      '  position: fixed; bottom: 86px; right: 22px; z-index: 9999;',
      '  width: 360px; max-width: calc(100vw - 32px); height: 480px; max-height: calc(100vh - 120px);',
      '  background: #1d1f24; border: 1px solid #2c2f36; border-radius: 14px;',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '  box-shadow: 0 14px 44px rgba(0,0,0,.6);',
      '  font-family: inherit;',
      '  transform-origin: bottom right;',
      '  animation: cc-pop .3s ease-out both;',
      '}',
      '#cc-chat-panel[hidden] { display: none; }',
      '#cc-chat-head {',
      '  background: #16181c; padding: 12px 16px; border-bottom: 1px solid #2c2f36;',
      '  display: flex; align-items: center; gap: 10px;',
      '}',
      '#cc-chat-head .cc-avatar {',
      '  width: 36px; height: 36px; border-radius: 50%; background: #b8863b;',
      '  color: #fff; display: flex; align-items: center; justify-content: center;',
      '  font-weight: 700; font-size: 11px; flex: none;',
      '}',
      '#cc-chat-head .cc-titulo { flex: 1; min-width: 0; }',
      '#cc-chat-head .cc-titulo b { display: block; color: #f5c518; font-size: 14px; }',
      '#cc-chat-head .cc-sub { color: #9aa0a6; font-size: 12px; }',
      '#cc-chat-salao {',
      '  margin-top: 6px; width: 100%; background: #22252b; color: #e8eaed;',
      '  border: 1px solid #33363d; border-radius: 8px; padding: 6px 8px;',
      '  font-size: 12.5px; font-family: inherit;',
      '}',
      '#cc-chat-salao[hidden] { display: none; }',
      '#cc-chat-ident {',
      '  padding: 8px 14px; font-size: 11.5px; color: #7dd87d; background: #14211a;',
      '  border-bottom: 1px solid #2c2f36;',
      '}',
      '#cc-chat-ident[hidden] { display: none; }',
      '#cc-chat-msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }',
      '#cc-chat-msgs .cc-msg {',
      '  max-width: 84%; padding: 9px 12px; border-radius: 12px;',
      '  font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word;',
      '}',
      '#cc-chat-msgs .cc-cliente { align-self: flex-end; background: #b8863b; color: #fff; border-bottom-right-radius: 3px; }',
      '#cc-chat-msgs .cc-bot { align-self: flex-start; background: #2a2d34; color: #e8eaed; border-bottom-left-radius: 3px; }',
      '#cc-chat-msgs .cc-atendente { align-self: flex-start; background: #274a37; color: #e8f3ec; border-bottom-left-radius: 3px; }',
      '#cc-chat-msgs .cc-erro { align-self: flex-start; background: #3a2626; color: #ffb4b4; border-bottom-left-radius: 3px; }',
      '#cc-chat-msgs .cc-rotulo { display: block; font-size: 10.5px; color: #f5c518; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 3px; }',
      '.cc-pensando { display: inline-flex; gap: 4px; align-items: center; vertical-align: middle; }',
      '.cc-pensando i { width: 6px; height: 6px; border-radius: 50%; background: #f5c518; display: inline-block; animation: cc-blink 1.2s infinite both; }',
      '.cc-pensando i:nth-child(2) { animation-delay: .2s; }',
      '.cc-pensando i:nth-child(3) { animation-delay: .4s; }',
      '@keyframes cc-blink { 0%, 80%, 100% { opacity: .2; } 40% { opacity: 1; } }',
      '@keyframes cc-pop {',
      '  0% { opacity: 0; transform: translateY(16px) scale(.9); }',
      '  60% { opacity: 1; transform: translateY(-4px) scale(1.02); }',
      '  100% { opacity: 1; transform: translateY(0) scale(1); }',
      '}',
      '#cc-chat-status {',
      '  text-align: center; font-size: 12px; color: #9aa0a6; padding: 0 10px 6px;',
      '}',
      '#cc-chat-rodape { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2c2f36; background: #17191d; }',
      '#cc-chat-entrada {',
      '  flex: 1; min-width: 0; background: #22252b; color: #e8eaed;',
      '  border: 1px solid #33363d; border-radius: 10px; padding: 10px 12px;',
      '  font-size: 13.5px; font-family: inherit; resize: none; height: 44px;',
      '}',
      '#cc-chat-entrada:focus { outline: none; border-color: #b8863b; }',
      '#cc-chat-enviar {',
      '  background: #b8863b; color: #fff; border: none; border-radius: 10px;',
      '  padding: 0 18px; cursor: pointer; font-weight: 700; font-size: 14px;',
      '}',
      '#cc-chat-enviar:disabled { opacity: .55; cursor: wait; }',
      '#cc-chat-sugestao { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }',
      '#cc-chat-sugestao[hidden] { display: none; }',
      '#cc-chat-sugestao button {',
      '  background: #22252b; color: #e8eaed; border: 1px solid #3a3e46;',
      '  border-radius: 999px; padding: 6px 12px; font-size: 12px; line-height: 1.3;',
      '  font-family: inherit; cursor: pointer;',
      '}',
      '#cc-chat-sugestao button:hover { border-color: #b8863b; color: #f5c518; }'
    ].join('\n');
    document.head.appendChild(el);
  }

  const KEY = 'cc_chat';

  function dadosLocais() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function gravarLocais(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* sem storage */ }
  }

  function novoTreadId() {
    const c = window.crypto && crypto.randomUUID ? crypto.randomUUID() : null;
    if (c) return c;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function identidadeDoLogin() {
    try {
      const u = window.Auth ? Auth.usuarioAtual() : (localStorage.user ? JSON.parse(localStorage.user) : null);
      if (!u) return {};
      return {
        nome: u.name || '',
        telefone: u.phone || '',
        email: u.email || ''
      };
    } catch (e) { return {}; }
  }

  /* chamada RPC assíncrona própria (não bloqueia a tela, permite o
     indicador de "pensando" animar durante a resposta) */
  function chatRpc(metodo, args) {
    return fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: metodo, args: args || [] })
    }).then(resp => {
      return resp.json().then(data => {
        if (!resp.ok || !data || data.ok !== true) {
          throw new Error((data && data.error) || ('Falha ' + resp.status));
        }
        return data.data;
      });
    });
  }

  /* localização do cliente (só se ele autorizar; nunca bloqueia o chat) */
  let _localPe = null;   // {'lat':..,'lng':..} lido uma vez
  function pegarLocalizacao() {
    if (_localPe) return Promise.resolve(_localPe);
    if (!('geolocation' in navigator)) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const t = setTimeout(() => resolve(null), 4000);
        navigator.geolocation.getCurrentPosition(
          p => { clearTimeout(t); _localPe = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(_localPe); },
          () => { clearTimeout(t); resolve(null); },
          { timeout: 3500, maximumAge: 600000 }
        );
      } catch (e) { resolve(null); }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injetaEstilos();
    const lojaFixada = new URLSearchParams(window.location.search).get('id') || '';

    let saloes = [];          // lista para o seletor
    let lojaId = lojaFixada;  // salão ativo no chat
    let lojaNome = '';

    function carregarSaloes() {
      try {
        const r = rpcSincrono('buscar', [{ type: 'shops', limit: 100 }]);
        saloes = (r && r.items) || [];
      } catch (e) { saloes = []; }
      if (!lojaId && saloes.length) {
        lojaId = saloes[0].id;
      }
    }
    /* fallback síncrono só para a listagem inicial (sem bloquear o chat) */
    function rpcSincrono(metodo, args) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/rpc', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ method: metodo, args: args || [] }));
      const data = JSON.parse(xhr.responseText || '{}');
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'rpc');
      return data.data;
    }

    function nomeDoLoja(id) {
      const l = saloes.find(s => s.id === id);
      return l ? (l.name || 'salão') : 'deste salão';
    }

    const local = dadosLocais();
    let threadId = null;
    const vistos = new Set();   // ids já renderizados (evita duplicidade com o polling)
    let envioEmCurso = false;

    /* ---------- DOM do widget ---------- */

    const btn = document.createElement('button');
    btn.id = 'cc-chat-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="cc-icone">&#128172;</span><span>Fale com a gente</span>';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'cc-chat-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<div id="cc-chat-head">' +
        '<div class="cc-avatar">CC</div>' +
        '<div class="cc-titulo">' +
          '<b id="cc-chat-titulo">Fale com a gente</b>' +
          '<span class="cc-sub" id="cc-chat-loja">Assistente virtual do site Corte Certo</span>' +
          '<select id="cc-chat-salao" title="Escolha o salão"></select>' +
        '</div>' +
      '</div>' +
      '<div id="cc-chat-ident" hidden></div>' +
      '<div id="cc-chat-msgs"></div>' +
      '<div id="cc-chat-status"></div>' +
      '<div id="cc-chat-sugestao" hidden></div>' +
      '<div id="cc-chat-rodape">' +
        '<textarea id="cc-chat-entrada" placeholder="Escreva sua mensagem…"></textarea>' +
        '<button id="cc-chat-enviar" type="button" disabled>Enviar</button>' +
      '</div>';
    document.body.appendChild(panel);

    const msgsEl = document.getElementById('cc-chat-msgs');
    const statusEl = document.getElementById('cc-chat-status');
    const identEl = document.getElementById('cc-chat-ident');
    const lojaEl = document.getElementById('cc-chat-loja');
    const entradaEl = document.getElementById('cc-chat-entrada');
    const enviarEl = document.getElementById('cc-chat-enviar');
    const selectEl = document.getElementById('cc-chat-salao');
    const sugestaoEl = document.getElementById('cc-chat-sugestao');

    const SUGESTOES_INICIAIS = ['Ver serviços e preços', 'Horários e endereço', 'Como agendar'];

    /* ---------- sugestões de resposta rápida ---------- */
    function mostrarSugestoes(lista) {
      sugestaoEl.innerHTML = '';
      (lista || []).slice(0, 4).forEach(txt => {
        if (!txt) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.addEventListener('click', () => {
          ocultarSugestoes();
          entradaEl.value = txt;
          entradaEl.style.height = '44px';
          enviar();
        });
        sugestaoEl.appendChild(b);
      });
      sugestaoEl.hidden = !(lista && lista.length);
    }
    function ocultarSugestoes() {
      sugestaoEl.hidden = true;
      sugestaoEl.innerHTML = '';
    }

    function montarSeletor() {
      if (lojaFixada) { selectEl.hidden = true; return; }
      if (!saloes.length) { selectEl.hidden = true; return; }
      selectEl.innerHTML =
        '<option value="">— escolha o salão —</option>' +
        saloes.map(s => '<option value="' + esc(s.id) + '"' +
          (s.id === lojaId ? ' selected' : '') + '>' + esc(s.name || 'Salão') + '</option>').join('');
      selectEl.hidden = false;
      selectEl.addEventListener('change', () => {
        const novo = selectEl.value;
        if (!novo || novo === lojaId) return;
        lojaId = novo;
        lojaNome = nomeDoLoja(lojaId);
        lojaEl.textContent = 'Assistente virtual do site Corte Certo · ' + lojaNome;
        trocarDeSalao();
      });
    }

    function trocarDeSalao() {
      threadId = null;
      vistos.clear();
      msgsEl.innerHTML = '';
      statusEl.textContent = '';
      ocultarSugestoes();
      local.threadId = null;
      local.lojaId = lojaId;
      gravarLocais(local);
      boasVindas();
    }

    function boasVindas() {
      bolha('bot', '(IA) Olá! Eu sou o assistente virtual do site Corte Certo. ' +
        'Posso te ajudar com as informações deste salão: serviços e preços, horários, endereço, contato e agendamento.\n' +
        'Se precisar falar com uma pessoa real, é só me pedir — nossa equipe responde em até 32 horas.');
      mostrarSugestoes(SUGESTOES_INICIAIS);
    }

    function bolha(role, htmlOuTexto, id) {
      const b = document.createElement('div');
      b.className = 'cc-msg ' + (role === 'cliente' ? 'cc-cliente' : (role === 'atendente' ? 'cc-atendente' : (role === 'erro' ? 'cc-erro' : 'cc-bot')));
      if (role === 'erro') {
        b.textContent = htmlOuTexto;
      } else if (role === 'cliente') {
        b.textContent = htmlOuTexto;
      } else {
        const r = document.createElement('span');
        r.className = 'cc-rotulo';
        r.textContent = role === 'atendente' ? 'Atendente humano (Corte Certo)' : 'Assistente virtual (IA)';
        b.appendChild(r);
        const t = document.createElement('span');
        t.innerHTML = esc(htmlOuTexto).replace(/\n/g, '<br>');
        b.appendChild(t);
      }
      if (id) { b.dataset.id = id; vistos.add(id); }
      msgsEl.appendChild(b);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return b;
    }

    function bolhaPensando() {
      const b = document.createElement('div');
      b.className = 'cc-msg cc-bot';
      const r = document.createElement('span');
      r.className = 'cc-rotulo';
      r.textContent = 'Assistente virtual (IA)';
      b.appendChild(r);
      const t = document.createElement('span');
      t.innerHTML = 'pensando <span class="cc-pensando"><i></i><i></i><i></i></span>';
      b.appendChild(t);
      msgsEl.appendChild(b);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return b;
    }

    function aplicarMsgs(lista) {
      if (!lista || !lista.length) return;
      let mudou = false;
      lista.forEach(m => {
        if (!m) return;
        const id = m.id || ('m' + m.rem + m.ts + m.texto);
        if (vistos.has(id)) return;
        if (m.rem === 'cliente') { bolha('cliente', m.texto || '', id); mudou = true; }
        else if (m.rem === 'bot') { bolha('bot', m.texto || '', id); mudou = true; }
        else if (m.rem === 'atendente') { bolha('atendente', m.texto || '', id); mudou = true; }
      });
      if (mudou) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function atualizarStatus(r) {
      if (r && r.estado === 'humano') {
        statusEl.textContent = 'Atendente humano acionado — resposta em até ' + (r.prazo || 32) + ' horas.';
      } else if (r && r.estado === 'novo' && !statusEl.textContent) {
        statusEl.textContent = '';
      }
    }

    btn.addEventListener('click', () => {
      const abrir = panel.hidden;
      panel.hidden = !abrir;
      if (abrir) inicializar();
      else pausarPolling();
    });

    function inicializar() {
      const id = identidadeDoLogin();
      if (id.nome) {
        identEl.textContent = 'Falando como ' + id.nome + (id.email ? ' (' + id.email + ')' : '');
        identEl.hidden = false;
      } else {
        identEl.hidden = true;
      }
      lojaEl.textContent = 'Assistente virtual do site Corte Certo' + (lojaFixada || lojaId ? ' · ' + lojaNome : '');
      if (!threadId && !msgsEl.children.length) {
        carregarHistoricoInicial();
      }
      ligarPolling();
    }

    function carregarHistoricoInicial() {
      if (threadId) {
        chatRpc('chatBuscar', [threadId]).then(r => {
          if (r && r.msgs && r.msgs.length) {
            aplicarMsgs(r.msgs);
            atualizarStatus(r);
          } else {
            /* thread inexistente (ex.: banco de chats reiniciado) → começa novo */
            threadId = null;
            local.threadId = null;
            gravarLocais(local);
            boasVindas();
          }
        }).catch(() => boasVindas());
      } else {
        boasVindas();
      }
    }

    entradaEl.addEventListener('input', () => {
      entradaEl.style.height = 'auto';
      entradaEl.style.height = Math.min(120, entradaEl.scrollHeight) + 'px';
      atualizarBotao();
    });
    entradaEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
    enviarEl.addEventListener('click', enviar);

    function atualizarBotao() {
      enviarEl.disabled = envioEmCurso || !entradaEl.value.trim();
    }

    async function enviar() {
      const texto = entradaEl.value.trim();
      if (!texto || envioEmCurso) return;
      if (!lojaId) {
        statusEl.textContent = 'Escolha um salão acima para começar.';
        return;
      }
      if (!threadId) {
        threadId = novoTreadId();
        local.threadId = threadId;
        local.lojaId = lojaId;
        gravarLocais(local);
      }

      /* menção do cliente já entra na conversa de forma otimista */
      entradaEl.value = '';
      entradaEl.style.height = '44px';
      ocultarSugestoes();
      envioEmCurso = true;
      atualizarBotao();

      const pensei = bolhaPensando();
      try {
        const id = identidadeDoLogin();
        const localPe = await pegarLocalizacao();
        const dados = {
          threadId,
          lojaId,
          nome: id.nome || '',
          telefone: id.telefone || '',
          email: id.email || '',
          mensagem: texto,
          pagina: window.location.pathname + window.location.search
        };
        if (localPe) dados.localizacao = localPe;
        const r = await chatRpc('chatEnviar', [dados]);
        /* mostra o que o servidor registrou (eco do cliente + resposta) */
        aplicarMsgs(r.msgs || []);
        atualizarStatus(r);
        mostrarSugestoes(r.sugestoes);
      } catch (e) {
        /* nunca deixa o chat mudo: mostra erro no próprio fluxo */
        ocultarSugestoes();
        bolha('erro', 'Não deu para responder agora. Sua mensagem está registrada — tente novamente em instantes.');
        statusEl.textContent = '';
      } finally {
        if (pensei && pensei.parentNode) pensei.parentNode.removeChild(pensei);
        envioEmCurso = false;
        atualizarBotao();
        entradaEl.focus();
      }
    }

    /* ------- polling: traz a resposta do atendente humano ------- */
    let timer = null;
    function ligarPolling() {
      pausarPolling();
      if (!threadId) return;
      timer = setInterval(() => {
        if (panel.hidden) return;
        chatRpc('chatBuscar', [threadId]).then(r => {
          if (r && r.msgs) aplicarMsgs(r.msgs);
          if (r) atualizarStatus(r);
        }).catch(() => { /* offline: tenta de novo no próximo ciclo */ });
      }, 15000);
    }
    function pausarPolling() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    /* ---------- inicialização ---------- */
    carregarSaloes();
    if (lojaFixada) {
      try { lojaNome = (rpcSincrono('getLoja', [lojaFixada]) || {}).name || ''; } catch (e) { /* noop */ }
    } else {
      lojaNome = nomeDoLoja(lojaId);
    }
    if (!lojaFixada && !saloes.length) {
      btn.style.display = 'none';
      return;
    }
    if (local.lojaId === lojaId && local.threadId) threadId = local.threadId;
    montarSeletor();
  });
})();