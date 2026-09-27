'use strict';

/**
 * DEPARTMENT / INSTITUTIONAL ORDER CONTROLLER (SCREEN 007)
 *
 * Authoritative Institutional Order Lifecycle Management:
 *   - Overview KPIs & 7-Day Forecasting
 *   - Institutional Order Register & 360 Detail
 *   - New Order Wizard with Duplicate Detection
 *   - Immutable Revisions & Change Tracking
 *   - Fulfilment Confirmation & Receiving Proof
 *   - Credit Visibility & Partial Settlements
 *   - Quotes Intake & Conversion
 *   - Three-Way Reconciliation & Integrity Verification
 */

const {
  DepartmentOrder,
  ORDER_CATEGORIES,
  ORDER_STATUSES,
  FULFILMENT_STATUSES,
  CREDIT_STATUSES,
} = require('../models/DepartmentOrder');

const { InstitutionalQuote } = require('../models/InstitutionalQuote');
const { InstitutionalAccount } = require('../models/InstitutionalAccount');
const { SequenceCounter } = require('../models/SequenceCounter');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('../services/auditService');
const { resolveEffectiveCafeScope, assertResourceCafeOwnership } = require('../utils/cafeScope');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function getIstBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function assertCafeAccess(request, cafeId) {
  if (!cafeId) return;
  if (request.auth.role === 'MASTER' || request.auth.role === 'OWNER') return;
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe && effectiveCafe !== cafeId.trim().toUpperCase()) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to this café.'
    );
  }
}

/**
 * 1. GET OVERVIEW & CONTROL STRIP
 */
const getDepartmentOrdersOverview = asyncHandler(async (request, response) => {
  const organisationId = request.auth.organisationId;
  const today = getIstBusinessDate();
  const effectiveCafe = resolveEffectiveCafeScope(request);

  const filter = { organisationId };
  if (effectiveCafe) {
    filter.cafeId = effectiveCafe;
  } else if (request.query.cafeId && request.query.cafeId !== 'ALL') {
    filter.cafeId = request.query.cafeId.trim().toUpperCase();
  }

  const allOrders = await DepartmentOrder.find(filter)
    .select('orderId cafeId institutionName departmentName orderDate fulfilmentDate totalPaisa settledPaisa orderStatus fulfilmentStatus creditStatus poNumber headcount')
    .lean();

  let outstandingCreditPaisa = 0;
  let settledThisMonthPaisa = 0;
  let todayOrdersCount = 0;
  let upcoming7DaysCount = 0;
  let awaitingApprovalCount = 0;
  let overduePaisa = 0;
  let poWarningsCount = 0;

  const next7DaysMap = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = getIstBusinessDate(d);
    next7DaysMap[dateStr] = { date: dateStr, count: 0, totalPaisa: 0 };
  }

  const currentYearMonth = today.slice(0, 7);

  allOrders.forEach((o) => {
    const balance = Math.max(0, (o.totalPaisa || 0) - (o.settledPaisa || 0));
    if (balance > 0) {
      outstandingCreditPaisa += balance;
      if (o.creditStatus === 'OVERDUE') overduePaisa += balance;
    }

    if (o.settledPaisa > 0 && o.orderDate && o.orderDate.startsWith(currentYearMonth)) {
      settledThisMonthPaisa += o.settledPaisa;
    }

    if (o.fulfilmentDate === today) {
      todayOrdersCount++;
    }

    if (next7DaysMap[o.fulfilmentDate]) {
      next7DaysMap[o.fulfilmentDate].count++;
      next7DaysMap[o.fulfilmentDate].totalPaisa += o.totalPaisa || 0;
      upcoming7DaysCount++;
    }

    if (o.orderStatus === 'AWAITING_APPROVAL') {
      awaitingApprovalCount++;
    }

    if (!o.poNumber && (o.totalPaisa || 0) > 1000000) {
      poWarningsCount++;
    }
  });

  return response.status(200).json({
    success: true,
    data: {
      kpis: {
        outstandingCreditPaisa,
        settledThisMonthPaisa,
        activeOrdersCount: allOrders.length,
        upcoming7DaysCount,
        awaitingApprovalCount,
        overduePaisa,
      },
      controlStrip: {
        todayOrders: todayOrdersCount,
        next7Days: upcoming7DaysCount,
        awaitingApproval: awaitingApprovalCount,
        overduePaisa,
        poWarnings: poWarningsCount,
        monthEndIssues: 0,
      },
      upcoming7Days: Object.values(next7DaysMap),
      totalOrders: allOrders.length,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 2. LIST DEPARTMENT ORDERS (WITH ADVANCED SEARCH & FILTER)
 */
const listDepartmentOrders = asyncHandler(async (request, response) => {
  const page = parsePositiveInteger(request.query.page, 1, 1000);
  const limit = parsePositiveInteger(request.query.limit, 25, 100);
  const skip = (page - 1) * limit;

  const filter = { organisationId: request.auth.organisationId };
  const { cafeId, orderStatus, fulfilmentStatus, creditStatus, search, dateFrom, dateTo } = request.query;

  if (cafeId) {
    const normCafeId = normalizeId(cafeId);
    assertCafeAccess(request, normCafeId);
    filter.cafeId = normCafeId;
  } else if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  if (orderStatus && ORDER_STATUSES.includes(orderStatus.toUpperCase())) {
    filter.orderStatus = orderStatus.toUpperCase();
  }
  if (fulfilmentStatus && FULFILMENT_STATUSES.includes(fulfilmentStatus.toUpperCase())) {
    filter.fulfilmentStatus = fulfilmentStatus.toUpperCase();
  }
  if (creditStatus && CREDIT_STATUSES.includes(creditStatus.toUpperCase())) {
    filter.creditStatus = creditStatus.toUpperCase();
  }

  if (dateFrom || dateTo) {
    filter.fulfilmentDate = {};
    if (dateFrom) filter.fulfilmentDate.$gte = dateFrom;
    if (dateTo) filter.fulfilmentDate.$lte = dateTo;
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, 'i');
    filter.$or = [
      { orderId: regex },
      { institutionName: regex },
      { departmentName: regex },
      { careOfContact: regex },
      { poNumber: regex },
    ];
  }

  const [orders, total] = await Promise.all([
    DepartmentOrder.find(filter)
      .select('-__v -version')
      .sort({ fulfilmentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DepartmentOrder.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: {
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 3. GET SINGLE DEPARTMENT ORDER (360 DETAIL)
 */
const getDepartmentOrder = asyncHandler(async (request, response) => {
  const orderId = normalizeId(request.params.orderId);
  const order = await DepartmentOrder.findOne({
    orderId,
    organisationId: request.auth.organisationId,
  }).lean();

  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Department order ${orderId} does not exist.`);
  }

  assertCafeAccess(request, order.cafeId);

  const balancePaisa = Math.max(0, (order.totalPaisa || 0) - (order.settledPaisa || 0));

  // Determine allowed actions
  const isMaster = request.auth.role === 'MASTER';
  const isPrimary = isMaster && request.auth.masterAuthority === 'PRIMARY';
  const isClosed = order.orderStatus === 'CLOSED' || order.orderStatus === 'CANCELLED';

  const allowedActions = {
    canEditDraft: order.orderStatus === 'DRAFT',
    canRevise: ['CONFIRMED', 'SCHEDULED', 'IN_FULFILMENT'].includes(order.orderStatus),
    canConfirmFulfilment: ['CONFIRMED', 'SCHEDULED', 'IN_FULFILMENT'].includes(order.orderStatus),
    canRecordSettlement: balancePaisa > 0 && !isClosed,
    canClose: order.fulfilmentStatus === 'FULFILLED' && balancePaisa === 0 && !isClosed,
    canReopen: isClosed && isPrimary,
    canCancel: !isClosed && order.fulfilmentStatus !== 'FULFILLED',
  };

  return response.status(200).json({
    success: true,
    data: {
      order,
      balancePaisa,
      allowedActions,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 4. CREATE NEW DEPARTMENT ORDER (WIZARD SUBMISSION WITH DUPLICATE DETECTION)
 */
const createDepartmentOrder = asyncHandler(async (request, response) => {
  const {
    cafeId,
    institutionName,
    departmentName,
    careOfContact,
    requesterName,
    requesterContact,
    approverName,
    poNumber,
    costCentre,
    orderCategory,
    orderDate,
    fulfilmentDate,
    requestedTime,
    promisedTimeWindow,
    fulfilmentType,
    deliveryLocation,
    headcount,
    items,
    notes,
    isDraft,
  } = request.body;

  if (!institutionName || !departmentName || !items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'INVALID_ORDER_PAYLOAD', 'Institution, department, and at least one item are required.');
  }

  const normCafeId = normalizeId(cafeId);
  if (!normCafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  }
  assertCafeAccess(request, normCafeId);

  const businessDate = orderDate || getIstBusinessDate();
  const fulDate = fulfilmentDate || businessDate;

  // Calculate pricing
  let subtotalPaisa = 0;
  const processedItems = items.map((item) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPricePaisa) || 0;
    const lineTotal = Math.round(qty * unitPrice);
    subtotalPaisa += lineTotal;
    return {
      menuItemId: item.menuItemId || null,
      name: item.name.trim(),
      quantity: qty,
      unit: item.unit || 'units',
      unitPricePaisa: unitPrice,
      totalPaisa: lineTotal,
      isSpecialItem: Boolean(item.isSpecialItem),
      notes: item.notes || '',
    };
  });

  const taxPaisa = Math.round(subtotalPaisa * 0.05); // 5% GST preview
  const totalPaisa = subtotalPaisa + taxPaisa;

  // Duplicate warning detection
  const possibleDuplicate = await DepartmentOrder.findOne({
    organisationId: request.auth.organisationId,
    institutionName: institutionName.trim(),
    fulfilmentDate: fulDate,
    totalPaisa: { $gte: totalPaisa * 0.9, $lte: totalPaisa * 1.1 },
    orderStatus: { $ne: 'CANCELLED' },
  }).select('orderId totalPaisa fulfilmentDate').lean();

  // Generate sequence DO-YYYY-XXXX
  const year = new Date().getFullYear();
  let orderId;
  try {
    orderId = await SequenceCounter.generateId({
      organisationId: request.auth.organisationId,
      prefix: `DO-${year}`,
      minimumDigits: 4,
    });
  } catch (e) {
    const seq = Math.floor(Math.random() * 9000) + 1000;
    orderId = `DO-${year}-${String(seq).padStart(4, '0')}`;
  }

  const initialStatus = isDraft ? 'DRAFT' : 'CONFIRMED';
  const initialFulfilmentStatus = isDraft ? 'SCHEDULED' : 'SCHEDULED';

  const newOrder = await DepartmentOrder.create({
    orderId,
    organisationId: request.auth.organisationId,
    cafeId: normCafeId,
    institutionName: institutionName.trim(),
    departmentName: departmentName.trim(),
    careOfContact: careOfContact ? careOfContact.trim() : '',
    requesterName: requesterName ? requesterName.trim() : '',
    requesterContact: requesterContact ? requesterContact.trim() : '',
    approverName: approverName ? approverName.trim() : '',
    poNumber: poNumber ? poNumber.trim().toUpperCase() : '',
    costCentre: costCentre ? costCentre.trim() : '',
    orderCategory: orderCategory || 'CONFERENCE',
    orderDate: businessDate,
    fulfilmentDate: fulDate,
    requestedTime: requestedTime || '10:00',
    promisedTimeWindow: promisedTimeWindow || '09:50 - 10:10',
    fulfilmentType: fulfilmentType || 'DELIVERY',
    deliveryLocation: deliveryLocation || {},
    headcount: {
      estimated: Number(headcount?.estimated) || 0,
      guaranteed: Number(headcount?.guaranteed) || 0,
      final: Number(headcount?.final) || Number(headcount?.estimated) || 0,
      actual: 0,
    },
    items: processedItems,
    subtotalPaisa,
    taxPaisa,
    totalPaisa,
    settledPaisa: 0,
    orderStatus: initialStatus,
    fulfilmentStatus: initialFulfilmentStatus,
    creditStatus: 'CREDIT_OPEN',
    notes: {
      internalNotes: notes?.internalNotes || '',
      institutionNotes: notes?.institutionNotes || '',
    },
    requestedByUserId: request.auth.userId,
  });

  try {
    await recordRequestAudit({
      request,
      module: 'DEPARTMENT_ORDERS',
      action: 'CREATE_ORDER',
      entityType: 'DEPARTMENT_ORDER',
      entityId: orderId,
      metadata: {
        orderId,
        institutionName,
        totalPaisa,
        status: initialStatus,
      },
    });
  } catch (err) {
    // Non-blocking audit
  }

  return response.status(201).json({
    success: true,
    data: {
      order: newOrder,
      duplicateWarning: possibleDuplicate ? `Possible duplicate order exists: ${possibleDuplicate.orderId}` : null,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 5. CREATE ORDER REVISION
 */
const createOrderRevision = asyncHandler(async (request, response) => {
  const orderId = normalizeId(request.params.orderId);
  const { field, before, after, reason } = request.body;

  if (!field || !reason || reason.trim().length === 0) {
    throw new ApiError(400, 'REVISION_REASON_REQUIRED', 'Revision field and non-empty reason are required.');
  }

  const order = await DepartmentOrder.findOne({
    orderId,
    organisationId: request.auth.organisationId,
  });

  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Department order ${orderId} does not exist.`);
  }

  assertCafeAccess(request, order.cafeId);

  const nextRev = (order.revisions?.length || 0) + 1;
  const revisionRecord = {
    revisionNumber: nextRev,
    field,
    before,
    after,
    reason: reason.trim(),
    changedByUserId: request.auth.userId,
    createdAt: new Date(),
  };

  if (!order.revisions) order.revisions = [];
  order.revisions.push(revisionRecord);

  // If revision changes total or headcount, apply
  if (field === 'headcount' && after) {
    if (!order.headcount) order.headcount = {};
    if (after.final !== undefined) order.headcount.final = Number(after.final);
    if (after.guaranteed !== undefined) order.headcount.guaranteed = Number(after.guaranteed);
  } else if (field === 'totalPaisa' && after !== undefined) {
    order.totalPaisa = Number(after);
  }

  await order.save();

  try {
    await recordRequestAudit({
      request,
      module: 'DEPARTMENT_ORDERS',
      action: 'REVISE_ORDER',
      entityType: 'DEPARTMENT_ORDER',
      entityId: orderId,
      metadata: {
        orderId,
        revisionNumber: nextRev,
        field,
        reason,
      },
    });
  } catch (err) {
    // Non-blocking audit
  }

  return response.status(200).json({
    success: true,
    data: {
      order,
      revision: revisionRecord,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 6. CONFIRM FULFILMENT WITH RECEIVING CONTACT & PROOF
 */
const confirmOrderFulfilment = asyncHandler(async (request, response) => {
  const orderId = normalizeId(request.params.orderId);
  const { receivingContactName, receivingSignature, discrepancyNotes, isPartial } = request.body;

  if (!receivingContactName || receivingContactName.trim().length === 0) {
    throw new ApiError(400, 'RECEIVING_CONTACT_REQUIRED', 'Receiving contact person name is required for fulfilment.');
  }

  const order = await DepartmentOrder.findOne({
    orderId,
    organisationId: request.auth.organisationId,
  });

  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Department order ${orderId} does not exist.`);
  }

  assertCafeAccess(request, order.cafeId);

  const newStatus = isPartial ? 'PARTIALLY_FULFILLED' : 'FULFILLED';
  order.fulfilmentStatus = newStatus;
  order.orderStatus = newStatus;
  order.fulfilmentProof = {
    receivingContactName: receivingContactName.trim(),
    receivingSignature: receivingSignature ? receivingSignature.trim() : 'ACKNOWLEDGED_ON_DEVICE',
    fulfilledAt: new Date(),
    discrepancyNotes: discrepancyNotes ? discrepancyNotes.trim() : '',
    actualFulfilledItems: (order.items || []).map((i) => ({ name: i.name, quantity: i.quantity })),
  };

  await order.save();

  try {
    await recordRequestAudit({
      request,
      module: 'DEPARTMENT_ORDERS',
      action: 'FULFIL_ORDER',
      entityType: 'DEPARTMENT_ORDER',
      entityId: orderId,
      metadata: {
        orderId,
        fulfilmentStatus: newStatus,
        receivingContactName,
      },
    });
  } catch (err) {
    // Non-blocking audit
  }

  return response.status(200).json({
    success: true,
    data: {
      order,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 7. RECORD SETTLEMENT REFERENCE
 */
const recordOrderSettlement = asyncHandler(async (request, response) => {
  const orderId = normalizeId(request.params.orderId);
  const { amountPaisa, paymentMethod, paymentReference, notes } = request.body;

  const parsedAmount = Number(amountPaisa);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new ApiError(400, 'INVALID_SETTLEMENT_AMOUNT', 'Settlement amount must be a positive integer in paisa.');
  }

  const order = await DepartmentOrder.findOne({
    orderId,
    organisationId: request.auth.organisationId,
  });

  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Department order ${orderId} does not exist.`);
  }

  assertCafeAccess(request, order.cafeId);

  const currentOutstanding = Math.max(0, (order.totalPaisa || 0) - (order.settledPaisa || 0));
  if (parsedAmount > currentOutstanding) {
    throw new ApiError(400, 'AMOUNT_EXCEEDS_OUTSTANDING', `Settlement amount ₹${(parsedAmount / 100).toFixed(2)} exceeds current outstanding ₹${(currentOutstanding / 100).toFixed(2)}.`);
  }

  const settlementId = `SETTLE-${Date.now().toString(36).toUpperCase()}`;
  const newSettlement = {
    settlementId,
    amountPaisa: parsedAmount,
    paymentMethod: paymentMethod || 'BANK_TRANSFER',
    paymentReference: paymentReference ? paymentReference.trim() : '',
    settledAt: new Date(),
    recordedByUserId: request.auth.userId,
    notes: notes ? notes.trim() : '',
  };

  if (!order.settlements) order.settlements = [];
  order.settlements.push(newSettlement);
  order.settledPaisa = (order.settledPaisa || 0) + parsedAmount;

  if (order.settledPaisa >= order.totalPaisa) {
    order.creditStatus = 'SETTLED';
  } else {
    order.creditStatus = 'PARTIALLY_SETTLED';
  }

  await order.save();

  try {
    await recordRequestAudit({
      request,
      module: 'DEPARTMENT_ORDERS',
      action: 'SETTLE_ORDER',
      entityType: 'DEPARTMENT_ORDER',
      entityId: orderId,
      metadata: {
        orderId,
        settlementId,
        amountPaisa: parsedAmount,
        remainingBalance: Math.max(0, order.totalPaisa - order.settledPaisa),
      },
    });
  } catch (err) {
    // Non-blocking audit
  }

  return response.status(200).json({
    success: true,
    data: {
      order,
      settlement: newSettlement,
      remainingOutstandingPaisa: Math.max(0, order.totalPaisa - order.settledPaisa),
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 8. LIST & CREATE QUOTES
 */
const listQuotes = asyncHandler(async (request, response) => {
  const filter = { organisationId: request.auth.organisationId };
  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  const quotes = await InstitutionalQuote.find(filter)
    .select('-__v -version')
    .sort({ createdAt: -1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: {
      quotes,
    },
    correlationId: request.correlationId || null,
  });
});

const createQuote = asyncHandler(async (request, response) => {
  const {
    cafeId,
    institutionName,
    departmentName,
    contactName,
    contactEmail,
    contactPhone,
    validUntil,
    headcount,
    items,
  } = request.body;

  if (!institutionName || !departmentName || !contactName || !validUntil || !items || !Array.isArray(items)) {
    throw new ApiError(400, 'INVALID_QUOTE_DATA', 'Institution, department, contact, validity date, and items are required.');
  }

  const normCafeId = normalizeId(cafeId);
  if (!normCafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required.');
  }
  assertCafeAccess(request, normCafeId);

  let subtotalPaisa = 0;
  const processedItems = items.map((i) => {
    const qty = Number(i.quantity) || 1;
    const rate = Number(i.unitPricePaisa) || 0;
    const tot = Math.round(qty * rate);
    subtotalPaisa += tot;
    return {
      name: i.name.trim(),
      quantity: qty,
      unit: i.unit || 'units',
      unitPricePaisa: rate,
      totalPaisa: tot,
    };
  });

  const taxPaisa = Math.round(subtotalPaisa * 0.05);
  const totalPaisa = subtotalPaisa + taxPaisa;

  const quoteId = `QUO-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const quote = await InstitutionalQuote.create({
    quoteId,
    organisationId: request.auth.organisationId,
    cafeId: normCafeId,
    institutionName: institutionName.trim(),
    departmentName: departmentName.trim(),
    contactName: contactName.trim(),
    contactEmail: contactEmail ? contactEmail.trim().toLowerCase() : '',
    contactPhone: contactPhone ? contactPhone.trim() : '',
    validUntil,
    headcount: Number(headcount) || 0,
    items: processedItems,
    subtotalPaisa,
    taxPaisa,
    totalPaisa,
    status: 'SENT',
    createdByUserId: request.auth.userId,
  });

  try {
    await recordRequestAudit({
      request,
      module: 'DEPARTMENT_ORDERS',
      action: 'CREATE_QUOTE',
      entityType: 'INSTITUTIONAL_QUOTE',
      entityId: quoteId,
      metadata: {
        quoteId,
        institutionName,
        totalPaisa,
      },
    });
  } catch (err) {
    // Non-blocking audit
  }

  return response.status(201).json({
    success: true,
    data: {
      quote,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 9. GET SCHEDULE
 */
const getInstitutionalSchedule = asyncHandler(async (request, response) => {
  const filter = {
    organisationId: request.auth.organisationId,
    orderStatus: { $ne: 'CANCELLED' },
  };

  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  const { dateFrom, dateTo } = request.query;
  if (dateFrom || dateTo) {
    filter.fulfilmentDate = {};
    if (dateFrom) filter.fulfilmentDate.$gte = dateFrom;
    if (dateTo) filter.fulfilmentDate.$lte = dateTo;
  }

  const orders = await DepartmentOrder.find(filter)
    .select('orderId cafeId institutionName departmentName careOfContact fulfilmentDate requestedTime promisedTimeWindow headcount totalPaisa fulfilmentStatus orderStatus')
    .sort({ fulfilmentDate: 1, requestedTime: 1 })
    .lean();

  return response.status(200).json({
    success: true,
    data: {
      schedule: orders,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 10. INSTITUTIONAL ACCOUNTS
 */
const getInstitutionalAccounts = asyncHandler(async (request, response) => {
  const filter = { organisationId: request.auth.organisationId };
  const accounts = await InstitutionalAccount.find(filter).lean();

  return response.status(200).json({
    success: true,
    data: {
      accounts,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * 11. INTEGRITY & THREE-WAY RECONCILIATION
 */
const getInstitutionalIntegrityStatus = asyncHandler(async (request, response) => {
  const filter = { organisationId: request.auth.organisationId };
  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    filter.cafeId = { $in: request.auth.assignedCafeIds };
  }

  const orders = await DepartmentOrder.find(filter)
    .select('orderId institutionName poNumber totalPaisa settledPaisa fulfilmentStatus orderStatus revisions fulfilmentProof')
    .lean();

  const missingPO = [];
  const fulfilmentMismatches = [];
  const overdueCredit = [];

  orders.forEach((o) => {
    if (!o.poNumber && (o.totalPaisa || 0) > 1000000) {
      missingPO.push({ orderId: o.orderId, institutionName: o.institutionName, totalPaisa: o.totalPaisa });
    }
    if (o.fulfilmentStatus === 'PARTIALLY_FULFILLED' && o.orderStatus !== 'CANCELLED') {
      fulfilmentMismatches.push({
        orderId: o.orderId,
        institutionName: o.institutionName,
        notes: o.fulfilmentProof?.discrepancyNotes || 'Partial items delivered',
      });
    }
    const balance = Math.max(0, (o.totalPaisa || 0) - (o.settledPaisa || 0));
    if (balance > 0 && o.orderStatus === 'FULFILLED') {
      overdueCredit.push({ orderId: o.orderId, institutionName: o.institutionName, balancePaisa: balance });
    }
  });

  return response.status(200).json({
    success: true,
    data: {
      status: missingPO.length === 0 && fulfilmentMismatches.length === 0 ? 'HEALTHY' : 'ATTENTION_REQUIRED',
      checks: {
        totalOrdersEvaluated: orders.length,
        missingPOCount: missingPO.length,
        missingPOOrders: missingPO,
        fulfilmentDiscrepanciesCount: fulfilmentMismatches.length,
        fulfilmentDiscrepancies: fulfilmentMismatches,
        overdueCreditCount: overdueCredit.length,
        overdueCreditOrders: overdueCredit,
      },
    },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  getDepartmentOrdersOverview,
  listDepartmentOrders,
  getDepartmentOrder,
  createDepartmentOrder,
  createOrderRevision,
  confirmOrderFulfilment,
  recordOrderSettlement,
  listQuotes,
  createQuote,
  getInstitutionalSchedule,
  getInstitutionalAccounts,
  getInstitutionalIntegrityStatus,
};
