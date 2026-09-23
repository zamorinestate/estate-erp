'use strict';

const crypto = require('crypto');
const { PasswordResetChallenge } = require('../models/PasswordResetChallenge');
const { SequenceCounter } = require('../models/SequenceCounter');

const CODE_TTL_MINUTES = 5;
const RESET_TOKEN_TTL_MINUTES = 15;
const ABSOLUTE_TTL_MINUTES = 30;
const MAX_VERIFICATION_ATTEMPTS = 5;

function requireResetSecret() {
  const secret = process.env.PASSWORD_RESET_HMAC_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error('PASSWORD_RESET_HMAC_SECRET or JWT_ACCESS_SECRET must contain at least 32 characters.');
  return secret;
}

function hashResetValue(value, purpose) {
  return crypto.createHmac('sha256', requireResetSecret()).update(String(purpose)+':'+String(value)).digest('hex');
}

function generateResetCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function generateResetToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function secureHashMatches(value, purpose, expectedHash) {
  const actual = Buffer.from(hashResetValue(value, purpose), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isResetEligibleUser(user, now = new Date()) {
  if (!user || user.archivedAt) return false;
  if (user.accountStatus === 'ACTIVE') return true;
  return user.accountStatus === 'LOCKED' && user.lockedUntil instanceof Date && user.lockedUntil > now;
}

async function createPasswordResetChallenge(user) {
  if (!isResetEligibleUser(user)) return null;
  const now = new Date();
  await PasswordResetChallenge.updateMany({ organisationId: user.organisationId, userId: user.userId, status: { $in: ['PENDING','VERIFIED'] } }, { $set: { status: 'EXPIRED', invalidatedAt: now } });
  const datePart = now.toISOString().slice(0,10).replaceAll('-','');
  const challengeId = await SequenceCounter.generateId({ organisationId: user.organisationId, sequenceKey: 'PASSWORD_RESET_'+datePart, prefix: 'PRC-'+datePart, minimumDigits: 4 });
  const code = generateResetCode();
  const challenge = await PasswordResetChallenge.create({ challengeId, organisationId: user.organisationId, userId: user.userId, codeHash: hashResetValue(code, challengeId+':CODE'), status: 'PENDING', verificationAttempts: 0, maxVerificationAttempts: MAX_VERIFICATION_ATTEMPTS, codeExpiresAt: new Date(now.getTime()+CODE_TTL_MINUTES*60000), absoluteExpiresAt: new Date(now.getTime()+ABSOLUTE_TTL_MINUTES*60000) });
  return { challenge, code };
}

async function verifyPasswordResetCode({ challengeId, code }) {
  const id = typeof challengeId === 'string' ? challengeId.trim().toUpperCase() : '';
  const value = typeof code === 'string' ? code.trim() : '';
  if (!id || !/^\d{6}$/.test(value)) return null;
  const challenge = await PasswordResetChallenge.findOne({ challengeId: id }).select('+codeHash +resetTokenHash');
  if (!challenge || challenge.status !== 'PENDING') return null;
  const now = new Date();
  if (challenge.codeExpiresAt <= now || challenge.absoluteExpiresAt <= now) { challenge.status='EXPIRED'; challenge.invalidatedAt=now; await challenge.save(); return null; }
  challenge.verificationAttempts += 1;
  if (!secureHashMatches(value, id+':CODE', challenge.codeHash)) { if (challenge.verificationAttempts >= challenge.maxVerificationAttempts) { challenge.status='LOCKED'; challenge.invalidatedAt=now; } await challenge.save(); return null; }
  const resetToken = generateResetToken();
  challenge.status='VERIFIED'; challenge.verifiedAt=now; challenge.resetTokenHash=hashResetValue(resetToken,id+':TOKEN'); challenge.resetTokenExpiresAt=new Date(now.getTime()+RESET_TOKEN_TTL_MINUTES*60000); await challenge.save();
  return { challenge, resetToken };
}

function verifyPasswordResetToken(challenge, resetToken) {
  if (!challenge || challenge.status !== 'VERIFIED' || !challenge.resetTokenHash || !challenge.resetTokenExpiresAt || challenge.resetTokenExpiresAt <= new Date()) return false;
  return secureHashMatches(resetToken, challenge.challengeId+':TOKEN', challenge.resetTokenHash);
}

module.exports = { CODE_TTL_MINUTES, RESET_TOKEN_TTL_MINUTES, ABSOLUTE_TTL_MINUTES, MAX_VERIFICATION_ATTEMPTS, hashResetValue, generateResetCode, isResetEligibleUser, createPasswordResetChallenge, verifyPasswordResetCode, verifyPasswordResetToken };
