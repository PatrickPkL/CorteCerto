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

/* ============================================================
   Fail-closed: sem DB_ENCRYPT_KEY este módulo NUNCA grava/retorna
   dados em texto puro por descuido. Lança erro (que o RPC converte
   em 500) exigindo que o operador configure a chave ou assuma
   explicitamente o modo inseguro (CC_CRYPT_INSECURE_PLAINTEXT=1),
   destinado apenas a demos/locais sem dados reais.
   ============================================================ */

const _ENCRYPT_KEY = process.env.DB_ENCRYPT_KEY || '';
const _ALLOW_PLAINTEXT = String(process.env.CC_CRYPT_INSECURE_PLAINTEXT || '').trim() === '1';

function _semChave() {
  if (_ENCRYPT_KEY) return false;
  if (_ALLOW_PLAINTEXT) return false; // opt-in explícito e inseguro (demo)
  throw new Error(
    'CRYPTO-FAIL-CLOSED: DB_ENCRYPT_KEY não configurado — criptografia em ' +
    'repouso desativada. Defina DB_ENCRYPT_KEY ou assume explicitamente o ' +
    'modo inseguro com CC_CRYPT_INSECURE_PLAINTEXT=1 (apenas demo).'
  );
}

function _deriveKey() {
  return _ENCRYPT_KEY ? crypto.createHash('sha256').update(_ENCRYPT_KEY).digest() : null;
}

function criptografar(texto) {
  if (texto === null || texto === undefined || texto === '') return texto == null ? null : String(texto);
  const key = _deriveKey();
  if (!key) {
    if (!_ALLOW_PLAINTEXT) _semChave(); // sempre lança se a flag não foi assumida
    return String(texto); // opt-in explícito e inseguro (demo)
  }
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'enc:v1:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    throw new Error('CRYPTO-FAIL-CLOSED: falha ao criptografar dado sensível (' + (e && e.message || 'erro') + ').');
  }
}

function descriptografar(texto) {
  if (!texto || typeof texto !== 'string') return texto;
  if (!texto.startsWith('enc:v1:')) return texto; // já está em claro (legado/demo)
  const key = _deriveKey();
  if (!key) {
    if (!_ALLOW_PLAINTEXT) _semChave(); // sempre lança se a flag não foi assumida
    return texto; // opt-in inseguro (demo): devolve como está
  }
  try {
    const parts = texto.split(':');
    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encrypted = Buffer.from(parts[4], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (e) {
    throw new Error('CRYPTO-FAIL-CLOSED: falha ao descriptografar dado sensível (' + (e && e.message || 'erro') + ').');
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
