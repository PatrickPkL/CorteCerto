/* ============================================================
   Corte Certo – api.js (cliente HTTP)
   Substitui o antigo local-api.js: cada chamada vira um
   POST /api/rpc síncrono, preservando o contrato try/catch
   síncrono já usado em todas as páginas.

   Sessão: token guardado em localStorage ("token"), enviado no
   header "x-cc-token" a cada chamada.
   ============================================================ */

(function () {
  'use strict';

  const KEY_TOKEN = 'token';
  const KEY_USER = 'user';
  const KEY_LOJA = 'barbershop';

  function rpc(metodo, args) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/rpc', false); // síncrono de propósito (ponte)
    xhr.setRequestHeader('Content-Type', 'application/json');
    const token = localStorage.getItem(KEY_TOKEN);
    if (token) xhr.setRequestHeader('x-cc-token', token);
    try {
      xhr.send(JSON.stringify({ method: metodo, args: args || [] }));
    } catch (e) {
      throw { status: 0, error: 'Servidor indisponível. Rode "npm run dev".' };
    }
    let resp = null;
    try { resp = JSON.parse(xhr.responseText); } catch (e) { /* resposta vazia */ }
    if (xhr.status >= 200 && xhr.status < 300 && resp && resp.ok) return resp.data;
    throw {
      status: xhr.status || (resp && resp.status) || 500,
      error: (resp && resp.error) || ('Erro ' + xhr.status)
    };
  }

  /* ---------------- API: proxy genérico ---------------- */
  /* Métodos definidos localmente no cliente (ex.: processarImagem,
     que roda no navegador via canvas) ficam no target do proxy e
     PRECEDEM o fallback RPC — antes, o trap sombreava qualquer
     propriedade atribuída e todo upload virava uma chamada RPC. */

  window.API = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      return (...args) => rpc(prop, args);
    }
  });

  /* processarImagem continua no navegador (FileReader + canvas) */
  API.processarImagem = function (file) {
    return new Promise((resolve, reject) => {
      const tiposOk = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!tiposOk.includes(file.type)) {
        return reject({ status: 400, error: 'Formato inválido. Use JPEG, PNG, WebP ou GIF.' });
      }
      if (file.size > 5 * 1024 * 1024) {
        return reject({ status: 400, error: 'Imagem muito grande (máx. 5MB).' });
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1000;
          let w = img.width, h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            const escala = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * escala); h = Math.round(h * escala);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          let qualidade = 0.82;
          let url = canvas.toDataURL('image/jpeg', qualidade);
          while (url.length > 300 * 1024 && qualidade > 0.45) {
            qualidade -= 0.08;
            url = canvas.toDataURL('image/jpeg', qualidade);
          }
          resolve(url);
        };
        img.onerror = () => reject({ status: 400, error: 'Não foi possível ler a imagem.' });
        img.src = ev.target.result;
      };
      reader.onerror = () => reject({ status: 400, error: 'Falha ao carregar o arquivo.' });
      reader.readAsDataURL(file);
    });
  };

  /* ---------------- RPC explícitos (além do Proxy) ---------------- */

  API.verificarMagicLink = function (token) { return rpc('verificarMagicLink', [token]); };
  API.gerarLembretesAmanha = function () { return rpc('gerarLembretesAmanha', []); };
  API.lojasProximas = function (dados) { return rpc('lojasProximas', [dados]); };

  /* ---------------- Auth (espelho do backend) ---------------- */

  function limpar() {
    [KEY_TOKEN, KEY_USER, KEY_LOJA].forEach(k => localStorage.removeItem(k));
  }

  window.Auth = {
    normalizarTelefone(v) {
      return String(v || '').replace(/\D/g, '');
    },

    requestCode(dados) {
      return rpc('requestCode', [dados]);
    },

    reenviarCodigo(phone, modo) {
      return rpc('reenviarCodigo', [phone, modo]);
    },

    reenviarCodigoIdentidade(dados) {
      return rpc('reenviarCodigoIdentidade', [dados]);
    },

    verifyCode(phone, code) {
      const r = rpc('verifyCode', [phone, code]);
      if (r && r.token) {
        localStorage.setItem(KEY_TOKEN, r.token);
        localStorage.setItem(KEY_USER, r.user ? JSON.stringify(r.user) : '');
        localStorage.setItem(KEY_LOJA, r.barbershop ? JSON.stringify(r.barbershop) : '');
      }
      return r;
    },

    usuarioAtual() {
      try { return JSON.parse(localStorage.getItem(KEY_USER)) || null; }
      catch (e) { return null; }
    },

    salaoDoUsuario(user) {
      if (!user || (user.role !== 'dono' && user.role !== 'barbeiro')) return null;
      try { return JSON.parse(localStorage.getItem(KEY_LOJA)) || null; }
      catch (e) { return null; }
    },

    logout() {
      try { rpc('logout', []); } catch (e) { /* sessão já ida */ }
      limpar();
    },

    limparSessao: limpar,

    /* reescreve o cache local após atualizações de perfil/loja —
       sem isso o F5 repõe valores antigos no formulário */
    sincronizarUsuario(u) {
      if (u) localStorage.setItem(KEY_USER, JSON.stringify(u));
    },

    sincronizarLoja(l) {
      if (l) localStorage.setItem(KEY_LOJA, JSON.stringify(l));
    },

    publicUser(u) { return u || null; }
  };
})();
