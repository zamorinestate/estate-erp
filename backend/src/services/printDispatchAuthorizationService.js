'use strict';

const crypto = require('node:crypto');

const PRINT_DISPATCH_AUTH_VERSION = 'ZAMORIN_PRINT_DISPATCH_V1';
const PRINT_DISPATCH_AUTH_ALGORITHM = 'Ed25519';
const PRINT_DISPATCH_AUTH_AUDIENCE = 'LOCAL_RAW_ESC_POS';
const PRINT_DISPATCH_AUTH_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}
function token(value, fieldName, { optional = false } = {}) {
  const clean = String(value || '').trim().toUpperCase();
  if (!clean) {
    if (optional) return 'UNBOUND';
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', `${fieldName} is required.`);
  }
  if (/[\r\n]/.test(clean)) {
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', `${fieldName} must be a single-line token.`);
  }
  return clean;
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function hashToken(value, fieldName) {
  const clean = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', `${fieldName} must be a SHA-256 hex digest.`);
  }
  return clean;
}
function positiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', `${fieldName} must be a positive safe integer.`);
  }
  return number;
}
function epoch(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', `${fieldName} must be a positive epoch-millisecond value.`);
  }
  return number;
}
function canonicalPrintDispatchAuthorization({
  organisationId, cafeId, deviceId, printJobId, payloadSha256, payloadBytes,
  printerTarget, drawerKickRequested, issuedAtEpochMs, expiresAtEpochMs,
}) {
  return [
    PRINT_DISPATCH_AUTH_VERSION,
    `audience=${PRINT_DISPATCH_AUTH_AUDIENCE}`,
    `organisationId=${token(organisationId, 'organisationId')}`,
    `cafeId=${token(cafeId, 'cafeId')}`,
    `deviceId=${token(deviceId, 'deviceId', { optional: true })}`,
    `printJobId=${token(printJobId, 'printJobId')}`,
    `payloadSha256=${hashToken(payloadSha256, 'payloadSha256')}`,
    `payloadBytes=${positiveInteger(payloadBytes, 'payloadBytes')}`,
    `printerTarget=${token(printerTarget || 'DEFAULT_THERMAL', 'printerTarget')}`,
    `drawerKickRequested=${drawerKickRequested === true ? 'TRUE' : 'FALSE'}`,
    `issuedAtEpochMs=${epoch(issuedAtEpochMs, 'issuedAtEpochMs')}`,
    `expiresAtEpochMs=${epoch(expiresAtEpochMs, 'expiresAtEpochMs')}`,
  ].join('\n');
}
function importPrivateKey(value = process.env.ZAMORIN_PRINT_DISPATCH_PRIVATE_KEY_PKCS8_B64) {
  const encoded = String(value || '').trim();
  if (!encoded) return null;
  try {
    const key = crypto.createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') fail('PRINT_DISPATCH_SIGNING_KEY_INVALID', 'Print-dispatch signing key must be Ed25519.');
    return key;
  } catch (err) {
    if (err?.code === 'PRINT_DISPATCH_SIGNING_KEY_INVALID') throw err;
    fail('PRINT_DISPATCH_SIGNING_KEY_INVALID', 'Print-dispatch private key is not valid PKCS#8 Ed25519 key material.');
  }
}
function importPublicKey(value = process.env.ZAMORIN_PRINT_DISPATCH_PUBLIC_KEY_SPKI_B64) {
  const encoded = String(value || '').trim();
  if (!encoded) return null;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') fail('PRINT_DISPATCH_VERIFICATION_KEY_INVALID', 'Print-dispatch verification key must be Ed25519.');
    return key;
  } catch (err) {
    if (err?.code === 'PRINT_DISPATCH_VERIFICATION_KEY_INVALID') throw err;
    fail('PRINT_DISPATCH_VERIFICATION_KEY_INVALID', 'Print-dispatch public key is not valid SPKI Ed25519 key material.');
  }
}
function publicKeyId(publicKey) {
  return sha256(publicKey.export({ format: 'der', type: 'spki' }));
}
function createPrintDispatchAuthorization(binding, {
  privateKeyBase64 = process.env.ZAMORIN_PRINT_DISPATCH_PRIVATE_KEY_PKCS8_B64,
  nowEpochMs = Date.now(),
  ttlMs = PRINT_DISPATCH_AUTH_TTL_MS,
} = {}) {
  const privateKey = importPrivateKey(privateKeyBase64);
  if (!privateKey) return null;
  const issuedAtEpochMs = Number(nowEpochMs);
  const expiresAtEpochMs = issuedAtEpochMs + Number(ttlMs);
  const canonical = canonicalPrintDispatchAuthorization({ ...binding, issuedAtEpochMs, expiresAtEpochMs });
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    version: PRINT_DISPATCH_AUTH_VERSION,
    algorithm: PRINT_DISPATCH_AUTH_ALGORITHM,
    audience: PRINT_DISPATCH_AUTH_AUDIENCE,
    keyId: publicKeyId(publicKey),
    organisationId: token(binding.organisationId, 'organisationId'),
    cafeId: token(binding.cafeId, 'cafeId'),
    deviceId: token(binding.deviceId, 'deviceId', { optional: true }),
    printJobId: token(binding.printJobId, 'printJobId'),
    payloadSha256: hashToken(binding.payloadSha256, 'payloadSha256'),
    payloadBytes: positiveInteger(binding.payloadBytes, 'payloadBytes'),
    printerTarget: token(binding.printerTarget || 'DEFAULT_THERMAL', 'printerTarget'),
    drawerKickRequested: binding.drawerKickRequested === true,
    issuedAtEpochMs,
    expiresAtEpochMs,
    signature,
  };
}
function verificationKeyInfo({ publicKeyBase64 = process.env.ZAMORIN_PRINT_DISPATCH_PUBLIC_KEY_SPKI_B64 } = {}) {
  if (!String(publicKeyBase64 || '').trim()) return { ready: false, reason: 'PRINT_DISPATCH_VERIFICATION_KEY_REQUIRED', keyId: null, publicKey: null };
  try {
    const publicKey = importPublicKey(publicKeyBase64);
    return { ready: true, reason: null, keyId: publicKeyId(publicKey), publicKey };
  } catch (err) {
    return { ready: false, reason: err.code || 'PRINT_DISPATCH_VERIFICATION_KEY_INVALID', keyId: null, publicKey: null };
  }
}
function verifyPrintDispatchAuthorization(authorization, expectedBinding, {
  publicKeyBase64 = process.env.ZAMORIN_PRINT_DISPATCH_PUBLIC_KEY_SPKI_B64,
  nowEpochMs = Date.now(),
} = {}) {
  if (!authorization || typeof authorization !== 'object') fail('PRINT_DISPATCH_AUTHORIZATION_REQUIRED', 'Server-signed print dispatch authorization is required.');
  if (authorization.version !== PRINT_DISPATCH_AUTH_VERSION || authorization.algorithm !== PRINT_DISPATCH_AUTH_ALGORITHM || authorization.audience !== PRINT_DISPATCH_AUTH_AUDIENCE) {
    fail('PRINT_DISPATCH_AUTHORIZATION_INVALID', 'Unsupported print-dispatch authorization envelope.');
  }
  const verifier = verificationKeyInfo({ publicKeyBase64 });
  if (!verifier.ready) fail(verifier.reason, 'Print-dispatch verification key is unavailable or invalid.');
  if (String(authorization.keyId || '').toLowerCase() !== verifier.keyId) fail('PRINT_DISPATCH_AUTHORIZATION_KEY_MISMATCH', 'Print-dispatch authorization key ID does not match the pinned verifier.');
  const issuedAtEpochMs = epoch(authorization.issuedAtEpochMs, 'issuedAtEpochMs');
  const expiresAtEpochMs = epoch(authorization.expiresAtEpochMs, 'expiresAtEpochMs');
  const now = Number(nowEpochMs);
  if (expiresAtEpochMs <= issuedAtEpochMs || issuedAtEpochMs > now + CLOCK_SKEW_MS || expiresAtEpochMs <= now) {
    fail('PRINT_DISPATCH_AUTHORIZATION_EXPIRED', 'Print-dispatch authorization is expired or not yet valid.');
  }
  const canonical = canonicalPrintDispatchAuthorization({ ...authorization, issuedAtEpochMs, expiresAtEpochMs });
  let signature;
  try { signature = Buffer.from(String(authorization.signature || ''), 'base64url'); }
  catch (_) { fail('PRINT_DISPATCH_AUTHORIZATION_SIGNATURE_INVALID', 'Print-dispatch signature encoding is invalid.'); }
  if (signature.length !== 64 || !crypto.verify(null, Buffer.from(canonical, 'utf8'), verifier.publicKey, signature)) {
    fail('PRINT_DISPATCH_AUTHORIZATION_SIGNATURE_INVALID', 'Print-dispatch authorization signature verification failed.');
  }
  const expected = {
    organisationId: token(expectedBinding.organisationId, 'organisationId'),
    cafeId: token(expectedBinding.cafeId, 'cafeId'),
    deviceId: token(expectedBinding.deviceId, 'deviceId', { optional: true }),
    printJobId: token(expectedBinding.printJobId, 'printJobId'),
    payloadSha256: hashToken(expectedBinding.payloadSha256, 'payloadSha256'),
    payloadBytes: positiveInteger(expectedBinding.payloadBytes, 'payloadBytes'),
    printerTarget: token(expectedBinding.printerTarget || 'DEFAULT_THERMAL', 'printerTarget'),
    drawerKickRequested: expectedBinding.drawerKickRequested === true,
  };
  const authorized = {
    organisationId: token(authorization.organisationId, 'organisationId'),
    cafeId: token(authorization.cafeId, 'cafeId'),
    deviceId: token(authorization.deviceId, 'deviceId', { optional: true }),
    printJobId: token(authorization.printJobId, 'printJobId'),
    payloadSha256: hashToken(authorization.payloadSha256, 'payloadSha256'),
    payloadBytes: positiveInteger(authorization.payloadBytes, 'payloadBytes'),
    printerTarget: token(authorization.printerTarget || 'DEFAULT_THERMAL', 'printerTarget'),
    drawerKickRequested: authorization.drawerKickRequested === true,
  };
  for (const field of Object.keys(expected)) {
    if (expected[field] !== authorized[field]) fail('PRINT_DISPATCH_AUTHORIZATION_BINDING_MISMATCH', `Print-dispatch authorization does not match ${field}.`);
  }
  return { verified: true, keyId: verifier.keyId, expiresAtEpochMs };
}
module.exports = {
  PRINT_DISPATCH_AUTH_VERSION, PRINT_DISPATCH_AUTH_ALGORITHM, PRINT_DISPATCH_AUTH_AUDIENCE,
  PRINT_DISPATCH_AUTH_TTL_MS, canonicalPrintDispatchAuthorization,
  createPrintDispatchAuthorization, verificationKeyInfo, verifyPrintDispatchAuthorization,
};
