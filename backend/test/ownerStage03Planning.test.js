'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER STRATEGIC EXPANSION STAGE 03 TEST SUITE
 * ============================================================================
 * Comprehensive test coverage for:
 * 1. Semantic Separation: ACTUAL vs BUDGET vs FORECAST vs SCENARIO
 * 2. Budget Versioning & Approval Locking (DRAFT -> APPROVED -> SUPERSEDED/LOCKED)
 * 3. Budget vs Actual Variance & Zero Denominator Division Safety
 * 4. Deterministic Forecast Engine & Explainable Formula Lineage
 * 5. What-If Scenario Sandbox Simulation (Isolated from Ledger, Zero Mutation)
 * 6. Extreme Input Safety (Negative growth, zero revenue, zero/negative contribution)
 * 7. CAPEX Request Lifecycle (Request -> Quote -> Approval -> PO -> Asset -> Post Review)
 * 8. New Outlet Expansion Feasibility Engine (Bills/Day × ABV × Days formula)
 * 9. Transparent Payback Horizon & Unprofitable Safe Status Handling
 * 10. Multi-Tenant Isolation & Negative IDOR Tests
 * 11. Executive Planning Dashboard Aggregation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { BudgetPlan } = require('../src/models/BudgetPlan');
const { ForecastModel } = require('../src/models/ForecastModel');
const { ScenarioSandbox } = require('../src/models/ScenarioSandbox');
const { CapexRequest } = require('../src/models/CapexRequest');
const { NewOutletFeasibility } = require('../src/models/NewOutletFeasibility');
const OwnerPlanningService = require('../src/services/ownerPlanningService');
const authService = require('../src/services/authService');
const { RolePermission } = require('../src/models/RolePermission');
const { User } = require('../src/models/User');

function makeRequest({ port, method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (serializedBody) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(responseData);
          } catch (e) {
            json = { raw: responseData };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

test('STAGE 03 — Budget, Forecast, Scenario & Investment Planning Suite', async (t) => {
  let mongoServer;

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  const ownerUser = {
    userId: 'USR-OWNER-PL01',
    role: 'OWNER',
    organisationId: 'ORG-ZAMORIN',
    email: 'owner.planning@zamorincafe.com',
    fullName: 'Owner Planning Lead',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
  };

  const foreignOwnerUser = {
    userId: 'USR-FOREIGN-PL01',
    role: 'OWNER',
    organisationId: 'ORG-FOREIGN',
    email: 'foreign.owner@other.com',
    fullName: 'Foreign Owner Planning',
    accountStatus: 'ACTIVE',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-9999'],
  };

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === ownerUser.userId) return ownerUser;
    if (query?.userId === foreignOwnerUser.userId) return foreignOwnerUser;
    return null;
  });

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    if (token === 'tok_owner') {
      return {
        payload: {
          sub: ownerUser.userId,
          org: ownerUser.organisationId,
          role: ownerUser.role,
          email: ownerUser.email,
          name: ownerUser.fullName,
          assignedCafeIds: ownerUser.assignedCafeIds,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-OWNER-PL01',
        },
        session: {
          sessionId: 'SS-OWNER-PL01',
          roleSnapshot: ownerUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }
    if (token === 'tok_foreign') {
      return {
        payload: {
          sub: foreignOwnerUser.userId,
          org: foreignOwnerUser.organisationId,
          role: foreignOwnerUser.role,
          email: foreignOwnerUser.email,
          name: foreignOwnerUser.fullName,
          assignedCafeIds: foreignOwnerUser.assignedCafeIds,
          sv: 0,
          usv: 1,
          pv: 1,
          sid: 'SS-FOREIGN-PL01',
        },
        session: {
          sessionId: 'SS-FOREIGN-PL01',
          roleSnapshot: foreignOwnerUser.role,
          sessionVersion: 0,
          mfaVerified: true,
          stepUpVerifiedAt: new Date().toISOString(),
        },
      };
    }
    throw new Error('Invalid token');
  });

  t.mock.method(RolePermission, 'findEffectiveRules', async ({ role, permissionCode }) => [
    {
      role,
      permissionCode,
      effect: 'ALLOW',
      scope: 'ORGANISATION',
      isCurrentlyEffective: () => true,
    },
  ]);

  const ownerHeaders = {
    Authorization: 'Bearer tok_owner',
    'x-organisation-id': 'ORG-ZAMORIN',
  };

  const foreignHeaders = {
    Authorization: 'Bearer tok_foreign',
    'x-organisation-id': 'ORG-FOREIGN',
  };

  // ---------------------------------------------------------------------------
  // 1. BUDGET CREATION & VERSIONING
  // ---------------------------------------------------------------------------
  let createdBudgetId;

  await t.test('1. Create Annual Budget Plan v1', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/budgets',
      headers: ownerHeaders,
      body: {
        fiscalYear: 'FY2026-27',
        scopeType: 'ORGANISATION',
        categoryBreakdown: {
          salesPaisa: 1200000000, // ₹1.2 Cr
          payrollPaisa: 360000000, // ₹36 L
          operatingExpensesPaisa: 240000000, // ₹24 L
          procurementPaisa: 400000000, // ₹40 L
          utilitiesPaisa: 60000000, // ₹6 L
          maintenancePaisa: 40000000, // ₹4 L
        },
        assumptions: 'Assumes 15% revenue expansion across existing locations',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.version, 1);
    assert.equal(res.data.data.status, 'DRAFT');
    assert.equal(res.data.data.categoryBreakdown.salesPaisa, 1200000000);
    createdBudgetId = res.data.data.budgetId;
  });

  await t.test('2. Approve Budget Plan v1 & Verify Lock State', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/budgets/${createdBudgetId}/approve`,
      headers: ownerHeaders,
      body: {
        notes: 'Board approval granted for FY2026-27 Strategic Target',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.status, 'APPROVED');
    assert.equal(res.data.data.approvalDetails.isLocked, true);
    assert.ok(res.data.data.approvalDetails.approvedAt);
  });

  await t.test('3. Prevent Modification of Locked/Approved Budget', async () => {
    const updateRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/budgets',
      headers: ownerHeaders,
      body: {
        fiscalYear: 'FY2026-27',
        scopeType: 'ORGANISATION',
        categoryBreakdown: {
          salesPaisa: 1500000000,
        },
      },
    });

    // Should create Version 2 instead of mutating locked Version 1
    assert.equal(updateRes.status, 201);
    assert.equal(updateRes.data.data.version, 2);
    assert.equal(updateRes.data.data.status, 'DRAFT');

    // Original approved budget remains immutable
    const orig = await BudgetPlan.findOne({ budgetId: createdBudgetId });
    assert.equal(orig.version, 1);
    assert.equal(orig.status, 'APPROVED');
    assert.equal(orig.isLocked, true);
  });

  // ---------------------------------------------------------------------------
  // 2. BUDGET VS ACTUAL VARIANCE WITH ZERO DENOMINATOR SAFETY
  // ---------------------------------------------------------------------------
  await t.test('4. Budget vs Actual Variance Calculation & Zero Denominator Protection', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/variance?fiscalYear=FY2026-27',
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.comparison);
    assert.equal(res.data.data.fiscalYear, 'FY2026-27');

    // Check each category for mathematical safety (no NaN / Infinity)
    res.data.data.comparison.forEach((cat) => {
      assert.notEqual(cat.variancePaisa, NaN);
      if (cat.budgetPaisa === 0) {
        assert.equal(cat.variancePct, null); // Protected against division by zero!
      } else {
        assert.ok(typeof cat.variancePct === 'number');
        assert.ok(!Number.isNaN(cat.variancePct));
        assert.ok(Number.isFinite(cat.variancePct));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DETERMINISTIC FORECAST ENGINE
  // ---------------------------------------------------------------------------
  let generatedForecastId;

  await t.test('5. Generate Deterministic Rolling Forecast with Lineage', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/forecasts/generate',
      headers: ownerHeaders,
      body: {
        fiscalYear: 'FY2026-27',
        growthPct: 7.5,
        inflationPct: 4.2,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.forecastId);
    assert.equal(res.data.data.version, 1);
    assert.equal(res.data.data.methodology.modelType, 'DETERMINISTIC_RUN_RATE');
    assert.equal(res.data.data.methodology.growthAssumptionPct, 7.5);
    assert.equal(res.data.data.methodology.inflationAssumptionPct, 4.2);

    // Verify formula lineage exists for all monthly projections
    assert.ok(res.data.data.monthlyLineItems.length > 0);
    res.data.data.monthlyLineItems.forEach((line) => {
      assert.ok(line.calculationFormula.includes('Actual') || line.calculationFormula.includes('Run-Rate'));
      assert.ok(Number.isFinite(line.projectedSalesPaisa));
      assert.ok(Number.isFinite(line.projectedPayrollPaisa));
    });

    generatedForecastId = res.data.data.forecastId;
  });

  await t.test('6. Retrieve Forecast Lineage by ID', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/planning/forecasts/${generatedForecastId}`,
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.forecastId, generatedForecastId);
    assert.equal(res.data.data.methodology.formulaLineage, 'Projected = (Actual Run-Rate) * (1 + Growth) - Costs * (1 + Inflation)');
  });

  // ---------------------------------------------------------------------------
  // 4. WHAT-IF SCENARIO SANDBOX SIMULATION
  // ---------------------------------------------------------------------------
  await t.test('7. Simulate What-If Scenario Sandbox (Isolated from Real Ledger)', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/scenarios',
      headers: ownerHeaders,
      body: {
        name: 'High Inflation & Wage Hike Stress Test',
        scenarioType: 'DOWNSIDE',
        description: 'Assumes 5% drop in footfall with 10% wage hike and ₹20k rent increase',
        assumptions: {
          revenueChangePct: -5,
          foodCostChangePct: 3,
          wageChangePct: 10,
          rentChangePaisa: 2000000, // ₹20k
        },
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.scenarioId);
    assert.equal(res.data.data.assumptions.revenueChangePct, -5);
    assert.ok(res.data.data.projectedOutputs);

    const outputs = res.data.data.projectedOutputs;
    assert.ok(Number.isFinite(outputs.grossContributionPaisa));
    assert.ok(Number.isFinite(outputs.operatingProfitPaisa));
    assert.ok(Number.isFinite(outputs.breakEvenRevenuePaisa));
    assert.notEqual(outputs.breakEvenRevenuePaisa, NaN);
  });

  await t.test('8. Extreme Input Safety: Zero Revenue & Zero Food Cost Scenario', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/scenarios',
      headers: ownerHeaders,
      body: {
        name: 'Catastrophic Shutdown Sandbox',
        scenarioType: 'DOWNSIDE',
        assumptions: {
          revenueChangePct: -100, // Zero revenue
          foodCostChangePct: 0,
          wageChangePct: 0,
          rentChangePaisa: 0,
        },
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    const outputs = res.data.data.projectedOutputs;
    assert.ok(!Number.isNaN(outputs.operatingProfitPaisa));
    assert.ok(!Number.isNaN(outputs.breakEvenRevenuePaisa));
    assert.ok(outputs.operatingProfitPaisa <= 0); // Loss expected, no crash
  });

  // ---------------------------------------------------------------------------
  // 5. CAPEX REQUEST GOVERNANCE LIFECYCLE
  // ---------------------------------------------------------------------------
  let createdCapexId;

  await t.test('9. Submit CAPEX Request with Multi-Vendor Quotations', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/capex',
      headers: ownerHeaders,
      body: {
        cafeId: 'ZC-0001',
        category: 'KITCHEN_EQUIPMENT',
        itemTitle: 'Commercial Espresso Machine Dual Boiler',
        businessJustification: 'Replace 6-year-old failing espresso machine to stabilize morning peak throughput',
        estimatedAmountPaisa: 45000000, // ₹4.5 L
        quotations: [
          {
            vendorName: 'La Marzocco India',
            quoteAmountPaisa: 46000000,
            deliveryLeadDays: 14,
            warrantyMonths: 24,
            isRecommended: true,
            notes: 'Includes annual maintenance contract',
          },
          {
            vendorName: 'Nuova Simonelli Partner',
            quoteAmountPaisa: 43000000,
            deliveryLeadDays: 21,
            warrantyMonths: 12,
            isRecommended: false,
          },
        ],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.capexId);
    assert.equal(res.data.data.status, 'QUOTATIONS_RECEIVED');
    assert.equal(res.data.data.quotations.length, 2);
    createdCapexId = res.data.data.capexId;
  });

  await t.test('10. Dual-Control Approval of CAPEX Request', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${createdCapexId}/approve`,
      headers: ownerHeaders,
      body: {
        selectedVendorName: 'La Marzocco India',
        approvedAmountPaisa: 46000000,
        notes: 'Approved based on warranty and maintenance contract terms',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.status, 'APPROVED');
    assert.equal(res.data.data.approval.approvedByUserId, ownerUser.userId);
    assert.equal(res.data.data.approval.selectedVendorName, 'La Marzocco India');
  });

  await t.test('11. Transition CAPEX to PO and Capitalized Asset Link', async () => {
    // 1. Link PO
    const poRes = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${createdCapexId}/status`,
      headers: ownerHeaders,
      body: {
        toState: 'PO_ISSUED',
        poNumber: 'PO-2026-09-0042',
        notes: 'Purchase order sent to vendor',
      },
    });
    assert.equal(poRes.status, 200);
    assert.equal(poRes.data.data.status, 'PO_ISSUED');
    assert.equal(poRes.data.data.procurementLinkage.poNumber, 'PO-2026-09-0042');

    // 2. Capitalize into Asset Master
    const assetRes = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${createdCapexId}/status`,
      headers: ownerHeaders,
      body: {
        toState: 'CAPITALIZED_ASSET',
        capitalizedAssetId: 'AST-KITCHEN-0881',
        notes: 'Machine commissioned, tagged in Asset Master',
      },
    });
    assert.equal(assetRes.status, 200);
    assert.equal(assetRes.data.data.status, 'CAPITALIZED_ASSET');
    assert.equal(assetRes.data.data.procurementLinkage.capitalizedAssetId, 'AST-KITCHEN-0881');

    // 3. Post-Implementation Review
    const reviewRes = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${createdCapexId}/status`,
      headers: ownerHeaders,
      body: {
        toState: 'POST_REVIEW_COMPLETED',
        actualCostPaisa: 45800000,
        varianceReason: 'Vendor provided ₹2,000 cash discount upon delivery',
        benefitsRealized: 'Espresso dispensing time reduced by 30%, queue clear',
        notes: 'Post-implementation audit completed with 0 issues',
      },
    });
    assert.equal(reviewRes.status, 200);
    assert.equal(reviewRes.data.data.status, 'POST_REVIEW_COMPLETED');
    assert.equal(reviewRes.data.data.postImplementationReview.actualCostPaisa, 45800000);
    assert.ok(reviewRes.data.data.postImplementationReview.reviewedAt);
  });

  // ---------------------------------------------------------------------------
  // 6. NEW OUTLET EXPANSION FEASIBILITY & FORMULA LINEAGE
  // ---------------------------------------------------------------------------
  let createdStudyId;

  await t.test('12. Calculate Feasibility for Profitable New Outlet Expansion', async () => {
    // Formula: 350 bills/day * ₹250 ABV * 30 days = ₹26,25,000 monthly revenue
    // Food Cost (32%): ₹8,40,000
    // Gross Contribution: ₹17,85,000
    // Fixed Costs: Rent ₹2,50,000 + Payroll ₹4,00,000 + Opex ₹1,50,000 = ₹8,00,000
    // Monthly Net Profit: ₹9,85,000
    // Initial CAPEX: ₹35,00,000
    // Payback: ~3.55 months (rounded to 3.6)
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/feasibility',
      headers: ownerHeaders,
      body: {
        outletName: 'Zamorin Express — Cyber Hub',
        proposedLocation: 'Cyber Hub Ground Floor, Gurugram',
        expectedBillsPerDay: 350,
        averageBillValuePaisa: 25000, // ₹250
        operatingDaysPerMonth: 30,
        foodCostPercentage: 32,
        monthlyRentPaisa: 25000000, // ₹2.5 L
        monthlyPayrollPaisa: 40000000, // ₹4 L
        monthlyOtherOpexPaisa: 15000000, // ₹1.5 L
        initialCapexPaisa: 350000000, // ₹35 L
        securityDepositPaisa: 150000000, // ₹15 L
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.studyId);
    assert.equal(res.data.data.outletName, 'Zamorin Express — Cyber Hub');

    const metrics = res.data.data.calculatedMetrics;
    assert.equal(metrics.monthlyRevenuePaisa, 262500000); // ₹26.25 L
    assert.equal(metrics.monthlyFoodCostPaisa, 84000000); // ₹8.4 L
    assert.equal(metrics.monthlyGrossContributionPaisa, 178500000); // ₹17.85 L
    assert.equal(metrics.monthlyNetProfitPaisa, 98500000); // ₹9.85 L
    assert.ok(metrics.paybackMonths > 0);
    assert.equal(metrics.paybackMonths, 5.1);
    assert.equal(metrics.paybackStatus, 'FEASIBLE');
    assert.ok(metrics.breakEvenBillsPerDay > 0);

    createdStudyId = res.data.data.studyId;
  });

  await t.test('13. Feasibility Calculation with Zero/Negative Net (Safe Payback Status)', async () => {
    // Unprofitable outlet scenario:
    // 50 bills/day * ₹100 ABV * 30 days = ₹1,50,000 monthly revenue
    // Monthly Fixed Costs: Rent ₹5,00,000 + Payroll ₹3,00,000 = ₹8,00,000
    // Net is heavily negative: Payback must NOT return Infinity or NaN!
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/feasibility',
      headers: ownerHeaders,
      body: {
        outletName: 'Unviable Test Location',
        proposedLocation: 'Remote Strip Mall',
        expectedBillsPerDay: 50,
        averageBillValuePaisa: 10000,
        monthlyRentPaisa: 50000000,
        monthlyPayrollPaisa: 30000000,
        initialCapexPaisa: 200000000,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);

    const metrics = res.data.data.calculatedMetrics;
    assert.ok(metrics.monthlyNetProfitPaisa < 0);
    assert.equal(metrics.paybackMonths, null); // Protected against negative payback division!
    assert.equal(metrics.paybackStatus, 'PAYBACK NOT ACHIEVED UNDER CURRENT ASSUMPTIONS');
  });

  await t.test('14. Record 30-Day Actual Comparison for Feasibility Study', async () => {
    const res = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/feasibility/${createdStudyId}/actuals`,
      headers: ownerHeaders,
      body: {
        benchmark: 'DAY_30',
        actualAverageBillsPerDay: 365,
        actualABVPaisa: 26000, // ₹260
        actualMonthlyRevenuePaisa: 284700000,
        actualFoodCostPercentage: 31.5,
        actualNetProfitPaisa: 104500000,
        varianceNotes: 'Opening month exceeded footfall expectations by 4.2%',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.actualsComparison.day30Actual);
    assert.equal(res.data.data.actualsComparison.day30Actual.actualAverageBillsPerDay, 365);
    assert.equal(res.data.data.actualsComparison.day30Actual.actualNetProfitPaisa, 104500000);
  });

  // ---------------------------------------------------------------------------
  // 7. EXECUTIVE DASHBOARD AGGREGATION
  // ---------------------------------------------------------------------------
  await t.test('15. Planning Executive Dashboard KPI Summary', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/overview',
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.hasApprovedBudget);
    assert.equal(res.data.data.budgetCount >= 2, true);
    assert.equal(res.data.data.forecastCount >= 1, true);
    assert.equal(res.data.data.scenarioCount >= 2, true);
    assert.equal(res.data.data.feasibilityCount >= 2, true);
    assert.ok(res.data.data.approvedCapexTotalPaisa > 0);
  });

  // ---------------------------------------------------------------------------
  // 8. MULTI-TENANT ISOLATION & NEGATIVE IDOR SECURITY TESTS
  // ---------------------------------------------------------------------------
  await t.test('16. Multi-Tenant Isolation: Foreign Organisation Access Denied', async () => {
    // Foreign user attempting to read ORG-ZAMORIN budget by ID
    const budgetRes = await makeRequest({
      port,
      method: 'GET',
      path: `/api/v1/planning/budgets?fiscalYear=FY2026-27`,
      headers: foreignHeaders,
    });

    assert.equal(budgetRes.status, 200);
    assert.equal(budgetRes.data.data.length, 0); // Foreign org sees 0 budgets

    // Foreign user attempting to read or approve ORG-ZAMORIN CAPEX
    const capexRes = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${createdCapexId}/approve`,
      headers: foreignHeaders,
      body: {
        notes: 'Malicious foreign approval',
      },
    });

    // Must be rejected with 404
    assert.equal(capexRes.status, 404);
    assert.equal(capexRes.data.success, false);

    // Foreign user attempting to access ORG-ZAMORIN feasibility study
    const fsbRes = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/feasibility',
      headers: foreignHeaders,
    });

    assert.equal(fsbRes.status, 200);
    assert.equal(fsbRes.data.data.length, 0); // Foreign org sees 0 studies
  });

  await t.test('11b. Invalid CAPEX Lifecycle Transitions are strictly rejected', async () => {
    // 1. Create a raw CAPEX in REQUESTED state
    const rawRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/capex',
      headers: ownerHeaders,
      body: {
        cafeId: 'ZC-0001',
        category: 'HVAC_REFRIGERATION',
        itemTitle: 'Walk-in Chiller Compressor Replacement',
        estimatedAmountPaisa: 25000000,
        purpose: 'HVAC unit reliability upgrade',
      },
    });

    assert.equal(rawRes.status, 201);
    const rawCapexId = rawRes.data.data.capexId;
    assert.equal(rawRes.data.data.status, 'REQUESTED');

    // 2. Attempt direct approval from REQUESTED -> MUST BE REJECTED
    const invalidApprove = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/capex/${rawCapexId}/approve`,
      headers: ownerHeaders,
      body: { notes: 'Premature approval attempt' },
    });
    assert.equal(invalidApprove.status, 400);

    // 3. Attempt direct PO issue from REQUESTED -> MUST BE REJECTED
    const invalidPO = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/capex/${rawCapexId}/status`,
      headers: ownerHeaders,
      body: { toState: 'PO_ISSUED', poNumber: 'PO-ILLEGAL-99' },
    });
    assert.equal(invalidPO.status, 400);

    // 4. Progress through Business Case -> Review -> Approval legitimately
    const bcRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/capex/${rawCapexId}/business-case`,
      headers: ownerHeaders,
      body: {
        purpose: 'Walk-in Chiller Compressor Replacement',
        alternativesConsidered: 'Repair existing compressor motor',
        expectedBenefits: 'Reduces temperature fluctuation risk by 95%',
        operationalRisks: '4-hour refrigeration downtime during install',
        assumptions: 'Vendor parts available within 3 days',
        financialImpact: '₹2.5L capital allocation from Q3 maintenance budget',
      },
    });
    assert.equal(bcRes.status, 200);
    assert.equal(bcRes.data.data.status, 'BUSINESS_CASE_SUBMITTED');

    // 5. Submit independent review
    const reviewRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/capex/${rawCapexId}/review`,
      headers: ownerHeaders,
      body: {
        reviewNotes: 'Technical specifications validated with facility maintenance head; budget approved in CAPEX master.',
        technicalFeasibility: 'FEASIBLE',
        budgetAvailabilityVerified: true,
      },
    });
    assert.equal(reviewRes.status, 200);
    assert.equal(reviewRes.data.data.status, 'UNDER_REVIEW');

    // 6. Now approval succeeds
    const legitApprove = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/capex/${rawCapexId}/approve`,
      headers: ownerHeaders,
      body: { notes: 'Executive approval following formal review' },
    });
    assert.equal(legitApprove.status, 200);
    assert.equal(legitApprove.data.data.status, 'APPROVED');
  });

  await t.test('14b. Record 90-Day and 180-Day Actual Benchmarks and Verify Historical Baseline Immutability', async () => {
    // 1. Record 90-Day benchmark
    const res90 = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/feasibility/${createdStudyId}/actuals`,
      headers: ownerHeaders,
      body: {
        benchmark: 'DAY_90',
        actualAverageBillsPerDay: 390,
        actualMonthlyRevenuePaisa: 304200000,
        actualNetProfitPaisa: 112000000,
        varianceNotes: 'Quarterly review: sales stabilized above projection',
      },
    });
    assert.equal(res90.status, 200);
    assert.equal(res90.data.data.actualsComparison.day90Actual.actualRevenuePaisa, 304200000);

    // 2. Record 180-Day benchmark
    const res180 = await makeRequest({
      port,
      method: 'PATCH',
      path: `/api/v1/planning/feasibility/${createdStudyId}/actuals`,
      headers: ownerHeaders,
      body: {
        benchmark: 'DAY_180',
        actualAverageBillsPerDay: 410,
        actualMonthlyRevenuePaisa: 319800000,
        actualNetProfitPaisa: 118500000,
        varianceNotes: 'Half-year review: robust margins sustained',
      },
    });
    assert.equal(res180.status, 200);
    assert.equal(res180.data.data.actualsComparison.day180Actual.actualRevenuePaisa, 319800000);

    // 3. Verify original baseline inputs remain completely immutable
    const studyDoc = await NewOutletFeasibility.findOne({ feasibilityId: createdStudyId });
    assert.equal(studyDoc.monthlyRentPaisa, 25000000);
    assert.equal(studyDoc.initialCapexPaisa, 350000000);
    assert.equal(studyDoc.operatingDaysPerMonth, 30);
  });

  await t.test('18. Planning Concurrency: Stale Version Conflict and Double Approval Protection', async () => {
    // 1. Create a fresh draft budget
    const draftRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/planning/budgets',
      headers: ownerHeaders,
      body: {
        fiscalYear: 'FY2027-28',
        categoryBreakdown: {
          salesPaisa: 1500000000,
          payrollPaisa: 400000000,
        },
      },
    });
    assert.equal(draftRes.status, 201);
    const testBudgetId = draftRes.data.data.budgetId;
    const currentVersion = draftRes.data.data.version;

    // 2. User A updates the draft budget
    const userAUpdate = await makeRequest({
      port,
      method: 'PUT',
      path: `/api/v1/planning/budgets/${testBudgetId}`,
      headers: ownerHeaders,
      body: {
        expectedVersion: currentVersion,
        categoryBreakdown: {
          salesPaisa: 1550000000,
          payrollPaisa: 410000000,
        },
        assumptions: 'User A revised payroll upward',
      },
    });
    assert.equal(userAUpdate.status, 200);

    // 3. User B attempts update with stale expectedVersion -> MUST BE REJECTED with 409
    const userBUpdate = await makeRequest({
      port,
      method: 'PUT',
      path: `/api/v1/planning/budgets/${testBudgetId}`,
      headers: ownerHeaders,
      body: {
        expectedVersion: currentVersion, // Stale!
        categoryBreakdown: {
          salesPaisa: 1600000000,
          payrollPaisa: 420000000,
        },
        assumptions: 'User B stale update attempt',
      },
    });
    assert.equal(userBUpdate.status, 409);
    assert.equal(userBUpdate.data.error.code, 'STALE_VERSION_CONFLICT');

    // 4. Approve budget
    const approveRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/budgets/${testBudgetId}/approve`,
      headers: ownerHeaders,
      body: { notes: 'Formal Board approval' },
    });
    assert.equal(approveRes.status, 200);

    // 5. Attempt second approval on already locked budget -> MUST BE REJECTED
    const doubleApproveRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/planning/budgets/${testBudgetId}/approve`,
      headers: ownerHeaders,
      body: { notes: 'Double approval race attempt' },
    });
    assert.equal(doubleApproveRes.status, 400);
  });

  await t.test('19. Planning Multi-Dimensional Export clearly labels ACTUAL, BUDGET, FORECAST, SCENARIO', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/export?fiscalYear=FY2026-27&format=PDF',
      headers: ownerHeaders,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.reportType, 'STRATEGIC_PLANNING_CONSOLIDATED');
    assert.equal(res.data.format, 'PDF');

    const sections = res.data.sections;
    assert.ok(sections.ACTUAL, 'ACTUAL section is required');
    assert.equal(sections.ACTUAL.label, 'ACTUAL');
    assert.ok(sections.BUDGET, 'BUDGET section is required');
    assert.equal(sections.BUDGET.label, 'BUDGET');
    assert.ok(sections.FORECAST, 'FORECAST section is required');
    assert.equal(sections.FORECAST.label, 'FORECAST');
    assert.ok(sections.SCENARIO, 'SCENARIO section is required');
    assert.equal(sections.SCENARIO.label, 'SCENARIO');
  });

  await t.test('17. Security: Reject Unauthenticated Request', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/planning/overview',
      headers: {},
    });

    assert.equal(res.status, 401);
  });
});
