// =============================================================================
// PM-04: ADMINISTRATION, TRASH GOVERNANCE, SECURITY POLICY & ATOMIC AUDIT TEST SUITE
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const trashController = require('../src/controllers/trashController.js');
const { TrashEntry } = require('../src/models/TrashEntry.js');
const { DispositionCertificate } = require('../src/models/DispositionCertificate.js');
const { User } = require('../src/models/User.js');
const { AuditEvent } = require('../src/models/AuditEvent.js');
const roleGovernanceController = require('../src/controllers/roleGovernanceController.js');
const userController = require('../src/controllers/userController.js');
const settingsController = require('../src/controllers/settingsController.js');
const cafeController = require('../src/controllers/cafeController.js');
const { Cafe } = require('../src/models/Cafe.js');

test('PM-04 Administration & Trash Governance Suite', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-0001',
      name: 'Primary Master Admin',
      email: 'master@zamorincafe.com',
      passwordHash: 'dummy_hash_for_test',
      role: 'MASTER',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial founder master user setup',
      assignedCafeIds: [],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'SYSTEM',
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  await t.test('PM-04 DOMAIN C: Trash bin initializes with pure empty-state truth (Zero fake auto-seeded records)', async () => {
    await TrashEntry.deleteMany({});

    const req = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      query: {},
    };
    let sentData = null;
    const res = {
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(payload) {
        sentData = payload;
        return this;
      },
    };

    await trashController.listTrashItems(req, res);
    assert.equal(sentData.success, true);
    assert.equal(Array.isArray(sentData.data.items), true);
    // Zero fake seeded sample data invariant:
    assert.equal(sentData.data.items.length, 0, 'No sample trash entries should be auto-seeded into production database');
    assert.equal(sentData.data.kpis.inTrash, 0);
  });

  await t.test('PM-04 DOMAIN C: Trash preservation hold lifecycle and audit atomicity', async () => {
    const item = new TrashEntry({
      trashId: 'TRASH-202609-00001',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      sourceModule: 'INVENTORY',
      entityType: 'INVENTORY_ITEM',
      entityId: 'SKU-HOLD-01',
      recordReference: 'SKU-HOLD-01',
      recordTitle: 'Arabica Green Beans',
      deletedByUserId: 'MU-0001',
      deletedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      lifecycleStatus: 'RECOVERABLE',
      holdState: 'NONE',
      holds: [],
    });
    await item.save();

    // 1. Place hold as Primary Master
    const holdReq = {
      auth: { userId: 'MU-0001', name: 'Primary Master', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      params: { trashId: 'TRASH-202609-00001' },
      body: { reason: 'Tax & Compliance Audit Invariant', scope: 'RECORD' },
    };
    let holdResData = null;
    const holdRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { holdResData = p; return this; },
    };

    // retired non-primary MASTER attempting placePreservationHold -> 403
    const retiredMasterHoldReq = {
      auth: { userId: 'MU-0002', name: 'retired non-primary MASTER', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: false },
      params: { trashId: 'TRASH-202609-00001' },
      body: { reason: 'Unauthorized hold' },
    };
    await assert.rejects(
      async () => {
        await trashController.placePreservationHold(retiredMasterHoldReq, holdRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Primary Master/i);
        return true;
      },
      'retired non-primary MASTER must be denied from placing preservation holds'
    );

    await trashController.placePreservationHold(holdReq, holdRes);
    assert.equal(holdResData.success, true);
    assert.equal(holdResData.data.holdState, 'ACTIVE');

    const reloaded = await TrashEntry.findOne({ trashId: 'TRASH-202609-00001' });
    assert.equal(reloaded.holdState, 'ACTIVE');
    assert.equal(reloaded.lifecycleStatus, 'ON_HOLD');
    assert.equal(reloaded.holds.length, 1);
    assert.equal(reloaded.holds[0].reason, 'Tax & Compliance Audit Invariant');

    // Verify AuditEvent recorded
    const audit = await AuditEvent.findOne({
      action: 'PLACE_PRESERVATION_HOLD',
      'metadata.trashId': 'TRASH-202609-00001',
    });
    assert.ok(audit, 'AuditEvent must be atomically recorded for placePreservationHold');

    // 2. Release hold
    const relReq = {
      auth: { userId: 'MU-0001', name: 'Primary Master', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      params: { trashId: 'TRASH-202609-00001', holdId: reloaded.holds[0].holdId },
      body: { releaseReason: 'Audit review complete' },
    };
    let relResData = null;
    const relRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { relResData = p; return this; },
    };

    await trashController.releasePreservationHold(relReq, relRes);
    assert.equal(relResData.success, true);
    assert.equal(relResData.data.holdState, 'NONE');

    const releasedItem = await TrashEntry.findOne({ trashId: 'TRASH-202609-00001' });
    assert.equal(releasedItem.holdState, 'NONE');
    assert.equal(releasedItem.lifecycleStatus, 'RECOVERABLE');
  });

  await t.test('PM-04 DOMAIN C: Permanent disposition purge emits Proof Certificate and erases payload atomically', async () => {
    const item = new TrashEntry({
      trashId: 'TRASH-202609-00002',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0001',
      sourceModule: 'INVENTORY',
      entityType: 'INVENTORY_ITEM',
      entityId: 'SKU-PURGE-01',
      recordReference: 'SKU-PURGE-01',
      recordTitle: 'Defective Grinder Burr',
      deletedByUserId: 'MU-0001',
      deletedAt: new Date(Date.now() - 40 * 86400000),
      expiresAt: new Date(Date.now() - 10 * 86400000),
      lifecycleStatus: 'DISPOSITION_APPROVED',
      holdState: 'NONE',
      payload: { sensitiveData: 'Original item snapshot' },
      attachments: [{ filename: 'damage_report.pdf', storageKey: 'att-123' }],
    });
    await item.save();

    // retired non-primary MASTER attempting executeDispositionPurge -> 403
    const retiredMasterPurgeReq = {
      auth: { userId: 'MU-0002', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: false },
      params: { trashId: 'TRASH-202609-00002' },
    };
    const dummyPurgeRes = { status() { return this; }, json() { return this; } };
    await assert.rejects(
      async () => {
        await trashController.executeDispositionPurge(retiredMasterPurgeReq, dummyPurgeRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Primary Master/i);
        return true;
      },
      'retired non-primary MASTER must be denied from executing disposition purge'
    );

    const purgeReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      params: { trashId: 'TRASH-202609-00002' },
    };
    let purgeResData = null;
    const purgeRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { purgeResData = p; return this; },
    };

    await trashController.executeDispositionPurge(purgeReq, purgeRes);
    assert.equal(purgeResData.success, true);
    assert.equal(purgeResData.data.status, 'DISPOSED');
    assert.ok(purgeResData.data.certificateId, 'DispositionCertificate ID must be generated');

    const purgedItem = await TrashEntry.findOne({ trashId: 'TRASH-202609-00002' });
    assert.equal(purgedItem.lifecycleStatus, 'DISPOSED');
    assert.equal(purgedItem.payload, null, 'Payload snapshot must be permanently erased');
    assert.equal(purgedItem.attachments.length, 0, 'Attachments must be purged');
    assert.equal(purgedItem.dispositionCertificateId, purgeResData.data.certificateId);

    // Certificate check
    const cert = await DispositionCertificate.findOne({ certificateId: purgeResData.data.certificateId });
    assert.ok(cert, 'Proof of Disposition Certificate must exist');
    assert.equal(cert.recordReference, 'SKU-PURGE-01');
    assert.equal(cert.entityType, 'INVENTORY_ITEM');

    // AuditEvent check
    const audit = await AuditEvent.findOne({
      action: 'EXECUTE_PERMANENT_DISPOSITION',
      'metadata.certificateId': purgeResData.data.certificateId,
    });
    assert.ok(audit, 'AuditEvent must be atomically recorded for permanent purge');
  });

  await t.test('PM-04 DOMAIN A & E: Primary Master protection invariant blocks role change and archiving', async () => {
    const primaryMaster = await User.findOne({
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-0001',
    });
    assert.ok(primaryMaster, 'Primary Master must exist');

    // Attempt role change on Primary Master
    const roleChangeReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      params: { userId: primaryMaster.userId },
      body: { confirmed: true, proposedRole: 'STAFF', reason: 'Attempted demotion' },
    };
    const dummyRes = {
      status() { return this; },
      json() { return this; },
    };

    await assert.rejects(
      async () => {
        await roleGovernanceController.executeRoleChange(roleChangeReq, dummyRes);
      },
      (err) => {
        assert.match(err.message, /PRIMARY_MASTER_PROTECTED|Primary Master/i);
        return true;
      },
      'Primary Master role cannot be demoted or changed'
    );

    // Attempt archive on Primary Master
    const archiveReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      params: { userId: primaryMaster.userId },
      body: { reason: 'Attempted archive' },
    };

    await assert.rejects(
      async () => {
        await userController.archiveUser(archiveReq, dummyRes);
      },
      (err) => {
        assert.match(err.message, /You cannot archive your own MASTER account|SELF_ARCHIVE_BLOCKED|PRIMARY_MASTER_PROTECTED|Primary Master/i);
        return true;
      },
      'Primary Master account cannot be archived'
    );
  });

  await t.test('PM-04 DOMAIN D: Security policy truth reflects TOTP removal (mfaRequired is false when not configured)', async () => {
    const prevEnv = process.env.REQUIRE_MFA;
    delete process.env.REQUIRE_MFA; // Default: TOTP not globally required

    const req = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      user: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
    };
    let sentData = null;
    const res = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { sentData = p; return this; },
    };

    await settingsController.getSecurityOverview(req, res);
    assert.equal(sentData.success, true);
    assert.equal(
      sentData.data.securityPolicy.mfaRequired,
      false,
      'mfaRequired in securityPolicy must be false when REQUIRE_MFA is not enabled (no stale TOTP claim)'
    );

    if (prevEnv) process.env.REQUIRE_MFA = prevEnv;
  });

  await t.test('PM-04 DOMAIN B: Café creation and mutation strictly requires Primary Master; retired MASTER, OWNER and STAFF are denied', async () => {
    const dummyRes = {
      status() { return this; },
      json() { return this; },
    };

    // 0. Retired non-primary MASTER must fail closed on café creation.
    const retiredMasterCreateReq = {
      auth: { userId: 'MU-RETIRED-0002', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: false },
      body: { name: 'Unauthorized Retired Master Branch', cafeType: 'STANDARD_CAFE' },
    };
    await assert.rejects(
      async () => {
        await cafeController.createCafe(retiredMasterCreateReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Primary Master|CAFE_CREATION_DENIED|PRIMARY_MASTER_ACCESS_REQUIRED/i);
        return true;
      },
      'Retired non-primary MASTER must be forbidden from creating a café'
    );

    // 1. OWNER attempting createCafe -> 403
    const ownerCreateReq = {
      auth: { userId: 'OW-0001', organisationId: 'ORG-ZAMORIN', role: 'OWNER' },
      body: { name: 'Illegal Owner Cafe', cafeType: 'STANDARD_CAFE' },
    };
    await assert.rejects(
      async () => {
        await cafeController.createCafe(ownerCreateReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /PRIMARY_MASTER_ACCESS_REQUIRED|MASTER_ACCESS_REQUIRED|Master role/i);
        return true;
      },
      'OWNER must be forbidden from creating a café'
    );

    // 2. STAFF attempting createCafe -> 403
    const staffCreateReq = {
      auth: { userId: 'ST-0001', organisationId: 'ORG-ZAMORIN', role: 'STAFF' },
      body: { name: 'Illegal Staff Cafe' },
    };
    await assert.rejects(
      async () => {
        await cafeController.createCafe(staffCreateReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /PRIMARY_MASTER_ACCESS_REQUIRED|MASTER_ACCESS_REQUIRED|Master role/i);
        return true;
      },
      'STAFF must be forbidden from creating a café'
    );

    // 3. OWNER attempting changeCafeStatus -> 403
    const ownerStatusReq = {
      auth: { userId: 'OW-0001', organisationId: 'ORG-ZAMORIN', role: 'OWNER', assignedCafeIds: ['ZC-0001'] },
      params: { cafeId: 'ZC-0001' },
      body: { status: 'DEACTIVATED' },
    };
    await assert.rejects(
      async () => {
        await cafeController.changeCafeStatus(ownerStatusReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /PRIMARY_MASTER_ACCESS_REQUIRED|MASTER_ACCESS_REQUIRED|Master role/i);
        return true;
      },
      'OWNER must be forbidden from altering café status'
    );

    // 4. OWNER attempting archiveCafe -> 403
    const ownerArchiveReq = {
      auth: { userId: 'OW-0001', organisationId: 'ORG-ZAMORIN', role: 'OWNER', assignedCafeIds: ['ZC-0001'] },
      params: { cafeId: 'ZC-0001' },
      body: { reason: 'Unauthorized archive' },
    };
    await assert.rejects(
      async () => {
        await cafeController.archiveCafe(ownerArchiveReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /PRIMARY_MASTER_ACCESS_REQUIRED|MASTER_ACCESS_REQUIRED|Master role/i);
        return true;
      },
      'OWNER must be forbidden from archiving a café'
    );
  });

  await t.test('PM-04 DOMAIN B & C: Cross-Organisation IDOR boundaries hold closed', async () => {
    // 1. Foreign cafe in different organisation
    await Cafe.create({
      cafeId: 'ZC-9999',
      organisationId: 'ORG-OTHER-TENANT',
      name: 'Foreign Tenant Branch',
      displayName: 'Foreign Branch',
      status: 'ACTIVE',
      createdBy: 'FOREIGN_ADMIN',
    });

    const foreignCafeReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      params: { cafeId: 'ZC-9999' },
    };
    const dummyRes = {
      status() { return this; },
      json() { return this; },
    };

    // Primary Master of ORG-ZAMORIN must NOT see or access foreign org café
    await assert.rejects(
      async () => {
        await cafeController.getCafe(foreignCafeReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'CAFE_NOT_FOUND');
        return true;
      },
      'Cross-organization café access must return 404 CAFE_NOT_FOUND'
    );

    // 2. Foreign trash record
    const foreignTrash = new TrashEntry({
      trashId: 'TRASH-202609-00099',
      organisationId: 'ORG-OTHER-TENANT',
      cafeId: 'ZC-9999',
      sourceModule: 'INVENTORY',
      entityType: 'INVENTORY_ITEM',
      entityId: 'SKU-FOREIGN-01',
      recordReference: 'SKU-FOREIGN-01',
      recordTitle: 'Foreign Tenant SKU',
      deletedByUserId: 'FOREIGN_USER',
      deletedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      lifecycleStatus: 'RECOVERABLE',
      holdState: 'NONE',
      holds: [],
    });
    await foreignTrash.save();

    const restoreReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      body: { trashId: 'TRASH-202609-00099' },
    };
    await assert.rejects(
      async () => {
        await trashController.restoreTrashItem(restoreReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
      'Cross-organization trash restore must return 404'
    );
  });

  await t.test('PM-04 DOMAIN A & E: User role change increments sessionVersion and permissionsVersion', async () => {
    // Create target user with CAFE_ADMIN role
    const testUser = await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'AD-9001',
      name: 'Test Cafe Admin',
      email: 'admin.test@zamorincafe.com',
      passwordHash: 'dummy_hash',
      role: 'CAFE_ADMIN',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      isPrimaryMaster: false,
      assignedCafeIds: ['ZC-0001'],
      sessionVersion: 1,
      permissionsVersion: 1,
      createdBy: 'MU-0001',
    });

    const roleReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER' },
      params: { userId: 'AD-9001' },
      body: {
        confirmed: true,
        proposedRole: 'STAFF',
        expectedCurrentRole: 'CAFE_ADMIN',
        reason: 'Demoting admin to staff as part of rotation',
      },
    };
    let roleResData = null;
    const roleRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { roleResData = p; return this; },
    };

    await roleGovernanceController.executeRoleChange(roleReq, roleRes);
    assert.equal(roleResData.success, true);

    const updatedUser = await User.findOne({ userId: 'AD-9001', organisationId: 'ORG-ZAMORIN' });
    assert.equal(updatedUser.role, 'STAFF');
    assert.ok(updatedUser.sessionVersion > 1, 'sessionVersion must be incremented to revoke existing sessions');
    assert.ok(updatedUser.permissionsVersion > 1, 'permissionsVersion must be incremented to invalidate permissions cache');
  });

  await t.test('PM-04 DOMAIN D: Security policy mutation strictly requires Primary Master; retired non-primary MASTER is denied', async () => {
    // 1. retired non-primary MASTER attempting updateSecurityPolicy -> 403 PRIMARY_MASTER_AUTHORITY_REQUIRED
    const retiredMasterReq = {
      auth: { userId: 'MU-0002', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: false },
      body: { passwordPolicy: 'Weak policy attempted' },
    };
    const dummyRes = { status() { return this; }, json() { return this; } };

    await assert.rejects(
      async () => {
        await settingsController.updateSecurityPolicy(retiredMasterReq, dummyRes);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Primary Master/i);
        return true;
      },
      'retired non-primary MASTER must be denied from mutating security policy'
    );

    // 2. Primary Master updates policy successfully
    const pmReq = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: {
        passwordPolicy: 'Minimum 15 characters (passphrase length-first, zero forced composition rules, blocklist protected)',
        sessionPolicy: 'Strict session versioning with instant privilege invalidation',
      },
    };
    let pmResData = null;
    const pmRes = {
      status(code) { assert.equal(code, 200); return this; },
      json(p) { pmResData = p; return this; },
    };

    await settingsController.updateSecurityPolicy(pmReq, pmRes);
    assert.equal(pmResData.success, true);
    assert.equal(pmResData.data.securityPolicy.mfaRequired, false);

    const audit = await AuditEvent.findOne({
      action: 'SECURITY_POLICY_UPDATED',
      organisationId: 'ORG-ZAMORIN',
    });
    assert.ok(audit, 'AuditEvent must be recorded when Primary Master updates security policy');
  });

  await t.test('PM-04 DOMAIN D: Password-only security requires 15+ characters, supports long passphrases up to 128 chars without silent truncation', async () => {
    const authService = require('../src/services/authService');

    // 1. Shorter than 15 characters -> rejected
    const shortErrors = authService.validatePasswordStrength('ShortPass1!');
    assert.ok(shortErrors.length > 0);
    assert.match(shortErrors[0], /at least 15 characters/i);

    // 2. 15 characters passphrase with spaces and no forced legacy composition rules -> valid
    const validPassphrase = 'coffee beans roasted daily';
    const validErrors = authService.validatePasswordStrength(validPassphrase);
    assert.equal(validErrors.length, 0, '15+ char passphrase must be accepted without forced composition rules');

    // 3. Long passphrase up to 128 characters -> valid without truncation
    const longPassphrase = 'a'.repeat(64) + ' ' + 'b'.repeat(63); // 128 chars
    const longErrors = authService.validatePasswordStrength(longPassphrase);
    assert.equal(longErrors.length, 0, 'Up to 128 chars must be supported without error');

    // 4. Exceeding 128 characters -> rejected (no silent truncation)
    const tooLongPassphrase = 'c'.repeat(129);
    const tooLongErrors = authService.validatePasswordStrength(tooLongPassphrase);
    assert.ok(tooLongErrors.some((e) => e.includes('128 characters')));

    // 5. Common blocklist password -> rejected
    const commonErrors = authService.validatePasswordStrength('password12345678');
    assert.ok(commonErrors.some((e) => e.includes('too common')));

    // 6. Hashing executes using modern memory-hard scrypt
    const hash = await authService.hashPassword(validPassphrase);
    assert.ok(hash.startsWith('$scrypt$v=1$'), 'Hash must use modern memory-hard scrypt KDF');

    // 7. Verify password works with the hash
    const isValid = await authService.verifyPassword(validPassphrase, hash);
    assert.equal(isValid, true);
  });

  await t.test('PM-04 DOMAIN D: Environment flag REQUIRE_MFA does NOT re-enable removed mandatory TOTP flow', async () => {
    const authService = require('../src/services/authService');
    const prevEnv = process.env.REQUIRE_MFA;
    const prevSecret = process.env.JWT_ACCESS_SECRET;
    process.env.REQUIRE_MFA = 'true';
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret_with_at_least_32_characters_12345';

    // Verify session creation or authentication requirements do not force mandatory TOTP
    const mockUser = {
      userId: 'MU-0001',
      organisationId: 'ORG-ZAMORIN',
      role: 'MASTER',
      mfaEnabled: false,
    };

    // Authenticate check in authService
    // Calling createSession without mfaVerified does NOT throw for non-mfa-enabled user
    const session = await authService.createSession({
      user: mockUser,
      device: { deviceId: 'DEV-TEST-01' },
      network: { ip: '127.0.0.1' },
      mfaVerified: false,
      createdBy: 'TEST',
    });
    assert.ok(session, 'Session must be created without demanding mandatory TOTP even when REQUIRE_MFA is set');

    if (prevEnv) process.env.REQUIRE_MFA = prevEnv;
    else delete process.env.REQUIRE_MFA;
    if (prevSecret) process.env.JWT_ACCESS_SECRET = prevSecret;
    else delete process.env.JWT_ACCESS_SECRET;
  });
});

