'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { Cafe } = require('../src/models/Cafe');
const CafeTemplate = require('../src/models/CafeTemplate');
const DailyClosePack = require('../src/models/DailyClosePack');
const { Bill } = require('../src/models/Bill');
const { MenuPriceProposal } = require('../src/models/MenuPriceProposal');
const { CustomerComplaint } = require('../src/models/CustomerComplaint');
const { CafeInventoryConfig } = require('../src/models/CafeInventoryConfig');
const { StockMovement } = require('../src/models/StockMovement');
const { InventoryLot } = require('../src/models/InventoryLot');
const { User } = require('../src/models/User');

const cafeController = require('../src/controllers/cafeController');
const dailyCloseController = require('../src/controllers/dailyCloseController');
const ownerMenuPricingController = require('../src/controllers/ownerMenuPricingController');
const ownerComplaintsController = require('../src/controllers/ownerComplaintsController');
const inventoryController = require('../src/controllers/inventoryController');
const posOrderService = require('../src/services/posOrderService');
const { authenticatePassword, hashPassword } = require('../src/services/authService');

const ORG_ID = 'ORG-ZAMORIN';
const CAFE_A = 'ZC-CAF-0001';
const CAFE_B = 'ZC-CAF-0002';

const MASTER_AUTH = {
  userId: 'MU-TEST-MASTER',
  role: 'MASTER',
  isPrimaryMaster: true,
  organisationId: ORG_ID,
  assignedCafeIds: [CAFE_A, CAFE_B],
};

const OWNER_AUTH = {
  userId: 'OU-TEST-OWNER',
  role: 'OWNER',
  organisationId: ORG_ID,
  assignedCafeIds: [CAFE_A, CAFE_B],
};

const CASHIER_AUTH = {
  userId: 'ST-TEST-CASHIER',
  role: 'CAFE_ADMIN',
  organisationId: ORG_ID,
  assignedCafeIds: [CAFE_A],
  primaryCafeId: CAFE_A,
};

let mongoReplSet;

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function invoke(controllerFn, req, res) {
  return new Promise((resolve, reject) => {
    const next = (err) => (err ? reject(err) : resolve());
    Promise.resolve(controllerFn(req, res, next)).then(resolve).catch(reject);
  });
}

describe('CONSOLIDATED MASTER OPTIONS: Templates, Cutoff, Daily Close, Owner Gaps & Connected Ops', () => {
  before(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());

    const collections = [
      'cafes',
      'cafe_templates',
      'daily_close_packs',
      'bills',
      'menu_price_proposals',
      'customer_complaints',
      'cafe_inventory_configs',
      'stock_movements',
      'inventory_lots',
    ];
    for (const c of collections) {
      try {
        await mongoose.connection.createCollection(c);
      } catch {}
    }
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoReplSet.stop();
  });

  beforeEach(async () => {
    await Cafe.deleteMany({});
    await CafeTemplate.deleteMany({});
    await DailyClosePack.deleteMany({});
    await Bill.deleteMany({});
    await MenuPriceProposal.deleteMany({});
    await CustomerComplaint.deleteMany({});
    await CafeInventoryConfig.deleteMany({});
    await StockMovement.deleteMany({});
    await InventoryLot.deleteMany({});

    // Seed test cafes
    await Cafe.create([
      {
        cafeId: CAFE_A,
        name: 'Patio Central',
        displayName: 'Patio Central',
        organisationId: ORG_ID,
        status: 'ACTIVE',
        businessDayCutoffHour: 4,
        createdBy: MASTER_AUTH.userId,
      },
      {
        cafeId: CAFE_B,
        name: 'Express Roastery',
        displayName: 'Express Roastery',
        organisationId: ORG_ID,
        status: 'ACTIVE',
        businessDayCutoffHour: 4,
        createdBy: MASTER_AUTH.userId,
      },
    ]);
  });

  // ─── 1. Café Configuration Templates ─────────────────────────────────────────
  describe('1. Café Configuration Templates (Chapter 22)', () => {
    it('creates a new template with cutoff hour and approval limits', async () => {
      const req = {
        auth: MASTER_AUTH,
        body: {
          name: 'Standard Metro Blueprint',
          businessDayCutoffHour: 5,
          approvalLimits: {
            purchaseOrderPaisa: 5000000,
            inventoryAdjustmentPaisa: 1000000,
          },
          isDefault: true,
        },
      };
      const res = createMockResponse();
      await invoke(cafeController.createCafeTemplate, req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Standard Metro Blueprint');
      assert.equal(res.body.data.businessDayCutoffHour, 5);
      assert.equal(res.body.data.isDefault, true);

      // Verify listing returns it
      const listReq = { auth: MASTER_AUTH };
      const listRes = createMockResponse();
      await invoke(cafeController.listCafeTemplates, listReq, listRes);
      assert.equal(listRes.statusCode, 200);
      assert.equal(listRes.body.data.length, 1);
    });

    it('previews overrides and applies template to a café', async () => {
      const tpl = await CafeTemplate.create({
        templateId: 'TPL-TEST-001',
        name: 'Flagship Template',
        organisationId: ORG_ID,
        businessDayCutoffHour: 3,
        approvalLimits: { purchaseOrderPaisa: 7500000, inventoryAdjustmentPaisa: 2500000 },
        isDefault: false,
      });

      // Preview overrides
      const prevReq = {
        auth: MASTER_AUTH,
        params: { cafeId: CAFE_A },
        query: { templateId: tpl.templateId },
      };
      const prevRes = createMockResponse();
      await invoke(cafeController.previewTemplateOverrides, prevReq, prevRes);
      assert.equal(prevRes.statusCode, 200);
      assert.equal(prevRes.body.data.templateId, 'TPL-TEST-001');
      assert.equal(prevRes.body.data.inheritedValues.businessDayCutoffHour, 3);

      // Apply template
      const applyReq = {
        auth: MASTER_AUTH,
        params: { cafeId: CAFE_A },
        body: { templateId: tpl.templateId },
      };
      const applyRes = createMockResponse();
      await invoke(cafeController.applyTemplateToCafe, applyReq, applyRes);
      assert.equal(applyRes.statusCode, 200);
      assert.equal(applyRes.body.success, true);

      // Verify cafe in DB
      const cafeDoc = await Cafe.findOne({ cafeId: CAFE_A });
      assert.equal(cafeDoc.templateId, 'TPL-TEST-001');
      assert.equal(cafeDoc.businessDayCutoffHour, 3);
    });
  });

  // ─── 2. Configurable Business-Day Cutoff Logic ─────────────────────────────
  describe('2. Business-Day Cutoff Hour Logic', () => {
    it('rolls back business date when timestamp is before cutoff hour', () => {
      // 2026-09-22 01:30 AM IST (cutoff 4:00 AM) -> should be 2026-09-21
      const earlyMorning = new Date('2026-09-21T20:00:00.000Z'); // 20:00 UTC = 01:30 AM IST next calendar day
      const businessDate = posOrderService.getIstBusinessDate(earlyMorning, 4);
      assert.equal(businessDate, '2026-09-21');
    });

    it('keeps same calendar date when timestamp is after cutoff hour', () => {
      // 2026-09-22 10:30 AM IST (cutoff 4:00 AM) -> should be 2026-09-22
      const morning = new Date('2026-09-22T05:00:00.000Z'); // 05:00 UTC = 10:30 AM IST
      const businessDate = posOrderService.getIstBusinessDate(morning, 4);
      assert.equal(businessDate, '2026-09-22');
    });
  });

  // ─── 3. Daily Close Pack Lifecycle ──────────────────────────────────────────
  describe('3. Daily Close Pack Review & Variance Workflow (Chapter 9)', () => {
    it('submits a balanced close pack and transitions to PENDING_REVIEW', async () => {
      const req = {
        auth: CASHIER_AUTH,
        body: {
          cafeId: CAFE_A,
          businessDate: '2026-09-21',
          grossSalesPaisa: 5400000,
          netSalesPaisa: 5100000,
          cashCollectedPaisa: 2500000,
          cashCountedPaisa: 2500000,
          depositChallanNumber: 'CHAL-98765',
          bankName: 'HDFC Bank',
          depositAmountPaisa: 2500000,
          depositSlipAttached: true,
        },
      };
      const res = createMockResponse();
      await invoke(dailyCloseController.submitDailyClosePack, req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'PENDING_REVIEW');
      assert.equal(res.body.data.variancePaisa, 0);
    });

    it('rejects submission with non-zero variance when explanation is omitted', async () => {
      const req = {
        auth: CASHIER_AUTH,
        body: {
          cafeId: CAFE_A,
          businessDate: '2026-09-21',
          grossSalesPaisa: 5400000,
          netSalesPaisa: 5100000,
          cashCollectedPaisa: 2500000,
          cashCountedPaisa: 2450000, // -₹50 variance
          varianceExplanation: '', // missing
        },
      };
      const res = createMockResponse();
      await assert.rejects(
        async () => {
          await invoke(dailyCloseController.submitDailyClosePack, req, res);
        },
        (err) => {
          assert.equal(err.code, 'VARIANCE_EXPLANATION_REQUIRED');
          return true;
        }
      );
    });

    it('accepts non-zero variance when valid explanation is provided', async () => {
      const req = {
        auth: CASHIER_AUTH,
        body: {
          cafeId: CAFE_A,
          businessDate: '2026-09-21',
          grossSalesPaisa: 5400000,
          netSalesPaisa: 5100000,
          cashCollectedPaisa: 2500000,
          cashCountedPaisa: 2450000,
          varianceExplanation: 'Shortage of ₹50 in till due to small change shortage at register 2.',
        },
      };
      const res = createMockResponse();
      await invoke(dailyCloseController.submitDailyClosePack, req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.data.variancePaisa, -50000);
      assert.equal(res.body.data.varianceExplanation.includes('Shortage of ₹50'), true);
    });

    it('allows Owner to Return with notes, and subsequently Acknowledge', async () => {
      const pack = await DailyClosePack.create({
        packId: 'DCP-20260921-0001',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        businessDate: '2026-09-21',
        submittedByUserId: CASHIER_AUTH.userId,
        submittedByRole: CASHIER_AUTH.role,
        grossSalesPaisa: 4000000,
        netSalesPaisa: 3800000,
        cashCollectedPaisa: 2000000,
        cashCountedPaisa: 2000000,
        variancePaisa: 0,
        status: 'PENDING_REVIEW',
      });

      // 1. Return with notes
      const returnReq = {
        auth: OWNER_AUTH,
        params: { packId: pack.packId },
        body: {
          action: 'RETURN',
          reviewNotes: 'Please attach the official bank deposit stamp counterfoil.',
        },
      };
      const returnRes = createMockResponse();
      await invoke(dailyCloseController.reviewDailyClosePack, returnReq, returnRes);

      assert.equal(returnRes.statusCode, 200);
      assert.equal(returnRes.body.data.status, 'RETURNED');
      assert.equal(returnRes.body.data.reviewNotes, 'Please attach the official bank deposit stamp counterfoil.');

      // 2. Acknowledge
      const ackReq = {
        auth: OWNER_AUTH,
        params: { packId: pack.packId },
        body: {
          action: 'ACKNOWLEDGE',
          reviewNotes: 'Counterfoil verified. Acknowledged.',
        },
      };
      const ackRes = createMockResponse();
      await invoke(dailyCloseController.reviewDailyClosePack, ackReq, ackRes);

      assert.equal(ackRes.statusCode, 200);
      assert.equal(ackRes.body.data.status, 'ACKNOWLEDGED');
      assert.equal(ackRes.body.data.reviewedByUserId, OWNER_AUTH.userId);
    });
  });

  // ─── 4. Owner Menu Price Proposals Listing ──────────────────────────────────
  describe('4. Owner Menu Pricing Proposals (OF01)', () => {
    it('lists menu price proposals for Owner review', async () => {
      await MenuPriceProposal.create({
        proposalId: 'MPP-001',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        menuItemId: 'ITEM-ESPRESSO',
        itemName: 'Espresso',
        currentPrice: 150,
        proposedPrice: 170,
        effectiveFrom: new Date(),
        status: 'REVIEW',
        rationale: 'Milk and Arabica bean cost inflation',
        proposedByUserId: 'CHEF-01',
      });

      const req = {
        auth: OWNER_AUTH,
        query: { cafeId: CAFE_A },
      };
      const res = createMockResponse();
      await invoke(ownerMenuPricingController.listPriceProposals.bind(ownerMenuPricingController), req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].proposalId, 'MPP-001');
    });
  });

  // ─── 5. Customer Compensation Execution Linkage ─────────────────────────────
  describe('5. Customer Compensation & Complaint Resolution (OF05)', () => {
    it('transitions complaint to RESOLVED with service recovery notes', async () => {
      const complaint = await CustomerComplaint.create({
        complaintId: 'CMP-2026-001',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        customerName: 'Aarav Patel',
        customerPhone: '9876543210',
        channel: 'CAFE_IN_PERSON',
        severity: 'MEDIUM',
        status: 'ACTIONED',
        description: 'Cold cappuccino served at table 4',
      });

      const req = {
        auth: OWNER_AUTH,
        params: { complaintId: complaint.complaintId },
        body: {
          status: 'RESOLVED',
          notes: 'Beverage replaced and guest offered store credit',
        },
      };
      const res = createMockResponse();
      await invoke(ownerComplaintsController.updateComplaintStatus.bind(ownerComplaintsController), req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'RESOLVED');
    });
  });

  // ─── 6. Inter-Café Stock Transfer Operations ───────────────────────────────
  describe('6. Inter-Café Stock Transfer Dispatch and Receipt', () => {
    it('creates stock movement on transfer dispatch and receipt reconciliation', async () => {
      // Seed source & destination inventory items
      await CafeInventoryConfig.create({
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        itemId: 'INV-COFFEE-BEANS',
        currentQuantityBase: 50,
        availableQuantityBase: 50,
      });
      await CafeInventoryConfig.create({
        organisationId: ORG_ID,
        cafeId: CAFE_B,
        itemId: 'INV-COFFEE-BEANS',
        currentQuantityBase: 0,
        availableQuantityBase: 0,
      });

      // 1. Create transfer request
      const createReq = {
        auth: CASHIER_AUTH,
        body: {
          sourceCafeId: CAFE_A,
          destCafeId: CAFE_B,
          itemId: 'INV-COFFEE-BEANS',
          requestedQty: 10,
          reason: 'Transfer 10kg beans to replenish roastery',
        },
      };
      const createRes = createMockResponse();
      await invoke(inventoryController.createTransfer, createReq, createRes);
      assert.equal(createRes.statusCode, 201);
      const transferId = createRes.body.transfer.transferId;

      // 2. Dispatch transfer from CAFE_A
      const dispatchReq = {
        auth: CASHIER_AUTH,
        params: { transferId },
      };
      const dispatchRes = createMockResponse();
      await invoke(inventoryController.dispatchTransfer, dispatchReq, dispatchRes);
      assert.equal(dispatchRes.statusCode, 200);

      // Verify stock deducted at source
      const sourceConfig = await CafeInventoryConfig.findOne({ cafeId: CAFE_A, itemId: 'INV-COFFEE-BEANS' });
      assert.equal(sourceConfig.currentQuantityBase, 40);

      // 3. Receive 10 KG at CAFE_B
      const receiveReq = {
        auth: { ...CASHIER_AUTH, assignedCafeIds: [CAFE_B], primaryCafeId: CAFE_B },
        params: { transferId },
        body: {
          receivedQty: 10,
        },
      };
      const receiveRes = createMockResponse();
      await invoke(inventoryController.receiveTransfer, receiveReq, receiveRes);
      assert.equal(receiveRes.statusCode, 200);

      // Verify stock credited at destination
      const destConfig = await CafeInventoryConfig.findOne({ cafeId: CAFE_B, itemId: 'INV-COFFEE-BEANS' });
      assert.equal(destConfig.currentQuantityBase, 10);
    });
  });

  describe('7. User Identifier Authentication & Password Recovery (Chapter 6 & T01)', () => {
    beforeEach(async () => {
      await User.deleteMany({ organisationId: ORG_ID });
      const pwdHash = await hashPassword('Zamorin@Pass123');
      await User.create({
        userId: 'MU-0001',
        name: 'Primary Master User',
        email: 'primary.master@zamorin.local',
        role: 'MASTER',
        isPrimaryMaster: true,
        primaryMasterDesignatedAt: new Date(),
        primaryMasterDesignatedBy: 'SYSTEM_BOOTSTRAP',
        primaryMasterDesignationReason: 'Founding Primary Master initialization',
        accountStatus: 'ACTIVE',
        organisationId: ORG_ID,
        createdBy: 'SYSTEM',
        passwordHash: pwdHash,
      });
      await User.create({
        userId: 'EMP-ZC-0001',
        name: 'Barista Staff One',
        email: 'barista.one@zamorin.local',
        role: 'STAFF',
        accountStatus: 'ACTIVE',
        organisationId: ORG_ID,
        primaryCafeId: CAFE_A,
        createdBy: 'SYSTEM',
        passwordHash: pwdHash,
      });
    });

    it('authenticates master with canonical userId (MU-0001) in addition to email', async () => {
      const result = await authenticatePassword({
        organisationId: ORG_ID,
        email: 'MU-0001',
        password: 'Zamorin@Pass123',
      });
      assert.ok(result.user);
      assert.equal(result.user.userId, 'MU-0001');
      assert.equal(result.user.email, 'primary.master@zamorin.local');
    });

    it('authenticates staff with employee-format userId (EMP-ZC-0001) in addition to email', async () => {
      const result = await authenticatePassword({
        organisationId: ORG_ID,
        email: 'EMP-ZC-0001',
        password: 'Zamorin@Pass123',
      });
      assert.ok(result.user);
      assert.equal(result.user.userId, 'EMP-ZC-0001');
      assert.equal(result.user.email, 'barista.one@zamorin.local');
    });

    it('rejects invalid password when authenticating with userId', async () => {
      await assert.rejects(
        async () => {
          await authenticatePassword({
            organisationId: ORG_ID,
            email: 'MU-0001',
            password: 'WrongPassword456',
          });
        },
        (err) => {
          assert.equal(err.message, 'Invalid email or password.');
          return true;
        }
      );
    });
  });
});

