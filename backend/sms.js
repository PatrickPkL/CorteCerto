"use strict";

var KEY = process.env.TOTALVOICE_API_KEY;
var DEMODO_MODE = !KEY;

var client = null;
if (!DEMODO_MODE) {
  var totalvoice = require("totalvoice-node");
  client = new totalvoice(KEY);
}

function formatarNumero(numero) {
  var digitos = String(numero).replace(/\D/g, "");

  if (digitos.length === 11) {
    return "55" + digitos;
  }
  if (digitos.length === 10) {
    return "55" + digitos;
  }
  if (digitos.length === 13 && digitos.indexOf("55") === 0) {
    return digitos;
  }

  if (digitos.length >= 12 && digitos.length <= 13) {
    return digitos;
  }

  if (digitos.length <= 11) {
    while (digitos.length < 11) {
      digitos = digitos + "0";
    }
    return "55" + digitos;
  }

  return digitos;
}

function enviarSMS(numero, mensagem) {
  return new Promise(function (resolve) {
    var numeroFormatado = formatarNumero(numero);

    if (DEMODO_MODE) {
      console.log("========================================");
      console.log("[SMS - MODO DEMO]");
      console.log("Para:", numeroFormatado);
      console.log("Mensagem:", mensagem);
      console.log("========================================");
      resolve({ ok: true, provider: "demo" });
      return;
    }

    var timer = setTimeout(function () {
      console.log("[SMS] Timeout ao enviar para", numeroFormatado);
      console.log("[SMS] Fallback: mensagem impressa no console");
      console.log("[SMS] Texto:", mensagem);
      resolve({ ok: true, provider: "timeout-fallback" });
    }, 10000);

    client.sms.enviar(numeroFormatado, mensagem)
      .then(function (data) {
        clearTimeout(timer);
        console.log("[SMS] Enviado com sucesso para", numeroFormatado);
        resolve({ ok: true, provider: "totalvoice" });
      })
      .catch(function (err) {
        clearTimeout(timer);
        console.log("[SMS] Erro ao enviar para", numeroFormatado);
        console.log("[SMS] Erro:", err && err.message ? err.message : err);
        console.log("[SMS] Fallback: mensagem impressa no console");
        console.log("[SMS] Texto:", mensagem);
        resolve({ ok: true, provider: "error-fallback" });
      });
  });
}

module.exports = {
  enviarSMS: enviarSMS,
  formatarNumero: formatarNumero
};
