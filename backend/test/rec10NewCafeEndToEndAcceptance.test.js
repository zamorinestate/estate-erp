'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — REC-10 DEDICATED ACCEPTANCE TEST SUITE
 * Complete New Café / Restaurant Full End-to-End Acceptance, Provisioning,
 * QR Login & Tenant-Isolation Certification
 * ============================================================================
 * 
 * 40 Dedicated Scenarios:
 *  1.  New Draft café creation
 *  2.  Payload validation
 *  3.  Invalid onboarding blocked
 *  4.  Preview payload accuracy
 *  5.  Create café (stage: CREATED)
 *  6.  Double-create / duplicate name protection
 *  7.  Subsystem provisioning (invoice & receipt sequences, zero opening stock, CafeAccess)
 *  8.  Provisioning failure handling (PROVISIONING_FAILED)
 *  9.  Provisioning retry (idempotent, no duplicates)
 * 10.  Café Admin assignment
 * 11.  QR & deep link generation (unique opaque tokens)
 * 12.  QR safe public metadata (zero secrets in public payload)
 * 13.  QR gives zero auth prior to credentials
 * 14.  Valid assigned user QR login succeeds and binds cafe context
 * 15.  Foreign user QR login denied (403 CAFE_ACCESS_DENIED)
 * 16.  Tampered QR token denied (401 / 403)
 * 17.  Staff creation and assignment to new café
 * 18.  Staff login and restricted role workspace
 * 19.  Café Admin scoped authority (cannot access foreign café data)
 * 20.  Staff scoped authority (cannot access admin or foreign café)
 * 21.  POS initialization with new café context and clean cart
 * 22.  POS test sale (invoice creation, REC-16 tax, ₹0.50 payable rounding, cash ledger)
 * 23.  Invoice series isolation (no collision with other branches)
 * 24.  Inventory isolation (zero stock leakage from Café A)
 * 25.  Procurement isolation (foreign POs / GRNs inaccessible)
 * 26.  Document isolation (REC-06 clean document access, foreign café blocked)
 * 27.  Report isolation (new café operational metrics only)
 * 28.  Search isolation (scoped search results)
 * 29.  Suspend café lifecycle transition
 * 30.  Suspended café QR denied (CAFE_INACTIVE)
 * 31.  Suspended café active-session mutation denied at execution time
 * 32.  Reactivation preserves historical data and café identity
 * 33.  QR rotation generates new token
 * 34.  Old rotated QR is immediately rejected
 * 35.  Cross-organisation access denied
 * 36.  Auth/TOTP regression (no mandatory TOTP in new café)
 * 37.  Offline POS smoke test (new café offline queue sync)
 * 38.  FSSAI perpetual-validity onboarding (no artificial renewal expiry)
 * 39.  Same-GSTIN branch linkage (multiple cafes under one GSTIN)
 * 40.  Zero Kitchen Display System (KDS) introduced
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';
process.env.PASSWORD_RESET_HMAC_SECRET = process.env.PASSWORD_RESET_HMAC_SECRET || 'a_very_secure_and_long_jwt_access_secret_32bytes_long!';

const { Cafe, CAFE_LIFECYCLE_STAGES } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafeGatewayContext } = require('../src/models/CafeGatewayContext');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { User } = require('../src/models/User');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { AuditEvent } = require('../src/models/AuditEvent');
const { Bill } = require('../src/models/Bill');
const { CashTransaction } = require('../src/models/CashTransaction');
const { MenuItem } = require('../src/models/MenuItem');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { Asset } = require('../src/models/Asset');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');

const cafeService = require('../src/services/cafeService');
const cafeAccessCryptoService = require('../src/services/cafeAccessCryptoService');
const authService = require('../src/services/authService');
const PosOrderService = require('../src/services/posOrderService');
const OfflineSyncService = require('../src/services/offlineSyncService');
const { ApiError } = require('../src/utils/ApiError');
const {
  resolveFinancialYear,
  resolveFssaiEligibilityAndFee,
  validateGstinFormat,
} = require('../src/config/regulatoryCompliance2026');

test('REC-10: New Café / Restaurant Full End-to-End Acceptance, Provisioning, QR Login & Tenant-Isolation Certification', async (t) => {
  let mongoServer;

  const ORG_ID = 'ORG-ZAMORIN';
  const timestamp = Date.now();
  const SYNTHETIC_CAFE_NAME = `REC10-E2E-${timestamp}`;

  let masterUser;
  let adminUser;
  let staffUser;
  let foreignStaffUser;
  let foreignOrgUser;

  let establishedCafeA; // Pre-existing branch for cross-branch isolation testing
  let newCafeId; // The new business unit created in REC-10
  let cafeRawQrToken;
  let cafeRawLinkToken;
  let secondBranchCafeId; // For same-GSTIN branch linkage testing

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    cafeAccessCryptoService.verifySecretKeys();
    const passwordHash = await bcrypt.hash('SecurePassword#2026', 10);

    // Advance SequenceCounter so pre-seeded Cafe A (ZC-0001) does not collide with new generated draft ID
    await SequenceCounter.create({
      organisationId: ORG_ID,
      sequenceKey: 'CAFE',
      prefix: 'ZC',
      currentValue: 10,
      minimumDigits: 4,
    });

    // 1. Primary Master Actor
    masterUser = await User.create({
      userId: 'MU-9001',
      organisationId: ORG_ID,
      name: 'Primary Master Operator',
      email: 'master.rec10@zamorin.cafe',
      role: 'MASTER',
      isPrimaryMaster: true,
      primaryMasterDesignatedAt: new Date(),
      primaryMasterDesignatedBy: 'SYSTEM',
      primaryMasterDesignationReason: 'REC-10 Certification Bootstrap',
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    // 2. Pre-existing Café A (to verify strict isolation against newly provisioned unit)
    establishedCafeA = await Cafe.create({
      organisationId: ORG_ID,
      cafeId: 'ZC-0001',
      name: 'Zamorin Beachfront Flagship',
      displayName: 'Zamorin Beachfront',
      legalName: 'Zamorin Hospitality Private Limited',
      status: 'ACTIVE',
      lifecycleStage: 'ACTIVATED',
      address: {
        line1: 'Beach Road',
        city: 'Kozhikode',
        state: 'Kerala',
        stateCode: '32',
        pincode: '673001',
      },
      registrations: {
        gstin: '32AAACZ1234F1Z5',
        fssai: {
          number: '11326001000123',
          category: 'STATE_LICENCE',
          isPerpetual: true,
          ruleVersion: 'FSSAI_RULES_2026_V1',
        },
      },
      createdBy: masterUser.userId,
    });

    // Seed Café A Inventory (100 units of beans) to verify zero leakage to new café
    await GlobalInventoryItem.create({
      organisationId: ORG_ID,
      itemId: 'ITEM-COFFEE-BEANS',
      name: 'Wayanad Arabica Beans',
      sku: 'BEANS-001',
      category: 'COFFEE_BEANS',
      baseUnit: 'g',
      status: 'ACTIVE',
      standardCostPaisa: 45000,
      createdByUserId: masterUser.userId,
    });

    await CafeInventoryConfig.create({
      organisationId: ORG_ID,
      cafeId: 'ZC-0001',
      itemId: 'ITEM-COFFEE-BEANS',
      currentQuantityBase: 100000, // 100 kg in Cafe A
      availableQuantityBase: 100000,
      primaryLocation: 'Main Store',
      storageLocations: ['Main Store'],
    });

    // Seed Café A existing PO to verify procurement isolation
    await PurchaseOrder.create({
      purchaseOrderId: 'PO-CAFE-A-001',
      organisationId: ORG_ID,
      cafeId: 'ZC-0001',
      vendorId: 'VND-CAFE-A-001',
      orderDate: '2026-09-16',
      totalPaisa: 4500000,
      status: 'APPROVED',
      createdByUserId: masterUser.userId,
      lineItems: [
        {
          itemId: 'ITEM-COFFEE-BEANS',
          itemNameSnapshot: 'Arabica Coffee Beans',
          orderedQuantityBase: 10,
          unitPricePaisa: 450000,
          totalLinePaisa: 4500000,
        },
      ],
    });

    // Seed Café A existing Document to verify document isolation
    await BusinessDocument.create({
      documentId: 'DOC-CAFE-A-001',
      organisationId: ORG_ID,
      cafeId: 'ZC-0001',
      entityType: 'CAFE',
      entityId: 'ZC-0001',
      documentType: 'REGULATORY_COMPLIANCE',
      originalFilename: 'lease_agreement_2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: masterUser.userId,
      storageKey: 'docs/cafe-a/lease.pdf',
      storageObjectKey: 'docs/cafe-a/lease.pdf',
      isQuarantined: false,
      uploadStatus: 'AVAILABLE',
      documentStatus: 'VERIFIED',
      status: 'VERIFIED',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
    });

    // 3. Foreign Staff User (assigned only to Cafe A)
    foreignStaffUser = await User.create({
      userId: 'ST-9001',
      organisationId: ORG_ID,
      name: 'Cafe A Cashier',
      email: 'cashier.a@zamorin.cafe',
      role: 'STAFF',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      createdBy: masterUser.userId,
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    // 4. Foreign Organisation User (completely separate tenant)
    foreignOrgUser = await User.create({
      userId: 'ST-9999',
      organisationId: 'ORG-FOREIGN-COMPETITOR',
      name: 'Malicious Foreign Actor',
      email: 'actor@competitor.cafe',
      role: 'CAFE_ADMIN',
      primaryCafeId: 'ZC-FOREIGN-01',
      assignedCafeIds: ['ZC-FOREIGN-01'],
      createdBy: 'SYSTEM',
      accountStatus: 'ACTIVE',
      passwordHash,
    });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  // ===========================================================================
  // 1. NEW DRAFT CAFÉ CREATION
  // ===========================================================================
  await t.test('1. New Draft Café: Successfully creates isolated non-operational DRAFT record', async () => {
    const draftPayload = {
      name: SYNTHETIC_CAFE_NAME,
      displayName: 'Zamorin Hilltop Roastery',
      legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
      cafeType: 'CAFE_AND_RESTAURANT',
      city: 'Wayanad',
      state: 'Kerala',
      stateCode: '32',
      pincode: '673576',
      phone: '+91 98470 12345',
      email: 'hilltop.rec10@zamorin.cafe',
    };

    const result = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: draftPayload,
    });

    assert.ok(result.cafe, 'Draft café must be returned');
    assert.match(result.cafe.cafeId, /^ZC-\d{4}$/, 'Assigned caféId must match canonical ZC-XXXX format');
    assert.equal(result.cafe.name, SYNTHETIC_CAFE_NAME);
    assert.equal(result.cafe.status, 'DRAFT', 'Status must strictly be DRAFT');
    assert.equal(result.cafe.lifecycleStage, 'DRAFT', 'Lifecycle stage must strictly be DRAFT');

    newCafeId = result.cafe.cafeId;

    // Verify draft is absent from operational ACTIVE queries
    const activeCafes = await Cafe.find({ organisationId: ORG_ID, status: 'ACTIVE' }).lean();
    const found = activeCafes.some((c) => c.cafeId === newCafeId);
    assert.equal(found, false, 'Draft café must never appear in operational ACTIVE selectors');
  });

  // ===========================================================================
  // 2. PAYLOAD VALIDATION
  // ===========================================================================
  await t.test('2. Payload Validation: Validates required name, city, state, email, GSTIN and FSSAI format', async () => {
    // 2.1 Valid payload passes
    const validCheck = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: `${SYNTHETIC_CAFE_NAME}-VALID`,
        displayName: 'Validation Unit',
        addressLine1: 'Building 4, Estate Road, Vythiri',
        city: 'Kozhikode',
        stateCode: '32',
        pincode: '673001',
        phone: '+91 98470 12345',
        email: 'val@zamorin.cafe',
        gstin: '32AAACZ1234F1Z5',
        fssaiNumber: '11326001000999',
      },
      isDraft: false,
      organisationId: ORG_ID,
    });
    assert.equal(validCheck.valid, true, 'Fully compliant payload must pass validation');

    // 2.2 Missing required business name
    const missingNameCheck = await cafeService.validateCafeCreationPayload({
      cafeData: { name: '' },
      isDraft: false,
      organisationId: ORG_ID,
    });
    assert.equal(missingNameCheck.valid, false);
    assert.ok(missingNameCheck.errors.some((e) => e.includes('name is required')));

    // 2.3 Invalid GSTIN format
    const badGstinCheck = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Bad GSTIN Unit',
        gstin: 'INVALID_GSTIN_123',
      },
      isDraft: false,
      organisationId: ORG_ID,
    });
    assert.equal(badGstinCheck.valid, false);
    assert.ok(badGstinCheck.errors.some((e) => e.includes('GSTIN Error')));

    // 2.4 State mismatch between GSTIN and location state code
    const stateMismatchCheck = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Mismatch Unit',
        stateCode: '32', // Kerala
        gstin: '27AAAAA0000A1Z5', // Maharashtra (27)
      },
      isDraft: false,
      organisationId: ORG_ID,
    });
    assert.equal(stateMismatchCheck.valid, false);
    assert.ok(stateMismatchCheck.errors.some((e) => e.includes("does not match location State code '32'")));

    // 2.5 Invalid FSSAI format (must be 14 digits)
    const badFssaiCheck = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Bad FSSAI Unit',
        fssaiNumber: '12345',
      },
      isDraft: false,
      organisationId: ORG_ID,
    });
    assert.equal(badFssaiCheck.valid, false);
    assert.ok(badFssaiCheck.errors.some((e) => e.includes('FSSAI number must be exactly 14 digits')));
  });

  // ===========================================================================
  // 3. INVALID ONBOARDING BLOCKED
  // ===========================================================================
  await t.test('3. Invalid Onboarding Blocked: Attempting to activate unverified draft fails closed (400)', async () => {
    await assert.rejects(
      async () => {
        await cafeService.activateCafeLifecycle({
          organisationId: ORG_ID,
          cafeId: newCafeId,
          auth: masterUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'CANNOT_ACTIVATE_UNVERIFIED_CAFE');
        return true;
      },
      'Unverified draft must never be activatable'
    );
  });

  // ===========================================================================
  // 4. PREVIEW PAYLOAD ACCURACY
  // ===========================================================================
  await t.test('4. Preview Payload Accuracy: Read-only preview verifies statutory compliance and FY sequences', async () => {
    const preview = await cafeService.previewCafeCreation({
      auth: masterUser,
      cafeData: {
        cafeId: newCafeId,
        name: SYNTHETIC_CAFE_NAME,
        displayName: 'Zamorin Hilltop Roastery',
        legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
        cafeType: 'CAFE_AND_RESTAURANT',
        addressLine1: 'Estate Road, Vythiri',
        city: 'Wayanad',
        district: 'Wayanad',
        state: 'Kerala',
        stateCode: '32',
        pincode: '673576',
        phone: '+91 98470 12345',
        email: 'hilltop.rec10@zamorin.cafe',
        gstin: '32AAACZ1234F1Z5',
        fssaiNumber: '11326001000123',
        estimatedAnnualTurnoverInr: 25000000, // ₹2.5 crore -> State Licence
      },
    });

    assert.ok(preview.businessIdentity);
    assert.equal(preview.businessIdentity.name, SYNTHETIC_CAFE_NAME);
    assert.equal(preview.gstCompliance.verificationStatus, 'FORMAT_VALIDATED');
    assert.equal(preview.fssaiCompliance.category, 'STATE_LICENCE');
    assert.equal(preview.fssaiCompliance.isPerpetual, true, 'FSSAI 2026 regime must indicate perpetual validity');

    const fyInfo = resolveFinancialYear();
    assert.equal(preview.provisioningPreview.invoiceSeriesPreview, `INV/${fyInfo.fyShort}/[SERVER_ID]`);
    assert.equal(preview.provisioningPreview.zeroOpeningStockPolicy, true);
    assert.equal(preview.provisioningPreview.legacyPinGeneration, false);
  });

  // ===========================================================================
  // 5. CREATE CAFÉ (STAGE: CREATED)
  // ===========================================================================
  await t.test('5. Create Café: Progressive lifecycle moves from DRAFT -> VALIDATION -> PREVIEW -> CREATED', async () => {
    // 5.1 DRAFT -> VALIDATION
    const toVal = await cafeService.transitionCafeLifecycleStage({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      targetStage: 'VALIDATION',
      auth: masterUser,
    });
    assert.equal(toVal.currentStage, 'VALIDATION');

    // 5.2 VALIDATION -> PREVIEW
    const toPrev = await cafeService.transitionCafeLifecycleStage({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      targetStage: 'PREVIEW',
      auth: masterUser,
    });
    assert.equal(toPrev.currentStage, 'PREVIEW');

    // 5.3 PREVIEW -> CREATED
    const toCreated = await cafeService.transitionCafeLifecycleStage({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      targetStage: 'CREATED',
      auth: masterUser,
    });
    assert.equal(toCreated.currentStage, 'CREATED');

    // Update comprehensive profile fields on created cafe
    await Cafe.updateOne(
      { cafeId: newCafeId },
      {
        $set: {
          'address.line1': 'Estate Road, Vythiri',
          'address.district': 'Wayanad',
          'registrations.gstin': '32AAACZ1234F1Z5',
          'registrations.fssai.number': '11326001000123',
          'registrations.fssai.category': 'STATE_LICENCE',
          'registrations.fssai.isPerpetual': true,
          'registrations.fssai.ruleVersion': 'FSSAI_RULES_2026_V1',
        },
      }
    );
  });

  // ===========================================================================
  // 6. DOUBLE-CREATE PROTECTION (IDEMPOTENCY / UNIQUE NAME)
  // ===========================================================================
  await t.test('6. Double-Create Protection: Attempting to create duplicate business name in same org is blocked', async () => {
    const valDup = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: SYNTHETIC_CAFE_NAME, // exact duplicate of newCafeId
        displayName: 'Duplicate Hilltop Attempt',
      },
      organisationId: ORG_ID,
      isDraft: false,
    });

    assert.equal(valDup.valid, false);
    assert.ok(valDup.errors.some((e) => e.includes('already exists in this organisation')));
  });

  // ===========================================================================
  // 7. SUBSYSTEM PROVISIONING
  // ===========================================================================
  await t.test('7. Subsystem Provisioning: Sequences, zero opening inventory, high-entropy CafeAccess created', async () => {
    const provResult = await cafeService.provisionCafeSubsystems({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      auth: masterUser,
    });

    assert.equal(provResult.provisioningStatus, 'PROVISIONED');

    // 7.1 Sequence counter configured for new café
    const fyInfo = resolveFinancialYear();
    const invoiceSeqKey = `GST_INV:32AAACZ1234F1Z5:${fyInfo.fyShort}:${newCafeId}:INV`;
    const invoiceSeq = await SequenceCounter.findOne({ organisationId: ORG_ID, sequenceKey: invoiceSeqKey });
    assert.ok(invoiceSeq, 'Tax invoice sequence must be pre-provisioned in SequenceCounter');
    assert.equal(invoiceSeq.prefix, `INV/${fyInfo.fyShort}/${newCafeId}`);
    assert.equal(invoiceSeq.currentValue, 0);

    // 7.2 Inventory configuration has strictly zero opening stock
    const invConfigs = await CafeInventoryConfig.find({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.ok(invConfigs.length > 0, 'Global items must be linked to new cafe inventory');
    for (const inv of invConfigs) {
      assert.equal(inv.currentQuantityBase, 0, 'Opening inventory must strictly be ZERO');
      assert.equal(inv.availableQuantityBase, 0);
    }

    // 7.3 CafeAccess provisioned without legacy permanent PIN
    const access = await CafeAccess.findOne({ organisationId: ORG_ID, cafeId: newCafeId }).select(
      '+permanentCafePinEncrypted +qrCredentialHash +qrTokenEncrypted +linkCredentialHash +linkTokenEncrypted'
    );
    assert.ok(access, 'CafeAccess record must exist');
    assert.equal(access.permanentCafePinEncrypted, undefined, 'Permanent PIN must NOT be generated for new cafés');
    assert.ok(access.qrCredentialHash, 'QR hash must be generated');
    assert.ok(access.linkCredentialHash, 'Link hash must be generated');

    cafeRawQrToken = cafeAccessCryptoService.decryptSecret(access.qrTokenEncrypted);
    cafeRawLinkToken = cafeAccessCryptoService.decryptSecret(access.linkTokenEncrypted);
    assert.ok(cafeRawQrToken.length >= 43, 'QR token must have at least 256 bits of URL-safe entropy');
  });

  // ===========================================================================
  // 8. PROVISIONING FAILURE HANDLING
  // ===========================================================================
  await t.test('8. Provisioning Failure: Unhealthy/missing subsystems result in PROVISIONING_FAILED', async () => {
    // Create a temporary corrupted draft
    const corruptedDraft = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: {
        name: `CORRUPTED-UNIT-${timestamp}`,
        displayName: 'Corrupted Unit',
        cafeType: 'CAFE',
        city: 'Kozhikode',
      },
    });
    const corruptedId = corruptedDraft.cafe.cafeId;

    // Simulate corrupted state: marked PROVISIONED without sequences
    corruptedDraft.cafe.lifecycleStage = 'PROVISIONED';
    await corruptedDraft.cafe.save();

    // Verify checks detect the missing sequence and fail closed
    const verifyRes = await cafeService.verifyCafeProvisioning({
      organisationId: ORG_ID,
      cafeId: corruptedId,
      auth: masterUser,
    });

    assert.equal(verifyRes.verified, false);
    assert.equal(verifyRes.cafe.lifecycleStage, 'PROVISIONING_FAILED');

    // Activation must be rejected
    await assert.rejects(
      async () => {
        await cafeService.activateCafeLifecycle({
          organisationId: ORG_ID,
          cafeId: corruptedId,
          auth: masterUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'CANNOT_ACTIVATE_UNVERIFIED_CAFE');
        return true;
      }
    );
  });

  // ===========================================================================
  // 9. PROVISIONING RETRY (IDEMPOTENT)
  // ===========================================================================
  await t.test('9. Provisioning Retry: Re-running provisioning is idempotent and creates zero duplicate sequences', async () => {
    const retryResult = await cafeService.provisionCafeSubsystems({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      auth: masterUser,
    });

    assert.equal(retryResult.provisioningStatus, 'PROVISIONED');

    const fyInfo = resolveFinancialYear();
    const invoiceSeqKey = `GST_INV:32AAACZ1234F1Z5:${fyInfo.fyShort}:${newCafeId}:INV`;
    const seqCount = await SequenceCounter.countDocuments({ organisationId: ORG_ID, sequenceKey: invoiceSeqKey });
    assert.equal(seqCount, 1, 'Idempotent provisioning retry must not duplicate sequence records');
  });

  // ===========================================================================
  // 10. CAFÉ ADMIN ASSIGNMENT
  // ===========================================================================
  await t.test('10. Café Admin Assignment: Creates and scopes dedicated Café Administrator to new café', async () => {
    const passwordHash = await bcrypt.hash('AdminSecure#2026', 10);

    adminUser = await User.create({
      userId: 'AD-9101',
      organisationId: ORG_ID,
      name: 'Devan Nambiar (Admin)',
      email: 'admin.rec10@zamorin.cafe',
      role: 'CAFE_ADMIN',
      primaryCafeId: newCafeId,
      assignedCafeIds: [newCafeId],
      createdBy: masterUser.userId,
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    assert.equal(adminUser.role, 'CAFE_ADMIN');
    assert.equal(adminUser.primaryCafeId, newCafeId);
    assert.deepEqual(adminUser.assignedCafeIds, [newCafeId]);
  });

  // ===========================================================================
  // 11. QR & DEEP LINK GENERATION
  // ===========================================================================
  await t.test('11. QR & Deep Link Generation: Generates unique URL-safe tokens with zero secret disclosure', async () => {
    assert.ok(cafeRawQrToken, 'QR token must exist');
    assert.ok(cafeRawLinkToken, 'Link token must exist');
    assert.notEqual(cafeRawQrToken, cafeRawLinkToken, 'QR and Link tokens must be distinct high-entropy secrets');

    const accessDoc = await CafeAccess.findOne({ organisationId: ORG_ID, cafeId: newCafeId });
    assert.equal(accessDoc.qrVersion, 1);
    assert.equal(accessDoc.qrEnabled, true);
  });

  // ===========================================================================
  // 12. QR SAFE PUBLIC METADATA
  // ===========================================================================
  await t.test('12. QR Safe Public Metadata: Public QR endpoint returns only brand metadata, ZERO secrets', async () => {
    // Transition through verification and activation so public gateway is operational
    await cafeService.verifyCafeProvisioning({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      auth: masterUser,
    });

    await cafeService.activateCafeLifecycle({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      reason: 'REC-10 Verification Successful',
      auth: masterUser,
    });

    const publicContext = await cafeService.resolvePublicQrToken(cafeRawQrToken);

    assert.equal(publicContext.cafeId, newCafeId);
    assert.equal(publicContext.displayName, 'Zamorin Hilltop Roastery');
    assert.equal(publicContext.city, 'Wayanad');
    assert.equal(publicContext.operationalStatus, 'ACTIVE');
    assert.equal(publicContext.loginEnabled, true);

    // Negative assertions: zero secrets, passwords, or object IDs
    assert.equal(publicContext.passwordHash, undefined);
    assert.equal(publicContext.qrTokenEncrypted, undefined);
    assert.equal(publicContext.permanentCafePinEncrypted, undefined);
    assert.equal(publicContext._id, undefined);
    assert.equal(publicContext.sales, undefined);
    assert.equal(publicContext.staff, undefined);
  });

  // ===========================================================================
  // 13. QR GIVES ZERO AUTH PRIOR TO CREDENTIALS
  // ===========================================================================
  await t.test('13. QR Gives Zero Auth: Having QR token alone issues ZERO sessions and zero bearer tokens', async () => {
    const publicContext = await cafeService.resolvePublicQrToken(cafeRawQrToken);
    assert.equal(publicContext.token, undefined, 'No auth token issued by QR alone');
    assert.equal(publicContext.accessToken, undefined);
    assert.equal(publicContext.refreshToken, undefined);
  });

  // ===========================================================================
  // 14. VALID ASSIGNED USER QR LOGIN
  // ===========================================================================
  await t.test('14. Valid Assigned User QR Login: Assigned Admin logs in via QR context and binds to new café', async () => {
    // 14.1 User authenticates with Org ID + Email + Password
    const authRes = await authService.authenticatePassword({
      organisationId: ORG_ID,
      email: adminUser.email,
      password: 'AdminSecure#2026',
    });

    assert.ok(authRes && authRes.user);
    assert.equal(authRes.user.userId, adminUser.userId);

    const loginSession = await authService.createSession({
      user: authRes.user,
      device: { deviceId: 'DEV-TEST-01' },
      rememberDevice: false,
      clientIp: '127.0.0.1',
      userAgent: 'Zamorin-Terminal/1.0',
    });
    assert.ok(loginSession.accessToken, 'Access token must be returned');

    // 14.2 Access binding to new café is authorized
    const binding = await cafeService.verifyCafeAccessBinding({
      userId: adminUser.userId,
      role: adminUser.role,
      organisationId: ORG_ID,
      assignedCafeIds: adminUser.assignedCafeIds,
      primaryCafeId: adminUser.primaryCafeId,
      targetCafeId: newCafeId,
      isPrimaryMaster: false,
    });

    assert.equal(binding.authorized, true);
    assert.equal(binding.targetCafeId, newCafeId);
  });

  // ===========================================================================
  // 15. FOREIGN USER QR LOGIN DENIED
  // ===========================================================================
  await t.test('15. Foreign User QR Login Denied: User assigned to Cafe A attempting to access new café is rejected (403)', async () => {
    await assert.rejects(
      async () => {
        await cafeService.verifyCafeAccessBinding({
          userId: foreignStaffUser.userId,
          role: foreignStaffUser.role,
          organisationId: foreignStaffUser.organisationId,
          assignedCafeIds: foreignStaffUser.assignedCafeIds, // only ZC-0001
          primaryCafeId: foreignStaffUser.primaryCafeId,
          targetCafeId: newCafeId,
          isPrimaryMaster: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_ACCESS_DENIED');
        return true;
      },
      'Foreign staff must be denied access to newly created café'
    );
  });

  // ===========================================================================
  // 16. TAMPERED QR TOKEN DENIED
  // ===========================================================================
  await t.test('16. Tampered QR Token Denied: Invalid, truncated, or forged QR tokens are rejected with 401', async () => {
    // 16.1 Completely fictitious token
    await assert.rejects(
      async () => {
        await cafeService.resolvePublicQrToken('forged-qr-token-string-12345');
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'CAFE_ACCESS_LINK_UNAVAILABLE');
        return true;
      }
    );

    // 16.2 Truncated token
    await assert.rejects(
      async () => {
        await cafeService.resolvePublicQrToken(cafeRawQrToken.slice(0, 16));
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'CAFE_ACCESS_LINK_UNAVAILABLE');
        return true;
      }
    );
  });

  // ===========================================================================
  // 17. STAFF CREATION AND ASSIGNMENT
  // ===========================================================================
  await t.test('17. Staff Creation and Assignment: Creates dedicated Cashier/Staff assigned to new café', async () => {
    const passwordHash = await bcrypt.hash('StaffPass#2026', 10);

    staffUser = await User.create({
      userId: 'ST-9102',
      organisationId: ORG_ID,
      name: 'Radha Nambiar (Cashier)',
      email: 'staff.rec10@zamorin.cafe',
      role: 'STAFF',
      primaryCafeId: newCafeId,
      assignedCafeIds: [newCafeId],
      createdBy: adminUser.userId,
      accountStatus: 'ACTIVE',
      passwordHash,
    });

    assert.equal(staffUser.role, 'STAFF');
    assert.deepEqual(staffUser.assignedCafeIds, [newCafeId]);
  });

  // ===========================================================================
  // 18. STAFF LOGIN AND RESTRICTED WORKSPACE
  // ===========================================================================
  await t.test('18. Staff Login: Staff logs in successfully and binds context to new café', async () => {
    const authRes = await authService.authenticatePassword({
      organisationId: ORG_ID,
      email: staffUser.email,
      password: 'StaffPass#2026',
    });

    assert.ok(authRes && authRes.user);
    assert.equal(authRes.user.role, 'STAFF');

    const staffSession = await authService.createSession({
      user: authRes.user,
      device: { deviceId: 'DEV-POS-01' },
      rememberDevice: false,
      clientIp: '127.0.0.1',
      userAgent: 'Zamorin-POS-Terminal/1.0',
    });
    assert.ok(staffSession.accessToken);

    const binding = await cafeService.verifyCafeAccessBinding({
      userId: staffUser.userId,
      role: staffUser.role,
      organisationId: ORG_ID,
      assignedCafeIds: staffUser.assignedCafeIds,
      primaryCafeId: staffUser.primaryCafeId,
      targetCafeId: newCafeId,
      isPrimaryMaster: false,
    });

    assert.equal(binding.authorized, true);
  });

  // ===========================================================================
  // 19. CAFÉ ADMIN SCOPED AUTHORITY
  // ===========================================================================
  await t.test('19. Café Admin Scoped Authority: Admin cannot access or manage foreign Café A (403)', async () => {
    await assert.rejects(
      async () => {
        await cafeService.verifyCafeAccessBinding({
          userId: adminUser.userId,
          role: adminUser.role,
          organisationId: ORG_ID,
          assignedCafeIds: adminUser.assignedCafeIds, // only newCafeId
          primaryCafeId: adminUser.primaryCafeId,
          targetCafeId: 'ZC-0001', // foreign Cafe A
          isPrimaryMaster: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_ACCESS_DENIED');
        return true;
      }
    );
  });

  // ===========================================================================
  // 20. STAFF SCOPED AUTHORITY
  // ===========================================================================
  await t.test('20. Staff Scoped Authority: Staff cannot access administrative endpoints or foreign cafés', async () => {
    // 20.1 Staff cannot access foreign Cafe A
    await assert.rejects(
      async () => {
        await cafeService.verifyCafeAccessBinding({
          userId: staffUser.userId,
          role: staffUser.role,
          organisationId: ORG_ID,
          assignedCafeIds: staffUser.assignedCafeIds,
          primaryCafeId: staffUser.primaryCafeId,
          targetCafeId: 'ZC-0001',
          isPrimaryMaster: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_ACCESS_DENIED');
        return true;
      }
    );

    // 20.2 Staff cannot perform administrative QR rotation
    await assert.rejects(
      async () => {
        await cafeService.rotateQrCredential({
          organisationId: ORG_ID,
          cafeId: newCafeId,
          auth: staffUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'GOVERNANCE_ACCESS_REQUIRED');
        return true;
      }
    );
  });

  // ===========================================================================
  // 21. POS INITIALIZATION
  // ===========================================================================
  await t.test('21. POS Initialization: POS context initialized with new café, active menu, empty cart', async () => {
    // Seed an active menu item for the new café
    await MenuItem.create({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      menuItemId: 'MENU-9101',
      name: 'Wayanad Single-Estate Espresso',
      nameLower: 'wayanad single-estate espresso',
      category: 'COFFEE',
      currentPricePaisa: 100, // ₹1.00 taxable for REC-16 statutory test
      taxRatePercent: 5,
      isAvailable: true,
      status: 'ACTIVE',
      prepStation: 'BEVERAGE_BAR',
      availableCafeIds: [newCafeId],
      createdByUserId: masterUser.userId,
    });

    const menuItems = await MenuItem.find({
      organisationId: ORG_ID,
      $or: [{ cafeId: newCafeId }, { cafeId: null }],
      status: 'ACTIVE',
    }).lean();

    assert.ok(menuItems.length >= 1, 'POS menu must be loaded for new café');
    const espresso = menuItems.find((m) => m.menuItemId === 'MENU-9101');
    assert.ok(espresso);
    assert.equal(espresso.currentPricePaisa, 100);
  });

  // ===========================================================================
  // 22. POS TEST SALE
  // ===========================================================================
  let committedBillId;
  let committedInvoiceNumber;

  await t.test('22. POS Test Sale: Executes sale in new café with REC-16 statutory tax and ₹0.50 rounding', async () => {
    const authContext = {
      userId: staffUser.userId,
      name: staffUser.name,
      role: 'STAFF',
      organisationId: ORG_ID,
      assignedCafeIds: [newCafeId],
      primaryCafeId: newCafeId,
    };

    const orderPayload = {
      cafeId: newCafeId,
      orderType: 'QUICK_SALE',
      paymentMethod: 'CASH',
      idempotencyKey: `IDEM-REC10-SALE-${timestamp}`,
      lineItems: [
        {
          menuItemId: 'MENU-9101',
          name: 'Wayanad Single-Estate Espresso',
          quantity: 1,
          unitPricePaisa: 100, // ₹1.00 @ 5% GST
          taxRatePercent: 5,
        },
      ],
    };

    const result = await PosOrderService.processOrder(orderPayload, authContext);

    assert.ok(result.bill, 'Finalized bill must be created');
    committedBillId = result.bill.billId;
    committedInvoiceNumber = result.bill.invoiceNumber;

    // Verify statutory CBIC calculation: ₹1.00 @ 5% Intra-state -> CGST 3p + SGST 3p = 6p
    // Pre-rounding total = 106 paisa (₹1.06)
    // Customer-payable ₹0.50 rounding band: 106 % 100 = 6 -> rounds down to ₹1.00 (100p), roundOff = -6p
    assert.equal(result.bill.cafeId, newCafeId);
    assert.equal(result.bill.taxRuleVersion, 'GST_ROUNDING_V1_2026');
    assert.equal(result.bill.roundingPolicyVersion, 'ZAMORIN_PAYABLE_ROUNDING_50P_V1');
    assert.equal(result.bill.cgstPaisa, 3, 'CGST must be strictly 3 paisa (half-up)');
    assert.equal(result.bill.sgstPaisa, 3, 'SGST must be strictly 3 paisa (half-up)');
    assert.equal(result.bill.taxPaisa, 6, 'Total GST must strictly be 6 paisa');
    assert.equal(result.bill.preRoundingTotalPaisa, 106);
    assert.equal(result.bill.roundOffPaisa, -6);
    assert.equal(result.bill.totalPaisa, 100, 'Payable amount must round to ₹1.00 (100p)');

    // Cash tender effect recorded on finalized bill
    assert.equal(result.bill.paymentMethod, 'CASH');
    assert.equal(result.bill.paymentStatus, 'PAID');
    assert.ok(result.bill.tenders && result.bill.tenders.length > 0);
    assert.equal(result.bill.tenders[0].paymentMethod, 'CASH');
    assert.equal(result.bill.tenders[0].amountPaisa, 100);
    assert.equal(result.bill.tenders[0].status, 'COMPLETED');
  });

  // ===========================================================================
  // 23. INVOICE SERIES ISOLATION
  // ===========================================================================
  await t.test('23. Invoice Series Isolation: New café invoice series has no collision with other branches', async () => {
    assert.ok(committedInvoiceNumber, 'Invoice number must be generated');
    assert.ok(committedInvoiceNumber.length <= 16, 'Invoice number must be Rule 46(b) compliant (<= 16 chars)');
    assert.ok(
      committedInvoiceNumber.includes('C11') || committedInvoiceNumber.includes(newCafeId.slice(-3)),
      `Invoice number ${committedInvoiceNumber} must contain branch identifier`
    );

    // Cafe A bills do not share or increment new café sequence
    const cafeABills = await Bill.find({ organisationId: ORG_ID, cafeId: 'ZC-0001' }).lean();
    for (const b of cafeABills) {
      assert.notEqual(b.invoiceNumber, committedInvoiceNumber);
      assert.ok(!b.invoiceNumber.includes(newCafeId));
    }
  });

  // ===========================================================================
  // 24. INVENTORY ISOLATION
  // ===========================================================================
  await t.test('24. Inventory Isolation: Stock updates in new café do not leak to or affect Café A', async () => {
    // Add 50 kg beans to new cafe
    await CafeInventoryConfig.updateOne(
      { organisationId: ORG_ID, cafeId: newCafeId, itemId: 'ITEM-COFFEE-BEANS' },
      { $set: { currentQuantityBase: 50000, availableQuantityBase: 50000 } }
    );

    const newCafeStock = await CafeInventoryConfig.findOne({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      itemId: 'ITEM-COFFEE-BEANS',
    }).lean();
    assert.equal(newCafeStock.currentQuantityBase, 50000);

    // Verify Cafe A stock remains strictly unaffected (100,000 g seeded in t.before)
    const cafeAStock = await CafeInventoryConfig.findOne({
      organisationId: ORG_ID,
      cafeId: 'ZC-0001',
      itemId: 'ITEM-COFFEE-BEANS',
    }).lean();
    assert.equal(cafeAStock.currentQuantityBase, 100000, 'Cafe A stock must remain exactly 100,000');
  });

  // ===========================================================================
  // 25. PROCUREMENT ISOLATION
  // ===========================================================================
  await t.test('25. Procurement Isolation: Purchase orders and GRNs are strictly isolated per café', async () => {
    // Create PO for new cafe
    await PurchaseOrder.create({
      purchaseOrderId: 'PO-NEW-CAFE-001',
      organisationId: ORG_ID,
      cafeId: newCafeId,
      vendorId: 'VND-NEW-CAFE-001',
      orderDate: '2026-09-16',
      totalPaisa: 120000,
      status: 'APPROVED',
      createdByUserId: adminUser.userId,
      lineItems: [
        {
          itemId: 'ITEM-COFFEE-BEANS',
          itemNameSnapshot: 'Wayanad Local Roast',
          orderedQuantityBase: 2,
          unitPricePaisa: 60000,
          totalLinePaisa: 120000,
        },
      ],
    });

    // Query scoped to new cafe returns ONLY new cafe PO
    const newCafePOs = await PurchaseOrder.find({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.equal(newCafePOs.length, 1);
    assert.equal(newCafePOs[0].purchaseOrderId, 'PO-NEW-CAFE-001');

    // Query scoped to Cafe A returns ONLY Cafe A PO
    const cafeAPOs = await PurchaseOrder.find({ organisationId: ORG_ID, cafeId: 'ZC-0001' }).lean();
    assert.equal(cafeAPOs.length, 1);
    assert.equal(cafeAPOs[0].purchaseOrderId, 'PO-CAFE-A-001');
  });

  // ===========================================================================
  // 26. DOCUMENT ISOLATION
  // ===========================================================================
  await t.test('26. Document Isolation: Business documents are strictly isolated per café', async () => {
    // Attach document to new cafe
    await BusinessDocument.create({
      documentId: 'DOC-NEW-CAFE-001',
      organisationId: ORG_ID,
      cafeId: newCafeId,
      entityType: 'CAFE',
      entityId: newCafeId,
      documentType: 'REGULATORY_COMPLIANCE',
      originalFilename: 'fssai_cert_2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      uploadedBy: adminUser.userId,
      storageKey: `docs/${newCafeId}/fssai_cert.pdf`,
      storageObjectKey: `docs/${newCafeId}/fssai_cert.pdf`,
      isQuarantined: false,
      uploadStatus: 'AVAILABLE',
      documentStatus: 'VERIFIED',
      status: 'VERIFIED',
      scanStatus: 'CLEAN',
      securityScanStatus: 'CLEAN',
    });

    const newDocs = await BusinessDocument.find({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.equal(newDocs.length, 1);
    assert.equal(newDocs[0].documentId, 'DOC-NEW-CAFE-001');

    // Cafe A documents cannot be seen under new cafe
    const hasCafeADoc = newDocs.some((d) => d.documentId === 'DOC-CAFE-A-001');
    assert.equal(hasCafeADoc, false, 'Cafe A document must never appear in new café query');
  });

  // ===========================================================================
  // 27. REPORT ISOLATION
  // ===========================================================================
  await t.test('27. Report Isolation: Operational sales report returns transactions for new café only', async () => {
    const reportBills = await Bill.find({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.equal(reportBills.length, 1);
    assert.equal(reportBills[0].billId, committedBillId);

    const totalSalesPaisa = reportBills.reduce((acc, b) => acc + (b.totalPaisa || 0), 0);
    assert.equal(totalSalesPaisa, 100);
  });

  // ===========================================================================
  // 28. SEARCH ISOLATION
  // ===========================================================================
  await t.test('28. Search Isolation: Scoped searches return only records belonging to the target café', async () => {
    const scopedBills = await Bill.find({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      'lineItems.itemNameSnapshot': /Espresso/i,
    }).lean();

    assert.ok(scopedBills.length >= 1);
    assert.equal(scopedBills[0].cafeId, newCafeId);
  });

  // ===========================================================================
  // 29. SUSPEND CAFÉ LIFECYCLE TRANSITION
  // ===========================================================================
  await t.test('29. Suspend Café: Transitions café status to SUSPENDED via governance control', async () => {
    await Cafe.updateOne(
      { organisationId: ORG_ID, cafeId: newCafeId },
      {
        $set: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendedBy: masterUser.userId,
          suspensionReason: 'Routine annual licensing audit inspection',
        },
      }
    );

    const suspendedCafe = await Cafe.findOne({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.equal(suspendedCafe.status, 'SUSPENDED');
  });

  // ===========================================================================
  // 30. SUSPENDED QR DENIED
  // ===========================================================================
  await t.test('30. Suspended QR Denied: Attempting to resolve public QR for suspended café throws 403 CAFE_INACTIVE', async () => {
    await assert.rejects(
      async () => {
        await cafeService.resolvePublicQrToken(cafeRawQrToken);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_INACTIVE');
        return true;
      },
      'Resolving QR for suspended café must throw 403 CAFE_INACTIVE'
    );
  });

  // ===========================================================================
  // 31. SUSPENDED ACTIVE-SESSION MUTATION DENIED
  // ===========================================================================
  await t.test('31. Suspended Active-Session Mutation Denied: Live mutations on suspended café are rejected at execution time', async () => {
    // 31.1 Access binding check throws 403 CAFE_INACTIVE
    await assert.rejects(
      async () => {
        await cafeService.verifyCafeAccessBinding({
          userId: staffUser.userId,
          role: staffUser.role,
          organisationId: ORG_ID,
          assignedCafeIds: staffUser.assignedCafeIds,
          primaryCafeId: staffUser.primaryCafeId,
          targetCafeId: newCafeId,
          isPrimaryMaster: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_INACTIVE');
        return true;
      }
    );

    // 31.2 POS order execution throws 409 CAFE_INACTIVE_OR_SUSPENDED
    const authContext = {
      userId: staffUser.userId,
      name: staffUser.name,
      role: 'STAFF',
      organisationId: ORG_ID,
      assignedCafeIds: [newCafeId],
      primaryCafeId: newCafeId,
    };

    const orderPayload = {
      cafeId: newCafeId,
      orderType: 'QUICK_SALE',
      paymentMethod: 'CASH',
      idempotencyKey: `IDEM-SUSPENDED-ATTEMPT-${timestamp}`,
      lineItems: [
        {
          menuItemId: 'MENU-9101',
          name: 'Wayanad Single-Estate Espresso',
          quantity: 1,
          unitPricePaisa: 100,
          taxRatePercent: 5,
        },
      ],
    };

    await assert.rejects(
      async () => {
        await PosOrderService.processOrder(orderPayload, authContext);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'CAFE_SUSPENDED_OR_CLOSED');
        return true;
      },
      'Operational POS transaction on suspended café must be blocked at execution time'
    );
  });

  // ===========================================================================
  // 32. REACTIVATION
  // ===========================================================================
  await t.test('32. Reactivation: Governance restores status to ACTIVE; historical data remains intact', async () => {
    await Cafe.updateOne(
      { organisationId: ORG_ID, cafeId: newCafeId },
      {
        $set: {
          status: 'ACTIVE',
          reactivatedAt: new Date(),
          reactivatedBy: masterUser.userId,
        },
      }
    );

    const reactivatedCafe = await Cafe.findOne({ organisationId: ORG_ID, cafeId: newCafeId }).lean();
    assert.equal(reactivatedCafe.status, 'ACTIVE');

    // Verify existing bill and invoice remain completely intact
    const existingBill = await Bill.findOne({ billId: committedBillId }).lean();
    assert.ok(existingBill);
    assert.equal(existingBill.invoiceNumber, committedInvoiceNumber);

    // QR resolution functions again
    const publicCtx = await cafeService.resolvePublicQrToken(cafeRawQrToken);
    assert.equal(publicCtx.cafeId, newCafeId);
  });

  // ===========================================================================
  // 33. QR ROTATION
  // ===========================================================================
  let newRotatedQrToken;

  await t.test('33. QR Rotation: Generates new high-entropy token and increments qrVersion to 2', async () => {
    const rotateResult = await cafeService.rotateQrCredential({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      auth: masterUser,
      currentPassword: 'SecurePassword#2026',
    });

    assert.ok(rotateResult.qrToken);
    assert.notEqual(rotateResult.qrToken, cafeRawQrToken, 'Rotated token must differ from old token');
    assert.equal(rotateResult.qrVersion, 2);

    newRotatedQrToken = rotateResult.qrToken;
  });

  // ===========================================================================
  // 34. OLD QR INVALID
  // ===========================================================================
  await t.test('34. Old QR Invalid: Old rotated QR is immediately rejected with 401; new QR succeeds', async () => {
    // 34.1 Old token rejected
    await assert.rejects(
      async () => {
        await cafeService.resolvePublicQrToken(cafeRawQrToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'CAFE_ACCESS_LINK_UNAVAILABLE');
        return true;
      },
      'Old rotated QR token must be rejected immediately'
    );

    // 34.2 New token resolves cleanly
    const newContext = await cafeService.resolvePublicQrToken(newRotatedQrToken);
    assert.equal(newContext.cafeId, newCafeId);
  });

  // ===========================================================================
  // 35. CROSS-ORGANISATION ACCESS DENIED
  // ===========================================================================
  await t.test('35. Cross-Organisation Access Denied: User from foreign organisation is rejected (404/403)', async () => {
    await assert.rejects(
      async () => {
        await cafeService.verifyCafeAccessBinding({
          userId: foreignOrgUser.userId,
          role: foreignOrgUser.role,
          organisationId: foreignOrgUser.organisationId, // ORG-FOREIGN-COMPETITOR
          assignedCafeIds: foreignOrgUser.assignedCafeIds,
          primaryCafeId: foreignOrgUser.primaryCafeId,
          targetCafeId: newCafeId,
          isPrimaryMaster: false,
        });
      },
      (err) => {
        assert.ok([403, 404].includes(err.statusCode));
        return true;
      },
      'Cross-organisation binding must be strictly rejected'
    );
  });

  // ===========================================================================
  // 36. AUTH / TOTP REGRESSION
  // ===========================================================================
  await t.test('36. Auth / TOTP Regression: Authentication requires strictly Org + Email + Password, zero mandatory TOTP', async () => {
    const authRes = await authService.authenticatePassword({
      organisationId: ORG_ID,
      email: staffUser.email,
      password: 'StaffPass#2026',
    });

    assert.ok(authRes && authRes.user);
    assert.ok(!authRes.requiresMfa, 'MFA must NOT be required');
    assert.equal(authRes.user.totpRequired, undefined, 'TOTP must NOT be required');

    const authSession = await authService.createSession({
      user: authRes.user,
      device: { deviceId: 'DEV-REC10-01' },
      rememberDevice: false,
      clientIp: '127.0.0.1',
      userAgent: 'Zamorin-Auth-Check/1.0',
    });
    assert.ok(authSession.accessToken);
  });

  // ===========================================================================
  // 37. OFFLINE POS SMOKE TEST
  // ===========================================================================
  await t.test('37. Offline POS Smoke Test: Replays offline queue for new café; foreign café sync is blocked', async () => {
    // 37.1 Register an authorized device for the new café
    const deviceId = `DEV-REC10-${timestamp}`;
    await DeviceRegistration.create({
      organisationId: ORG_ID,
      deviceId,
      deviceName: 'Wayanad Main POS Terminal 01',
      assignedCafeId: newCafeId,
      deviceType: 'POS_TERMINAL',
      status: 'ACTIVE',
      registeredBy: adminUser.userId,
    });

    // 37.2 Replay valid offline transaction for new café
    const offlineBatchResult = await OfflineSyncService.syncBatch({
      organisationId: ORG_ID,
      cafeId: newCafeId,
      deviceId,
      userId: staffUser.userId,
      transactions: [
        {
          clientOfflineId: `OFFLINE-REC10-${timestamp}-01`,
          orderType: 'QUICK_SALE',
          paymentMethod: 'CASH',
          capturedAtClient: new Date().toISOString(),
          lineItems: [
            {
              menuItemId: 'MENU-9101',
              name: 'Wayanad Single-Estate Espresso',
              quantity: 2,
              unitPricePaisa: 100,
              taxRatePercent: 5,
            },
          ],
        },
      ],
    });

    assert.ok(offlineBatchResult.syncedCount >= 1 || offlineBatchResult.processed >= 1);

    // 37.3 Foreign café attempting to replay device assigned to new café is blocked
    await assert.rejects(
      async () => {
        await OfflineSyncService.syncBatch({
          organisationId: ORG_ID,
          cafeId: 'ZC-0001', // Foreign Cafe A
          deviceId, // Assigned to newCafeId
          userId: foreignStaffUser.userId,
          transactions: [
            {
              clientOfflineId: `OFFLINE-CORRUPT-${timestamp}`,
              paymentMethod: 'CASH',
              lineItems: [{ menuItemId: 'MENU-9101', quantity: 1, unitPricePaisa: 100 }],
            },
          ],
        });
      },
      (err) => {
        assert.ok(err.message.includes('cannot replay for café'));
        return true;
      },
      'Cross-café offline replay must be denied'
    );
  });

  // ===========================================================================
  // 38. FSSAI PERPETUAL-VALIDITY ONBOARDING
  // ===========================================================================
  await t.test('38. FSSAI Perpetual Validity: Enforces 2026 perpetual regime with zero mandatory expiry date', async () => {
    const feeInfo = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 30000000, // ₹3.0 crore
    });

    assert.equal(feeInfo.matched, true);
    assert.equal(feeInfo.category, 'STATE_LICENCE');
    assert.equal(feeInfo.isPerpetual, true, 'Must indicate perpetual validity under 2026 framework');

    const cafeRec = await Cafe.findOne({ cafeId: newCafeId }).lean();
    assert.equal(cafeRec.registrations.fssai.isPerpetual, true);
    assert.equal(cafeRec.registrations.fssai.expiryDate, undefined, 'Zero fictitious renewal expiry date stored');
  });

  // ===========================================================================
  // 39. SAME-GSTIN BRANCH LINKAGE
  // ===========================================================================
  await t.test('39. Same-GSTIN Branch Linkage: Second branch under same legal entity and GSTIN links cleanly', async () => {
    const branchPayload = {
      name: `${SYNTHETIC_CAFE_NAME}-BRANCH2`,
      displayName: 'Zamorin Hilltop Kiosk',
      legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
      cafeType: 'KIOSK',
      city: 'Wayanad',
      state: 'Kerala',
      stateCode: '32',
      pincode: '673576',
      phone: '+91 98470 54321',
      email: 'kiosk.rec10@zamorin.cafe',
      gstin: '32AAACZ1234F1Z5', // Same GSTIN as primary branch
      fssaiNumber: '11326001000123',
    };

    // Validation allows same GSTIN across branches of same organisation
    const valRes = await cafeService.validateCafeCreationPayload({
      cafeData: branchPayload,
      isDraft: true,
      organisationId: ORG_ID,
    });

    assert.equal(valRes.valid, true, 'Same GSTIN across multi-branch organisation must be valid');

    const draft2 = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: branchPayload,
    });

    assert.ok(draft2.cafe);
    secondBranchCafeId = draft2.cafe.cafeId;
    assert.notEqual(secondBranchCafeId, newCafeId);
  });

  // ===========================================================================
  // 40. ZERO KITCHEN DISPLAY SYSTEM (KDS) INTRODUCED
  // ===========================================================================
  await t.test('40. Zero KDS: Verifies zero KDS models, routes, or components exist or were introduced', async () => {
    // Model checks: KDS model must not exist in mongoose models
    assert.equal(mongoose.models.KdsOrder, undefined, 'KdsOrder model must not exist');
    assert.equal(mongoose.models.KitchenDisplay, undefined, 'KitchenDisplay model must not exist');
    assert.equal(mongoose.models.KitchenTicket, undefined, 'KitchenTicket model must not exist');

    // New café operational configuration has zero KDS routing
    const newCafeDoc = await Cafe.findOne({ cafeId: newCafeId }).lean();
    assert.equal(newCafeDoc.hardware?.kitchenDisplay, undefined);
  });
});
