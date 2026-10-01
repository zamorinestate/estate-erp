'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { User } = require('../src/models/User');
const authService = require('../src/services/authService');

describe('AUTH FAILED-LOGIN CONCURRENCY', () => {
  let mongoServer;

  test.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  test.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('parallel bad-password attempts cannot lose increments or bypass the lock threshold', async () => {
    const passwordHash = await bcrypt.hash('CorrectPassword@123', 4);

    await User.create({
      organisationId: 'ZAMORIN',
      userId: 'ST-CONC-0001',
      name: 'Auth Concurrency Test',
      email: 'auth-concurrency@zamorin.test',
      passwordHash,
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      failedLoginAttempts: 3,
      mustChangePassword: false,
      createdBy: 'SYSTEM_TEST',
    });

    const attempts = await Promise.allSettled([
      authService.authenticatePassword({
        organisationId: 'ZAMORIN',
        email: 'auth-concurrency@zamorin.test',
        password: 'WrongPassword@123',
      }),
      authService.authenticatePassword({
        organisationId: 'ZAMORIN',
        email: 'auth-concurrency@zamorin.test',
        password: 'WrongPassword@123',
      }),
    ]);

    assert.equal(attempts.every((result) => result.status === 'rejected'), true);

    const persisted = await User.findOne({
      organisationId: 'ZAMORIN',
      userId: 'ST-CONC-0001',
    });

    assert.equal(persisted.failedLoginAttempts, 5);
    assert.equal(persisted.accountStatus, 'LOCKED');
    assert.ok(persisted.lockedUntil instanceof Date);
    assert.ok(persisted.lockedUntil.getTime() > Date.now());
    assert.ok(persisted.version >= 2);
  });
});
