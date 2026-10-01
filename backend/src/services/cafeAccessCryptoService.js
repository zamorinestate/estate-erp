'use strict';

const crypto = require('crypto');

// Development fallback keys — NEVER permitted in production
const DEV_FALLBACK_ENCRYPTION_KEY =
  'a3f8c9b2e1d40765982143fe56ba78cd90123456789abcdef0123456789abcde';
const DEV_FALLBACK_PEPPER =
  'zamorin-cafe-pin-lookup-pepper-dev-secret-only-not-for-prod';

function getEncryptionKey() {
  const envKey = process.env.CAFE_ACCESS_PIN_ENCRYPTION_KEY;
  if (envKey && envKey.trim()) {
    const trimmed = envKey.trim();
    if (trimmed.length === 64) {
      return Buffer.from(trimmed, 'hex');
    }
    if (trimmed.length === 32) {
      return Buffer.from(trimmed, 'utf8');
    }
    // Base64 32-byte key
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length === 32) return buf;
    } catch {}
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL CONFIGURATION ERROR: CAFE_ACCESS_PIN_ENCRYPTION_KEY must be a valid 32-byte key in production.'
    );
  }

  return Buffer.from(DEV_FALLBACK_ENCRYPTION_KEY, 'hex');
}

function getLookupPepper() {
  const pepper = process.env.CAFE_ACCESS_PIN_LOOKUP_PEPPER;
  if (pepper && pepper.trim()) {
    return pepper.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL CONFIGURATION ERROR: CAFE_ACCESS_PIN_LOOKUP_PEPPER must be configured in production.'
    );
  }

  return DEV_FALLBACK_PEPPER;
}

function getPublicAppOrigin() {
  const origin =
    process.env.PUBLIC_APP_ORIGIN ||
    process.env.APP_ORIGIN ||
    process.env.FRONTEND_URL ||
    '';
  if (origin && origin.trim()) {
    return origin.trim().replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://zamorin-cafe-erp.vercel.app';
  }
  return 'http://localhost:5173';
}

/**
 * Validates whether a 6-digit PIN is considered weak or trivial.
 * Rejects:
 * - Repeated digits: 000000, 111111, 222222, ...
 * - Sequential ascending: 123456, 234567, 345678, ...
 * - Sequential descending: 654321, 543210, 987654, ...
 * - Alternating 2-digit repetitions: 121212, 101010, ...
 */
function isWeakPin(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return true;
  }

  // All identical digits
  if (/^(\d)\1{5}$/.test(pin)) {
    return true;
  }

  // Sequential patterns
  const SEQUENTIAL_PATTERNS = [
    '012345',
    '123456',
    '234567',
    '345678',
    '456789',
    '567890',
    '098765',
    '987654',
    '876543',
    '765432',
    '654321',
    '543210',
  ];
  if (SEQUENTIAL_PATTERNS.includes(pin)) {
    return true;
  }

  // Alternating repetitions (e.g. 121212, 454545)
  if (
    pin.slice(0, 2) === pin.slice(2, 4) &&
    pin.slice(0, 2) === pin.slice(4, 6)
  ) {
    return true;
  }

  // Triple repetitions (e.g. 123123)
  if (pin.slice(0, 3) === pin.slice(3, 6)) {
    return true;
  }

  return false;
}

/**
 * Generates a cryptographically random, non-trivial 6-digit permanent PIN.
 */
function generateSecureCafePin() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Generate an integer between 100000 and 999999 inclusive
    const num = crypto.randomInt(100000, 1000000);
    const pin = String(num);
    if (!isWeakPin(pin)) {
      return pin;
    }
  }
  throw new Error('Failed to generate secure non-trivial PIN after multiple attempts.');
}

/**
 * Computes an HMAC-SHA256 lookup hash for constant-time index searches.
 */
function computePinLookupHash(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    throw new Error('Permanent Café PIN must be a 6-digit numeric string.');
  }
  const pepper = getLookupPepper();
  return crypto
    .createHmac('sha256', pepper)
    .update(pin)
    .digest('hex');
}

/**
 * Encrypts a 6-digit permanent PIN using AES-256-GCM.
 * Output format: `ivHex:authTagHex:ciphertextHex`
 */
function encryptCafePin(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    throw new Error('Permanent Café PIN must be a 6-digit numeric string.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(pin, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts a permanent PIN encrypted with AES-256-GCM.
 * Validates authentication tag; throws if ciphertext or tag was tampered with.
 */
function decryptCafePin(encryptedPayload) {
  if (typeof encryptedPayload !== 'string') {
    throw new Error('Encrypted PIN payload must be a string.');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted PIN format.');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates an opaque high-entropy token (32 bytes base64url).
 */
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Computes a SHA-256 hex hash of an opaque token for secure database storage.
 */
function hashOpaqueToken(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('Token must be a non-empty string.');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifySecretKeys() {
  getEncryptionKey();
  getLookupPepper();
  return true;
}

function encryptSecret(text) {
  if (typeof text !== 'string' || !text) {
    throw new Error('Secret must be a non-empty string.');
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

function decryptSecret(encryptedPayload) {
  if (typeof encryptedPayload !== 'string') {
    throw new Error('Encrypted payload must be a string.');
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted format.');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  verifySecretKeys,
  getPublicAppOrigin,
  isWeakPin,
  generateSecureCafePin,
  generateRandom6DigitPin: generateSecureCafePin,
  computePinLookupHash,
  encryptCafePin,
  encryptPin: encryptCafePin,
  decryptCafePin,
  decryptPin: decryptCafePin,
  encryptSecret,
  decryptSecret,
  generateOpaqueToken,
  generateHighEntropyToken: generateOpaqueToken,
  hashOpaqueToken,
  computeTokenHash: hashOpaqueToken,
};

