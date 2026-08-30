"use strict";

var GMAIL_USER = process.env.GMAIL_USER || "";
var GMAIL_PASS = process.env.GMAIL_PASS || "";
var FROM_NAME = process.env.EMAIL_FROM || "Corte Certo";
var APP_URL = process.env.APP_URL || "http://localhost:3000";
var DEMO_MODE = !GMAIL_USER || !GMAIL_PASS;

var transporter = null;
var transporterPorta = null;

/* Gmail aceita envio pelas portas 465 (SSL implícito) e 587 (STARTTLS).
   O Render só tem rota IPv4 — por isso resolvemos o IPv4 do Gmail de forma
   explícita e conectamos no IP (family:4 às vezes é ignorado/falha silenciosa). */
var PORTAS_SMTP = [465, 587];

var dns = require("dns");

/* Obtém o primeiro endereço IPv4 de smtp.gmail.com. */
function resolverIPv4() {
  return new Promise(function (resolve, reject) {
    dns.resolve4("smtp.gmail.com", function (err, enderecos) {
      if (err || !enderecos || !enderecos.length) return reject(err || new Error("Sem IPv4 para smtp.gmail.com"));
      resolve(enderecos[0]);
    });
  });
}

function criarTransporter(porta, ip) {
  var nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    host: ip,
    port: porta,
    secure: porta === 465,
    requireTLS: porta !== 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: { servername: "smtp.gmail.com" },
    auth: { user: GMAIL_USER, pass: GMAIL_PASS.replace(/\s/g, "") }
  });
}

/* Monta o transporter na primeira porta que verificar a conexão.
   Testa as portas em paralelo e usa a que responder primeiro. */
function garantirTransporter() {
  if (transporter) return Promise.resolve(transporter);
  return resolverIPv4().then(function (ip) {
    var tentativas = PORTAS_SMTP.map(function (porta) {
      var t = criarTransporter(porta, ip);
      return t.verify()
        .then(function () {
          return { porta: porta, t: t, ok: true };
        })
        .catch(function (e) {
          return { porta: porta, t: t, ok: false, erro: e };
        });
    });
    return Promise.all(tentativas).then(function (resultados) {
      var ok = null;
      for (var i = 0; i < resultados.length; i++) {
        if (resultados[i].ok) { ok = resultados[i]; break; }
      }
      if (!ok) { // nenhuma porta conectou — usa a primeira e deixa o envio falhar com erro real
        ok = { porta: PORTAS_SMTP[0], t: criarTransporter(PORTAS_SMTP[0], ip) };
      }
      transporter = ok.t;
      transporterPorta = ok.porta;
      console.log("[EMAIL] Conectado ao Gmail " + ip + " via porta " + ok.porta);
      return transporter;
    });
  });
}

function temEmailReal() {
  return !DEMO_MODE;
}

function enviarEmailComTimeout(destino, tag) {
  if (DEMO_MODE) {
    console.log("========================================");
    console.log("[EMAIL - MODO DEMO] " + (tag || ""));
    console.log("De:", FROM_NAME + " <" + GMAIL_USER + ">");
    console.log("Para:", destino.to);
    console.log("Assunto:", destino.subject);
    console.log("========================================");
    return Promise.resolve();
  }

  var mailOptions = {
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: destino.to,
    subject: destino.subject,
    html: destino.html
  };

  return garantirTransporter().then(function () {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        console.log("[EMAIL] Timeout no envio de", tag || "email");
        reject(new Error("Timeout no envio de " + (tag || "email")));
      }, 25000);

      transporter.sendMail(mailOptions)
        .then(function () {
          clearTimeout(timer);
          console.log("[EMAIL] Enviado:", tag || "email", "->", destino.to);
          resolve();
        })
        .catch(function (err) {
          clearTimeout(timer);
          console.log("[EMAIL] Erro no envio de", tag || "email");
          console.log("[EMAIL] Erro:", err && err.message ? err.message : err);
          var detalhe = (err && err.response) ? (" — resposta SMTP: " + err.response) : "";
          console.log("[EMAIL] Dica:", "verifique GMAIL_USER/GMAIL_PASS (senha de app)", detalhe);
          reject(err);
        });
    });
  });
}

function cabecalhoHTML() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f4f4f4;font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">';
}

function rodapeHTML() {
  return "</body></html>";
}

function containerHTML(conteudo) {
  return '<div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">' +
    '<div style="background-color:#b8863b;padding:30px 20px;text-align:center;">' +
      '<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Corte Certo</h1>' +
    "</div>" +
    '<div style="padding:40px 20px;">' +
      conteudo +
    "</div>" +
    '<div style="padding:20px;text-align:center;background-color:#f9f9f9;border-top:1px solid #eeeeee;">' +
      '<p style="color:#999999;font-size:12px;margin:0;">Corte Certo &copy; ' + new Date().getFullYear() + ' — Todos os direitos reservados.</p>' +
    "</div>" +
    "</div>";
}

function botaoHTML(href, texto) {
  return '<a href="' + href + '" style="display:inline-block;background-color:#b8863b;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:600;margin:20px 0;">' + texto + "</a>";
}

function enviarLinkMagico(email, token, nome) {
  var link = APP_URL + "/magic-link?token=" + token;

  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Olá' + (nome ? ", " + nome : "") + "!</p>" +
    '<p style="color:#555555;font-size:14px;margin:0 0 24px 0;">Clique no botão abaixo para acessar sua conta no Corte Certo. Não é necessário senha.</p>' +
    '<div style="text-align:center;">' +
      botaoHTML(link, "Entrar no Corte Certo") +
    "</div>" +
    '<p style="color:#999999;font-size:12px;margin:24px 0 0 0;text-align:center;">Este link expira em 15 minutos.</p>';

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: email,
    subject: "Confirme seu e-mail — Corte Certo",
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "link-magico");
}

function enviarCodigoVerificacao(email, codigo) {
  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Olá!</p>' +
    '<p style="color:#555555;font-size:14px;margin:0 0 24px 0;">Use o código abaixo para concluir seu cadastro no Corte Certo:</p>' +
    '<div style="text-align:center;background-color:#f9f9f9;border-radius:8px;padding:24px;margin:16px 0;">' +
      '<span style="display:inline-block;color:#b8863b;font-size:32px;font-weight:800;letter-spacing:8px;font-family:monospace;">' + String(codigo) + "</span>" +
    "</div>" +
    '<p style="color:#999999;font-size:12px;margin:16px 0 0 0;text-align:center;">Este código expira em 10 minutos.</p>';

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: email,
    subject: "Seu código de verificação — Corte Certo",
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "codigo-verificacao");
}

function enviarConfirmacaoAgendamento(email, dados) {
  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Olá, ' + (dados.clienteNome || "cliente") + "!</p>" +
    '<p style="color:#555555;font-size:14px;margin:0 0 8px 0;">Seu agendamento em <strong>' + (dados.salaoNome || "") + "</strong> foi confirmado:</p>" +
    '<div style="background-color:#f9f9f9;border-radius:6px;padding:16px;margin:16px 0;">' +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Serviço:</strong> ' + (dados.servicos || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Data:</strong> ' + (dados.data || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0;"><strong>Hora:</strong> ' + (dados.hora || "") + "</p>" +
    "</div>" +
    '<p style="color:#555555;font-size:14px;margin:16px 0 0 0;">Até lá!</p>';

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: email,
    subject: "Agendamento confirmado — " + (dados.salaoNome || "Corte Certo"),
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "confirmacao-agendamento");
}

function enviarNovoAgendamento(email, dados) {
  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Novo agendamento recebido!</p>' +
    '<div style="background-color:#f9f9f9;border-radius:6px;padding:16px;margin:16px 0;">' +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Cliente:</strong> ' + (dados.clienteNome || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Salaão:</strong> ' + (dados.salaoNome || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Serviço:</strong> ' + (dados.servicos || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Data:</strong> ' + (dados.data || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0;"><strong>Hora:</strong> ' + (dados.hora || "") + "</p>" +
    "</div>";

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: email,
    subject: "Novo agendamento — " + (dados.clienteNome || "Cliente"),
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "novo-agendamento");
}

function enviarBoasVindas(dados) {
  var link = APP_URL + "/painel";

  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Bem-vindo ao Corte Certo, ' + (dados.nome || "") + "!</p>" +
    '<p style="color:#555555;font-size:14px;margin:0 0 8px 0;">Sua conta no salão <strong>' + (dados.nomeSalao || "") + "</strong> foi criada." +
    (dados.trialDias ? " Você tem <strong>" + dados.trialDias + " dias</strong> de teste grátis." : "") +
    "</p>" +
    '<p style="color:#555555;font-size:14px;margin:0 0 16px 0;">Comece agora mesmo:</p>' +
    '<div style="background-color:#f9f9f9;border-radius:6px;padding:16px;margin:16px 0;">' +
      '<p style="color:#333333;font-size:14px;margin:0 0 10px 0;">1. Cadastre seus serviços e preços</p>' +
      '<p style="color:#333333;font-size:14px;margin:0 0 10px 0;">2. Adicione seus profissionais</p>' +
      '<p style="color:#333333;font-size:14px;margin:0 0 10px 0;">3. Compartilhe o link de agendamento com seus clientes</p>' +
      '<p style="color:#333333;font-size:14px;margin:0;">4. Acompanhe seus agendamentos no painel</p>' +
    "</div>" +
    '<div style="text-align:center;">' +
      botaoHTML(link, "Acessar meu painel") +
    "</div>";

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: dados.email,
    subject: "Bem-vindo ao Corte Certo, " + (dados.nome || "") + "!",
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "boas-vindas");
}

function enviarLembrete(email, dados) {
  var assunto;
  if (dados.isCliente) {
    assunto = "Lembrete: amanh\u00e3 \u00e0s " + (dados.hora || "") + " em " + (dados.salaoNome || "");
  } else {
    assunto = "Lembrete: " + (dados.nome || "Cliente") + " amanh\u00e3 \u00e0s " + (dados.hora || "");
  }

  var urlPainel = dados.appUrl || APP_URL + "/painel";

  var conteudo =
    '<p style="color:#333333;font-size:16px;margin:0 0 16px 0;">Olá' + (dados.nome ? ", " + dados.nome : "") + "!</p>" +
    '<p style="color:#555555;font-size:14px;margin:0 0 8px 0;">Lembrando do seu agendamento amanh\u00e3:</p>' +
    '<div style="background-color:#f9f9f9;border-radius:6px;padding:16px;margin:16px 0;">' +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Salão:</strong> ' + (dados.salaoNome || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Serviço:</strong> ' + (dados.servicos || "") + "</p>" +
      '<p style="color:#333333;font-size:14px;margin:0 0 6px 0;"><strong>Hora:</strong> ' + (dados.hora || "") + "</p>" +
      (dados.endereco ? '<p style="color:#333333;font-size:14px;margin:0;"><strong>Endereço:</strong> ' + dados.endereco + "</p>" : "") +
    "</div>" +
    '<div style="text-align:center;">' +
      botaoHTML(urlPainel, dados.isCliente ? "Gerenciar agendamento" : "Ver no painel") +
    "</div>";

  return enviarEmailComTimeout({
    from: FROM_NAME + " <" + GMAIL_USER + ">",
    to: email,
    subject: assunto,
    html: cabecalhoHTML() + containerHTML(conteudo) + rodapeHTML()
  }, "lembrete");
}

module.exports = {
  enviarLinkMagico: enviarLinkMagico,
  enviarCodigoVerificacao: enviarCodigoVerificacao,
  temEmailReal: temEmailReal,
  enviarConfirmacaoAgendamento: enviarConfirmacaoAgendamento,
  enviarNovoAgendamento: enviarNovoAgendamento,
  enviarBoasVindas: enviarBoasVindas,
  enviarLembrete: enviarLembrete
};
