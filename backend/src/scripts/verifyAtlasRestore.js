#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { BackupRestoreVerificationService } = require('../services/backupRestoreVerificationService');

async function main() {
  const uri = process.env.RESTORE_MONGODB_URI;
  const dbName = process.env.RESTORE_DB_NAME || 'zamorin_restore_verification';
  const confirmation = process.env.RESTORE_TARGET_CONFIRMATION;
  const mode = process.env.RESTORE_VERIFICATION_MODE;
  const fixtureId = process.env.FIXTURE_DOCUMENT_ID || null;
  const bucketName = process.env.GRIDFS_BUCKET_NAME || 'zamorinDocuments';

  console.log('====================================================');
  console.log('ZAMORIN CAFÉ ERP — ATLAS RESTORE VERIFICATION RUNNER');
  console.log('====================================================');
  console.log(`Target Database: ${dbName}`);
  console.log(`Target URI:      ${BackupRestoreVerificationService.maskConnectionString(uri || '[NOT SUPPLIED]')}`);
  console.log(`Target Guard:    ${confirmation || '[NOT CONFIRMED]'}`);
  console.log(`Verification:    ${mode === 'true' ? 'ACTIVE (READ-ONLY)' : 'DISABLED'}`);
  console.log(`GridFS Bucket:   ${bucketName}`);
  console.log('----------------------------------------------------');

  if (!uri) {
    console.error('ERROR: RESTORE_MONGODB_URI environment variable is required.');
    console.error('Usage: RESTORE_VERIFICATION_MODE=true RESTORE_TARGET_CONFIRMATION=CONFIRM_ISOLATED_RESTORE_TARGET RESTORE_MONGODB_URI="mongodb+srv://..." node src/scripts/verifyAtlasRestore.js');
    process.exit(1);
  }

  try {
    const result = await BackupRestoreVerificationService.verifyRestoreTarget({
      uri,
      dbName,
      targetConfirmation: confirmation,
      restoreVerificationMode: mode === 'true',
      fixtureDocumentId: fixtureId,
      bucketName,
    });

    console.log(`Status:               ${result.status}`);
    console.log(`Duration:             ${result.durationMs} ms`);
    console.log(`Read-Only Enforced:   ${result.readOnlyEnforced ? 'YES' : 'NO'}`);
    console.log(`Total BusinessDocs:   ${result.metrics?.totalBusinessDocuments ?? 'N/A'}`);
    console.log(`Total GridFS Files:   ${result.metrics?.totalGridFsFiles ?? 'N/A'}`);
    console.log(`Total GridFS Chunks:  ${result.metrics?.totalGridFsChunks ?? 'N/A'}`);
    console.log(`Dangling Metadata:    ${result.metrics?.danglingMetadataCount ?? 0}`);
    console.log(`Orphan GridFS Files:  ${result.metrics?.orphanFilesCount ?? 0}`);
    console.log(`Orphan Chunks:        ${result.metrics?.orphanChunksCount ?? 0}`);
    console.log('----------------------------------------------------');

    if (result.success) {
      console.log('VERDICT: PASS — Restore target verified healthy, coherent, and stream-reconstructible.');
      process.exit(0);
    } else {
      console.error(`VERDICT: FAIL — ${result.message || 'Integrity or referential validation failed.'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`FATAL: Verification failed with error: [${err.code || 'ERROR'}] ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
