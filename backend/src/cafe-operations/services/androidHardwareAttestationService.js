'use strict';

const crypto = require('node:crypto');
const { canonicalPublicJwk } = require('../../services/deviceAttestationService');

const ANDROID_KEY_ATTESTATION_OID = '1.3.6.1.4.1.11129.2.1.17';
const GOOGLE_ATTESTATION_ROOTS_URL = 'https://android.googleapis.com/attestation/root';
const GOOGLE_ATTESTATION_STATUS_URL = 'https://android.googleapis.com/attestation/status';
const DEFAULT_ANDROID_PACKAGE = 'com.zamorin.cafe.erp';
const MAX_CHAIN_LENGTH = 10;
const MAX_CERT_BYTES = 32768;
const FETCH_TIMEOUT_MS = 5000;
const rootCache = { value: null, expiresAt: 0 };
const revocationCache = { value: null, expiresAt: 0 };
let asnModulesPromise = null;

function fail(code, message, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}
function toBuffer(value) {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value.buffer instanceof ArrayBuffer && Number.isInteger(value.byteLength)) {
    return Buffer.from(value.buffer, value.byteOffset || 0, value.byteLength);
  }
  if (value.valueBlock?.valueHex instanceof ArrayBuffer) return Buffer.from(value.valueBlock.valueHex);
  throw fail('ANDROID_ATTESTATION_ASN1_VALUE_INVALID', 'Unsupported Android attestation ASN.1 value.');
}
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const base64Url = (value) => Buffer.from(value).toString('base64url');
const serialHex = (value) =>
  String(value || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase().replace(/^0+/, '') || '0';
function revocationLookupKeys(value) {
  const hex = serialHex(value);
  const keys = new Set([hex]);
  try {
    keys.add(BigInt(`0x${hex}`).toString(10));
  } catch (_) {}
  return Array.from(keys);
}
const normalizeDigest = (value) => String(value || '').toLowerCase().replace(/[^a-f0-9]/g, '');

function expectedAndroidSigningDigests() {
  const raw = String(process.env.ZAMORIN_ANDROID_APP_CERT_SHA256 || '').trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map(normalizeDigest).filter((value) => /^[a-f0-9]{64}$/.test(value));
}
function cacheTtl(response, fallbackMs) {
  const match = String(response.headers.get('cache-control') || '').match(/max-age=(\d+)/i);
  const seconds = match ? Number(match[1]) : 0;
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 24 * 60 * 60 * 1000)
    : fallbackMs;
}
async function cachedJson(url, cache, fallbackMs, unavailableCode) {
  if (cache.value && cache.expiresAt > Date.now()) return cache.value;
  if (typeof globalThis.fetch !== 'function') {
    throw fail(unavailableCode, 'Android attestation trust service is unavailable.', 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw fail(unavailableCode, `Android attestation trust service returned HTTP ${response.status}.`, 503);
    }
    const value = await response.json();
    cache.value = value;
    cache.expiresAt = Date.now() + cacheTtl(response, fallbackMs);
    return value;
  } catch (err) {
    if (err?.code === unavailableCode) throw err;
    throw fail(unavailableCode, 'Android attestation trust service could not be reached.', 503);
  } finally {
    clearTimeout(timer);
  }
}
async function loadAsnModules() {
  if (!asnModulesPromise) {
    asnModulesPromise = Promise.all([
      import('@peculiar/asn1-schema'),
      import('@peculiar/asn1-x509'),
      import('@peculiar/asn1-android'),
    ]).then(([schema, x509, android]) => ({
      AsnConvert: schema.AsnConvert,
      Certificate: x509.Certificate,
      NonStandardKeyDescription: android.NonStandardKeyDescription,
      NonStandardKeyMintKeyDescription: android.NonStandardKeyMintKeyDescription,
      AttestationApplicationId: android.AttestationApplicationId,
    }));
  }
  return asnModulesPromise;
}
function parseCertificateChain(chain) {
  if (!Array.isArray(chain) || chain.length < 2 || chain.length > MAX_CHAIN_LENGTH) {
    throw fail('ANDROID_ATTESTATION_CERTIFICATE_CHAIN_INVALID', 'A bounded leaf-to-root Android X.509 chain is required.');
  }
  return chain.map((encoded, index) => {
    const clean = String(encoded || '').replace(/\s+/g, '');
    if (!clean || clean.length > Math.ceil(MAX_CERT_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
      throw fail('ANDROID_ATTESTATION_CERTIFICATE_INVALID', `Certificate ${index} is not Base64 DER.`);
    }
    const der = Buffer.from(clean, 'base64');
    if (!der.length || der.length > MAX_CERT_BYTES ||
        der.toString('base64').replace(/=+$/, '') !== clean.replace(/=+$/, '')) {
      throw fail('ANDROID_ATTESTATION_CERTIFICATE_INVALID', `Certificate ${index} failed canonical DER decoding.`);
    }
    try {
      return new crypto.X509Certificate(der);
    } catch (_) {
      throw fail('ANDROID_ATTESTATION_CERTIFICATE_INVALID', `Certificate ${index} is not valid X.509.`);
    }
  });
}
function verifyChain(certificates) {
  for (let index = 0; index < certificates.length - 1; index += 1) {
    if (!certificates[index].verify(certificates[index + 1].publicKey)) {
      throw fail(
        'ANDROID_ATTESTATION_CHAIN_SIGNATURE_INVALID',
        `Certificate ${index} is not signed by certificate ${index + 1}.`,
        403
      );
    }
  }
}
function certificateTimeState(certificates) {
  const now = Date.now();
  for (const certificate of certificates) {
    const from = Date.parse(certificate.validFrom);
    const to = Date.parse(certificate.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || now < from || now > to) {
      return { valid: false, reason: 'ANDROID_ATTESTATION_CERTIFICATE_EXPIRED_OR_NOT_YET_VALID' };
    }
  }
  return { valid: true };
}
async function trustedRoots() {
  const list = await cachedJson(
    GOOGLE_ATTESTATION_ROOTS_URL,
    rootCache,
    24 * 60 * 60 * 1000,
    'ANDROID_ATTESTATION_ROOTS_UNAVAILABLE'
  );
  if (!Array.isArray(list) || !list.length) {
    throw fail('ANDROID_ATTESTATION_ROOTS_UNAVAILABLE', 'Google attestation root list was malformed.', 503);
  }
  const roots = new Set();
  for (const pem of list) {
    try {
      roots.add(new crypto.X509Certificate(String(pem)).raw.toString('base64'));
    } catch (_) {
      throw fail('ANDROID_ATTESTATION_ROOTS_UNAVAILABLE', 'Google attestation root list contained invalid X.509.', 503);
    }
  }
  return roots;
}
async function revocations() {
  const data = await cachedJson(
    GOOGLE_ATTESTATION_STATUS_URL,
    revocationCache,
    60 * 60 * 1000,
    'ANDROID_ATTESTATION_REVOCATION_STATUS_UNAVAILABLE'
  );
  if (!data?.entries || typeof data.entries !== 'object') {
    throw fail('ANDROID_ATTESTATION_REVOCATION_STATUS_UNAVAILABLE', 'Google attestation revocation data was malformed.', 503);
  }
  return data.entries;
}

function resetTrustCachesForTest() {
  rootCache.value = null;
  rootCache.expiresAt = 0;
  revocationCache.value = null;
  revocationCache.expiresAt = 0;
}
async function findAttestationExtension(certificates) {
  const { AsnConvert, Certificate } = await loadAsnModules();
  for (let index = certificates.length - 2; index >= 0; index -= 1) {
    let parsed;
    try {
      parsed = AsnConvert.parse(certificates[index].raw, Certificate);
    } catch (_) {
      throw fail('ANDROID_ATTESTATION_CERTIFICATE_ASN1_INVALID', 'Android attestation certificate ASN.1 could not be parsed.');
    }
    const extension = (parsed.tbsCertificate.extensions || [])
      .find((candidate) => candidate.extnID === ANDROID_KEY_ATTESTATION_OID);
    if (extension) {
      return {
        certificate: certificates[index],
        value: toBuffer(extension.extnValue),
      };
    }
  }
  throw fail('ANDROID_ATTESTATION_EXTENSION_MISSING', 'Android key-attestation extension is missing.');
}
async function parseKeyDescription(raw) {
  const { AsnConvert, NonStandardKeyDescription, NonStandardKeyMintKeyDescription } = await loadAsnModules();
  try {
    const keyMint = AsnConvert.parse(raw, NonStandardKeyMintKeyDescription);
    if (Number(keyMint.attestationVersion) >= 300) return keyMint;
  } catch (_) {}
  try {
    return AsnConvert.parse(raw, NonStandardKeyDescription);
  } catch (_) {
    throw fail('ANDROID_ATTESTATION_KEY_DESCRIPTION_INVALID', 'Android KeyDescription could not be parsed.');
  }
}
function authorizationProperty(description, propertyName) {
  for (const list of [description.hardwareEnforced, description.teeEnforced, description.softwareEnforced]) {
    if (!list || typeof list.findProperty !== 'function') continue;
    try {
      const value = list.findProperty(propertyName);
      if (value != null) return value;
    } catch (_) {}
  }
  return null;
}

function hardwareAuthorizationProperty(description, propertyName) {
  const lists = [];
  if (description.hardwareEnforced) lists.push(description.hardwareEnforced);
  if (
    description.teeEnforced &&
    description.teeEnforced !== description.hardwareEnforced
  ) {
    lists.push(description.teeEnforced);
  }

  for (const list of lists) {
    if (!list || typeof list.findProperty !== 'function') continue;
    try {
      const value = list.findProperty(propertyName);
      if (value != null) return value;
    } catch (_) {}
  }
  return null;
}

function numericAuthorizationValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (
    typeof value !== 'string' &&
    value &&
    typeof value[Symbol.iterator] === 'function'
  ) {
    return Array.from(value).map(Number).filter(Number.isFinite);
  }
  if (Array.isArray(value?.value)) {
    return value.value.map(Number).filter(Number.isFinite);
  }
  const number = Number(value);
  return Number.isFinite(number) ? [number] : [];
}

function verifyExpectedHardwareAuthorizations(description) {
  const purposes = numericAuthorizationValues(
    hardwareAuthorizationProperty(description, 'purpose')
  ).sort((a, b) => a - b);
  const digests = numericAuthorizationValues(
    hardwareAuthorizationProperty(description, 'digest')
  ).sort((a, b) => a - b);
  const algorithm = Number(
    hardwareAuthorizationProperty(description, 'algorithm')
  );
  const keySize = Number(
    hardwareAuthorizationProperty(description, 'keySize')
  );
  const ecCurve = Number(
    hardwareAuthorizationProperty(description, 'ecCurve')
  );
  const rootOfTrust = hardwareAuthorizationProperty(
    description,
    'rootOfTrust'
  );

  const exactPurpose =
    purposes.length === 2 &&
    purposes[0] === 2 &&
    purposes[1] === 3;
  const exactDigest = digests.length === 1 && digests[0] === 4;
  const verifiedBoot =
    rootOfTrust?.deviceLocked === true &&
    Number(rootOfTrust?.verifiedBootState) === 0;

  if (
    !exactPurpose ||
    algorithm !== 3 ||
    keySize !== 256 ||
    ecCurve !== 1 ||
    !exactDigest
  ) {
    return {
      valid: false,
      reason: 'ANDROID_ATTESTATION_KEY_AUTHORIZATION_MISMATCH',
    };
  }

  if (!verifiedBoot) {
    return {
      valid: false,
      reason: 'ANDROID_ATTESTATION_VERIFIED_BOOT_REQUIRED',
    };
  }

  return { valid: true };
}

async function extractApplicationIdentity(description) {
  const { AsnConvert, AttestationApplicationId } = await loadAsnModules();
  const raw = authorizationProperty(description, 'attestationApplicationId');
  if (!raw) {
    throw fail('ANDROID_ATTESTATION_APPLICATION_ID_MISSING', 'AttestationApplicationId is missing.');
  }
  let applicationId;
  try {
    applicationId = AsnConvert.parse(toBuffer(raw), AttestationApplicationId);
  } catch (_) {
    throw fail('ANDROID_ATTESTATION_APPLICATION_ID_INVALID', 'AttestationApplicationId could not be parsed.');
  }
  return {
    packages: Array.from(applicationId.packageInfos || [])
      .map((info) => toBuffer(info.packageName).toString('utf8')),
    digests: Array.from(applicationId.signatureDigests || [])
      .map((value) => toBuffer(value).toString('hex').toLowerCase()),
  };
}
function securityLevelName(value) {
  if (Number(value) === 2) return 'STRONGBOX';
  if (Number(value) === 1) return 'TRUSTED_ENVIRONMENT';
  return 'SOFTWARE';
}

async function verifyAndroidHardwareAttestation({
  certificateChain,
  expectedChallengeHash,
  expectedPublicSigningKey,
}) {
  const certificates = parseCertificateChain(certificateChain);
  verifyChain(certificates);

  let roots;
  try {
    roots = await trustedRoots();
  } catch (err) {
    return { verified: false, reason: err.code || 'ANDROID_ATTESTATION_ROOTS_UNAVAILABLE', securityLevel: 'UNKNOWN' };
  }

  const root = certificates[certificates.length - 1];
  const rootSha256 = sha256(root.raw);
  if (!roots.has(root.raw.toString('base64'))) {
    return { verified: false, reason: 'ANDROID_ATTESTATION_UNTRUSTED_ROOT', securityLevel: 'UNKNOWN', rootSha256 };
  }

  const timeState = certificateTimeState(certificates);
  if (!timeState.valid) {
    return { verified: false, reason: timeState.reason, securityLevel: 'UNKNOWN', rootSha256 };
  }

  let revoked;
  try {
    revoked = await revocations();
  } catch (err) {
    return {
      verified: false,
      reason: err.code || 'ANDROID_ATTESTATION_REVOCATION_STATUS_UNAVAILABLE',
      securityLevel: 'UNKNOWN',
      rootSha256,
    };
  }
  for (const certificate of certificates) {
    const revokedKey = revocationLookupKeys(certificate.serialNumber)
      .find((key) => revoked[key]);
    if (revokedKey) {
      return {
        verified: false,
        reason: 'ANDROID_ATTESTATION_CERTIFICATE_REVOKED',
        securityLevel: 'UNKNOWN',
        revokedSerial: revokedKey,
        rootSha256,
      };
    }
  }

  const extension = await findAttestationExtension(certificates);
  const description = await parseKeyDescription(extension.value);
  const challenge = base64Url(toBuffer(description.attestationChallenge));
  if (!expectedChallengeHash || sha256(challenge) !== String(expectedChallengeHash).trim().toLowerCase()) {
    throw fail('ANDROID_ATTESTATION_CHALLENGE_MISMATCH', 'Attestation does not match the server challenge.', 403);
  }

  let attestedJwk;
  try {
    attestedJwk = extension.certificate.publicKey.export({ format: 'jwk' });
  } catch (_) {
    throw fail('ANDROID_ATTESTATION_PUBLIC_KEY_INVALID', 'Attested public key is invalid.');
  }
  if (canonicalPublicJwk(attestedJwk) !== canonicalPublicJwk(expectedPublicSigningKey)) {
    throw fail('ANDROID_ATTESTATION_PUBLIC_KEY_MISMATCH', 'Attested key does not match the enrolled signing key.', 403);
  }

  const attestationLevel = Number(description.attestationSecurityLevel);
  const keyLevel = Number(description.keyMintSecurityLevel ?? description.keymasterSecurityLevel ?? -1);
  if (![1, 2].includes(attestationLevel) || ![1, 2].includes(keyLevel)) {
    return {
      verified: false,
      reason: 'ANDROID_ATTESTATION_NOT_HARDWARE_BACKED',
      securityLevel: 'SOFTWARE',
      rootSha256,
    };
  }

  const authorizationState = verifyExpectedHardwareAuthorizations(description);
  if (!authorizationState.valid) {
    return {
      verified: false,
      reason: authorizationState.reason,
      securityLevel: securityLevelName(Math.min(attestationLevel, keyLevel)),
      rootSha256,
    };
  }

  const identity = await extractApplicationIdentity(description);
  const expectedPackage = String(
    process.env.ZAMORIN_ANDROID_APP_PACKAGE || DEFAULT_ANDROID_PACKAGE
  ).trim();
  if (!identity.packages.includes(expectedPackage)) {
    throw fail('ANDROID_ATTESTATION_APP_IDENTITY_MISMATCH', 'Attestation package does not match Zamorin.', 403);
  }

  const allowedDigests = expectedAndroidSigningDigests();
  if (!allowedDigests.length) {
    return {
      verified: false,
      reason: 'ANDROID_APP_SIGNING_CERT_POLICY_UNCONFIGURED',
      securityLevel: securityLevelName(Math.min(attestationLevel, keyLevel)),
      rootSha256,
      packageName: expectedPackage,
    };
  }
  const matchingDigest = identity.digests.find((value) =>
    allowedDigests.includes(normalizeDigest(value))
  );
  if (!matchingDigest) {
    throw fail(
      'ANDROID_ATTESTATION_APP_SIGNING_CERT_MISMATCH',
      'App-signing certificate does not match server policy.',
      403
    );
  }

  return {
    verified: true,
    reason: null,
    securityLevel: securityLevelName(Math.min(attestationLevel, keyLevel)),
    verifiedAt: new Date(),
    rootSha256,
    packageName: expectedPackage,
    appSigningCertSha256: normalizeDigest(matchingDigest),
    attestationVersion: Number(description.attestationVersion),
    keyMintVersion: Number(description.keyMintVersion ?? description.keymasterVersion ?? 0),
    chainSerials: certificates.map((certificate) => serialHex(certificate.serialNumber)),
  };
}

async function applyVerifiedAndroidHardwareEvidence({
  deviceId,
  organisationId,
  cafeId,
  signingKeyThumbprint,
  evidence,
}) {
  if (
    !evidence?.verified ||
    !['TRUSTED_ENVIRONMENT', 'STRONGBOX'].includes(evidence.securityLevel) ||
    !evidence.verifiedAt
  ) {
    throw fail(
      'ANDROID_HARDWARE_ATTESTATION_EVIDENCE_INVALID',
      'Verified Android hardware evidence is required.'
    );
  }

  const { DeviceRegistration } = require('../../models/DeviceRegistration');
  const result = await DeviceRegistration.collection.updateOne(
    {
      deviceId: String(deviceId),
      organisationId: String(organisationId).trim().toUpperCase(),
      assignedCafeId: String(cafeId).trim().toUpperCase(),
      status: 'ACTIVE',
      signingKeyThumbprint: String(signingKeyThumbprint || '').trim().toLowerCase(),
      signingKeyProvider: 'ANDROID_KEYSTORE',
    },
    {
      $set: {
        signingKeyHardwareBackedVerified: true,
        signingKeyHardwareSecurityLevel: evidence.securityLevel,
        signingKeyHardwareAttestationVerifiedAt: evidence.verifiedAt,
        trustLevel: 'HARDWARE_BACKED',
        'metadata.hardwareBackedSigningKeyVerified': true,
        'metadata.hardwareAttestationSecurityLevel': evidence.securityLevel,
        'metadata.hardwareAttestationRootSha256': evidence.rootSha256 || null,
        'metadata.hardwareAttestationPackageName': evidence.packageName || null,
        'metadata.hardwareAttestationAppSigningCertSha256':
          evidence.appSigningCertSha256 || null,
        'metadata.hardwareAttestationVersion': evidence.attestationVersion || null,
        'metadata.hardwareAttestationKeyMintVersion': evidence.keyMintVersion || null,
        'metadata.hardwareAttestationVerifiedAt': evidence.verifiedAt,
      },
    }
  );
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw fail(
      'ANDROID_HARDWARE_ATTESTATION_TRUST_WRITE_FAILED',
      'Verified hardware evidence could not be bound to the enrolled signing identity.',
      409
    );
  }
}

module.exports = {
  ANDROID_KEY_ATTESTATION_OID,
  GOOGLE_ATTESTATION_ROOTS_URL,
  GOOGLE_ATTESTATION_STATUS_URL,
  revocationLookupKeys,
  verifyExpectedHardwareAuthorizations,
  verifyAndroidHardwareAttestation,
  applyVerifiedAndroidHardwareEvidence,
  // Narrow internal hooks used only by fault-injection tests. Production
  // callers must use verifyAndroidHardwareAttestation(), not trust raw service data.
  _testOnly: {
    trustedRoots,
    revocations,
    rootCache,
    revocationCache,
    resetTrustCachesForTest,
  },
};
