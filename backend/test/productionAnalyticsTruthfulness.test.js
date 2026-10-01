'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('AN-TRUTH-001: menu engineering never uses randomized popularity', () => {
  const source = read('../src/services/ownerMenuPricingService.js');
  const start = source.indexOf('async getMenuEngineeringMatrix');
  const end = source.indexOf('async simulatePriceScenario', start);
  const block = source.slice(start, end);

  assert.equal(block.includes('Math.random()'), false);
  assert.ok(block.includes('Bill.aggregate'));
  assert.ok(block.includes('POS_BILL_LINE_ITEMS_LAST_30_DAYS'));
  assert.ok(block.includes('UNCLASSIFIED_POPULARITY_UNAVAILABLE'));
});

test('AN-TRUTH-002: quality traceability contains no fabricated recall drill or sample lot claims', () => {
  const source = read('../src/controllers/qualityController.js');
  const start = source.indexOf('const getTraceability = asyncHandler');
  const end = source.indexOf('const getQualityIntegrity = asyncHandler', start);
  const block = source.slice(start, end);

  for (const forbidden of [
    'Nilgiri Dairy Co-operative',
    'LOT-20260815-MILK',
    '50 of 50 L Accounted',
    'mockRecallDrillElapsedSeconds',
    "status: 'RECALL_READY'",
    '100% (GAPLESS)',
  ]) {
    assert.equal(block.includes(forbidden), false, forbidden);
  }
  assert.ok(block.includes("status: 'NOT_ASSESSED'"));
  assert.ok(block.includes("sourceStatus: 'AUTHORITATIVE'"));
  assert.ok(block.includes('InventoryLot.findOne'));
});

test('AN-TRUTH-003: quality compliance register is sourced from real masters, not fixed licence fixtures', () => {
  const source = read('../src/controllers/qualityController.js');
  const start = source.indexOf('const getComplianceRegister = asyncHandler');
  const end = source.indexOf('const getTraceability = asyncHandler', start);
  const block = source.slice(start, end);

  for (const forbidden of [
    '11226334000189',
    'LAB-WAT-2026-88',
    'PEST-SVC-2026-AUG',
    'FOSTAC-2026-CERT-04',
    'CALIB-2026-9021',
  ]) {
    assert.equal(block.includes(forbidden), false, forbidden);
  }
  assert.ok(block.includes('Cafe.find'));
  assert.ok(block.includes('CalibrationRecord.find'));
  assert.ok(block.includes('EmployeeTraining.find'));
});

test('AN-TRUTH-004: quality integrity cannot blanket-claim 100 percent PASS without coverage', () => {
  const source = read('../src/controllers/qualityController.js');
  const start = source.indexOf('const getQualityIntegrity = asyncHandler');
  const end = source.indexOf('// ── Food Safety Incidents', start);
  const block = source.slice(start, end);

  assert.equal(block.includes('integrityScore: 100'), false);
  assert.equal(block.includes("status: 'PASS' },"), false);
  assert.ok(block.includes('coveragePercent'));
  assert.ok(block.includes("status: 'NOT_VERIFIED'"));
  assert.ok(block.includes('allPassed: verified.length === checks.length'));
});

test('AN-TRUTH-005: theoretical ingredient forecast never assigns aggregate forecast points to Sample Dish', () => {
  const source = read('../src/controllers/reportController.js');
  const runStart = source.indexOf('const runForecast = asyncHandler');
  const runEnd = source.indexOf('const runScenarioSimulation = asyncHandler', runStart);
  const block = source.slice(runStart, runEnd);

  assert.equal(block.includes("itemName: 'Sample Dish'"), false);
  assert.ok(block.includes('PER_MENU_ITEM_DIMENSIONED_FORECAST_REQUIRED'));
  assert.ok(block.includes('itemForecasts'));
  assert.ok(block.includes("status: 'SOURCE_UNAVAILABLE'"));
});

test('AN-TRUTH-006: ingredient forecast explicitly states why aggregate series cannot be recipe-mapped', () => {
  const source = read('../src/controllers/reportController.js');
  assert.ok(source.includes('Aggregate forecast points are not assigned to synthetic menu items.'));
});
