'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { User } = require('../src/models/User');
const { PasswordResetChallenge } = require('../src/models/PasswordResetChallenge');
const passwordResetService = require('../src/services/passwordResetService');
const passwordResetDeliveryService = require('../src/services/passwordResetDeliveryService');
const { hashPassword } = require('../src/services/authService');

test('Employee Login & 5-Minute Password Reset PIN Suite', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    process.env.PASSWORD_RESET_HMAC_SECRET = 'a'.repeat(32);
    process.env.PASSWORD_RESET_DEV_LOG_CODE = 'true';
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  t.beforeEach(async () => {
    await User.deleteMany({});
    await PasswordResetChallenge.deleteMany({});
  });

  await t.test('1. Password reset PIN has exact 5-minute TTL', async () => {
    assert.equal(passwordResetService.CODE_TTL_MINUTES, 5, 'CODE_TTL_MINUTES must be exactly 5 minutes');

    const pwdHash = await hashPassword('Zamorin@Pass12345!', { minLength: 15 });
    const employee = await User.create({
      userId: 'ST-0001',
      organisationId: 'ZAMORIN',
      name: 'Anjali Menon',
      email: 'anjali.menon@zamorin.cafe',
      role: 'STAFF',
      passwordHash: pwdHash,
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-01',
      assignedCafeIds: ['ZC-01'],
      createdBy: 'SYSTEM',
    });

    const before = Date.now();
    const result = await passwordResetService.createPasswordResetChallenge(employee);
    const after = Date.now();

    assert.ok(result, 'Challenge must be created');
    assert.match(result.code, /^\d{6}$/, 'Code must be 6 numeric digits');

    const expectedExpiry = before + 5 * 60 * 1000;
    const actualExpiry = new Date(result.challenge.codeExpiresAt).getTime();
    assert.ok(Math.abs(actualExpiry - expectedExpiry) <= 2000, 'codeExpiresAt must be ~5 minutes in the future');

    // PIN is valid immediately
    const verifySuccess = await passwordResetService.verifyPasswordResetCode({
      challengeId: result.challenge.challengeId,
      code: result.code,
    });
    assert.ok(verifySuccess, 'Valid 6-digit code must verify before 5 minutes');
    assert.ok(verifySuccess.resetToken, 'Verification must return a reset token');
  });

  await t.test('2. 6-digit PIN expires and becomes unusable after 5 minutes', async () => {
    const pwdHash = await hashPassword('Zamorin@Pass12345!', { minLength: 15 });
    const employee = await User.create({
      userId: 'ST-0002',
      organisationId: 'ZAMORIN',
      name: 'Rahul Varma',
      email: 'rahul.varma@zamorin.cafe',
      role: 'STAFF',
      passwordHash: pwdHash,
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-01',
      assignedCafeIds: ['ZC-01'],
      createdBy: 'SYSTEM',
    });

    const result = await passwordResetService.createPasswordResetChallenge(employee);
    assert.ok(result);

    // Fast-forward expiry past 5 minutes (simulate 5m 1s elapsed)
    await PasswordResetChallenge.updateOne(
      { challengeId: result.challenge.challengeId },
      { $set: { codeExpiresAt: new Date(Date.now() - 1000) } }
    );

    const verifyAttempt = await passwordResetService.verifyPasswordResetCode({
      challengeId: result.challenge.challengeId,
      code: result.code,
    });
    assert.equal(verifyAttempt, null, 'Expired PIN must be unusable and rejected');

    const expiredDoc = await PasswordResetChallenge.findOne({ challengeId: result.challenge.challengeId });
    assert.equal(expiredDoc.status, 'EXPIRED', 'Challenge status must transition to EXPIRED');
  });

  await t.test('3. Resend PIN invalidates previous challenge and creates fresh 6-digit PIN', async () => {
    const pwdHash = await hashPassword('Zamorin@Pass12345!', { minLength: 15 });
    const employee = await User.create({
      userId: 'ST-0003',
      organisationId: 'ZAMORIN',
      name: 'Deepak Nair',
      email: 'deepak.nair@zamorin.cafe',
      role: 'STAFF',
      passwordHash: pwdHash,
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-01',
      assignedCafeIds: ['ZC-01'],
      createdBy: 'SYSTEM',
    });

    // Initial PIN request
    const firstChallenge = await passwordResetService.createPasswordResetChallenge(employee);
    assert.ok(firstChallenge);

    // Employee clicks "Resend PIN" -> creates second challenge
    const secondChallenge = await passwordResetService.createPasswordResetChallenge(employee);
    assert.ok(secondChallenge);
    assert.notEqual(firstChallenge.challenge.challengeId, secondChallenge.challenge.challengeId);

    // First challenge MUST be marked EXPIRED and unusable
    const firstDoc = await PasswordResetChallenge.findOne({ challengeId: firstChallenge.challenge.challengeId });
    assert.equal(firstDoc.status, 'EXPIRED', 'First PIN challenge must be invalidated upon resend');

    const firstVerifyAttempt = await passwordResetService.verifyPasswordResetCode({
      challengeId: firstChallenge.challenge.challengeId,
      code: firstChallenge.code,
    });
    assert.equal(firstVerifyAttempt, null, 'Old PIN must be rejected after resend');

    // Second PIN MUST be valid and have fresh 5-minute TTL
    const secondVerifyAttempt = await passwordResetService.verifyPasswordResetCode({
      challengeId: secondChallenge.challenge.challengeId,
      code: secondChallenge.code,
    });
    assert.ok(secondVerifyAttempt, 'New PIN must be successfully verified');
    assert.ok(secondVerifyAttempt.resetToken);
  });

  await t.test('4. Delivery service logs 5m expiry and dispatches from zamorinestatepvtltd.erp@gmail.com', async () => {
    const delivery = await passwordResetDeliveryService.deliverPasswordResetCode({
      recipientEmail: 'staff.member@zamorin.cafe',
      code: '654321',
      challengeId: 'PRC-TEST-0002',
    });

    assert.equal(delivery.delivered, true, 'Delivery must succeed in dev/configured mode');
  });

  await t.test('4b. Nodemailer SMTP dispatch sends live email when GMAIL_APP_PASSWORD is configured', async () => {
    const nodemailer = require('nodemailer');
    const oldPass = process.env.GMAIL_APP_PASSWORD;
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';

    let capturedMail = null;
    const mockTransporter = {
      sendMail: async (options) => {
        capturedMail = options;
        return { messageId: '<synthetic-msg-id-123@smtp.gmail.com>' };
      },
    };

    t.mock.method(nodemailer, 'createTransport', () => mockTransporter);

    try {
      const delivery = await passwordResetDeliveryService.deliverPasswordResetCode({
        recipientEmail: 'arun.nair@zamorin.cafe',
        code: '987654',
        challengeId: 'PRC-TEST-SMTP-001',
      });

      assert.equal(delivery.delivered, true);
      assert.equal(delivery.channel, 'GMAIL_SMTP');
      assert.equal(delivery.providerMessageId, '<synthetic-msg-id-123@smtp.gmail.com>');
      assert.ok(capturedMail, 'Transporter sendMail must be called');
      assert.equal(capturedMail.to, 'arun.nair@zamorin.cafe');
      assert.match(capturedMail.from, /zamorinestatepvtltd\.erp@gmail\.com/);
      assert.equal(capturedMail.replyTo, 'zamorinestatepvtltd.erp@gmail.com');
      assert.match(capturedMail.html, /987654/);
      assert.match(capturedMail.html, /expires in 5 minutes/i);
    } finally {
      if (oldPass !== undefined) {
        process.env.GMAIL_APP_PASSWORD = oldPass;
      } else {
        delete process.env.GMAIL_APP_PASSWORD;
      }
    }
  });

  await t.test('5. Employee safe profile contains registered email and primaryCafeId', async () => {
    const pwdHash = await hashPassword('Zamorin@Pass12345!', { minLength: 15 });
    const employee = await User.create({
      userId: 'ST-0004',
      organisationId: 'ZAMORIN',
      name: 'Kavita Pillai',
      email: 'kavita.pillai@zamorin.cafe',
      role: 'STAFF',
      passwordHash: pwdHash,
      accountStatus: 'ACTIVE',
      primaryCafeId: 'ZC-01',
      assignedCafeIds: ['ZC-01'],
      createdBy: 'SYSTEM',
    });

    const json = employee.toJSON();
    assert.equal(json.email, 'kavita.pillai@zamorin.cafe', 'User JSON must include registered email');
    assert.equal(json.role, 'STAFF', 'User role must be STAFF');
    assert.equal(json.primaryCafeId, 'ZC-01', 'Assigned cafe must be isolated to ZC-01');
    assert.deepEqual(json.assignedCafeIds, ['ZC-01'], 'Assigned cafe IDs must only contain employee cafe');
  });
});
