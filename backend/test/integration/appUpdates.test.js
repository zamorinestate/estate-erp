'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { AppRelease } = require('../../src/models/AppRelease');
const { User } = require('../../src/models/User');
const { Notification } = require('../../src/models/Notification');
const updateController = require('../../src/controllers/updateController');

let mongod;
const orgId = 'ZAMORIN_TEST';

const users = {
  primaryMaster: {
    userId: 'USR-PM-001',
    name: 'Primary Master Admin',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: orgId,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
  },
  malformedMaster: {
    userId: 'USR-NM-001',
    name: 'Invalid MASTER Context',
    role: 'MASTER',
    isPrimaryMaster: false,
    organisationId: orgId,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
  },
  owner: {
    userId: 'USR-OW-001',
    name: 'Executive Owner',
    role: 'OWNER',
    organisationId: orgId,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
  },
  cafeAdmin: {
    userId: 'USR-CA-001',
    name: 'Cafe Operations Lead',
    role: 'CAFE_ADMIN',
    organisationId: orgId,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
  },
  staff: {
    userId: 'USR-ST-001',
    name: 'Shift Barista',
    role: 'STAFF',
    organisationId: orgId,
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
  },
};

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    sentBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    json(body) {
      this.sentBody = body;
      return this;
    },
  };
  return res;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Seed users directly into collection
  await User.collection.insertMany(Object.values(users));
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.describe('Role-Targeted Application Updates & Version Control Suite', () => {
  let staffOnlyReleaseId;
  let primaryMasterOnlyReleaseId;
  let universalReleaseId;

  test('1. Primary Master can publish a release targeted ONLY to Primary Master', async () => {
    const req = {
      user: users.primaryMaster,
      body: {
        version: 'v1.2.1-pm',
        title: 'Primary Master Governance Engine Calibration',
        category: 'SECURITY_PATCH',
        targetAudience: ['PRIMARY_MASTER'],
        criticality: 'MANDATORY',
        releaseNotes: 'Restricted root access encryption and cross-entity audit enhancements.',
      },
    };
    const res = createMockResponse();

    await updateController.publishRelease(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.sentBody.success, true);
    assert.equal(res.sentBody.data.version, 'v1.2.1-pm');
    assert.deepEqual(res.sentBody.data.targetAudience, ['PRIMARY_MASTER']);
    primaryMasterOnlyReleaseId = res.sentBody.data.releaseId;

    // Verify targeted notification was created for Primary Master ONLY
    const notifs = await Notification.find({
      organisationId: orgId,
      sourceEntityId: primaryMasterOnlyReleaseId.toUpperCase(),
    });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].recipientUserId, users.primaryMaster.userId);
  });

  test('2. Primary Master can publish a release targeted ONLY to Staff / Employees', async () => {
    const req = {
      user: users.primaryMaster,
      body: {
        version: 'v1.2.1-staff',
        title: 'Staff Kiosk & Self-Service Offline Punch Calibration',
        category: 'UI_IMPROVEMENT',
        targetAudience: ['STAFF'],
        criticality: 'RECOMMENDED',
        releaseNotes: 'Optimized biometric geofencing and instant timecard sync.',
      },
    };
    const res = createMockResponse();

    await updateController.publishRelease(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.sentBody.success, true);
    assert.equal(res.sentBody.data.version, 'v1.2.1-staff');
    staffOnlyReleaseId = res.sentBody.data.releaseId;

    // Verify targeted notification was created for Staff ONLY
    const notifs = await Notification.find({
      organisationId: orgId,
      sourceEntityId: staffOnlyReleaseId.toUpperCase(),
    });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].recipientUserId, users.staff.userId);
  });

  test('3. Primary Master can publish a Universal Release (ALL valid personas)', async () => {
    const req = {
      user: users.primaryMaster,
      body: {
        version: 'v1.2.0',
        title: 'Enterprise Core Q3 Update & Design Tokens',
        category: 'FEATURE',
        targetAudience: ['ALL'],
        criticality: 'RECOMMENDED',
        releaseNotes: 'Universal performance updates across all operational modules.',
      },
    };
    const res = createMockResponse();

    await updateController.publishRelease(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.sentBody.success, true);
    universalReleaseId = res.sentBody.data.releaseId;

    // Verify notifications are created for all 4 valid active personas; the
    // intentionally malformed MASTER fixture is excluded defensively.
    const notifs = await Notification.find({
      organisationId: orgId,
      sourceEntityId: universalReleaseId.toUpperCase(),
    });
    assert.equal(notifs.length, 4);
    assert.equal(
      notifs.some((n) => n.recipientUserId === users.malformedMaster.userId),
      false
    );
  });

  test('3A. Malformed non-primary MASTER cannot publish application releases', async () => {
    const req = {
      user: users.malformedMaster,
      body: {
        version: 'v-malformed-denied',
        title: 'Unauthorized malformed MASTER release',
        releaseNotes: 'Must never be created',
      },
    };
    const res = createMockResponse();

    await assert.rejects(
      () => updateController.publishRelease(req, res),
      (err) => {
        assert.equal(err.statusCode || err.status, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
        return true;
      }
    );
  });

  test('4. Non-Master role (STAFF) cannot publish releases (403 Forbidden)', async () => {
    const req = {
      user: users.staff,
      body: {
        version: 'v1.9.9',
        title: 'Unauthorized Release',
        releaseNotes: 'Should fail',
      },
    };
    const res = createMockResponse();

    await assert.rejects(
      async () => {
        await updateController.publishRelease(req, res);
      },
      (err) => {
        assert.equal(err.statusCode || err.status, 403);
        return true;
      }
    );
  });

  test('5. Role-scoping: Staff listing sees ONLY Staff-targeted and Universal releases', async () => {
    const req = { user: users.staff };
    const res = createMockResponse();

    await updateController.listTargetedUpdates(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.success, true);

    const releases = res.sentBody.data.releases;
    const releaseIds = releases.map((r) => r.releaseId);

    // Staff sees Staff-only and Universal releases
    assert.ok(releaseIds.includes(staffOnlyReleaseId));
    assert.ok(releaseIds.includes(universalReleaseId));
    // Staff NEVER sees Primary Master only release
    assert.ok(!releaseIds.includes(primaryMasterOnlyReleaseId));
  });

  test('6. Role-scoping: Owner listing sees ONLY Universal releases (neither PM nor Staff releases)', async () => {
    const req = { user: users.owner };
    const res = createMockResponse();

    await updateController.listTargetedUpdates(req, res);

    assert.equal(res.statusCode, 200);
    const releaseIds = res.sentBody.data.releases.map((r) => r.releaseId);

    assert.ok(releaseIds.includes(universalReleaseId));
    assert.ok(!releaseIds.includes(staffOnlyReleaseId));
    assert.ok(!releaseIds.includes(primaryMasterOnlyReleaseId));
  });

  test('7. Role-scoping: Primary Master sees ALL releases', async () => {
    const req = { user: users.primaryMaster };
    const res = createMockResponse();

    await updateController.listTargetedUpdates(req, res);

    assert.equal(res.statusCode, 200);
    const releaseIds = res.sentBody.data.releases.map((r) => r.releaseId);

    assert.ok(releaseIds.includes(primaryMasterOnlyReleaseId));
    assert.ok(releaseIds.includes(staffOnlyReleaseId));
    assert.ok(releaseIds.includes(universalReleaseId));
  });

  test('8. Live Refresh Check: returns hasUpdate: true and latest version', async () => {
    const req = {
      user: users.staff,
      query: { clientVersion: 'v1.0.0' },
      headers: {},
    };
    const res = createMockResponse();

    await updateController.checkForUpdates(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.data.hasUpdate, true);
    assert.ok(res.sentBody.data.updatesCount >= 1);
  });

  test('9. Package Download: Staff can download Staff release package', async () => {
    const req = {
      user: users.staff,
      params: { releaseId: staffOnlyReleaseId },
    };
    const res = createMockResponse();

    await updateController.downloadPackage(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.version, 'v1.2.1-staff');
    assert.ok(res.sentBody.sha256Checksum);
    assert.ok(res.sentBody.integritySignature);

    // Verify download count incremented
    const rel = await AppRelease.findOne({ releaseId: staffOnlyReleaseId });
    assert.equal(rel.downloadCount, 1);
  });

  test('10. Package Download: Staff is blocked from downloading Primary Master release (403)', async () => {
    const req = {
      user: users.staff,
      params: { releaseId: primaryMasterOnlyReleaseId },
    };
    const res = createMockResponse();

    await assert.rejects(
      async () => {
        await updateController.downloadPackage(req, res);
      },
      (err) => {
        assert.equal(err.statusCode || err.status, 403);
        return true;
      }
    );
  });

  test('11. Apply Release: Staff applies Staff release and local install state is sealed', async () => {
    const req = {
      user: users.staff,
      params: { releaseId: staffOnlyReleaseId },
      body: { deviceId: 'KIOSK-DEV-001' },
    };
    const res = createMockResponse();

    await updateController.applyRelease(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.success, true);
    assert.equal(res.sentBody.data.status, 'INSTALLED');
    assert.equal(res.sentBody.data.activeSystemVersion, 'v1.2.1-staff');

    // Verify in database
    const rel = await AppRelease.findOne({ releaseId: staffOnlyReleaseId });
    const userInstall = rel.installations.find((i) => i.userId === users.staff.userId);
    assert.ok(userInstall);
    assert.equal(userInstall.clientVersion, 'v1.2.1-staff');
  });

  test('12. Verify Release: Self-test returns cryptographic integrity pass', async () => {
    const req = {
      user: users.primaryMaster,
      params: { releaseId: universalReleaseId },
    };
    const res = createMockResponse();

    await updateController.verifyRelease(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.data.integrityCheck, 'PASS');
    assert.ok(Array.isArray(res.sentBody.data.componentsVerified));
    assert.equal(res.sentBody.data.componentsVerified.length, 5);
  });

  test('13. Rollback: Primary Master can roll back a release', async () => {
    const req = {
      user: users.primaryMaster,
      params: { releaseId: staffOnlyReleaseId },
      body: { reason: 'Emergency fix recall' },
    };
    const res = createMockResponse();

    await updateController.rollbackRelease(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody.data.status, 'ROLLED_BACK');

    const rel = await AppRelease.findOne({ releaseId: staffOnlyReleaseId });
    assert.equal(rel.status, 'ROLLED_BACK');
  });

  test('13A. Malformed non-primary MASTER cannot roll back a release', async () => {
    const req = {
      user: users.malformedMaster,
      params: { releaseId: universalReleaseId },
      body: { reason: 'Unauthorized rollback attempt' },
    };
    const res = createMockResponse();

    await assert.rejects(
      () => updateController.rollbackRelease(req, res),
      (err) => {
        assert.equal(err.statusCode || err.status, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
        return true;
      }
    );
  });
});
