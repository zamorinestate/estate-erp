'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(__dirname, '..', 'src', 'services', 'posOrderService.js');
const modelPath = path.join(__dirname, '..', 'src', 'models', 'PrintJob.js');
const billPath = path.join(__dirname, '..', 'src', 'models', 'Bill.js');
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'js', 'pages', 'posTill.js');

test('POS print truthfulness: dispatch without hardware acknowledgement is never recorded as PRINTED', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.doesNotMatch(
    source,
    /new PrintJob\([\s\S]{0,500}?status:\s*['"]PRINTED['"]/,
    'Server-side PrintJob creation must not claim PRINTED without hardware acknowledgement'
  );

  assert.doesNotMatch(
    source,
    /printStatus:\s*['"]PRINTED['"]/,
    'POS service responses must not claim PRINTED when only a print payload was dispatched'
  );

  assert.match(source, /status:\s*['"]DISPATCHED['"]/);
  assert.match(source, /printStatus:\s*['"]PRINT_DISPATCHED['"]/);
  assert.match(source, /printDispatched:\s*true/);
});

test('POS print truthfulness: schemas explicitly support dispatched-but-not-completed state', () => {
  const printJob = fs.readFileSync(modelPath, 'utf8');
  const bill = fs.readFileSync(billPath, 'utf8');

  assert.match(printJob, /['"]DISPATCHED['"]/);
  assert.match(bill, /['"]PRINT_DISPATCHED['"]/);
});

test('POS print truthfulness: browser flow describes backend print work as queued before local print dialog', () => {
  const frontend = fs.readFileSync(frontendPath, 'utf8');

  assert.match(frontend, /Thermal print job queued on POS printer\./);
  assert.match(frontend, /window\.print\(\)/);
});

test('POS print audit identities are collision-resistant and not timestamp-derived', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /PJ-PRT-\$\{Date\.now\(\)\}/);
  assert.doesNotMatch(source, /PJ-REP-\$\{Date\.now\(\)\}/);
  assert.doesNotMatch(source, /Math\.floor\(100000 \+ Math\.random\(\) \* 900000\)/);
});

test('POS print tracking failures are surfaced instead of silently swallowed', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /PRINT_JOB_PERSISTENCE_FAILED/);
  assert.match(source, /printTrackingPersisted/);
  assert.match(source, /printTrackingWarning/);
  assert.doesNotMatch(
    source,
    /await pj\.save\(\);\s*\}\s*catch\s*\{\s*\}/,
    'PrintJob persistence failures must never be silently swallowed'
  );
});

