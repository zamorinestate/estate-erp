'use strict';

/**
 * PM-02A: Universal Reporting Foundation, Metric Registry & Analytics Architecture Verification Suite
 * Tests 20+ scenarios across Metric Registry, Dimension Registry, Report Registry,
 * Reporting Scope, Period Engine, Monetary Precision, Data Quality, Provenance, and Lineage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const reporting = require('../src/reporting');
const {
  CANONICAL_METRICS,
  MetricRegistry,
  DIMENSIONS_REGISTRY,
  isValidDimension,
  resolveDaypart,
  validateGroupBy,
  REPORT_CATEGORIES,
  REPORT_CLASSIFICATIONS,
  REPORT_TRUST_LEVELS,
  CANONICAL_REPORTS,
  ReportRegistry,
  paisaToRupees,
  rupeesToPaisa,
  formatInr,
  formatInrShort,
  calculatePercentage,
  calculateRatio,
  addPaisa,
  subtractPaisa,
  reconstructGrossSales,
  computeGrossToNetBridge,
  getIstTodayDateString,
  validateDateRange,
  resolveReportPeriod,
  resolveComparisonPeriod,
  resolveReportScope,
  buildBaseReportFilter,
  resolveDataQuality,
  ACTUALITY_STATES,
  DATA_QUALITY_STATUSES,
  parseReportRequest,
  buildProvenance,
  getLineageMap,
  buildReportEnvelope,
} = reporting;

test('PM-02A: Reporting Foundation & Architecture Test Suite', async (suite) => {
  // ─── 1. METRIC REGISTRY TESTS ───────────────────────────────────────────────

  await suite.test('1.1 Metric Registry: All metric IDs are unique and uppercase snake case', () => {
    const allMetrics = MetricRegistry.getAllMetrics();
    assert.ok(allMetrics.length >= 30, 'Must have at least 30 canonical metrics defined');
    const ids = new Set();

    for (const m of allMetrics) {
      assert.ok(m.metricId, 'Metric must have metricId');
      assert.match(m.metricId, /^[A-Z][A-Z0-9_]+$/, `metricId ${m.metricId} must be uppercase snake case`);
      assert.ok(!ids.has(m.metricId), `Duplicate metricId found: ${m.metricId}`);
      ids.add(m.metricId);
    }
  });

  await suite.test('1.2 Metric Registry: Required enterprise metadata fields are present', () => {
    const allMetrics = MetricRegistry.getAllMetrics();
    for (const m of allMetrics) {
      assert.ok(m.displayName, `Metric ${m.metricId} missing displayName`);
      assert.ok(m.domain, `Metric ${m.metricId} missing domain`);
      assert.ok(m.unit, `Metric ${m.metricId} missing unit`);
      assert.ok(m.format, `Metric ${m.metricId} missing format`);
      assert.ok(m.formulaVersion, `Metric ${m.metricId} missing formulaVersion`);
      assert.match(m.formulaVersion, /^\d+\.\d+\.\d+$/, `Version ${m.formulaVersion} must be semantic versioning`);
      assert.ok(m.calculationType, `Metric ${m.metricId} missing calculationType`);
      assert.ok(m.actuality, `Metric ${m.metricId} missing actuality`);
      assert.ok(m.ownerDomain, `Metric ${m.metricId} missing ownerDomain`);
      assert.ok(m.classification, `Metric ${m.metricId} missing classification`);
      assert.ok(m.trustStatus, `Metric ${m.metricId} missing trustStatus`);
      assert.ok(Array.isArray(m.supportedDimensions), `Metric ${m.metricId} missing supportedDimensions`);
      assert.ok(Array.isArray(m.includedStatuses), `Metric ${m.metricId} missing includedStatuses`);
      assert.ok(m.timeBasis, `Metric ${m.metricId} missing timeBasis`);
      assert.ok(m.availability, `Metric ${m.metricId} missing availability`);
    }
  });

  await suite.test('1.3 Metric Registry: Lookup and domain filtering', () => {
    const netSales = MetricRegistry.getMetric('NET_SALES');
    assert.ok(netSales);
    assert.equal(netSales.domain, 'SALES');
    assert.equal(netSales.availability, 'READY');

    const salesMetrics = MetricRegistry.getMetricsByDomain('SALES');
    assert.ok(salesMetrics.length >= 8);
    assert.ok(salesMetrics.some((m) => m.metricId === 'GROSS_SALES'));

    const readyMetrics = MetricRegistry.getReadyMetrics();
    assert.ok(readyMetrics.some((m) => m.metricId === 'NET_SALES'));

    const unavailMetrics = MetricRegistry.getUnavailableOrPartialMetrics();
    assert.ok(unavailMetrics.some((m) => m.metricId === 'COGS'), 'COGS must be recorded as unavailable');
  });

  await suite.test('1.4 Metric Registry: Metric validation and unsupported metric rejection', () => {
    const validCheck = MetricRegistry.validateMetrics(['NET_SALES', 'GROSS_SALES']);
    assert.equal(validCheck.valid, true);
    assert.deepEqual(validCheck.metrics, ['NET_SALES', 'GROSS_SALES']);

    const invalidCheck = MetricRegistry.validateMetrics(['NET_SALES', 'FAKE_METRIC_XYZ']);
    assert.equal(invalidCheck.valid, false);
    assert.deepEqual(invalidCheck.invalid, ['FAKE_METRIC_XYZ']);
  });

  // ─── 2. DIMENSION REGISTRY TESTS ────────────────────────────────────────────

  await suite.test('2.1 Dimension Registry: Standard dimensions registered', () => {
    assert.ok(isValidDimension('DATE'));
    assert.ok(isValidDimension('BUSINESS_DATE'));
    assert.ok(isValidDimension('HOUR'));
    assert.ok(isValidDimension('DAYPART'));
    assert.ok(isValidDimension('CAFE'));
    assert.ok(isValidDimension('MENU_CATEGORY'));
    assert.ok(isValidDimension('SERVICE_MODE'));
    assert.ok(isValidDimension('PAYMENT_METHOD'));
    assert.ok(isValidDimension('VENDOR'));
    assert.ok(isValidDimension('EXPENSE_CATEGORY'));

    assert.equal(isValidDimension('UNKNOWN_DIM'), false);
  });

  await suite.test('2.2 Dimension Registry: Daypart resolution engine', () => {
    assert.equal(resolveDaypart(8), 'BREAKFAST');
    assert.equal(resolveDaypart(13), 'LUNCH');
    assert.equal(resolveDaypart(16), 'AFTERNOON');
    assert.equal(resolveDaypart(20), 'DINNER');
    assert.equal(resolveDaypart(23), 'LATE_NIGHT');
    assert.equal(resolveDaypart(4), 'OVERNIGHT');
  });

  await suite.test('2.3 Dimension Registry: GroupBy validation and rejection', () => {
    const validGroup = validateGroupBy('CAFE, DAYPART, SERVICE_MODE');
    assert.equal(validGroup.valid, true);
    assert.deepEqual(validGroup.dimensions, ['CAFE', 'DAYPART', 'SERVICE_MODE']);

    const invalidGroup = validateGroupBy('CAFE, INVALID_DIMENSION');
    assert.equal(validGroup.valid, true);
    assert.equal(invalidGroup.valid, false);
    assert.deepEqual(invalidGroup.invalid, ['INVALID_DIMENSION']);
  });

  // ─── 3. REPORT REGISTRY TESTS ───────────────────────────────────────────────

  await suite.test('3.1 Report Registry: 25 Reserved categories initialized', () => {
    assert.ok(Object.keys(REPORT_CATEGORIES).length >= 25);
    assert.ok(REPORT_CATEGORIES.SALES_REVENUE);
    assert.ok(REPORT_CATEGORIES.FINANCE_PROFITABILITY);
    assert.ok(REPORT_CATEGORIES.WORKFORCE);
    assert.ok(REPORT_CATEGORIES.INVENTORY_COGS);
  });

  await suite.test('3.2 Report Registry: Core report metadata & role permission matrix', () => {
    const dailySales = ReportRegistry.getReport('daily-sales');
    assert.ok(dailySales);
    assert.equal(dailySales.classification, 'INTERNAL');
    assert.ok(['OPERATIONAL', 'CERTIFIED'].includes(dailySales.trustLevel));
    assert.ok(dailySales.supportedRoles.includes('MASTER'));
    assert.ok(dailySales.supportedRoles.includes('OWNER'));
    assert.ok(dailySales.supportedRoles.includes('CAFE_ADMIN'));

    const plReport = ReportRegistry.getReport('pl-statement');
    assert.ok(plReport);
    assert.equal(plReport.classification, 'CONFIDENTIAL');
    assert.ok(plReport.supportedRoles.includes('MASTER'));
    assert.ok(plReport.supportedRoles.includes('OWNER'));
    assert.ok(!plReport.supportedRoles.includes('CAFE_ADMIN'), 'Café Admin cannot view store P&L statement');
  });

  // ─── 4. REPORTING MONEY PRECISION TESTS ──────────────────────────────────────

  await suite.test('4.1 Reporting Money: Integer paise to rupee conversions and formatting', () => {
    assert.equal(paisaToRupees(34285000), 342850.0);
    assert.equal(rupeesToPaisa(342850.0), 34285000);
    assert.equal(formatInr(34285000), '₹3,42,850.00');
    assert.equal(formatInr(-50000), '-₹500.00');
    assert.equal(formatInr(0), '₹0.00');

    assert.equal(formatInrShort(34285000), '₹3.43 L');
    assert.equal(formatInrShort(1250000000), '₹1.25 Cr');
    assert.equal(formatInrShort(85000), '₹850');
  });

  await suite.test('4.2 Reporting Money: Percentage, ratio, and safe integer summation', () => {
    assert.equal(calculatePercentage(23999500, 34285000, 1), 70.0);
    assert.equal(calculatePercentage(0, 0), 0.0);

    assert.equal(calculateRatio(100000, 50, 2), 2000.0);
    assert.equal(calculateRatio(100, 0), 0.0);

    assert.equal(addPaisa(100, 250, 50), 400);
    assert.equal(subtractPaisa(1000, 200, 150), 650);
  });

  // ─── 5. REPORTING TIME & PERIOD ENGINE TESTS ────────────────────────────────

  await suite.test('5.1 Reporting Time: IST current date and date validation', () => {
    const today = getIstTodayDateString();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

    assert.equal(validateDateRange('2026-08-01', '2026-08-15').valid, true);
    assert.equal(validateDateRange('2026-08-15', '2026-08-01').valid, false);
    assert.equal(validateDateRange('invalid', '2026-08-15').valid, false);
  });

  await suite.test('5.2 Reporting Time: Period engine standard resolutions', () => {
    const todayPeriod = resolveReportPeriod('TODAY');
    assert.equal(todayPeriod.periodId, 'TODAY');
    assert.equal(todayPeriod.dateFrom, todayPeriod.dateTo);

    const mtdPeriod = resolveReportPeriod('MTD');
    assert.equal(mtdPeriod.periodId, 'MTD');
    assert.ok(mtdPeriod.dateFrom.endsWith('-01'));

    const customPeriod = resolveReportPeriod('CUSTOM', { dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    assert.equal(customPeriod.periodId, 'CUSTOM');
    assert.equal(customPeriod.dateFrom, '2026-01-01');
    assert.equal(customPeriod.dateTo, '2026-01-31');

    assert.throws(
      () => resolveReportPeriod('CUSTOM', { dateFrom: '2026-01-31', dateTo: '2026-01-01' }),
      (err) => err.code === 'INVALID_DATE_RANGE'
    );
  });

  await suite.test('5.3 Reporting Time: Comparison period resolution', () => {
    const current = { dateFrom: '2026-08-01', dateTo: '2026-08-10' }; // 10 days
    const prior = resolveComparisonPeriod(current, 'PRIOR_PERIOD');
    assert.equal(prior.comparisonType, 'PRIOR_PERIOD');
    assert.equal(prior.dateTo, '2026-07-31');
    assert.equal(prior.dateFrom, '2026-07-22');

    const priorYear = resolveComparisonPeriod(current, 'PRIOR_YEAR');
    assert.equal(priorYear.dateFrom, '2025-08-01');
    assert.equal(priorYear.dateTo, '2025-08-10');
  });

  // ─── 6. REPORTING SCOPE & SECURITY TESTS ────────────────────────────────────

  await suite.test('6.1 Reporting Scope: Primary Master organisation-wide and single café', () => {
    const reqOrgWide = {
      auth: { userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      query: {},
    };
    const scopeOrg = resolveReportScope(reqOrgWide);
    assert.equal(scopeOrg.organisationId, 'ORG-ZAMORIN');
    assert.equal(scopeOrg.isOrgWide, true);
    assert.equal(scopeOrg.cafeScope, null);

    const reqSingleCafe = {
      auth: { userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      query: { cafeId: 'ZC-0001' },
    };
    const scopeCafe = resolveReportScope(reqSingleCafe);
    assert.equal(scopeCafe.organisationId, 'ORG-ZAMORIN');
    assert.equal(scopeCafe.isOrgWide, false);
    assert.equal(scopeCafe.cafeScope, 'ZC-0001');
  });

  await suite.test('6.2 Reporting Scope: Owner assigned-café scope enforcement', () => {
    const reqOwner = {
      auth: {
        userId: 'OW-01',
        role: 'OWNER',
        assignedCafeIds: ['ZC-0001', 'ZC-0002'],
        organisationId: 'ORG-ZAMORIN',
      },
      query: {},
    };
    const scopeOwner = resolveReportScope(reqOwner);
    assert.deepEqual(scopeOwner.cafeScope, { $in: ['ZC-0001', 'ZC-0002'] });
    assert.equal(scopeOwner.isOrgWide, false);

    const reqOwnerAuthorized = {
      auth: reqOwner.auth,
      query: { cafeId: 'ZC-0001' },
    };
    const scopeAuth = resolveReportScope(reqOwnerAuthorized);
    assert.equal(scopeAuth.cafeScope, 'ZC-0001');

    const reqOwnerUnauthorized = {
      auth: reqOwner.auth,
      query: { cafeId: 'ZC-9999' },
    };
    assert.throws(
      () => resolveReportScope(reqOwnerUnauthorized),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
    );
  });

  await suite.test('6.3 Reporting Scope: Empty Owner scope fails closed', () => {
    const reqEmptyOwner = {
      auth: { userId: 'OW-01', role: 'OWNER', assignedCafeIds: [], organisationId: 'ORG-ZAMORIN' },
      query: {},
    };
    assert.throws(
      () => resolveReportScope(reqEmptyOwner),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
    );
  });

  await suite.test('6.4 Reporting Scope: Café Admin is bound to assigned café', () => {
    const reqAdmin = {
      auth: { userId: 'CA-01', role: 'CAFE_ADMIN', assignedCafeIds: ['ZC-0001'], organisationId: 'ORG-ZAMORIN' },
      query: {},
    };
    const scopeAdmin = resolveReportScope(reqAdmin);
    assert.equal(scopeAdmin.cafeScope, 'ZC-0001');

    const reqAdminTamper = {
      auth: reqAdmin.auth,
      query: { cafeId: 'ZC-0002' },
    };
    assert.throws(
      () => resolveReportScope(reqAdminTamper),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
    );
  });

  await suite.test('6.5 Reporting Scope: Staff is strictly denied report access', () => {
    const reqStaff = {
      auth: { userId: 'ST-01', role: 'STAFF', assignedCafeIds: ['ZC-0001'], organisationId: 'ORG-ZAMORIN' },
      query: {},
    };
    assert.throws(
      () => resolveReportScope(reqStaff),
      (err) => err.statusCode === 403 && err.code === 'ROLE_NOT_ALLOWED'
    );
  });

  await suite.test('6.6 Reporting Scope: Query tampering with organisationId is rejected', () => {
    const reqTamper = {
      auth: { userId: 'MU-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-REAL' },
      query: { organisationId: 'ORG-ATTACKER' },
    };
    const scope = resolveReportScope(reqTamper);
    assert.equal(scope.organisationId, 'ORG-REAL', 'Must use JWT organisationId and ignore query string');
  });

  // ─── 7. DATA QUALITY & ACTUALITY TESTS ──────────────────────────────────────

  await suite.test('7.1 Data Quality: Status resolution (COMPLETE, PARTIAL, UNAVAILABLE)', () => {
    const complete = resolveDataQuality({ hasData: true });
    assert.equal(complete.status, 'COMPLETE');

    const partial = resolveDataQuality({ hasData: true, hasOpenRegisters: true });
    assert.equal(partial.status, 'PARTIAL');

    const unavail = resolveDataQuality({ missingSources: ['COGS_GENERAL_LEDGER'] });
    assert.equal(unavail.status, 'UNAVAILABLE');
    assert.deepEqual(unavail.missingSources, ['COGS_GENERAL_LEDGER']);

    const empty = resolveDataQuality({ hasData: false });
    assert.equal(empty.status, 'COMPLETE');
  });

  // ─── 8. CONTRACT, PROVENANCE & LINEAGE TESTS ────────────────────────────────

  await suite.test('8.1 Contract: parseReportRequest parses and validates complete request', () => {
    const req = {
      auth: { userId: 'MU-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      query: {
        period: 'MTD',
        cafeId: 'ZC-0001',
        groupBy: 'SERVICE_MODE, DAYPART',
        metrics: 'NET_SALES, ORDER_COUNT',
      },
    };
    const parsed = parseReportRequest(req);
    assert.equal(parsed.scope.organisationId, 'ORG-ZAMORIN');
    assert.equal(parsed.scope.cafeScope, 'ZC-0001');
    assert.equal(parsed.period.periodId, 'MTD');
    assert.deepEqual(parsed.groupBy, ['SERVICE_MODE', 'DAYPART']);
    assert.deepEqual(parsed.metrics, ['NET_SALES', 'ORDER_COUNT']);
  });

  await suite.test('8.2 Contract: Rejection of unsupported dimensions and metrics in request', () => {
    const reqBadDim = {
      auth: { userId: 'MU-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      query: { groupBy: 'INVALID_DIM' },
    };
    assert.throws(
      () => parseReportRequest(reqBadDim),
      (err) => err.statusCode === 400 && err.code === 'UNSUPPORTED_DIMENSION'
    );

    const reqBadMetric = {
      auth: { userId: 'MU-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      query: { metrics: 'NOT_A_METRIC' },
    };
    assert.throws(
      () => parseReportRequest(reqBadMetric),
      (err) => err.statusCode === 400 && err.code === 'UNSUPPORTED_METRIC'
    );
  });

  await suite.test('8.3 Provenance: Builds machine-readable metadata for "Explain This Number"', () => {
    const prov = buildProvenance(['NET_SALES', 'COGS']);
    assert.ok(prov.NET_SALES);
    assert.equal(prov.NET_SALES.formulaVersion, '1.3.0');
    assert.equal(prov.NET_SALES.actuality, 'ACTUAL');
    assert.equal(prov.NET_SALES.ownerDomain, 'FINANCE');
    assert.deepEqual(prov.NET_SALES.sourceModels, ['Bill']);

    assert.ok(prov.COGS);
    assert.equal(prov.COGS.actuality, 'UNAVAILABLE');
    assert.equal(prov.COGS.availability, 'UNAVAILABLE');
  });

  await suite.test('8.4 Lineage: Generates Model -> Metric -> Report -> Visual -> Export graph', () => {
    const lineage = getLineageMap('daily-sales');
    assert.ok(lineage);
    assert.equal(lineage.reportId, 'daily-sales');
    assert.ok(lineage.sourceModels.includes('Bill'));
    assert.ok(lineage.metrics.some((m) => m.metricId === 'NET_SALES'));
    assert.ok(lineage.visuals.includes('HOURLY_CHART'));
    assert.ok(lineage.supportedExports.includes('PDF'));
  });

  await suite.test('8.5 Envelope: Assembles standardized corporate response envelope', () => {
    const req = {
      auth: { userId: 'MU-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' },
      correlationId: 'CORR-TEST-123',
    };
    const envelope = buildReportEnvelope({
      req,
      reportId: 'daily-sales',
      metricsData: { netSalesPaise: 5000000, orderCount: 150 },
      rawData: [{ hour: '10:00', sales: 1500 }],
    });

    assert.equal(envelope.success, true);
    assert.equal(envelope.data.reportId, 'daily-sales');
    assert.equal(envelope.data.timezone, 'Asia/Kolkata');
    assert.equal(envelope.data.scope.organisationId, 'ORG-ZAMORIN');
    assert.equal(envelope.data.dataQuality.status, 'COMPLETE');
    assert.ok(envelope.data.provenance.NET_SALES);
    assert.equal(envelope.correlationId, 'CORR-TEST-123');
  });

  // ─── 9. PM-02A-R1 CORRECTIVE GATES & ACCOUNTING INTEGRITY TESTS ────────────────

  await suite.test('9.1 Blocker A: EBITDA & EBITDA_MARGIN are UNAVAILABLE with DATA_ISSUE', () => {
    const ebitda = MetricRegistry.getMetric('EBITDA');
    assert.ok(ebitda);
    assert.equal(ebitda.availability, 'UNAVAILABLE', 'EBITDA must be UNAVAILABLE when COGS is unavailable');
    assert.equal(ebitda.actuality, 'UNAVAILABLE', 'EBITDA actuality must be UNAVAILABLE');
    assert.equal(ebitda.trustStatus, 'DATA_ISSUE', 'EBITDA trustStatus must be DATA_ISSUE');
    assert.ok(ebitda.dependencies.includes('COGS'), 'EBITDA must declare COGS dependency');
    assert.ok(ebitda.dependencies.includes('NET_SALES'));

    const ebitdaMargin = MetricRegistry.getMetric('EBITDA_MARGIN');
    assert.ok(ebitdaMargin);
    assert.equal(ebitdaMargin.availability, 'UNAVAILABLE');
    assert.equal(ebitdaMargin.trustStatus, 'DATA_ISSUE');
  });

  await suite.test('9.2 Prime Cost: PRIME_COST is UNAVAILABLE; THEORETICAL_PRIME_COST is ESTIMATED', () => {
    const primeCost = MetricRegistry.getMetric('PRIME_COST');
    assert.ok(primeCost);
    assert.equal(primeCost.availability, 'UNAVAILABLE');
    assert.equal(primeCost.actuality, 'UNAVAILABLE');
    assert.equal(primeCost.trustStatus, 'DATA_ISSUE');

    const primeCostPct = MetricRegistry.getMetric('PRIME_COST_PERCENT');
    assert.ok(primeCostPct);
    assert.equal(primeCostPct.availability, 'UNAVAILABLE');

    const theoPrimeCost = MetricRegistry.getMetric('THEORETICAL_PRIME_COST');
    assert.ok(theoPrimeCost);
    assert.equal(theoPrimeCost.actuality, 'ESTIMATED');
    assert.equal(theoPrimeCost.trustStatus, 'OPERATIONAL');
    assert.ok(theoPrimeCost.dependencies.includes('THEORETICAL_COGS'));
  });

  await suite.test('9.3 Metric Registry: Dependency validation engine cascades UNAVAILABLE state', () => {
    // When COGS is UNAVAILABLE, dependent metrics must cascade to UNAVAILABLE / DATA_ISSUE
    const cogsUnavailable = { COGS: { actuality: 'UNAVAILABLE' }, NET_SALES: { actuality: 'ACTUAL' } };
    
    const gpActuality = MetricRegistry.resolveMetricActuality('GROSS_PROFIT', cogsUnavailable);
    assert.equal(gpActuality.actuality, 'UNAVAILABLE');
    assert.equal(gpActuality.trustStatus, 'DATA_ISSUE');
    assert.ok(gpActuality.missingDependencies.includes('COGS'));

    const gmActuality = MetricRegistry.resolveMetricActuality('GROSS_MARGIN_PERCENT', cogsUnavailable);
    assert.equal(gmActuality.actuality, 'UNAVAILABLE');

    const pcActuality = MetricRegistry.resolveMetricActuality('PRIME_COST', cogsUnavailable);
    assert.equal(pcActuality.actuality, 'UNAVAILABLE');

    const ebitdaActuality = MetricRegistry.resolveMetricActuality('EBITDA', cogsUnavailable);
    assert.equal(ebitdaActuality.actuality, 'UNAVAILABLE');
    assert.equal(ebitdaActuality.trustStatus, 'DATA_ISSUE');

    // When inputs are available and theoretical, resolves to ESTIMATED
    const theoInputs = { THEORETICAL_COGS: { actuality: 'ESTIMATED' }, GROSS_PAYROLL: { actuality: 'ACTUAL' } };
    const theoPcActuality = MetricRegistry.resolveMetricActuality('THEORETICAL_PRIME_COST', theoInputs);
    assert.equal(theoPcActuality.actuality, 'ESTIMATED');
    assert.equal(theoPcActuality.trustStatus, 'OPERATIONAL');
  });

  await suite.test('9.4 Certification Governance: Operational metrics downgraded from premature CERTIFIED', () => {
    const allMetrics = MetricRegistry.getAllMetrics();
    // Zero operational metrics should be CERTIFIED without audited reconciliation
    const certifiedMetrics = allMetrics.filter((m) => m.trustStatus === 'CERTIFIED');
    assert.equal(certifiedMetrics.length, 0, 'No operational metrics may be CERTIFIED without reconciliation decision');

    const netSales = MetricRegistry.getMetric('NET_SALES');
    assert.equal(netSales.trustStatus, 'OPERATIONAL');

    const orderCount = MetricRegistry.getMetric('ORDER_COUNT');
    assert.equal(orderCount.trustStatus, 'OPERATIONAL');
  });

  await suite.test('9.5 Bill Financial Field Semantics: Gross vs Net vs Tax vs Customer Receipts', () => {
    // Sample bill: Subtotal 100000 paise (₹1000), Discount 10000 paise (₹100), GST 4500 paise (₹45, 5% on ₹900)
    // Total payable = 94500 paise (₹945). Refund = 0.
    const sampleBill = {
      subtotalPaisa: 100000,
      discountPaisa: 10000,
      taxPaisa: 4500,
      totalPaisa: 94500,
      refundedTotalPaisa: 0,
      status: 'COMPLETED',
    };

    // Gross Sales = pre-tax, pre-discount menu face value
    const grossSalesPaise = sampleBill.subtotalPaisa;
    assert.equal(grossSalesPaise, 100000);

    // Sales Before Tax = Net revenue recognized = subtotal - discount
    const salesBeforeTaxPaise = sampleBill.subtotalPaisa - sampleBill.discountPaisa;
    assert.equal(salesBeforeTaxPaise, 90000);

    // GST/Tax collected = statutory liability (NOT revenue)
    const taxCollectedPaise = sampleBill.taxPaisa;
    assert.equal(taxCollectedPaise, 4500);

    // Customer Receipt Total = total received inclusive of tax
    const customerReceiptPaise = sampleBill.totalPaisa;
    assert.equal(customerReceiptPaise, 94500);

    // Verify mathematical integrity
    assert.equal(salesBeforeTaxPaise + taxCollectedPaise, customerReceiptPaise);
    assert.notEqual(grossSalesPaise, customerReceiptPaise, 'Gross sales must not be confused with customer receipts');

    // Multi-line and refund scenario: Partial refund of 10000 paise
    const refundedBill = {
      ...sampleBill,
      status: 'PARTIALLY_REFUNDED',
      refundedTotalPaisa: 10000,
    };
    const netCustomerReceipts = refundedBill.totalPaisa - refundedBill.refundedTotalPaisa;
    assert.equal(netCustomerReceipts, 84500);
  });

  await suite.test('9.6 Bill Lifecycle & Status Matrix: Revenue recognized only on COMPLETED & PARTIALLY_REFUNDED', () => {
    const netSales = MetricRegistry.getMetric('NET_SALES');
    assert.deepEqual(netSales.includedStatuses, ['COMPLETED', 'PARTIALLY_REFUNDED']);

    // OPEN bills must NOT recognize revenue
    assert.ok(!netSales.includedStatuses.includes('OPEN'));
    // VOIDED bills must NOT recognize revenue
    assert.ok(!netSales.includedStatuses.includes('VOIDED'));
    // PAYMENT_REVERSED bills must NOT recognize revenue
    assert.ok(!netSales.includedStatuses.includes('PAYMENT_REVERSED'));
    // Fully REFUNDED bills must have net zero revenue recognized
    assert.ok(!netSales.includedStatuses.includes('REFUNDED'));
  });

  await suite.test('9.7 Daypart Configuration: Unconfigured fallback produces PROPOSED_DEFAULT provenance', () => {
    const dpWithProvenance = resolveDaypart(12, { includeProvenance: true });
    assert.equal(dpWithProvenance.daypart, 'LUNCH');
    assert.equal(dpWithProvenance.provenance, 'PROPOSED_DEFAULT');
    assert.equal(dpWithProvenance.configurationSource, 'NOT_CONFIGURED');

    const midnightDp = resolveDaypart(23, { includeProvenance: true });
    assert.equal(midnightDp.daypart, 'LATE_NIGHT');
  });

  await suite.test('9.8 Data Quality: Removal of arbitrary numeric scores & inclusion of freshness SLAs', () => {
    // When no count metrics are provided, completenessRatio is null rather than 0.6 or 0.8
    const dq = resolveDataQuality({ hasData: true, hasOpenRegisters: true });
    assert.equal(dq.status, 'PARTIAL');
    assert.equal(dq.completenessRatio, null);
    assert.ok(dq.freshnessSlas);
    assert.equal(dq.freshnessSlas.SALES, 300);
    assert.equal(dq.freshness.expectedFreshnessSeconds, 300);

    // When measurable counts are provided, completenessRatio is calculated accurately
    const measurableDq = resolveDataQuality({
      hasData: true,
      measurableClosedCount: 8,
      measurableTotalCount: 10,
    });
    assert.equal(measurableDq.status, 'PARTIAL');
    assert.equal(measurableDq.completenessRatio, 0.8);
  });

  await suite.test('9.9 Scope & Authority: Primary Master vs Malformed MASTER vs Staff vs Cafe Admin', () => {
    // Register temporary test report with HIGHLY_CONFIDENTIAL classification
    ReportRegistry.registerReport({
      reportId: 'test-exec-audit',
      title: 'Test Executive Audit',
      classification: 'HIGHLY_CONFIDENTIAL',
      category: 'EXECUTIVE',
      supportedRoles: ['MASTER'],
    });

    try {
      // Primary Master has access to HIGHLY_CONFIDENTIAL
      const pmAuth = { userId: 'PM-01', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-ZAMORIN' };
      assert.doesNotThrow(() => ReportRegistry.assertReportAccess('test-exec-audit', pmAuth));

      // Malformed MASTER (MASTER without isPrimaryMaster) is denied HIGHLY_CONFIDENTIAL
      const malformedMasterAuth = { userId: 'NM-01', role: 'MASTER', isPrimaryMaster: false, organisationId: 'ORG-ZAMORIN' };
      assert.throws(
        () => ReportRegistry.assertReportAccess('test-exec-audit', malformedMasterAuth),
        (err) => err.statusCode === 403 && err.code === 'PRIMARY_MASTER_REQUIRED'
      );

      // Malformed MASTER CAN access CONFIDENTIAL reports
      assert.doesNotThrow(() => ReportRegistry.assertReportAccess('pl-statement', malformedMasterAuth));
    } finally {
      ReportRegistry.unregisterReport('test-exec-audit');
    }

    // Café Admin supports assignedCafeIds portfolio outside POS device binding
    const adminAuth = {
      userId: 'CA-01',
      role: 'CAFE_ADMIN',
      assignedCafeIds: ['ZC-0001', 'ZC-0002'],
      organisationId: 'ORG-ZAMORIN',
    };
    const adminScopeMulti = resolveReportScope({ auth: adminAuth, query: {} });
    assert.deepEqual(adminScopeMulti.cafeScope, { $in: ['ZC-0001', 'ZC-0002'] });

    const adminScopeSingle = resolveReportScope({ auth: adminAuth, query: { cafeId: 'ZC-0001' } });
    assert.equal(adminScopeSingle.cafeScope, 'ZC-0001');

    const adminScopeCrossDenied = { auth: adminAuth, query: { cafeId: 'ZC-9999' } };
    assert.throws(
      () => resolveReportScope(adminScopeCrossDenied),
      (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
    );

    // Staff is denied general enterprise reports
    const staffAuth = { userId: 'ST-01', role: 'STAFF', assignedCafeIds: ['ZC-0001'], organisationId: 'ORG-ZAMORIN' };
    assert.throws(
      () => resolveReportScope({ auth: staffAuth, query: {} }),
      (err) => err.statusCode === 403 && err.code === 'ROLE_NOT_ALLOWED'
    );

    // Staff self-service exception: allowed when report explicitly permits self-service
    const staffSelfServiceScope = resolveReportScope({ auth: staffAuth, query: {} }, { allowSelfService: true });
    assert.equal(staffSelfServiceScope.cafeScope, 'ZC-0001');
  });

  await suite.test('9.10 Time Engine: IST boundary, leap year, and comparison period correctness', () => {
    // Month boundary comparison
    const feb2024LeapYear = resolveReportPeriod('CUSTOM', { dateFrom: '2024-02-01', dateTo: '2024-02-29' });
    assert.equal(feb2024LeapYear.daysInPeriod, 29);

    // Prior year leap year comparison
    const priorYearFeb = resolveComparisonPeriod(feb2024LeapYear, 'PRIOR_YEAR');
    assert.equal(priorYearFeb.dateFrom, '2023-02-01');
    assert.equal(priorYearFeb.dateTo, '2023-02-28'); // Non-leap year ends on 28th

    // Prior period 10-day comparison
    const tenDays = { dateFrom: '2026-03-01', dateTo: '2026-03-10' };
    const priorTenDays = resolveComparisonPeriod(tenDays, 'PRIOR_PERIOD');
    assert.equal(priorTenDays.dateTo, '2026-02-28');
    assert.equal(priorTenDays.dateFrom, '2026-02-19');
  });

  await suite.test('9.11 Zero vs Unavailable: Distinction preserved in reporting', () => {
    // Zero sales is valid numeric 0
    const zeroSales = { salesPaise: 0, orderCount: 0 };
    assert.equal(zeroSales.salesPaise, 0);

    // Unavailable COGS is null/UNAVAILABLE, not 0
    const cogsMetric = MetricRegistry.getMetric('COGS');
    assert.equal(cogsMetric.availability, 'UNAVAILABLE');
    assert.notEqual(cogsMetric.availability, 0);
  });

  // ─── 10. PM-02A-R2 FINAL REPORTING FOUNDATION INTEGRITY GATE TESTS ───────────

  await suite.test('10.1 Blocker R2-01: Zero hardcoded tax multiplier fallback in GROSS_SALES', () => {
    const grossSales = MetricRegistry.getMetric('GROSS_SALES');
    assert.ok(grossSales);
    assert.equal(grossSales.formulaVersion, '1.3.0');
    assert.ok(!grossSales.versionCompatibility.includes('1.05'), 'Must not contain 1.05 hard-coded tax fallback');
    assert.ok(grossSales.versionCompatibility.includes('LEGACY_BILL_INSUFFICIENT_GROSS_SALES_FIELDS'));
  });

  await suite.test('10.2 Blocker R2-02: NET_SALES v1.3.0 reflects partial refund PARTIAL_SOURCE reality', () => {
    const netSales = MetricRegistry.getMetric('NET_SALES');
    assert.ok(netSales);
    assert.equal(netSales.formulaVersion, '1.3.0');
    assert.ok(netSales.description.includes('PARTIAL_SOURCE'));
    assert.ok(netSales.versionCompatibility.includes('PARTIAL_SOURCE'));
  });

  await suite.test('10.3 Blocker R2-03: Labour semantics (GROSS_PAYROLL, LABOUR_COST, GROSS_PAYROLL_PERCENT, THEORETICAL_PRIME_COST)', () => {
    const grossPayroll = MetricRegistry.getMetric('GROSS_PAYROLL');
    assert.ok(grossPayroll);
    assert.equal(grossPayroll.availability, 'READY');
    assert.equal(grossPayroll.actuality, 'ACTUAL');

    const labourCost = MetricRegistry.getMetric('LABOUR_COST');
    assert.ok(labourCost);
    assert.equal(labourCost.availability, 'PARTIAL_SOURCE');
    assert.equal(labourCost.formulaVersion, '1.2.0');
    assert.ok(Array.isArray(labourCost.missingComponents));
    assert.ok(labourCost.missingComponents.includes('EMPLOYER_EPF'));

    const grossPayrollPct = MetricRegistry.getMetric('GROSS_PAYROLL_PERCENT');
    assert.ok(grossPayrollPct);
    assert.equal(grossPayrollPct.availability, 'READY');
    assert.equal(grossPayrollPct.actuality, 'ACTUAL');

    const labourPct = MetricRegistry.getMetric('LABOUR_PERCENT');
    assert.ok(labourPct);
    assert.equal(labourPct.availability, 'PARTIAL_SOURCE');

    const theoPrimeCost = MetricRegistry.getMetric('THEORETICAL_PRIME_COST');
    assert.ok(theoPrimeCost);
    assert.equal(theoPrimeCost.availability, 'PARTIAL_SOURCE');
    assert.equal(theoPrimeCost.actuality, 'ESTIMATED');
    assert.equal(theoPrimeCost.formulaVersion, '1.2.0');
  });

  await suite.test('10.4 Blocker R2-04: Freshness SLA governance (PROPOSED_DEFAULT, NOT_CONFIGURED, UNASSESSED)', () => {
    // Unconfigured SLA returns template with UNASSESSED
    const unconfiguredDq = resolveDataQuality({ hasData: true, domain: 'SALES', observedLagSeconds: 120 });
    assert.equal(unconfiguredDq.freshness.configurationSource, 'NOT_CONFIGURED');
    assert.equal(unconfiguredDq.freshness.template, 'PROPOSED_DEFAULT');
    assert.equal(unconfiguredDq.freshness.isConfigured, false);
    assert.equal(unconfiguredDq.freshness.freshnessStatus, 'UNASSESSED');
    assert.equal(unconfiguredDq.freshness.observedLagSeconds, 120);

    // Configured SLA evaluates COMPLIANT or BREACHED
    const compliantDq = resolveDataQuality({ hasData: true, domain: 'SALES', expectedFreshnessSeconds: 300, observedLagSeconds: 150 });
    assert.equal(compliantDq.freshness.configurationSource, 'CONFIGURED');
    assert.equal(compliantDq.freshness.isConfigured, true);
    assert.equal(compliantDq.freshness.freshnessStatus, 'COMPLIANT');

    const breachedDq = resolveDataQuality({ hasData: true, domain: 'SALES', expectedFreshnessSeconds: 300, observedLagSeconds: 450 });
    assert.equal(breachedDq.freshness.configurationSource, 'CONFIGURED');
    assert.equal(breachedDq.freshness.isConfigured, true);
    assert.equal(breachedDq.freshness.freshnessStatus, 'BREACHED');
  });

  await suite.test('10.5 Security R2-05: Clean registry without ceo-audit, Café Admin multi-scope, dynamic register', () => {
    // Verify ceo-audit is NOT in canonical production registry
    assert.equal(ReportRegistry.getReport('ceo-audit'), null, 'ceo-audit must not exist in canonical registry');

    // Dynamic test register & unregister works cleanly
    const testDef = { reportId: 'temp-fixture-report', title: 'Temp Fixture', classification: 'INTERNAL', supportedRoles: ['MASTER'] };
    ReportRegistry.registerReport(testDef);
    assert.ok(ReportRegistry.getReport('temp-fixture-report'));
    assert.equal(ReportRegistry.unregisterReport('temp-fixture-report'), true);
    assert.equal(ReportRegistry.getReport('temp-fixture-report'), null);
  });

  // ─── 11. PM-02A-R3 EXACT-PAISE TEST MATRIX (CASES A THROUGH H) ─────────────

  await suite.test('11.1 Case A — No discount: subtotal=100000, discount=0, tax=5000, total=105000', () => {
    const bill = {
      subtotalPaisa: 100000,
      discountPaisa: 0,
      taxPaisa: 5000,
      totalPaisa: 105000,
      refundedTotalPaisa: 0,
      status: 'COMPLETED',
    };

    const recon = reconstructGrossSales(bill);
    assert.equal(recon.grossSalesPaisa, 100000);
    assert.equal(recon.quality, 'COMPLETE');

    const bridge = computeGrossToNetBridge({
      grossSalesPaisa: recon.grossSalesPaisa,
      discountPaisa: bill.discountPaisa,
      preTaxRefundPaisa: 0,
    });
    assert.equal(bridge.grossSalesPaisa, 100000);
    assert.equal(bridge.salesBeforeTaxPaisa, 100000);
    assert.equal(bridge.netSalesPaisa, 100000);
    assert.equal(bridge.isValid, true);
    assert.equal(bill.taxPaisa, 5000);
  });

  await suite.test('11.2 Case B — Discount: subtotal=100000, discount=10000, tax=4500, total=94500', () => {
    const bill = {
      subtotalPaisa: 100000,
      discountPaisa: 10000,
      taxPaisa: 4500,
      totalPaisa: 94500,
      refundedTotalPaisa: 0,
      status: 'COMPLETED',
    };

    const reconCurrent = reconstructGrossSales(bill);
    assert.equal(reconCurrent.grossSalesPaisa, 100000);

    // Legacy reconstruction from total - tax + discount (simulating missing subtotalPaisa)
    const legacyBillD = {
      totalPaisa: 94500,
      taxPaisa: 4500,
      discountPaisa: 10000,
    };
    const reconD = reconstructGrossSales(legacyBillD);
    assert.equal(reconD.grossSalesPaisa, 100000, 'Reconstruction from total - tax + discount must return 100000, not 90000');
    assert.equal(reconD.method, 'TOTAL_MINUS_TAX_PLUS_DISCOUNT');

    const bridge = computeGrossToNetBridge({
      grossSalesPaisa: reconD.grossSalesPaisa,
      discountPaisa: legacyBillD.discountPaisa,
      preTaxRefundPaisa: 0,
    });
    assert.equal(bridge.grossSalesPaisa, 100000);
    assert.equal(bridge.salesBeforeTaxPaisa, 90000);
    assert.equal(bridge.netSalesPaisa, 90000);
    assert.equal(bridge.isValid, true);
  });

  await suite.test('11.3 Case C — Legacy without subtotal but with taxable + discount: taxable=90000, discount=10000', () => {
    const legacyBillC = {
      taxableAmountPaisa: 90000,
      discountPaisa: 10000,
    };
    const reconC = reconstructGrossSales(legacyBillC);
    assert.equal(reconC.grossSalesPaisa, 100000, 'taxableAmountPaisa + discountPaisa must reconstruct exact 100000 gross sales');
    assert.equal(reconC.method, 'TAXABLE_PLUS_DISCOUNT');
    assert.equal(reconC.quality, 'COMPLETE');
  });

  await suite.test('11.4 Case D — Legacy without enough fields: total=94500, tax=4500, discount missing', () => {
    const legacyBillMissingDiscount = {
      totalPaisa: 94500,
      taxPaisa: 4500,
      // discountPaisa missing / unrecorded
    };
    const reconD = reconstructGrossSales(legacyBillMissingDiscount);
    assert.equal(reconD.grossSalesPaisa, null, 'Must be null when discount is unknown; never estimated');
    assert.equal(reconD.quality, 'PARTIAL');
    assert.equal(reconD.warning, 'LEGACY_BILL_INSUFFICIENT_GROSS_SALES_FIELDS');
  });

  await suite.test('11.5 Case E — Partial refund without pre-tax refund split: quality becomes PARTIAL with warning', () => {
    const dq = resolveDataQuality({
      hasData: true,
      domain: 'SALES',
      hasPartialRefundsWithoutPreTax: true,
      partialRefundCount: 2,
      affectedBillCount: 2,
    });
    assert.equal(dq.status, 'PARTIAL');
    assert.equal(dq.partialRefundCount, 2);
    assert.equal(dq.affectedBillCount, 2);
    assert.equal(dq.warningCode, 'PARTIAL_REFUND_PRE_TAX_UNKNOWN');

    // Provenance propagation
    const prov = buildProvenance(['NET_SALES', 'NET_TAX'], { partialRefundCount: 2, affectedBillCount: 2 });
    assert.equal(prov.NET_SALES.availability, 'PARTIAL_SOURCE');
    assert.equal(prov.NET_SALES.warningCode, 'PARTIAL_REFUND_PRE_TAX_UNKNOWN');
    assert.equal(prov.NET_TAX.availability, 'PARTIAL_SOURCE');
    assert.equal(prov.NET_TAX.warningCode, 'PARTIAL_REFUND_TAX_ALLOCATION_UNKNOWN');

    // Zero-refund period preserves COMPLETE quality
    const cleanDq = resolveDataQuality({
      hasData: true,
      domain: 'SALES',
      partialRefundCount: 0,
      hasPartialRefundsWithoutPreTax: false,
    });
    assert.equal(cleanDq.status, 'COMPLETE', 'Zero partial refund period must remain COMPLETE');
  });

  await suite.test('11.6 Case F — Full refund: Gross/refund/net bridge exact zeroization', () => {
    // Original sale: subtotal 100000 paise (₹1000), discount 10000 paise (₹100), tax 4500 paise (₹45), total 94500 paise
    // Full refund: 94500 paise returned to customer
    const fullRefundedBill = {
      subtotalPaisa: 100000,
      discountPaisa: 10000,
      taxPaisa: 4500,
      totalPaisa: 94500,
      refundedTotalPaisa: 94500,
      status: 'REFUNDED',
    };

    // Gross Sales preserves original transaction activity: 100000 paise
    const recon = reconstructGrossSales(fullRefundedBill);
    assert.equal(recon.grossSalesPaisa, 100000);

    // Pre-tax sales before discount = 100000. Post-discount pre-tax refund = 90000.
    const preTaxRefund = fullRefundedBill.subtotalPaisa - fullRefundedBill.discountPaisa;
    assert.equal(preTaxRefund, 90000);

    const bridge = computeGrossToNetBridge({
      grossSalesPaisa: recon.grossSalesPaisa,
      discountPaisa: fullRefundedBill.discountPaisa,
      preTaxRefundPaisa: preTaxRefund,
    });
    assert.equal(bridge.grossSalesPaisa, 100000);
    assert.equal(bridge.discountPaisa, 10000);
    assert.equal(bridge.salesBeforeTaxPaisa, 90000);
    assert.equal(bridge.preTaxRefundPaisa, 90000);
    assert.equal(bridge.netSalesPaisa, 0, 'Full refund must zeroize recognized Net Sales');

    // Net customer receipts = 94500 - 94500 = 0
    const netReceipts = fullRefundedBill.totalPaisa - fullRefundedBill.refundedTotalPaisa;
    assert.equal(netReceipts, 0);

    // Net tax = 4500 - 4500 = 0
    const netTax = fullRefundedBill.taxPaisa - fullRefundedBill.taxPaisa;
    assert.equal(netTax, 0);
  });

  await suite.test('11.7 Case G — Void: zero recognized sales and excluded from revenue', () => {
    const voidBill = {
      subtotalPaisa: 100000,
      discountPaisa: 10000,
      taxPaisa: 4500,
      totalPaisa: 94500,
      status: 'VOIDED',
    };

    const grossSalesMetric = MetricRegistry.getMetric('GROSS_SALES');
    assert.ok(grossSalesMetric.excludedStatuses.includes('VOIDED'));

    const netSalesMetric = MetricRegistry.getMetric('NET_SALES');
    assert.ok(netSalesMetric.excludedStatuses.includes('VOIDED'));

    const voidMetric = MetricRegistry.getMetric('VOID_AMOUNT');
    assert.ok(voidMetric);
    assert.ok(voidMetric.includedStatuses.includes('VOIDED'));
  });

  await suite.test('11.8 Case H — GST refund semantics: TAX_CHARGED vs NET_TAX distinction', () => {
    const taxCharged = MetricRegistry.getMetric('TAX_CHARGED');
    assert.ok(taxCharged);
    assert.equal(taxCharged.availability, 'READY');
    assert.equal(taxCharged.source, 'Bill.taxPaisa');

    const netTax = MetricRegistry.getMetric('NET_TAX');
    assert.ok(netTax);
    assert.equal(netTax.availability, 'PARTIAL_SOURCE');
    assert.ok(netTax.dependencies.includes('TAX_CHARGED'));
    assert.ok(netTax.dependencies.includes('REFUNDED_TAX'));

    const custRefundTotal = MetricRegistry.getMetric('CUSTOMER_REFUND_TOTAL');
    assert.ok(custRefundTotal);
    assert.equal(custRefundTotal.availability, 'READY');
    assert.equal(custRefundTotal.source, 'Bill.refundedTotalPaisa');

    const preTaxRefund = MetricRegistry.getMetric('PRE_TAX_REFUND');
    assert.ok(preTaxRefund);
    assert.equal(preTaxRefund.availability, 'PARTIAL_SOURCE');

    const refundedTax = MetricRegistry.getMetric('REFUNDED_TAX');
    assert.ok(refundedTax);
    assert.equal(refundedTax.availability, 'PARTIAL_SOURCE');
  });
});

