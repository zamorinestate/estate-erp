'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = path.join(__dirname, '..', 'src', 'controllers', 'posController.js');
const routesPath = path.join(__dirname, '..', 'src', 'routes', 'posRoutes.js');

test('POS offline review HTTP boundary requires explicit Primary-Master authority before service execution', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');
  const start = source.indexOf('const reviewOfflineOrder = asyncHandler');
  const end = source.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, 'reviewOfflineOrder controller must exist');

  const block = source.slice(start, end);
  assert.match(block, /role === 'MASTER' && request\.auth\?\.isPrimaryMaster !== true/);
  assert.match(block, /PRIMARY_MASTER_AUTHORITY_REQUIRED/);

  const serviceCall = block.indexOf('OfflineSyncService.reviewItem');
  const authorityCheck = block.indexOf("role === 'MASTER' && request.auth?.isPrimaryMaster !== true");
  assert.ok(authorityCheck >= 0 && serviceCall > authorityCheck, 'Primary-Master guard must execute before reviewItem service call');
});

test('POS routes keep pending-review and review-decision endpoints behind authentication', () => {
  const source = fs.readFileSync(routesPath, 'utf8');
  const authUse = source.indexOf('router.use(authenticate)');
  const pending = source.indexOf("router.get('/offline-reviews/pending'");
  const review = source.indexOf("router.post('/offline-reviews/:reviewId/review'");

  assert.ok(authUse >= 0, 'POS router must apply authenticate middleware');
  assert.ok(pending > authUse, 'pending offline reviews route must be declared after authenticate middleware');
  assert.ok(review > authUse, 'offline review decision route must be declared after authenticate middleware');
});
