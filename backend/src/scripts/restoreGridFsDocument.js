'use strict';

/**
 * ZAMORIN CAFÉ ERP — GRIDFS DOCUMENT RESTORATION UTILITY (EXT-04)
 *
 * Command-line utility for verifying and executing document-level recovery:
 *   node src/scripts/restoreGridFsDocument.js --source-db=zamorin_recovery --document-id=DOC-001 --mode=VERIFY_ONLY
 *
 * Invariants:
 * - Defaults strictly to VERIFY_ONLY (dry-run).
 * - Masks credentials in connection strings before writing to stdout.
 * - Refuses production targets unless explicit confirmation flags provided.
 * - Zero Markdown reports generated.
 */

const mongoose = require('mongoose');
const { DocumentRestoreService, RESTORE_MODES } = require('../services/documentRestoreService');
const { BackupRestoreVerificationService } = require('../services/backupRestoreVerificationService');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      const val = parts.length > 1 ? parts.slice(1).join('=') : true;
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const sourceUri = args['source-uri'] || process.env.RESTORE_SOURCE_MONGODB_URI || process.env.MONGODB_URI;
  const sourceDbName = args['source-db'] || process.env.RESTORE_SOURCE_DB || 'zamorin_restore_verification';

  const targetUri = args['target-uri'] || process.env.RESTORE_TARGET_MONGODB_URI || process.env.MONGODB_URI;
  const targetDbName = args['target-db'] || process.env.RESTORE_TARGET_DB || 'zamorin_dev';

  const documentId = args['document-id'] || process.env.RESTORE_DOCUMENT_ID;
  const revision = args.revision !== undefined ? parseInt(args.revision, 10) : (process.env.RESTORE_REVISION ? parseInt(process.env.RESTORE_REVISION, 10) : null);
  const mode = (args.mode || process.env.DOCUMENT_RESTORE_MODE || RESTORE_MODES.VERIFY_ONLY).toUpperCase();
  const reason = args.reason || 'HISTORICAL_REVISION_RECOVERY';
  const productionApproval = args['production-approval'] || process.env.DOCUMENT_RESTORE_PRODUCTION_APPROVAL || null;

  console.log('====================================================');
  console.log('ZAMORIN CAFÉ ERP — GRIDFS DOCUMENT RESTORATION TOOL');
  console.log('====================================================');
  console.log(`Source Cluster:  ${BackupRestoreVerificationService.maskConnectionString(sourceUri)}`);
  console.log(`Source Database: ${sourceDbName}`);
  console.log(`Target Cluster:  ${BackupRestoreVerificationService.maskConnectionString(targetUri)}`);
  console.log(`Target Database: ${targetDbName}`);
  console.log(`Document ID:     ${documentId || '[NOT_SPECIFIED]'}`);
  console.log(`Revision:        ${revision !== null ? revision : '[LATEST]'}`);
  console.log(`Execution Mode:  ${mode}`);
  console.log('----------------------------------------------------');

  if (!documentId) {
    console.error('ERROR: --document-id is required for document restoration.');
    process.exit(1);
  }

  if (!sourceUri) {
    console.error('ERROR: Source MongoDB URI is required.');
    process.exit(1);
  }

  let sourceConn = null;
  let targetConn = null;

  try {
    sourceConn = await mongoose.createConnection(sourceUri, {
      dbName: sourceDbName,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();

    let targetDb = null;
    if (mode === RESTORE_MODES.RECOVERY_COPY) {
      targetConn = await mongoose.createConnection(targetUri, {
        dbName: targetDbName,
        serverSelectionTimeoutMS: 5000,
      }).asPromise();
      targetDb = targetConn.db;
    }

    const result = await DocumentRestoreService.restoreDocumentRevision({
      sourceDb: sourceConn.db,
      targetDb,
      documentId,
      revisionNumber: revision,
      mode,
      options: {
        targetUri,
        reason,
        productionApproval,
      },
      user: { role: 'PRIMARY_MASTER', id: 'PRIMARY_MASTER_CLI' },
    });

    console.log('====================================================');
    console.log(`RESTORATION STATUS: ${result.status}`);
    console.log(`Execution Mode:     ${result.mode}`);
    console.log(`Document ID:        ${result.documentId || documentId}`);
    if (result.mode === RESTORE_MODES.RECOVERY_COPY) {
      console.log(`Restored Revision:  V${result.newRevision}`);
      console.log(`Source Revision:    V${result.sourceRevision}`);
      console.log(`New GridFS File ID: ${result.newGridFsFileId}`);
      console.log(`Restored SHA-256:   ${result.sha256}`);
      console.log(`Scan Status:        ${result.scanStatus} (Quarantined)`);
      console.log(`Total Duration:     ${result.performance ? result.performance.totalDurationMs : 0} ms`);
    } else {
      console.log(`Verified SHA-256:   ${result.verification.sha256}`);
      console.log(`File Size Bytes:    ${result.verification.sizeBytes}`);
      console.log(`Verified Chunks:    ${result.verification.chunkCount}`);
      console.log(`Writes Performed:   0`);
      console.log(`Verification Time:  ${result.verification.verifyDurationMs} ms`);
    }
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error(`RESTORATION FAILED [${err.code || 'ERROR'}]: ${err.message}`);
    process.exit(err.statusCode === 403 ? 3 : err.statusCode === 404 ? 4 : 2);
  } finally {
    if (sourceConn) await sourceConn.close().catch(() => {});
    if (targetConn) await targetConn.close().catch(() => {});
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs };
