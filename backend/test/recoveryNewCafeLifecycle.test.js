'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — REC-02 DEDICATED TEST SUITE
 * Complete New Café / Restaurant Creation, Provisioning & Activation Lifecycle
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');

const { Cafe, CAFE_TYPES, CAFE_LIFECYCLE_STAGES } = require('../src/models/Cafe');
const { CafeAccess } = require('../src/models/CafeAccess');
const { CafePinReservation } = require('../src/models/CafePinReservation');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { User } = require('../src/models/User');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { AuditEvent } = require('../src/models/AuditEvent');

const cafeService = require('../src/services/cafeService');
const {
  resolveStateByCode,
  validateGstinFormat,
  validateFssaiNumber,
  resolveFssaiEligibilityAndFee,
  determineFssaiCategoryByTurnover,
  getFssaiRuleSet,
  resolveFinancialYear,
} = require('../src/config/regulatoryCompliance2026');

test('REC-02: Complete New Café / Restaurant Creation, Provisioning & Activation Lifecycle', async (t) => {
  let mongoServer;

  const masterUser = {
    userId: 'US-MASTER-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: true,
  };

  const normalMasterUser = {
    userId: 'US-MASTER-02',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
  };

  const ownerUser = {
    userId: 'US-OWNER-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'OWNER',
    assignedCafeIds: [],
  };

  const adminUser = {
    userId: 'US-ADMIN-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'CAFE_ADMIN',
    assignedCafeIds: [],
  };

  const staffUser = {
    userId: 'US-STAFF-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'STAFF',
    assignedCafeIds: [],
  };

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Seed global inventory items
    await GlobalInventoryItem.create([
      {
        organisationId: 'ORG-ZAMORIN',
        itemId: 'ITEM-COFFEE-BEANS',
        name: 'Wayanad Arabica Beans',
        sku: 'BEANS-001',
        category: 'COFFEE_BEANS',
        baseUnit: 'g',
        status: 'ACTIVE',
        standardCostPaisa: 45000,
        createdByUserId: masterUser.userId,
      },
      {
        organisationId: 'ORG-ZAMORIN',
        itemId: 'ITEM-DAIRY-MILK',
        name: 'Farm Fresh Full Cream Milk',
        sku: 'MILK-001',
        category: 'DAIRY_FRESH',
        baseUnit: 'ml',
        status: 'ACTIVE',
        standardCostPaisa: 6000,
        createdByUserId: masterUser.userId,
      },
    ]);
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  // ---------------------------------------------------------------------------
  // 1. MASTER-ONLY CREATION AUTHORITY
  // ---------------------------------------------------------------------------
  await t.test('1. Authority Enforcement: Master allowed; Owner, Admin, Staff rejected with 403', async () => {
    // 1.1 Master allowed
    const validDraftPayload = {
      name: 'Zamorin Calicut Beach',
      displayName: 'Beach Flagship',
      cafeType: 'CAFE_AND_RESTAURANT',
      city: 'Kozhikode',
      state: 'Kerala',
      stateCode: '32',
      pincode: '673001',
      phone: '+91 98470 12345',
      email: 'beach@zamorin.cafe',
    };

    const draftRes = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: validDraftPayload,
    });
    assert.ok(draftRes.cafe);
    assert.match(draftRes.cafe.cafeId, /^ZC-\d{4}$/);
    assert.equal(draftRes.cafe.lifecycleStage, 'DRAFT');

    // 1.2 Normal Master allowed
    const normalMasterDraft = await cafeService.createCafeDraft({
      auth: normalMasterUser,
      cafeData: {
        name: 'Zamorin Wayanad Hills',
        displayName: 'Wayanad Retreat',
        cafeType: 'RESTAURANT',
        city: 'Kalpetta',
        state: 'Kerala',
        stateCode: '32',
        pincode: '673121',
        phone: '+91 98470 54321',
        email: 'wayanad@zamorin.cafe',
      },
    });
    assert.ok(normalMasterDraft.cafe);

    // 1.3 Owner rejected (403)
    await assert.rejects(
      async () => {
        await cafeService.createCafeDraft({
          auth: ownerUser,
          cafeData: validDraftPayload,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );

    // 1.4 Cafe Admin rejected (403)
    await assert.rejects(
      async () => {
        await cafeService.createCafeDraft({
          auth: adminUser,
          cafeData: validDraftPayload,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );

    // 1.5 Staff rejected (403)
    await assert.rejects(
      async () => {
        await cafeService.createCafeDraft({
          auth: staffUser,
          cafeData: validDraftPayload,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'CAFE_CREATION_DENIED');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 2. DRAFT STATE MANAGEMENT
  // ---------------------------------------------------------------------------
  await t.test('2. Draft Lifecycle: Create draft, edit draft, absent from operational selector', async () => {
    // Create non-operational draft
    const draft = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: {
        name: 'Zamorin Palayam Central',
        displayName: 'Palayam Hub',
        cafeType: 'CAFE',
        city: 'Kozhikode',
      },
    });

    const draftId = draft.cafe.cafeId;
    assert.equal(draft.cafe.status, 'DRAFT');
    assert.equal(draft.cafe.lifecycleStage, 'DRAFT');

    // Edit draft
    const updated = await cafeService.updateCafeDraft({
      organisationId: 'ORG-ZAMORIN',
      cafeId: draftId,
      auth: masterUser,
      cafeData: {
        displayName: 'Palayam Central Hub & Roastery',
        city: 'Kozhikode',
        addressLine1: 'SM Street Crossroad',
        pincode: '673002',
      },
    });
    assert.equal(updated.cafe.displayName, 'Palayam Central Hub & Roastery');

    // Verify draft is absent from active/operational cafe selectors
    const operationalCafes = await Cafe.find({
      organisationId: 'ORG-ZAMORIN',
      status: 'ACTIVE',
    });
    const foundInActive = operationalCafes.some((c) => c.cafeId === draftId);
    assert.equal(foundInActive, false, 'Draft café must not appear in operational ACTIVE selectors');
  });

  // ---------------------------------------------------------------------------
  // 3. VALIDATION ENGINE & COMPLIANCE RULES
  // ---------------------------------------------------------------------------
  await t.test('3. Validation Engine: Required fields, email, State, GSTIN, FSSAI, duplicate detection', async () => {
    // 3.1 Missing required identity
    const valMissing = await cafeService.validateCafeCreationPayload({
      cafeData: { name: '' },
      isDraft: false,
    });
    assert.equal(valMissing.valid, false);
    assert.ok(valMissing.errors.some((e) => e.includes('name is required')));

    // 3.2 Bad email format
    const valEmail = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Validation Unit',
        displayName: 'Val Unit',
        email: 'not-an-email',
      },
      isDraft: false,
    });
    assert.ok(valEmail.errors.some((e) => e.includes('email format is invalid')));

    // 3.3 Invalid Indian State Code
    const valState = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Validation Unit 2',
        displayName: 'Val Unit 2',
        stateCode: '99', // Non-existent state code
      },
      isDraft: false,
    });
    assert.ok(valState.errors.some((e) => e.includes("Invalid Indian State Code '99'")));

    // 3.4 GSTIN Format Error
    const valGstinFormat = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Validation Unit 3',
        displayName: 'Val Unit 3',
        gstin: '32INVALIDGSTIN!',
      },
      isDraft: false,
    });
    assert.ok(valGstinFormat.errors.some((e) => e.includes('GSTIN Error')));

    // 3.5 GSTIN State Mismatch (Kerala state 32 vs Maharashtra GSTIN 27)
    const valGstinMismatch = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Validation Unit 4',
        displayName: 'Val Unit 4',
        stateCode: '32',
        gstin: '27AAAAA0000A1Z5', // Starts with 27 (Maharashtra)
      },
      isDraft: false,
    });
    assert.ok(valGstinMismatch.errors.some((e) => e.includes("does not match location State code '32'")));

    // 3.6 FSSAI Number Format (14 digits)
    const valFssaiFormat = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Validation Unit 5',
        displayName: 'Val Unit 5',
        fssaiNumber: '12345', // Incomplete digits
      },
      isDraft: false,
    });
    assert.ok(valFssaiFormat.errors.some((e) => e.includes('FSSAI number must be exactly 14 digits')));

    // 3.7 Duplicate Name Conflict Detection within same Organisation
    const valDuplicate = await cafeService.validateCafeCreationPayload({
      cafeData: {
        name: 'Zamorin Calicut Beach', // Existing from Test 1
        displayName: 'Duplicate Attempt',
      },
      organisationId: 'ORG-ZAMORIN',
      isDraft: false,
    });
    assert.ok(valDuplicate.errors.some((e) => e.includes('already exists in this organisation')));
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 4. FSSAI 2026 FRAMEWORK: KIND OF BUSINESS, STATUTORY FEES & PERPETUAL REGIME
  // ---------------------------------------------------------------------------
  await t.test('4. FSSAI 2026 Framework: Kind of Business, Turnover Bands, Statutory Fees & Versioning', () => {
    // 4.1 Restaurant: Turnover <= 1.5 crore -> REGISTRATION / ₹100 / Perpetual
    const resReg = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 12000000, // ₹1.2 crore
    });
    assert.equal(resReg.matched, true);
    assert.equal(resReg.category, 'REGISTRATION');
    assert.equal(resReg.feePerAnnum, 100);
    assert.equal(resReg.isPerpetual, true);

    // 4.2 Restaurant Boundary: Exactly ₹1.5 crore -> REGISTRATION / ₹100
    const resRegBound = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 15000000, // ₹1.5 crore exactly
    });
    assert.equal(resRegBound.category, 'REGISTRATION');
    assert.equal(resRegBound.feePerAnnum, 100);

    // 4.3 Restaurant: Turnover > 1.5 crore and <= 50 crore -> STATE_LICENCE / ₹5,000 / Perpetual
    const resState = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 35000000, // ₹3.5 crore
    });
    assert.equal(resState.matched, true);
    assert.equal(resState.category, 'STATE_LICENCE');
    assert.equal(resState.feePerAnnum, 5000);
    assert.equal(resState.isPerpetual, true);

    // 4.4 Restaurant Boundary: Exactly ₹50 crore -> STATE_LICENCE / ₹5,000
    const resStateBound = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 500000000, // ₹50 crore exactly
    });
    assert.equal(resStateBound.category, 'STATE_LICENCE');
    assert.equal(resStateBound.feePerAnnum, 5000);

    // 4.5 Restaurant: Turnover > 50 crore -> CENTRAL_LICENCE / ₹7,500 / Perpetual
    const resCentral = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 650000000, // ₹65 crore
    });
    assert.equal(resCentral.matched, true);
    assert.equal(resCentral.category, 'CENTRAL_LICENCE');
    assert.equal(resCentral.feePerAnnum, 7500);
    assert.equal(resCentral.isPerpetual, true);

    // 4.6 Distinct Kind of Business (Food Vending / Kiosk) resolves different State Licence fee (₹2,000)
    const vendingState = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'FOOD_VENDING_ESTABLISHMENT',
      annualTurnoverInr: 35000000, // ₹3.5 crore
    });
    assert.equal(vendingState.matched, true);
    assert.equal(vendingState.category, 'STATE_LICENCE');
    assert.equal(vendingState.feePerAnnum, 2000); // Distinct statutory fee for vending/kiosks
    assert.equal(vendingState.isPerpetual, true);

    // 4.7 Unknown Kind of Business: Does NOT invent amounts
    const unknownKob = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'UNKNOWN_OR_ARBITRARY_BUSINESS',
      annualTurnoverInr: 50000000,
    });
    assert.equal(unknownKob.matched, false);
    assert.equal(unknownKob.category, null);
    assert.equal(unknownKob.feePerAnnum, null);
    assert.ok(unknownKob.reason.includes('No fee invented'));

    // 4.8 Historical Rule-Version lookup remains deterministic
    const historicalSet = getFssaiRuleSet('FSSAI_RULES_HISTORICAL_2021');
    assert.equal(historicalSet.ruleVersion, 'FSSAI_RULES_HISTORICAL_2021');
    assert.equal(historicalSet.turnoverThresholds.registrationMaxInr, 1200000); // Pre-2026 ₹12 Lakh threshold
    assert.equal(historicalSet.isPerpetualRegime, false);

    const historicalRes = resolveFssaiEligibilityAndFee({
      kindOfBusiness: 'RESTAURANT',
      annualTurnoverInr: 1000000, // ₹10 lakh
      ruleVersion: 'FSSAI_RULES_HISTORICAL_2021',
    });
    assert.equal(historicalRes.ruleVersion, 'FSSAI_RULES_HISTORICAL_2021');
    assert.equal(historicalRes.category, 'REGISTRATION');
    assert.equal(historicalRes.isPerpetual, false);
  });

  // ---------------------------------------------------------------------------
  // 5. READ-ONLY PREVIEW STATE
  // ---------------------------------------------------------------------------
  await t.test('5. Preview State: Read-only preview with dynamic FY sequence and neutral stores', async () => {
    const preview = await cafeService.previewCafeCreation({
      auth: masterUser,
      cafeData: {
        name: 'Zamorin Kochi Port',
        displayName: 'Kochi Port Branch',
        legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
        cafeType: 'CAFE',
        addressLine1: 'Willingdon Island Wharf',
        city: 'Kochi',
        district: 'Ernakulam',
        state: 'Kerala',
        stateCode: '32',
        pincode: '682003',
        phone: '+91 98470 99887',
        email: 'kochi@zamorin.cafe',
        gstin: '32AAACZ1234F1Z5',
        fssaiNumber: '11326001000999',
        estimatedAnnualTurnoverInr: 25000000, // 2.5 crore -> State Licence
      },
    });

    assert.ok(preview.businessIdentity);
    assert.equal(preview.businessIdentity.name, 'Zamorin Kochi Port');
    assert.equal(preview.gstCompliance.verificationStatus, 'FORMAT_VALIDATED');
    assert.equal(preview.fssaiCompliance.category, 'STATE_LICENCE');
    assert.equal(preview.fssaiCompliance.isPerpetual, true);

    // Dynamic sequence preview
    const fyInfo = resolveFinancialYear();
    assert.equal(preview.provisioningPreview.invoiceSeriesPreview, `INV/${fyInfo.fyShort}/[SERVER_ID]`);
    assert.deepEqual(preview.provisioningPreview.inventoryLocations, ['Main Store', 'Cold Room']);
    assert.equal(preview.provisioningPreview.zeroOpeningStockPolicy, true);
    assert.equal(preview.provisioningPreview.legacyPinGeneration, false);
  });

  // ---------------------------------------------------------------------------
  // 6. STATE MACHINE ENFORCEMENT & PROHIBITED TRANSITIONS
  // ---------------------------------------------------------------------------
  await t.test('6. State Machine: Valid transitions pass; illegal bypass transitions are blocked (400)', async () => {
    // Create new Draft for state testing
    const testCafeDraft = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: {
        name: 'State Transition Lab',
        displayName: 'Lab Unit',
        cafeType: 'CAFE',
        city: 'Kozhikode',
      },
    });
    const labCafeId = testCafeDraft.cafe.cafeId;

    // 6.1 Prohibited: DRAFT -> ACTIVATED directly
    await assert.rejects(
      async () => {
        await cafeService.transitionCafeLifecycleStage({
          organisationId: 'ORG-ZAMORIN',
          cafeId: labCafeId,
          targetStage: 'ACTIVATED',
          auth: masterUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_LIFECYCLE_TRANSITION');
        return true;
      }
    );

    // 6.2 Prohibited: DRAFT -> VERIFIED directly
    await assert.rejects(
      async () => {
        await cafeService.transitionCafeLifecycleStage({
          organisationId: 'ORG-ZAMORIN',
          cafeId: labCafeId,
          targetStage: 'VERIFIED',
          auth: masterUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_LIFECYCLE_TRANSITION');
        return true;
      }
    );

    // 6.3 Valid: DRAFT -> VALIDATION
    const toVal = await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: labCafeId,
      targetStage: 'VALIDATION',
      auth: masterUser,
    });
    assert.equal(toVal.currentStage, 'VALIDATION');

    // 6.4 Valid: VALIDATION -> PREVIEW
    const toPrev = await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: labCafeId,
      targetStage: 'PREVIEW',
      auth: masterUser,
    });
    assert.equal(toPrev.currentStage, 'PREVIEW');

    // 6.5 Prohibited: PREVIEW -> ACTIVATED directly
    await assert.rejects(
      async () => {
        await cafeService.transitionCafeLifecycleStage({
          organisationId: 'ORG-ZAMORIN',
          cafeId: labCafeId,
          targetStage: 'ACTIVATED',
          auth: masterUser,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_LIFECYCLE_TRANSITION');
        return true;
      }
    );

    // 6.6 Valid: PREVIEW -> CREATED
    const toCreated = await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: labCafeId,
      targetStage: 'CREATED',
      auth: masterUser,
    });
    assert.equal(toCreated.currentStage, 'CREATED');

    // 6.7 Prohibited: CREATED -> ACTIVATED directly (skipping provision and verify)
    await assert.rejects(
      async () => {
        await cafeService.activateCafeLifecycle({
          organisationId: 'ORG-ZAMORIN',
          cafeId: labCafeId,
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

  // ---------------------------------------------------------------------------
  // 7. SUBSYSTEM PROVISIONING, ZERO STOCK & RETIRED PIN
  // ---------------------------------------------------------------------------
  await t.test('7. Provisioning: POS, invoice sequence, zero fake stock, retired PIN, idempotency', async () => {
    // Create complete cafe record in CREATED state
    const createdRes = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: {
        name: 'Zamorin Marine Drive',
        displayName: 'Marine Drive Cafe',
        legalName: 'Zamorin Coffee Works Pvt. Ltd.',
        cafeType: 'CAFE',
        addressLine1: 'Rainbow Bridge Promenade',
        city: 'Kochi',
        state: 'Kerala',
        stateCode: '32',
        pincode: '682011',
        phone: '+91 98470 77889',
        email: 'marine.drive@zamorin.cafe',
        gstin: '32AAACZ9999F1Z1',
        fssaiNumber: '11326001000777',
      },
    });
    const marineCafeId = createdRes.cafe.cafeId;

    // Transition to CREATED
    await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
      targetStage: 'VALIDATION',
      auth: masterUser,
    });
    await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
      targetStage: 'PREVIEW',
      auth: masterUser,
    });
    await cafeService.transitionCafeLifecycleStage({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
      targetStage: 'CREATED',
      auth: masterUser,
    });

    // Execute Subsystem Provisioning
    const provResult = await cafeService.provisionCafeSubsystems({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
      auth: masterUser,
    });
    assert.equal(provResult.provisioningStatus, 'PROVISIONED');

    // 7.1 Verify Tax Invoice & Receipt Sequence in SequenceCounter
    const fyInfo = resolveFinancialYear();
    const invoiceSeqKey = `GST_INV:32AAACZ9999F1Z1:${fyInfo.fyShort}:${marineCafeId}:INV`;
    const invoiceSeq = await SequenceCounter.findOne({ organisationId: 'ORG-ZAMORIN', sequenceKey: invoiceSeqKey });
    assert.ok(invoiceSeq, 'Tax Invoice Sequence must be pre-provisioned');
    assert.equal(invoiceSeq.prefix, `INV/${fyInfo.fyShort}/${marineCafeId}`);
    assert.equal(invoiceSeq.currentValue, 0);

    // 7.2 Verify Inventory: neutral locations & zero opening quantity
    const inventoryConfigs = await CafeInventoryConfig.find({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
    });
    assert.ok(inventoryConfigs.length > 0, 'Inventory items must be provisioned');
    for (const item of inventoryConfigs) {
      assert.equal(item.currentQuantityBase, 0, 'Opening stock must strictly be 0');
      assert.equal(item.availableQuantityBase, 0);
      assert.equal(item.primaryLocation, 'Main Store');
      assert.deepEqual(item.storageLocations, ['Main Store', 'Cold Room']);
    }

    // 7.3 Verify Legacy PIN: Zero PIN reservations created
    const pinRes = await CafePinReservation.findOne({ cafeId: marineCafeId });
    assert.equal(pinRes, null, 'No PIN reservation should exist for new cafes');

    const access = await CafeAccess.findOne({ cafeId: marineCafeId }).select('+permanentCafePinEncrypted');
    assert.ok(access);
    assert.equal(access.permanentCafePinEncrypted, undefined);

    // 7.4 Idempotent Retry: Running provisioning a second time does NOT duplicate or crash
    const retryResult = await cafeService.provisionCafeSubsystems({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafeId,
      auth: masterUser,
    });
    assert.equal(retryResult.provisioningStatus, 'PROVISIONED');
    const invoiceSeqCount = await SequenceCounter.countDocuments({ organisationId: 'ORG-ZAMORIN', sequenceKey: invoiceSeqKey });
    assert.equal(invoiceSeqCount, 1, 'Idempotent provisioning must not duplicate sequences');
  });

  // ---------------------------------------------------------------------------
  // 8. VERIFY AND ACTIVATE LIFECYCLE
  // ---------------------------------------------------------------------------
  await t.test('8. Verify & Activate: Automated verification succeeds, future scheduled handling, audit trail', async () => {
    // Find Marine Drive cafe provisioned in test 7
    const marineCafe = await Cafe.findOne({ name: 'Zamorin Marine Drive' });
    assert.ok(marineCafe);
    assert.equal(marineCafe.lifecycleStage, 'PROVISIONED');

    // Run Automated Verification
    const verifyResult = await cafeService.verifyCafeProvisioning({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafe.cafeId,
      auth: masterUser,
    });
    assert.equal(verifyResult.verified, true);
    assert.equal(verifyResult.cafe.lifecycleStage, 'VERIFIED');

    // Run Final Activation
    const activateResult = await cafeService.activateCafeLifecycle({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafe.cafeId,
      reason: 'All checks verified and ready for commercial operations',
      auth: masterUser,
    });
    assert.equal(activateResult.cafe.status, 'ACTIVE');
    assert.equal(activateResult.cafe.lifecycleStage, 'ACTIVATED');
    assert.ok(activateResult.cafe.activatedAt);
    assert.equal(activateResult.cafe.activatedBy, masterUser.userId);

    // Verify comprehensive audit trail
    const auditLogs = await AuditEvent.find({
      organisationId: 'ORG-ZAMORIN',
      cafeId: marineCafe.cafeId,
    });
    assert.ok(auditLogs.length >= 2, 'Material events must be audited');
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes('CAFE_DRAFT_CREATED'));
    assert.ok(actions.includes('CAFE_ACTIVATED'));
  });

  // ---------------------------------------------------------------------------
  // 9. SIMULATED PROVISIONING FAILURE & SAFE RECOVERY
  // ---------------------------------------------------------------------------
  await t.test('9. Failure & Rollback: Verification failure triggers PROVISIONING_FAILED and blocks activation', async () => {
    const failDraft = await cafeService.createCafeDraft({
      auth: masterUser,
      cafeData: {
        name: 'Failure Recovery Lab',
        displayName: 'Fail Lab',
        cafeType: 'CAFE',
        city: 'Kozhikode',
      },
    });
    const failCafeId = failDraft.cafe.cafeId;

    // Simulate corrupted state: Incomplete address, missing invoice sequence
    failDraft.cafe.lifecycleStage = 'PROVISIONED';
    await failDraft.cafe.save();

    // Verify fails
    const verRes = await cafeService.verifyCafeProvisioning({
      organisationId: 'ORG-ZAMORIN',
      cafeId: failCafeId,
      auth: masterUser,
    });
    assert.equal(verRes.verified, false);
    assert.equal(verRes.cafe.lifecycleStage, 'PROVISIONING_FAILED');

    // Attempt to activate must fail closed
    await assert.rejects(
      async () => {
        await cafeService.activateCafeLifecycle({
          organisationId: 'ORG-ZAMORIN',
          cafeId: failCafeId,
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
});
