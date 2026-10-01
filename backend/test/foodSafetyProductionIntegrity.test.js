'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('FS-TRUTH-001: Food Safety service uses canonical audit service, not invalid AuditEvent payloads', () => {
  const source = read('../src/services/foodSafetyService.js');
  assert.ok(source.includes("const { recordAuditEvent } = require('./auditService')"));
  assert.ok(source.includes('recordFoodSafetyAudit'));
  assert.equal(source.includes('await AuditEvent.create({'), false);
  assert.equal(source.includes('.catch(() => {})'), false);
});

test('FS-TRUTH-002: Food Safety operational IDs do not use Math.random', () => {
  const source = read('../src/services/foodSafetyService.js');
  assert.equal(source.includes('Math.random()'), false);
  assert.ok(source.includes('SequenceCounter.generateId'));
  for (const key of [
    'TEMPERATURE_LOG_',
    'CLEANING_TASK_',
    'PEST_CONTROL_',
    'CALIBRATION_',
    'FOOD_SAFETY_TRAINING_',
  ]) {
    assert.ok(source.includes(key), key);
  }
});

test('FS-TRUTH-003: Quality controller contains no fabricated CAFE-001 list scope', () => {
  const source = read('../src/controllers/qualityController.js');
  assert.equal(source.includes("targetCafe || 'CAFE-001'"), false);
  assert.equal(source.includes("cafeId: targetCafe || 'CAFE-001'"), false);
  assert.ok(source.includes('resolveSafetyRegisterScope'));
  assert.ok(source.includes("['__NO_AUTHORIZED_CAFE__']"));
});

test('FS-TRUTH-004: safety register services support exact, assigned-set, and portfolio scope', () => {
  const source = read('../src/services/foodSafetyService.js');
  for (const fn of [
    'listTemperatures',
    'listCleaningTasks',
    'listPestControl',
    'listCalibrations',
  ]) {
    const start = source.indexOf(`static async ${fn}`);
    assert.ok(start >= 0, fn);
    const block = source.slice(start, start + 1800);
    assert.ok(block.includes('cafeId = null'), `${fn} exact cafe`);
    assert.ok(block.includes('cafeIds = []'), `${fn} cafe set`);
    assert.ok(block.includes("query.cafeId = { $in: cafeIds }" ) || block.includes("scope.cafeId = { $in: cafeIds }"), `${fn} assigned set filter`);
  }
});

test('FS-TRUTH-005: controller propagates authenticated role into auditable Food Safety actions', () => {
  const source = read('../src/controllers/qualityController.js');
  const occurrences = source.match(/actorRole: request\.auth\.role/g) || [];
  assert.ok(occurrences.length >= 3);
});

test('FS-TRUTH-006: Food Safety list errors are not converted into synthetic empty temperature results', () => {
  const source = read('../src/controllers/qualityController.js');
  const start = source.indexOf('const listTemperatures = asyncHandler');
  const end = source.indexOf('const recordTemperature = asyncHandler', start);
  const block = source.slice(start, end);
  assert.equal(block.includes('catch (err)'), false);
  assert.equal(block.includes('logs = []'), false);
});
