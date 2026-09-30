// =============================================================================
// ZAMORIN CAFÉ ERP — PM-06-R1: RECONCILIATION GATE VERIFICATION SUITE
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { User } = require('../src/models/User');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const { generateZurfExport } = require('../src/controllers/reportController');
const personalLedgerController = require('../src/controllers/personalLedgerController');
const { defaultStorageService } = require('../src/services/storageAdapterService');

test('PM-06-R1: Reconciliation Gate Verification Suite', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.create({
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-0001',
      name: 'Primary Master Root',
      email: 'root@zamorincafe.com',
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
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // ── 1. REPORTS EXPORT FORMAT POLICY ENFORCEMENT ──────────────────────────────
  await t.test('R1-001A: Reports export rejects CSV format with 400 UNSUPPORTED_EXPORT_FORMAT', async () => {
    const csvVariations = ['CSV', 'csv', 'Csv', 'text/csv', 'application/csv'];
    for (const fmt of csvVariations) {
      const req = {
        auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
        body: { reportId: 'daily-sales', format: fmt },
      };
      const res = { status() { return this; }, json() { return this; } };

      await assert.rejects(
        async () => {
          await generateZurfExport(req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 400, `Format ${fmt} must reject with 400`);
          assert.equal(err.code, 'UNSUPPORTED_EXPORT_FORMAT');
          assert.match(err.message, /CSV format is not supported/i);
          return true;
        }
      );
    }
  });

  await t.test('R1-001B: Reports export accepts canonical PDF and XLSX formats', async () => {
    let pdfCalled = false;
    let xlsxCalled = false;

    const reqPdf = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: { reportId: 'daily-sales', format: 'PDF' },
    };
    const resPdf = {
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(payload) {
        assert.ok(payload.success);
        assert.equal(payload.data.format, 'PDF');
        pdfCalled = true;
        return this;
      },
    };
    await generateZurfExport(reqPdf, resPdf);
    assert.ok(pdfCalled, 'PDF export must succeed');

    const reqXlsx = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: { reportId: 'daily-sales', format: 'XLSX' },
    };
    const resXlsx = {
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(payload) {
        assert.ok(payload.success);
        assert.equal(payload.data.format, 'XLSX');
        xlsxCalled = true;
        return this;
      },
    };
    await generateZurfExport(reqXlsx, resXlsx);
    assert.ok(xlsxCalled, 'XLSX export must succeed');
  });

  // ── 2. PERSONAL LEDGER SOURCE-EVENT IDEMPOTENCY ───────────────────────────
  await t.test('R1-002: Same authoritative source event with different request keys produces exactly one financial effect', async () => {
    const basePayload = {
      entryType: 'CREDIT',
      category: 'BUSINESS_EXPENSE_PAID_PERSONALLY',
      amountPaisa: 150000,
      description: 'Vendor raw ingredients direct procurement',
      accountType: 'PRIMARY_MASTER_PERSONAL_LEDGER',
      accountHolderId: 'MU-0001',
      sourceModule: 'PROCUREMENT',
      sourceReferenceId: 'PO-2026-9901',
      postingType: 'INVOICE_SETTLEMENT',
      sourceStatus: 'APPROVED',
      economicDirection: 'CREDIT',
    };

    let postCount = 0;
    const res1 = {
      status(code) {
        assert.ok(code === 201 || code === 200);
        return this;
      },
      json(body) {
        assert.ok(body.data);
        assert.equal(body.idempotentReplay, undefined);
        postCount++;
        return this;
      },
    };

    // Request 1 with Request Key Alpha
    const req1 = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: {
        ...basePayload,
        idempotencyKey: 'REQ-KEY-ALPHA-001',
      },
      get(h) { return h === 'idempotency-key' ? 'REQ-KEY-ALPHA-001' : null; },
    };
    await personalLedgerController.createEntry(req1, res1);
    assert.equal(postCount, 1);

    // Request 2 for identical source event with DIFFERENT Request Key Beta
    let replayCount = 0;
    const res2 = {
      status(code) {
        assert.equal(code, 200, 'Replay must return 200');
        return this;
      },
      json(body) {
        assert.ok(body.data);
        assert.equal(body.idempotentReplay, true, 'Must detect existing source event record and replay');
        replayCount++;
        return this;
      },
    };
    const req2 = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: {
        ...basePayload,
        idempotencyKey: 'REQ-KEY-BETA-002', // Different client request key!
      },
      get(h) { return h === 'idempotency-key' ? 'REQ-KEY-BETA-002' : null; },
    };
    await personalLedgerController.createEntry(req2, res2);
    assert.equal(replayCount, 1);

    // Verify DB count: strictly 1 financial entry created
    const count = await PersonalLedger.countDocuments({
      organisationId: 'ORG-ZAMORIN',
      externalReference: 'PROCUREMENT:PO-2026-9901:INVOICE_SETTLEMENT',
    });
    assert.equal(count, 1, 'Durable externalReference deduplication must prevent double-posting');
  });

  // ── 3. MULTER VERSION AND SECURE OBJECT STORAGE ───────────────────────────
  await t.test('R1-003: Multer 2.4.0 safe parsing and storage adapter validation', async () => {
    const multerPkg = require('multer/package.json');
    assert.equal(multerPkg.version, '2.4.0', 'Multer must be exactly 2.4.0 patched version');

    // Storage adapter validation under local driver
    const uploadRes = await defaultStorageService.uploadObject({
      organisationId: 'ORG-ZAMORIN',
      fileType: 'DOCUMENT',
      fileName: 'vendor_receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test secure upload buffer', 'utf8'),
    });
    assert.ok(uploadRes.fileKey);
    assert.ok(uploadRes.url);
  });

  // ── 4. QS VERSION AND SECURE QUERY PARSING ────────────────────────────────
  await t.test('R1-004: QS 6.16.0 override active and parses bracket syntax securely', async () => {
    const qs = require('qs');
    const qsPkg = require('qs/package.json');
    assert.equal(qsPkg.version, '6.16.0', 'qs must be exactly 6.16.0 safe version');

    const parsed = qs.parse('filter[status]=ACTIVE&filter[cafe]=CAFE-01&limit=50');
    assert.deepEqual(parsed, {
      filter: {
        status: 'ACTIVE',
        cafe: 'CAFE-01',
      },
      limit: '50',
    });
  });

  // ── 5. MFA / TOTP REMOVAL TRUTH PRESERVATION ──────────────────────────────
  await t.test('R1-005: Zero mandatory TOTP remains preserved; REQUIRE_MFA is not enabled', async () => {
    assert.notEqual(process.env.REQUIRE_MFA, 'true', 'REQUIRE_MFA must not be active');
    // Verify authService normalized login requires zero TOTP
    const { User } = require('../src/models/User');
    const user = await User.findOne({ userId: 'MU-0001' });
    assert.equal(user.mfaEnabled, false, 'Default user must not have forced MFA enabled');
  });
});
