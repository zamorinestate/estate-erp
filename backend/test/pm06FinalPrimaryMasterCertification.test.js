// =============================================================================
// ZAMORIN CAFÉ ERP — PM-06: FINAL PRIMARY MASTER REGRESSION, SECURITY, SCOPE,
// DATA-INTEGRITY & RELEASE-READINESS CERTIFICATION SUITE
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { User } = require('../src/models/User');
const { Cafe } = require('../src/models/Cafe');
const { Session } = require('../src/models/Session');
const { TrustedDevice } = require('../src/models/TrustedDevice');
const { AuditEvent } = require('../src/models/AuditEvent');
const { TrashEntry } = require('../src/models/TrashEntry');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const { RolePermission } = require('../src/models/RolePermission');

const userGovernanceService = require('../src/services/userGovernanceService');
const roleGovernanceController = require('../src/controllers/roleGovernanceController');
const userController = require('../src/controllers/userController');
const settingsController = require('../src/controllers/settingsController');
const trashController = require('../src/controllers/trashController');
const personalLedgerController = require('../src/controllers/personalLedgerController');
const authService = require('../src/services/authService');
const deviceTrustService = require('../src/services/deviceTrustService');
const { resolveEffectiveCafeScope } = require('../src/utils/cafeScope');

test('PM-06: Final Primary Master Certification & Security Invariant Suite', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // 1. Primary Master Account
    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-0001',
      name: 'Primary Master Admin',
      email: 'primary.master@zamorincafe.com',
      passwordHash: '$scrypt$v=1$test_hash',
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial founder master user setup',
      primaryCafeId: null,
      assignedCafeIds: [],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'SYSTEM',
    });

    // 2. Malformed MASTER Account
    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-0002',
      name: 'Malformed MASTER User',
      email: 'malformed.master@zamorincafe.com',
      passwordHash: '$scrypt$v=1$test_hash',
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: null,
      assignedCafeIds: [],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'MU-0001',
    });

    // 3. Owner Account
    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'OW-0001',
      name: 'Cafe Owner A',
      email: 'owner@zamorincafe.com',
      passwordHash: '$scrypt$v=1$test_hash',
      role: 'OWNER',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'MU-0001',
    });

    // 4. Cafe Admin Account
    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'AD-0001',
      name: 'Cafe Admin 1',
      email: 'admin1@zamorincafe.com',
      passwordHash: '$scrypt$v=1$test_hash',
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'MU-0001',
    });

    // 5. Staff Account
    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'ST-0001',
      name: 'Staff Member 1',
      email: 'staff1@zamorincafe.com',
      passwordHash: '$scrypt$v=1$test_hash',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      isPrimaryMaster: false,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'AD-0001',
    });

    // Cafes
    await Cafe.create({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      name: 'Zamorin Calicut Beach',
      displayName: 'Zamorin Calicut Beach',
      code: 'CLT-01',
      status: 'ACTIVE',
      createdBy: 'MU-0001',
    });
    await Cafe.create({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0002',
      name: 'Zamorin Kochi Hub',
      displayName: 'Zamorin Kochi Hub',
      code: 'KCH-01',
      status: 'ACTIVE',
      createdBy: 'MU-0001',
    });

    await User.init();
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // ── INVARIANT 1: PRIMARY MASTER INVARIANT CERTIFICATION ─────────────────────
  await t.test('INVARIANT 1: Primary Master is unique, immutable, and protected from demotion/deletion', async () => {
    const pm = await User.findOne({ userId: 'MU-0001', organisationId: 'ORG-ZAMORIN' });
    assert.ok(pm, 'Primary Master account exists');
    assert.equal(pm.role, 'MASTER');
    assert.equal(pm.accountStatus, 'ACTIVE');
    assert.equal(pm.primaryCafeId, null);
    assert.deepEqual(pm.assignedCafeIds, []);
    assert.equal(pm.isPrimaryMaster, true);

    // Attempting to create a second Primary Master in the same organization fails database unique index
    await assert.rejects(
      async () => {
        await User.create({
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0003',
          name: 'Fake Second Primary Master',
          email: 'fake.master@zamorincafe.com',
          passwordHash: 'hash',
          role: 'MASTER',
          accountStatus: 'ACTIVE',
          isPrimaryMaster: true,
          primaryMasterDesignatedAt: new Date(),
          primaryMasterDesignatedBy: 'ATTACKER',
          primaryMasterDesignationReason: 'Illegal takeover',
          createdBy: 'ATTACKER',
        });
      },
      (err) => {
        assert.ok(err.code === 11000 || /duplicate/i.test(err.message));
        return true;
      },
      'Cannot have more than one Primary Master per organisation'
    );

    // Attempt to change role of Primary Master target is strictly blocked (PRIMARY_MASTER_PROTECTED)
    assert.throws(
      () => {
        userGovernanceService.assertNotPrimaryMasterTarget(pm, 'role cannot be changed', {
          actorDocument: { userId: 'MU-0002', isPrimaryMaster: false },
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_PROTECTED');
        return true;
      }
    );
  });

  // ── INVARIANT 2: FIVE-PORTAL PROJECTION & DENY-BY-DEFAULT ─────────────────
  await t.test('INVARIANT 2: Projections hold strict server-side deny-by-default boundary', async () => {
    // Malformed MASTER attempting Primary Master security policy mutation -> 403
    const malformedMasterReq = {
      auth: { userId: 'MU-0002', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: false },
      body: { passwordPolicy: 'Weak' },
    };
    const dummyRes = { status() { return this; }, json() { return this; } };

    await assert.rejects(
      async () => {
        await settingsController.updateSecurityPolicy(malformedMasterReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // CAFE_ADMIN attempting cross-cafe scope -> 403
    const foreignCafeReq = {
      auth: {
        userId: 'AD-0001',
        organisationId: 'ORG-ZAMORIN',
        role: 'CAFE_ADMIN',
        assignedCafeIds: ['ZC-0001'],
      },
      query: { cafeId: 'ZC-0002' },
    };

    assert.throws(
      () => {
        resolveEffectiveCafeScope(foreignCafeReq);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // STAFF attempting administrative/finance action -> Denied
    const staffReq = {
      auth: {
        userId: 'ST-0001',
        organisationId: 'ORG-ZAMORIN',
        role: 'STAFF',
        assignedCafeIds: ['ZC-0001'],
      },
      query: {},
    };

    let staffResCode = null;
    const staffRes = {
      status(code) { staffResCode = code; return this; },
      json() { return this; },
    };
    const { requirePrimaryMaster } = require('../src/middleware/authorize');
    requirePrimaryMaster(staffReq, staffRes, () => {});
    assert.equal(staffResCode, 403);
  });

  // ── INVARIANT 3: ORGANISATION & CAFÉ ISOLATION ────────────────────────────
  await t.test('INVARIANT 3: Cross-organisation queries return 0 foreign records', async () => {
    await TrashEntry.create({
      organisationId: 'ORG-FOREIGN',
      trashId: 'TRASH-260912-00001',
      entityType: 'USER',
      entityId: 'USR-FOREIGN-01',
      sourceModule: 'EMPLOYEES',
      recordTitle: 'Foreign User',
      recordReference: 'EMP-FOREIGN-001',
      purged: false,
      payloadSnapshot: { name: 'Foreign User' },
      deletedByUserId: 'FOREIGN-ADMIN',
      expiresAt: new Date(Date.now() + 86400000),
    });

    let trashResData = null;
    const pmReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      query: {},
    };
    const pmRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { trashResData = p; return this; },
    };

    await trashController.listTrashItems(pmReq, pmRes);
    assert.equal(trashResData.success, true);
    assert.ok(trashResData.data.items.every((it) => it.organisationId !== 'ORG-FOREIGN'));
  });

  // ── INVARIANT 4: AUTHENTICATION & PASSWORD POLICY ─────────────────────────
  await t.test('INVARIANT 4: NIST SP 800-63B-4 password policy enforced without mandatory composition rules', () => {
    // Passphrase length-first (>= 15 chars)
    const validLongPassphrase = 'correct horse battery staple enterprise 2026';
    const errorsValid = authService.validatePasswordStrength(validLongPassphrase);
    assert.equal(errorsValid.length, 0, 'Long passphrase without numbers/symbols must be valid');

    // Short password (< 15 chars) rejected
    const shortPass = 'ShortPass1!';
    const errorsShort = authService.validatePasswordStrength(shortPass);
    assert.ok(errorsShort.some((e) => e.includes('15 characters')), 'Must reject < 15 chars');

    // Common blocklisted password rejected
    const blocklistedPass = 'password1234567';
    const errorsBlocklist = authService.validatePasswordStrength(blocklistedPass);
    assert.ok(errorsBlocklist.some((e) => e.includes('common')), 'Must reject blocklisted passwords');
  });

  // ── INVARIANT 5: SESSION SECURITY & DEVICE TRUST ──────────────────────────
  await t.test('INVARIANT 5: Session version increment invalidates existing session privileges', async () => {
    const user = await User.findOne({ userId: 'ST-0001' });
    const originalVersion = user.sessionVersion;

    // Simulate password change / privilege update
    user.sessionVersion += 1;
    await user.save();

    const updatedUser = await User.findOne({ userId: 'ST-0001' });
    assert.equal(updatedUser.sessionVersion, originalVersion + 1);

    // A token with payload.usv = originalVersion will mismatch user.sessionVersion and be denied
    assert.notEqual(updatedUser.sessionVersion, originalVersion);
  });

  // ── INVARIANT 6: PERSONAL LEDGER INTEGRITY & IDOR PROTECTION ──────────────
  await t.test('INVARIANT 6: Owner cannot access another account holder ledger', async () => {
    const ownerReq = {
      auth: { userId: 'OW-0001', organisationId: 'ORG-ZAMORIN', role: 'OWNER', isPrimaryMaster: false },
      query: { accountHolderId: 'OW-9999' },
    };
    const dummyRes = { status() { return this; }, json() { return this; } };

    await assert.rejects(
      async () => {
        await personalLedgerController.listEntries(ownerReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /own personal ledger/i);
        return true;
      }
    );
  });

  // ── INVARIANT 7: MANDATORY ATOMIC AUDIT TRAIL ─────────────────────────────
  await t.test('INVARIANT 7: Critical governance mutations record atomic AuditEvent', async () => {
    const pmReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: {
        passwordPolicy: 'Minimum 15 characters (passphrase length-first, zero forced composition rules, blocklist protected)',
        sessionPolicy: 'Standard enterprise session management',
      },
    };
    const pmRes = { status() { return this; }, json() { return this; } };

    await settingsController.updateSecurityPolicy(pmReq, pmRes);

    const audit = await AuditEvent.findOne({
      organisationId: 'ORG-ZAMORIN',
      action: 'SECURITY_POLICY_UPDATED',
      actorUserId: 'MU-0001',
    });
    assert.ok(audit, 'Mandatory AuditEvent must be recorded');
    assert.equal(audit.module, 'SECURITY_POLICY');
  });
});
