/* ============================================================
   Corte Certo – db.js (shim de cliente)
   Os DADOS agora vivem no servidor (backend + database/db.json).
   Aqui ficam apenas os utilitários puros de data/formatação que
   as páginas usam para renderizar — nada acessa localStorage.
   ============================================================ */

window.DB = (function () {
  'use strict';

  function pad2(n) { return String(n).padStart(2, '0'); }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function agoraMinutos() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDiasISO(n, base) {
    const d = base ? parseISO(base) : new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function diaSemana(iso) { return parseISO(iso).getDay(); } // 0=Dom..6=Sáb

  function hhmmToMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  }

  function minToHHMM(t) { return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }

  function fmtDataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    return d + '/' + m + '/' + y;
  }

  function fmtBRL(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  function iniciais(nome) {
    return (nome || '?').trim().split(/\s+/).slice(0, 2)
      .map(p => p[0].toUpperCase()).join('');
  }

  return {
    pad2, hojeISO, agoraMinutos, addDiasISO, parseISO, diaSemana,
    hhmmToMin, minToHHMM, fmtDataBR, fmtBRL, iniciais
  };
})();
