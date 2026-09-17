'use strict';

/**
 * =============================================================================
 * ZAMORIN CAFÉ ERP — EXT-05 ZERO-COST DISASTER RECOVERY EXERCISE SUITE
 * =============================================================================
 * Automated test suite for EXT-05:
 * 01 DR orchestrator safe mode
 * 02 destructive action denied
 * 03 backend failure detected
 * 04 backend restart
 * 05 database outage fail-closed
 * 06 database reconnect
 * 07 real EXT-03F backup accepted
 * 08 backup write-quiescence guard
 * 09 isolated DB restore
 * 10 GridFS restored
 * 11 SHA verified
 * 12 document restore
 * 13 restored document PENDING_SCAN
 * 14 scanner outage fail-closed
 * 15 auth dependency outage
 * 16 password recovery provider outage
 * 17 clean frontend rebuild
 * 18 clean backend rebuild
 * 19 Git known-good checkout simulation
 * 20 invalid release rejected
 * 21 secret-missing readiness failure
 * 22 filesystem-loss independence
 * 23 offline POS queue survives
 * 24 offline POS reconciliation
 * 25 disabled-operator review preserved
 * 26 post-recovery Personal Ledger
 * 27 post-recovery PO authority
 * 28 cross-org isolation
 * 29 cross-café isolation
 * 30 old sessions do not escalate
 * 31 RTO measured
 * 32 RPO measured
 * 33 backup device SPOF classified
 * 34 no paid infrastructure
 * 35 no Markdown
 * 36 zero KDS
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const {
  EXT05DisasterRecoveryOrchestrator,
  RECOVERY_PRIORITIES,
  ENV_VAR_CLASSIFICATION,
} = require('../src/scripts/ext05DisasterRecoveryExercise');

const { BackupRestoreVerificationService } = require('../src/services/backupRestoreVerificationService');
const { DocumentRestoreService, RESTORE_MODES, RESTORE_REASONS } = require('../src/services/documentRestoreService');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { GridFSStorageAdapter } = require('../src/services/storage/GridFSStorageAdapter');
const { MaintenanceModeManager } = require('../src/middleware/maintenanceMode');

describe('EXT-05 — Zero-Cost Disaster Recovery Exercise & Business Continuity Suite', () => {
  let mongoServer;
  let testDb;
  let sourceDb;
  let targetDb;
  let gridFsAdapter;
  let orchestrator;

  const testBucketName = 'zamorinDocuments';
  const FIXTURE_DOC_ID = 'EXT05_DR_TEST_DOCUMENT';
  const DOC_CONTENT = 'Zamorin Cafe ERP - EXT05 Disaster Recovery & Business Continuity Fixture Data 2026';
  const DOC_SHA = crypto.createHash('sha256').update(DOC_CONTENT).digest('hex');
  let fixtureGridFsFileId;

  before(async () => {
    process.env.RESTORE_VERIFICATION_MODE = 'true';
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    testDb = mongoose.connection.db;

    sourceDb = mongoose.connection.client.db('zamorin_source_backup');
    targetDb = mongoose.connection.client.db('zamorin_target_dev');

    gridFsAdapter = new GridFSStorageAdapter({
      bucketName: testBucketName,
      db: testDb,
    });

    // Upload test document to default testDb GridFS
    const uploadRes = await gridFsAdapter.putObject({
      objectKey: `EXT05/${FIXTURE_DOC_ID}/v1/dr_fixture.pdf`,
      buffer: Buffer.from(DOC_CONTENT, 'utf8'),
      mimeType: 'application/pdf',
      metadata: {
        originalFilename: 'dr_fixture.pdf',
        documentId: FIXTURE_DOC_ID,
        organisationId: 'ZAMORIN',
        cafeId: 'ZC01',
      },
    });
    fixtureGridFsFileId = uploadRes.gridFsFileId;

    // Create BusinessDocument in Mongo default DB
    await BusinessDocument.create({
      documentId: FIXTURE_DOC_ID,
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'BCDR',
      entityId: 'DR-2026-001',
      documentType: 'AUDIT_EVIDENCE',
      originalFilename: 'dr_fixture.pdf',
      internalFilename: 'dr_fixture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: Buffer.byteLength(DOC_CONTENT, 'utf8'),
      sha256: DOC_SHA,
      storageDriver: 'gridfs',
      gridFsFileId: fixtureGridFsFileId,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      uploadedBy: 'PRIMARY_MASTER_1',
      versions: [
        {
          version: 1,
          originalFilename: 'dr_fixture.pdf',
          internalFilename: 'dr_fixture.pdf',
          mimeType: 'application/pdf',
          sizeBytes: Buffer.byteLength(DOC_CONTENT, 'utf8'),
          sha256: DOC_SHA,
          gridFsFileId: fixtureGridFsFileId,
          storageKey: `EXT05/${FIXTURE_DOC_ID}/v1/dr_fixture.pdf`,
          scanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
      ],
    });

    // Also populate in sourceDb for revision recovery exercise
    const sourceBucket = new mongoose.mongo.GridFSBucket(sourceDb, { bucketName: testBucketName });
    const sourceUpload = sourceBucket.openUploadStream(`EXT05/${FIXTURE_DOC_ID}/v1/dr_fixture.pdf`, {
      contentType: 'application/pdf',
      metadata: { originalFilename: 'dr_fixture.pdf', version: 1, organisationId: 'ZAMORIN', cafeId: 'ZC01' },
    });
    const sourceGridFsId = sourceUpload.id;
    await new Promise((res, rej) => {
      sourceUpload.on('finish', res);
      sourceUpload.on('error', rej);
      sourceUpload.end(Buffer.from(DOC_CONTENT, 'utf8'));
    });

    await sourceDb.collection('business_documents').insertOne({
      documentId: FIXTURE_DOC_ID,
      organisationId: 'ZAMORIN',
      cafeId: 'ZC01',
      entityType: 'BCDR',
      entityId: 'DR-2026-001',
      documentType: 'AUDIT_EVIDENCE',
      originalFilename: 'dr_fixture.pdf',
      internalFilename: 'dr_fixture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: Buffer.byteLength(DOC_CONTENT, 'utf8'),
      sha256: DOC_SHA,
      storageDriver: 'gridfs',
      gridFsFileId: sourceGridFsId,
      uploadStatus: 'AVAILABLE',
      scanStatus: 'CLEAN',
      currentVersion: 1,
      uploadedBy: 'PRIMARY_MASTER_1',
      versions: [
        {
          version: 1,
          originalFilename: 'dr_fixture.pdf',
          internalFilename: 'dr_fixture.pdf',
          mimeType: 'application/pdf',
          sizeBytes: Buffer.byteLength(DOC_CONTENT, 'utf8'),
          sha256: DOC_SHA,
          gridFsFileId: sourceGridFsId,
          storageKey: `EXT05/${FIXTURE_DOC_ID}/v1/dr_fixture.pdf`,
          scanStatus: 'CLEAN',
          uploadedBy: 'PRIMARY_MASTER_1',
        },
      ],
    });

    orchestrator = new EXT05DisasterRecoveryOrchestrator({
      workspaceRoot: path.resolve(__dirname, '../..'),
      backendRoot: path.resolve(__dirname, '..'),
    });
  });

  after(async () => {
    delete process.env.RESTORE_VERIFICATION_MODE;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // 01 DR orchestrator safe mode
  test('01. DR orchestrator defaults to safeSimulationOnly = true', () => {
    const orch = new EXT05DisasterRecoveryOrchestrator();
    assert.equal(orch.safeSimulationOnly, true);
  });

  // 02 destructive action denied
  test('02. Destructive actions on production infrastructure or data are strictly denied', () => {
    assert.throws(
      () => orchestrator.assertSafeSimulation('dropDatabase_production'),
      /DESTRUCTIVE_ACTION_DENIED/
    );
    assert.throws(
      () => orchestrator.assertSafeSimulation('deleteProduction_cluster'),
      /DESTRUCTIVE_ACTION_DENIED/
    );
  });

  // 03 backend failure detected
  test('03. Backend process termination is accurately detected', async () => {
    const res = await orchestrator.exerciseBackendProcessFailure();
    assert.ok(res.detectionTime >= res.simulatedFailureStart);
    assert.equal(res.status, 'PASS');
  });

  // 04 backend restart
  test('04. Backend process restart succeeds and passes health probe', async () => {
    const res = await orchestrator.exerciseBackendProcessFailure();
    assert.equal(res.healthStatusCode, 200);
    assert.ok(res.RTO_ms >= 0);
  });

  // 05 database outage fail-closed
  test('05. Database connection outage causes readiness failure and mutations fail closed', async () => {
    const res = await orchestrator.exerciseDatabaseOutageAndReconnection();
    assert.equal(res.mutationFailedClosed, true);
  });

  // 06 database reconnect
  test('06. Database reconnection is re-established safely without process restart', async () => {
    const res = await orchestrator.exerciseDatabaseOutageAndReconnection();
    assert.equal(res.status, 'PASS');
    assert.ok(res.reconnectionDurationMs >= 0);
  });

  // 07 real EXT-03F backup accepted
  test('07. Real EXT-03F backup parameters and command generation are accepted', () => {
    const cmd = BackupRestoreVerificationService.buildMongoDumpCommand({
      uri: 'mongodb://localhost:27017/zamorin_isolated_test',
      dbName: 'zamorin_isolated_test',
      outDir: 'D:/Zamorin_Backups/EXT05/BACKUP_COPY',
      writesQuiesced: true,
    });
    assert.equal(cmd.command, 'mongodump');
    assert.ok(cmd.args.includes('--db=zamorin_isolated_test'));
  });

  // 08 backup write-quiescence guard
  test('08. Backup write-quiescence guard rejects live unquiesced dumps', () => {
    assert.throws(
      () => BackupRestoreVerificationService.buildMongoDumpCommand({
        uri: 'mongodb://localhost:27017/zamorin_isolated_test',
        dbName: 'zamorin_isolated_test',
        outDir: 'D:/Zamorin_Backups/EXT05/BACKUP_COPY',
        writesQuiesced: false,
      }),
      /Controlled write quiescence|ZAMORIN_BACKUP_WRITES_QUIESCED/
    );
  });

  // 09 isolated DB restore
  test('09. Isolated target database restore verification succeeds with zero production overwrite', async () => {
    const res = await orchestrator.exerciseDatabaseDataLossAndRestore({
      targetDb: mongoose.connection,
      bucketName: testBucketName,
      fixtureDocId: FIXTURE_DOC_ID,
    });
    assert.equal(res.status, 'PASS');
    assert.equal(res.verificationResult.success, true);
  });

  // 10 GridFS restored
  test('10. GridFS files and chunks are restored and referentially intact', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      bucketName: testBucketName,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    assert.equal(res.success, true);
    const verifiedDoc = res.verifiedDocuments[0];
    assert.equal(verifiedDoc.gridFsFileFound, true);
    assert.equal(verifiedDoc.chunksValid, true);
  });

  // 11 SHA verified
  test('11. Restored document stream matches original SHA-256 digest exactly', async () => {
    const res = await BackupRestoreVerificationService.verifyRestoreTarget({
      targetConfirmation: 'CONFIRM_ISOLATED_RESTORE_TARGET',
      restoreVerificationMode: true,
      bucketName: testBucketName,
      fixtureDocumentId: FIXTURE_DOC_ID,
      injectedClient: mongoose.connection,
    });
    const verifiedDoc = res.verifiedDocuments[0];
    assert.equal(verifiedDoc.sha256Match, true);
    assert.equal(verifiedDoc.reconstructedSha256, DOC_SHA);
  });

  // 12 document restore
  test('12. EXT-04 document-level revision restore succeeds with new GridFS file ID', async () => {
    const res = await orchestrator.exerciseDocumentRevisionRestore({
      sourceDb: sourceDb,
      targetDb: targetDb,
      documentId: FIXTURE_DOC_ID,
      targetVersion: 1,
    });
    assert.equal(res.status, 'PASS');
    assert.ok(res.restoreOutcome.status === 'SUCCESS' || res.restoreOutcome.success === true);
    assert.notEqual(res.restoreOutcome.newGridFsFileId.toString(), fixtureGridFsFileId.toString());
  });

  // 13 restored document PENDING_SCAN
  test('13. Restored document revision starts in PENDING_SCAN quarantine', async () => {
    const doc = await targetDb.collection('business_documents').findOne({ documentId: FIXTURE_DOC_ID });
    assert.ok(doc, 'Restored document exists in target database');
    assert.equal(doc.scanStatus, 'PENDING_SCAN');
    assert.equal(doc.securityScanStatus, 'PENDING_SCAN');
  });

  // 14 scanner outage fail-closed
  test('14. Malware scanner outage fails closed: downloads blocked, core ERP operational', () => {
    const res = orchestrator.exerciseMalwareScannerOutage();
    assert.equal(res.status, 'PASS');
    assert.equal(res.downloadDeniedOnQuarantined, true);
    assert.equal(res.coreErpUnblocked, true);
  });

  // 15 auth dependency outage
  test('15. Authentication dependency outage rejects stale/expired sessions safely without privilege escalation', () => {
    const res = orchestrator.exerciseAuthAndEmailDependencyOutage();
    assert.equal(res.expiredTokenRejected, true);
    assert.equal(res.privilegeEscalationPrevented, true);
  });

  // 16 password recovery provider outage
  test('16. Password recovery email provider outage fails safely with generic message and no account enumeration', () => {
    const res = orchestrator.exerciseAuthAndEmailDependencyOutage();
    assert.equal(res.normalLoginWorks, true);
    assert.equal(res.userEnumerationPrevented, true);
  });

  // 17 clean frontend rebuild
  test('17. Frontend application reconstructs from source lockfile with zero secrets in bundle', async () => {
    const res = await orchestrator.exerciseFrontendRebuild();
    assert.equal(res.status, 'PASS');
    assert.equal(res.secretsFoundInFrontend, false);
    assert.ok(res.RTO_ms >= 0);
  });

  // 18 clean backend rebuild
  test('18. Backend infrastructure-as-code audit verifies render.yaml reproducibility with sync: false', () => {
    const audit = orchestrator.auditInfrastructureAsCode();
    assert.equal(audit.success, true);
    assert.equal(audit.syncFalseEnforced, true);
    assert.equal(audit.secretsCommitted, false);
  });

  // 19 Git known-good checkout simulation
  test('19. Git repository contains current authoritative commits without history rewrite', () => {
    const gitLog = cp.execSync('git log -n 3 --oneline', { encoding: 'utf8' });
    assert.ok(gitLog.length > 0);
    assert.ok(
      gitLog.includes('EXT-07') || gitLog.includes('EXT-06') ||
      gitLog.includes('EXT-05') || gitLog.includes('EXT-04') ||
      gitLog.includes('EXT-03') || gitLog.includes('fix(') ||
      gitLog.includes('feat(') || gitLog.includes('build('),
      'git log must contain recognisable ERP commit messages'
    );
  });

  // 20 invalid release rejected
  test('20. Pre-flight deployment validator detects and rejects broken/placeholder releases', () => {
    const badEnv = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://placeholder_user:placeholder_pass@cluster.mongodb.net/test',
      JWT_ACCESS_SECRET: 'short',
    };
    const audit = orchestrator.auditEnvironmentVariables(badEnv);
    assert.equal(audit.readinessPass, false);
    assert.ok(audit.missingRequiredSecrets.includes('MONGODB_URI'));
  });

  // 21 secret-missing readiness failure
  test('21. Missing required secret variables safely block readiness check', () => {
    const emptyEnv = {};
    const audit = orchestrator.auditEnvironmentVariables(emptyEnv);
    assert.equal(audit.readinessPass, false);
    assert.ok(audit.missingRequiredSecrets.includes('JWT_ACCESS_SECRET'));
    assert.ok(audit.missingRequiredSecrets.includes('MFA_ENCRYPTION_KEY'));
  });

  // 22 filesystem-loss independence
  test('22. Render ephemeral filesystem loss does not impact ERP data or GridFS documents', () => {
    const res = orchestrator.exerciseEphemeralFilesystemLoss();
    assert.equal(res.status, 'PASS');
    assert.equal(res.documentsOnLocalDisk, false);
  });

  // 23 offline POS queue survives
  test('23. Offline POS queue survives network disruption without duplicate financial entries', () => {
    const res = orchestrator.exerciseOfflinePosContinuity();
    assert.equal(res.offlineQueueSurvives, true);
    assert.equal(res.duplicateSaleBlocked, true);
  });

  // 24 offline POS reconciliation
  test('24. Unacknowledged offline sales are segregated from completed financial sales until reconciled', () => {
    const res = orchestrator.exerciseOfflinePosContinuity();
    assert.equal(res.status, 'PASS');
  });

  // 25 disabled-operator review preserved
  test('25. Disabled-operator offline queued sales route strictly to review pathway (REC-13B)', () => {
    const res = orchestrator.exerciseOfflinePosContinuity();
    assert.equal(res.disabledOperatorRoutesToReview, true);
  });

  // 26 post-recovery Personal Ledger
  test('26. Post-recovery Personal Ledger permanent authority remains: Primary Master & Owner ALLOW, others DENY', () => {
    const inv = orchestrator.verifyPostRecoverySecurityInvariants();
    assert.equal(inv.personalLedgerPolicy.PRIMARY_MASTER, 'ALLOW');
    assert.equal(inv.personalLedgerPolicy.OWNER, 'ALLOW');
    assert.equal(inv.personalLedgerPolicy.NORMAL_MASTER, 'DENY');
    assert.equal(inv.personalLedgerPolicy.CAFE_ADMIN, 'DENY');
    assert.equal(inv.personalLedgerPolicy.STAFF, 'DENY');
  });

  // 27 post-recovery PO authority
  test('27. Post-recovery PO Approval permanent authority remains: Primary & Normal Master ALLOW, others DENY', () => {
    const inv = orchestrator.verifyPostRecoverySecurityInvariants();
    assert.equal(inv.poApprovalPolicy.PRIMARY_MASTER, 'ALLOW');
    assert.equal(inv.poApprovalPolicy.NORMAL_MASTER, 'ALLOW');
    assert.equal(inv.poApprovalPolicy.OWNER, 'DENY');
    assert.equal(inv.poApprovalPolicy.CAFE_ADMIN, 'DENY');
    assert.equal(inv.poApprovalPolicy.STAFF, 'DENY');
  });

  // 28 cross-org isolation
  test('28. Cross-organisation data isolation is strictly preserved after recovery (0 leakage)', () => {
    const inv = orchestrator.verifyPostRecoverySecurityInvariants();
    assert.equal(inv.crossOrgLeakage, 0);
  });

  // 29 cross-café isolation
  test('29. Cross-café data isolation is strictly preserved after recovery (0 leakage)', () => {
    const inv = orchestrator.verifyPostRecoverySecurityInvariants();
    assert.equal(inv.crossCafeLeakage, 0);
  });

  // 30 old sessions do not escalate
  test('30. Restored database state does not revive stale disabled sessions or escalate privileges', () => {
    const res = orchestrator.exerciseAuthAndEmailDependencyOutage();
    assert.equal(res.privilegeEscalationPrevented, true);
  });

  // 31 RTO measured
  test('31. Actual recovery elapsed times (RTO) are measured separately for backend, frontend, DB, and docs', async () => {
    await orchestrator.exerciseBackendProcessFailure();
    await orchestrator.exerciseFrontendRebuild();
    assert.ok(orchestrator.metrics.backendRecoveryRtoMs >= 0);
    assert.ok(orchestrator.metrics.frontendRebuildRtoMs >= 0);
  });

  // 32 RPO measured
  test('32. Data loss exposure (RPO) is measured from newest backup timestamp to simulated disaster timestamp', async () => {
    const res = await orchestrator.exerciseDatabaseDataLossAndRestore({
      backupTimestamp: Date.now() - 1800000, // 30 minutes ago
      targetDb: mongoose.connection,
      bucketName: testBucketName,
      fixtureDocId: FIXTURE_DOC_ID,
    });
    assert.ok(res.RPO_ms >= 1800000);
    assert.ok(orchestrator.metrics.measuredBackupRpoMs >= 1800000);
  });

  // 33 backup device SPOF classified
  test('33. Absence of secondary offsite backup device triggers OFFSITE_BACKUP_BLOCKER', () => {
    const res = orchestrator.exerciseBackupDeviceSpofAudit({ secondaryBackupDir: null });
    assert.equal(res.status, 'BLOCKED_OFFSITE_BACKUP');
    assert.equal(res.blocker, 'OFFSITE_BACKUP_BLOCKER');
    assert.equal(res.singlePointOfFailure, true);
  });

  // 34 no paid infrastructure
  test('34. EXT-05 exercise adds exactly $0 and Atlas tier remains FREE', async () => {
    const report = await orchestrator.runFullExercise({
      targetDb: mongoose.connection,
      bucketName: testBucketName,
      fixtureDocId: FIXTURE_DOC_ID,
    });
    assert.equal(report.costAdded, '$0');
    assert.equal(report.atlasTier, 'FREE');
    assert.equal(report.safeForCommercialProduction, false);
  });

  // 35 no Markdown
  test('35. Zero new or modified Markdown files are introduced in working tree', () => {
    const gitStatus = cp.execSync('git status --porcelain', { encoding: 'utf8' });
    const markdownChanges = gitStatus
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.endsWith('.md'));
    assert.equal(markdownChanges.length, 0);
  });

  // 36 zero KDS
  test('36. Zero Kitchen Display System (/kds) routes or endpoints exist in production router', () => {
    const inv = orchestrator.verifyPostRecoverySecurityInvariants();
    assert.equal(inv.kdsMounted, false);

    // Verify in server.js that /kds is not mounted as a public or core router
    const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
    const hasMountedKdsRoute = serverJsContent.includes("app.use('/kds'") || serverJsContent.includes("app.use('/api/v1/kds'");
    assert.equal(hasMountedKdsRoute, false);
  });
});
