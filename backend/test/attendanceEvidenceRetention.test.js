'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PrivateFile } = require('../src/models/PrivateFile');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { attendanceEvidenceStorageService } = require('../src/services/attendanceEvidenceStorageService');
const {
  DEFAULT_ORPHAN_GRACE_MINUTES,
  buildAttendanceEvidenceReferenceQuery,
  buildReservationAttendanceReferenceQuery,
  reconcileExpiredOrphanAttendanceEvidence,
} = require('../src/services/attendanceEvidenceRetentionService');

function installCandidateFind(candidates) {
  PrivateFile.find = () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => candidates,
  });
}

test('RET-001: attendance reference query covers every canonical selfie reference location', () => {
  const query = buildAttendanceEvidenceReferenceQuery('ORG-ZAMORIN', 'FILE-0001');
  assert.equal(query.organisationId, 'ORG-ZAMORIN');
  const json = JSON.stringify(query);
  for (const path of [
    'attendanceEvidence.checkIn.selfieMediaId',
    'attendanceEvidence.checkIn.photoFileId',
    'attendanceEvidence.checkOut.selfieMediaId',
    'attendanceEvidence.checkOut.photoFileId',
    'selfieFileId',
    'rawTimeEvents.selfieFileId',
  ]) {
    assert.ok(json.includes(path), `reference query must include ${path}`);
  }
});


test('RET-001A: orphan scan excludes evidence reserved or committed by a punch', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
  };

  let capturedFilter = null;
  PrivateFile.find = (filter) => {
    capturedFilter = filter;
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => [],
    };
  };
  Attendance.exists = async () => null;

  try {
    await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: true,
    });

    assert.deepEqual(
      capturedFilter?.['attendanceLink.status'],
      { $nin: ['RESERVED', 'COMMITTED'] },
      'cleanup discovery must fail closed around in-flight and committed punch links'
    );
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
  }
});

test('RET-001B: cleanup claim repeats the punch-link exclusion atomically', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    findOneAndUpdate: PrivateFile.findOneAndUpdate,
  };

  installCandidateFind([
    {
      _id: 'PF-RACE-1',
      fileId: 'FILE-1999',
      organisationId: 'ORG-ZAMORIN',
      storagePath: 'attendance/file-1999.jpg',
      attendanceContext: {
        challengeId: 'CH-RACE-1',
        grantExpiresAt: new Date('2026-09-30T02:00:00Z'),
      },
    },
  ]);
  Attendance.exists = async () => null;

  let capturedClaimFilter = null;
  PrivateFile.findOneAndUpdate = async (filter) => {
    capturedClaimFilter = filter;
    return null;
  };

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: false,
    });

    assert.deepEqual(
      capturedClaimFilter?.['attendanceLink.status'],
      { $nin: ['RESERVED', 'COMMITTED'] },
      'cleanup claim must compete with punch reservation on the same PrivateFile row'
    );
    assert.equal(result.claimConflicts, 1);
    assert.equal(result.deleted, 0);
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    PrivateFile.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test('RET-002: dry-run protects linked evidence and reports only unlinked expired uploads', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    objectExists: attendanceEvidenceStorageService.objectExists,
    deleteObject: attendanceEvidenceStorageService.deleteObject,
  };

  const expired = new Date('2026-09-30T02:00:00Z');
  installCandidateFind([
    {
      _id: 'PF-1',
      fileId: 'FILE-1001',
      organisationId: 'ORG-ZAMORIN',
      storagePath: 'attendance/file-1001.jpg',
      attendanceContext: { challengeId: 'CH-1', grantExpiresAt: expired },
    },
    {
      _id: 'PF-2',
      fileId: 'FILE-1002',
      organisationId: 'ORG-ZAMORIN',
      storagePath: 'attendance/file-1002.jpg',
      attendanceContext: { challengeId: 'CH-2', grantExpiresAt: expired },
    },
  ]);

  Attendance.exists = async (query) =>
    JSON.stringify(query).includes('FILE-1002') ? { _id: 'AT-LINKED' } : null;

  let storageTouched = false;
  attendanceEvidenceStorageService.objectExists = async () => {
    storageTouched = true;
    return true;
  };
  attendanceEvidenceStorageService.deleteObject = async () => {
    storageTouched = true;
    return true;
  };

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: true,
    });

    assert.equal(result.policy.graceMinutes, DEFAULT_ORPHAN_GRACE_MINUTES);
    assert.equal(result.scanned, 2);
    assert.equal(result.linkedProtected, 1);
    assert.equal(result.eligibleOrphans, 1);
    assert.equal(result.deleted, 0);
    assert.equal(storageTouched, false, 'dry-run must not touch storage');
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    attendanceEvidenceStorageService.objectExists = originals.objectExists;
    attendanceEvidenceStorageService.deleteObject = originals.deleteObject;
  }
});

test('RET-003: execute deletes only claimed, unlinked orphan objects and metadata', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    findOneAndUpdate: PrivateFile.findOneAndUpdate,
    updateOne: PrivateFile.updateOne,
    deleteOne: PrivateFile.deleteOne,
    objectExists: attendanceEvidenceStorageService.objectExists,
    deleteObject: attendanceEvidenceStorageService.deleteObject,
  };

  const expired = new Date('2026-09-30T02:00:00Z');
  const candidates = [
    {
      _id: 'PF-3',
      fileId: 'FILE-1003',
      organisationId: 'ORG-ZAMORIN',
      storagePath: 'attendance/file-1003.jpg',
      attendanceContext: { challengeId: 'CH-3', grantExpiresAt: expired },
    },
    {
      _id: 'PF-4',
      fileId: 'FILE-1004',
      organisationId: 'ORG-ZAMORIN',
      storagePath: 'attendance/file-1004.jpg',
      attendanceContext: { challengeId: 'CH-4', grantExpiresAt: expired },
    },
  ];
  installCandidateFind(candidates);
  Attendance.exists = async () => null;

  PrivateFile.findOneAndUpdate = async (filter, update) => {
    const candidate = candidates.find((item) => String(item._id) === String(filter._id));
    return candidate
      ? {
          ...candidate,
          attendanceCleanup: {
            status: 'CLAIMED',
            claimId: update.$set['attendanceCleanup.claimId'],
          },
        }
      : null;
  };

  const updates = [];
  PrivateFile.updateOne = async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  };

  const deletedMetadata = [];
  PrivateFile.deleteOne = async (filter) => {
    deletedMetadata.push(filter);
    return { deletedCount: 1 };
  };

  const deletedStorage = [];
  attendanceEvidenceStorageService.objectExists = async ({ fileKey }) =>
    fileKey.includes('1003');
  attendanceEvidenceStorageService.deleteObject = async ({ fileKey }) => {
    deletedStorage.push(fileKey);
    return true;
  };

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: false,
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.eligibleOrphans, 2);
    assert.equal(result.deleted, 2);
    assert.equal(result.storageAlreadyMissing, 1);
    assert.deepEqual(deletedStorage, ['attendance/file-1003.jpg']);
    assert.equal(deletedMetadata.length, 2);
    assert.ok(
      updates.some((entry) => entry.update?.$set?.['attendanceCleanup.status'] === 'STORAGE_DELETED')
    );
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    PrivateFile.findOneAndUpdate = originals.findOneAndUpdate;
    PrivateFile.updateOne = originals.updateOne;
    PrivateFile.deleteOne = originals.deleteOne;
    attendanceEvidenceStorageService.objectExists = originals.objectExists;
    attendanceEvidenceStorageService.deleteObject = originals.deleteObject;
  }
});

test('RET-004: storage deletion failure retains metadata and records retryable FAILED state', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    findOneAndUpdate: PrivateFile.findOneAndUpdate,
    updateOne: PrivateFile.updateOne,
    deleteOne: PrivateFile.deleteOne,
    objectExists: attendanceEvidenceStorageService.objectExists,
    deleteObject: attendanceEvidenceStorageService.deleteObject,
  };

  const candidate = {
    _id: 'PF-5',
    fileId: 'FILE-1005',
    organisationId: 'ORG-ZAMORIN',
    storagePath: 'attendance/file-1005.jpg',
    attendanceContext: {
      challengeId: 'CH-5',
      grantExpiresAt: new Date('2026-09-30T02:00:00Z'),
    },
  };

  installCandidateFind([candidate]);
  Attendance.exists = async () => null;
  PrivateFile.findOneAndUpdate = async (filter, update) => ({
    ...candidate,
    attendanceCleanup: {
      status: 'CLAIMED',
      claimId: update.$set['attendanceCleanup.claimId'],
    },
  });

  const updates = [];
  PrivateFile.updateOne = async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  };

  let metadataDeleteCalled = false;
  PrivateFile.deleteOne = async () => {
    metadataDeleteCalled = true;
    return { deletedCount: 1 };
  };

  attendanceEvidenceStorageService.objectExists = async () => true;
  attendanceEvidenceStorageService.deleteObject = async () => false;

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: false,
    });

    assert.equal(result.deleted, 0);
    assert.equal(result.failed, 1);
    assert.equal(metadataDeleteCalled, false);
    assert.ok(
      updates.some((entry) => entry.update?.$set?.['attendanceCleanup.status'] === 'FAILED')
    );
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    PrivateFile.findOneAndUpdate = originals.findOneAndUpdate;
    PrivateFile.updateOne = originals.updateOne;
    PrivateFile.deleteOne = originals.deleteOne;
    attendanceEvidenceStorageService.objectExists = originals.objectExists;
    attendanceEvidenceStorageService.deleteObject = originals.deleteObject;
  }
});


test('RET-005: orphan claim filter excludes punch-reserved and committed selfie evidence', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    findOneAndUpdate: PrivateFile.findOneAndUpdate,
  };

  let candidateFilter = null;
  let claimFilter = null;
  const candidate = {
    _id: 'PF-6',
    fileId: 'FILE-1006',
    organisationId: 'ORG-ZAMORIN',
    storagePath: 'attendance/file-1006.jpg',
    attendanceContext: {
      challengeId: 'CH-6',
      grantExpiresAt: new Date('2026-09-30T02:00:00Z'),
    },
  };

  PrivateFile.find = (filter) => {
    candidateFilter = filter;
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => [candidate],
    };
  };
  Attendance.exists = async () => null;
  PrivateFile.findOneAndUpdate = async (filter) => {
    claimFilter = filter;
    return null;
  };

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: false,
    });

    assert.deepEqual(
      candidateFilter?.['attendanceLink.status']?.$nin,
      ['RESERVED', 'COMMITTED']
    );
    assert.deepEqual(
      claimFilter?.['attendanceLink.status']?.$nin,
      ['RESERVED', 'COMMITTED']
    );
    assert.equal(result.claimConflicts, 1);
    assert.equal(result.deleted, 0);
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    PrivateFile.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test('RET-006: punch controller acquires selfie linkage reservation before attendance persistence', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/modules/attendance/attendanceController.js'),
    'utf8'
  );

  const checkInReserve = controllerSource.indexOf(
    'const checkInEvidenceReservation = await reserveAttendanceEvidenceLink'
  );
  const checkInSave = controllerSource.indexOf(
    'await attendance.save();',
    checkInReserve
  );
  const checkOutReserve = controllerSource.indexOf(
    'const checkOutEvidenceReservation = await reserveAttendanceEvidenceLink'
  );
  const checkOutSave = controllerSource.indexOf(
    'await attendance.save();',
    checkOutReserve
  );

  assert.ok(checkInReserve >= 0 && checkInSave > checkInReserve);
  assert.ok(checkOutReserve >= 0 && checkOutSave > checkOutReserve);
  assert.match(
    controllerSource,
    /'attendanceLink\.status': \{ \$nin: \['RESERVED', 'COMMITTED'\] \}/
  );
  assert.match(
    controllerSource,
    /'attendanceCleanup\.status': \{ \$ne: 'CLAIMED' \}/
  );
});


test('RET-007: stale reserved evidence is promoted only when Attendance already links it', async () => {
  const originals = {
    find: PrivateFile.find,
    exists: Attendance.exists,
    updateOne: PrivateFile.updateOne,
    objectExists: attendanceEvidenceStorageService.objectExists,
    deleteObject: attendanceEvidenceStorageService.deleteObject,
  };

  const staleReservations = [
    {
      _id: 'PF-7',
      fileId: 'FILE-1007',
      organisationId: 'ORG-ZAMORIN',
      attendanceContext: {
        challengeId: 'CH-7',
        grantExpiresAt: new Date('2026-09-30T02:00:00Z'),
      },
      attendanceLink: {
        status: 'RESERVED',
        claimId: 'CLAIM-LINKED',
        reservedAt: new Date('2026-09-30T02:30:00Z'),
        attendanceId: 'AT-20260930-007',
        punchType: 'CHECK_IN',
      },
    },
    {
      _id: 'PF-8',
      fileId: 'FILE-1008',
      organisationId: 'ORG-ZAMORIN',
      attendanceContext: {
        challengeId: 'CH-8',
        grantExpiresAt: new Date('2026-09-30T02:00:00Z'),
      },
      attendanceLink: {
        status: 'RESERVED',
        claimId: 'CLAIM-UNLINKED',
        reservedAt: new Date('2026-09-30T02:30:00Z'),
        attendanceId: 'AT-20260930-008',
        punchType: 'CHECK_OUT',
      },
    },
  ];

  PrivateFile.find = (filter) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () =>
      filter?.['attendanceLink.status'] === 'RESERVED'
        ? staleReservations
        : [],
  });

  Attendance.exists = async (query) => {
    const json = JSON.stringify(query);
    return (
      json.includes('FILE-1007') &&
      json.includes('AT-20260930-007') &&
      json.includes('CHECK_IN')
    )
      ? { _id: 'AT-LINKED-1007' }
      : null;
  };

  const updates = [];
  PrivateFile.updateOne = async (filter, update) => {
    updates.push({ filter, update });
    return { matchedCount: 1, modifiedCount: 1 };
  };

  let storageTouched = false;
  attendanceEvidenceStorageService.objectExists = async () => {
    storageTouched = true;
    return true;
  };
  attendanceEvidenceStorageService.deleteObject = async () => {
    storageTouched = true;
    return true;
  };

  try {
    const result = await reconcileExpiredOrphanAttendanceEvidence({
      organisationId: 'ORG-ZAMORIN',
      actorUserId: 'MU-PRIMARY-01',
      now: new Date('2026-09-30T04:00:00Z'),
      dryRun: false,
    });

    assert.equal(result.staleReservationsScanned, 2);
    assert.equal(result.staleReservationsLinked, 1);
    assert.equal(result.staleReservationsCommitted, 1);
    assert.equal(result.staleReservationsQuarantined, 1);
    assert.equal(result.staleReservationConflicts, 0);
    assert.equal(result.scanned, 0);
    assert.equal(result.deleted, 0);
    assert.equal(storageTouched, false);

    assert.equal(updates.length, 1, 'unlinked stale reservation must not be mutated');
    assert.equal(updates[0].filter._id, 'PF-7');
    assert.equal(updates[0].filter['attendanceLink.claimId'], 'CLAIM-LINKED');
    assert.equal(updates[0].update.$set['attendanceLink.status'], 'COMMITTED');
  } finally {
    PrivateFile.find = originals.find;
    Attendance.exists = originals.exists;
    PrivateFile.updateOne = originals.updateOne;
    attendanceEvidenceStorageService.objectExists = originals.objectExists;
    attendanceEvidenceStorageService.deleteObject = originals.deleteObject;
  }
});

test('RET-008: stale reservation proof is bound to exact attendance ID and punch transition', () => {
  const checkIn = buildReservationAttendanceReferenceQuery({
    organisationId: 'ORG-ZAMORIN',
    fileId: 'FILE-2001',
    attendanceId: 'AT-20260930-201',
    punchType: 'CHECK_IN',
  });
  const checkOut = buildReservationAttendanceReferenceQuery({
    organisationId: 'ORG-ZAMORIN',
    fileId: 'FILE-2002',
    attendanceId: 'AT-20260930-202',
    punchType: 'CHECK_OUT',
  });

  assert.equal(checkIn.attendanceId, 'AT-20260930-201');
  assert.equal(checkOut.attendanceId, 'AT-20260930-202');

  const checkInJson = JSON.stringify(checkIn);
  const checkOutJson = JSON.stringify(checkOut);

  assert.ok(checkInJson.includes('attendanceEvidence.checkIn'));
  assert.ok(checkInJson.includes('CHECK_IN'));
  assert.equal(checkInJson.includes('attendanceEvidence.checkOut'), false);

  assert.ok(checkOutJson.includes('attendanceEvidence.checkOut'));
  assert.ok(checkOutJson.includes('CHECK_OUT'));
  assert.equal(checkOutJson.includes('attendanceEvidence.checkIn'), false);

  assert.equal(
    buildReservationAttendanceReferenceQuery({
      organisationId: 'ORG-ZAMORIN',
      fileId: 'FILE-2003',
      attendanceId: '',
      punchType: 'CHECK_IN',
    }),
    null
  );
});

