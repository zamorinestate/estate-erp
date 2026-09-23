'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 12: MENU PRICING INTELLIGENCE TEST SUITE
 * ============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MenuItemModule = require('../src/models/MenuItem');
const MenuItem = MenuItemModule.MenuItem || MenuItemModule;
const RecipeModule = require('../src/models/Recipe');
const Recipe = RecipeModule.Recipe || RecipeModule;
const MenuPriceProposalModule = require('../src/models/MenuPriceProposal');
const MenuPriceProposal = MenuPriceProposalModule.MenuPriceProposal || MenuPriceProposalModule;
const CafeModule = require('../src/models/Cafe');
const Cafe = CafeModule.Cafe || CafeModule;
const ownerMenuPricingService = require('../src/services/ownerMenuPricingService');

describe('STAGE 12 — Menu Engineering & Pricing Intelligence Suite', () => {
  const TEST_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const FOREIGN_ORG = new mongoose.Types.ObjectId().toString().toUpperCase();
  const TEST_CAFE = new mongoose.Types.ObjectId();

  const USER_OWNER = { userId: 'USR-OWNER-12', email: 'owner12@zamorin.com', role: 'OWNER' };

  let completeMenuItemId;
  let incompleteMenuItemId;

  before(async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/zamorin_erp_test';
        await mongoose.connect(uri);
      }

    await MenuItem.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString(), TEST_ORG, FOREIGN_ORG] } });
    await Recipe.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString(), TEST_ORG, FOREIGN_ORG] } });
    await MenuPriceProposal.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString(), TEST_ORG, FOREIGN_ORG] } });
    await Cafe.deleteMany({ organisationId: { $in: [TEST_ORG.toString(), FOREIGN_ORG.toString(), TEST_ORG, FOREIGN_ORG] } });

    const rand = Math.floor(Math.random() * 8999 + 1000);
    // Seed 1 test cafe
    await Cafe.create({
      _id: TEST_CAFE,
      organisationId: TEST_ORG.toString(),
      cafeId: `ZC-CAF-${rand}1`,
      name: 'Zamorin Flagship Calicut',
      displayName: 'Zamorin Calicut Flagship',
      cafeType: 'STANDARD_CAFE',
      fssaiLicenceType: 'STATE_LICENCE',
      status: 'ACTIVE',
      createdBy: 'SYSTEM'
    });

    // 1. Menu item with complete recipe
    const completeItem = await MenuItem.create({
      organisationId: TEST_ORG.toString(),
      menuItemId: `MENU-${rand}1`,
      name: 'Artisanal Chemex Filter Coffee',
      nameLower: 'artisanal chemex filter coffee',
      plu: 'PLU-CHM-01',
      category: 'COFFEE',
      currentPricePaisa: 21000, // ₹210
      pricing: { basePricePaisa: 21000 },
      sellingPrice: 210,
      taxRatePercent: 5,
      nutritionalInfo: { calories: 15 },
      allergens: [],
      isVegetarian: true,
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE'
    });
    completeMenuItemId = completeItem._id;

    await Recipe.create({
      organisationId: TEST_ORG.toString(),
      recipeId: `RCP-${rand}1`,
      name: 'Artisanal Chemex Filter Coffee',
      recipeCode: 'PLU-CHM-01',
      createdByUserId: 'USR-OWNER-12',
      ingredients: [
        { ingredientName: 'Single Origin Roasted Beans', quantity: 0.02, uom: 'KG', costPerUnit: 2000 }, // ₹40.00
        { ingredientName: 'Filter Paper', quantity: 1, uom: 'PCS', costPerUnit: 5 } // ₹5.00
      ],
      status: 'APPROVED'
    });

    // 2. Menu item with incomplete recipe (missing purchase cost)
    const incompleteItem = await MenuItem.create({
      organisationId: TEST_ORG.toString(),
      menuItemId: `MENU-${rand}2`,
      name: 'Chef Special Saffron Halwa',
      nameLower: 'chef special saffron halwa',
      plu: 'PLU-HLW-99',
      category: 'DESSERTS',
      currentPricePaisa: 28000,
      pricing: { basePricePaisa: 28000 },
      sellingPrice: 280,
      taxRatePercent: 5,
      createdByUserId: 'SYSTEM',
      status: 'ACTIVE'
    });
    incompleteMenuItemId = incompleteItem._id;

    await Recipe.create({
      organisationId: TEST_ORG.toString(),
      recipeId: `RCP-${rand}2`,
      name: 'Chef Special Saffron Halwa',
      recipeCode: 'PLU-HLW-99',
      createdByUserId: 'USR-OWNER-12',
      ingredients: [
        { ingredientName: 'Kashmiri Mogra Saffron', quantity: 0.001, uom: 'KG' } // missing cost
      ],
      status: 'DRAFT'
    });
    } catch (err) {
      console.error('STAGE 12 BEFORE ERROR:', err);
      throw err;
    }
  });

  test('1. Item Economics with Complete Recipe: Calculates accurate recipe cost & contribution', async () => {
    const econ = await ownerMenuPricingService.getItemEconomics(TEST_ORG, completeMenuItemId);
    assert.equal(econ.isCostAvailable, true);
    assert.equal(econ.recipeCost, 45); // ₹40 + ₹5
    assert.ok(econ.contributionAmount > 0);
    assert.equal(econ.dataQualityState, 'HEALTHY');
    assert.ok(econ.costFormulaLineage.includes('Recipe Cost (₹45)'));
  });

  test('2. Incomplete Recipe Data: Returns COST_UNAVAILABLE and suppresses fabricated numbers', async () => {
    const econ = await ownerMenuPricingService.getItemEconomics(TEST_ORG, incompleteMenuItemId);
    assert.equal(econ.isCostAvailable, false);
    assert.equal(econ.recipeCost, 'COST_UNAVAILABLE / INCOMPLETE_MASTER_DATA');
    assert.equal(econ.contributionAmount, null);
    assert.equal(econ.dataQualityState, 'INCOMPLETE_MASTER_DATA');
  });

  test('3. Menu Engineering Matrix: Classifies items with explicit thresholds', async () => {
    const matrix = await ownerMenuPricingService.getMenuEngineeringMatrix(TEST_ORG);
    assert.ok(matrix.items.length >= 2);
    assert.ok(matrix.averageUnitsSoldThreshold >= 0);
    assert.ok(matrix.averageContributionThreshold >= 0);

    const completeEvaluated = matrix.items.find(i => i.menuItemId.toString() === completeMenuItemId.toString());
    assert.ok(['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'].includes(completeEvaluated.quadrant));

    const incompleteEvaluated = matrix.items.find(i => i.menuItemId.toString() === incompleteMenuItemId.toString());
    assert.equal(incompleteEvaluated.quadrant, 'UNCLASSIFIED_INCOMPLETE_DATA');
  });

  test('4. Price Simulation: NEVER mutates live POS prices, taxes, or historical sales', async () => {
    const preSimItem = await MenuItem.findById(completeMenuItemId).lean();
    const originalPrice = preSimItem.sellingPrice;

    const simResult = await ownerMenuPricingService.simulatePriceScenario(TEST_ORG, {
      menuItemId: completeMenuItemId,
      currentPrice: 210,
      proposedPrice: 240,
      expectedVolumeChangePercent: -5,
      currentRecipeCost: 45,
      currentUnitsSold: 100
    });

    assert.ok(simResult.simulationNotice.includes('NO MUTATION OF POS'));
    assert.equal(simResult.priceDelta, 30);
    assert.ok(simResult.projectedRevenue > 0);

    // Verify MenuItem in database was NOT altered
    const postSimItem = await MenuItem.findById(completeMenuItemId).lean();
    assert.equal(postSimItem.sellingPrice, originalPrice);
    assert.equal(postSimItem.pricing.basePricePaisa, 21000);
  });

  test('5. Governed Price Proposals: DRAFT -> REVIEW -> APPROVED -> EFFECTIVE lifecycle', async () => {
    const proposal = await ownerMenuPricingService.createPriceProposal(TEST_ORG, {
      menuItemId: completeMenuItemId,
      proposedPrice: 225,
      effectiveFrom: new Date(Date.now() + 86400000),
      rationale: 'Coffee bean import duty increase'
    }, USER_OWNER);

    assert.equal(proposal.status, 'DRAFT');

    // Invalid transition: DRAFT to EFFECTIVE directly must fail
    await assert.rejects(
      async () => {
        await ownerMenuPricingService.transitionPriceProposal(TEST_ORG, proposal.proposalId, 'EFFECTIVE', USER_OWNER);
      },
      (err) => err.message.includes('ILLEGAL_PROPOSAL_TRANSITION')
    );

    // Valid lifecycle
    const inReview = await ownerMenuPricingService.transitionPriceProposal(TEST_ORG, proposal.proposalId, 'REVIEW', USER_OWNER);
    assert.equal(inReview.status, 'REVIEW');

    const approved = await ownerMenuPricingService.transitionPriceProposal(TEST_ORG, proposal.proposalId, 'APPROVED', USER_OWNER);
    assert.equal(approved.status, 'APPROVED');
    assert.ok(approved.approvedAt);

    const effective = await ownerMenuPricingService.transitionPriceProposal(TEST_ORG, proposal.proposalId, 'EFFECTIVE', USER_OWNER);
    assert.equal(effective.status, 'EFFECTIVE');

    // Upon becoming EFFECTIVE, MenuItem price is updated cleanly
    const updatedMenuItem = await MenuItem.findById(completeMenuItemId).lean();
    assert.equal(updatedMenuItem.sellingPrice, 225);
  });

  test('6. FSSAI 2020 Menu Labelling Engine: Threshold and exemption evaluation', async () => {
    // 1 cafe with STATE licence -> NOT mandatory
    const eval1 = await ownerMenuPricingService.evaluateMenuLabellingApplicability(TEST_ORG, TEST_CAFE);
    assert.equal(eval1.isMandatoryMenuLabellingApplicable, false);
    assert.ok(eval1.applicabilityRationale.includes('< 10'));

    const baseCafeNum = Math.floor(Math.random() * 800000 + 100000);
    for (let i = 2; i <= 10; i++) {
      await Cafe.create({
        organisationId: TEST_ORG.toString(),
        cafeId: `ZC-CAF-${baseCafeNum + i}`,
        name: `Zamorin Outlet ${i}`,
        displayName: `Zamorin Outlet ${i}`,
        cafeType: 'STANDARD_CAFE',
        fssaiLicenceType: 'STATE_LICENCE',
        status: 'ACTIVE',
        createdBy: 'SYSTEM'
      });
    }

    const eval2 = await ownerMenuPricingService.evaluateMenuLabellingApplicability(TEST_ORG, TEST_CAFE);
    assert.equal(eval2.isMandatoryMenuLabellingApplicable, true);
    assert.equal(eval2.displayRequirements.calorificValuePerServing, true);

    // Independent branch: Single outlet with CENTRAL FSSAI licence -> Mandatory regardless of outlet count
    const centralCafe = await Cafe.create({
      organisationId: TEST_ORG.toString(),
      cafeId: `ZC-CAF-${baseCafeNum + 99}`,
      name: 'Zamorin Flagship Hub',
      displayName: 'Zamorin Flagship Hub',
      cafeType: 'STANDARD_CAFE',
      fssaiLicenceType: 'CENTRAL_LICENCE',
      status: 'ACTIVE',
      createdBy: 'SYSTEM'
    });
    const evalCentral = await ownerMenuPricingService.evaluateMenuLabellingApplicability(TEST_ORG, centralCafe._id, { fssaiLicenceType: 'CENTRAL_LICENCE' });
    assert.equal(evalCentral.isMandatoryMenuLabellingApplicable, true);
    assert.ok(evalCentral.applicabilityRationale.includes('Central FSSAI Licence'));
  });

  test('7. Nutritional & Allergen Display: Zero fabricated calories/allergens', async () => {
    // Verified item with calories
    const displayComplete = await ownerMenuPricingService.getItemLabellingDisplay(TEST_ORG, completeMenuItemId);
    assert.equal(displayComplete.calorificValueKcal, 15);
    assert.ok(displayComplete.adultCalorieDisclaimer.includes('2,000 kcal'));

    // Incomplete item without calories
    const displayIncomplete = await ownerMenuPricingService.getItemLabellingDisplay(TEST_ORG, incompleteMenuItemId);
    assert.equal(displayIncomplete.calorificValueKcal, 'UNAVAILABLE / REQUIRES VERIFIED NUTRITION DATA');
    assert.deepEqual(displayIncomplete.allergens, ['UNAVAILABLE / REQUIRES VERIFIED ALLERGEN AUDIT']);
  });

  test('8. Multi-Tenant IDOR: Foreign organization denied access to menu intelligence', async () => {
    await assert.rejects(
      async () => {
        await ownerMenuPricingService.getItemEconomics(FOREIGN_ORG, completeMenuItemId);
      },
      (err) => err.message.includes('MENU_ITEM_NOT_FOUND')
    );
  });

  after(async () => {
    await mongoose.disconnect();
  });
});
