'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { TrustedDevice } = require('../src/models/TrustedDevice');
const authService = require('../src/services/authService');
const deviceTrustService = require('../src/services/deviceTrustService');

describe('SESSION / TRUST EXPIRY RECONCILIATION', () => {
  let mongoServer;
  let user;

  test.before(async () => {
    process.env.JWT_ACCESS_SECRET =
      'session_trust_reconciliation_jwt_secret_32_bytes_minimum_value';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const passwordHash =
      await authService.hashPassword('Pass@12345678');

    user = await User.create({
      userId: 'ST-9001',
      organisationId: 'ZAMORIN',
      name: 'Reconciliation Test User',
      email: 'reconcile@zamorin.test',
      passwordHash,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      mustChangePassword: false,
      createdBy: 'SYSTEM_TEST',
    });
  });

  test.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('idle-expired ACTIVE sessions are reconciled to EXPIRED before listing', async () => {
    const created = await authService.createSession({
      user,
      device: {
        deviceId: 'DEV-RECON-SESSION',
        deviceType: 'DESKTOP',
      },
      network: {
        ipAddressMasked: '192.168.x.x',
      },
      mfaVerified: true,
      createdBy: user.userId,
    });

    await Session.updateOne(
      { sessionId: created.session.sessionId },
      {
        $set: {
          lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          idleTimeoutMinutes: 30,
          absoluteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      }
    );

    const sessions = await authService.listUserSessions({
      organisationId: user.organisationId,
      userId: user.userId,
    });

    const listed = sessions.find(
      (session) => session.sessionId === created.session.sessionId
    );

    assert.ok(listed);
    assert.equal(listed.status, 'EXPIRED');

    const persisted = await Session.findOne({
      sessionId: created.session.sessionId,
    });
    assert.equal(persisted.status, 'EXPIRED');
  });

  test('trusted-device listing expires stale records and identifies current device without leaking tokenHash', async () => {
    const expired = await deviceTrustService.registerTrustedDevice({
      organisationId: user.organisationId,
      userId: user.userId,
      user,
      deviceMetadata: {
        deviceType: 'DESKTOP',
        browser: 'OldBrowser',
      },
    });

    await TrustedDevice.updateOne(
      { deviceTrustId: expired.trustedDevice.deviceTrustId },
      {
        $set: {
          expiresAt: new Date(Date.now() - 60 * 1000),
          status: 'ACTIVE',
        },
      }
    );

    const current = await deviceTrustService.registerTrustedDevice({
      organisationId: user.organisationId,
      userId: user.userId,
      user,
      deviceMetadata: {
        deviceType: 'LAPTOP',
        browser: 'CurrentBrowser',
      },
    });

    const devices = await deviceTrustService.listUserTrustedDevices({
      organisationId: user.organisationId,
      userId: user.userId,
      currentRawToken: current.rawToken,
    });

    assert.equal(
      devices.some(
        (device) =>
          device.deviceTrustId === expired.trustedDevice.deviceTrustId
      ),
      false
    );

    const currentListed = devices.find(
      (device) =>
        device.deviceTrustId === current.trustedDevice.deviceTrustId
    );

    assert.ok(currentListed);
    assert.equal(currentListed.isCurrentDevice, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(currentListed, 'tokenHash'),
      false
    );

    const expiredPersisted = await TrustedDevice.findOne({
      deviceTrustId: expired.trustedDevice.deviceTrustId,
    });
    assert.equal(expiredPersisted.status, 'EXPIRED');
  });
});
