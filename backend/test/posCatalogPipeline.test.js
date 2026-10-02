'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');

const { MenuItem } = require('../src/models/MenuItem');
const { OutletOffering } = require('../src/models/OutletOffering');
const posRoutes = require('../src/routes/posRoutes');
const { errorHandler } = require('../src/middleware/errorHandler');

// In-memory / mock setup helper
function createTestApp(authContext) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.auth = authContext;
    next();
  });
  app.use('/api/v1/pos', posRoutes);
  app.use(errorHandler);
  return app;
}

test('POS Menu Catalog Pipeline Suite (§28)', async (t) => {
  const orgId = 'ORG-POS-TEST';
  const cafeId = 'ZC-0001';

  // Seed mock MenuItems in Mongoose (mock or real)
  const originalFindMenuItem = MenuItem.find;
  const originalFindOffering = OutletOffering.find;

  t.after(() => {
    MenuItem.find = originalFindMenuItem;
    OutletOffering.find = originalFindOffering;
  });

  await t.test('POS-CAT-01: Returns active CAFE and SHARED menu items mapped to POS categories and prices', async () => {
    const mockMenuItems = [
      {
        menuItemId: 'ITM-01',
        itemCode: 'COF-01',
        plu: '101',
        name: 'Zamorin House Pour-Over',
        category: 'COFFEE',
        conceptEligibility: 'CAFE',
        currentPricePaisa: 22000,
        status: 'ACTIVE',
        dietaryTags: ['VEG'],
        variants: [],
        description: 'Single origin pour over',
      },
      {
        menuItemId: 'ITM-02',
        itemCode: 'COF-02',
        plu: '102',
        name: '18-Hour Iced Cold Brew',
        category: 'COFFEE',
        conceptEligibility: 'CAFE',
        currentPricePaisa: 25000,
        status: 'ACTIVE',
        dietaryTags: ['VEG'],
        variants: [{ name: 'Large' }],
        description: 'Slow steeped iced brew',
      },
      {
        menuItemId: 'ITM-03',
        itemCode: 'BAK-01',
        plu: '201',
        name: 'Butter Croissant',
        category: 'BAKERY',
        conceptEligibility: 'SHARED',
        currentPricePaisa: 18000,
        status: 'ACTIVE',
        dietaryTags: ['VEG'],
        variants: [],
      },
      {
        menuItemId: 'ITM-04',
        itemCode: 'SNK-01',
        plu: '301',
        name: 'Smoked Chicken Ciabatta',
        category: 'MAIN_COURSE',
        conceptEligibility: 'SHARED',
        currentPricePaisa: 35000,
        status: 'ACTIVE',
        dietaryTags: ['NON_VEG'],
        variants: [],
      },
    ];

    MenuItem.find = () => ({
      sort: () => ({
        lean: async () => mockMenuItems,
      }),
    });

    OutletOffering.find = () => ({
      lean: async () => [
        {
          menuItemId: 'ITM-01',
          outletId: cafeId,
          isEnabled: true,
          channels: { pos: true },
          localPricePaisaOverride: 23000, // Price override
          isAvailable: true,
        },
        {
          menuItemId: 'ITM-02',
          outletId: cafeId,
          isEnabled: true,
          channels: { pos: true },
          isAvailable: true,
        },
        {
          menuItemId: 'ITM-03',
          outletId: cafeId,
          isEnabled: false, // Disabled for this cafe
          channels: { pos: true },
          isAvailable: true,
        },
        {
          menuItemId: 'ITM-04',
          outletId: cafeId,
          isEnabled: true,
          channels: { pos: false }, // Disabled for POS channel
          isAvailable: true,
        },
      ],
    });

    const app = createTestApp({
      userId: 'STF-01',
      role: 'STAFF',
      organisationId: orgId,
      primaryCafeId: cafeId,
      assignedCafeIds: [cafeId],
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/pos/catalog/${cafeId}`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.cafeId, cafeId);
      assert.equal(data.total, 2); // ITM-01 and ITM-02 included; ITM-03 is disabled, ITM-04 is disabled on POS channel

      const itm1 = data.items.find((i) => i.id === 'ITM-01');
      assert.ok(itm1);
      assert.equal(itm1.category, 'Hot Coffees');
      assert.equal(itm1.price, 230); // Local override of 23000 paisa
      assert.equal(itm1.pricePaisa, 23000);
      assert.equal(itm1.foodType, 'Veg');
      assert.equal(itm1.hasModifiers, false);

      const itm2 = data.items.find((i) => i.id === 'ITM-02');
      assert.ok(itm2);
      assert.equal(itm2.category, 'Cold Brews'); // Mapped via 'Iced'
      assert.equal(itm2.price, 250);
      assert.equal(itm2.hasModifiers, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('POS-CAT-02: Cross-cafe access is rejected for scoped staff/admin with 403', async () => {
    const app = createTestApp({
      userId: 'STF-01',
      role: 'STAFF',
      organisationId: orgId,
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/pos/catalog/ZC-0002`);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('POS-CAT-03: Primary Master has org-wide catalog access across cafes', async () => {
    MenuItem.find = () => ({
      sort: () => ({
        lean: async () => [],
      }),
    });
    OutletOffering.find = () => ({
      lean: async () => [],
    });

    const app = createTestApp({
      userId: 'MU-0001',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: orgId,
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/pos/catalog/ZC-9999`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.cafeId, 'ZC-9999');
      assert.deepEqual(data.items, []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('POS-CAT-04: Vendor account is strictly forbidden from accessing POS catalog', async () => {
    const app = createTestApp({
      userId: 'VND-01',
      role: 'VENDOR',
      organisationId: orgId,
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/pos/catalog/ZC-0001`);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error?.code, 'FORBIDDEN_VENDOR_ACCESS');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
