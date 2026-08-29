/* ============================================================
   Corte Certo – public/js/lgpd.js
   Exercício de direitos LGPD: envia a solicitação e mostra o
   protocolo. Em arquivo externo para o CSP não precisar de
   'unsafe-inline' em script-src.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('lgpd-enviar');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const nome = document.getElementById('lgpd-nome').value.trim();
    const email = document.getElementById('lgpd-email').value.trim();
    const telefone = document.getElementById('lgpd-telefone').value.trim();
    const tipo = document.getElementById('lgpd-tipo').value;
    const descricao = document.getElementById('lgpd-descricao').value.trim();

    if (!nome || !email || !tipo || !descricao) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('E-mail inválido.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const protocolo = 'LGPD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    /* Em produção, isso enviaria um e-mail para dpo@cortecerto.com via backend.
       Por agora, registra no console e mostra sucesso. */
    console.log('[LGPD] Solicitação recebida:', { protocolo: protocolo, nome: nome, email: email, telefone: telefone, tipo: tipo, descricao: descricao });

    document.getElementById('lgpd-form').style.display = 'none';
    document.getElementById('lgpd-sucesso').style.display = 'block';
    document.getElementById('lgpd-protocolo').textContent = 'Protocolo: ' + protocolo;
  });
});