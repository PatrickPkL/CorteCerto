'use strict';
/* ============================================================
   Corte Certo – crypt.js
   Criptografia em repouso de dados sensíveis (phone/email).
   AES-256-GCM com chave derivada (SHA-256) de DB_ENCRYPT_KEY.

   Formato: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
   Mantém compatibilidade com a implementação client-side (db.js).

   Também expõe hash SHA-256 (hex) dos valores para unicidade e
   busca sem quebrar a criptografia (colunas *_hash).
   ============================================================ */

const crypto = require('crypto');

const _ENCRYPT_KEY = process.env.DB_ENCRYPT_KEY || '';

function _deriveKey() {
  return _ENCRYPT_KEY ? crypto.createHash('sha256').update(_ENCRYPT_KEY).digest() : null;
}

function criptografar(texto) {
  const key = _deriveKey();
  if (!key || texto === null || texto === undefined || texto === '') return texto == null ? null : String(texto);
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'enc:v1:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    return String(texto);
  }
}

function descriptografar(texto) {
  const key = _deriveKey();
  if (!key || !texto || typeof texto !== 'string' || !texto.startsWith('enc:v1:')) return texto;
  try {
    const parts = texto.split(':');
    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encrypted = Buffer.from(parts[4], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (e) {
    return texto;
  }
}

function hashSHA256(valor) {
  if (valor == null) return null;
  return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

/* Conveniência para normalizar telefone antes de cifrar/buscar */
function normalizarTelefone(v) {
  return String(v || '').replace(/\D/g, '');
}

/* Encapsula um par sensível (valor + hash) para persistência */
function campoSensivel(valor) {
  const norm = typeof valor === 'string' && /^\d{8,}$/.test(valor.replace(/\D/g, ''))
    ? normalizarTelefone(valor)
    : String(valor == null ? '' : valor).trim();
  if (!norm) return { valor: null, hash: null };
  return { valor: criptografar(norm), hash: hashSHA256(norm.toLowerCase()) };
}

module.exports = {
  criptografar,
  descriptografar,
  hashSHA256,
  normalizarTelefone,
  campoSensivel
};
