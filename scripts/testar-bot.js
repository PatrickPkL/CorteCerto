// Testes do atendente automático (bot) — rodar com:  node scripts/testar-bot.js
// Requer o servidor rodando (npm run dev ou node server.js).
const BASE = process.env.APP_URL || 'http://localhost:3000';
const LOJA = process.env.TEST_LOJA || '00000000-0000-4000-8000-000000000001';

let aprovados = 0, reprovados = 0;
let ultimaThreadId = null;

async function rpc(metodo, args) {
  const resp = await fetch(BASE + '/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: metodo, args: args || [] })
  });
  const data = await resp.json();
  if (!resp.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + resp.status));
  return data.data;
}

function threadId() { return globalThis.crypto.randomUUID(); }

async function enviar({ email, nome, mensagem, localizacao, pagina }) {
  nome = nome || 'Teste';
  email = email || 'teste@chat.com';
  const id = threadId();
  const r = await rpc('chatEnviar', [{
    threadId: id, lojaId: LOJA, nome, email,
    mensagem, pagina: pagina || '/public/catalogo.html',
    ...(localizacao ? { localizacao } : {})
  }]);
  ultimaThreadId = id;
  const bot = (r.msgs || []).filter(m => m.rem === 'bot').pop();
  return { ...r, textoBot: (bot && bot.texto) || '' };
}

function checa(nome, cond, texto, esperado) {
  if (cond) { aprovados++; console.log('  [OK] ' + nome); }
  else {
    reprovados++;
    console.log('  [FALHOU] ' + nome + (esperado ? '\n     esperado: ' + esperado : ''));
    if (texto) console.log('     bot disse: ' + texto.split('\n')[0].slice(0, 140) + (texto.length > 140 ? '…' : ''));
  }
}

(async () => {
  console.log('== Atendente automatico — testes ==\nBase: ' + BASE);

  let r = await enviar({ mensagem: 'oi, tudo bem?' });
  checa('saudacao responde', /assistente virtual.*Corte Certo|Ol[áa]|Oi|E a[ií]|Hey/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'onde eu faco meu agendamento?' });
  checa('agendar: guia passo a passo', !r.acionadoHumano && /cat[aá]logo/i.test(r.textoBot) && /\b1\)|\b2\)/.test(r.textoBot), r.textoBot, 'guiar sem encaminhar');

  r = await enviar({ mensagem: 'me explica como agendar um horario ai' });
  checa('agendar: tenta orientar no site', !r.acionadoHumano && /agendar|hor[aá]rio/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'tem vaga hoje?' });
  checa('vaga: resolve com link+turma', !r.acionadoHumano && /catalogo|cortecerto|localhost/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'quero cancelar meu agendamento de hoje' });
  checa('cancelar: tutorial autosservico', !r.acionadoHumano && /Meus agendamentos/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'esqueci minha senha para entrar' });
  checa('senha: resolve sozinho', !r.acionadoHumano && /senha/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'aceitam cartao?' });
  checa('pagamento: nao encaminha em duvida basica', !r.acionadoHumano && r.textoBot.length > 20, r.textoBot);

  r = await enviar({ mensagem: 'que horas voces fecham hoje?' });
  checa('horarios: lista funcionamento', !r.acionadoHumano && /Funcionamento|às|geralmente|S[aá]bado/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'asdasdasd zzzqqq111' });
  checa('fallback: NAO encaminha sem motivo', !r.acionadoHumano && r.textoBot.length > 20, r.textoBot, 'mostrar menu/opcoes e manter no bot');

  r = await enviar({ email: 'marcos@saolojorge.com', nome: 'Marcos', mensagem: 'como agendo um horario?' });
  checa('logado: guia personalizado na conta', !r.acionadoHumano && /conta|Marcos/i.test(r.textoBot), r.textoBot);

  r = await enviar({ mensagem: 'me da um reembolso, cobraram errado' });
  checa('critico(reembolso): encaminha 24h', r.acionadoHumano && r.prazo === 24, r.textoBot, 'acionadoHumano true pr=24');

  r = await enviar({ mensagem: 'quero falar com um atendente humano agora' });
  checa('humano explicito: encaminha 32h', r.acionadoHumano && r.prazo === 32, r.textoBot, 'acionadoHumano true pr=32');

  r = await enviar({ mensagem: 'vou procurar outro salao, nao volto mais' });
  checa('desistencia grave: encaminha 24h', r.acionadoHumano && r.prazo === 24, r.textoBot, 'acionadoHumano true pr=24');

  const hist = await rpc('chatBuscar', [ultimaThreadId]);
  checa('chatBuscar devolve a conversa', hist && Array.isArray(hist.msgs) && hist.msgs.length > 0, '');

  console.log('\nResultado: ' + aprovados + ' aprovados, ' + reprovados + ' falhas.');
  process.exit(reprovados ? 1 : 0);
})().catch(e => {
  console.error('\nERRO: ' + e.message);
  if (!String(e.message).includes('HTTP') && !String(e.message).includes('fetch failed')) console.error(e);
  process.exit(2);
});