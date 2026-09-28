'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  User,
} = require('../src/models/User');

const {
  actorIsPrimaryMaster,
  handlePrimaryMasterAttack,
  assertNotPrimaryMasterTarget,
  assertMayRestoreAccount,
  assertPrimaryMasterAuthority,
} = require('../src/services/userGovernanceService');

const { ApiError } = require('../src/utils/ApiError');

test('Primary Master Security Countermeasure — malformed non-primary MASTER neutralization attempt', async (t) => {
  await t.test('malformed non-primary MASTER attacking Primary Master gets automatically suspended', async () => {
    const pm = new User({
      userId: 'MU-0001',
      organisationId: 'ORG-0001',
      name: 'Primary Master',
      email: 'pm@zamorin.com',
      role: 'MASTER',
      isPrimaryMaster: true,
      accountStatus: 'ACTIVE',
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial bootstrap',
    });

    const malformedMaster = new User({
      userId: 'MU-0002',
      organisationId: 'ORG-0001',
      name: 'Attacking Malformed Master Context',
      email: 'attacker@zamorin.com',
      role: 'MASTER',
      isPrimaryMaster: false,
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      permissionsVersion: 1,
    });

    // Mock save
    let attackerSaved = false;
    malformedMaster.save = async function () {
      attackerSaved = true;
    };

    const mockRequest = {
      auth: {
        userId: 'MU-0002',
        organisationId: 'ORG-0001',
        role: 'MASTER',
      },
      correlationId: 'TEST-CORRELATION-001',
    };

    await assert.rejects(
      async () => {
        await handlePrimaryMasterAttack({
          request: mockRequest,
          actorDocument: malformedMaster,
          target: pm,
          operationDescription: 'deactivate Primary Master',
        });
      },
      (err) => {
        assert.equal(err instanceof ApiError, true);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_ATTACK_SUSPENDED');
        return true;
      }
    );

    // Verify attacking Master state
    assert.equal(attackerSaved, true);
    assert.equal(malformedMaster.accountStatus, 'SUSPENDED');
    assert.equal(malformedMaster.primaryMasterProtectionSuspension, true);
    assert.equal(malformedMaster.sessionVersion, 2);
    assert.equal(malformedMaster.permissionsVersion, 2);
    assert.match(malformedMaster.statusReason, /PRIMARY_MASTER_PROTECTION_TRIGGERED/);

    // Verify Primary Master remains untouched
    assert.equal(pm.accountStatus, 'ACTIVE');
    assert.equal(pm.isPrimaryMaster, true);
    assert.equal(pm.role, 'MASTER');
  });

  await t.test('stray Primary-Master flag on a non-MASTER role grants zero Primary-Master authority', async () => {
    const corruptedOwner = new User({
      userId: 'OW-CORRUPT-01',
      organisationId: 'ORG-0001',
      name: 'Corrupted Owner Flag',
      role: 'OWNER',
      isPrimaryMaster: true,
      accountStatus: 'ACTIVE',
    });

    const protectedSuspension = new User({
      userId: 'MU-MALFORMED-01',
      organisationId: 'ORG-0001',
      name: 'Protected Suspension Target',
      role: 'MASTER',
      isPrimaryMaster: false,
      accountStatus: 'SUSPENDED',
      primaryMasterProtectionSuspension: true,
      statusReason: 'PRIMARY_MASTER_PROTECTION_TRIGGERED: Attempted illegal action',
    });

    assert.equal(actorIsPrimaryMaster(corruptedOwner), false);

    assert.throws(
      () => assertPrimaryMasterAuthority(corruptedOwner, 'execute Primary Master governance'),
      (err) => err instanceof ApiError &&
        err.statusCode === 403 &&
        err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
    );

    assert.throws(
      () => assertMayRestoreAccount(corruptedOwner, protectedSuspension),
      (err) => err instanceof ApiError &&
        err.statusCode === 403 &&
        err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
    );
  });

  await t.test('non-MASTER actor targeting Primary Master is denied without malformed-MASTER auto-suspension', async () => {
    const pm = new User({
      userId: 'MU-0001',
      organisationId: 'ORG-0001',
      name: 'Primary Master',
      role: 'MASTER',
      isPrimaryMaster: true,
      accountStatus: 'ACTIVE',
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
      primaryMasterDesignationReason: 'Initial bootstrap',
    });

    const owner = new User({
      userId: 'OW-0001',
      organisationId: 'ORG-0001',
      name: 'Owner',
      role: 'OWNER',
      isPrimaryMaster: false,
      accountStatus: 'ACTIVE',
      sessionVersion: 3,
      permissionsVersion: 4,
    });

    let ownerSaved = false;
    owner.save = async function () {
      ownerSaved = true;
    };

    const directResult = await handlePrimaryMasterAttack({
      request: {
        auth: {
          userId: owner.userId,
          organisationId: owner.organisationId,
          role: owner.role,
        },
      },
      actorDocument: owner,
      target: pm,
      operationDescription: 'attempt protected Primary Master mutation',
    });

    assert.equal(directResult, undefined);
    assert.equal(ownerSaved, false);
    assert.equal(owner.accountStatus, 'ACTIVE');
    assert.equal(owner.sessionVersion, 3);
    assert.equal(owner.permissionsVersion, 4);

    assert.throws(
      () => assertNotPrimaryMasterTarget(
        pm,
        'profile cannot be administratively modified',
        {
          request: {
            auth: {
              userId: owner.userId,
              organisationId: owner.organisationId,
              role: owner.role,
            },
          },
          actorDocument: owner,
        }
      ),
      (err) => err instanceof ApiError &&
        err.statusCode === 403 &&
        err.code === 'PRIMARY_MASTER_PROTECTED'
    );

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ownerSaved, false);
    assert.equal(owner.accountStatus, 'ACTIVE');
  });

  await t.test('malformed non-primary MASTER cannot restore an account suspended for Primary Master attack', async () => {
    const pmAttacker = new User({
      userId: 'MU-0002',
      organisationId: 'ORG-0001',
      name: 'Security Suspended Master',
      role: 'MASTER',
      isPrimaryMaster: false,
      accountStatus: 'SUSPENDED',
      primaryMasterProtectionSuspension: true,
      statusReason: 'PRIMARY_MASTER_PROTECTION_TRIGGERED: Attempted illegal action',
    });

    const otherMalformedMaster = new User({
      userId: 'MU-0003',
      organisationId: 'ORG-0001',
      name: 'Other Malformed Master Context',
      role: 'MASTER',
      isPrimaryMaster: false,
    });

    assert.throws(
      () => {
        assertMayRestoreAccount(otherMalformedMaster, pmAttacker);
      },
      (err) => {
        assert.equal(err instanceof ApiError, true);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
        return true;
      }
    );
  });

  await t.test('Primary Master CAN restore an account suspended for Primary Master attack', async () => {
    const pmAttacker = new User({
      userId: 'MU-0002',
      organisationId: 'ORG-0001',
      name: 'Security Suspended Master',
      role: 'MASTER',
      isPrimaryMaster: false,
      accountStatus: 'SUSPENDED',
      primaryMasterProtectionSuspension: true,
      statusReason: 'PRIMARY_MASTER_PROTECTION_TRIGGERED: Attempted illegal action',
    });

    const primaryMaster = new User({
      userId: 'MU-0001',
      organisationId: 'ORG-0001',
      name: 'Primary Master',
      role: 'MASTER',
      isPrimaryMaster: true,
    });

    // Should not throw
    assert.doesNotThrow(() => {
      assertMayRestoreAccount(primaryMaster, pmAttacker);
    });
  });
});
