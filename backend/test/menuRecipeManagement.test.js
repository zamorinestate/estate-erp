'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/server');
const { MenuItem } = require('../src/models/MenuItem');
const { Recipe } = require('../src/models/Recipe');
const { ModifierGroup } = require('../src/models/ModifierGroup');
const { ComboDefinition } = require('../src/models/ComboDefinition');
const { Menu } = require('../src/models/Menu');
const { MenuSection } = require('../src/models/MenuSection');
const { OutletOffering } = require('../src/models/OutletOffering');
const { ServiceModeBOM } = require('../src/models/ServiceModeBOM');
const { MenuChangeSet } = require('../src/models/MenuChangeSet');
const { MenuPublication } = require('../src/models/MenuPublication');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { User } = require('../src/models/User');
const { RolePermission } = require('../src/models/RolePermission');
const { MenuService } = require('../src/services/MenuService');
const authService = require('../src/services/authService');

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
          let parsedJson = null;
          try {
            parsedJson = responseData ? JSON.parse(responseData) : null;
          } catch (e) {
            parsedJson = responseData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedJson,
          });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

function createQueryWrapper(resolvedValue) {
  const query = {
    select() { return query; },
    sort() { return query; },
    skip() { return query; },
    limit() { return query; },
    lean() { return Promise.resolve(resolvedValue); },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolvedValue).then(onFulfilled, onRejected);
    },
  };
  return query;
}

test('SCR-013: Menu & Recipe Management Integration Suite', async (t) => {
  const app = createApp({ allowedOrigins: ['*'], production: false });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const primaryMaster = {
    userId: 'USR-PRIMARY-MASTER',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: true,
    email: 'primary@zamorin.com',
    fullName: 'Primary Master',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const malformedMaster = {
    userId: 'USR-MALFORMED-MASTER',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    email: 'malformed.master@zamorin.com',
    fullName: 'Malformed MASTER',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001', 'ZC-0002'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  const cafeAdminKora = {
    userId: 'USR-ADMIN-KORA',
    organisationId: 'ORG-ZAMORIN',
    role: 'CAFE_ADMIN',
    email: 'admin.kora@zamorin.com',
    fullName: 'Koramangala Admin',
    sessionVersion: 1,
    permissionsVersion: 1,
    assignedCafeIds: ['ZC-0001'],
    accountStatus: 'ACTIVE',
    save: async function () { return this; },
  };

  // In-memory collections
  const inMemoryItems = [
    {
      menuItemId: 'MENU-01',
      organisationId: 'ORG-ZAMORIN',
      itemCode: 'ITM-MENU-01',
      plu: 'MENU-01',
      name: 'Zamorin Signature Estate Pour-Over',
      nameLower: 'zamorin signature estate pour-over',
      category: 'COFFEE',
      conceptEligibility: 'CAFE',
      currentPricePaisa: 24000,
      dietaryTags: ['VEG'],
      allergenTags: [],
      status: 'ACTIVE',
      save: async function () { return this; },
    },
    {
      menuItemId: 'MENU-02',
      organisationId: 'ORG-ZAMORIN',
      itemCode: 'ITM-MENU-02',
      plu: 'MENU-02',
      name: 'Spanish Cortado (Double Shot)',
      nameLower: 'spanish cortado (double shot)',
      category: 'COFFEE',
      conceptEligibility: 'CAFE',
      currentPricePaisa: 21000,
      dietaryTags: ['VEG'],
      allergenTags: ['DAIRY'],
      status: 'ACTIVE',
      save: async function () { return this; },
    },
  ];

  const inMemoryRecipes = [];
  const inMemoryModifierGroups = [];
  const inMemoryCombos = [];
  const inMemoryMenus = [];
  const inMemoryOfferings = [];
  const inMemoryBOMs = [];
  const inMemoryChangeSets = [];
  const inMemoryPublications = [];
  const inMemoryInventory = [
    {
      itemId: 'INV-COFFEE-BEAN-001',
      organisationId: 'ORG-ZAMORIN',
      name: 'Arabica Coffee Beans',
      primaryUom: 'KG',
      standardCostPaisa: 120000, // ₹1200 / KG = ₹1.20 / g
      lastPurchasePricePaisa: 120000,
      save: async function () { return this; },
    },
    {
      itemId: 'INV-MILK-001',
      organisationId: 'ORG-ZAMORIN',
      name: 'Full Cream Fresh Milk',
      primaryUom: 'LITER',
      standardCostPaisa: 6000, // ₹60 / L = ₹0.06 / ml
      lastPurchasePricePaisa: 6000,
      save: async function () { return this; },
    },
    {
      itemId: 'INV-CUP-8OZ',
      organisationId: 'ORG-ZAMORIN',
      name: '8oz Paper Cup',
      primaryUom: 'UNIT',
      standardCostPaisa: 500, // ₹5 / cup
      lastPurchasePricePaisa: 500,
      save: async function () { return this; },
    },
  ];

  t.mock.method(authService, 'verifyAccessToken', async (token) => {
    let activeUser = primaryMaster;
    if (token === 'token_malformed_master') activeUser = malformedMaster;
    if (token === 'token_kora_admin') activeUser = cafeAdminKora;
    return {
      payload: {
        sub: activeUser.userId,
        org: activeUser.organisationId,
        role: activeUser.role,
        isPrimaryMaster: activeUser.isPrimaryMaster,
        sv: 0,
        usv: 1,
        pv: 1,
        sid: 'SS-MENU-TEST',
      },
      session: {
        sessionId: 'SS-MENU-TEST',
        roleSnapshot: activeUser.role,
        sessionVersion: 0,
        mfaVerified: true,
        stepUpVerifiedAt: new Date().toISOString(),
      },
    };
  });

  t.mock.method(User, 'findOne', async (query) => {
    if (query?.userId === 'USR-PRIMARY-MASTER') return primaryMaster;
    if (query?.userId === 'USR-MALFORMED-MASTER') return malformedMaster;
    if (query?.userId === 'USR-ADMIN-KORA') return cafeAdminKora;
    return null;
  });

  t.mock.method(RolePermission, 'find', () => {
    return createQueryWrapper([
      { role: 'MASTER', permissionCode: 'MENU_READ', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'MASTER', permissionCode: 'MENU_WRITE', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'MASTER', permissionCode: 'MENU_PUBLISH', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'MASTER', permissionCode: 'MENU_ADMIN', effect: 'ALLOW', scope: 'ORGANISATION', isCurrentlyEffective: () => true },
      { role: 'CAFE_ADMIN', permissionCode: 'MENU_READ', effect: 'ALLOW', scope: 'ASSIGNED_CAFES', isCurrentlyEffective: () => true },
      { role: 'CAFE_ADMIN', permissionCode: 'MENU_WRITE', effect: 'ALLOW', scope: 'ASSIGNED_CAFES', isCurrentlyEffective: () => true },
    ]);
  });

  // Mock MenuItem
  t.mock.method(MenuItem, 'find', (query) => {
    let list = inMemoryItems;
    if (query?.conceptEligibility?.$in) {
      list = list.filter((i) => query.conceptEligibility.$in.includes(i.conceptEligibility));
    }
    if (query?.status) list = list.filter((i) => i.status === query.status);
    return createQueryWrapper(list);
  });
  t.mock.method(MenuItem, 'findOne', async (query) => {
    if (query?.menuItemId) return inMemoryItems.find((i) => i.menuItemId === query.menuItemId) || null;
    return null;
  });
  t.mock.method(MenuItem, 'countDocuments', async () => inMemoryItems.length);
  t.mock.method(MenuItem, 'create', async (doc) => {
    const item = { ...doc, priceHistory: doc.priceHistory || [], save: async function () { return this; } };
    inMemoryItems.push(item);
    return item;
  });

  // Mock Recipe
  t.mock.method(Recipe, 'find', () => createQueryWrapper(inMemoryRecipes));
  t.mock.method(Recipe, 'findOne', async (query) => inMemoryRecipes.find((r) => r.recipeId === query.recipeId) || null);
  t.mock.method(Recipe, 'countDocuments', async () => inMemoryRecipes.length);
  t.mock.method(Recipe, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryRecipes.push(item);
    return item;
  });

  // Mock ModifierGroup
  t.mock.method(ModifierGroup, 'find', () => createQueryWrapper(inMemoryModifierGroups));
  t.mock.method(ModifierGroup, 'findOne', async (query) => inMemoryModifierGroups.find((g) => g.modifierGroupId === query.modifierGroupId || g.modifiers?.some((m) => m.modifierId === query['modifiers.modifierId'])) || null);
  t.mock.method(ModifierGroup, 'countDocuments', async () => inMemoryModifierGroups.length);
  t.mock.method(ModifierGroup, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryModifierGroups.push(item);
    return item;
  });

  // Mock ComboDefinition
  t.mock.method(ComboDefinition, 'find', () => createQueryWrapper(inMemoryCombos));
  t.mock.method(ComboDefinition, 'countDocuments', async () => inMemoryCombos.length);
  t.mock.method(ComboDefinition, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryCombos.push(item);
    return item;
  });

  // Mock Menu & MenuSection
  t.mock.method(Menu, 'find', () => createQueryWrapper(inMemoryMenus));
  t.mock.method(Menu, 'countDocuments', async () => inMemoryMenus.length);
  t.mock.method(Menu, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryMenus.push(item);
    return item;
  });

  // Mock OutletOffering
  t.mock.method(OutletOffering, 'find', (query) => {
    let list = inMemoryOfferings;
    if (query?.outletId) list = list.filter((o) => o.outletId === query.outletId);
    if (query?.menuItemId) list = list.filter((o) => o.menuItemId === query.menuItemId);
    return createQueryWrapper(list);
  });
  t.mock.method(OutletOffering, 'findOne', async (query) => inMemoryOfferings.find((o) => o.outletId === query.outletId && o.menuItemId === query.menuItemId) || null);
  t.mock.method(OutletOffering, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryOfferings.push(item);
    return item;
  });

  // Mock ServiceModeBOM
  t.mock.method(ServiceModeBOM, 'findOne', async (query) => inMemoryBOMs.find((b) => b.menuItemId === query.menuItemId && b.serviceMode === query.serviceMode) || null);
  t.mock.method(ServiceModeBOM, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryBOMs.push(item);
    return item;
  });

  // Mock MenuChangeSet & MenuPublication
  t.mock.method(MenuChangeSet, 'find', () => createQueryWrapper(inMemoryChangeSets));
  t.mock.method(MenuChangeSet, 'findOne', async (query) => inMemoryChangeSets.find((c) => c.changeSetId === query.changeSetId) || null);
  t.mock.method(MenuChangeSet, 'countDocuments', async () => inMemoryChangeSets.length);
  t.mock.method(MenuChangeSet, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryChangeSets.push(item);
    return item;
  });

  t.mock.method(MenuPublication, 'find', () => createQueryWrapper(inMemoryPublications));
  t.mock.method(MenuPublication, 'findOne', async (query) => inMemoryPublications.find((p) => p.publicationId === query.publicationId) || null);
  t.mock.method(MenuPublication, 'countDocuments', async () => inMemoryPublications.length);
  t.mock.method(MenuPublication, 'create', async (doc) => {
    const item = { ...doc, save: async function () { return this; } };
    inMemoryPublications.push(item);
    return item;
  });

  // Mock GlobalInventoryItem
  t.mock.method(GlobalInventoryItem, 'findOne', async (query) => inMemoryInventory.find((i) => i.itemId === query.itemId) || null);

  // ── TEST CASES ──────────────────────────────────────────────────────────────

  await t.test('1. GET /api/v1/menu/overview returns operational KPIs and Needs Attention strip', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/menu/overview',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.kpis);
    assert.equal(res.body.kpis.activeItems, 2);
    assert.ok(Array.isArray(res.body.needsAttention));
  });

  await t.test('2. Multi-Concept Separation (Create Restaurant dish)', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/items',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Kerala Malabar Prawn Curry',
        conceptEligibility: 'RESTAURANT',
        category: 'MAIN_COURSE',
        courseType: 'MAIN',
        price: 480,
        dietaryTags: ['NON_VEG'],
        description: 'Coastal coconut curry with wild-caught prawns.',
      },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.item.conceptEligibility, 'RESTAURANT');
    assert.equal(res.body.item.price, 480);
    assert.equal(inMemoryItems.length, 3);
  });

  await t.test('3. Price Inheritance Precedence (Global Base vs Outlet Override)', async () => {
    // 1. Initial global price
    const globalPrice = await MenuService.getEffectiveItemPrice({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
    });
    assert.equal(globalPrice.effectivePriceRupees, 240);
    assert.equal(globalPrice.sourceExplanation, 'Global Base Price');

    // 2. Set Koramangala outlet override to ₹260
    await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/outlets/ZC-0001/offerings/MENU-01/price',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: { localPricePaisaOverride: 26000 },
    });

    const koraPrice = await MenuService.getEffectiveItemPrice({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      outletId: 'ZC-0001',
    });
    assert.equal(koraPrice.effectivePriceRupees, 260);
    assert.equal(koraPrice.sourceExplanation, 'Outlet Override (ZC-0001)');

    // 3. Reset override back to default
    await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/outlets/ZC-0001/offerings/MENU-01/price',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: { localPricePaisaOverride: null },
    });

    const resetPrice = await MenuService.getEffectiveItemPrice({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      outletId: 'ZC-0001',
    });
    assert.equal(resetPrice.effectivePriceRupees, 240);
  });

  let pourOverRecipeId = null;

  await t.test('4. Recipe Master formulation linked to Inventory Items with UOM conversion', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/recipes',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'V60 Pour-Over Formulation',
        batchYield: 1,
        yieldUom: 'PORTION',
        ingredients: [
          {
            inventoryItemId: 'INV-COFFEE-BEAN-001', // ₹1.20 / g
            ingredientName: 'Arabica Coffee Beans',
            quantity: 18,
            uom: 'G',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.recipe.recipeId);
    pourOverRecipeId = res.body.recipe.recipeId;

    // Verify Cost Roll-Up: 18g * ₹1.20 = ₹21.60 -> 2160 paisa
    const cost = await MenuService.calculateRecipeStandardCost({
      organisationId: 'ORG-ZAMORIN',
      recipeId: pourOverRecipeId,
    });
    assert.equal(cost.portionCostPaisa, 2160);
  });

  await t.test('5. Sub-Recipe nesting and DAG circular dependency rejection', async () => {
    // 1. Create Base Sauce Sub-Recipe
    const sauceRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/recipes',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'House Cardamom Syrup Sub-Recipe',
        isSubRecipe: true,
        batchYield: 10,
        yieldUom: 'PORTION',
        ingredients: [
          {
            inventoryItemId: 'INV-MILK-001',
            ingredientName: 'Milk',
            quantity: 1,
            uom: 'LITER', // ₹60 total / 10 portions = ₹6 / portion
          },
        ],
      },
    });

    assert.equal(sauceRes.statusCode, 201);
    const subRecipeId = sauceRes.body.recipe.recipeId;

    // 2. Create Main Recipe referencing Sub-Recipe
    const mainRes = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/recipes',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Cardamom Latte Main Recipe',
        batchYield: 1,
        ingredients: [
          {
            subRecipeId: subRecipeId,
            ingredientName: 'House Cardamom Syrup',
            quantity: 1,
            uom: 'PORTION',
          },
          {
            inventoryItemId: 'INV-COFFEE-BEAN-001',
            ingredientName: 'Coffee Beans',
            quantity: 18,
            uom: 'G',
          },
        ],
      },
    });

    assert.equal(mainRes.statusCode, 201);
    const mainRecipeId = mainRes.body.recipe.recipeId;

    // Verify Rolled-Up Cost: ₹6 (sub) + ₹21.60 (coffee) = ₹27.60 -> 2760 paisa
    const mainCost = await MenuService.calculateRecipeStandardCost({
      organisationId: 'ORG-ZAMORIN',
      recipeId: mainRecipeId,
    });
    assert.equal(mainCost.portionCostPaisa, 2760);

    // 3. Circular Dependency Test
    await assert.rejects(
      async () => {
        await MenuService.calculateRecipeStandardCost({
          organisationId: 'ORG-ZAMORIN',
          recipeId: mainRecipeId,
          visited: new Set([mainRecipeId]),
        });
      },
      /Circular sub-recipe dependency detected/
    );
  });

  let modGroupId = null;

  await t.test('6. Modifier Groups with Selection Bounds and Inventory Consumption Deltas', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/modifier-groups',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Espresso Shots & Milk',
        minSelections: 0,
        maxSelections: 2,
        isMultiSelect: true,
        modifiers: [
          {
            modifierId: 'MOD-EXTRA-SHOT',
            name: 'Extra Shot Espresso',
            pricePaisaDelta: 5000, // +₹50
            recipeDeltas: [
              {
                inventoryItemId: 'INV-COFFEE-BEAN-001',
                quantityDelta: 18,
                uom: 'G',
              },
            ],
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.modifierGroup.modifierGroupId);
    modGroupId = res.body.modifierGroup.modifierGroupId;
  });

  await t.test('7. Service-Mode Packaging BOM resolution for Takeaway sale', async () => {
    // Attach Takeaway Packaging to MENU-01
    await ServiceModeBOM.create({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      serviceMode: 'TAKEAWAY',
      packagingItems: [
        {
          inventoryItemId: 'INV-CUP-8OZ',
          itemName: '8oz Paper Cup',
          quantity: 1,
          uom: 'UNIT',
        },
      ],
    });

    // Link recipe to MENU-01
    inMemoryItems[0].primaryRecipeId = pourOverRecipeId;

    // Resolve POS sale with Extra Shot for Takeaway
    const deductions = await MenuService.resolveSaleInventoryBOM({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      modifierIds: ['MOD-EXTRA-SHOT'],
      serviceMode: 'TAKEAWAY',
    });

    // Expect: 18g (base) + 18g (modifier) = 36g coffee, plus 1 cup packaging
    const coffeeDeduction = deductions.find((d) => d.inventoryItemId === 'INV-COFFEE-BEAN-001');
    const cupDeduction = deductions.find((d) => d.inventoryItemId === 'INV-CUP-8OZ');

    assert.equal(coffeeDeduction.quantity, 36);
    assert.equal(cupDeduction.quantity, 1);
  });

  await t.test('8. Combos & Set Menus with Selectable Component Rules', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/combos',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Breakfast Estate Pair',
        pricingType: 'FIXED_PRICE',
        basePricePaisa: 38000, // ₹380
        groups: [
          {
            groupName: 'Beverage Choice',
            requiredCount: 1,
            choices: [
              { menuItemId: 'MENU-01', choiceName: 'V60 Pour-Over', surchargePaisa: 0, isDefault: true },
              { menuItemId: 'MENU-02', choiceName: 'Cortado', surchargePaisa: 2000 }, // +₹20
            ],
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.combo.comboId);
  });

  await t.test('9. Commercial Menus & Schedules Creation', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/menus',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'Restaurant Dinner Menu',
        concept: 'RESTAURANT',
        menuType: 'DINNER',
        schedule: { startTime: '18:00', endTime: '23:30' },
        outletIds: ['ZC-0001', 'ZC-0002'],
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.menu.menuId);
  });

  await t.test('10. Layered Availability Engine & Instant Sold-Out Toggle', async () => {
    // 1. Initially available
    const avail1 = await MenuService.getEffectiveAvailability({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      outletId: 'ZC-0001',
    });
    assert.equal(avail1.isAvailable, true);

    // 2. Mark sold out at Koramangala
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/outlets/ZC-0001/offerings/MENU-01/availability',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        isAvailable: false,
        reason: 'Bean roaster delay',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.offering.isAvailable, false);

    // 3. Verify Layered Availability blocked
    const avail2 = await MenuService.getEffectiveAvailability({
      organisationId: 'ORG-ZAMORIN',
      menuItemId: 'MENU-01',
      outletId: 'ZC-0001',
    });
    assert.equal(avail2.isAvailable, false);
    assert.equal(avail2.reason, 'Bean roaster delay');
  });

  let changeSetId = null;

  await t.test('11. Staged Change Sets creation and POS Publication', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/change-sets',
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {
        name: 'September Coffee Refresh',
        description: 'Publish V60 recipe updates and seasonal prices.',
        targetOutletIds: ['ZC-0001', 'ZC-0002'],
      },
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.changeSet.changeSetId);
    changeSetId = res.body.changeSet.changeSetId;

    // Publish to POS
    const pubRes = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/menu/change-sets/${changeSetId}/publish`,
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(pubRes.statusCode, 200);
    assert.equal(pubRes.body.publication.overallStatus, 'DEPLOYED');
  });

  await t.test('12. Snapshot Rollback by Primary Master', async () => {
    const pubId = inMemoryPublications[0].publicationId;

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/menu/publications/${pubId}/rollback`,
      headers: { Authorization: 'Bearer token_primary_master' },
      body: {},
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rollbackPublication.isRollback, true);
  });

  await t.test('13. Malformed MASTER is denied Rollback with 401/403 (Primary Only)', async () => {
    const pubId = inMemoryPublications[0]?.publicationId || 'PUB-TEST';

    const res = await makeRequest({
      port,
      method: 'POST',
      path: `/api/v1/menu/publications/${pubId}/rollback`,
      headers: { Authorization: 'Bearer token_malformed_master' },
      body: {},
    });

    assert.ok([401, 403].includes(res.statusCode));
  });

  await t.test('14. Café Admin cross-outlet modification is denied with 403', async () => {
    const res = await makeRequest({
      port,
      method: 'POST',
      path: '/api/v1/menu/outlets/ZC-0002/offerings/MENU-01/availability', // Indiranagar, user only has ZC-0001
      headers: { Authorization: 'Bearer token_kora_admin' },
      body: { isAvailable: false },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error?.code || res.body.code, 'OUTLET_ACCESS_DENIED');
  });

  await t.test('15. GET /api/v1/menu/simulator returns effective sellability and price', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/menu/simulator?outletId=ZC-0001&serviceMode=DINE_IN',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.simulatedItems));
  });

  await t.test('16. GET /api/v1/menu/integrity evaluates 32-point integrity check', async () => {
    const res = await makeRequest({
      port,
      method: 'GET',
      path: '/api/v1/menu/integrity',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.checksEvaluated, 32);
    assert.ok(res.body.status);
  });

  await t.test('17. Safe lifecycle retirement replaces destructive item deletion', async () => {
    const res = await makeRequest({
      port,
      method: 'DELETE',
      path: '/api/v1/menu/items/MENU-02',
      headers: { Authorization: 'Bearer token_primary_master' },
    });

    assert.equal(res.statusCode, 200);
    const retired = inMemoryItems.find((i) => i.menuItemId === 'MENU-02');
    assert.equal(retired.status, 'RETIRED');
  });
});
