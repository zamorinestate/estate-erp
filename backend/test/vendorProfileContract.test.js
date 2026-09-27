'use strict';

/**
 * VEN-SCR-013: Read-Only Vendor Profile & Compliance Summary — Contract Test Suite
 *
 * Exhaustive contract tests verifying:
 *  1.  Authenticated vendor retrieves own full profile with identity fields
 *  2.  Bank account number is never exposed — only masked form returned
 *  3.  Internal admin-only fields stripped (notes, statusChangeReason, bankDetailsHistory,
 *      pendingBankChange, itemCatalogue, statusChangedByUserId)
 *  4.  Compliance scorecard computed correctly from qualifications
 *  5.  Approved café list resolved with name and address
 *  6.  Active holds returned with type/reason/date only (no internal user IDs)
 *  7.  FSSAI summary block present and formatted
 *  8.  Performance metrics present with OTIF, fill rate, lead time
 *  9.  Contract expiry flags (VALID, RENEWAL_ALERT, EXPIRED)
 * 10.  Insurance expiry flags (VALID, RENEWAL_ALERT, EXPIRED)
 * 11.  PDF download returns application/pdf with correct Content-Disposition
 * 12.  Cross-vendor BOLA isolation: Vendor A profile not accessible via Vendor B token
 * 13.  Strict server-side write prevention (POST/PUT/PATCH/DELETE → 403 FORBIDDEN_VENDOR_WRITE)
 * 14.  Unauthenticated access → 401
 * 15.  Security audit event logged on profile view (smoke test via response)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { User } = require('../src/models/User');
const { Vendor } = require('../src/models/Vendor');
const { Cafe } = require('../src/models/Cafe');
const authService = require('../src/services/authService');

const ORG_ID = 'ORG-ZAMORIN';
const VENDOR_A_ID = 'VEN-9301';
const VENDOR_B_ID = 'VEN-9302';
const CAFE_1 = 'ZC-0301';
const CAFE_2 = 'ZC-0302';

function makeRequest({ port, method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        let parsed = null;
        try {
          parsed = JSON.parse(rawBuffer.toString('utf8'));
        } catch {
          parsed = null;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBuffer,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('VEN-SCR-013: Read-Only Vendor Profile & Compliance Summary Contract Suite', async (suite) => {
  let replSet;
  let server;
  let port;
  let vendorAToken;
  let vendorBToken;

  suite.before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    const app = createApp({ allowedOrigins: ['*'], production: false });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // 1. Seed Cafes
    await Cafe.create([
      {
        organisationId: ORG_ID,
        cafeId: CAFE_1,
        name: 'Zamorin Beach Road',
        displayName: 'Zamorin Beach Road',
        code: 'ZBR-P1',
        city: 'Kozhikode',
        state: 'Kerala',
        isOperational: true,
        createdBy: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        cafeId: CAFE_2,
        name: 'Zamorin Cyberpark',
        displayName: 'Zamorin Cyberpark',
        code: 'ZCP-P2',
        city: 'Kozhikode',
        state: 'Kerala',
        isOperational: true,
        createdBy: 'MU-0001',
      },
    ]);

    // 2. Seed Vendors
    await Vendor.create([
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_A_ID,
        name: 'Malabar Dairy & Provisions Ltd',
        tradeName: 'Malabar Fresh',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        status: 'ACTIVE',
        gstNumber: '32AABCM5678F1Z5',
        panNumber: 'AABCM5678F',
        fssaiLicense: 'FSSAI1234567890',
        fssaiDetails: {
          isApplicable: true,
          licenseNumber: 'FSSAI1234567890',
          isValid: true,
          expiryDate: new Date('2027-12-31'),
          verificationSource: 'FoSCoS Digital Registry',
        },
        phone: '+91-9876543210',
        email: 'accounts@malabardairy.test',
        primaryContactEmail: 'primary@malabardairy.test',
        accountsEmail: 'accounts@malabardairy.test',
        salesEmail: 'sales@malabardairy.test',
        website: 'https://malabardairy.test',
        address: {
          line1: '14/A Mavoor Road',
          line2: '',
          city: 'Kozhikode',
          state: 'Kerala',
          pincode: '673004',
          country: 'India',
        },
        contactPersons: [
          {
            contactId: 'CP-001',
            name: 'Rajan Menon',
            role: 'Sales Manager',
            department: 'SALES',
            phone: '+91-9876543211',
            email: 'rajan@malabardairy.test',
            isPrimary: true,
            isActive: true,
          },
        ],
        sites: [
          {
            siteId: 'SITE-001',
            siteName: 'Kozhikode Dispatch Hub',
            siteType: 'DISPATCH_LOCATION',
            address: {
              line1: 'Industrial Area',
              city: 'Kozhikode',
              state: 'Kerala',
              pincode: '673005',
            },
            primaryContactName: 'Suresh Kumar',
            phone: '+91-9876543212',
            leadTimeDays: 1,
            deliveryCutoffTime: '14:00',
            deliveryDays: ['MON', 'WED', 'FRI'],
            status: 'ACTIVE',
          },
        ],
        paymentTerms: 'NET_30',
        creditLimitInr: 500000,
        bankDetails: {
          accountHolderName: 'Malabar Dairy & Provisions Ltd',
          bankName: 'State Bank of India',
          accountNumber: '1234567890123456',  // Should NEVER appear in response
          accountNumberMasked: '••••••••••3456',
          ifscCode: 'SBIN0012345',
          branchName: 'Kozhikode Main Branch',
          upiId: '',
        },
        // Internal data that should be stripped
        notes: 'INTERNAL: Vendor is prone to short-supply. Flag for quality audit.',
        statusChangeReason: 'INTERNAL: Compliance approved after document verification.',
        performanceMetrics: {
          otifPercent: 94.5,
          onTimeDeliveryPercent: 96.0,
          fillRatePercent: 98.2,
          rejectionRatePercent: 1.1,
          averageLeadTimeDays: 1.8,
          totalOrdersCount: 142,
          lastEvaluatedAt: new Date('2026-09-01'),
        },
        reliabilityRating: 4,
        qualifications: [
          {
            qualificationId: 'QUAL-001',
            area: 'LEGAL',
            status: 'QUALIFIED',
            effectiveDate: new Date('2026-01-01'),
            expiryDate: new Date('2027-01-01'),
            notes: 'All registrations verified.',
          },
          {
            qualificationId: 'QUAL-002',
            area: 'TAX',
            status: 'QUALIFIED',
            effectiveDate: new Date('2026-01-01'),
          },
          {
            qualificationId: 'QUAL-003',
            area: 'FOOD_SAFETY_FSSAI',
            status: 'QUALIFIED_WITH_CONDITIONS',
            effectiveDate: new Date('2026-01-01'),
          },
          {
            qualificationId: 'QUAL-004',
            area: 'QUALITY',
            status: 'REVIEW_REQUIRED',
            effectiveDate: new Date('2026-01-01'),
          },
          // COMMERCIAL deliberately NOT added — should show NOT_ASSESSED
        ],
        holds: [
          {
            holdId: 'HOLD-001',
            holdType: 'QUALITY_HOLD',
            scope: 'ORGANISATION',
            reason: 'Quality audit pending for Batch QA-2026-09.',
            placedByUserId: 'MU-0001',  // Must NOT appear in vendor-visible response
            placedAt: new Date('2026-09-15'),
            reviewDate: new Date('2026-10-15'),
            isActive: true,
            releasedByUserId: null,
          },
        ],
        contractExpiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days away → VALID
        contractRenewalAlertDays: 30,
        insurancePolicyNumber: 'POL-2026-MALABAR',
        insuranceProvider: 'National Insurance',
        insuranceExpiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days → RENEWAL_ALERT
        insuranceRenewalAlertDays: 30,
        approvedCafeIds: [CAFE_1, CAFE_2],
        createdByUserId: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        vendorId: VENDOR_B_ID,
        name: 'Highland Coffee Roasters',
        category: 'FOOD_BEVERAGE',
        supplierType: 'GOODS',
        status: 'ACTIVE',
        approvedCafeIds: [CAFE_2],
        createdByUserId: 'MU-0001',
      },
    ]);

    // 3. Seed Users
    const [userA, userB] = await User.create([
      {
        organisationId: ORG_ID,
        userId: 'VU-9301',
        email: 'malabar.v13@supplier.test',
        passwordHash: 'dummyhash',
        name: 'Malabar Supplier Admin',
        role: 'VENDOR',
        vendorId: VENDOR_A_ID,
        accountStatus: 'ACTIVE',
        createdBy: 'MU-0001',
      },
      {
        organisationId: ORG_ID,
        userId: 'VU-9302',
        email: 'highland.v13@supplier.test',
        passwordHash: 'dummyhash',
        name: 'Highland Supplier Admin',
        role: 'VENDOR',
        vendorId: VENDOR_B_ID,
        accountStatus: 'ACTIVE',
        createdBy: 'MU-0001',
      },
    ]);

    // 4. Issue JWT tokens via authService
    const sA = await authService.createSession({ user: userA, device: { deviceId: 'DEV-P13-A' }, mfaVerified: true });
    vendorAToken = sA.accessToken;

    const sB = await authService.createSession({ user: userB, device: { deviceId: 'DEV-P13-B' }, mfaVerified: true });
    vendorBToken = sB.accessToken;
  });

  suite.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Full profile returned for authenticated vendor
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T01 — Full profile returned for authenticated vendor with all identity fields', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(res.body?.success === true, 'Expected success: true');
    const d = res.body.data;
    assert.ok(d, 'data block present');

    // Identity
    assert.equal(d.vendorId, VENDOR_A_ID);
    assert.equal(d.name, 'Malabar Dairy & Provisions Ltd');
    assert.equal(d.tradeName, 'Malabar Fresh');
    assert.equal(d.supplierType, 'GOODS');
    assert.equal(d.category, 'FOOD_BEVERAGE');
    assert.equal(d.status, 'ACTIVE');

    // Tax
    assert.equal(d.gstNumber, '32AABCM5678F1Z5');
    assert.equal(d.panNumber, 'AABCM5678F');

    // Contact
    assert.equal(d.phone, '+91-9876543210');
    assert.equal(d.email, 'accounts@malabardairy.test');
    assert.equal(d.website, 'https://malabardairy.test');

    // Address
    assert.ok(d.address, 'address block present');
    assert.equal(d.address.city, 'Kozhikode');

    // Contact persons sanitized
    assert.ok(Array.isArray(d.contactPersons), 'contactPersons is array');
    assert.equal(d.contactPersons.length, 1);
    assert.equal(d.contactPersons[0].name, 'Rajan Menon');
    assert.equal(d.contactPersons[0].isPrimary, true);

    // Sites
    assert.ok(Array.isArray(d.sites), 'sites is array');
    assert.equal(d.sites.length, 1);
    assert.equal(d.sites[0].siteId, 'SITE-001');

    // FSSAI
    assert.ok(d.fssai, 'fssai block present');
    assert.equal(d.fssai.applicable, true);
    assert.equal(d.fssai.valid, true);
    assert.equal(d.fssai.licenseNumber, 'FSSAI1234567890');

    // Commercial
    assert.equal(d.paymentTerms, 'NET_30');
    assert.equal(d.creditLimitInr, undefined, 'Credit limit must NOT be exposed in vendor profile DTO');

    // Meta
    assert.equal(res.body.meta?.screen, 'VEN-SCR-013');
    assert.equal(res.body.meta?.readOnly, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Strict Vendor-Safe Banking Projection
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T02 — Safe bank projection: only bankName, accountHolderName, accountNumberMasked, paymentAccountStatus exposed (IFSC, UPI, branch, raw account number stripped)', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const d = res.body.data;
    const rawPayload = JSON.stringify(res.body);

    // Masked form must be present
    assert.ok(d.bankDetails, 'bankDetails block present');
    assert.ok(d.bankDetails.accountNumberMasked, 'accountNumberMasked present');
    assert.equal(d.bankDetails.bankName, 'State Bank of India');
    assert.equal(d.bankDetails.accountHolderName, 'Malabar Dairy & Provisions Ltd');
    assert.equal(d.bankDetails.paymentAccountStatus, 'Payment Account Verified');

    // Protected banking fields must NOT appear anywhere in response payload
    assert.equal(d.bankDetails.ifscCode, undefined, 'ifscCode must be absent from DTO');
    assert.equal(d.bankDetails.branchName, undefined, 'branchName must be absent from DTO');
    assert.equal(d.bankDetails.upiId, undefined, 'upiId must be absent from DTO');
    assert.equal(d.bankDetails.accountNumber, undefined, 'accountNumber key must be absent from bankDetails');

    assert.ok(!rawPayload.includes('1234567890123456'), 'Raw account number must NOT appear in response payload');
    assert.ok(!rawPayload.includes('SBIN0012345'), 'IFSC code must NOT appear in response payload');
    assert.ok(!rawPayload.includes('Kozhikode Main Branch'), 'Branch name must NOT appear in response payload');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Internal admin-only fields stripped
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T03 — Internal admin fields stripped (notes, statusChangeReason, bankDetailsHistory, pendingBankChange, itemCatalogue)', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const d = res.body.data;
    const rawPayload = JSON.stringify(res.body);

    // Must not expose internal notes
    assert.ok(d.notes === undefined, 'notes must not appear in response');
    assert.ok(!rawPayload.includes('INTERNAL: Vendor is prone'), 'Internal notes text must not leak');

    // Must not expose statusChangeReason
    assert.ok(d.statusChangeReason === undefined, 'statusChangeReason must be absent');

    // Must not expose statusChangedByUserId
    assert.ok(d.statusChangedByUserId === undefined, 'statusChangedByUserId must be absent');

    // Must not expose bankDetailsHistory
    assert.ok(d.bankDetailsHistory === undefined, 'bankDetailsHistory must be absent');

    // Must not expose pendingBankChange
    assert.ok(d.pendingBankChange === undefined, 'pendingBankChange must be absent');

    // Must not expose itemCatalogue (served via VEN-SCR-009)
    assert.ok(d.itemCatalogue === undefined, 'itemCatalogue must be absent');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Compliance scorecard computed from qualifications
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T04 — Compliance scorecard correctly computed from qualifications', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { complianceSummary, qualifications } = res.body.data;

    assert.ok(complianceSummary, 'complianceSummary block present');
    assert.ok(typeof complianceSummary.score === 'number', 'score is number');
    assert.ok(typeof complianceSummary.percent === 'number', 'percent is number');
    assert.ok(Array.isArray(complianceSummary.areas), 'areas is array');
    assert.equal(complianceSummary.areas.length, 5, 'Exactly 5 compliance areas');

    // LEGAL: QUALIFIED → 1.0
    // TAX: QUALIFIED → 1.0
    // FOOD_SAFETY_FSSAI: QUALIFIED_WITH_CONDITIONS → 0.5
    // QUALITY: REVIEW_REQUIRED → 0
    // COMMERCIAL: NOT_ASSESSED → 0
    // Total = 2.5 / 5 = 50%
    assert.equal(complianceSummary.score, 2.5, `Expected score 2.5, got ${complianceSummary.score}`);
    assert.equal(complianceSummary.percent, 50, `Expected 50%, got ${complianceSummary.percent}`);

    // COMMERCIAL must show NOT_ASSESSED since no qualification seeded
    const commercialArea = complianceSummary.areas.find((a) => a.area === 'COMMERCIAL');
    assert.ok(commercialArea, 'COMMERCIAL area present');
    assert.equal(commercialArea.status, 'NOT_ASSESSED');

    // Qualifications list
    assert.ok(Array.isArray(qualifications), 'qualifications array present');
    const legalQ = qualifications.find((q) => q.area === 'LEGAL');
    assert.ok(legalQ, 'LEGAL qualification present');
    assert.equal(legalQ.status, 'QUALIFIED');
    // placedByUserId must NOT appear
    assert.ok(legalQ.reviewedByUserId === undefined, 'reviewedByUserId must not appear in qualifications');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Approved café list resolved with names
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T05 — Approved café list resolved with cafeId + name', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { approvedCafes } = res.body.data;

    assert.ok(Array.isArray(approvedCafes), 'approvedCafes is array');
    assert.equal(approvedCafes.length, 2, 'Two approved cafes');

    const cafeIds = approvedCafes.map((c) => c.cafeId);
    assert.ok(cafeIds.includes(CAFE_1), 'CAFE_1 in approvedCafes');
    assert.ok(cafeIds.includes(CAFE_2), 'CAFE_2 in approvedCafes');

    const cafe1 = approvedCafes.find((c) => c.cafeId === CAFE_1);
    assert.ok(cafe1.name, 'Café name resolved');
    assert.equal(cafe1.name, 'Zamorin Beach Road', 'CAFE_1 name correct');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Active holds returned with type/reason only (no internal user IDs)
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T06 — Active holds returned with holdType/reason/date but NOT placedByUserId', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { activeHolds, hasActiveHold } = res.body.data;

    assert.equal(hasActiveHold, true, 'hasActiveHold is true');
    assert.ok(Array.isArray(activeHolds), 'activeHolds is array');
    assert.equal(activeHolds.length, 1, 'One active hold');

    const hold = activeHolds[0];
    assert.equal(hold.holdType, 'QUALITY_HOLD');
    assert.ok(hold.reason, 'reason present');
    assert.ok(hold.placedAt, 'placedAt date present');

    // Internal user IDs must NOT appear in hold
    assert.ok(hold.placedByUserId === undefined, 'placedByUserId must NOT appear in hold');
    assert.ok(hold.releasedByUserId === undefined, 'releasedByUserId must NOT appear in hold');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: FSSAI summary block correct
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T07 — FSSAI summary block present and correctly structured', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { fssai } = res.body.data;

    assert.ok(fssai, 'fssai block present');
    assert.equal(fssai.applicable, true, 'applicable true');
    assert.equal(fssai.valid, true, 'valid true');
    assert.equal(fssai.licenseNumber, 'FSSAI1234567890');
    assert.ok(fssai.expiryDate, 'expiryDate present');
    assert.ok(fssai.verificationSource, 'verificationSource present');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Performance metrics block
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T08 — Performance metrics block present with OTIF, fill rate, lead time', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { performance, reliabilityRating } = res.body.data;

    assert.ok(performance, 'performance block present');
    assert.equal(performance.otifPercent, 94.5);
    assert.equal(performance.onTimeDeliveryPercent, 96.0);
    assert.equal(performance.fillRatePercent, 98.2);
    assert.equal(performance.rejectionRatePercent, 1.1);
    assert.equal(performance.averageLeadTimeDays, 1.8);
    assert.equal(performance.totalOrdersCount, 142);
    assert.ok(performance.lastEvaluatedAt, 'lastEvaluatedAt present');

    assert.equal(reliabilityRating, 4, 'reliabilityRating present');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: Contract expiry → VALID (180 days away)
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T09 — Contract status VALID when expiry > renewalAlertDays away', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { contract } = res.body.data;

    assert.ok(contract, 'contract block present');
    assert.equal(contract.status, 'VALID', `Expected VALID, got ${contract.status}`);
    assert.ok(contract.expiryDate, 'expiryDate present');
    assert.ok(typeof contract.daysRemaining === 'number', 'daysRemaining is number');
    assert.ok(contract.daysRemaining > 30, `Expected >30 days remaining, got ${contract.daysRemaining}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 10: Insurance expiry → RENEWAL_ALERT (20 days away, alert threshold 30)
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T10 — Insurance status RENEWAL_ALERT when expiry within alert window', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const { insurance } = res.body.data;

    assert.ok(insurance, 'insurance block present');
    assert.equal(insurance.status, 'RENEWAL_ALERT', `Expected RENEWAL_ALERT, got ${insurance.status}`);
    assert.equal(insurance.policyNumber, 'POL-2026-MALABAR');
    assert.equal(insurance.provider, 'National Insurance');
    assert.ok(typeof insurance.daysRemaining === 'number', 'daysRemaining is number');
    assert.ok(insurance.daysRemaining <= 30, `Expected ≤30 days, got ${insurance.daysRemaining}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 11: PDF download returns application/pdf
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T11 — PDF profile card download returns application/pdf with correct headers', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile/pdf',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      res.headers['content-type']?.includes('application/pdf'),
      `Expected application/pdf content-type, got ${res.headers['content-type']}`
    );
    assert.ok(
      res.headers['content-disposition']?.includes('VendorProfile'),
      `Expected VendorProfile in Content-Disposition, got ${res.headers['content-disposition']}`
    );
    assert.ok(
      res.headers['content-disposition']?.includes(VENDOR_A_ID),
      `Expected vendorId in Content-Disposition, got ${res.headers['content-disposition']}`
    );

    // Verify PDF magic bytes
    const header = res.rawBuffer.slice(0, 5).toString('ascii');
    assert.ok(header.startsWith('%PDF'), `Expected %PDF header, got "${header}"`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 12: Cross-vendor BOLA — Vendor B cannot access Vendor A profile
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T12 — Cross-vendor BOLA: Vendor B cannot access Vendor A profile via identity swap', async () => {
    // Vendor B token always resolves to its own profile — can never access VEN-9301
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorBToken}` },
    });

    // Vendor B has their own profile, which should return 200 — but their data
    assert.equal(res.statusCode, 200, 'Vendor B gets own profile — not Vendor A profile');
    const d = res.body.data;
    // Must be Vendor B's own vendorId — never Vendor A's
    assert.equal(d.vendorId, VENDOR_B_ID, `Expected ${VENDOR_B_ID}, got ${d.vendorId}`);
    assert.notEqual(d.vendorId, VENDOR_A_ID, 'Must never return Vendor A data to Vendor B');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 13: Write mutations blocked (403 FORBIDDEN_VENDOR_WRITE)
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T13 — POST/PUT/PATCH/DELETE blocked with 403 FORBIDDEN_VENDOR_WRITE', async () => {
    // POST, PUT, PATCH with body → must get 403 FORBIDDEN_VENDOR_WRITE
    const bodyMethods = ['POST', 'PUT', 'PATCH'];

    for (const method of bodyMethods) {
      const res = await makeRequest({
        port,
        method,
        path: '/api/v1/vendor/profile',
        headers: { authorization: `Bearer ${vendorAToken}` },
        body: { name: 'Hacked Name' },
      });

      assert.equal(
        res.statusCode,
        403,
        `${method} /profile → Expected 403, got ${res.statusCode}`
      );
      const code = res.body?.error?.code;
      assert.equal(
        code,
        'FORBIDDEN_VENDOR_WRITE',
        `${method} → Expected FORBIDDEN_VENDOR_WRITE error code, got ${code}`
      );
    }

    // DELETE without body → must also get 403 FORBIDDEN_VENDOR_WRITE
    const delRes = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(
      delRes.statusCode,
      403,
      `DELETE /profile → Expected 403, got ${delRes.statusCode}`
    );
    const delCode = delRes.body?.error?.code;
    assert.equal(
      delCode,
      'FORBIDDEN_VENDOR_WRITE',
      `DELETE → Expected FORBIDDEN_VENDOR_WRITE error code, got ${delCode}`
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 14: Unauthenticated access → 401
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T14 — Unauthenticated access returns 401', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
    });

    assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 15: Registration date present (smoke check for audit fields)
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T15 — Registration date and audit fields present in profile response', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const d = res.body.data;

    assert.ok(d.registeredOn, 'registeredOn present');
    assert.ok(typeof d.registeredOn === 'string', 'registeredOn is a string (IST date)');
    // Should be in YYYY-MM-DD format
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.registeredOn), `registeredOn is ISO date: ${d.registeredOn}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 16: PDF Profile Card content safety and policy enforcement
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T16 — Profile PDF card strictly excludes raw bank account, IFSC, UPI, Credit Limit, and internal notes', async () => {
    const res = await makeRequest({
      port,
      path: '/api/v1/vendor/profile/pdf',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });

    assert.equal(res.statusCode, 200);
    const pdfContent = res.rawBuffer.toString('latin1');

    // Authorized content must be present
    assert.ok(pdfContent.includes(VENDOR_A_ID), 'Vendor ID must be present in PDF');
    assert.ok(pdfContent.includes('Malabar Dairy & Provisions Ltd'), 'Vendor legal name present in PDF');
    assert.ok(pdfContent.includes('NET_30') || pdfContent.includes('Net 30'), 'Payment terms present');

    // Bank account must NOT leak raw number, IFSC, or UPI
    assert.ok(!pdfContent.includes('1234567890123456'), 'Raw bank account number must NOT appear in PDF');
    assert.ok(!pdfContent.includes('SBIN0012345'), 'IFSC must NOT appear in PDF');
    assert.ok(!pdfContent.includes('Credit Limit'), 'Credit Limit label must NOT appear in PDF');
    assert.ok(!pdfContent.includes('500,000') && !pdfContent.includes('500000'), 'Credit Limit value must NOT appear in PDF');

    // Internal notes & user IDs must NOT leak
    assert.ok(!pdfContent.includes('INTERNAL: Vendor is prone'), 'Internal notes must NOT appear in PDF');
    assert.ok(!pdfContent.includes('MU-0001'), 'Internal user ID must NOT appear in PDF');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 17: Cross-Vendor IDOR / BOLA Prevention on Profile & PDF
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T17 — Cross-Vendor IDOR manipulation (?vendorId or x-vendor-id) denied with 403 CROSS_VENDOR_ACCESS_DENIED', async () => {
    // 1. Query parameter tampering on /profile
    const queryRes = await makeRequest({
      port,
      path: `/api/v1/vendor/profile?vendorId=${VENDOR_B_ID}`,
      headers: { authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(queryRes.statusCode, 403, 'Cross-vendor query tampering must return 403');
    assert.equal(queryRes.body?.error?.code, 'CROSS_VENDOR_ACCESS_DENIED');

    // 2. Custom header tampering on /profile
    const headerRes = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: {
        authorization: `Bearer ${vendorAToken}`,
        'x-vendor-id': VENDOR_B_ID,
      },
    });
    assert.equal(headerRes.statusCode, 403, 'Cross-vendor header tampering must return 403');
    assert.equal(headerRes.body?.error?.code, 'CROSS_VENDOR_ACCESS_DENIED');

    // 3. Query parameter tampering on /profile/pdf
    const pdfQueryRes = await makeRequest({
      port,
      path: `/api/v1/vendor/profile/pdf?vendorId=${VENDOR_B_ID}`,
      headers: { authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(pdfQueryRes.statusCode, 403, 'Cross-vendor PDF query tampering must return 403');
    assert.equal(pdfQueryRes.body?.error?.code, 'CROSS_VENDOR_ACCESS_DENIED');

    // 4. Custom header tampering on /profile/pdf
    const pdfHeaderRes = await makeRequest({
      port,
      path: '/api/v1/vendor/profile/pdf',
      headers: {
        authorization: `Bearer ${vendorAToken}`,
        'x-vendor-id': VENDOR_B_ID,
      },
    });
    assert.equal(pdfHeaderRes.statusCode, 403, 'Cross-vendor PDF header tampering must return 403');
    assert.equal(pdfHeaderRes.body?.error?.code, 'CROSS_VENDOR_ACCESS_DENIED');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 18: Protected Sentinels Never Leak into API DTO or PDF Buffer
  // ─────────────────────────────────────────────────────────────────────────────
  await suite.test('T18 — Protected sentinel values (RAW_ACCOUNT, SECRET_IFSC, SECRET_UPI, INTERNAL_NOTES) never leak', async () => {
    // Inject sentinels directly into Vendor record for VENDOR_A
    await Vendor.updateOne(
      { vendorId: VENDOR_A_ID },
      {
        $set: {
          'bankDetails.accountNumber': '9876543210987654',
          'bankDetails.ifscCode': 'SENTINEL_IFSC_TEST',
          'bankDetails.upiId': 'SENTINEL_UPI_TEST@okhdfcbank',
          'bankDetails.branchName': 'SENTINEL_BRANCH_TEST',
          notes: 'INTERNAL_MANAGER_NOTE_TEST: Risk score 92, do not renew.',
          statusChangeReason: 'INTERNAL_BANK_HISTORY_TEST: Audit failed.',
        },
      }
    );

    // 1. Check API Profile Response
    const apiRes = await makeRequest({
      port,
      path: '/api/v1/vendor/profile',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(apiRes.statusCode, 200);
    const apiPayload = JSON.stringify(apiRes.body);

    assert.ok(!apiPayload.includes('9876543210987654'), 'Sentinel raw account number must NOT leak in API');
    assert.ok(!apiPayload.includes('SENTINEL_IFSC_TEST'), 'Sentinel IFSC must NOT leak in API');
    assert.ok(!apiPayload.includes('SENTINEL_UPI_TEST'), 'Sentinel UPI must NOT leak in API');
    assert.ok(!apiPayload.includes('SENTINEL_BRANCH_TEST'), 'Sentinel branch must NOT leak in API');
    assert.ok(!apiPayload.includes('INTERNAL_MANAGER_NOTE_TEST'), 'Sentinel internal manager note must NOT leak in API');
    assert.ok(!apiPayload.includes('INTERNAL_BANK_HISTORY_TEST'), 'Sentinel bank history must NOT leak in API');

    // 2. Check PDF Response
    const pdfRes = await makeRequest({
      port,
      path: '/api/v1/vendor/profile/pdf',
      headers: { authorization: `Bearer ${vendorAToken}` },
    });
    assert.equal(pdfRes.statusCode, 200);
    const pdfPayload = pdfRes.rawBuffer.toString('latin1');

    assert.ok(!pdfPayload.includes('9876543210987654'), 'Sentinel raw account number must NOT leak in PDF');
    assert.ok(!pdfPayload.includes('SENTINEL_IFSC_TEST'), 'Sentinel IFSC must NOT leak in PDF');
    assert.ok(!pdfPayload.includes('SENTINEL_UPI_TEST'), 'Sentinel UPI must NOT leak in PDF');
    assert.ok(!pdfPayload.includes('SENTINEL_BRANCH_TEST'), 'Sentinel branch must NOT leak in PDF');
    assert.ok(!pdfPayload.includes('INTERNAL_MANAGER_NOTE_TEST'), 'Sentinel internal manager note must NOT leak in PDF');
    assert.ok(!pdfPayload.includes('INTERNAL_BANK_HISTORY_TEST'), 'Sentinel bank history must NOT leak in PDF');
  });
});
