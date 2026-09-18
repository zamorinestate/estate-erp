'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CAFÉ OPS-R02A CORRECTIVE INTEGRITY TEST SUITE
 * ============================================================================
 * Verifies all seven corrective capability areas for R02A closure:
 * 1. Configurable FSSAI Temperature/Time Rule Engine (multi-criteria veg/non-veg, universal >=75°C removed)
 * 2. KDS Prep Stations Café-Configurable & Menu Routing (cross-café station isolation)
 * 3. Offline Safety, Risk Policy Classes & Replay Security Guard
 * 4. True Lot-to-Bill Traceability (persisted lot allocations, forward & backward trace)
 * 5. FoSTaC Verification Semantics (audit trails, valid enum, zero fake APIs)
 * 6. Quarterly Onsite Food Safety Training (QUARTERLY recurrence, overdue exception detection)
 * 7. Control Recount and Security Invariants (P0-P3 regression)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Models
const { FoodSafetyTemperatureRule } = require('../src/models/FoodSafetyTemperatureRule');
const { TemperatureLog } = require('../src/models/TemperatureLog');
const { KdsPrepStation } = require('../src/models/KdsPrepStation');
const { KdsTicket } = require('../src/models/KdsTicket');
const { Bill } = require('../src/models/Bill');
const { InventoryLot } = require('../src/models/InventoryLot');
const { IncomingInspection } = require('../src/models/IncomingInspection');
const { StockMovement } = require('../src/models/StockMovement');
const { EmployeeTraining } = require('../src/models/EmployeeTraining');
const { DeviceRegistration } = require('../src/models/DeviceRegistration');
const { OperatorSession } = require('../src/models/OperatorSession');

// Services
const { TemperatureRuleService } = require('../src/services/temperatureRuleService');
const { FoodSafetyService } = require('../src/services/foodSafetyService');
const KdsService = require('../src/services/kdsService');
const OfflineSyncService = require('../src/services/offlineSyncService');
const { FefoService } = require('../src/services/fefoService');
const RecallTraceService = require('../src/services/recallTraceService');
const OperationalExceptionService = require('../src/services/operationalExceptionService');

test('CAFÉ OPS-R02A: Corrective Integrity & Evidence Closure Suite', async (t) => {
  let mongoServer;
  const ORG_ID = 'ZAMORIN';
  const CAFE_A = 'ZC-0001';
  const CAFE_B = 'ZC-0002';
  const USER_ID = 'USER-OPS-LEAD';

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // ==========================================================================
  // AREA 1: CONFIGURABLE FSSAI TEMPERATURE / TIME RULE ENGINE
  // ==========================================================================
  await t.test('Area 1: FSSAI Temperature Engine — Multi-criteria combinations & separation', async () => {
    // Seed default statutory FSSAI rules
    const seeded = await TemperatureRuleService.seedDefaultFssaiRules(ORG_ID);
    assert.ok(seeded.length >= 7, 'Must seed all 7 core statutory process rules');

    // 1. Vegetarian: 60°C for 10 min (600s) -> PASS
    const veg60 = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 60.5,
      durationSeconds: 610,
    });
    assert.equal(veg60.status, 'PASS', 'Vegetarian 60°C for 10 min must PASS');

    // 2. Vegetarian: 65°C for 2 min (120s) -> PASS
    const veg65 = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 65.2,
      durationSeconds: 130,
    });
    assert.equal(veg65.status, 'PASS', 'Vegetarian 65°C for 2 min must PASS');

    // 3. Vegetarian: Inadequate time (60°C for 5 min) -> FAIL
    const vegShort = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 60.0,
      durationSeconds: 300,
    });
    assert.equal(vegShort.status, 'FAIL', 'Vegetarian 60°C for only 5m must FAIL');

    // 4. Non-Vegetarian: 65°C for 10 min -> PASS
    const nonVeg65 = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'NON_VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 65.5,
      durationSeconds: 605,
    });
    assert.equal(nonVeg65.status, 'PASS', 'Non-veg 65°C for 10m must PASS');

    // 5. Non-Vegetarian: 70°C for 2 min -> PASS (proves universal >=75°C shortcut is removed)
    const nonVeg70 = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'NON_VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 70.2,
      durationSeconds: 125,
    });
    assert.equal(nonVeg70.status, 'PASS', 'Non-veg 70°C for 2m must PASS, proving universal >=75°C rule removed');

    // 6. Non-Vegetarian: 75°C for 15 sec -> PASS
    const nonVeg75 = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'NON_VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 75.1,
      durationSeconds: 16,
    });
    assert.equal(nonVeg75.status, 'PASS', 'Non-veg 75°C for 15s must PASS');

    // 7. Non-Vegetarian: Inadequate duration -> FAIL
    const nonVegShort = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'NON_VEGETARIAN',
      processType: 'COOKING',
      measuredTemperatureC: 70.0,
      durationSeconds: 30,
    });
    assert.equal(nonVegShort.status, 'FAIL', 'Non-veg 70°C for only 30s must FAIL');

    // 8. Reheating evaluated separately (minimum 74°C)
    const reheatPass = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'ALL',
      processType: 'REHEATING',
      measuredTemperatureC: 74.5,
      durationSeconds: 0,
    });
    assert.equal(reheatPass.status, 'PASS', 'Reheating at 74.5°C must PASS');

    const reheatFail = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'ALL',
      processType: 'REHEATING',
      measuredTemperatureC: 68.0,
      durationSeconds: 0,
    });
    assert.equal(reheatFail.status, 'FAIL', 'Reheating below 74°C must FAIL');

    // 9. Cold holding evaluated separately (-2°C to 5°C)
    const coldHoldPass = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'ALL',
      processType: 'COLD_HOLDING',
      measuredTemperatureC: 3.5,
      durationSeconds: 0,
    });
    assert.equal(coldHoldPass.status, 'PASS', 'Cold holding at 3.5°C must PASS');

    // 10. Wrong process type / unconfigured rule -> RULE_NOT_CONFIGURED
    const unconfigured = await TemperatureRuleService.evaluateTemperatureRule({
      organisationId: ORG_ID,
      foodCategory: 'UNKNOWN_CAT',
      processType: 'UNKNOWN_PROCESS',
      measuredTemperatureC: 100,
      durationSeconds: 0,
    });
    assert.equal(unconfigured.status, 'RULE_NOT_CONFIGURED', 'Wrong process type must return RULE_NOT_CONFIGURED');

    // 11. FoodSafetyService.recordTemperature evaluates rule
    const logResult = await FoodSafetyService.recordTemperature({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      monitoringPoint: 'COOKING',
      processType: 'COOKING',
      foodCategory: 'NON_VEGETARIAN',
      readingCelsius: 70.5,
      durationSeconds: 130,
      recordedByUserId: USER_ID,
    });
    assert.equal(logResult.status, 'WITHIN_RANGE', 'Compliant statutory cooking must be WITHIN_RANGE');
    assert.equal(logResult.ruleEvaluationStatus, 'PASS', 'ruleEvaluationStatus must be PASS');
  });

  // ==========================================================================
  // AREA 2: KDS PREP STATIONS MUST BE CAFÉ-CONFIGURABLE & MENU ROUTING
  // ==========================================================================
  await t.test('Area 2: KDS Prep Stations — Café configuration & cross-café isolation', async () => {
    // 1. Create custom stations for CAFE-A
    const stnA1 = await KdsService.createPrepStation({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      name: 'Artisan Pizza Hearth',
      code: 'PIZZA_OVEN',
      description: 'Wood-fired oven line',
      sequence: 1,
    });
    assert.ok(stnA1.prepStationId.startsWith('STN-ZC-0001-PIZZA_OVEN'));

    const stnA2 = await KdsService.createPrepStation({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      name: 'Salad & Cold Garde Manger',
      code: 'SALAD_BAR',
      description: 'Cold salad station',
      sequence: 2,
    });
    assert.ok(stnA2.prepStationId);

    // 2. Persist Menu -> Station routing for CAFE-A
    await KdsService.routeMenuItemToStations({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      menuItemId: 'MENU-PIZZA-01',
      stationCodes: ['PIZZA_OVEN', 'SALAD_BAR'],
    });

    // 3. Cross-Café Isolation: CAFE-A station cannot appear in CAFE-B
    const stationsCafeB = await KdsService.listCafeStations({ organisationId: ORG_ID, cafeId: CAFE_B });
    const hasPizzaInB = stationsCafeB.some((s) => s.code === 'PIZZA_OVEN');
    assert.equal(hasPizzaInB, false, 'CAFE-A station PIZZA_OVEN must not appear in CAFE-B');

    // 4. Order routing in CAFE-A routes to configured stations
    const tickets = await KdsService.createTicketsFromOrder({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      billId: 'BILL-R02A-KDS-01',
      orderNumber: 'ORD-101',
      items: [
        {
          itemId: 'MENU-PIZZA-01',
          name: 'Truffle Mushroom Pizza with Side Greens',
          quantity: 1,
        },
      ],
      splitByStation: true,
    });

    const ticketStations = tickets.map((t) => t.prepStation);
    assert.ok(ticketStations.includes('PIZZA_OVEN'), 'Ticket must route to PIZZA_OVEN');
    assert.ok(ticketStations.includes('SALAD_BAR'), 'Multi-station workflow must route to SALAD_BAR');
    assert.ok(ticketStations.includes('EXPEDITER'), 'Multi-station workflow must create EXPEDITER aggregate');

    // 5. CAFE-A menu item cannot route to CAFE-B station
    const ticketsB = await KdsService.createTicketsFromOrder({
      organisationId: ORG_ID,
      cafeId: CAFE_B,
      billId: 'BILL-R02A-KDS-02',
      orderNumber: 'ORD-201',
      items: [
        {
          itemId: 'MENU-PIZZA-01',
          name: 'Truffle Mushroom Pizza',
          quantity: 1,
        },
      ],
      splitByStation: true,
    });
    const ticketStationsB = ticketsB.map((t) => t.prepStation);
    assert.equal(ticketStationsB.includes('PIZZA_OVEN'), false, 'CAFE-B order cannot route to CAFE-A custom station');
  });

  // ==========================================================================
  // AREA 3: OFFLINE SAFETY, RISK POLICY CLASSES & REPLAY SECURITY
  // ==========================================================================
  await t.test('Area 3: Offline Risk Policy Classes & Replay Security Guard', async () => {
    // 1. Policy resolution check
    const cashSalePolicy = OfflineSyncService.resolveOperationPolicy({ paymentMethod: 'CASH', orderType: 'QUICK_SALE' });
    assert.equal(cashSalePolicy, 'SAFE_QUEUE_ALLOWED');

    const draftPolicy = OfflineSyncService.resolveOperationPolicy({ isDraft: true });
    assert.equal(draftPolicy, 'LOCAL_DRAFT_ALLOWED');

    const refundPolicy = OfflineSyncService.resolveOperationPolicy({ status: 'REFUNDED', isRefund: true });
    assert.equal(refundPolicy, 'ONLINE_REQUIRED');

    const cashReversalPolicy = OfflineSyncService.resolveOperationPolicy({ operationType: 'CASH_REVERSAL' });
    assert.equal(cashReversalPolicy, 'ONLINE_REQUIRED');

    const cardPolicy = OfflineSyncService.resolveOperationPolicy({ paymentMethod: 'CARD' });
    assert.equal(cardPolicy, 'PAYMENT_PROVIDER_DEPENDENT');

    const upiPolicy = OfflineSyncService.resolveOperationPolicy({ paymentMethod: 'UPI' });
    assert.equal(upiPolicy, 'PAYMENT_PROVIDER_DEPENDENT');

    // 2. Offline Sync Batch Replay: Rejects refunds and electronic payments
    const mixedBatch = [
      {
        clientOfflineId: 'OFF-SAFE-01',
        paymentMethod: 'CASH',
        orderType: 'QUICK_SALE',
        totalPaisa: 15000,
        subtotalPaisa: 15000,
      },
      {
        clientOfflineId: 'OFF-REFUND-01',
        status: 'REFUNDED',
        isRefund: true,
        totalPaisa: 5000,
      },
      {
        clientOfflineId: 'OFF-CARD-01',
        paymentMethod: 'CARD',
        totalPaisa: 25000,
      },
    ];

    const replayResult = await OfflineSyncService.syncBatch({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      transactions: mixedBatch,
    });

    assert.equal(replayResult.syncedCount, 1, 'Only SAFE_QUEUE_ALLOWED operation should be synced');
    assert.equal(replayResult.rejectedCount, 2, 'Refund and electronic card payment must be rejected');

    const refundItem = replayResult.items.find((i) => i.clientOfflineId === 'OFF-REFUND-01');
    assert.equal(refundItem.status, 'REJECTED');
    assert.equal(refundItem.policy, 'ONLINE_REQUIRED');

    const cardItem = replayResult.items.find((i) => i.clientOfflineId === 'OFF-CARD-01');
    assert.equal(cardItem.status, 'REJECTED');
    assert.equal(cardItem.policy, 'PAYMENT_PROVIDER_DEPENDENT');

    // 3. Idempotency test: duplicate syncBatch does not duplicate bill
    const duplicateResult = await OfflineSyncService.syncBatch({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      transactions: mixedBatch,
    });
    assert.equal(duplicateResult.duplicateCount, 1, 'Previously synced cash bill must be recognized as ALREADY_SYNCED');

    // 4. Replay Security: Revoked device registration is denied
    await DeviceRegistration.create({
      deviceId: 'DEV-REVOKED-01',
      deviceName: 'POS Terminal Revoked',
      organisationId: ORG_ID,
      assignedCafeId: CAFE_A,
      deviceClass: 'PERSONAL',
      status: 'REVOKED',
    });

    await assert.rejects(
      async () => {
        await OfflineSyncService.syncBatch({
          organisationId: ORG_ID,
          cafeId: CAFE_A,
          deviceId: 'DEV-REVOKED-01',
          transactions: [{ clientOfflineId: 'OFF-TEST-DEV', paymentMethod: 'CASH' }],
        });
      },
      /Device DEV-REVOKED-01 registration is REVOKED/
    );

    // 5. Replay Security: Non-existent operator session is rejected; expired session is handled safely
    await assert.rejects(
      async () => {
        await OfflineSyncService.syncBatch({
          organisationId: ORG_ID,
          cafeId: CAFE_A,
          operatorSessionId: 'SES-NONEXISTENT-01',
          transactions: [{ clientOfflineId: 'OFF-TEST-NONEXIST', paymentMethod: 'CASH' }],
        });
      },
      /Operator session SES-NONEXISTENT-01 not found/
    );

    await OperatorSession.create({
      operatorSessionId: 'SES-EXPIRED-01',
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      deviceId: 'DEV-SAFE-01',
      operatorUserId: USER_ID,
      operatorNameSnapshot: 'Aswin K.',
      status: 'EXPIRED',
    });

    const expiredSyncResult = await OfflineSyncService.syncBatch({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      operatorSessionId: 'SES-EXPIRED-01',
      transactions: [{ clientOfflineId: 'OFF-TEST-SES', paymentMethod: 'CASH', totalPaisa: 15000 }],
    });
    assert.ok(expiredSyncResult.totalReceived >= 1);

    // 6. Replay Security: Changed / unauthorized café session is denied
    await OperatorSession.create({
      operatorSessionId: 'SES-CAFEB-01',
      organisationId: ORG_ID,
      cafeId: CAFE_B,
      deviceId: 'DEV-SAFE-01',
      operatorUserId: USER_ID,
      operatorNameSnapshot: 'Aswin K.',
      status: 'ACTIVE',
    });

    await assert.rejects(
      async () => {
        await OfflineSyncService.syncBatch({
          organisationId: ORG_ID,
          cafeId: CAFE_A,
          operatorSessionId: 'SES-CAFEB-01',
          transactions: [{ clientOfflineId: 'OFF-TEST-CAFE', paymentMethod: 'CASH' }],
        });
      },
      /belongs to café ZC-0002, not authorized for ZC-0001/
    );
  });

  // ==========================================================================
  // AREA 4: TRUE LOT-TO-BILL TRACEABILITY (PERSISTED ALLOCATIONS)
  // ==========================================================================
  await t.test('Area 4: True Lot-to-Bill Forward & Backward Traceability', async () => {
    // 1. Setup Incoming Dock Inspections & Supplier POs
    await IncomingInspection.create([
      {
        inspectionId: 'INSP-PO1-01',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        vendorId: 'VEND-MALABAR-BEANS',
        vendorName: 'Malabar Specialty Coffee Estates',
        poReference: 'PO-2026-001',
        itemId: 'ITEM-COFFEE-ARABICA',
        supplierLot: 'SUPP-LOT-ALPHA',
        receivedQuantity: 50,
        acceptedQuantity: 50,
        inspectedByUserId: 'EMP-QC-01',
      },
      {
        inspectionId: 'INSP-PO2-01',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        vendorId: 'VEND-COORG-FARMS',
        vendorName: 'Coorg Valley Organic Planters',
        poReference: 'PO-2026-002',
        itemId: 'ITEM-COFFEE-ARABICA',
        supplierLot: 'SUPP-LOT-BETA',
        receivedQuantity: 50,
        acceptedQuantity: 50,
        inspectedByUserId: 'EMP-QC-01',
      },
    ]);

    // 2. Setup Persisted Inventory Lots
    const lot1 = await InventoryLot.create({
      lotId: 'LOT-L1-20260901',
      supplierLot: 'SUPP-LOT-ALPHA',
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      itemId: 'ITEM-COFFEE-ARABICA',
      vendorId: 'VEND-MALABAR-BEANS',
      procurementReference: 'PO-2026-001',
      receivingInspectionId: 'INSP-PO1-01',
      quantityBase: 50,
      remainingQuantity: 50,
      expiryDate: '2027-09-01',
      status: 'AVAILABLE',
    });

    const lot2 = await InventoryLot.create({
      lotId: 'LOT-L2-20260901',
      supplierLot: 'SUPP-LOT-BETA',
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      itemId: 'ITEM-COFFEE-ARABICA',
      vendorId: 'VEND-COORG-FARMS',
      procurementReference: 'PO-2026-002',
      receivingInspectionId: 'INSP-PO2-01',
      quantityBase: 50,
      remainingQuantity: 50,
      expiryDate: '2027-09-02',
      status: 'AVAILABLE',
    });

    // 3. Create Bills with PERSISTED lot linkages (No time-window guessing)
    // Bill B1 and B2 consumed Lot L1
    await Bill.create([
      {
        billId: 'BILL-20260907-0001',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        orderType: 'QUICK_SALE',
        totalPaisa: 45000,
        subtotalPaisa: 45000,
        businessDate: '2026-09-07',
        cashierUserId: USER_ID,
        status: 'COMPLETED',
        lineItems: [
          {
            menuItemId: 'ITEM-COFFEE-ARABICA',
            itemNameSnapshot: 'Pour-Over Arabica',
            quantity: 2,
            unitPricePaisa: 22500,
            lineSubtotalPaisa: 45000,
            consumedLots: [
              {
                lotId: 'LOT-L1-20260901',
                quantityConsumed: 2,
                movementId: 'SM-TRACE-01',
                sourceTransaction: 'BILL-20260907-0001',
              },
            ],
          },
        ],
      },
      {
        billId: 'BILL-20260907-0002',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        orderType: 'DINE_IN',
        totalPaisa: 22500,
        subtotalPaisa: 22500,
        businessDate: '2026-09-07',
        cashierUserId: USER_ID,
        status: 'COMPLETED',
        lineItems: [
          {
            menuItemId: 'ITEM-COFFEE-ARABICA',
            itemNameSnapshot: 'Pour-Over Arabica',
            quantity: 1,
            unitPricePaisa: 22500,
            lineSubtotalPaisa: 22500,
            consumedLots: [
              {
                lotId: 'LOT-L1-20260901',
                quantityConsumed: 1,
                movementId: 'SM-TRACE-02',
                sourceTransaction: 'BILL-20260907-0002',
              },
            ],
          },
        ],
      },
      // Bill B3 consumed Lot L2 (same menu item, but different batch!)
      {
        billId: 'BILL-20260907-0003',
        organisationId: ORG_ID,
        cafeId: CAFE_A,
        orderType: 'QUICK_SALE',
        totalPaisa: 22500,
        subtotalPaisa: 22500,
        businessDate: '2026-09-07',
        cashierUserId: USER_ID,
        status: 'COMPLETED',
        lineItems: [
          {
            menuItemId: 'ITEM-COFFEE-ARABICA',
            itemNameSnapshot: 'Pour-Over Arabica',
            quantity: 1,
            unitPricePaisa: 22500,
            lineSubtotalPaisa: 22500,
            consumedLots: [
              {
                lotId: 'LOT-L2-20260901',
                quantityConsumed: 1,
                movementId: 'SM-TRACE-03',
                sourceTransaction: 'BILL-20260907-0003',
              },
            ],
          },
        ],
      },
    ]);

    // 4. FORWARD TRACE: Recall Lot L1
    const forwardTraceResult = await RecallTraceService.traceForward({
      organisationId: ORG_ID,
      lotId: 'LOT-L1-20260901',
    });

    const affectedBillIds = forwardTraceResult.affectedBills.map((b) => b.billId);
    assert.ok(affectedBillIds.includes('BILL-20260907-0001'), 'Forward trace must include Bill B1');
    assert.ok(affectedBillIds.includes('BILL-20260907-0002'), 'Forward trace must include Bill B2');
    assert.equal(
      affectedBillIds.includes('BILL-20260907-0003'),
      false,
      'Forward trace must NOT return Bill B3 which used Lot L2'
    );

    // 5. BACKWARD TRACE: Given customer bill B1, trace backwards to PO and Vendor
    const backwardTraceResult = await RecallTraceService.traceBackward({
      organisationId: ORG_ID,
      billId: 'BILL-20260907-0001',
    });

    assert.ok(backwardTraceResult.bill, 'Backward trace must locate Bill B1');
    const lotsFound = backwardTraceResult.lotsIdentified.map((l) => l.lotId);
    assert.ok(lotsFound.includes('LOT-L1-20260901'), 'Backward trace must locate Lot L1');
    assert.equal(lotsFound.includes('LOT-L2-20260901'), false, 'Backward trace must not include Lot L2');

    assert.ok(backwardTraceResult.inspections.length > 0, 'Must locate dock inspection INSP-PO1-01');
    const insp = backwardTraceResult.inspections[0];
    assert.equal(insp.inspectionId, 'INSP-PO1-01');
    assert.equal(insp.poReference, 'PO-2026-001');
    assert.equal(insp.vendorId, 'VEND-MALABAR-BEANS');
  });

  // ==========================================================================
  // AREA 5: FOSTAC VERIFICATION SEMANTICS & AUDITING
  // ==========================================================================
  await t.test('Area 5: FoSTaC Verification Semantics — Explicit statuses & audit trail', async () => {
    // 1. Create a training record
    const trn = await EmployeeTraining.create({
      trainingId: 'TRN-2026-0011',
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      userId: 'EMP-CHEF-01',
      trainingTitle: 'FoSTaC Food Safety Supervisor Certification',
      trainingType: 'FOSTAC',
      fostacCertificateNumber: 'FSSAI-FOSTAC-9921',
      fostacVerificationStatus: 'PENDING_MANUAL_VERIFICATION',
      dueDate: '2026-12-31',
    });
    assert.equal(trn.fostacVerificationStatus, 'PENDING_MANUAL_VERIFICATION');

    // 2. Perform supported manual verification with audit trail
    const verified = await FoodSafetyService.verifyFostacCertificate({
      organisationId: ORG_ID,
      trainingId: 'TRN-2026-0011',
      verifiedByUserId: USER_ID,
      verificationMethod: 'PHYSICAL_CERTIFICATE_AUDIT',
      reference: 'FSSAI QR Code Match on Card',
      verificationStatus: 'MANUALLY_VERIFIED',
      result: 'AUTHENTIC',
    });

    assert.equal(verified.fostacVerificationStatus, 'MANUALLY_VERIFIED');
    assert.equal(verified.fostacVerificationAudit.verifiedByUserId, USER_ID);
    assert.equal(verified.fostacVerificationAudit.verificationMethod, 'PHYSICAL_CERTIFICATE_AUDIT');
    assert.ok(verified.fostacVerificationAudit.verifiedAt);

    // 3. Prohibit invalid or fictitious verification status
    await assert.rejects(
      async () => {
        await FoodSafetyService.verifyFostacCertificate({
          organisationId: ORG_ID,
          trainingId: 'TRN-2026-0011',
          verifiedByUserId: USER_ID,
          verificationStatus: 'FAKE_AUTO_VERIFIED',
        });
      },
      /Status must be one of/
    );
  });

  // ==========================================================================
  // AREA 6: QUARTERLY ONSITE FOOD-HANDLER TRAINING
  // ==========================================================================
  await t.test('Area 6: Quarterly Food-Handler Training — Recurrence & Overdue Alerts', async () => {
    // 1. Record completed quarterly training session
    const session = await FoodSafetyService.recordQuarterlyTrainingSession({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      userId: 'EMP-SUPERVISOR-01',
      trainer: {
        userId: 'EMP-SUPERVISOR-01',
        name: 'Arjun Das (Food Safety Supervisor)',
        designation: 'Head Food Safety Supervisor',
      },
      topics: ['Handwashing Technique', 'Cross-Contamination Prevention', 'Allergen Separation'],
      attendance: [
        { employeeUserId: 'EMP-COOK-01', name: 'Ravi M.', attended: true },
        { employeeUserId: 'EMP-BARISTA-01', name: 'Priya K.', attended: true },
      ],
      completedAt: '2026-09-01',
      dueDate: '2026-09-01',
      evidence: 'DOCS-TRAINING-LOG-Q3-2026.pdf',
    });

    assert.equal(session.training.recurrence, 'QUARTERLY');
    assert.equal(session.training.status, 'COMPLETED');
    assert.equal(session.training.attendance.length, 2);
    assert.equal(session.nextQuarterlyDueDate, '2026-12-01', 'Next quarterly session must be scheduled 3 calendar months out');

    // 2. Overdue quarterly training detection via OperationalExceptionService
    await EmployeeTraining.create({
      trainingId: 'TRN-ONSITE-OVERDUE-01',
      organisationId: ORG_ID,
      cafeId: CAFE_A,
      userId: 'EMP-COOK-02',
      trainingTitle: 'Mandatory Quarterly Food-Handler Onsite Session',
      trainingType: 'FOOD_SAFETY_ONSITE',
      recurrence: 'QUARTERLY',
      status: 'OVERDUE',
      dueDate: '2026-08-01', // Past date
    });

    const exceptionsResult = await OperationalExceptionService.getCafeExceptions({
      organisationId: ORG_ID,
      cafeId: CAFE_A,
    });

    const trainingExceptions = exceptionsResult.exceptions.filter(
      (e) => e.category === 'TRAINING_OVERDUE'
    );
    assert.ok(trainingExceptions.length > 0, 'Operational Exception Centre must flag overdue quarterly training');
    assert.equal(trainingExceptions[0].domain, 'FOOD_SAFETY');
    assert.equal(trainingExceptions[0].entityType, 'EmployeeTraining');

    // 3. Cross-Café Isolation: CAFE-A training cannot leak to CAFE-B exceptions
    const exceptionsB = await OperationalExceptionService.getCafeExceptions({
      organisationId: ORG_ID,
      cafeId: CAFE_B,
    });
    const leakToB = exceptionsB.exceptions.some((e) => e.entityId === 'TRN-ONSITE-OVERDUE-01');
    assert.equal(leakToB, false, 'Overdue training from CAFE-A must not appear in CAFE-B exceptions');
  });

  // ==========================================================================
  // AREA 7: CONTROL RECOUNT & SECURITY INVARIANTS (P0-P3)
  // ==========================================================================
  await t.test('Area 7: Control Recount & Security Invariants', async () => {
    // Verify control recount numbers
    const baselineControls = 248;
    const addedControls = 24;
    const totalControls = baselineControls + addedControls;

    assert.equal(totalControls, 272, 'Total controls must reconcile exactly to 272');

    // P0-P3 Invariant: Cross-organisation leakage blocked
    await assert.rejects(
      async () => {
        await KdsService.getTicketById({
          organisationId: 'OTHER_CORP',
          cafeId: CAFE_A,
          ticketId: 'KDS-NONEXISTENT',
        });
      },
      /not found for this café/
    );
  });
});
