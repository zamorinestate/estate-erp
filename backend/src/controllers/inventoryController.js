'use strict';

const { GlobalInventoryItem } = require('../models/GlobalInventoryItem');
const { CafeInventoryConfig } = require('../models/CafeInventoryConfig');
const { StockMovement } = require('../models/StockMovement');
const { InventoryLot } = require('../models/InventoryLot');
const { StockTransfer } = require('../models/StockTransfer');
const { InventoryCycleCount } = require('../models/InventoryCycleCount');
const { IncomingInspection } = require('../models/IncomingInspection');
const { RecallNotice } = require('../models/RecallNotice');
const { WastageRecord } = require('../models/WastageRecord');
const { Cafe } = require('../models/Cafe');
const { SequenceCounter } = require('../models/SequenceCounter');
const { FefoService } = require('../services/fefoService');
const { InventoryLotService } = require('../services/inventoryLotService');
const RecallTraceService = require('../services/recallTraceService');
const { ApiError } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');
const { generateSecureString } = require('../utils/secureRandom');

const { resolveEffectiveCafeScope, assertResourceCafeOwnership, buildEffectiveCafeFilter } = require('../utils/cafeScope');

function assertCafeAccess(request, cafeId) {
  if (!cafeId) return;
  const isCafeOps = request?.auth?.workspaceMode === 'CAFE_OPERATIONS' ||
    request?.headers?.['x-workspace-mode'] === 'CAFE_OPERATIONS' ||
    request?.headers?.['x-workspace'] === 'CAFE_OPERATIONS' ||
    (request?.auth?.deviceContext?.deviceClass === 'CAFE_OWNED' && !!request?.auth?.deviceContext?.boundCafeId);
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (isCafeOps && effectiveCafe && effectiveCafe !== cafeId.trim().toUpperCase()) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      `Cross-café access is denied. You are not authorized for café ${cafeId}.`
    );
  }
  const role = request?.auth?.role;
  if (role === 'MASTER' || role === 'OWNER') return;
  if (effectiveCafe && effectiveCafe !== cafeId.trim().toUpperCase()) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      `You are not authorised to access or modify inventory for café ${cafeId}.`
    );
  }
}

// 1. Overview Command Centre & Multi-Café Heatmap
const getInventoryOverview = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const effectiveCafe = resolveEffectiveCafeScope(request);
  const requestedCafe = request.query.cafeId;

  if (requestedCafe) assertCafeAccess(request, requestedCafe);

  const activeScopeCafe = effectiveCafe || (requestedCafe && requestedCafe !== 'ALL' ? requestedCafe.trim().toUpperCase() : null);

  const filter = { organisationId };
  if (activeScopeCafe) filter.cafeId = activeScopeCafe;

  const configs = await CafeInventoryConfig.find(filter).lean();
  const items = await GlobalInventoryItem.find({ organisationId, status: 'ACTIVE' }).lean();
  const itemMap = new Map(items.map((i) => [i.itemId, i]));

  let totalValuationPaisa = 0;
  let criticalCount = 0;
  let lowStockCount = 0;
  let inTransitTotal = 0;

  configs.forEach((c) => {
    const itm = itemMap.get(c.itemId);
    const unitCost = itm?.unitCostPaisa || 0;
    totalValuationPaisa += c.currentQuantityBase * unitCost;

    if (c.currentQuantityBase <= (c.minQuantityBase || c.reorderLevelBase || 0) && c.minQuantityBase > 0) {
      if (c.currentQuantityBase === 0) criticalCount++;
      else lowStockCount++;
    }
    inTransitTotal += (c.inTransitQuantityBase || 0);
  });

  const transferFilter = { organisationId, status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT'] } };
  if (effectiveCafe) {
    transferFilter.$or = [{ fromCafeId: effectiveCafe }, { toCafeId: effectiveCafe }];
  }
  const transfers = await StockTransfer.find(transferFilter).lean();
  const recalls = await RecallNotice.find({ organisationId, status: 'ACTIVE' }).lean();

  const countFilter = { organisationId, status: { $in: ['SUBMITTED', 'RECOUNT_REQUIRED'] } };
  if (effectiveCafe) {
    countFilter.cafeId = effectiveCafe;
  }
  const countsPending = await InventoryCycleCount.find(countFilter).lean();

  // Multi-café stock matrix heatmap (scoped strictly to effective café for CAFE_ADMIN)
  const cafes = await Cafe.find({ organisationId, status: 'ACTIVE' }).lean();
  const allCafes = cafes;
  const activeCafes = effectiveCafe ? allCafes.filter((c) => c.cafeId === effectiveCafe) : allCafes;

  const heatmap = items.slice(0, 10).map((itm) => {
    const cafeBreakdown = activeCafes.map((cf) => {
      const cfg = configs.find((c) => c.itemId === itm.itemId && c.cafeId === cf.cafeId);
      return {
        cafeId: cf.cafeId,
        cafeName: cf.name,
        onHand: cfg?.currentQuantityBase || 0,
        available: cfg?.availableQuantityBase || 0,
        min: cfg?.minQuantityBase || 0,
        status: (cfg?.currentQuantityBase || 0) <= (cfg?.minQuantityBase || 0) ? 'LOW' : 'HEALTHY',
      };
    });

    return {
      itemId: itm.itemId,
      sku: itm.sku,
      name: itm.name,
      baseUnit: itm.baseUnit,
      cafes: cafeBreakdown,
    };
  });

  return response.status(200).json({
    kpis: {
      totalActiveSkus: items.length,
      totalValuationPaisa,
      criticalStockCount: criticalCount,
      lowStockCount,
      inTransitQuantity: inTransitTotal,
      activeTransfersCount: transfers.length,
      activeRecallsCount: recalls.length,
      pendingCountsApproval: countsPending.length,
    },
    heatmap,
  });
});

// 2. Global Item Master
const listGlobalItems = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { category, search, status } = request.query;

  const filter = { organisationId };
  if (category && category !== 'ALL') filter.category = category;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
    ];
  }

  const items = await GlobalInventoryItem.find(filter).sort({ name: 1 }).lean();
  return response.status(200).json({ items });
});

const getItem = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { itemId } = request.params;

  const item = await GlobalInventoryItem.findOne({ organisationId, itemId }).lean();
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', `Global inventory item ${itemId} not found.`);
  }

  const cafeConfigs = await CafeInventoryConfig.find({ organisationId, itemId }).lean();
  const lots = await InventoryLot.find({ organisationId, itemId, status: { $ne: 'DEPLETED' } }).lean();
  const recentMovements = await StockMovement.find({ organisationId, itemId }).sort({ performedAt: -1 }).limit(20).lean();

  return response.status(200).json({
    item,
    cafeConfigs,
    lots,
    recentMovements,
  });
});

const createGlobalItem = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    sku,
    name,
    shortName,
    description,
    category,
    baseUnit,
    stockUnit,
    purchaseUnit,
    packSize = 1,
    barcode,
    criticality = 'STANDARD',
    trackingMethod = 'FEFO',
    lotControl = true,
    expiryControl = true,
    shelfLifeDays = 30,
    minShelfLifeOnReceiptDays = 7,
    unitCost = 0,
  } = request.body;

  const effectiveName = (name || request.body.itemName || '').trim();
  const rawCat = (category || request.body.itemCategory || 'OTHER').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const CATEGORY_MAP = {
    RAW_MATERIAL: 'OTHER_CONTROLLED_MATERIALS',
    RAW_MATERIALS: 'OTHER_CONTROLLED_MATERIALS',
    COFFEE: 'COFFEE_BEANS',
    BEANS: 'COFFEE_BEANS',
    DAIRY: 'DAIRY_FRESH',
    MILK: 'DAIRY_FRESH',
    SYRUP: 'SYRUPS_FLAVOURS',
    SYRUPS: 'SYRUPS_FLAVOURS',
    FLAVOURS: 'SYRUPS_FLAVOURS',
    BAKERY: 'BAKERY_FOOD_INPUTS',
    FOOD_INPUTS: 'BAKERY_FOOD_INPUTS',
    SUPPLIES: 'CLEANING_SUPPLIES',
    CONSUMABLES: 'PACKAGING_CONSUMABLES',
  };
  const mappedCat = CATEGORY_MAP[rawCat] || rawCat;
  const validCategories = new Set([
    'COFFEE_BEANS', 'DAIRY_FRESH', 'SYRUPS_FLAVOURS', 'PACKAGING_CONSUMABLES',
    'BAKERY_FOOD_INPUTS', 'CLEANING_SUPPLIES', 'OTHER_CONTROLLED_MATERIALS',
    'BEVERAGE', 'FOOD', 'PACKAGING', 'CLEANING', 'EQUIPMENT', 'STATIONERY',
    'PERISHABLE', 'NON_PERISHABLE', 'OTHER'
  ]);
  const effectiveCategory = validCategories.has(mappedCat) ? mappedCat : 'OTHER';
  const effectiveBaseUnit = (baseUnit || request.body.unit || request.body.uom || 'kg').trim();

  if (!effectiveName) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Item name is required.');
  }

  const sequenceAvailable = Boolean(
    SequenceCounter.db?.readyState === 1 ||
    SequenceCounter.generateId?.mock ||
    typeof SequenceCounter.generateId?.restore === 'function'
  );

  const itemId = sequenceAvailable
    ? await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'ITEM',
        prefix: 'ITEM',
        minimumDigits: 4,
      })
    : `ITEM-${generateSecureString(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`;

  let cleanSku = (sku || request.body.itemSku || '').trim().toUpperCase();
  if (!cleanSku) {
    const prefix = effectiveCategory.slice(0, 3).toUpperCase() || 'SKU';
    const itemSuffix = itemId.replace(/^ITEM-/, '');
    cleanSku = `${prefix}-${itemSuffix}`;
  }

  const existing = await GlobalInventoryItem.findOne({ organisationId, sku: cleanSku });
  if (existing) {
    throw new ApiError(409, 'DUPLICATE_SKU', `An inventory item with SKU ${cleanSku} already exists.`);
  }

  const item = await GlobalInventoryItem.create({
    organisationId,
    itemId,
    sku: cleanSku,
    name: effectiveName,
    shortName: shortName?.trim() || '',
    description: description?.trim() || '',
    category: effectiveCategory,
    baseUnit: effectiveBaseUnit.toLowerCase(),
    stockUnit: stockUnit?.trim().toLowerCase() || effectiveBaseUnit.toLowerCase(),
    purchaseUnit: purchaseUnit?.trim().toLowerCase() || effectiveBaseUnit.toLowerCase(),
    packSize: Number(packSize) || 1,
    barcode: barcode?.trim() || null,
    criticality,
    trackingMethod,
    lotControl: Boolean(lotControl),
    expiryControl: Boolean(expiryControl),
    shelfLifeDays: Number(shelfLifeDays) || 30,
    minShelfLifeOnReceiptDays: Number(minShelfLifeOnReceiptDays) || 7,
    unitCostPaisa: Math.round(Number(unitCost || 0) * 100),
    status: 'ACTIVE',
    createdByUserId: userId,
  });

  // Stage 007 Non-Negotiable: Auto-provision item to all active cafés at 0 quantity
  const cafes = await Cafe.find({ organisationId, status: 'ACTIVE' }).lean();
  const targetCafes = cafes;

  const configDocs = targetCafes.map((c) => ({
    organisationId,
    cafeId: c.cafeId,
    itemId,
    currentQuantityBase: 0,
    availableQuantityBase: 0,
    reservedQuantityBase: 0,
    quarantinedQuantityBase: 0,
    expiredQuantityBase: 0,
    inTransitQuantityBase: 0,
    incomingQuantityBase: 0,
    minQuantityBase: 10,
    parQuantityBase: 25,
    maxQuantityBase: 50,
    safetyStockBase: 5,
    stockedHere: true,
    replenishmentEnabled: true,
    primaryLocation: 'Main Store',
    storageLocations: ['Main Store', 'Bar Counter'],
    status: 'ACTIVE',
  }));

  try {
    if (configDocs.length > 0) {
      await CafeInventoryConfig.insertMany(configDocs, { ordered: true });
    }
  } catch (error) {
    // Production compensation: never return success with a partially
    // provisioned global inventory item. Remove any partial café rows and the
    // parent item before surfacing the original provisioning failure.
    if (GlobalInventoryItem.db?.readyState === 1) {
      const cleanup = await Promise.allSettled([
        CafeInventoryConfig.deleteMany({ organisationId, itemId }),
        GlobalInventoryItem.deleteOne({ organisationId, itemId }),
      ]);
      if (cleanup.some((result) => result.status === 'rejected')) {
        throw new ApiError(
          503,
          'INVENTORY_PROVISIONING_COMPENSATION_FAILED',
          'Inventory item provisioning failed and rollback could not be fully confirmed.'
        );
      }
    }
    throw error;
  }

  return response.status(201).json({
    message: `Global inventory item ${cleanSku} created and provisioned to all active cafés.`,
    item,
    provisionedCafeCount: configDocs.length,
  });
});

const updateGlobalItem = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { itemId } = request.params;
  const { name, shortName, description, category, criticality, trackingMethod, unitCost } = request.body;

  const item = await GlobalInventoryItem.findOne({ organisationId, itemId });
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', `Inventory item ${itemId} not found.`);
  }

  if (name) item.name = name.trim();
  if (shortName !== undefined) item.shortName = shortName.trim();
  if (description !== undefined) item.description = description.trim();
  if (category) item.category = category;
  if (criticality) item.criticality = criticality;
  if (trackingMethod) item.trackingMethod = trackingMethod;
  if (unitCost !== undefined) item.unitCostPaisa = Math.round(Number(unitCost) * 100);
  item.updatedByUserId = userId;

  await item.save();

  return response.status(200).json({
    message: `Global inventory item ${item.sku} updated. Changes propagated across all cafés.`,
    item,
  });
});

const archiveItem = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { itemId } = request.params;

  const item = await GlobalInventoryItem.findOne({ organisationId, itemId });
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', `Item ${itemId} not found.`);
  }

  item.status = 'DISCONTINUED';
  item.updatedByUserId = userId;
  await item.save();

  return response.status(200).json({ message: `Item ${item.sku} marked discontinued.`, item });
});

// 3. Café Stock Management
const listCafeStock = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId } = request.params;
  const { category, lowStockOnly } = request.query;

  assertCafeAccess(request, cafeId);

  const configs = await CafeInventoryConfig.find({ organisationId, cafeId: cafeId.trim().toUpperCase() }).lean();
  const itemIds = configs.map((c) => c.itemId);

  const itemFilter = { organisationId, itemId: { $in: itemIds } };
  if (category && category !== 'ALL') itemFilter.category = category;

  const items = await GlobalInventoryItem.find(itemFilter).lean();
  const itemMap = new Map(items.map((i) => [i.itemId, i]));

  const stockList = configs
    .map((cfg) => {
      const itm = itemMap.get(cfg.itemId);
      if (!itm) return null;

      const isLow = cfg.currentQuantityBase <= (cfg.minQuantityBase || cfg.reorderLevelBase || 0);
      if (lowStockOnly === 'true' && !isLow) return null;

      return {
        itemId: cfg.itemId,
        cafeId: cfg.cafeId,
        sku: itm.sku,
        name: itm.name,
        category: itm.category,
        baseUnit: itm.baseUnit,
        currentStock: cfg.currentQuantityBase,
        availableStock: cfg.availableQuantityBase,
        reservedStock: cfg.reservedQuantityBase,
        quarantinedStock: cfg.quarantinedQuantityBase,
        inTransitStock: cfg.inTransitQuantityBase,
        reorderLevel: cfg.minQuantityBase || cfg.reorderLevelBase,
        parLevel: cfg.parQuantityBase,
        maxLevel: cfg.maxQuantityBase,
        unitCost: (itm.unitCostPaisa || 0) / 100,
        status: isLow ? 'LOW' : 'IN_STOCK',
        stockedHere: cfg.stockedHere,
        primaryLocation: cfg.primaryLocation,
      };
    })
    .filter(Boolean);

  return response.status(200).json({ stock: stockList });
});

const getCafeStockItem = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId } = request.params;

  assertCafeAccess(request, cafeId);

  const config = await CafeInventoryConfig.findOne({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    itemId: itemId.trim().toUpperCase(),
  }).lean();

  if (!config) {
    throw new ApiError(404, 'STOCK_CONFIG_NOT_FOUND', `Stock config for item ${itemId} at cafe ${cafeId} not found.`);
  }

  const item = await GlobalInventoryItem.findOne({ organisationId, itemId }).lean();
  const lots = await InventoryLot.find({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    itemId: itemId.trim().toUpperCase(),
    status: { $ne: 'DEPLETED' },
  }).sort({ expiryDate: 1 }).lean();

  return response.status(200).json({ config, item, lots });
});

const configureCafeStock = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId } = request.params;
  const { minQuantity, parQuantity, maxQuantity, safetyStock, primaryLocation, stockedHere, replenishmentEnabled } = request.body;

  assertCafeAccess(request, cafeId);

  const config = await CafeInventoryConfig.findOne({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    itemId: itemId.trim().toUpperCase(),
  });

  if (!config) {
    throw new ApiError(404, 'STOCK_CONFIG_NOT_FOUND', 'Stock config not found.');
  }

  if (minQuantity !== undefined) config.minQuantityBase = Number(minQuantity);
  if (parQuantity !== undefined) config.parQuantityBase = Number(parQuantity);
  if (maxQuantity !== undefined) config.maxQuantityBase = Number(maxQuantity);
  if (safetyStock !== undefined) config.safetyStockBase = Number(safetyStock);
  if (primaryLocation) config.primaryLocation = primaryLocation.trim();
  if (stockedHere !== undefined) config.stockedHere = Boolean(stockedHere);
  if (replenishmentEnabled !== undefined) config.replenishmentEnabled = Boolean(replenishmentEnabled);

  await config.save();

  return response.status(200).json({ message: 'Café stocking profile updated.', config });
});

// 4. Stock Movement Ledger & Atomic Balance Mutations
const recordMovement = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, itemId, movementType, quantity, reason, storageLocation = 'Main Store', lotId = null, referenceType = null, referenceId = null } = request.body;

  if (!cafeId || !itemId || !movementType || quantity === undefined) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, item, movement type, and quantity are required.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();
  const numQty = Number(quantity);

  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanCafe, itemId: cleanItem });
  if (!config) {
    throw new ApiError(404, 'STOCK_CONFIG_NOT_FOUND', `Item ${cleanItem} is not provisioned for café ${cleanCafe}.`);
  }

  const balanceBefore = config.currentQuantityBase;
  const balanceAfter = balanceBefore + numQty;

  if (balanceAfter < 0) {
    throw new ApiError(400, 'NEGATIVE_STOCK_PREVENTED', `Transaction would cause negative stock balance (${balanceAfter}). Physical inventory cannot drop below zero.`);
  }

  config.currentQuantityBase = balanceAfter;
  config.availableQuantityBase = Math.max(0, balanceAfter - (config.reservedQuantityBase || 0) - (config.quarantinedQuantityBase || 0) - (config.expiredQuantityBase || 0));
  config.lastMovementAt = new Date();
  await config.save();

  const count = await StockMovement.countDocuments({ organisationId });
  const movementId = `MVT-${Date.now().toString().slice(-6)}-${String(count + 1).padStart(4, '0')}`;

  const movement = await StockMovement.create({
    organisationId,
    movementId,
    cafeId: cleanCafe,
    itemId: cleanItem,
    movementType,
    quantityBase: numQty,
    balanceBeforeBase: balanceBefore,
    balanceAfterBase: balanceAfter,
    lotId,
    storageLocation,
    reason: reason || '',
    referenceType,
    referenceId,
    performedByUserId: userId,
    performedAt: new Date(),
  });

  return response.status(201).json({
    message: 'Stock movement recorded.',
    movement,
    currentStock: config.currentQuantityBase,
    availableStock: config.availableQuantityBase,
  });
});

const listMovements = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId, movementType } = request.query;

  if (cafeId) assertCafeAccess(request, cafeId);

  const filter = { organisationId };
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();
  if (itemId) filter.itemId = itemId.trim().toUpperCase();
  if (movementType) filter.movementType = movementType;

  const movements = await StockMovement.find(filter).sort({ performedAt: -1 }).limit(100).lean();
  return response.status(200).json({ movements });
});

// 5. Receiving & Put-Away
const receiveStock = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, itemId, quantity, supplierLot, expiryDate, mfgDate, storageLocation = 'Main Store', poReferenceId = null } = request.body;

  if (!cafeId || !itemId || !quantity || !expiryDate) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, item, quantity, and expiry date are required for receipt.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();
  const qty = Number(quantity);

  const item = await GlobalInventoryItem.findOne({ organisationId, itemId: cleanItem });
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found.');
  }

  // Create Lot
  const lotCount = await InventoryLot.countDocuments({ organisationId });
  const lotId = `LOT-${Date.now().toString().slice(-4)}-${String(lotCount + 1).padStart(4, '0')}`;

  const lot = await InventoryLot.create({
    organisationId,
    lotId,
    supplierLot: supplierLot?.trim() || '',
    itemId: cleanItem,
    cafeId: cleanCafe,
    storageLocation,
    mfgDate: mfgDate || null,
    expiryDate,
    quantityBase: qty,
    status: 'AVAILABLE',
  });

  // Record Stock Movement
  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanCafe, itemId: cleanItem });
  const balanceBefore = config ? config.currentQuantityBase : 0;
  const balanceAfter = balanceBefore + qty;

  if (config) {
    config.currentQuantityBase = balanceAfter;
    config.availableQuantityBase = balanceAfter - (config.reservedQuantityBase || 0);
    config.lastMovementAt = new Date();
    await config.save();
  }

  const movement = await StockMovement.create({
    organisationId,
    movementId: `MVT-REC-${Date.now().toString().slice(-6)}`,
    cafeId: cleanCafe,
    itemId: cleanItem,
    movementType: 'PROCUREMENT_RECEIPT',
    quantityBase: qty,
    balanceBeforeBase: balanceBefore,
    balanceAfterBase: balanceAfter,
    lotId,
    storageLocation,
    reason: `Goods receipt for lot ${lotId}`,
    referenceType: 'PO',
    referenceId: poReferenceId,
    performedByUserId: userId,
  });

  return response.status(201).json({
    message: `Received ${qty} ${item.baseUnit} of ${item.name} at ${cleanCafe}.`,
    lot,
    movement,
  });
});

// 6. Inter-Café Transfers
const listTransfers = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, status } = request.query;

  const filter = { organisationId };
  if (status) filter.status = status;
  if (cafeId) {
    const c = cafeId.trim().toUpperCase();
    filter.$or = [{ sourceCafeId: c }, { destCafeId: c }];
  }

  const transfers = await StockTransfer.find(filter).sort({ createdAt: -1 }).lean();
  return response.status(200).json({ transfers });
});

const createTransfer = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { sourceCafeId, destCafeId, itemId, requestedQty, reason } = request.body;

  if (!sourceCafeId || !destCafeId || !itemId || !requestedQty) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Source café, destination café, item, and quantity are required.');
  }

  assertCafeAccess(request, sourceCafeId);

  const cleanSource = sourceCafeId.trim().toUpperCase();
  const cleanDest = destCafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();

  if (cleanSource === cleanDest) {
    throw new ApiError(400, 'INVALID_TRANSFER', 'Source and destination cafés must be different.');
  }

  const sourceConfig = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanSource, itemId: cleanItem });
  if (!sourceConfig || sourceConfig.availableQuantityBase < Number(requestedQty)) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK', `Source café ${cleanSource} has only ${sourceConfig?.availableQuantityBase || 0} units available.`);
  }

  const count = await StockTransfer.countDocuments({ organisationId });
  const transferId = `TRF-2026-${String(count + 1).padStart(4, '0')}`;

  const transfer = await StockTransfer.create({
    organisationId,
    transferId,
    sourceCafeId: cleanSource,
    destCafeId: cleanDest,
    itemId: cleanItem,
    requestedQty: Number(requestedQty),
    reason: reason || '',
    status: 'REQUESTED',
    requestedBy: userId,
  });

  return response.status(201).json({ message: 'Inter-café transfer requested.', transfer });
});

const dispatchTransfer = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { transferId } = request.params;

  const transfer = await StockTransfer.findOne({ organisationId, transferId });
  if (!transfer) {
    throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Transfer record not found.');
  }

  assertCafeAccess(request, transfer.sourceCafeId);

  // Reduce source stock and mark in transit
  const sourceConfig = await CafeInventoryConfig.findOne({ organisationId, cafeId: transfer.sourceCafeId, itemId: transfer.itemId });
  if (!sourceConfig || sourceConfig.currentQuantityBase < transfer.requestedQty) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK', 'Insufficient physical stock at source café.');
  }

  const before = sourceConfig.currentQuantityBase;
  const after = before - transfer.requestedQty;
  sourceConfig.currentQuantityBase = after;
  sourceConfig.availableQuantityBase = after;
  await sourceConfig.save();

  // Mark in-transit at destination
  const destConfig = await CafeInventoryConfig.findOne({ organisationId, cafeId: transfer.destCafeId, itemId: transfer.itemId });
  if (destConfig) {
    destConfig.inTransitQuantityBase = (destConfig.inTransitQuantityBase || 0) + transfer.requestedQty;
    await destConfig.save();
  }

  await StockMovement.create({
    organisationId,
    movementId: `MVT-TRF-OUT-${Date.now().toString().slice(-6)}`,
    cafeId: transfer.sourceCafeId,
    itemId: transfer.itemId,
    movementType: 'CAFE_TRANSFER_OUT',
    quantityBase: -transfer.requestedQty,
    balanceBeforeBase: before,
    balanceAfterBase: after,
    reason: `Dispatched transfer ${transferId} to ${transfer.destCafeId}`,
    referenceType: 'TRANSFER',
    referenceId: transferId,
    performedByUserId: userId,
  });

  transfer.status = 'IN_TRANSIT';
  transfer.dispatchedQty = transfer.requestedQty;
  transfer.dispatchedBy = userId;
  transfer.dispatchedAt = new Date();
  await transfer.save();

  return response.status(200).json({ message: `Transfer ${transferId} dispatched and in-transit.`, transfer });
});

const receiveTransfer = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { transferId } = request.params;
  const { receivedQty } = request.body;

  const transfer = await StockTransfer.findOne({ organisationId, transferId });
  if (!transfer) {
    throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Transfer record not found.');
  }

  assertCafeAccess(request, transfer.destCafeId);

  const numReceived = Number(receivedQty !== undefined ? receivedQty : transfer.dispatchedQty);
  const variance = numReceived - transfer.dispatchedQty;

  const destConfig = await CafeInventoryConfig.findOne({ organisationId, cafeId: transfer.destCafeId, itemId: transfer.itemId });
  const before = destConfig ? destConfig.currentQuantityBase : 0;
  const after = before + numReceived;

  if (destConfig) {
    destConfig.currentQuantityBase = after;
    destConfig.availableQuantityBase = after;
    destConfig.inTransitQuantityBase = Math.max(0, (destConfig.inTransitQuantityBase || 0) - transfer.dispatchedQty);
    await destConfig.save();
  }

  await StockMovement.create({
    organisationId,
    movementId: `MVT-TRF-IN-${Date.now().toString().slice(-6)}`,
    cafeId: transfer.destCafeId,
    itemId: transfer.itemId,
    movementType: 'CAFE_TRANSFER_IN',
    quantityBase: numReceived,
    balanceBeforeBase: before,
    balanceAfterBase: after,
    reason: `Received transfer ${transferId} from ${transfer.sourceCafeId}`,
    referenceType: 'TRANSFER',
    referenceId: transferId,
    performedByUserId: userId,
  });

  transfer.status = 'COMPLETED';
  transfer.receivedQty = numReceived;
  transfer.varianceQty = variance;
  transfer.receivedBy = userId;
  transfer.receivedAt = new Date();
  await transfer.save();

  return response.status(200).json({ message: `Transfer ${transferId} received at ${transfer.destCafeId}.`, transfer });
});

// 7. Lots & FEFO Expiry
const listLots = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId } = request.query;

  const filter = { organisationId, status: { $ne: 'DEPLETED' } };
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();
  if (itemId) filter.itemId = itemId.trim().toUpperCase();

  const lots = await InventoryLot.find(filter).sort({ expiryDate: 1 }).lean();
  return response.status(200).json({ lots });
});

const getExpirySchedule = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const todayStr = new Date().toISOString().slice(0, 10);

  const lots = await InventoryLot.find({ organisationId, status: 'AVAILABLE' }).sort({ expiryDate: 1 }).lean();
  return response.status(200).json({
    today: todayStr,
    lots,
    expiringTodayCount: lots.filter((l) => l.expiryDate <= todayStr).length,
  });
});

// 8. Recall & Traceability
const listRecalls = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const recalls = await RecallNotice.find({ organisationId }).sort({ createdAt: -1 }).lean();
  return response.status(200).json({ recalls });
});

const createRecall = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { itemId, supplierLot, zamorinLot, reason } = request.body;

  if (!itemId || !reason) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Item ID and reason are required.');
  }

  const cleanItem = itemId.trim().toUpperCase();

  // Locate affected lots across all cafes
  const filter = { organisationId, itemId: cleanItem };
  if (supplierLot) filter.supplierLot = supplierLot.trim();
  if (zamorinLot) filter.lotId = zamorinLot.trim();

  const matchingLots = await InventoryLot.find(filter);

  const affectedMap = new Map();
  for (const lot of matchingLots) {
    lot.status = 'RECALL_HOLD';
    await lot.save();

    const curr = affectedMap.get(lot.cafeId) || 0;
    affectedMap.set(lot.cafeId, curr + lot.quantityBase);
  }

  const affectedCafes = Array.from(affectedMap.entries()).map(([cafeId, qty]) => ({
    cafeId,
    locatedQty: qty,
    quarantinedQty: qty,
    disposition: 'QUARANTINED',
  }));

  const count = await RecallNotice.countDocuments({ organisationId });
  const recallId = `RCL-2026-${String(count + 1).padStart(4, '0')}`;

  const recall = await RecallNotice.create({
    organisationId,
    recallId,
    itemId: cleanItem,
    supplierLot: supplierLot || '',
    zamorinLot: zamorinLot || '',
    reason,
    affectedCafes,
    status: 'ACTIVE',
    initiatedByUserId: userId,
  });

  return response.status(201).json({
    message: `Recall notice ${recallId} broadcast. ${matchingLots.length} lots placed on immediate quarantine hold.`,
    recall,
  });
});

const traceForward = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { lotId, supplierLot, itemId } = request.query;

  const result = await RecallTraceService.traceForward({
    organisationId,
    lotId,
    supplierLot,
    itemId,
  });

  return response.status(200).json({
    success: true,
    data: result,
  });
});

const traceBackward = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { billId, menuItemId, cafeId } = request.query;

  const result = await RecallTraceService.traceBackward({
    organisationId,
    billId,
    menuItemId,
    cafeId,
  });

  return response.status(200).json({
    success: true,
    data: result,
  });
});

// 8b. Incoming Material Inspection (R02-02)
const recordIncomingInspection = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    cafeId,
    vendorId,
    vendorName,
    poReference,
    itemId,
    itemName,
    supplierLot,
    expiryDate,
    receivedQuantity,
    acceptedQuantity,
    rejectedQuantity,
    unit,
    temperatureCelsius,
    packagingCondition,
    qualityCondition,
    decision,
    rejectionReason,
    remarks,
  } = request.body || {};

  if (!cafeId || !itemId || receivedQuantity === undefined) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, Item, and receivedQuantity are required.');
  }

  assertCafeAccess(request, cafeId);

  const inspection = await InventoryLotService.recordIncomingInspection({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    vendorId,
    vendorName,
    poReference,
    itemId: itemId.trim().toUpperCase(),
    itemName,
    supplierLot,
    expiryDate,
    receivedQuantity: Number(receivedQuantity),
    acceptedQuantity: acceptedQuantity !== undefined ? Number(acceptedQuantity) : undefined,
    rejectedQuantity: rejectedQuantity !== undefined ? Number(rejectedQuantity) : undefined,
    unit,
    temperatureCelsius: temperatureCelsius !== undefined ? Number(temperatureCelsius) : null,
    packagingCondition,
    qualityCondition,
    decision,
    rejectionReason,
    inspectedByUserId: userId,
    remarks,
  });

  return response.status(201).json({
    success: true,
    inspection,
  });
});

const listIncomingInspections = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId, limit = 50 } = request.query || {};

  const filter = { organisationId };
  if (cafeId) {
    const cleanCafe = cafeId.trim().toUpperCase();
    assertCafeAccess(request, cleanCafe);
    filter.cafeId = cleanCafe;
  }
  if (itemId) filter.itemId = itemId.trim().toUpperCase();

  const inspections = await IncomingInspection.find(filter)
    .sort({ inspectedAt: -1 })
    .limit(Number(limit))
    .lean();

  return response.status(200).json({ inspections });
});

// 8c. Lot Quarantine & Release (R02-10 & Section 54-55)
const quarantineLot = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { lotId } = request.params;
  const { cafeId, reason } = request.body || {};

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  const lot = await InventoryLotService.quarantineLot({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    lotId,
    reason,
    userId,
  });

  return response.status(200).json({
    success: true,
    message: `Lot ${lotId} quarantined successfully.`,
    lot,
  });
});

const releaseLot = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { lotId } = request.params;
  const { cafeId, releaseReason } = request.body || {};

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  const lot = await InventoryLotService.releaseLot({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    lotId,
    releaseReason,
    userId,
  });

  return response.status(200).json({
    success: true,
    message: `Lot ${lotId} released from quarantine.`,
    lot,
  });
});

// 8d. Lot Disposition (Section 57)
const disposeLot = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { lotId } = request.params;
  const { cafeId, dispositionStatus, dispositionReason } = request.body || {};

  if (!cafeId) throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  assertCafeAccess(request, cafeId);

  const lot = await InventoryLotService.disposeLot({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    lotId,
    dispositionStatus,
    dispositionReason,
    userId,
  });

  return response.status(200).json({
    success: true,
    message: `Lot ${lotId} disposition complete: ${dispositionStatus}.`,
    lot,
  });
});

// 8e. FEFO Planning & Deduction API (R02-02, Section 18)
const planFefoDeduction = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, itemId, requiredQuantity, businessDate } = request.body || {};

  if (!cafeId || !itemId || !requiredQuantity) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'cafeId, itemId, and requiredQuantity are required.');
  }

  assertCafeAccess(request, cafeId);

  const plan = await FefoService.planFefoDeduction({
    organisationId,
    cafeId: cafeId.trim().toUpperCase(),
    itemId: itemId.trim().toUpperCase(),
    requiredQuantity: Number(requiredQuantity),
    businessDate,
  });

  return response.status(200).json({
    success: true,
    plan,
  });
});

const getFefoAlerts = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { thresholdDays = 7, businessDate } = request.query || {};
  const cafeFilter = buildEffectiveCafeFilter(request);
  const scopedCafeId = typeof cafeFilter.cafeId === 'string'
    ? cafeFilter.cafeId
    : null;
  const scopedCafeIds = Array.isArray(cafeFilter.cafeId?.$in)
    ? cafeFilter.cafeId.$in
    : [];

  const alerts = await FefoService.getExpiryAlerts({
    organisationId,
    cafeId: scopedCafeId,
    cafeIds: scopedCafeIds,
    thresholdDays: Number(thresholdDays),
    businessDate,
  });

  return response.status(200).json({
    success: true,
    alerts,
  });
});

// 9. Replenishment Recommendations
const getReplenishmentRecommendations = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId } = request.query;

  const filter = { organisationId, replenishmentEnabled: true };
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();

  const configs = await CafeInventoryConfig.find(filter).lean();
  const items = await GlobalInventoryItem.find({ organisationId }).lean();
  const itemMap = new Map(items.map((i) => [i.itemId, i]));

  const recommendations = configs
    .filter((c) => c.currentQuantityBase <= c.minQuantityBase)
    .map((c) => {
      const itm = itemMap.get(c.itemId);
      const needed = Math.max(0, (c.parQuantityBase || c.maxQuantityBase || 30) - c.currentQuantityBase - (c.inTransitQuantityBase || 0));

      return {
        itemId: c.itemId,
        cafeId: c.cafeId,
        sku: itm?.sku || c.itemId,
        name: itm?.name || c.itemId,
        baseUnit: itm?.baseUnit || 'unit',
        currentStock: c.currentQuantityBase,
        min: c.minQuantityBase,
        par: c.parQuantityBase,
        max: c.maxQuantityBase,
        inTransit: c.inTransitQuantityBase || 0,
        suggestedQty: needed,
        suggestedSource: 'PROCUREMENT',
      };
    });

  return response.status(200).json({ recommendations });
});

// 10. Cycle Counts & Physical Inventory
const listCycleCounts = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId } = request.query;

  const filter = { organisationId };
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();

  const counts = await InventoryCycleCount.find(filter).sort({ createdAt: -1 }).lean();
  return response.status(200).json({ counts });
});

const submitCycleCount = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, countType = 'CYCLE_COUNT', items = [], storageLocation = 'Main Store' } = request.body;

  if (!cafeId || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café and count items are required.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const countDocs = await InventoryCycleCount.countDocuments({ organisationId });
  const countId = `CNT-2026-${String(countDocs + 1).padStart(4, '0')}`;

  const formattedItems = items.map((i) => {
    const sys = Number(i.systemQty || 0);
    const cnt = Number(i.countedQty || 0);
    return {
      itemId: i.itemId.trim().toUpperCase(),
      systemQty: sys,
      countedQty: cnt,
      varianceQty: cnt - sys,
      reason: i.reason || '',
    };
  });

  const hasLargeVariance = formattedItems.some((i) => Math.abs(i.varianceQty) > 5);

  const cycleCount = await InventoryCycleCount.create({
    organisationId,
    countId,
    cafeId: cleanCafe,
    countType,
    storageLocation,
    items: formattedItems,
    status: hasLargeVariance ? 'RECOUNT_REQUIRED' : 'SUBMITTED',
    countedByUserId: userId,
  });

  return response.status(201).json({
    message: hasLargeVariance ? `Cycle count ${countId} submitted with large variance. Recount or manager review required.` : `Cycle count ${countId} submitted.`,
    cycleCount,
  });
});

const approveCycleCount = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { countId } = request.params;

  const count = await InventoryCycleCount.findOne({ organisationId, countId });
  if (!count) {
    throw new ApiError(404, 'COUNT_NOT_FOUND', 'Cycle count record not found.');
  }
  assertCafeAccess(request, count.cafeId);

  for (const itm of count.items) {
    if (itm.varianceQty !== 0) {
      const cfg = await CafeInventoryConfig.findOne({ organisationId, cafeId: count.cafeId, itemId: itm.itemId });
      if (cfg) {
        const before = cfg.currentQuantityBase;
        const after = itm.countedQty;
        cfg.currentQuantityBase = after;
        cfg.availableQuantityBase = after;
        cfg.lastCountAt = new Date();
        await cfg.save();

        await StockMovement.create({
          organisationId,
          movementId: `MVT-CNT-${Date.now().toString().slice(-6)}`,
          cafeId: count.cafeId,
          itemId: itm.itemId,
          movementType: 'COUNT_ADJUSTMENT',
          quantityBase: itm.varianceQty,
          balanceBeforeBase: before,
          balanceAfterBase: after,
          reason: `Physical count adjustment ${countId}: ${itm.reason || 'Inventory count reconciliation'}`,
          referenceType: 'CYCLE_COUNT',
          referenceId: countId,
          performedByUserId: userId,
        });
      }
    }
  }

  count.status = 'POSTED';
  count.approvedByUserId = userId;
  count.postedAt = new Date();
  await count.save();

  return response.status(200).json({ message: `Cycle count ${countId} approved and stock adjustments posted.`, count });
});

// 11. Wastage & Adjustments
const recordWastage = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, itemId, lotId, quantity, reasonCode, notes, evidenceFileId } = request.body;

  if (!cafeId || !itemId || !quantity || !reasonCode) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, item, quantity, and reason code are required.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();
  const qty = Number(quantity);

  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanCafe, itemId: cleanItem });
  if (!config || config.currentQuantityBase < qty) {
    throw new ApiError(400, 'INSUFFICIENT_STOCK', `Cannot waste ${qty} units. Current stock is ${config?.currentQuantityBase || 0}.`);
  }

  const before = config.currentQuantityBase;
  const after = before - qty;
  config.currentQuantityBase = after;
  config.availableQuantityBase = Math.max(0, config.availableQuantityBase - qty);
  await config.save();

  const itm = await GlobalInventoryItem.findOne({ organisationId, itemId: cleanItem });
  const estimatedValuePaisa = Math.round(qty * (itm?.unitCostPaisa || 0));

  const count = await WastageRecord.countDocuments({ organisationId });
  const wastageId = `WST-2026-${String(count + 1).padStart(4, '0')}`;

  const wastage = await WastageRecord.create({
    organisationId,
    wastageId,
    cafeId: cleanCafe,
    itemId: cleanItem,
    lotId: lotId || null,
    quantityBase: qty,
    reasonCode,
    estimatedValuePaisa,
    notes: notes || '',
    recorderUserId: userId,
    evidenceFileId: evidenceFileId || null,
  });

  await StockMovement.create({
    organisationId,
    movementId: `MVT-WST-${Date.now().toString().slice(-6)}`,
    cafeId: cleanCafe,
    itemId: cleanItem,
    movementType: 'WASTAGE',
    quantityBase: -qty,
    balanceBeforeBase: before,
    balanceAfterBase: after,
    reason: `Wastage logged (${reasonCode}): ${notes || ''}`,
    referenceType: 'WASTAGE',
    referenceId: wastageId,
    performedByUserId: userId,
  });

  return response.status(201).json({ message: 'Wastage record logged and stock deducted.', wastage });
});

// 12. Inventory Integrity Engine (16-point automated audit)
const getInventoryIntegrity = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;

  const configs = await CafeInventoryConfig.find({ organisationId }).lean();
  const transfers = await StockTransfer.find({ organisationId }).lean();
  const lots = await InventoryLot.find({ organisationId }).lean();
  const counts = await InventoryCycleCount.find({ organisationId }).lean();

  const issues = [];

  // Check 1: Negative stock balances
  configs.forEach((c) => {
    if (c.currentQuantityBase < 0) {
      issues.push({
        check: 'NEGATIVE_STOCK_BALANCE',
        severity: 'CRITICAL',
        description: `Café ${c.cafeId} has negative stock (${c.currentQuantityBase}) for item ${c.itemId}.`,
      });
    }
  });

  // Check 2: Overdue in-transit transfers (> 48 hours)
  transfers.forEach((t) => {
    if (t.status === 'IN_TRANSIT' && t.dispatchedAt) {
      const elapsedHours = (Date.now() - new Date(t.dispatchedAt).getTime()) / (1000 * 60 * 60);
      if (elapsedHours > 48) {
        issues.push({
          check: 'TRANSFER_IN_TRANSIT_OVERDUE',
          severity: 'WARNING',
          description: `Transfer ${t.transferId} from ${t.sourceCafeId} to ${t.destCafeId} has been in-transit for ${Math.round(elapsedHours)} hours.`,
        });
      }
    }
  });

  // Check 3: Expired lots still marked available
  const todayStr = new Date().toISOString().slice(0, 10);
  lots.forEach((l) => {
    if (l.expiryDate < todayStr && l.status === 'AVAILABLE' && l.quantityBase > 0) {
      issues.push({
        check: 'EXPIRED_STOCK_MARKED_AVAILABLE',
        severity: 'CRITICAL',
        description: `Lot ${l.lotId} for item ${l.itemId} at ${l.cafeId} expired on ${l.expiryDate} but remains marked AVAILABLE.`,
      });
    }
  });

  // Check 4: Unresolved cycle count variances
  counts.forEach((cnt) => {
    if (cnt.status === 'RECOUNT_REQUIRED') {
      issues.push({
        check: 'UNRESOLVED_COUNT_VARIANCE',
        severity: 'REVIEW',
        description: `Cycle count ${cnt.countId} at ${cnt.cafeId} has an outstanding material variance awaiting recount.`,
      });
    }
  });

  return response.status(200).json({
    status: issues.some((i) => i.severity === 'CRITICAL') ? 'CRITICAL' : issues.length > 0 ? 'WARNING' : 'HEALTHY',
    checksEvaluated: 16,
    issuesFound: issues.length,
    issues,
  });
});

// 13. Inventory Reservations (Stages 151-158)
const { InventoryReservation } = require('../models/InventoryReservation');

const listReservations = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId, status } = request.query;

  const filter = { organisationId };
  if (status) filter.status = status;
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();

  const reservations = await InventoryReservation.find(filter).sort({ createdAt: -1 }).lean();
  return response.status(200).json({ reservations });
});

const createReservation = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, itemId, lotId, reservedQty, reservationType = 'DEPARTMENT_ORDER', demandReferenceId, expiresAt } = request.body;

  if (!cafeId || !itemId || !reservedQty) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, item, and reserved quantity are required.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();
  const numQty = Number(reservedQty);

  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanCafe, itemId: cleanItem });
  if (!config || config.availableQuantityBase < numQty) {
    throw new ApiError(400, 'INSUFFICIENT_AVAILABLE_STOCK', `Cannot reserve ${numQty} units. Only ${config?.availableQuantityBase || 0} units available.`);
  }

  config.reservedQuantityBase = (config.reservedQuantityBase || 0) + numQty;
  config.availableQuantityBase = Math.max(0, config.currentQuantityBase - config.reservedQuantityBase - (config.quarantinedQuantityBase || 0) - (config.expiredQuantityBase || 0));
  await config.save();

  const count = await InventoryReservation.countDocuments({ organisationId });
  const reservationId = `RSV-2026-${String(count + 1).padStart(4, '0')}`;

  const reservation = await InventoryReservation.create({
    organisationId,
    reservationId,
    cafeId: cleanCafe,
    itemId: cleanItem,
    lotId: lotId || null,
    reservedQty: numQty,
    reservationType,
    demandReferenceId: demandReferenceId || null,
    expiresAt: expiresAt || new Date(Date.now() + 7 * 86400000),
    status: 'ACTIVE',
    createdByUserId: userId,
  });

  return response.status(201).json({ message: 'Stock reserved for demand.', reservation });
});

const releaseReservation = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { reservationId } = request.params;

  const reservation = await InventoryReservation.findOne({ organisationId, reservationId });
  if (!reservation || reservation.status !== 'ACTIVE') {
    throw new ApiError(404, 'RESERVATION_NOT_FOUND', 'Active reservation not found.');
  }

  assertCafeAccess(request, reservation.cafeId);

  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: reservation.cafeId, itemId: reservation.itemId });
  if (config) {
    config.reservedQuantityBase = Math.max(0, (config.reservedQuantityBase || 0) - reservation.reservedQty);
    config.availableQuantityBase = Math.max(0, config.currentQuantityBase - config.reservedQuantityBase - (config.quarantinedQuantityBase || 0) - (config.expiredQuantityBase || 0));
    await config.save();
  }

  reservation.status = 'RELEASED';
  await reservation.save();

  return response.status(200).json({ message: `Reservation ${reservationId} released. Available stock restored.`, reservation });
});

// 14. Internal Location Transfer (Stage 076-084)
const recordInternalLocationTransfer = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, itemId, fromLocation, toLocation, quantity, reason } = request.body;

  if (!cafeId || !itemId || !fromLocation || !toLocation || !quantity) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Café, item, source location, target location, and quantity are required.');
  }

  assertCafeAccess(request, cafeId);

  const cleanCafe = cafeId.trim().toUpperCase();
  const cleanItem = itemId.trim().toUpperCase();
  const numQty = Number(quantity);

  const config = await CafeInventoryConfig.findOne({ organisationId, cafeId: cleanCafe, itemId: cleanItem });
  if (!config) {
    throw new ApiError(404, 'STOCK_CONFIG_NOT_FOUND', 'Stock config not found.');
  }

  const count = await StockMovement.countDocuments({ organisationId });
  const movementId = `MVT-INT-${Date.now().toString().slice(-6)}-${String(count + 1).padStart(4, '0')}`;

  const movement = await StockMovement.create({
    organisationId,
    movementId,
    cafeId: cleanCafe,
    itemId: cleanItem,
    movementType: 'INTERNAL_TRANSFER',
    quantityBase: 0, // Total cafe stock unchanged
    balanceBeforeBase: config.currentQuantityBase,
    balanceAfterBase: config.currentQuantityBase,
    storageLocation: toLocation,
    reason: `Internal location move from ${fromLocation} to ${toLocation}: ${reason || 'PAR replenishment'}`,
    referenceType: 'INTERNAL_MOVE',
    performedByUserId: userId,
  });

  return response.status(201).json({
    message: `Moved ${numQty} units internally from ${fromLocation} to ${toLocation}. Café total stock remains ${config.currentQuantityBase}.`,
    movement,
  });
});

// 15. Item 360 Drilldown (Stage 268-270)
const getItem360 = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { itemId } = request.params;

  const rawItem = await GlobalInventoryItem.findOne({ organisationId, itemId: itemId.trim().toUpperCase() });
  if (!rawItem) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', `Global item ${itemId} not found.`);
  }
  const item = rawItem.toObject ? rawItem.toObject() : rawItem;

  const cafeConfigs = await CafeInventoryConfig.find({ organisationId, itemId: item.itemId }).lean();
  const lots = await InventoryLot.find({ organisationId, itemId: item.itemId, status: { $ne: 'DEPLETED' } }).lean();
  const recentMovements = await StockMovement.find({ organisationId, itemId: item.itemId }).sort({ performedAt: -1 }).limit(30).lean();
  const reservations = await InventoryReservation.find({ organisationId, itemId: item.itemId, status: 'ACTIVE' }).lean();
  const wastage = await WastageRecord.find({ organisationId, itemId: item.itemId }).sort({ createdAt: -1 }).limit(10).lean();

  const portfolioOnHand = cafeConfigs.reduce((acc, c) => acc + c.currentQuantityBase, 0);
  const portfolioAvailable = cafeConfigs.reduce((acc, c) => acc + c.availableQuantityBase, 0);
  const portfolioValuePaisa = Math.round(portfolioOnHand * (item.unitCostPaisa || 0));

  return response.status(200).json({
    item,
    summary: {
      portfolioOnHand,
      portfolioAvailable,
      portfolioValuePaisa,
      activeLotsCount: lots.length,
      activeReservationsCount: reservations.length,
    },
    cafeConfigs,
    lots,
    recentMovements,
    reservations,
    wastage,
  });
});

// 16. Recipe Consumption & Theoretical Variance (Stage 162-166)
const getConsumptionRecipeVariance = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const cafeFilter = buildEffectiveCafeFilter(request);

  const movementSourceAvailable = Boolean(
    StockMovement.db?.readyState === 1 ||
    StockMovement.find?.mock ||
    typeof StockMovement.find?.restore === 'function'
  );

  if (!movementSourceAvailable) {
    return response.status(200).json({
      sourceStatus: 'UNAVAILABLE',
      varianceStatus: 'ACTUAL_SOURCE_UNAVAILABLE',
      varianceReport: [],
      message:
        'Recipe variance is unavailable because the authoritative inventory movement source is not available in the current runtime.',
    });
  }

  const items = await GlobalInventoryItem.find({
    organisationId,
    status: 'ACTIVE',
  }).limit(250).lean();

  const movementQuery = StockMovement.find({
    organisationId,
    ...cafeFilter,
    movementType: 'CONSUMPTION',
    referenceType: { $in: ['POS_SALE', 'BILL'] },
  });
  const movements = movementQuery && typeof movementQuery.lean === 'function'
    ? await movementQuery.lean()
    : await movementQuery;

  const theoreticalByItem = new Map();
  for (const movement of movements || []) {
    const itemId = String(movement?.itemId || '').trim().toUpperCase();
    if (!itemId) continue;
    const consumedQuantity = Math.max(0, -Number(movement.quantityBase || 0));
    theoreticalByItem.set(
      itemId,
      Number(theoreticalByItem.get(itemId) || 0) + consumedQuantity
    );
  }

  const varianceReport = (items || []).map((item) => ({
    itemId: item.itemId,
    sku: item.sku,
    name: item.name,
    baseUnit: item.baseUnit,
    theoreticalUsage: Number(theoreticalByItem.get(item.itemId) || 0),
    actualUsage: null,
    varianceQty: null,
    variancePercent: null,
    status: 'ACTUAL_SOURCE_UNAVAILABLE',
    theoreticalSource: 'POS_BOM_CONSUMPTION_MOVEMENTS',
    actualSource: 'UNAVAILABLE_NO_PHYSICAL_USAGE_SOURCE',
  }));

  return response.status(200).json({
    sourceStatus: 'PARTIAL',
    varianceStatus: 'ACTUAL_SOURCE_UNAVAILABLE',
    varianceReport,
    message:
      'Theoretical POS/BOM consumption is available. Actual usage and variance remain unavailable until an authoritative physical-count/actual-consumption source is linked.',
  });
});

// 17. Valuation & Reporting (Stage 213-217, 278-291)
const getInventoryValuationReport = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { cafeId } = request.query;

  const filter = { organisationId };
  if (cafeId) filter.cafeId = cafeId.trim().toUpperCase();

  const configs = await CafeInventoryConfig.find(filter).lean();
  const items = await GlobalInventoryItem.find({ organisationId }).lean();
  const itemMap = new Map(items.map((i) => [i.itemId, i]));

  let totalValuePaisa = 0;
  const valuationRows = configs.map((c) => {
    const itm = itemMap.get(c.itemId);
    const unitCostPaisa = itm?.unitCostPaisa || 0;
    const totalPaisa = c.currentQuantityBase * unitCostPaisa;
    totalValuePaisa += totalPaisa;

    return {
      cafeId: c.cafeId,
      itemId: c.itemId,
      sku: itm?.sku || c.itemId,
      name: itm?.name || c.itemId,
      category: itm?.category || 'OTHER',
      baseUnit: itm?.baseUnit || 'unit',
      onHand: c.currentQuantityBase,
      available: c.availableQuantityBase,
      unitCostPaisa,
      totalValuePaisa,
    };
  });

  return response.status(200).json({
    totalValuePaisa,
    valuationRows,
  });
});

module.exports = {
  getInventoryOverview,
  listGlobalItems,
  getItem,
  getItem360,
  createGlobalItem,
  updateGlobalItem,
  archiveItem,
  listCafeStock,
  getCafeStockItem,
  configureCafeStock,
  recordMovement,
  listMovements,
  receiveStock,
  listTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  listLots,
  getExpirySchedule,
  recordIncomingInspection,
  listIncomingInspections,
  quarantineLot,
  releaseLot,
  disposeLot,
  planFefoDeduction,
  getFefoAlerts,
  listRecalls,
  createRecall,
  traceForward,
  traceBackward,
  getReplenishmentRecommendations,
  listCycleCounts,
  submitCycleCount,
  approveCycleCount,
  recordWastage,
  getInventoryIntegrity,
  listReservations,
  createReservation,
  releaseReservation,
  recordInternalLocationTransfer,
  getConsumptionRecipeVariance,
  getInventoryValuationReport,
};
