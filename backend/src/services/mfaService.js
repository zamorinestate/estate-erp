'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function getMfaEncryptionKey() {
  const keyHex = process.env.MFA_ENCRYPTION_KEY;
  if (!keyHex || typeof keyHex !== 'string') {
    throw new Error('MFA_ENCRYPTION_KEY environment variable is required.');
  }

  let normalized = keyHex.trim();
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    const isMatchingQuotedPair =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'");

    if (isMatchingQuotedPair) {
      normalized = normalized.slice(1, -1).trim();
    }
  }

  if (normalized.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }

  return Buffer.from(normalized, 'hex');
}

function encryptMfaSecret(secretText) {
  if (!secretText || typeof secretText !== 'string') {
    throw new Error('Secret text is required for encryption.');
  }

  const key = getMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(secretText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptMfaSecret(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data is required for decryption.');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format.');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getMfaEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Input string is required for base32 decoding.');
  }

  const str = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < str.length; i++) {
    const idx = BASE32_CHARS.indexOf(str[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${str[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotpSecret() {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

function generateTotpCode(secretBase32, timestamp = Date.now()) {
  const secretBuffer = base32Decode(secretBase32);
  const timeStep = 30;
  const counter = Math.floor(timestamp / 1000 / timeStep);

  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', secretBuffer).update(timeBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;

  return {
    code: String(otp).padStart(6, '0'),
    counter,
  };
}

function verifyTotpCode(secretBase32, inputCode, timestamp = Date.now(), window = 1) {
  if (!inputCode || typeof inputCode !== 'string') {
    return { valid: false, counter: null };
  }

  const normalizedInput = inputCode.trim();
  if (!/^\d{6}$/.test(normalizedInput)) {
    return { valid: false, counter: null };
  }

  const secretBuffer = base32Decode(secretBase32);
  const timeStep = 30;
  const currentCounter = Math.floor(timestamp / 1000 / timeStep);

  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', secretBuffer).update(timeBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    const codeStr = String(otp).padStart(6, '0');

    if (crypto.timingSafeEqual(Buffer.from(codeStr), Buffer.from(normalizedInput))) {
      return { valid: true, counter };
    }
  }

  return { valid: false, counter: null };
}

function generateOtpauthUri({ email, secretBase32, issuer = 'Zamorin Cafe ERP' }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 16 cryptographically secure random bytes = 128 bits of raw entropy per code
    const raw = crypto.randomBytes(16).toString('hex').toUpperCase();
    const formatted = raw.match(/.{1,4}/g).join('-');
    codes.push(formatted);
  }
  return codes;
}

function hashRecoveryCode(code) {
  if (!code || typeof code !== 'string') {
    throw new Error('Recovery code is required.');
  }

  const normalized = code.trim().toUpperCase().replaceAll('-', '');

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function generateMfaToken({ user, purpose, rememberDevice = false, expiresIn = '10m' }) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters.');
  }

  return jwt.sign(
    {
      sub: user.userId,
      org: user.organisationId,
      role: user.role,
      type: purpose,
      rem: Boolean(rememberDevice),
    },
    secret,
    {
      algorithm: 'HS256',
      issuer: 'zamorin-cafe-erp-api',
      audience: 'zamorin-cafe-erp',
      expiresIn,
      jwtid: crypto.randomUUID(),
    }
  );
}

function verifyMfaToken(token, expectedPurpose) {
  if (!token) {
    throw new Error('MFA token is required.');
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters.');
  }

  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'zamorin-cafe-erp-api',
    audience: 'zamorin-cafe-erp',
  });

  if (payload.type !== expectedPurpose) {
    throw new Error('Invalid MFA token purpose.');
  }

  return payload;
}

module.exports = {
  getMfaEncryptionKey,
  encryptMfaSecret,
  decryptMfaSecret,
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpauthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
  generateMfaToken,
  verifyMfaToken,
};
