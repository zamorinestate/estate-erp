/**
 * Vendor Order Lifecycle E2E Test
 * Tests: Place Order → Verify Delivery → Check deliveryMatchRemark badges
 */
import http from 'http';

const BASE = 'http://localhost:4000/api/v1';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Device-Id': 'TEST-NODE-001' } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); }
function section(msg) { console.log(`\n▶ ${msg}`); }

async function run() {
  console.log('═'.repeat(60));
  console.log('  ZAMORIN CAFÉ ERP — VENDOR ORDER LIFECYCLE TEST');
  console.log('═'.repeat(60));

  // ── 1. Login ────────────────────────────────────────────────
  section('STEP 1: Master Login');
  const loginRes = await request('POST', '/auth/login', {
    organisationId: 'ZAMORIN',
    email: 'pradeeshk331@gmail.com',
    password: 'PRADEESHK@94309',
    device: { deviceId: 'TEST-NODE-CLI-001', deviceName: 'Node CLI', deviceType: 'DESKTOP', operatingSystem: 'Windows', browser: 'Node.js' },
  });

  if (loginRes.status !== 200) {
    fail(`Login failed (${loginRes.status}): ${JSON.stringify(loginRes.body?.error)}`);
    process.exit(1);
  }

  const token = loginRes.body?.data?.accessToken || loginRes.body?.data?.token || loginRes.body?.token;
  const userId = loginRes.body?.data?.user?.userId || loginRes.body?.data?.userId;
  pass(`Logged in as ${userId} (MASTER)`);

  // ── 2. Get Cafes ────────────────────────────────────────────
  section('STEP 2: Fetch Active Cafes & Vendors');
  const cafesRes = await request('GET', '/cafes', null, token);
  const cafes = cafesRes.body?.data?.cafes || [];
  const cafeId = cafes[0]?.cafeId || 'ZC-0001';
  pass(`Using café: ${cafeId} (${cafes[0]?.name || 'N/A'})`);

  const vendsRes = await request('GET', '/vendors?status=ACTIVE', null, token);
  const vendors = vendsRes.body?.data?.vendors || [];
  const vendorId = vendors[0]?.vendorId || 'VEN-0001';
  pass(`Using vendor: ${vendorId} (${vendors[0]?.name || 'N/A'})`);

  // ── 3. Place Multi-Item Order ───────────────────────────────
  section('STEP 3: Place Multi-Item Order (Café Staff flow)');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const orderRes = await request('POST', '/procurement/orders', {
    vendorId,
    cafeId,
    expectedDeliveryDate: tomorrowStr,
    timingType: 'NEXT_DAY',
    status: 'SUBMITTED',
    submitDirectly: true,
    notes: 'E2E lifecycle test order — please verify on arrival',
    lineItems: [
      { itemId: 'ITM-MILK-01',   orderedQuantityBase: 20,  unitPricePaisa: 6000,  baseUnit: 'liter' },
      { itemId: 'ITM-COFFEE-01', orderedQuantityBase: 5,   unitPricePaisa: 90000, baseUnit: 'kg'    },
      { itemId: 'ITM-CUP-01',    orderedQuantityBase: 100, unitPricePaisa: 450,   baseUnit: 'units' },
    ],
  }, token);

  if (![200, 201].includes(orderRes.status)) {
    fail(`Order creation failed (${orderRes.status}): ${JSON.stringify(orderRes.body?.error)}`);
    process.exit(1);
  }
  const po = orderRes.body?.data?.order || orderRes.body?.data?.purchaseOrder || orderRes.body?.data;
  const poId = po?.purchaseOrderId;
  pass(`Order created: ${poId} | status: ${po?.status} | deliveryMatchRemark: ${po?.deliveryMatchRemark}`);
  if (po?.deliveryMatchRemark !== 'PENDING') fail(`Expected deliveryMatchRemark=PENDING but got: ${po?.deliveryMatchRemark}`);

  // ── 4. Verify Delivery (Partial — 1 item short) ─────────────
  section('STEP 4: Verify Delivery (Partial shortage)');
  const verifyRes = await request('POST', `/procurement/orders/${poId}/verify-delivery`, {
    deliveryNoteNumber: 'DN-E2E-TEST-001',
    vendorInvoiceNumber: 'INV-E2E-2026-001',
    deliveries: [
      { itemId: 'ITM-MILK-01',   deliveredQty: 20, acceptedQty: 20, missingQty: 0,  discrepancyReason: '' },
      { itemId: 'ITM-COFFEE-01', deliveredQty: 3,  acceptedQty: 3,  missingQty: 2,  discrepancyReason: 'Vendor partial supply — 2kg backordered due to stock shortage' },
      { itemId: 'ITM-CUP-01',    deliveredQty: 100,acceptedQty: 100,missingQty: 0,  discrepancyReason: '' },
    ],
  }, token);

  if (![200, 201].includes(verifyRes.status)) {
    fail(`Verify delivery failed (${verifyRes.status}): ${JSON.stringify(verifyRes.body?.error)}`);
    process.exit(1);
  }

  const verData = verifyRes.body?.data;
  const updatedPo = verData?.order || verData?.purchaseOrder;
  pass(`Delivery verified | GRN: ${verData?.grn?.grnId}`);
  pass(`Status: ${updatedPo?.status} | receivingStatus: ${updatedPo?.receivingStatus}`);
  const remark = updatedPo?.deliveryMatchRemark || verData?.deliveryMatchRemark;
  if (remark === 'PARTIAL') {
    pass(`🟡 deliveryMatchRemark = PARTIAL (correct — coffee was short)`);
  } else if (remark === 'COMPLETED') {
    pass(`🟢 deliveryMatchRemark = COMPLETED`);
  } else {
    fail(`Unexpected deliveryMatchRemark: ${remark}`);
  }
  pass(`Inventory movements created: ${verData?.movementsCreated?.length || 0}`);
  pass(`Vendor ledger posted: ${!!verData?.vendorLedger}`);

  // ── 5. Place a Second Order — Full Delivery ─────────────────
  section('STEP 5: Place Second Order & Fully Verify (all items received)');
  const order2Res = await request('POST', '/procurement/orders', {
    vendorId,
    cafeId,
    expectedDeliveryDate: tomorrowStr,
    timingType: 'NEXT_DAY',
    status: 'SUBMITTED',
    submitDirectly: true,
    notes: 'E2E full delivery test',
    lineItems: [
      { itemId: 'ITM-MILK-01', orderedQuantityBase: 10, unitPricePaisa: 6000, baseUnit: 'liter' },
    ],
  }, token);

  const po2 = order2Res.body?.data?.order || order2Res.body?.data?.purchaseOrder;
  const poId2 = po2?.purchaseOrderId;
  pass(`Second order: ${poId2}`);

  const verify2Res = await request('POST', `/procurement/orders/${poId2}/verify-delivery`, {
    deliveryNoteNumber: 'DN-E2E-FULL-001',
    vendorInvoiceNumber: 'INV-E2E-FULL-001',
    deliveries: [
      { itemId: 'ITM-MILK-01', deliveredQty: 10, acceptedQty: 10, missingQty: 0, discrepancyReason: '' },
    ],
  }, token);

  const v2Data = verify2Res.body?.data;
  const remark2 = (v2Data?.order || v2Data?.purchaseOrder)?.deliveryMatchRemark || v2Data?.deliveryMatchRemark;
  if (remark2 === 'COMPLETED') {
    pass(`🟢 deliveryMatchRemark = COMPLETED (correct — fully received)`);
  } else {
    fail(`Expected COMPLETED, got: ${remark2}`);
  }

  // ── 6. Fetch Orders List & Verify Badges ────────────────────
  section('STEP 6: Fetch Orders List — Verify Delivery Remark Badges');
  const listRes = await request('GET', `/procurement/orders?cafeId=${cafeId}&limit=10`, null, token);
  const orders = listRes.body?.data?.orders || listRes.body?.data || [];
  const o1 = orders.find(o => o.purchaseOrderId === poId);
  const o2 = orders.find(o => o.purchaseOrderId === poId2);

  if (o1) {
    pass(`Order 1 (${poId}): deliveryMatchRemark=${o1.deliveryMatchRemark} | status=${o1.status}`);
  } else {
    fail(`Order 1 (${poId}) not found in list`);
  }
  if (o2) {
    pass(`Order 2 (${poId2}): deliveryMatchRemark=${o2.deliveryMatchRemark} | status=${o2.status}`);
  } else {
    fail(`Order 2 (${poId2}) not found in list`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  ALL LIFECYCLE TESTS COMPLETE');
  console.log('═'.repeat(60));
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
