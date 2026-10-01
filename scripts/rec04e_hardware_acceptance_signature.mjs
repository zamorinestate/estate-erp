import crypto from 'crypto';

const SIGNATURE_VERSION = 'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_V1';
const SIGNATURE_ALGORITHM = 'Ed25519';

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'integritySignature') continue;
      out[key] = sortCanonical(value[key]);
    }
    return out;
  }
  return value;
}

export function canonicalAcceptanceReport(report) {
  if (!report || typeof report !== 'object') {
    fail('REC04E_HARDWARE_ACCEPTANCE_REPORT_INVALID', 'Acceptance report must be an object.');
  }
  return JSON.stringify(sortCanonical(report));
}

function importPrivateKey(encoded = process.env.REC04E_HARDWARE_ACCEPTANCE_PRIVATE_KEY_PKCS8_B64) {
  const clean = String(encoded || '').trim();
  if (!clean) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNING_KEY_REQUIRED',
      'REC04E_HARDWARE_ACCEPTANCE_PRIVATE_KEY_PKCS8_B64 is required to sign the hardware acceptance report.'
    );
  }
  try {
    const key = crypto.createPrivateKey({
      key: Buffer.from(clean, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    if (key.asymmetricKeyType !== 'ed25519') {
      fail('REC04E_HARDWARE_ACCEPTANCE_SIGNING_KEY_INVALID', 'Hardware acceptance signing key must be Ed25519.');
    }
    return key;
  } catch (err) {
    if (err?.code === 'REC04E_HARDWARE_ACCEPTANCE_SIGNING_KEY_INVALID') throw err;
    fail('REC04E_HARDWARE_ACCEPTANCE_SIGNING_KEY_INVALID', 'Hardware acceptance signing key is not valid PKCS#8 Ed25519 material.');
  }
}

function importPublicKey(encoded = process.env.REC04E_HARDWARE_ACCEPTANCE_PUBLIC_KEY_SPKI_B64) {
  const clean = String(encoded || '').trim();
  if (!clean) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_VERIFICATION_KEY_REQUIRED',
      'REC04E_HARDWARE_ACCEPTANCE_PUBLIC_KEY_SPKI_B64 is required to verify the hardware acceptance report.'
    );
  }
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(clean, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ed25519') {
      fail('REC04E_HARDWARE_ACCEPTANCE_VERIFICATION_KEY_INVALID', 'Hardware acceptance verification key must be Ed25519.');
    }
    return key;
  } catch (err) {
    if (err?.code === 'REC04E_HARDWARE_ACCEPTANCE_VERIFICATION_KEY_INVALID') throw err;
    fail('REC04E_HARDWARE_ACCEPTANCE_VERIFICATION_KEY_INVALID', 'Hardware acceptance verification key is not valid SPKI Ed25519 material.');
  }
}

function keyId(publicKey) {
  return crypto
    .createHash('sha256')
    .update(publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex');
}

export function signAcceptanceReport(report, {
  privateKeyBase64 = process.env.REC04E_HARDWARE_ACCEPTANCE_PRIVATE_KEY_PKCS8_B64,
} = {}) {
  const privateKey = importPrivateKey(privateKeyBase64);
  const publicKey = crypto.createPublicKey(privateKey);
  const canonical = canonicalAcceptanceReport(report);
  const signature = crypto
    .sign(null, Buffer.from(canonical, 'utf8'), privateKey)
    .toString('base64url');

  return {
    ...report,
    integritySignature: {
      version: SIGNATURE_VERSION,
      algorithm: SIGNATURE_ALGORITHM,
      keyId: keyId(publicKey),
      signature,
    },
  };
}

export function verifyAcceptanceReportSignature(report, {
  publicKeyBase64 = process.env.REC04E_HARDWARE_ACCEPTANCE_PUBLIC_KEY_SPKI_B64,
} = {}) {
  const envelope = report?.integritySignature;
  if (
    !envelope ||
    envelope.version !== SIGNATURE_VERSION ||
    envelope.algorithm !== SIGNATURE_ALGORITHM
  ) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_REQUIRED',
      'A supported signed hardware acceptance report is required.'
    );
  }

  const publicKey = importPublicKey(publicKeyBase64);
  const expectedKeyId = keyId(publicKey);
  if (String(envelope.keyId || '').toLowerCase() !== expectedKeyId) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_KEY_MISMATCH',
      'Hardware acceptance report signer does not match the pinned verification key.'
    );
  }

  let signature;
  try {
    signature = Buffer.from(String(envelope.signature || ''), 'base64url');
  } catch (_) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_INVALID',
      'Hardware acceptance signature encoding is invalid.'
    );
  }
  if (signature.length !== 64) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_INVALID',
      'Hardware acceptance signature length is invalid.'
    );
  }

  const canonical = canonicalAcceptanceReport(report);
  if (!crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, signature)) {
    fail(
      'REC04E_HARDWARE_ACCEPTANCE_SIGNATURE_INVALID',
      'Hardware acceptance report signature verification failed.'
    );
  }

  return {
    verified: true,
    keyId: expectedKeyId,
    version: SIGNATURE_VERSION,
  };
}

export {
  SIGNATURE_VERSION,
  SIGNATURE_ALGORITHM,
};
