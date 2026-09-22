const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hospital_regional_ti_secret_key_2026';
const JWT_EXPIRES_IN = '30d';

/**
 * Gera hash seguro de senha utilizando scrypt nativo com salt criptográfico aleatório
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Identifica se a senha armazenada ainda está em formato legado (precisa de migração)
 */
function isLegacyPassword(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return true;
  return !storedHash.startsWith('scrypt:');
}

/**
 * Valida a senha contra o valor armazenado (novo scrypt, legado scrypt ou texto puro de transição)
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  const pwdStr = String(password);
  const storedStr = String(storedHash);

  // 1. Novo formato padrão scrypt seguro (scrypt:salt:key)
  if (storedStr.startsWith('scrypt:')) {
    try {
      const parts = storedStr.split(':');
      if (parts.length === 3) {
        const [, salt, key] = parts;
        const keyBuffer = Buffer.from(key, 'hex');
        const derivedKey = crypto.scryptSync(pwdStr, salt, 64);
        return crypto.timingSafeEqual(keyBuffer, derivedKey);
      }
    } catch (err) {
      return false;
    }
  }

  // 2. Formato legado scrypt (salt:key sem o prefixo 'scrypt:')
  try {
    const parts = storedStr.split(':');
    if (parts.length === 2 && parts[0].length === 32 && parts[1].length === 128) {
      const [salt, key] = parts;
      const keyBuffer = Buffer.from(key, 'hex');
      const derivedKey = crypto.scryptSync(pwdStr, salt, 64);
      return crypto.timingSafeEqual(keyBuffer, derivedKey);
    }
  } catch (err) {
    // segue para verificação de texto
  }

  // 3. Comparação de transição para senhas em texto puro
  if (storedStr === pwdStr || storedStr.toLowerCase() === pwdStr.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * Gera token JWT
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifica token JWT
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyPassword,
  generateToken,
  verifyToken
};
