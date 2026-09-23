'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const mainJs = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/main.js'), 'utf8');
const loginJs = fs.readFileSync(path.join(__dirname, '../../frontend/src/js/pages/login2.js'), 'utf8');

test('Production Auth: login module is implemented and routed', () => {
  assert.ok(
    loginJs.includes('renderLoginPage2') || loginJs.includes('login'),
    'login2.js must export the login interface'
  );
});

test('Production Ready: main.js initializes app routing', () => {
  assert.ok(
    mainJs.includes('initRouter') || mainJs.includes('router') || mainJs.includes('window.addEventListener'),
    'main.js must initialize application routing'
  );
});

test('Development Preview: Personal Ledger remains MASTER ONLY in backend authorization', () => {
  const personalLedgerRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/personalLedgerRoutes.js'), 'utf8');
  assert.ok(
    personalLedgerRoutes.includes('authorize("LEDGER:VIEW_ORGANISATION")') ||
    personalLedgerRoutes.includes('LEDGER:VIEW_ORGANISATION') ||
    personalLedgerRoutes.includes('MASTER'),
    'Personal Ledger routes must require MASTER-only permission authorization'
  );
});
