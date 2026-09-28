'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const bridgeSource = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/src/js/services/hardwareBridgeClient.js'),
  'utf8'
);
const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/src/js/pages/dashboardAdmin.js'),
  'utf8'
);

test('barcode scanner readiness is evidence-based, not hard-coded Ready', () => {
  assert.match(bridgeSource, /barcodeScannerStatus/);
  assert.match(bridgeSource, /scannerLastDetectedAt/);
  assert.match(bridgeSource, /this\.scannerLastDetectedAt\s*=\s*new Date\(\)\.toISOString\(\)/);

  assert.doesNotMatch(
    dashboardSource,
    /Barcode Scanner:<\/span>[\s\S]{0,180}>[^<]*(?:✓\s*)?Ready</,
    'Café Operations dashboard must not claim scanner readiness without detection evidence'
  );

  assert.match(dashboardSource, /hardwareBridge\.initBarcodeScannerListener\(\)/);
  assert.match(dashboardSource, /Listening · not yet detected/);
  assert.match(dashboardSource, /scannerStatus === 'DETECTED'/);
});

test('camera QR support is described as capability, not verified readiness', () => {
  assert.match(bridgeSource, /cameraScannerSupported/);
  assert.match(dashboardSource, /Supported · not yet verified/);
  assert.doesNotMatch(
    dashboardSource,
    /QR\/Face Scanner:<\/span>[\s\S]{0,160}>Ready</,
    'Camera scanner must not be hard-coded Ready'
  );
});
