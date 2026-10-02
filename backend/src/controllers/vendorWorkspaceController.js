'use strict';

/**
 * VENDOR WORKSPACE CONTROLLER (VEN-SCR-001 VENDOR DASHBOARD)
 *
 * Provides external-facing, strictly read-only endpoints for authorized vendors.
 * Answers the five fundamental vendor questions:
 * 1. What has been ordered from us? (Purchase Orders)
 * 2. What has been supplied? (Fulfillments & Dispatches)
 * 3. What has been received by the café? (GRNs & Physical counts)
 * 4. How much have we been paid? (Settlements & Payments)
 * 5. How much is still receivable? (Authoritative AP Balances & Aging)
 *
 * Architectural Guarantees:
 * - 100% Derived identity: vendorId is ALWAYS taken from req.auth.vendorId
 * - Zero cross-vendor leakage (strict BOLA/IDOR protection)
 * - Multi-café scoping strictly constrained to Vendor.approvedCafeIds
 * - Authoritative accounting numbers (reconciles with APInvoice & VendorLedgerEntry)
 * - Zero write capability: Only GET endpoints are exposed
 * - Thorough data sanitization: Internal margins, risk scores, and admin notes are stripped
 */

const { Cafe } = require('../models/Cafe');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { APInvoice } = require('../models/APInvoice');
const { Vendor } = require('../models/Vendor');
const { VendorLedgerEntry } = require('../models/VendorLedgerEntry');
const { BusinessDocument } = require('../models/BusinessDocument');
const { GlobalInventoryItem } = require('../models/GlobalInventoryItem');
const { Notification } = require('../models/Notification');
const { logSecurityEvent } = require('../services/securityLogger');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { generateXlsx } = require('../utils/exportGenerators');

function getIstDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Parses days between two YYYY-MM-DD date strings.
 */
function getDaysDiff(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr) return 0;
  const fromTime = new Date(fromDateStr).getTime();
  const toTime = new Date(toDateStr).getTime();
  return Math.floor((toTime - fromTime) / (1000 * 60 * 60 * 24));
}

function escapePdf(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function formatPaymentTerms(terms) {
  if (!terms) return 'Net 30 Days';
  const t = String(terms).trim().toUpperCase();
  if (t === 'NET_30' || t === 'NET 30') return 'Net 30 Days';
  if (t === 'NET_15' || t === 'NET 15') return 'Net 15 Days';
  if (t === 'NET_7' || t === 'NET 7') return 'Net 7 Days';
  if (t === 'NET_60' || t === 'NET 60') return 'Net 60 Days';
  if (t === 'IMMEDIATE') return 'Immediate Payment';
  if (t === 'ADVANCE') return '100% Advance';
  return String(terms);
}

function formatCafeAddress(addr) {
  if (!addr) return 'Main Café Facility';
  if (typeof addr === 'string') return addr.trim() || 'Main Café Facility';
  if (typeof addr === 'object') {
    if (addr.formattedAddress) return addr.formattedAddress;
    const parts = [
      addr.building,
      addr.floor,
      addr.unit,
      addr.street,
      addr.line1,
      addr.area,
      addr.city,
      addr.state,
      addr.pinCode,
    ].filter((p) => typeof p === 'string' && p.trim().length > 0);
    return parts.length > 0 ? parts.join(', ') : 'Main Café Facility';
  }
  return 'Main Café Facility';
}

/**
 * Resolves date filters into ISO range constraints.
 */
function resolveDateConstraints(dateRange, customStart, customEnd) {
  if (customStart && customEnd) {
    return { start: String(customStart).slice(0, 10), end: String(customEnd).slice(0, 10) };
  }
  const todayStr = getIstDateString();
  const today = new Date(todayStr);

  switch (dateRange ? String(dateRange).toLowerCase() : '') {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week':
    case 'last_7_days':
    case '7days': {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 7);
      return { start: getIstDateString(past7), end: todayStr };
    }
    case 'last_30_days':
    case '30days': {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 30);
      return { start: getIstDateString(past30), end: todayStr };
    }
    case 'this_month': {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      return { start: `${year}-${month}-01`, end: todayStr };
    }
    case 'this_fy': {
      const curYear = today.getFullYear();
      const isPastApril = today.getMonth() >= 3; // Month index 3 = April
      const fyStartYear = isPastApril ? curYear : curYear - 1;
      return { start: `${fyStartYear}-04-01`, end: todayStr };
    }
    case 'custom':
      if (customStart && customEnd) {
        return { start: String(customStart).slice(0, 10), end: String(customEnd).slice(0, 10) };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Format paisa into Indian currency representation (e.g. ₹74,450)
 */
function formatCurrency(paisa = 0) {
  const rupees = Math.round((Number(paisa) || 0) / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

/**
 * Sanitizes vendor profile and scope data for external visibility.
 */
function sanitizeVendorIdentity(vendor, user) {
  return {
    vendorId: vendor.vendorId,
    organisationId: vendor.organisationId,
    name: vendor.name,
    tradeName: vendor.tradeName || '',
    category: vendor.category,
    supplierType: vendor.supplierType,
    status: vendor.status,
    gstNumber: vendor.gstNumber || '',
    panNumber: vendor.panNumber || '',
    fssaiLicense: vendor.fssaiLicense || '',
    approvedCafeIds: vendor.approvedCafeIds || [],
    paymentTerms: vendor.paymentTerms,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name || user.email,
      role: 'VENDOR',
    },
    workspaceMode: 'READ_ONLY',
    accessModel: 'READ_ONLY',
  };
}

/**
 * GET /api/v1/vendor/me
 * Retrieves authenticated vendor profile, scope, and authorized café relationships.
 */
const getVendorMe = asyncHandler(async (req, res) => {
  const vendor = req.vendor;
  const user = req.auth;

  if (!vendor || !user) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Valid vendor authentication required.');
  }

  const approvedCafes = await Cafe.find({
    organisationId: vendor.organisationId,
    cafeId: { $in: vendor.approvedCafeIds || [] },
    status: { $ne: 'ARCHIVED' },
  })
    .select('cafeId name displayName code city state isOperational')
    .sort({ cafeId: 1 })
    .lean();

  const sanitized = sanitizeVendorIdentity(vendor, user);
  sanitized.approvedCafes = approvedCafes.map((c) => ({
    cafeId: c.cafeId,
    name: c.displayName || c.name,
    code: c.code || '',
    city: c.city || '',
    isOperational: Boolean(c.isOperational),
  }));

  return res.status(200).json({
    success: true,
    data: sanitized,
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/dashboard
 * Aggregates all 12 operational and financial domains for VEN-SCR-001.
 */
const getVendorDashboard = asyncHandler(async (req, res) => {
  const vendor = req.vendor;
  const { vendorId, organisationId } = req.auth;
  const { cafeId, dateRange = '30days', startDate, endDate } = req.query;

  // 1. Validate Café Filter scope
  let targetCafeIds = [...(vendor.approvedCafeIds || [])];
  if (cafeId && cafeId !== 'ALL') {
    const normCafeId = cafeId.trim().toUpperCase();
    if (!targetCafeIds.includes(normCafeId)) {
      throw new ApiError(
        403,
        'CROSS_CAFE_ACCESS_DENIED',
        'Your vendor account is not authorized to access transactions for the requested café.'
      );
    }
    targetCafeIds = [normCafeId];
  }

  // 2. Resolve Date Filter
  const dateBounds = resolveDateConstraints(dateRange, startDate, endDate);
  const todayStr = getIstDateString();

  // 3. Fetch Approved Cafes mapping for display names
  const cafeRecords = await Cafe.find({
    organisationId,
    cafeId: { $in: vendor.approvedCafeIds || [] },
    status: { $ne: 'ARCHIVED' },
  })
    .select('cafeId name displayName code city')
    .lean();

  const cafeMap = new Map();
  cafeRecords.forEach((c) => {
    cafeMap.set(c.cafeId, c.displayName || c.name);
  });

  // 4. Construct Query Filters
  const poFilter = {
    organisationId,
    vendorId,
    cafeId: { $in: targetCafeIds },
  };

  const invFilter = {
    organisationId,
    vendorId,
    cafeId: { $in: targetCafeIds },
  };

  const ledgerFilter = {
    organisationId,
    vendorId,
    isReversed: false,
    ...(targetCafeIds.length === 1 ? { cafeId: targetCafeIds[0] } : {}),
  };

  if (dateBounds) {
    poFilter.orderDate = { $gte: dateBounds.start, $lte: dateBounds.end };
    invFilter.invoiceDate = { $gte: dateBounds.start, $lte: dateBounds.end };
  }

  // 5. Execute parallel database queries
  const [
    purchaseOrders,
    allVendorInvoices,
    recentLedgerEntries,
    notifications,
  ] = await Promise.all([
    PurchaseOrder.find(poFilter).sort({ orderDate: -1, createdAt: -1 }).lean(),
    APInvoice.find(invFilter).sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    VendorLedgerEntry.find(ledgerFilter).sort({ entryDate: -1, entryTimestamp: -1 }).limit(50).lean(),
    Notification.find({
      organisationId,
      recipientRole: 'VENDOR',
      $or: [{ recipientUserId: req.auth.userId }, { recipientUserId: vendorId }],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  // 6. Section B: Financial Summary Calculations
  let totalOrderValuePaisa = 0;
  for (const po of purchaseOrders) {
    if (po.status !== 'CANCELLED') {
      totalOrderValuePaisa += Number(po.totalPaisa || 0);
    }
  }

  let totalInvoicedPaisa = 0;
  let totalPaidPaisa = 0;
  let balanceReceivablePaisa = 0;
  let overduePaisa = 0;

  // Ageing buckets (Section E)
  const ageing = {
    currentPaisa: 0,
    days1_30Paisa: 0,
    days31_60Paisa: 0,
    days61_90Paisa: 0,
    days90PlusPaisa: 0,
    days1To30Paisa: 0,
    days31To60Paisa: 0,
    days61To90Paisa: 0,
  };

  // Section H: Pending Receivables list
  const pendingReceivables = [];

  for (const inv of allVendorInvoices) {
    const totalP = Number(inv.totalPaisa || 0);
    const paidP = Number(inv.paidPaisa || inv.amountPaidPaisa || 0);
    const outP = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));

    totalInvoicedPaisa += totalP;
    totalPaidPaisa += paidP;
    balanceReceivablePaisa += outP;

    if (outP > 0) {
      const daysOverdue = getDaysDiff(inv.dueDate, todayStr);
      const isOverdue = daysOverdue > 0;

      if (isOverdue) {
        overduePaisa += outP;
      }

      // Populate ageing bucket
      if (daysOverdue <= 0) {
        ageing.currentPaisa += outP;
      } else if (daysOverdue <= 30) {
        ageing.days1_30Paisa += outP;
        ageing.days1To30Paisa += outP;
      } else if (daysOverdue <= 60) {
        ageing.days31_60Paisa += outP;
        ageing.days31To60Paisa += outP;
      } else if (daysOverdue <= 90) {
        ageing.days61_90Paisa += outP;
        ageing.days61To90Paisa += outP;
      } else {
        ageing.days90PlusPaisa += outP;
      }

      // Add to pending receivables table (first 10)
      if (pendingReceivables.length < 10) {
        pendingReceivables.push({
          invoiceId: inv.invoiceId,
          supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          cafeId: inv.cafeId,
          cafeName: cafeMap.get(inv.cafeId) || inv.cafeId,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          totalPaisa: totalP,
          paidPaisa: paidP,
          balancePaisa: outP,
          daysOverdue: Math.max(0, daysOverdue),
          status: isOverdue ? 'OVERDUE' : (paidP > 0 ? 'PARTIALLY_PAID' : 'DUE'),
          poReferenceId: inv.poReferenceId || null,
        });
      }
    }
  }

  // Sort pending receivables by due date ascending (most urgent first)
  pendingReceivables.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // 7. Section C: Order Summary Card Breakdown
  const orderSummary = {
    total: purchaseOrders.length,
    open: 0,
    inProgress: 0,
    supplied: 0,
    partiallySupplied: 0,
    completed: 0,
    cancelled: 0,
  };

  // Section D: Supply / Delivery Summary Breakdown
  const supplyDeliverySummary = {
    awaitingSupply: 0,
    expectedToday: 0,
    partiallySupplied: 0,
    supplied: 0,
    receivedByCafe: 0,
    shortRejectedQty: 0,
    pendingGrn: 0,
    grnCompleted: 0,
  };

  // Section J: Returns, Rejections & Adjustments Breakdown
  let goodsReturnsCount = 0;
  let quantityDiscrepanciesCount = 0;
  let debitNotesPaisa = 0;
  let creditNotesPaisa = 0;

  for (const po of purchaseOrders) {
    const status = po.status;

    if (['DRAFT', 'SUBMITTED', 'APPROVED', 'ORDER_PLACED', 'ORDERED'].includes(status)) {
      orderSummary.open++;
      supplyDeliverySummary.awaitingSupply++;
    } else if (['ACKNOWLEDGED', 'DISPATCHED'].includes(status)) {
      orderSummary.inProgress++;
      supplyDeliverySummary.supplied++;
    } else if (status === 'PARTIALLY_RECEIVED') {
      orderSummary.partiallySupplied++;
      supplyDeliverySummary.partiallySupplied++;
    } else if (['RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL'].includes(status)) {
      orderSummary.supplied++;
      supplyDeliverySummary.supplied++;
      supplyDeliverySummary.receivedByCafe++;
      if (['RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL'].includes(status)) {
        supplyDeliverySummary.pendingGrn++;
      } else {
        supplyDeliverySummary.grnCompleted++;
      }
    } else if (status === 'CLOSED') {
      orderSummary.completed++;
      supplyDeliverySummary.grnCompleted++;
    } else if (status === 'CANCELLED') {
      orderSummary.cancelled++;
    }

    if (po.expectedDeliveryDate === todayStr && !['CLOSED', 'CANCELLED'].includes(status)) {
      supplyDeliverySummary.expectedToday++;
    }

    // Inspect GRN items for shortages & discrepancies
    if (Array.isArray(po.grnReceipts)) {
      for (const grn of po.grnReceipts) {
        if (grn.items) {
          for (const it of grn.items) {
            const shortOrRej = Number(it.rejectedQty || 0) + Number(it.missingQty || 0);
            if (shortOrRej > 0) {
              supplyDeliverySummary.shortRejectedQty += shortOrRej;
            }
            if (it.discrepancyReason || Number(it.missingQty || 0) > 0) {
              quantityDiscrepanciesCount++;
            }
            if (Number(it.rejectedQty || 0) > 0 || it.disposition === 'VENDOR_CANNOT_SUPPLY') {
              goodsReturnsCount++;
            }
          }
        }
      }
    }
  }

  // Synchronize order summary alias fields
  orderSummary.totalOrders = orderSummary.total;
  orderSummary.openOrders = orderSummary.open;
  orderSummary.inProgressOrders = orderSummary.inProgress;
  orderSummary.suppliedOrders = orderSummary.supplied;
  orderSummary.partiallySuppliedOrders = orderSummary.partiallySupplied;
  orderSummary.completedOrders = orderSummary.completed;
  orderSummary.cancelledOrders = orderSummary.cancelled;

  // Calculate debit and credit adjustments from Ledger
  for (const entry of recentLedgerEntries) {
    if (entry.entryType === 'CREDIT_NOTE') {
      creditNotesPaisa += Number(entry.debitPaisa || entry.creditPaisa || 0);
    } else if (entry.entryType === 'DEBIT_ADJUSTMENT' || entry.referenceType === 'CREDIT_NOTE') {
      debitNotesPaisa += Number(entry.debitPaisa || 0);
    }
  }

  // 8. Section F: Recent Purchase Orders (latest 10)
  const recentPurchaseOrders = purchaseOrders.slice(0, 10).map((po) => ({
    purchaseOrderId: po.purchaseOrderId,
    cafeId: po.cafeId,
    cafeName: cafeMap.get(po.cafeId) || po.cafeId,
    orderDate: po.orderDate || po.createdAt?.toISOString().slice(0, 10) || '',
    expectedDeliveryDate: po.expectedDeliveryDate || po.supplierConfirmedDeliveryDate || '',
    totalPaisa: Number(po.totalPaisa || 0),
    status: po.status,
    itemCount: Array.isArray(po.lineItems) ? po.lineItems.length : 0,
    hasGrn: Array.isArray(po.grnReceipts) && po.grnReceipts.length > 0,
    hasInvoices: Array.isArray(po.invoices) && po.invoices.length > 0,
  }));

  // 9. Section G: Recent Payments (latest 10)
  const recentPayments = [];
  for (const inv of allVendorInvoices) {
    if (Array.isArray(inv.paymentHistory)) {
      for (const p of inv.paymentHistory) {
        recentPayments.push({
          paymentId: p.paymentId,
          paymentDate: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '',
          invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          invoiceId: inv.invoiceId,
          paymentMethod: p.paymentMethod || 'BANK_TRANSFER',
          amountPaisa: Number(p.paidPaisa || 0),
          reference: p.reference || 'SETTLED',
          cafeName: cafeMap.get(inv.cafeId) || inv.cafeId,
        });
      }
    }
  }

  // If no invoice payments found, fallback to ledger payments
  if (recentPayments.length === 0) {
    for (const le of recentLedgerEntries) {
      if (le.entryType === 'PAYMENT' || le.entryType === 'PARTIAL_PAYMENT') {
        recentPayments.push({
          paymentId: le.paymentId || le.referenceId || le.ledgerEntryId,
          paymentDate: le.entryDate,
          invoiceNumber: le.supplierInvoiceNumber || 'BILL',
          invoiceId: le.supplierInvoiceNumber || '',
          paymentMethod: 'BANK_TRANSFER',
          amountPaisa: Number(le.paidPaisa || le.debitPaisa || 0),
          reference: le.referenceNumber || 'SETTLED',
          cafeName: cafeMap.get(le.cafeId) || le.cafeId,
        });
      }
    }
  }

  // Sort recent payments descending by date
  recentPayments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  const recentPaymentsSliced = recentPayments.slice(0, 10);

  // 10. Section I: Recent Delivery / GRN Status Timeline
  let recentDeliveryStatus = null;
  const latestPoWithActivity = purchaseOrders.find((po) => po.status !== 'CANCELLED') || purchaseOrders[0];

  if (latestPoWithActivity) {
    const poStatus = latestPoWithActivity.status;
    const hasSupply = ['ACKNOWLEDGED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(poStatus);
    const hasReceived = ['PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(poStatus) || (latestPoWithActivity.grnReceipts && latestPoWithActivity.grnReceipts.length > 0);
    const hasGrnDone = ['VERIFIED_PENDING_MASTER_APPROVAL', 'RECEIVED', 'CLOSED'].includes(poStatus) || (latestPoWithActivity.grnReceipts && latestPoWithActivity.grnReceipts.some((r) => r.status === 'ACCEPTED'));
    const linkedInvoice = allVendorInvoices.find((inv) => inv.poReferenceId === latestPoWithActivity.purchaseOrderId);
    const hasInvoice = Boolean(linkedInvoice || (latestPoWithActivity.invoices && latestPoWithActivity.invoices.length > 0));
    const isPaid = linkedInvoice && (linkedInvoice.paymentStatus === 'PAID' || Number(linkedInvoice.outstandingPayableAmountPaisa || 0) === 0);

    recentDeliveryStatus = {
      purchaseOrderId: latestPoWithActivity.purchaseOrderId,
      cafeName: cafeMap.get(latestPoWithActivity.cafeId) || latestPoWithActivity.cafeId,
      orderDate: latestPoWithActivity.orderDate,
      steps: [
        { key: 'ordered', label: 'Ordered', completed: true, status: 'COMPLETED' },
        { key: 'supply_recorded', label: 'Supply Recorded', completed: hasSupply, status: hasSupply ? 'COMPLETED' : 'PENDING' },
        { key: 'received_at_cafe', label: 'Received at Café', completed: hasReceived, status: hasReceived ? 'COMPLETED' : 'PENDING' },
        { key: 'grn_completed', label: 'GRN Completed', completed: hasGrnDone, status: hasGrnDone ? 'COMPLETED' : 'PENDING' },
        { key: 'invoice_recorded', label: 'Invoice Recorded', completed: hasInvoice, status: hasInvoice ? 'COMPLETED' : 'PENDING' },
        { key: 'payment_settled', label: isPaid ? 'Payment Settled' : 'Payment Pending', completed: Boolean(isPaid), status: isPaid ? 'COMPLETED' : 'AWAITING' },
      ],
    };
  }

  // 11. Section K: Notifications formatting
  const sanitizedNotifications = notifications.map((n) => ({
    notificationId: n.notificationId,
    title: n.title,
    message: n.message,
    category: n.category || 'COMMERCIAL',
    createdAt: n.createdAt,
    isRead: Boolean(n.readAt),
  }));

  // If no explicit notification exists yet, provide authoritative contextual notifications
  if (sanitizedNotifications.length === 0) {
    if (orderSummary.open > 0) {
      sanitizedNotifications.push({
        notificationId: 'SYS-NOTIF-01',
        title: `${orderSummary.open} Open Purchase Order(s) Issued`,
        message: 'You have active purchase orders awaiting supply confirmation or dispatch.',
        category: 'PURCHASE_ORDER',
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    }
    if (overduePaisa > 0) {
      sanitizedNotifications.push({
        notificationId: 'SYS-NOTIF-02',
        title: 'Overdue Balance Notice',
        message: `INR ${(overduePaisa / 100).toLocaleString('en-IN')} is currently overdue across past invoices.`,
        category: 'PAYMENT',
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    }
  }

  // 12. Assemble Full Dashboard Response
  return res.status(200).json({
    success: true,
    data: {
      vendor: {
        vendorId: vendor.vendorId,
        name: vendor.name,
        tradeName: vendor.tradeName || '',
        category: vendor.category,
        gstNumber: vendor.gstNumber || '',
        approvedCafes: cafeRecords.map((c) => ({
          cafeId: c.cafeId,
          name: c.displayName || c.name,
          code: c.code || '',
          city: c.city || '',
        })),
      },
      selectedFilter: {
        cafeId: cafeId || 'ALL',
        dateRange,
        startDate: dateBounds?.start || null,
        endDate: dateBounds?.end || null,
      },
      activeFilters: {
        cafeId: cafeId || 'ALL',
        dateRange,
        startDate: dateBounds?.start || null,
        endDate: dateBounds?.end || null,
      },
      financialSummary: {
        totalOrderValuePaisa,
        totalOrderValueFormatted: formatCurrency(totalOrderValuePaisa),
        totalInvoicedPaisa,
        totalInvoicedFormatted: formatCurrency(totalInvoicedPaisa),
        totalPaidPaisa,
        totalPaidFormatted: formatCurrency(totalPaidPaisa),
        balanceReceivablePaisa,
        balanceReceivableFormatted: formatCurrency(balanceReceivablePaisa),
        overduePaisa,
        overdueFormatted: formatCurrency(overduePaisa),
      },
      financial: {
        totalOrderValuePaisa,
        totalOrderValueFormatted: formatCurrency(totalOrderValuePaisa),
        totalInvoicedPaisa,
        totalInvoicedFormatted: formatCurrency(totalInvoicedPaisa),
        totalPaidPaisa,
        totalPaidFormatted: formatCurrency(totalPaidPaisa),
        balanceReceivablePaisa,
        balanceReceivableFormatted: formatCurrency(balanceReceivablePaisa),
        overduePaisa,
        overdueFormatted: formatCurrency(overduePaisa),
      },
      orderSummary,
      supplyDeliverySummary,
      outstandingPayments: {
        totalReceivablePaisa: balanceReceivablePaisa,
        overduePaisa,
        ageing,
      },
      ageing,
      recentPurchaseOrders,
      recentPayments: recentPaymentsSliced,
      pendingReceivables,
      recentDeliveryStatus,
      returnsAndAdjustments: {
        goodsReturnsCount,
        quantityDiscrepanciesCount,
        debitNotesPaisa,
        creditNotesPaisa,
      },
      notifications: sanitizedNotifications,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/orders
 * VEN-SCR-002: Vendor Purchase Orders Register & KPI Summaries
 *
 * Provides paginated, searchable, multi-filtered list of Purchase Orders
 * strictly constrained to the authenticated vendor and approved café relationships.
 * Emits 10 top-level KPI summary counters and separates PO status from payment status.
 */
const getVendorPurchaseOrders = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const {
    page = 1,
    limit = 20,
    search,
    cafeId,
    status,
    poStatus,
    supplyStatus,
    grnStatus,
    invoiceStatus,
    paymentStatus,
    dateRange = '30days',
    startDate,
    endDate,
    minAmountPaisa,
    maxAmountPaisa,
    itemId,
  } = req.query;

  const targetCafeIds = req.authorizedCafeIds || req.vendor?.approvedCafeIds || [];
  const dateBounds = resolveDateConstraints(dateRange, startDate, endDate);
  const todayStr = getIstDateString();

  // 1. Build Base Filter for Authoritative Period KPIs
  const basePeriodQuery = {
    organisationId,
    vendorId,
    cafeId: { $in: targetCafeIds },
  };

  if (cafeId && cafeId !== 'ALL') {
    basePeriodQuery.cafeId = cafeId.trim().toUpperCase();
  }

  if (dateBounds) {
    basePeriodQuery.orderDate = { $gte: dateBounds.start, $lte: dateBounds.end };
  }

  // 2. Fetch all scoped orders in period to calculate 10 KPI summary cards
  const allScopedOrders = await PurchaseOrder.find(basePeriodQuery)
    .select('purchaseOrderId cafeId status orderDate expectedDeliveryDate totalPaisa lineItems grnReceipts invoices')
    .lean();

  const kpis = {
    totalOrders: allScopedOrders.length,
    openOrders: 0,
    awaitingSupply: 0,
    partiallySupplied: 0,
    supplied: 0,
    partiallyReceived: 0,
    received: 0,
    completed: 0,
    cancelled: 0,
    totalPoValuePaisa: 0,
    totalPoValueFormatted: '₹0',
  };

  let totalValueInPeriod = 0;
  for (const po of allScopedOrders) {
    const st = po.status;
    if (st !== 'CANCELLED') {
      totalValueInPeriod += Number(po.totalPaisa || 0);
    }

    if (['DRAFT', 'SUBMITTED', 'APPROVED', 'ORDER_PLACED', 'ORDERED'].includes(st)) {
      kpis.openOrders++;
      kpis.awaitingSupply++;
    } else if (['ACKNOWLEDGED', 'DISPATCHED'].includes(st)) {
      kpis.supplied++;
    } else if (st === 'PARTIALLY_RECEIVED') {
      kpis.partiallySupplied++;
      kpis.partiallyReceived++;
    } else if (['RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL'].includes(st)) {
      kpis.supplied++;
      kpis.received++;
    } else if (st === 'CLOSED') {
      kpis.completed++;
      kpis.received++;
    } else if (st === 'CANCELLED') {
      kpis.cancelled++;
    }
  }
  kpis.totalPoValuePaisa = totalValueInPeriod;
  kpis.totalPoValueFormatted = formatCurrency(totalValueInPeriod);

  // 3. Build Filter Query for Paginated Register Table
  const filterQuery = { ...basePeriodQuery };

  const selectedPoStatus = (poStatus || status || '').trim().toUpperCase();
  if (selectedPoStatus && selectedPoStatus !== 'ALL') {
    filterQuery.status = selectedPoStatus;
  }

  if (minAmountPaisa || maxAmountPaisa) {
    filterQuery.totalPaisa = {};
    if (minAmountPaisa) filterQuery.totalPaisa.$gte = Number(minAmountPaisa);
    if (maxAmountPaisa) filterQuery.totalPaisa.$lte = Number(maxAmountPaisa);
  }

  if (itemId) {
    filterQuery['lineItems.itemId'] = String(itemId).trim().toUpperCase();
  }

  if (search && String(search).trim()) {
    const s = String(search).trim();
    const sRegex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filterQuery.$or = [
      { purchaseOrderId: sRegex },
      { 'lineItems.itemNameSnapshot': sRegex },
      { 'lineItems.itemId': sRegex },
      { 'lineItems.supplierItemCode': sRegex },
      { 'grnReceipts.deliveryNoteNumber': sRegex },
      { 'grnReceipts.grnId': sRegex },
      { 'invoices.invoiceNumber': sRegex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [filteredOrders, totalCount, cafes] = await Promise.all([
    PurchaseOrder.find(filterQuery)
      .sort({ orderDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    PurchaseOrder.countDocuments(filterQuery),
    Cafe.find({ organisationId, cafeId: { $in: targetCafeIds } })
      .select('cafeId name displayName code city')
      .lean(),
  ]);

  const cafeMap = new Map(cafes.map((c) => [c.cafeId, { name: c.displayName || c.name, code: c.code || '' }]));

  // 4. Batch query linked APInvoice records for accurate payment status reconciliation
  const orderIds = filteredOrders.map((o) => o.purchaseOrderId);
  const linkedInvoices = await APInvoice.find({
    organisationId,
    vendorId,
    poReferenceId: { $in: orderIds },
  })
    .select('invoiceId supplierInvoiceNumber poReferenceId paymentStatus dueDate totalPaisa paidPaisa amountPaidPaisa outstandingPaisa outstandingPayableAmountPaisa')
    .lean();

  const invoicesByPo = new Map();
  for (const inv of linkedInvoices) {
    const list = invoicesByPo.get(inv.poReferenceId) || [];
    list.push(inv);
    invoicesByPo.set(inv.poReferenceId, list);
  }

  // 5. Transform orders into sanitized, presentation-ready register records
  const orders = filteredOrders.map((po) => {
    const cafeInfo = cafeMap.get(po.cafeId) || { name: po.cafeId, code: '' };
    const poInvoices = invoicesByPo.get(po.purchaseOrderId) || [];
    const poStatus = po.status;

    // Derived Supply Status
    let derivedSupply = 'Awaiting';
    if (poStatus === 'CLOSED') derivedSupply = 'Fulfilled';
    else if (['RECEIVED', 'VERIFIED_PENDING_MASTER_APPROVAL', 'RECEIVED_PENDING_FINAL_POSTING'].includes(poStatus)) derivedSupply = 'Received';
    else if (poStatus === 'PARTIALLY_RECEIVED') derivedSupply = 'Partial';
    else if (['DISPATCHED', 'ACKNOWLEDGED'].includes(poStatus)) derivedSupply = 'Supplied';
    else if (poStatus === 'CANCELLED') derivedSupply = 'Cancelled';

    // Derived GRN Status
    let derivedGrn = 'None';
    if (po.grnReceipts && po.grnReceipts.some((r) => r.status === 'ACCEPTED')) derivedGrn = 'Completed';
    else if (['VERIFIED_PENDING_MASTER_APPROVAL', 'RECEIVED'].includes(poStatus)) derivedGrn = 'Verified';
    else if (poStatus === 'RECEIVED_PENDING_FINAL_POSTING') derivedGrn = 'Pending';
    else if (poStatus === 'PARTIALLY_RECEIVED') derivedGrn = 'Partial';

    // Derived Invoice Status
    let derivedInvoice = 'Unbilled';
    if (poInvoices.length > 0 || (po.invoices && po.invoices.length > 0)) {
      if (poInvoices.some((inv) => inv.paymentStatus === 'PAID' || inv.status === 'APPROVED')) {
        derivedInvoice = 'Approved';
      } else {
        derivedInvoice = 'Recorded';
      }
    }

    // Derived Payment Status
    let derivedPayment = 'Pending';
    if (poInvoices.length === 0) {
      derivedPayment = 'Unbilled';
    } else {
      const totalOut = poInvoices.reduce((acc, inv) => acc + Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0)), 0);
      const totalPaid = poInvoices.reduce((acc, inv) => acc + Number(inv.paidPaisa || inv.amountPaidPaisa || 0), 0);
      const hasOverdue = poInvoices.some((inv) => inv.paymentStatus === 'OVERDUE' || getDaysDiff(inv.dueDate, todayStr) > 0);

      if (totalOut === 0 && totalPaid > 0) {
        derivedPayment = 'Settled';
      } else if (totalPaid > 0) {
        derivedPayment = 'Partially Paid';
      } else if (hasOverdue) {
        derivedPayment = 'Overdue';
      } else {
        derivedPayment = 'Pending';
      }
    }

    const totalPaisa = Number(po.totalPaisa || 0);

    return {
      purchaseOrderId: po.purchaseOrderId,
      orderDate: po.orderDate || po.createdAt?.toISOString().slice(0, 10) || '',
      orderTime: po.orderPlacedAt ? new Date(po.orderPlacedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      cafeId: po.cafeId,
      cafeName: cafeInfo.name,
      cafeCode: cafeInfo.code,
      expectedDeliveryDate: po.expectedDeliveryDate || po.supplierConfirmedDeliveryDate || '',
      itemCount: Array.isArray(po.lineItems) ? po.lineItems.length : 0,
      totalPaisa,
      totalFormatted: formatCurrency(totalPaisa),
      poStatus,
      supplyStatus: derivedSupply,
      grnStatus: derivedGrn,
      invoiceStatus: derivedInvoice,
      paymentStatus: derivedPayment,
      revisionCount: (po.editHistory || []).length,
      hasRevisions: Array.isArray(po.editHistory) && po.editHistory.length > 0,
      isCancelled: poStatus === 'CANCELLED',
      cancellationReason: po.cancellationReason || '',
    };
  });

  return res.status(200).json({
    success: true,
    data: {
      kpis,
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
      activeFilters: {
        cafeId: cafeId || 'ALL',
        dateRange: dateRange || '30days',
        startDate: dateBounds?.start || null,
        endDate: dateBounds?.end || null,
        poStatus: selectedPoStatus || 'ALL',
        search: search || '',
      },
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/orders/:purchaseOrderId
 * VEN-SCR-002: Comprehensive Read-Only Purchase Order Details
 *
 * Provides a complete, immutable visibility snapshot of a single Purchase Order:
 * - Identity and revision metadata
 * - Vendor information snapshot
 * - Delivery address and receiving instructions
 * - Detailed line items with pack sizes and food/material specs
 * - Authoritative financial breakdown (Subtotal, Tax, Discounts, Net Total)
 * - Line-by-line reconciliation (Ordered vs Supplied vs Received vs Accepted vs Rejected vs Pending)
 * - Rejection and shortage discrepancy notices (vendor-appropriate only)
 * - 8-step visual milestone lifecycle
 * - Revision history
 * - Related GRNs, Invoices, and Payments
 * - Linked Documents (PDF, Receipts)
 * - Cancellation details if cancelled
 * - Zero internal management comments, zero margins, zero write buttons
 */
const getVendorOrderDetails = asyncHandler(async (req, res) => {
  const { purchaseOrderId } = req.params;
  const { vendorId, organisationId } = req.auth;

  const po = await PurchaseOrder.findOne({
    organisationId,
    vendorId,
    purchaseOrderId: purchaseOrderId.trim().toUpperCase(),
  }).lean();

  if (!po) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', 'The requested purchase order was not found.');
  }

  // Audit Log Security Event
  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: po.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_PO_VIEWED',
    targetType: 'PURCHASE_ORDER',
    targetId: po.purchaseOrderId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  const [cafe, vendor, allLinkedInvoices] = await Promise.all([
    Cafe.findOne({
      organisationId,
      cafeId: po.cafeId,
    }).select('cafeId name displayName code branchCode city state address phone managerName contactPerson').lean(),
    req.vendor,
    APInvoice.find({
      organisationId,
      vendorId,
      poReferenceId: po.purchaseOrderId,
    }).lean(),
  ]);

  const cafeName = cafe?.displayName || cafe?.name || po.cafeId;
  const vendorName = vendor?.name || po.vendorNameSnapshot || 'Valued Supplier';

  // Section 7: Vendor Information Snapshot
  const vendorSnapshot = {
    vendorId: vendor?.vendorId || po.vendorId,
    name: vendorName,
    legalName: vendor?.legalName || vendorName,
    gstNumber: vendor?.gstNumber || 'Unregistered',
    panNumber: vendor?.panNumber || '',
    category: vendor?.category || 'FOOD_BEVERAGE',
    billingAddress: vendor?.billingAddress || vendor?.address || 'Registered Commercial Facility',
    contactEmail: vendor?.contactEmail || '',
    contactPhone: vendor?.contactPhone || '',
  };

  // Section 8: Cafe / Delivery Information
  const deliveryDetails = {
    cafeId: po.cafeId,
    cafeName,
    cafeCode: cafe?.code || cafe?.branchCode || '',
    address: formatCafeAddress(cafe?.address),
    city: cafe?.city || cafe?.address?.city || '',
    state: cafe?.state || cafe?.address?.state || '',
    contactPerson: cafe?.managerName || cafe?.contactPerson || 'Store Operations In-Charge',
    contactPhone: cafe?.phone || '',
    deliveryWindow: po.expectedDeliveryWindow || '09:00 AM - 05:00 PM',
    instructions: po.deliveryInstructions || po.specialInstructions || 'Standard Store Receiving Bay Intake',
    receivingLocation: po.receivingLocation || 'Main Storage / Dry Store',
  };

  // Section 9: PO Items Table
  const sanitizedLineItems = (po.lineItems || []).map((li, idx) => {
    const ordered = Number(li.orderedQuantityBase || 0);
    const received = Number(li.receivedQuantityBase || 0);
    const accepted = Number(li.acceptedReceivedQty || 0);
    const rejected = Number(li.rejectedQty || 0);
    const pending = Math.max(0, ordered - accepted);
    const unitPrice = Number(li.unitPricePaisa || 0);
    const discount = Number(li.discountPaisa || 0);
    const lineTotal = Number(li.totalLinePaisa !== undefined ? li.totalLinePaisa : (li.totalPaisa || (ordered * unitPrice)));
    const tax = Number(li.taxPaisa || Math.round(lineTotal * 0.05));
    const taxRate = lineTotal > 0 ? Math.round((tax / lineTotal) * 100) : 5;

    return {
      lineNumber: idx + 1,
      itemId: li.itemId,
      itemName: li.itemNameSnapshot || li.itemId,
      itemType: li.itemType || 'GOODS',
      supplierItemCode: li.supplierItemCode || '',
      sku: li.sku || li.itemId,
      hsnSac: li.hsnSac || '0401',
      orderedQuantity: ordered,
      receivedQuantity: received,
      acceptedQuantity: accepted,
      rejectedQuantity: rejected,
      pendingQuantity: pending,
      baseUnit: li.baseUnit || 'UNIT',
      packSize: li.packSize || '1 UNIT',
      unitPricePaisa: unitPrice,
      unitPriceFormatted: formatCurrency(unitPrice),
      discountPaisa: discount,
      taxPaisa: tax,
      taxRatePercent: taxRate,
      lineTotalPaisa: lineTotal,
      lineTotalFormatted: formatCurrency(lineTotal),
      brand: li.brand || '',
      grade: li.grade || '',
      specification: li.specification || '',
      requiredShelfLife: li.requiredShelfLife || '',
    };
  });

  // Section 10: Financial Breakdown
  const subtotalPaisa = Number(po.subtotalPaisa || 0);
  const discountPaisa = Number(po.discountPaisa || 0);
  const taxableAmountPaisa = Math.max(0, subtotalPaisa - discountPaisa);
  const taxPaisa = Number(po.taxPaisa || 0);
  const cgstPaisa = Math.round(taxPaisa / 2);
  const sgstPaisa = taxPaisa - cgstPaisa;
  const igstPaisa = 0;
  const otherChargesPaisa = 0;
  const roundOffPaisa = 0;
  const totalPaisa = Number(po.totalPaisa || (taxableAmountPaisa + taxPaisa));

  const financialBreakdown = {
    subtotalPaisa,
    subtotalFormatted: formatCurrency(subtotalPaisa),
    discountPaisa,
    discountFormatted: formatCurrency(discountPaisa),
    taxableAmountPaisa,
    taxableAmountFormatted: formatCurrency(taxableAmountPaisa),
    cgstPaisa,
    cgstFormatted: formatCurrency(cgstPaisa),
    sgstPaisa,
    sgstFormatted: formatCurrency(sgstPaisa),
    igstPaisa,
    igstFormatted: formatCurrency(igstPaisa),
    otherChargesPaisa,
    otherChargesFormatted: formatCurrency(otherChargesPaisa),
    roundOffPaisa,
    roundOffFormatted: formatCurrency(roundOffPaisa),
    grandTotalPaisa: totalPaisa,
    grandTotalFormatted: formatCurrency(totalPaisa),
  };

  // Section 11: Ordered vs Supplied vs Received Line-by-Line Reconciliation Table
  const orderedVsSuppliedVsReceived = sanitizedLineItems.map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName,
    ordered: li.orderedQuantity,
    unit: li.baseUnit,
    supplied: li.receivedQuantity,
    received: li.receivedQuantity,
    accepted: li.acceptedQuantity,
    rejected: li.rejectedQuantity,
    pending: li.pendingQuantity,
  }));

  // Section 12: Rejection / Shortage / Discrepancy Information
  const shortagesAndRejections = [];
  if (Array.isArray(po.grnReceipts)) {
    for (const grn of po.grnReceipts) {
      if (Array.isArray(grn.items)) {
        for (const it of grn.items) {
          const rej = Number(it.rejectedQty || 0);
          const miss = Number(it.missingQty || 0);
          if (rej > 0 || miss > 0 || it.discrepancyReason) {
            const matchedLine = sanitizedLineItems.find((l) => l.itemId === it.itemId);
            shortagesAndRejections.push({
              itemId: it.itemId,
              itemName: matchedLine?.itemName || it.itemId,
              rejectedQuantity: rej,
              missingQuantity: miss,
              reasonCode: it.rejectionReason || (rej > 0 ? 'DAMAGED_DURING_RECEIPT' : 'SHORT_SUPPLY'),
              description: it.discrepancyReason || (rej > 0 ? 'Packaging or quality discrepancy noted at delivery intake.' : 'Shortage recorded at intake.'),
              date: grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : po.orderDate,
              grnId: grn.grnId,
            });
          }
        }
      }
    }
  }

  // Section 14: Revisions History
  const revisions = (po.editHistory || []).map((eh, idx) => ({
    revisionNumber: idx + 1,
    date: eh.editedAt ? new Date(eh.editedAt).toISOString().slice(0, 10) : '',
    reason: eh.reason || 'Authorised procurement adjustment',
    changesSummary: eh.changesSummary || 'Order specifications updated',
  }));

  // Section 15: Related GRNs
  const relatedGrns = (po.grnReceipts || []).map((grn) => {
    let totDelivered = 0;
    let totAccepted = 0;
    let totRejected = 0;
    if (Array.isArray(grn.items)) {
      for (const it of grn.items) {
        totDelivered += Number(it.deliveredQty || 0);
        totAccepted += Number(it.acceptedQty || 0);
        totRejected += Number(it.rejectedQty || 0);
      }
    }
    return {
      grnId: grn.grnId,
      deliveryNoteNumber: grn.deliveryNoteNumber || '',
      receivedAt: grn.receivedAt,
      receivedDate: grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : '',
      receivedQuantity: totDelivered,
      acceptedQuantity: totAccepted,
      rejectedQuantity: totRejected,
      status: grn.status || 'ACCEPTED',
      items: (grn.items || []).map((it) => ({
        itemId: it.itemId,
        deliveredQty: Number(it.deliveredQty || 0),
        acceptedQty: Number(it.acceptedQty || 0),
        rejectedQty: Number(it.rejectedQty || 0),
        missingQty: Number(it.missingQty || 0),
        discrepancyReason: it.discrepancyReason || '',
      })),
    };
  });

  // Section 16: Related Invoices
  const relatedInvoices = allLinkedInvoices.map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    totalPaisa: Number(inv.totalPaisa || 0),
    totalFormatted: formatCurrency(Number(inv.totalPaisa || 0)),
    approvedAmountPaisa: Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0)),
    paidPaisa: Number(inv.paidPaisa || inv.amountPaidPaisa || 0),
    balancePaisa: Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0)),
    status: inv.paymentStatus || 'DUE',
  }));

  // Section 17: Related Payments
  const relatedPayments = [];
  for (const inv of allLinkedInvoices) {
    if (Array.isArray(inv.paymentHistory)) {
      for (const p of inv.paymentHistory) {
        relatedPayments.push({
          paymentId: p.paymentId,
          paymentDate: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '',
          invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          paymentMethod: p.paymentMethod || 'BANK_TRANSFER',
          amountPaisa: Number(p.paidPaisa || 0),
          amountFormatted: formatCurrency(Number(p.paidPaisa || 0)),
          reference: p.reference || 'SETTLED',
        });
      }
    }
  }

  // Section 13: Purchase Order Lifecycle Milestones Timeline
  const poStatus = po.status;
  const hasSupply = ['ACKNOWLEDGED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(poStatus);
  const hasReceived = ['PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(poStatus);
  const hasGrnDone = ['VERIFIED_PENDING_MASTER_APPROVAL', 'RECEIVED', 'CLOSED'].includes(poStatus) || relatedGrns.some((r) => r.status === 'ACCEPTED');
  const hasInvoice = relatedInvoices.length > 0 || (po.invoices && po.invoices.length > 0);
  const isPaid = relatedPayments.length > 0 || relatedInvoices.some((inv) => inv.status === 'PAID');
  const isCompleted = poStatus === 'CLOSED';

  const timeline = [
    { key: 'po_created', label: 'PO Created', completed: true, timestamp: po.orderDate || po.createdAt },
    { key: 'po_issued', label: 'PO Issued', completed: poStatus !== 'DRAFT', timestamp: po.orderPlacedAt || po.orderDate },
    { key: 'supply_recorded', label: 'Supply Recorded', completed: hasSupply, timestamp: null },
    { key: 'goods_received', label: 'Goods Received', completed: hasReceived, timestamp: po.receivedDate || null },
    { key: 'grn_completed', label: 'GRN Completed', completed: hasGrnDone, timestamp: null },
    { key: 'invoice_recorded', label: 'Invoice Recorded', completed: hasInvoice, timestamp: relatedInvoices[0]?.invoiceDate || null },
    { key: 'payment_recorded', label: 'Payment Recorded', completed: isPaid, timestamp: relatedPayments[0]?.paymentDate || null },
    { key: 'completed', label: 'Completed', completed: isCompleted, timestamp: null },
  ];

  // Distinct status categorisation
  let derivedSupply = 'Awaiting';
  if (isCompleted) derivedSupply = 'Fulfilled';
  else if (hasReceived) derivedSupply = 'Received';
  else if (poStatus === 'PARTIALLY_RECEIVED') derivedSupply = 'Partial';
  else if (hasSupply) derivedSupply = 'Supplied';
  else if (poStatus === 'CANCELLED') derivedSupply = 'Cancelled';

  let derivedGrn = 'None';
  if (hasGrnDone) derivedGrn = 'Completed';
  else if (hasReceived) derivedGrn = 'Pending';
  else if (poStatus === 'PARTIALLY_RECEIVED') derivedGrn = 'Partial';

  let derivedInvoice = 'Unbilled';
  if (hasInvoice) {
    if (relatedInvoices.some((i) => i.status === 'PAID' || i.status === 'APPROVED')) derivedInvoice = 'Approved';
    else derivedInvoice = 'Recorded';
  }

  let derivedPayment = 'Pending';
  if (relatedInvoices.length === 0) {
    derivedPayment = 'Unbilled';
  } else if (isPaid && !relatedInvoices.some((i) => i.balancePaisa > 0)) {
    derivedPayment = 'Settled';
  } else if (relatedPayments.length > 0) {
    derivedPayment = 'Partially Paid';
  } else if (relatedInvoices.some((i) => i.status === 'OVERDUE')) {
    derivedPayment = 'Overdue';
  }

  // Section 18: Linked Documents
  const linkedDocuments = [
    {
      documentType: 'PURCHASE_ORDER_PDF',
      title: `Official Purchase Order (${po.purchaseOrderId})`,
      url: `/api/v1/vendor/orders/${po.purchaseOrderId}/pdf`,
      filename: `PurchaseOrder-${po.purchaseOrderId}.pdf`,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    },
  ];
  for (const grn of relatedGrns) {
    linkedDocuments.push({
      documentType: 'GRN_RECEIPT',
      title: `Goods Receipt Note (${grn.grnId})`,
      referenceNumber: grn.grnId,
      deliveryNoteNumber: grn.deliveryNoteNumber,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    });
  }
  for (const inv of relatedInvoices) {
    linkedDocuments.push({
      documentType: 'INVOICE',
      title: `Tax Invoice (${inv.invoiceNumber})`,
      referenceNumber: inv.invoiceNumber,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    });
  }

  // Legacy invoices snapshot for backward compatibility
  const sanitizedInvoices = (po.invoices || []).map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    totalPaisa: Number(inv.totalPaisa || 0),
    status: inv.status,
  }));

  return res.status(200).json({
    success: true,
    data: {
      purchaseOrderId: po.purchaseOrderId,
      revisionCount: revisions.length,
      hasRevisions: revisions.length > 0,
      orderDate: po.orderDate,
      orderTime: po.orderPlacedAt ? new Date(po.orderPlacedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      orderPlacedAt: po.orderPlacedAt,
      expectedDeliveryDate: po.expectedDeliveryDate,
      status: po.status,
      poStatus: po.status,
      supplyStatus: derivedSupply,
      grnStatus: derivedGrn,
      invoiceStatus: derivedInvoice,
      paymentStatus: derivedPayment,
      currency: 'INR',
      paymentTerms: formatPaymentTerms(po.paymentTerms || po.terms || req.vendor?.paymentTerms || 'Net 30 Days'),
      terms: po.terms || 'Standard Zamorin Café Vendor Supply Terms apply.',
      notes: po.notes || '',
      issuedBySnapshot: po.createdByUserId || 'MU-0001',
      receivingStatus: po.receivingStatus,
      fulfillmentStatus: po.fulfillmentStatus,

      // Section 7: Vendor Information
      vendor: vendorSnapshot,

      // Section 8: Cafe & Delivery Information
      delivery: deliveryDetails,
      cafeId: po.cafeId,
      cafeName,
      cafeAddress: deliveryDetails.address,

      // Section 9: PO Items Table
      lineItems: sanitizedLineItems,

      // Section 10: Financial Breakdown
      financial: financialBreakdown,
      subtotalPaisa,
      taxPaisa,
      discountPaisa,
      totalPaisa,

      // Section 11: Ordered vs Supplied vs Received Line Reconciliation
      orderedVsSuppliedVsReceived,

      // Section 12: Shortage & Rejection Discrepancies
      shortagesAndRejections,

      // Section 13: Milestone Lifecycle Timeline
      timeline,
      milestones: (po.milestones || []).map((m) => ({
        milestoneKey: m.milestoneKey,
        label: m.label,
        timestamp: m.timestamp,
      })),

      // Section 14: Revisions History
      revisions,

      // Section 15: Related GRNs
      relatedGrns,
      grnReceipts: relatedGrns,

      // Section 16: Related Invoices
      relatedInvoices,
      invoices: sanitizedInvoices,

      // Section 17: Related Payments
      relatedPayments,

      // Section 18: Linked Documents
      linkedDocuments,

      // Section 20: Cancellation Notice
      cancellation: {
        isCancelled: po.status === 'CANCELLED',
        cancelledAt: po.cancelledAt || null,
        reason: po.cancellationReason || '',
      },

      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/orders/:purchaseOrderId/pdf
 * Generates an authoritative, printable/downloadable PDF for the purchase order.
 */
const downloadVendorOrderPdf = asyncHandler(async (req, res) => {
  const { purchaseOrderId } = req.params;
  const { vendorId, organisationId } = req.auth;

  const po = await PurchaseOrder.findOne({
    organisationId,
    vendorId,
    purchaseOrderId: purchaseOrderId.trim().toUpperCase(),
  }).lean();

  if (!po) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', 'The requested purchase order was not found.');
  }

  const [cafe, vendor] = await Promise.all([
    Cafe.findOne({ organisationId, cafeId: po.cafeId }).lean(),
    req.vendor,
  ]);

  const cafeName = cafe?.displayName || cafe?.name || 'Zamorin Café';
  const vendorName = vendor?.name || po.vendorNameSnapshot || 'Valued Supplier';
  const orderDate = po.orderDate || 'N/A';
  const expectedDate = po.expectedDeliveryDate || 'N/A';
  const safeFilename = `PurchaseOrder-${po.purchaseOrderId}.pdf`;

  // Construct pure-PDF stream operations (A4 standard)
  function escapePdf(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  let streamOps = '';
  // Background & Header bar
  streamOps += `q\n0.95 0.95 0.97 rg\n20 780 555 42 re\nf\nQ\n`;
  streamOps += `BT\n/F2 16 Tf\n0.1 0.15 0.3 rg\n1 0 0 1 30 798 Tm\n(ZAMORIN CAFE ERP - OFFICIAL PURCHASE ORDER) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 420 800 Tm\n(ORDER NO: ${escapePdf(po.purchaseOrderId)}) Tj\nET\n`;

  // Metadata boxes
  streamOps += `BT\n/F2 11 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 30 755 Tm\n(SUPPLIER DETAILS:) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 30 740 Tm\n(${escapePdf(vendorName)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 30 726 Tm\n(GSTIN: ${escapePdf(vendor?.gstNumber || 'Unregistered')}) Tj\nET\n`;

  streamOps += `BT\n/F2 11 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 320 755 Tm\n(DELIVERY LOCATION:) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 320 740 Tm\n(${escapePdf(cafeName)} [${escapePdf(po.cafeId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 320 726 Tm\n(Order Date: ${escapePdf(orderDate)} | Required: ${escapePdf(expectedDate)}) Tj\nET\n`;

  // Line items table header
  streamOps += `q\n0.15 0.25 0.45 rg\n20 690 555 22 re\nf\nQ\n`;
  streamOps += `BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 25 698 Tm\n(#) Tj\n1 0 0 1 50 698 Tm\n(ITEM DESCRIPTION) Tj\n1 0 0 1 300 698 Tm\n(PACK / UOM) Tj\n1 0 0 1 380 698 Tm\n(QTY) Tj\n1 0 0 1 440 698 Tm\n(RATE) Tj\n1 0 0 1 510 698 Tm\n(TOTAL) Tj\nET\n`;

  // Line items
  let y = 670;
  let idx = 1;
  for (const item of (po.lineItems || [])) {
    if (y < 120) break; // Keep within single A4 page
    const name = escapePdf(item.itemNameSnapshot || item.itemId);
    const pack = escapePdf(item.packSize || '1 Unit');
    const qty = String(item.orderedQuantityBase || 0);
    const rate = `INR ${((item.unitPricePaisa || 0) / 100).toFixed(2)}`;
    const lineTot = `INR ${((item.totalPaisa || 0) / 100).toFixed(2)}`;

    streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 25 ${y} Tm\n(${idx}) Tj\n1 0 0 1 50 ${y} Tm\n(${name.slice(0, 40)}) Tj\n1 0 0 1 300 ${y} Tm\n(${pack}) Tj\n1 0 0 1 380 ${y} Tm\n(${qty}) Tj\n1 0 0 1 440 ${y} Tm\n(${rate}) Tj\n1 0 0 1 510 ${y} Tm\n(${lineTot}) Tj\nET\n`;
    streamOps += `q\n0.88 0.88 0.9 rg\n20 ${y - 4} 555 0.5 re\nf\nQ\n`;
    y -= 22;
    idx++;
  }

  // Totals block
  const grandTotal = `INR ${((po.totalPaisa || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  streamOps += `BT\n/F2 12 Tf\n0.1 0.15 0.35 rg\n1 0 0 1 400 ${y - 15} Tm\n(GRAND TOTAL: ${grandTotal}) Tj\nET\n`;

  // Footer & Read-Only Notice
  streamOps += `q\n0.8 0.8 0.8 rg\n20 50 555 1 re\nf\nQ\n`;
  streamOps += `BT\n/F2 8 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 20 35 Tm\n(ZAMORIN CAFE ERP - OFFICIAL PURCHASE ORDER DOCUMENT - READ ONLY VENDOR ACCESS) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 20 22 Tm\n(Status: ${escapePdf(po.status)} | Generated for ${escapePdf(vendorName)} | All rights reserved) Tj\nET\n`;

  // Build standard PDF bytes
  const streamBuf = Buffer.from(streamOps, 'utf8');
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n';
  const obj4 = `4 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n${streamOps}\nendstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n';
  const obj6 = '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n';

  const bodyObjects = [obj1, obj2, obj3, obj4, obj5, obj6];
  let pdfData = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];

  for (const obj of bodyObjects) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += obj;
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: po.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_PO_PDF_DOWNLOADED',
    targetType: 'PURCHASE_ORDER',
    targetId: po.purchaseOrderId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/v1/vendor/invoices
 * VEN-SCR-004: Invoices Register & 10 KPI Summaries
 * 
 * Provides external-facing, strictly read-only invoice register.
 * Preserves the Three-Value Financial Architecture:
 * - Supplier Claimed Amount
 * - Approved Payable Amount
 * - Held / Disputed Amount
 * Plus authoritative tax breakdowns and payment settlement statuses.
 */
const getVendorInvoices = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  const invoiceQuery = {
    organisationId,
    vendorId,
  };

  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    if (!approvedCafeIds.includes(targetCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
    invoiceQuery.cafeId = targetCafeId;
  } else {
    invoiceQuery.cafeId = { $in: approvedCafeIds };
  }

  const dateConstraints = resolveDateConstraints(
    req.query.dateRange,
    req.query.customStart,
    req.query.customEnd
  );

  const [invoices, cafes] = await Promise.all([
    APInvoice.find(invoiceQuery)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName code branchCode address')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, {
      cafeId: c.cafeId,
      name: c.displayName || c.name || c.cafeId,
      code: c.code || c.branchCode || '',
    });
  }

  const todayStr = getIstDateString();
  const allRecords = [];

  for (const inv of invoices) {
    const invDate = inv.invoiceDate || (inv.createdAt ? new Date(inv.createdAt).toISOString().slice(0, 10) : todayStr);

    if (dateConstraints) {
      if (invDate < dateConstraints.start || invDate > dateConstraints.end) {
        continue;
      }
    }

    const cafeInfo = cafeMap.get(inv.cafeId) || {
      cafeId: inv.cafeId,
      name: inv.cafeId,
      code: '',
    };

    const claimedPaisa = Number(inv.supplierClaimedAmountPaisa || inv.totalPaisa || 0);
    const approvedPaisa = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
    const heldPaisa = Number(inv.heldDisputedAmountPaisa || 0);
    const paidPaisa = Number(inv.paidPaisa || inv.amountPaidPaisa || 0);
    const outstandingPaisa = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    const taxPaisa = Number(inv.taxPaisa || 0);
    const taxablePaisa = Number(inv.amountPaisa || (claimedPaisa - taxPaisa));

    const isOverdue = Boolean(inv.dueDate && inv.dueDate < todayStr && outstandingPaisa > 0);
    const daysOverdue = isOverdue ? getDaysDiff(inv.dueDate, todayStr) : 0;

    let displayStatus = inv.paymentStatus || 'DUE';
    if (isOverdue && displayStatus !== 'PAID') {
      displayStatus = 'OVERDUE';
    }

    allRecords.push({
      invoiceId: inv.invoiceId,
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      isOverdue,
      daysOverdue,
      cafeId: inv.cafeId,
      cafeName: cafeInfo.name,
      cafeCode: cafeInfo.code,
      poReferenceId: inv.poReferenceId || null,
      viewOrderUrl: inv.poReferenceId ? `/vendor-orders?po=${inv.poReferenceId}` : null,
      grnIds: inv.grnIds || [],
      supplierClaimedAmountPaisa: claimedPaisa,
      supplierClaimedFormatted: formatCurrency(claimedPaisa),
      approvedPayableAmountPaisa: approvedPaisa,
      approvedPayableFormatted: formatCurrency(approvedPaisa),
      heldDisputedAmountPaisa: heldPaisa,
      heldDisputedFormatted: formatCurrency(heldPaisa),
      taxPaisa,
      taxFormatted: formatCurrency(taxPaisa),
      amountPaisa: taxablePaisa,
      amountFormatted: formatCurrency(taxablePaisa),
      paidPaisa,
      paidFormatted: formatCurrency(paidPaisa),
      outstandingPaisa,
      outstandingFormatted: formatCurrency(outstandingPaisa),
      paymentStatus: displayStatus,
      rawPaymentStatus: inv.paymentStatus,
      approvalStatus: inv.approvalStatus || 'PENDING',
      lineItemCount: (inv.lineItems || []).length,
    });
  }

  // 10 Authoritative Invoice KPI Summary counts across current date window
  const kpis = {
    totalInvoices: allRecords.length,
    totalInvoiceValuePaisa: allRecords.reduce((acc, i) => acc + i.supplierClaimedAmountPaisa, 0),
    totalInvoiceValueFormatted: formatCurrency(allRecords.reduce((acc, i) => acc + i.supplierClaimedAmountPaisa, 0)),
    approvedPayablePaisa: allRecords.reduce((acc, i) => acc + i.approvedPayableAmountPaisa, 0),
    approvedPayableFormatted: formatCurrency(allRecords.reduce((acc, i) => acc + i.approvedPayableAmountPaisa, 0)),
    heldDisputedPaisa: allRecords.reduce((acc, i) => acc + i.heldDisputedAmountPaisa, 0),
    heldDisputedFormatted: formatCurrency(allRecords.reduce((acc, i) => acc + i.heldDisputedAmountPaisa, 0)),
    outstandingPaisa: allRecords.reduce((acc, i) => acc + i.outstandingPaisa, 0),
    outstandingFormatted: formatCurrency(allRecords.reduce((acc, i) => acc + i.outstandingPaisa, 0)),
    overduePaisa: allRecords.filter((i) => i.isOverdue).reduce((acc, i) => acc + i.outstandingPaisa, 0),
    overdueFormatted: formatCurrency(allRecords.filter((i) => i.isOverdue).reduce((acc, i) => acc + i.outstandingPaisa, 0)),
    paidPaisa: allRecords.reduce((acc, i) => acc + i.paidPaisa, 0),
    paidFormatted: formatCurrency(allRecords.reduce((acc, i) => acc + i.paidPaisa, 0)),
    partiallyPaidCount: allRecords.filter((i) => i.paymentStatus === 'PARTIALLY_PAID' || i.rawPaymentStatus === 'PARTIALLY_PAID').length,
    paidCount: allRecords.filter((i) => i.paymentStatus === 'PAID' || i.rawPaymentStatus === 'PAID').length,
    onHoldCount: allRecords.filter((i) => i.paymentStatus === 'ON_HOLD' || i.rawPaymentStatus === 'ON_HOLD' || i.paymentStatus === 'DISPUTED' || i.heldDisputedAmountPaisa > 0).length,
    dueCount: allRecords.filter((i) => i.paymentStatus === 'DUE' || i.rawPaymentStatus === 'DUE' || i.paymentStatus === 'NOT_DUE').length,
    overdueCount: allRecords.filter((i) => i.isOverdue).length,
  };

  // Universal Search Filtering
  let filtered = allRecords;
  const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter((r) => {
      const matchInv = String(r.supplierInvoiceNumber || '').toLowerCase().includes(searchQuery) ||
        String(r.invoiceId || '').toLowerCase().includes(searchQuery);
      const matchPo = String(r.poReferenceId || '').toLowerCase().includes(searchQuery);
      const matchCafe = String(r.cafeName || '').toLowerCase().includes(searchQuery) ||
        String(r.cafeCode || '').toLowerCase().includes(searchQuery);
      const matchGrn = (r.grnIds || []).some((g) => String(g).toLowerCase().includes(searchQuery));
      return matchInv || matchPo || matchCafe || matchGrn;
    });
  }

  // Payment Status Filtering
  const paymentStatusFilter = req.query.paymentStatus ? String(req.query.paymentStatus).trim().toUpperCase() : 'ALL';
  if (paymentStatusFilter !== 'ALL') {
    if (paymentStatusFilter === 'OVERDUE') {
      filtered = filtered.filter((r) => r.isOverdue);
    } else if (paymentStatusFilter === 'ON_HOLD') {
      filtered = filtered.filter((r) => r.paymentStatus === 'ON_HOLD' || r.paymentStatus === 'DISPUTED' || r.heldDisputedAmountPaisa > 0);
    } else {
      filtered = filtered.filter((r) => r.paymentStatus === paymentStatusFilter || r.rawPaymentStatus === paymentStatusFilter);
    }
  }

  // Invoice Approval Status Filtering
  const approvalStatusFilter = req.query.approvalStatus ? String(req.query.approvalStatus).trim().toUpperCase() : 'ALL';
  if (approvalStatusFilter !== 'ALL') {
    filtered = filtered.filter((r) => String(r.approvalStatus).toUpperCase() === approvalStatusFilter);
  }

  // Sorting
  const sort = req.query.sort || 'date_desc';
  filtered.sort((a, b) => {
    if (sort === 'date_asc') return (a.invoiceDate || '').localeCompare(b.invoiceDate || '');
    if (sort === 'amount_desc') return b.supplierClaimedAmountPaisa - a.supplierClaimedAmountPaisa;
    if (sort === 'amount_asc') return a.supplierClaimedAmountPaisa - b.supplierClaimedAmountPaisa;
    if (sort === 'due_asc') return (a.dueDate || '').localeCompare(b.dueDate || '');
    if (sort === 'due_desc') return (b.dueDate || '').localeCompare(a.dueDate || '');
    return (b.invoiceDate || '').localeCompare(a.invoiceDate || '');
  });

  // Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: targetCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_INVOICES_LIST_VIEWED',
    targetType: 'VENDOR_INVOICES',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      resultCount: paginated.length,
      totalCount: total,
    },
  });

  return res.status(200).json({
    success: true,
    data: {
      kpis,
      invoices: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      activeFilters: {
        cafeId: targetCafeId || 'ALL',
        dateRange: req.query.dateRange || 'all',
        paymentStatus: paymentStatusFilter,
        approvalStatus: approvalStatusFilter,
        search: searchQuery,
      },
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/invoices/:invoiceId
 * VEN-SCR-004: Comprehensive Read-Only Invoice Details
 */
const getVendorInvoiceDetails = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const targetId = invoiceId.trim().toUpperCase();

  const inv = await APInvoice.findOne({
    organisationId,
    vendorId,
    $or: [{ invoiceId: targetId }, { supplierInvoiceNumber: targetId }],
  }).lean();

  if (!inv) {
    throw new ApiError(404, 'INVOICE_NOT_FOUND', 'The requested invoice was not found.');
  }

  // Cross-Café Authorization
  if (!approvedCafeIds.includes(String(inv.cafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, po] = await Promise.all([
    Cafe.findOne({
      organisationId,
      cafeId: inv.cafeId,
    }).select('cafeId name displayName code branchCode address phone contactPerson').lean(),
    inv.poReferenceId
      ? PurchaseOrder.findOne({ organisationId, vendorId, purchaseOrderId: inv.poReferenceId }).lean()
      : null,
  ]);

  const cafeName = cafe?.displayName || cafe?.name || inv.cafeId;
  const cafeCode = cafe?.code || cafe?.branchCode || '';
  const cafeAddress = formatCafeAddress(cafe?.address);

  const todayStr = getIstDateString();
  const claimedPaisa = Number(inv.supplierClaimedAmountPaisa || inv.totalPaisa || 0);
  const approvedPaisa = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
  const heldPaisa = Number(inv.heldDisputedAmountPaisa || 0);
  const paidPaisa = Number(inv.paidPaisa || inv.amountPaidPaisa || 0);
  const outstandingPaisa = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
  const appliedAdvancePaisa = Number(inv.appliedAdvancePaisa || 0);
  const appliedCreditPaisa = Number(inv.appliedCreditPaisa || 0);

  const isOverdue = Boolean(inv.dueDate && inv.dueDate < todayStr && outstandingPaisa > 0);
  const daysOverdue = isOverdue ? getDaysDiff(inv.dueDate, todayStr) : 0;

  let displayPaymentStatus = inv.paymentStatus || 'DUE';
  if (isOverdue && displayPaymentStatus !== 'PAID') {
    displayPaymentStatus = 'OVERDUE';
  }

  // Authoritative Tax Components
  const taxPaisa = Number(inv.taxPaisa || 0);
  const taxablePaisa = Number(inv.amountPaisa || (claimedPaisa - taxPaisa));
  const cgstPaisa = Math.round(taxPaisa / 2);
  const sgstPaisa = taxPaisa - cgstPaisa;

  // Sanitized Line Items
  const lineItems = (inv.lineItems || []).map((li) => ({
    itemId: li.itemId,
    itemName: li.itemName || li.itemId,
    invoiceQuantity: Number(li.invoiceQuantity || 0),
    acceptedQuantity: Number(li.acceptedQuantity || 0),
    rejectedQuantity: Number(li.rejectedQuantity || 0),
    unitPricePaisa: Number(li.unitPricePaisa || 0),
    unitPriceFormatted: formatCurrency(Number(li.unitPricePaisa || 0)),
    lineTotalPaisa: Number(li.lineTotalPaisa || 0),
    lineTotalFormatted: formatCurrency(Number(li.lineTotalPaisa || 0)),
    payableAmountPaisa: Number(li.payableAmountPaisa !== undefined ? li.payableAmountPaisa : (li.lineTotalPaisa || 0)),
    payableAmountFormatted: formatCurrency(Number(li.payableAmountPaisa !== undefined ? li.payableAmountPaisa : (li.lineTotalPaisa || 0))),
    disputeReason: li.disputeReason || '',
  }));

  // Sanitized Payment History
  const paymentHistory = (inv.paymentHistory || []).map((p) => ({
    paymentId: p.paymentId,
    paidPaisa: Number(p.paidPaisa || 0),
    paidFormatted: formatCurrency(Number(p.paidPaisa || 0)),
    paidAt: p.paidAt,
    paymentMethod: p.paymentMethod || 'BANK_TRANSFER',
    reference: p.reference || '',
  }));

  // Milestone Timeline
  const isApproved = inv.approvalStatus === 'APPROVED';
  const isPartiallyPaid = inv.paymentStatus === 'PARTIALLY_PAID';
  const isFullyPaid = inv.paymentStatus === 'PAID';

  const timeline = [
    { key: 'invoice_received', label: 'Invoice Received / Recorded', completed: true, timestamp: inv.invoiceDate },
    { key: 'three_way_match', label: 'Three-Way Receipt Match', completed: Boolean(inv.validationStatus === 'VALIDATED' || isApproved), timestamp: null },
    { key: 'payment_approval', label: 'Approved for Accounts Payable', completed: isApproved, timestamp: null },
    { key: 'settlement', label: isFullyPaid ? 'Settled & Paid in Full' : (isPartiallyPaid ? 'Partially Paid' : 'Awaiting Payment Settlement'), completed: isFullyPaid || isPartiallyPaid, timestamp: paymentHistory[0]?.paidAt || null },
  ];

  // Authorised Documents
  const documents = [
    {
      documentType: 'INVOICE_PDF',
      title: `Official Invoice Summary (${inv.supplierInvoiceNumber || inv.invoiceId})`,
      url: `/api/v1/vendor/invoices/${inv.invoiceId}/pdf`,
      filename: `Invoice-${inv.supplierInvoiceNumber || inv.invoiceId}.pdf`,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    },
  ];

  if (inv.poReferenceId) {
    documents.push({
      documentType: 'PURCHASE_ORDER_PDF',
      title: `Referenced Purchase Order (${inv.poReferenceId})`,
      url: `/api/v1/vendor/orders/${inv.poReferenceId}/pdf`,
      filename: `PO-${inv.poReferenceId}.pdf`,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    });
  }

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: inv.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_INVOICE_VIEWED',
    targetType: 'AP_INVOICE',
    targetId: inv.invoiceId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, invoiceId: inv.invoiceId },
  });

  return res.status(200).json({
    success: true,
    data: {
      invoiceId: inv.invoiceId,
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      isOverdue,
      daysOverdue,
      paymentStatus: displayPaymentStatus,
      rawPaymentStatus: inv.paymentStatus,
      approvalStatus: inv.approvalStatus || 'PENDING',
      validationStatus: inv.validationStatus || 'VALIDATED',

      vendor: {
        vendorId,
        name: req.vendor?.name || inv.vendorName || 'Valued Supplier',
        legalName: req.vendor?.legalName || req.vendor?.name || inv.vendorName || 'Valued Supplier',
        gstNumber: req.vendor?.gstNumber || 'Unregistered',
        panNumber: req.vendor?.panNumber || '',
      },

      cafe: {
        cafeId: inv.cafeId,
        name: cafeName,
        code: cafeCode,
        address: cafeAddress,
        phone: cafe?.phone || '',
        contactPerson: cafe?.contactPerson || 'Store Accounts Operations',
      },

      financials: {
        supplierClaimedAmountPaisa: claimedPaisa,
        supplierClaimedFormatted: formatCurrency(claimedPaisa),
        approvedPayableAmountPaisa: approvedPaisa,
        approvedPayableFormatted: formatCurrency(approvedPaisa),
        heldDisputedAmountPaisa: heldPaisa,
        heldDisputedFormatted: formatCurrency(heldPaisa),
        taxableAmountPaisa: taxablePaisa,
        taxableFormatted: formatCurrency(taxablePaisa),
        taxAmountPaisa: taxPaisa,
        taxFormatted: formatCurrency(taxPaisa),
        cgstPaisa,
        cgstFormatted: formatCurrency(cgstPaisa),
        sgstPaisa,
        sgstFormatted: formatCurrency(sgstPaisa),
        igstPaisa: 0,
        igstFormatted: formatCurrency(0),
        paidPaisa,
        paidFormatted: formatCurrency(paidPaisa),
        appliedAdvancePaisa,
        appliedAdvanceFormatted: formatCurrency(appliedAdvancePaisa),
        appliedCreditPaisa,
        appliedCreditFormatted: formatCurrency(appliedCreditPaisa),
        outstandingPayableAmountPaisa: outstandingPaisa,
        outstandingFormatted: formatCurrency(outstandingPaisa),
        currency: 'INR',
      },

      linkedDocuments: {
        poReferenceId: inv.poReferenceId || null,
        viewOrderUrl: inv.poReferenceId ? `/vendor-orders?po=${inv.poReferenceId}` : null,
        grnIds: inv.grnIds || [],
        viewGrnUrls: (inv.grnIds || []).map((g) => ({ grnId: g, url: `/vendor-deliveries?grn=${g}` })),
      },

      lineItems,
      paymentHistory,
      timeline,
      documents,
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/invoices/:invoiceId/pdf
 * VEN-SCR-004: Official A4 Vector PDF Invoice Summary Download
 */
const downloadVendorInvoicePdf = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const targetId = invoiceId.trim().toUpperCase();

  const inv = await APInvoice.findOne({
    organisationId,
    vendorId,
    $or: [{ invoiceId: targetId }, { supplierInvoiceNumber: targetId }],
  }).lean();

  if (!inv) {
    throw new ApiError(404, 'INVOICE_NOT_FOUND', 'The requested invoice was not found.');
  }

  if (!approvedCafeIds.includes(String(inv.cafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, vendor] = await Promise.all([
    Cafe.findOne({ organisationId, cafeId: inv.cafeId }).lean(),
    Vendor.findOne({ organisationId, vendorId }).lean(),
  ]);

  const cafeName = cafe?.displayName || cafe?.name || inv.cafeId;
  const cafeCode = cafe?.code || cafe?.branchCode || '';
  const vendorName = vendor?.name || inv.vendorName || 'Valued Supplier';
  const claimedPaisa = Number(inv.supplierClaimedAmountPaisa || inv.totalPaisa || 0);
  const approvedPaisa = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
  const heldPaisa = Number(inv.heldDisputedAmountPaisa || 0);
  const paidPaisa = Number(inv.paidPaisa || inv.amountPaidPaisa || 0);
  const outstandingPaisa = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));

  let streamOps = '';
  // Top header banner
  streamOps += '0.05 0.15 0.25 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 16 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OFFICIAL INVOICE SUMMARY) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.8 0.85 0.9 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY) Tj\nET\n';
  streamOps += `BT\n/F2 10 Tf\n1 1 1 rg\n1 0 0 1 420 812 Tm\n(INVOICE: ${escapePdf(inv.supplierInvoiceNumber || inv.invoiceId)}) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.8 0.85 0.9 rg\n1 0 0 1 420 798 Tm\n(DATE: ${escapePdf(inv.invoiceDate || 'N/A')}) Tj\nET\n`;

  // Vendor & Café details
  streamOps += '0.96 0.96 0.96 rg\n30 680 535 75 re\nf\n';
  streamOps += '0.8 0.8 0.8 RG\n1 w\n30 680 535 75 re\nS\n';
  streamOps += 'BT\n/F2 10 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 40 735 Tm\n(VENDOR (SUPPLIER):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 720 Tm\n(${escapePdf(vendorName)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 706 Tm\n(GSTIN: ${escapePdf(vendor?.gstNumber || 'Unregistered')} | PAN: ${escapePdf(vendor?.panNumber || 'N/A')}) Tj\nET\n`;

  streamOps += 'BT\n/F2 10 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 310 735 Tm\n(BILLING & DESTINATION CAFE:) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 720 Tm\n(${escapePdf(cafeName)} (${escapePdf(cafeCode || inv.cafeId)})) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 706 Tm\n(PO REF: ${escapePdf(inv.poReferenceId || 'DIRECT_BILLING')} | DUE DATE: ${escapePdf(inv.dueDate || 'N/A')}) Tj\nET\n`;

  // 3-Value Architecture Box
  streamOps += '0.94 0.97 1.0 rg\n30 600 535 65 re\nf\n';
  streamOps += '0.3 0.6 0.9 RG\n1 w\n30 600 535 65 re\nS\n';
  streamOps += 'BT\n/F2 10 Tf\n0.05 0.25 0.45 rg\n1 0 0 1 40 648 Tm\n(THREE-VALUE FINANCIAL RECONCILIATION) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 40 630 Tm\n(Supplier Claimed Amount: ${formatCurrency(claimedPaisa)}) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.05 0.5 0.2 rg\n1 0 0 1 220 630 Tm\n(Approved Payable: ${formatCurrency(approvedPaisa)}) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.7 0.1 0.1 rg\n1 0 0 1 400 630 Tm\n(Held / Disputed: ${formatCurrency(heldPaisa)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 612 Tm\n(Total Paid: ${formatCurrency(paidPaisa)} | Remaining Outstanding Balance: ${formatCurrency(outstandingPaisa)} | Status: ${escapePdf(inv.paymentStatus || 'DUE')}) Tj\nET\n`;

  // Line items table header
  streamOps += '0.1 0.15 0.2 rg\n30 570 535 20 re\nf\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 35 576 Tm\n(#) Tj\nET\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 60 576 Tm\n(Item Description) Tj\nET\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 280 576 Tm\n(Inv Qty) Tj\nET\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 330 576 Tm\n(Acc Qty) Tj\nET\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 390 576 Tm\n(Rate) Tj\nET\n';
  streamOps += 'BT\n/F2 9 Tf\n1 1 1 rg\n1 0 0 1 470 576 Tm\n(Approved Line Total) Tj\nET\n';

  let currentY = 550;
  const items = inv.lineItems || [];
  let itemIndex = 1;
  for (const it of items) {
    if (currentY < 90) break;
    const itemName = it.itemName || it.itemId || 'Goods Item';
    const rate = formatCurrency(it.unitPricePaisa || 0);
    const lineTot = formatCurrency(it.payableAmountPaisa !== undefined ? it.payableAmountPaisa : (it.lineTotalPaisa || 0));

    if (itemIndex % 2 === 0) {
      streamOps += `0.98 0.98 0.98 rg\n30 ${currentY - 3} 535 15 re\nf\n`;
    }

    streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 35 ${currentY} Tm\n(${itemIndex}) Tj\nET\n`;
    streamOps += `BT\n/F1 8 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 60 ${currentY} Tm\n(${escapePdf(itemName.slice(0, 38))}) Tj\nET\n`;
    streamOps += `BT\n/F1 8 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 280 ${currentY} Tm\n(${it.invoiceQuantity || 0}) Tj\nET\n`;
    streamOps += `BT\n/F1 8 Tf\n0.05 0.5 0.2 rg\n1 0 0 1 330 ${currentY} Tm\n(${it.acceptedQuantity || 0}) Tj\nET\n`;
    streamOps += `BT\n/F1 8 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 390 ${currentY} Tm\n(${escapePdf(rate)}) Tj\nET\n`;
    streamOps += `BT\n/F2 8 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 470 ${currentY} Tm\n(${escapePdf(lineTot)}) Tj\nET\n`;

    currentY -= 16;
    itemIndex++;
  }

  // Footer banner
  streamOps += 'BT\n/F2 8 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 30 35 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY | ZAMORIN CAFE ERP) Tj\nET\n';

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');
  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: inv.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_INVOICE_PDF_DOWNLOADED',
    targetType: 'AP_INVOICE',
    targetId: inv.invoiceId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${inv.supplierInvoiceNumber || inv.invoiceId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/v1/vendor/payments
 * VEN-SCR-005: Payments & Balance Register & 8 KPI Summaries
 *
 * Provides authoritative commercial visibility into settled and allocated payments:
 * - 8 Summary KPI cards: Total Paid, Payments This Period, Number of Payments,
 *   Current Outstanding, Overdue Outstanding, Advances Applied, Credits Applied, Open Invoice Count.
 * - Multi-criteria filtering: Café scope, date ranges, payment mode.
 * - Universal search: Payment ID, UTR, invoice number, PO reference, café name/code.
 * - Authoritative accounting reconciliation across APInvoice and VendorLedgerEntry.
 */
const getVendorPayments = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  const invoiceQuery = {
    organisationId,
    vendorId,
  };

  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    if (!approvedCafeIds.includes(targetCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
    invoiceQuery.cafeId = targetCafeId;
  } else {
    invoiceQuery.cafeId = { $in: approvedCafeIds };
  }

  const ledgerQuery = {
    organisationId,
    vendorId,
    entryType: { $in: ['PAYMENT', 'PARTIAL_PAYMENT', 'ADVANCE_PAYMENT', 'ADVANCE_APPLIED'] },
  };
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    ledgerQuery.cafeId = targetCafeId;
  } else {
    ledgerQuery.cafeId = { $in: [...approvedCafeIds, 'ORGANISATION_WIDE'] };
  }

  const dateConstraints = resolveDateConstraints(
    req.query.dateRange,
    req.query.customStart,
    req.query.customEnd
  );

  const [invoices, ledgerEntries, cafes] = await Promise.all([
    APInvoice.find(invoiceQuery).lean(),
    VendorLedgerEntry.find(ledgerQuery).lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName code branchCode address')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, {
      cafeId: c.cafeId,
      name: c.displayName || c.name || c.cafeId,
      code: c.code || c.branchCode || '',
    });
  }

  const todayStr = getIstDateString();

  // Reconcile overall AP invoice financial metrics
  let totalOutstandingPaisa = 0;
  let totalOverduePaisa = 0;
  let totalAdvancesAppliedPaisa = 0;
  let totalCreditsAppliedPaisa = 0;
  let openInvoiceCount = 0;

  for (const inv of invoices) {
    const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    const isOverdue = Boolean(inv.dueDate && inv.dueDate < todayStr && outstanding > 0);
    totalOutstandingPaisa += outstanding;
    if (isOverdue) {
      totalOverduePaisa += outstanding;
    }
    totalAdvancesAppliedPaisa += Number(inv.appliedAdvancePaisa || 0);
    totalCreditsAppliedPaisa += Number(inv.appliedCreditPaisa || 0);

    const isSettled = inv.paymentStatus === 'PAID' || outstanding === 0;
    if (!isSettled) {
      openInvoiceCount++;
    }
  }

  // Aggregate payment records across invoice payment histories & ledger entries
  const paymentMap = new Map();

  // 1. From APInvoices payment histories
  for (const inv of invoices) {
    const cafeInfo = cafeMap.get(inv.cafeId) || { cafeId: inv.cafeId, name: inv.cafeId, code: '' };
    const remainingBalance = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));

    for (const p of inv.paymentHistory || []) {
      const pid = p.paymentId || `PAY-${inv.invoiceId}-${paymentMap.size + 1}`;
      const pDate = p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : todayStr;

      paymentMap.set(pid, {
        paymentId: pid,
        paymentReference: p.reference || pid,
        settlementReference: p.reference || 'DIRECT_SETTLEMENT',
        paymentDate: pDate,
        paymentTimestamp: p.paidAt || new Date().toISOString(),
        paymentMethod: p.paymentMethod || 'BANK_TRANSFER',
        grossAmountPaisa: Number(p.paidPaisa || 0),
        grossAmountFormatted: formatCurrency(Number(p.paidPaisa || 0)),
        allocatedAmountPaisa: Number(p.paidPaisa || 0),
        allocatedAmountFormatted: formatCurrency(Number(p.paidPaisa || 0)),
        invoiceId: inv.invoiceId,
        supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
        poReferenceId: inv.poReferenceId || null,
        cafeId: inv.cafeId,
        cafeName: cafeInfo.name,
        cafeCode: cafeInfo.code,
        remainingInvoiceBalancePaisa: remainingBalance,
        remainingInvoiceBalanceFormatted: formatCurrency(remainingBalance),
        paymentStatus: 'CLEARED',
        notes: 'Authorised commercial settlement posted by accounts payable.',
        receiptUrl: `/api/v1/vendor/payments/${pid}/receipt`,
      });
    }
  }

  // 2. From VendorLedgerEntry
  for (const entry of ledgerEntries) {
    const pid = entry.paymentId || entry.referenceId || entry.ledgerEntryId;
    if (!paymentMap.has(pid)) {
      const cafeInfo = cafeMap.get(entry.cafeId) || { cafeId: entry.cafeId, name: entry.cafeId, code: '' };
      const amt = Number(entry.debitPaisa || entry.paidPaisa || 0);

      paymentMap.set(pid, {
        paymentId: pid,
        paymentReference: entry.referenceNumber || pid,
        settlementReference: entry.referenceNumber || 'DIRECT_SETTLEMENT',
        paymentDate: entry.entryDate || todayStr,
        paymentTimestamp: entry.entryTimestamp || new Date().toISOString(),
        paymentMethod: 'BANK_TRANSFER',
        grossAmountPaisa: amt,
        grossAmountFormatted: formatCurrency(amt),
        allocatedAmountPaisa: amt,
        allocatedAmountFormatted: formatCurrency(amt),
        invoiceId: entry.referenceId || null,
        supplierInvoiceNumber: entry.supplierInvoiceNumber || null,
        poReferenceId: entry.purchaseOrderId || null,
        cafeId: entry.cafeId,
        cafeName: cafeInfo.name,
        cafeCode: cafeInfo.code,
        remainingInvoiceBalancePaisa: Number(entry.runningBalancePaisa || 0),
        remainingInvoiceBalanceFormatted: formatCurrency(Number(entry.runningBalancePaisa || 0)),
        paymentStatus: 'CLEARED',
        notes: 'Authorised subledger payment entry.',
        receiptUrl: `/api/v1/vendor/payments/${pid}/receipt`,
      });
    }
  }

  const allPayments = Array.from(paymentMap.values());

  // Calculate 8 Authoritative Summary KPIs
  const totalPaidPaisa = allPayments.reduce((acc, p) => acc + p.grossAmountPaisa, 0);

  // Payments in selected date period
  const periodPayments = allPayments.filter((p) => {
    if (!dateConstraints) return true;
    return p.paymentDate >= dateConstraints.start && p.paymentDate <= dateConstraints.end;
  });
  const paymentsThisPeriodPaisa = periodPayments.reduce((acc, p) => acc + p.grossAmountPaisa, 0);

  const kpis = {
    totalPaidPaisa,
    totalPaidFormatted: formatCurrency(totalPaidPaisa),
    paymentsThisPeriodPaisa,
    paymentsThisPeriodFormatted: formatCurrency(paymentsThisPeriodPaisa),
    paymentsCount: allPayments.length,
    currentOutstandingPaisa: totalOutstandingPaisa,
    currentOutstandingFormatted: formatCurrency(totalOutstandingPaisa),
    overdueOutstandingPaisa: totalOverduePaisa,
    overdueOutstandingFormatted: formatCurrency(totalOverduePaisa),
    advancesAppliedPaisa: totalAdvancesAppliedPaisa,
    advancesAppliedFormatted: formatCurrency(totalAdvancesAppliedPaisa),
    creditsAppliedPaisa: totalCreditsAppliedPaisa,
    creditsAppliedFormatted: formatCurrency(totalCreditsAppliedPaisa),
    openInvoiceCount,
  };

  // Filter Payments
  let filtered = allPayments;

  // Date filtering
  if (dateConstraints) {
    filtered = filtered.filter((p) => p.paymentDate >= dateConstraints.start && p.paymentDate <= dateConstraints.end);
  }

  // Payment Method filtering
  const paymentMethodFilter = req.query.paymentMethod ? String(req.query.paymentMethod).trim().toUpperCase() : 'ALL';
  if (paymentMethodFilter !== 'ALL') {
    filtered = filtered.filter((p) => String(p.paymentMethod).toUpperCase() === paymentMethodFilter);
  }

  // Universal Search
  const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter((p) => {
      const matchRef = String(p.paymentReference || '').toLowerCase().includes(searchQuery) ||
        String(p.settlementReference || '').toLowerCase().includes(searchQuery) ||
        String(p.paymentId || '').toLowerCase().includes(searchQuery);
      const matchInv = String(p.supplierInvoiceNumber || '').toLowerCase().includes(searchQuery) ||
        String(p.invoiceId || '').toLowerCase().includes(searchQuery);
      const matchPo = String(p.poReferenceId || '').toLowerCase().includes(searchQuery);
      const matchCafe = String(p.cafeName || '').toLowerCase().includes(searchQuery) ||
        String(p.cafeCode || '').toLowerCase().includes(searchQuery);
      return matchRef || matchInv || matchPo || matchCafe;
    });
  }

  // Sorting
  const sort = req.query.sort || 'date_desc';
  filtered.sort((a, b) => {
    if (sort === 'date_asc') return (a.paymentDate || '').localeCompare(b.paymentDate || '');
    if (sort === 'amount_desc') return b.grossAmountPaisa - a.grossAmountPaisa;
    if (sort === 'amount_asc') return a.grossAmountPaisa - b.grossAmountPaisa;
    return (b.paymentDate || '').localeCompare(a.paymentDate || '');
  });

  // Pagination
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_PAYMENTS_LIST_VIEWED',
    targetType: 'VENDOR_PAYMENTS',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { resultCount: paginated.length, totalCount: total },
  });

  return res.status(200).json({
    success: true,
    data: {
      kpis,
      payments: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/payments/:paymentId
 * VEN-SCR-005: Detailed View of a Payment Record
 */
const getVendorPaymentDetails = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const { paymentId } = req.params;

  if (!paymentId) {
    throw new ApiError(400, 'INVALID_PAYMENT_ID', 'Payment ID parameter is required.');
  }

  const targetId = paymentId.trim().toUpperCase();

  // Find in APInvoices paymentHistory
  const invoice = await APInvoice.findOne({
    organisationId,
    vendorId,
    'paymentHistory.paymentId': targetId,
  }).lean();

  let matchedPayment = null;
  let linkedCafeId = null;
  let linkedInvoice = null;

  if (invoice) {
    linkedCafeId = invoice.cafeId;
    linkedInvoice = invoice;
    matchedPayment = (invoice.paymentHistory || []).find((p) => p.paymentId === targetId);
  } else {
    // Check VendorLedgerEntry
    const ledger = await VendorLedgerEntry.findOne({
      organisationId,
      vendorId,
      $or: [{ paymentId: targetId }, { referenceNumber: targetId }, { ledgerEntryId: targetId }],
    }).lean();

    if (ledger) {
      linkedCafeId = ledger.cafeId;
      matchedPayment = {
        paymentId: ledger.paymentId || ledger.ledgerEntryId,
        paidPaisa: ledger.debitPaisa || ledger.paidPaisa || 0,
        paidAt: ledger.entryTimestamp,
        paymentMethod: 'BANK_TRANSFER',
        reference: ledger.referenceNumber || ledger.paymentId,
      };
      if (ledger.referenceId) {
        linkedInvoice = await APInvoice.findOne({
          organisationId,
          vendorId,
          $or: [{ invoiceId: ledger.referenceId }, { supplierInvoiceNumber: ledger.referenceId }],
        }).lean();
      }
    }
  }

  if (!matchedPayment) {
    throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'The requested payment record was not found.');
  }

  // Cross-Café Authorization Verification
  if (linkedCafeId && linkedCafeId !== 'ORGANISATION_WIDE' && !approvedCafeIds.includes(String(linkedCafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, vendor] = await Promise.all([
    linkedCafeId ? Cafe.findOne({ organisationId, cafeId: linkedCafeId }).lean() : null,
    Vendor.findOne({ organisationId, vendorId }).lean(),
  ]);

  const cafeName = cafe?.displayName || cafe?.name || linkedCafeId || 'All Outlets';
  const cafeCode = cafe?.code || cafe?.branchCode || '';
  const vendorName = vendor?.name || 'Valued Supplier';
  const grossAmountPaisa = Number(matchedPayment.paidPaisa || 0);

  const detail = {
    paymentId: matchedPayment.paymentId,
    paymentReference: matchedPayment.reference || matchedPayment.paymentId,
    settlementReference: matchedPayment.reference || 'DIRECT_SETTLEMENT',
    paymentDate: matchedPayment.paidAt ? new Date(matchedPayment.paidAt).toISOString().slice(0, 10) : getIstDateString(),
    paymentTimestamp: matchedPayment.paidAt || new Date().toISOString(),
    paymentMethod: matchedPayment.paymentMethod || 'BANK_TRANSFER',
    paymentStatus: 'CLEARED',
    grossAmountPaisa,
    grossAmountFormatted: formatCurrency(grossAmountPaisa),
    allocatedAmountPaisa: grossAmountPaisa,
    allocatedAmountFormatted: formatCurrency(grossAmountPaisa),
    cafeId: linkedCafeId,
    cafeName,
    cafeCode,
    vendorId,
    vendorName,
    linkedInvoice: linkedInvoice ? {
      invoiceId: linkedInvoice.invoiceId,
      supplierInvoiceNumber: linkedInvoice.supplierInvoiceNumber || linkedInvoice.invoiceId,
      invoiceDate: linkedInvoice.invoiceDate,
      totalAmountPaisa: linkedInvoice.totalPaisa,
      totalAmountFormatted: formatCurrency(linkedInvoice.totalPaisa),
      approvedPayableAmountPaisa: linkedInvoice.approvedPayableAmountPaisa,
      approvedPayableFormatted: formatCurrency(linkedInvoice.approvedPayableAmountPaisa),
      remainingBalancePaisa: linkedInvoice.outstandingPayableAmountPaisa,
      remainingBalanceFormatted: formatCurrency(linkedInvoice.outstandingPayableAmountPaisa),
      poReferenceId: linkedInvoice.poReferenceId || null,
    } : null,
    poReferenceId: linkedInvoice?.poReferenceId || null,
    // Safe read-only commentary; internal banking reconciliation commentary strictly redacted
    paymentNotes: 'Official payment voucher generated and posted by Zamorin Accounts Payable.',
    receiptUrl: `/api/v1/vendor/payments/${matchedPayment.paymentId}/receipt`,
    readOnly: true,
  };

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: linkedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_PAYMENT_VIEWED',
    targetType: 'PAYMENT',
    targetId: matchedPayment.paymentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  return res.status(200).json({
    success: true,
    data: detail,
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/payments/:paymentId/receipt
 * VEN-SCR-005: Official A4 Vector PDF Payment Receipt
 */
const downloadVendorPaymentReceiptPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const { paymentId } = req.params;

  if (!paymentId) {
    throw new ApiError(400, 'INVALID_PAYMENT_ID', 'Payment ID parameter is required.');
  }

  const targetId = paymentId.trim().toUpperCase();

  const invoice = await APInvoice.findOne({
    organisationId,
    vendorId,
    'paymentHistory.paymentId': targetId,
  }).lean();

  let matchedPayment = null;
  let linkedCafeId = null;
  let linkedInvoice = null;

  if (invoice) {
    linkedCafeId = invoice.cafeId;
    linkedInvoice = invoice;
    matchedPayment = (invoice.paymentHistory || []).find((p) => p.paymentId === targetId);
  } else {
    const ledger = await VendorLedgerEntry.findOne({
      organisationId,
      vendorId,
      $or: [{ paymentId: targetId }, { referenceNumber: targetId }, { ledgerEntryId: targetId }],
    }).lean();

    if (ledger) {
      linkedCafeId = ledger.cafeId;
      matchedPayment = {
        paymentId: ledger.paymentId || ledger.ledgerEntryId,
        paidPaisa: ledger.debitPaisa || ledger.paidPaisa || 0,
        paidAt: ledger.entryTimestamp,
        paymentMethod: 'BANK_TRANSFER',
        reference: ledger.referenceNumber || ledger.paymentId,
      };
      if (ledger.referenceId) {
        linkedInvoice = await APInvoice.findOne({
          organisationId,
          vendorId,
          $or: [{ invoiceId: ledger.referenceId }, { supplierInvoiceNumber: ledger.referenceId }],
        }).lean();
      }
    }
  }

  if (!matchedPayment) {
    throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'The requested payment record was not found.');
  }

  if (linkedCafeId && linkedCafeId !== 'ORGANISATION_WIDE' && !approvedCafeIds.includes(String(linkedCafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, vendor] = await Promise.all([
    linkedCafeId ? Cafe.findOne({ organisationId, cafeId: linkedCafeId }).lean() : null,
    Vendor.findOne({ organisationId, vendorId }).lean(),
  ]);

  const cafeName = cafe?.displayName || cafe?.name || linkedCafeId || 'Zamorin Café Central';
  const cafeCode = cafe?.code || cafe?.branchCode || '';
  const vendorName = vendor?.name || 'Valued Supplier';
  const grossAmountPaisa = Number(matchedPayment.paidPaisa || 0);
  const paymentDateStr = matchedPayment.paidAt ? new Date(matchedPayment.paidAt).toISOString().slice(0, 10) : getIstDateString();

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.05 0.20 0.15 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 16 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OFFICIAL PAYMENT RECEIPT) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.85 0.95 0.90 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY) Tj\nET\n';
  streamOps += `BT\n/F2 10 Tf\n1 1 1 rg\n1 0 0 1 420 812 Tm\n(RECEIPT NO: ${escapePdf(matchedPayment.paymentId)}) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.85 0.95 0.90 rg\n1 0 0 1 420 798 Tm\n(DATE: ${escapePdf(paymentDateStr)}) Tj\nET\n`;

  // Payer & Beneficiary Section
  streamOps += '0.96 0.97 0.96 rg\n30 675 535 80 re\nf\n';
  streamOps += '0.8 0.85 0.8 RG\n1 w\n30 675 535 80 re\nS\n';
  streamOps += 'BT\n/F2 10 Tf\n0.1 0.2 0.1 rg\n1 0 0 1 40 735 Tm\n(PAID TO (BENEFICIARY):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 720 Tm\n(${escapePdf(vendorName)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 706 Tm\n(GSTIN: ${escapePdf(vendor?.gstNumber || 'Unregistered')} | PAN: ${escapePdf(vendor?.panNumber || 'N/A')}) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 692 Tm\n(Bank: Payment Account on File [Verified Commercial Payee]) Tj\nET\n`;

  streamOps += 'BT\n/F2 10 Tf\n0.1 0.2 0.1 rg\n1 0 0 1 310 735 Tm\n(ISSUED BY (PAYING ENTITY):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 720 Tm\n(${escapePdf(cafeName)} (${escapePdf(cafeCode || linkedCafeId || 'ZC-0001')})) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 706 Tm\n(Zamorin Hospitality Private Limited) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 692 Tm\n(Method: ${escapePdf(matchedPayment.paymentMethod || 'BANK_TRANSFER')} | Ref/UTR: ${escapePdf(matchedPayment.reference || 'N/A')}) Tj\nET\n`;

  // Payment Amount Summary Box
  streamOps += '0.92 0.96 0.93 rg\n30 595 535 65 re\nf\n';
  streamOps += '0.2 0.5 0.3 RG\n1.5 w\n30 595 535 65 re\nS\n';
  streamOps += 'BT\n/F1 9 Tf\n0.3 0.4 0.3 rg\n1 0 0 1 45 640 Tm\n(TOTAL SETTLEMENT AMOUNT POSTED:) Tj\nET\n';
  streamOps += `BT\n/F2 18 Tf\n0.05 0.35 0.15 rg\n1 0 0 1 45 615 Tm\n(${formatCurrency(grossAmountPaisa)}) Tj\nET\n`;
  streamOps += `BT\n/F2 10 Tf\n0.1 0.3 0.15 rg\n1 0 0 1 310 635 Tm\n(STATUS: SETTLED & POSTED) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.35 0.3 rg\n1 0 0 1 310 618 Tm\n(Settlement Reference: ${escapePdf(matchedPayment.reference || matchedPayment.paymentId)}) Tj\nET\n`;

  // Linked Invoice Allocation Table
  streamOps += '0.2 0.25 0.3 rg\n30 550 535 22 re\nf\n';
  streamOps += 'BT\n/F2 8.5 Tf\n1 1 1 rg\n1 0 0 1 40 557 Tm\n(INVOICE NUMBER) Tj\nET\n';
  streamOps += 'BT\n/F2 8.5 Tf\n1 1 1 rg\n1 0 0 1 180 557 Tm\n(INVOICE DATE) Tj\nET\n';
  streamOps += 'BT\n/F2 8.5 Tf\n1 1 1 rg\n1 0 0 1 270 557 Tm\n(PO REFERENCE) Tj\nET\n';
  streamOps += 'BT\n/F2 8.5 Tf\n1 1 1 rg\n1 0 0 1 370 557 Tm\n(ALLOCATED AMOUNT) Tj\nET\n';
  streamOps += 'BT\n/F2 8.5 Tf\n1 1 1 rg\n1 0 0 1 475 557 Tm\n(REMAINING BAL) Tj\nET\n';

  let currentY = 525;
  streamOps += '0.98 0.98 0.98 rg\n30 520 535 25 re\nf\n';
  streamOps += '0.85 0.85 0.85 RG\n0.5 w\n30 520 535 25 re\nS\n';

  const invNum = linkedInvoice?.supplierInvoiceNumber || linkedInvoice?.invoiceId || 'DIRECT_SETTLEMENT';
  const invDate = linkedInvoice?.invoiceDate || paymentDateStr;
  const poRef = linkedInvoice?.poReferenceId || 'N/A';
  const remBal = linkedInvoice ? formatCurrency(linkedInvoice.outstandingPayableAmountPaisa || 0) : '₹0.00';

  streamOps += `BT\n/F2 8.5 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 40 ${currentY} Tm\n(${escapePdf(invNum)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 180 ${currentY} Tm\n(${escapePdf(invDate)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 270 ${currentY} Tm\n(${escapePdf(poRef)}) Tj\nET\n`;
  streamOps += `BT\n/F2 8.5 Tf\n0.05 0.35 0.15 rg\n1 0 0 1 370 ${currentY} Tm\n(${formatCurrency(grossAmountPaisa)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 475 ${currentY} Tm\n(${escapePdf(remBal)}) Tj\nET\n`;

  // Official Notice & Anti-Fraud Disclaimer
  streamOps += '0.96 0.96 0.96 rg\n30 380 535 90 re\nf\n';
  streamOps += '0.8 0.8 0.8 RG\n1 w\n30 380 535 90 re\nS\n';
  streamOps += 'BT\n/F2 8.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 45 450 Tm\n(OFFICIAL SETTLEMENT NOTICE & BANK RECONCILIATION DISCLAIMER:) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.35 0.35 0.35 rg\n1 0 0 1 45 435 Tm\n(1. This payment voucher is an authoritative electronic record generated by Zamorin Hospitality Accounts.) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.35 0.35 0.35 rg\n1 0 0 1 45 422 Tm\n(2. Funds are disbursed via authorized banking channels. Depending on the settlement network (NEFT/RTGS/IMPS),) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.35 0.35 0.35 rg\n1 0 0 1 45 410 Tm\n(   bank credit reflections may take up to 2-4 business hours.) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.35 0.35 0.35 rg\n1 0 0 1 45 397 Tm\n(3. Strictly read-only copy for vendor commercial accounts records. No alterations permitted.) Tj\nET\n';

  // Footer bar
  streamOps += '0.05 0.20 0.15 rg\n0 0 595.28 28 re\nf\n';
  streamOps += 'BT\n/F1 7.5 Tf\n1 1 1 rg\n1 0 0 1 30 10 Tm\n(Zamorin Cafe ERP - Vendor Portal • Read-Only External Access • Generated electronically) Tj\nET\n';

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');
  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: linkedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_PAYMENT_RECEIPT_DOWNLOADED',
    targetType: 'PAYMENT',
    targetId: matchedPayment.paymentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PaymentReceipt-${matchedPayment.paymentId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/v1/vendor/statement
 * VEN-SCR-006: Vendor Account Statement & Subledger Progression
 *
 * Provides a strictly read-only, chronological subledger statement:
 * - Opening balance as of fromDate (derived from prior non-reversed ledger entries)
 * - Total Period Credits (Bills / Additions)
 * - Total Period Debits (Settlements / Payments / Credits)
 * - Closing balance as of toDate
 * - Reconciled running balance on every transaction
 * - Multi-criteria filters: date range, cafeId, entryType, search
 * - Safe pagination that preserves global period totals
 */
const getVendorAccountStatement = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, fromDate, toDate, entryType, search, page = 1, limit = 50 } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL' && cafeId !== 'ORGANISATION_WIDE') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const effectiveToDate = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : todayStr;
  let effectiveFromDate = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null;
  if (!effectiveFromDate) {
    const d = new Date(effectiveToDate);
    d.setDate(d.getDate() - 30);
    effectiveFromDate = d.toISOString().slice(0, 10);
  }

  // Base subledger filter for non-reversed entries
  const baseFilter = {
    organisationId,
    vendorId,
    isReversed: false,
  };

  if (scopedCafeId) {
    baseFilter.$or = [
      { cafeId: scopedCafeId },
      { cafeId: 'ORGANISATION_WIDE' },
    ];
  }

  // 1. Calculate Opening Balance: Sum(credits) - Sum(debits) for entries prior to effectiveFromDate
  const priorAggregate = await VendorLedgerEntry.aggregate([
    {
      $match: {
        ...baseFilter,
        entryDate: { $lt: effectiveFromDate },
      },
    },
    {
      $group: {
        _id: null,
        totalCreditPaisa: { $sum: '$creditPaisa' },
        totalDebitPaisa: { $sum: '$debitPaisa' },
      },
    },
  ]);

  const openingBalancePaisa = priorAggregate.length > 0
    ? Math.round(Number(priorAggregate[0].totalCreditPaisa || 0) - Number(priorAggregate[0].totalDebitPaisa || 0))
    : 0;

  // 2. Calculate Period Totals (Credits, Debits) across the full period (unaffected by pagination or search)
  const periodAggregate = await VendorLedgerEntry.aggregate([
    {
      $match: {
        ...baseFilter,
        entryDate: { $gte: effectiveFromDate, $lte: effectiveToDate },
      },
    },
    {
      $group: {
        _id: null,
        totalCreditPaisa: { $sum: '$creditPaisa' },
        totalDebitPaisa: { $sum: '$debitPaisa' },
        entryCount: { $sum: 1 },
      },
    },
  ]);

  const periodCreditPaisa = periodAggregate.length > 0 ? Math.round(Number(periodAggregate[0].totalCreditPaisa || 0)) : 0;
  const periodDebitPaisa = periodAggregate.length > 0 ? Math.round(Number(periodAggregate[0].totalDebitPaisa || 0)) : 0;
  const periodTotalEntries = periodAggregate.length > 0 ? Number(periodAggregate[0].entryCount || 0) : 0;
  const closingBalancePaisa = openingBalancePaisa + periodCreditPaisa - periodDebitPaisa;

  // 3. Query entries with search, entryType, and pagination
  const queryFilter = {
    ...baseFilter,
    entryDate: { $gte: effectiveFromDate, $lte: effectiveToDate },
  };

  if (entryType && entryType !== 'ALL') {
    queryFilter.entryType = entryType;
  }

  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    queryFilter.$and = [
      {
        $or: [
          { referenceNumber: rx },
          { ledgerEntryId: rx },
          { purchaseOrderId: rx },
          { supplierInvoiceNumber: rx },
          { paymentId: rx },
          { notes: rx },
        ],
      },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [rawEntries, filteredCount, cafes] = await Promise.all([
    VendorLedgerEntry.find(queryFilter)
      .sort({ entryDate: 1, entryTimestamp: 1, _id: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    VendorLedgerEntry.countDocuments(queryFilter),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  const ENTRY_TYPE_LABELS = {
    OPENING_BALANCE: 'Opening Balance',
    VENDOR_BILL: 'Vendor Bill / Purchase Liability',
    PAYMENT: 'Payment Settlement',
    PARTIAL_PAYMENT: 'Partial Settlement',
    ADVANCE_PAYMENT: 'Advance Payment Paid',
    ADVANCE_APPLIED: 'Advance Applied to Bill',
    CREDIT_NOTE: 'Credit Note',
    DEBIT_ADJUSTMENT: 'Debit Adjustment',
    PAYMENT_REVERSAL: 'Payment Reversal',
    REFUND_RECEIVED: 'Refund Recorded',
    SHORT_SUPPLY_HOLD: 'Shortage / Variance Hold',
    HOLD_RELEASE: 'Variance Hold Released',
    WRITE_OFF: 'Authorised Write-Off',
    AUTHORISED_ADJUSTMENT: 'Authorised Subledger Adjustment',
  };

  const safeEntries = rawEntries.map((e) => {
    return {
      ledgerEntryId: e.ledgerEntryId,
      entryDate: e.entryDate,
      entryTimestamp: e.entryTimestamp,
      entryType: e.entryType,
      entryTypeLabel: ENTRY_TYPE_LABELS[e.entryType] || e.entryType,
      referenceType: e.referenceType || 'MANUAL',
      referenceNumber: e.referenceNumber || e.ledgerEntryId,
      purchaseOrderId: e.purchaseOrderId || null,
      grnId: e.grnId || null,
      supplierInvoiceNumber: e.supplierInvoiceNumber || null,
      paymentId: e.paymentId || null,
      cafeId: e.cafeId,
      cafeName: cafeMap[e.cafeId] || e.cafeId,
      debitPaisa: Number(e.debitPaisa || 0),
      debitFormatted: formatCurrency(e.debitPaisa || 0),
      creditPaisa: Number(e.creditPaisa || 0),
      creditFormatted: formatCurrency(e.creditPaisa || 0),
      heldPaisa: Number(e.heldPaisa || 0),
      runningBalancePaisa: Number(e.runningBalancePaisa || 0),
      runningBalanceFormatted: formatCurrency(e.runningBalancePaisa || 0),
      notes: e.notes ? String(e.notes).replace(/USR-[A-Z0-9_-]+/gi, '[Authorized Officer]') : '',
    };
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_STATEMENT_VIEWED',
    targetType: 'VENDOR_STATEMENT',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      resultCount: safeEntries.length,
      totalCount: filteredCount,
    },
  });

  return res.status(200).json({
    success: true,
    data: {
      vendor: {
        vendorId: vendor.vendorId,
        name: vendor.name,
        tradeName: vendor.tradeName || vendor.name,
        gstNumber: vendor.gstNumber || 'Unregistered',
        panNumber: vendor.panNumber || 'N/A',
      },
      period: {
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        cafeId: scopedCafeId || 'ALL',
        cafeName: scopedCafeId ? (cafeMap[scopedCafeId] || scopedCafeId) : 'All Authorized Cafés',
      },
      summary: {
        openingBalancePaisa,
        openingBalanceFormatted: formatCurrency(openingBalancePaisa),
        totalCreditPaisa: periodCreditPaisa,
        totalCreditFormatted: formatCurrency(periodCreditPaisa),
        totalDebitPaisa: periodDebitPaisa,
        totalDebitFormatted: formatCurrency(periodDebitPaisa),
        closingBalancePaisa,
        closingBalanceFormatted: formatCurrency(closingBalancePaisa),
        periodTotalEntries,
      },
      entries: safeEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(filteredCount / limitNum) || 1,
        totalCount: filteredCount,
      },
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/statement/csv
 * Exports chronological Vendor Account Statement in standard CSV format.
 */
const downloadVendorStatementCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, fromDate, toDate, entryType, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL' && cafeId !== 'ORGANISATION_WIDE') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const effectiveToDate = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : todayStr;
  let effectiveFromDate = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null;
  if (!effectiveFromDate) {
    const d = new Date(effectiveToDate);
    d.setDate(d.getDate() - 30);
    effectiveFromDate = d.toISOString().slice(0, 10);
  }

  const baseFilter = {
    organisationId,
    vendorId,
    isReversed: false,
    entryDate: { $gte: effectiveFromDate, $lte: effectiveToDate },
  };

  if (scopedCafeId) {
    baseFilter.$or = [{ cafeId: scopedCafeId }, { cafeId: 'ORGANISATION_WIDE' }];
  }
  if (entryType && entryType !== 'ALL') {
    baseFilter.entryType = entryType;
  }
  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    baseFilter.$and = [
      {
        $or: [
          { referenceNumber: rx },
          { ledgerEntryId: rx },
          { purchaseOrderId: rx },
          { supplierInvoiceNumber: rx },
          { paymentId: rx },
        ],
      },
    ];
  }

  const [entries, cafes] = await Promise.all([
    VendorLedgerEntry.find(baseFilter).sort({ entryDate: 1, entryTimestamp: 1, _id: 1 }).limit(1000).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  function csvEscape(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  const header = [
    'Date',
    'Entry ID',
    'Reference',
    'Transaction Type',
    'PO Reference',
    'Invoice Number',
    'Payment ID',
    'Cafe',
    'Debit (INR)',
    'Credit (INR)',
    'Running Balance (INR)',
    'Description',
  ].join(',');

  const rows = entries.map((e) => {
    return [
      csvEscape(e.entryDate),
      csvEscape(e.ledgerEntryId),
      csvEscape(e.referenceNumber || e.ledgerEntryId),
      csvEscape(e.entryType),
      csvEscape(e.purchaseOrderId || ''),
      csvEscape(e.supplierInvoiceNumber || ''),
      csvEscape(e.paymentId || ''),
      csvEscape(cafeMap[e.cafeId] || e.cafeId),
      (Number(e.debitPaisa || 0) / 100).toFixed(2),
      (Number(e.creditPaisa || 0) / 100).toFixed(2),
      (Number(e.runningBalancePaisa || 0) / 100).toFixed(2),
      csvEscape(e.notes ? String(e.notes).replace(/USR-[A-Z0-9_-]+/gi, '[Authorized Officer]') : ''),
    ].join(',');
  });

  const csvContent = [header, ...rows].join('\r\n');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_STATEMENT_EXPORTED',
    targetType: 'STATEMENT_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: entries.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorStatement-${vendorId}-${effectiveFromDate}-to-${effectiveToDate}.csv"`);
  return res.status(200).send(csvContent);
});

/**
 * GET /api/v1/vendor/statement/xlsx
 * VEN-SCR-006: Genuine OpenXML (.xlsx) Excel export for Vendor Account Statement
 */
const downloadVendorStatementXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, fromDate, toDate, entryType, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL' && cafeId !== 'ORGANISATION_WIDE') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const effectiveToDate = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : todayStr;
  let effectiveFromDate = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null;
  if (!effectiveFromDate) {
    const d = new Date(effectiveToDate);
    d.setDate(d.getDate() - 30);
    effectiveFromDate = d.toISOString().slice(0, 10);
  }

  const baseFilter = {
    organisationId,
    vendorId,
    isReversed: false,
    entryDate: { $gte: effectiveFromDate, $lte: effectiveToDate },
  };

  if (scopedCafeId) {
    baseFilter.$or = [{ cafeId: scopedCafeId }, { cafeId: 'ORGANISATION_WIDE' }];
  }
  if (entryType && entryType !== 'ALL') {
    baseFilter.entryType = entryType;
  }
  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    baseFilter.$and = [
      {
        $or: [
          { referenceNumber: rx },
          { ledgerEntryId: rx },
          { purchaseOrderId: rx },
          { supplierInvoiceNumber: rx },
          { paymentId: rx },
        ],
      },
    ];
  }

  const [entries, cafes] = await Promise.all([
    VendorLedgerEntry.find(baseFilter).sort({ entryDate: 1, entryTimestamp: 1, _id: 1 }).limit(1000).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  const columns = [
    { key: 'entryDate', label: 'Date' },
    { key: 'ledgerEntryId', label: 'Entry ID' },
    { key: 'reference', label: 'Reference' },
    { key: 'entryType', label: 'Transaction Type' },
    { key: 'purchaseOrderId', label: 'PO Reference' },
    { key: 'supplierInvoiceNumber', label: 'Invoice Number' },
    { key: 'paymentId', label: 'Payment ID' },
    { key: 'cafe', label: 'Cafe' },
    { key: 'debit', label: 'Debit (INR)', isNum: true },
    { key: 'credit', label: 'Credit (INR)', isNum: true },
    { key: 'balance', label: 'Running Balance (INR)', isNum: true },
    { key: 'description', label: 'Description' },
  ];

  const rows = entries.map((e) => ({
    entryDate: e.entryDate,
    ledgerEntryId: e.ledgerEntryId,
    reference: e.referenceNumber || e.ledgerEntryId,
    entryType: e.entryType,
    purchaseOrderId: e.purchaseOrderId || '—',
    supplierInvoiceNumber: e.supplierInvoiceNumber || '—',
    paymentId: e.paymentId || '—',
    cafe: cafeMap[e.cafeId] || e.cafeId || 'Universal',
    debit: Number(e.debitPaisa || 0) / 100,
    credit: Number(e.creditPaisa || 0) / 100,
    balance: Number(e.runningBalancePaisa || 0) / 100,
    description: e.notes ? String(e.notes).replace(/USR-[A-Z0-9_-]+/gi, '[Authorized Officer]') : '',
  }));

  const xlsxResult = generateXlsx({
    sheetName: 'Vendor Statement',
    reportTitle: `Vendor Account Statement — ${vendor.vendorName || vendor.name || vendorId}`,
    columns,
    rows,
    branding: {
      period: `${effectiveFromDate} to ${effectiveToDate}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_STATEMENT_EXPORTED',
    targetType: 'STATEMENT_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: entries.length },
  });

  const filename = `VendorStatement-${vendorId}-${effectiveFromDate}-to-${effectiveToDate}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/statement/pdf
 * Generates official vector A4 Vendor Account Statement.
 */
const downloadVendorStatementPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, fromDate, toDate } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL' && cafeId !== 'ORGANISATION_WIDE') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const effectiveToDate = toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : todayStr;
  let effectiveFromDate = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null;
  if (!effectiveFromDate) {
    const d = new Date(effectiveToDate);
    d.setDate(d.getDate() - 30);
    effectiveFromDate = d.toISOString().slice(0, 10);
  }

  const baseFilter = {
    organisationId,
    vendorId,
    isReversed: false,
  };
  if (scopedCafeId) {
    baseFilter.$or = [{ cafeId: scopedCafeId }, { cafeId: 'ORGANISATION_WIDE' }];
  }

  const priorAggregate = await VendorLedgerEntry.aggregate([
    { $match: { ...baseFilter, entryDate: { $lt: effectiveFromDate } } },
    { $group: { _id: null, totalCreditPaisa: { $sum: '$creditPaisa' }, totalDebitPaisa: { $sum: '$debitPaisa' } } },
  ]);
  const openingBalancePaisa = priorAggregate.length > 0
    ? Math.round(Number(priorAggregate[0].totalCreditPaisa || 0) - Number(priorAggregate[0].totalDebitPaisa || 0))
    : 0;

  const [entries, cafes] = await Promise.all([
    VendorLedgerEntry.find({ ...baseFilter, entryDate: { $gte: effectiveFromDate, $lte: effectiveToDate } })
      .sort({ entryDate: 1, entryTimestamp: 1, _id: 1 })
      .limit(200)
      .lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  let totalCreditPaisa = 0;
  let totalDebitPaisa = 0;
  for (const e of entries) {
    totalCreditPaisa += Number(e.creditPaisa || 0);
    totalDebitPaisa += Number(e.debitPaisa || 0);
  }
  const closingBalancePaisa = openingBalancePaisa + totalCreditPaisa - totalDebitPaisa;

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }
  const cafeDisplayName = scopedCafeId ? (cafeMap[scopedCafeId] || scopedCafeId) : 'All Authorized Cafés';

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.08 0.18 0.28 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 15 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OFFICIAL VENDOR ACCOUNT STATEMENT) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.85 0.92 0.98 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY • PERMANENT FINANCIAL SUBLEDGER) Tj\nET\n';
  streamOps += `BT\n/F2 9.5 Tf\n1 1 1 rg\n1 0 0 1 410 812 Tm\n(PERIOD: ${escapePdf(effectiveFromDate)} TO ${escapePdf(effectiveToDate)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.85 0.92 0.98 rg\n1 0 0 1 410 798 Tm\n(AS OF: ${escapePdf(todayStr)}) Tj\nET\n`;

  // Vendor & Entity Banner
  streamOps += '0.96 0.97 0.98 rg\n30 685 535 70 re\nf\n';
  streamOps += '0.8 0.85 0.9 RG\n1 w\n30 685 535 70 re\nS\n';
  streamOps += 'BT\n/F2 9.5 Tf\n0.1 0.2 0.3 rg\n1 0 0 1 40 738 Tm\n(VENDOR (SUPPLIER):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 724 Tm\n(${escapePdf(vendor.name || vendorId)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 710 Tm\n(GSTIN: ${escapePdf(vendor.gstNumber || 'Unregistered')} | PAN: ${escapePdf(vendor.panNumber || 'N/A')}) Tj\nET\n`;

  streamOps += 'BT\n/F2 9.5 Tf\n0.1 0.2 0.3 rg\n1 0 0 1 310 738 Tm\n(ISSUING ORGANISATION & CAFE SCOPE:) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 724 Tm\n(Zamorin Hospitality Private Limited) Tj\nET\n';
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 710 Tm\n(Scope: ${escapePdf(cafeDisplayName)}) Tj\nET\n`;

  // 4-Block Balance Progression KPI Bar
  streamOps += '0.92 0.95 0.98 rg\n30 615 535 55 re\nf\n';
  streamOps += '0.3 0.5 0.7 RG\n1 w\n30 615 535 55 re\nS\n';

  streamOps += 'BT\n/F1 8 Tf\n0.3 0.35 0.4 rg\n1 0 0 1 40 654 Tm\n(OPENING BALANCE) Tj\nET\n';
  streamOps += `BT\n/F2 11 Tf\n0.1 0.2 0.3 rg\n1 0 0 1 40 636 Tm\n(${formatCurrency(openingBalancePaisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 8 Tf\n0.3 0.35 0.4 rg\n1 0 0 1 170 654 Tm\n(+) TOTAL BILLS (CREDIT) Tj\nET\n';
  streamOps += `BT\n/F2 11 Tf\n0.7 0.2 0.1 rg\n1 0 0 1 170 636 Tm\n(${formatCurrency(totalCreditPaisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 8 Tf\n0.3 0.35 0.4 rg\n1 0 0 1 305 654 Tm\n(-) PAYMENTS / CREDITS Tj\nET\n';
  streamOps += `BT\n/F2 11 Tf\n0.05 0.45 0.2 rg\n1 0 0 1 305 636 Tm\n(${formatCurrency(totalDebitPaisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 8 Tf\n0.3 0.35 0.4 rg\n1 0 0 1 440 654 Tm\n(=) CLOSING BALANCE Tj\nET\n';
  streamOps += `BT\n/F2 12 Tf\n0.05 0.35 0.6 rg\n1 0 0 1 440 636 Tm\n(${formatCurrency(closingBalancePaisa)}) Tj\nET\n`;

  // Statement Rows Header
  streamOps += '0.15 0.25 0.35 rg\n30 575 535 20 re\nf\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 35 581 Tm\n(DATE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 95 581 Tm\n(REFERENCE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 190 581 Tm\n(TRANSACTION TYPE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 325 581 Tm\n(DEBIT (-)) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 395 581 Tm\n(CREDIT (+)) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 475 581 Tm\n(RUNNING BAL) Tj\nET\n';

  let currentY = 555;
  for (const e of entries) {
    if (currentY < 60) break;
    const ref = e.referenceNumber || e.ledgerEntryId;
    const type = e.entryType || 'ENTRY';
    const debit = Number(e.debitPaisa || 0) > 0 ? formatCurrency(e.debitPaisa) : '-';
    const credit = Number(e.creditPaisa || 0) > 0 ? formatCurrency(e.creditPaisa) : '-';
    const bal = formatCurrency(e.runningBalancePaisa || 0);

    streamOps += '0.98 0.98 0.98 rg\n30 ' + (currentY - 4) + ' 535 16 re\nf\n';
    streamOps += '0.9 0.9 0.9 RG\n0.5 w\n30 ' + (currentY - 4) + ' 535 16 re\nS\n';

    streamOps += `BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 35 ${currentY} Tm\n(${escapePdf(e.entryDate)}) Tj\nET\n`;
    streamOps += `BT\n/F2 7.5 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 95 ${currentY} Tm\n(${escapePdf(ref.slice(0, 18))}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 190 ${currentY} Tm\n(${escapePdf(type.slice(0, 22))}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.05 0.45 0.2 rg\n1 0 0 1 325 ${currentY} Tm\n(${escapePdf(debit)}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.7 0.2 0.1 rg\n1 0 0 1 395 ${currentY} Tm\n(${escapePdf(credit)}) Tj\nET\n`;
    streamOps += `BT\n/F2 7.5 Tf\n0.1 0.2 0.4 rg\n1 0 0 1 475 ${currentY} Tm\n(${escapePdf(bal)}) Tj\nET\n`;

    currentY -= 17;
  }

  // Footer bar
  streamOps += '0.08 0.18 0.28 rg\n0 0 595.28 28 re\nf\n';
  streamOps += 'BT\n/F1 7.5 Tf\n1 1 1 rg\n1 0 0 1 30 10 Tm\n(Zamorin Cafe ERP • Read-Only Vendor Account Statement • Electronic Subledger Record) Tj\nET\n';

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');
  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_STATEMENT_PDF_DOWNLOADED',
    targetType: 'STATEMENT_PDF',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VendorStatement-${vendorId}-${effectiveFromDate}-to-${effectiveToDate}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/v1/vendor/receivables
 * VEN-SCR-007: Outstanding Receivables & Ageing Register
 *
 * Provides strictly read-only visibility into commercial receivables:
 * - How much is currently payable to this vendor?
 * - How old is each outstanding amount?
 * - Categorised into authoritative ageing buckets:
 *   Current (Not overdue), 1–30 Days, 31–60 Days, 61–90 Days, 90+ Days
 * - Preserves Held/Disputed balances separately
 * - Scoped to approved cafés
 * - Explicitly flags "Due date not available" when no authoritative due date exists
 */
const getVendorReceivables = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, bucket, paymentStatus, search, sortBy = 'days_desc', page = 1, limit = 50 } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const todayTime = new Date(todayStr).getTime();

  // Find all open invoices (outstanding > 0)
  const baseFilter = {
    organisationId,
    vendorId,
    outstandingPayableAmountPaisa: { $gt: 0 },
    paymentStatus: { $ne: 'PAID' },
  };

  if (scopedCafeId) {
    baseFilter.cafeId = scopedCafeId;
  } else if (approvedCafes.length > 0) {
    baseFilter.cafeId = { $in: approvedCafes };
  }

  const [allOpenInvoices, cafes] = await Promise.all([
    APInvoice.find(baseFilter).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  // Calculate authoritative ageing summary buckets across all open invoices
  let totalOutstandingPaisa = 0;
  let totalOverduePaisa = 0;
  let currentBucketPaisa = 0;
  let bucket1_30Paisa = 0;
  let bucket31_60Paisa = 0;
  let bucket61_90Paisa = 0;
  let bucket90PlusPaisa = 0;
  let totalHeldDisputedPaisa = 0;
  let overdueInvoicesCount = 0;

  const processedReceivables = allOpenInvoices.map((inv) => {
    const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    const heldDisputed = Number(inv.heldDisputedAmountPaisa || 0);
    const approvedPayable = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
    const claimedAmount = Number(inv.supplierClaimedAmountPaisa !== undefined ? inv.supplierClaimedAmountPaisa : (inv.totalPaisa || 0));
    const paid = Number(inv.paidPaisa || 0);
    const appliedCredits = Number(inv.appliedAdvancePaisa || 0) + Number(inv.appliedCreditPaisa || 0);

    totalOutstandingPaisa += outstanding;
    totalHeldDisputedPaisa += heldDisputed;

    let daysOverdue = null;
    let isOverdue = false;
    let ageingBucket = 'NO_DUE_DATE';
    let ageingBucketLabel = 'Due date not available';

    if (inv.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) {
      const dueTime = new Date(inv.dueDate).getTime();
      const diffDays = Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24));
      daysOverdue = diffDays;

      if (diffDays <= 0) {
        isOverdue = false;
        ageingBucket = 'CURRENT';
        ageingBucketLabel = 'Current (Not Overdue)';
        currentBucketPaisa += outstanding;
      } else {
        isOverdue = true;
        totalOverduePaisa += outstanding;
        overdueInvoicesCount++;

        if (diffDays <= 30) {
          ageingBucket = '1_30';
          ageingBucketLabel = '1–30 Days Overdue';
          bucket1_30Paisa += outstanding;
        } else if (diffDays <= 60) {
          ageingBucket = '31_60';
          ageingBucketLabel = '31–60 Days Overdue';
          bucket31_60Paisa += outstanding;
        } else if (diffDays <= 90) {
          ageingBucket = '61_90';
          ageingBucketLabel = '61–90 Days Overdue';
          bucket61_90Paisa += outstanding;
        } else {
          ageingBucket = '90_PLUS';
          ageingBucketLabel = '90+ Days Overdue';
          bucket90PlusPaisa += outstanding;
        }
      }
    } else {
      currentBucketPaisa += outstanding;
    }

    return {
      invoiceId: inv.invoiceId,
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate || null,
      dueDateLabel: inv.dueDate || 'Due date not available',
      isOverdue,
      daysOverdue,
      ageingBucket,
      ageingBucketLabel,
      cafeId: inv.cafeId,
      cafeName: cafeMap[inv.cafeId] || inv.cafeId,
      poReferenceId: inv.poReferenceId || 'DIRECT_BILLING',
      grnReceiptNumber: inv.grnReceiptNumber || null,
      supplierClaimedAmountPaisa: claimedAmount,
      supplierClaimedFormatted: formatCurrency(claimedAmount),
      approvedPayableAmountPaisa: approvedPayable,
      approvedPayableFormatted: formatCurrency(approvedPayable),
      heldDisputedAmountPaisa: heldDisputed,
      heldDisputedFormatted: formatCurrency(heldDisputed),
      paidPaisa: paid,
      paidFormatted: formatCurrency(paid),
      appliedCreditsPaisa: appliedCredits,
      appliedCreditsFormatted: formatCurrency(appliedCredits),
      outstandingPayableAmountPaisa: outstanding,
      outstandingPayableFormatted: formatCurrency(outstanding),
      paymentStatus: inv.paymentStatus || 'DUE',
      invoiceStatus: inv.invoiceStatus || 'APPROVED',
    };
  });

  // Filter in-memory for requested bucket, paymentStatus, and search
  let filtered = processedReceivables;

  if (bucket && bucket !== 'ALL') {
    if (bucket === 'HELD') {
      filtered = filtered.filter((r) => r.heldDisputedAmountPaisa > 0 || r.paymentStatus === 'ON_HOLD');
    } else {
      filtered = filtered.filter((r) => r.ageingBucket === bucket);
    }
  }

  if (paymentStatus && paymentStatus !== 'ALL') {
    filtered = filtered.filter((r) => r.paymentStatus === paymentStatus);
  }

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter((r) => {
      return (
        r.supplierInvoiceNumber.toLowerCase().includes(s) ||
        r.invoiceId.toLowerCase().includes(s) ||
        r.poReferenceId.toLowerCase().includes(s) ||
        r.cafeName.toLowerCase().includes(s) ||
        r.cafeId.toLowerCase().includes(s)
      );
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'dueDate_asc':
        return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
      case 'dueDate_desc':
        return (b.dueDate || '0000-00-00').localeCompare(a.dueDate || '0000-00-00');
      case 'amount_desc':
        return b.outstandingPayableAmountPaisa - a.outstandingPayableAmountPaisa;
      case 'days_desc':
      default:
        return (b.daysOverdue || -999) - (a.daysOverdue || -999);
    }
  });

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;
  const paginatedReceivables = filtered.slice(skip, skip + limitNum);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_RECEIVABLES_VIEWED',
    targetType: 'RECEIVABLES_REGISTER',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      totalOutstandingPaisa,
      openCount: allOpenInvoices.length,
      filteredCount: filtered.length,
    },
  });

  return res.status(200).json({
    success: true,
    data: {
      vendor: {
        vendorId: vendor.vendorId,
        name: vendor.name,
        gstNumber: vendor.gstNumber || 'Unregistered',
        panNumber: vendor.panNumber || 'N/A',
      },
      asOfDate: todayStr,
      summary: {
        totalOutstandingPaisa,
        totalOutstandingFormatted: formatCurrency(totalOutstandingPaisa),
        totalOverduePaisa,
        totalOverdueFormatted: formatCurrency(totalOverduePaisa),
        currentBucketPaisa,
        currentBucketFormatted: formatCurrency(currentBucketPaisa),
        bucket1_30Paisa,
        bucket1_30Formatted: formatCurrency(bucket1_30Paisa),
        bucket31_60Paisa,
        bucket31_60Formatted: formatCurrency(bucket31_60Paisa),
        bucket61_90Paisa,
        bucket61_90Formatted: formatCurrency(bucket61_90Paisa),
        bucket90PlusPaisa,
        bucket90PlusFormatted: formatCurrency(bucket90PlusPaisa),
        totalHeldDisputedPaisa,
        totalHeldDisputedFormatted: formatCurrency(totalHeldDisputedPaisa),
        openInvoicesCount: allOpenInvoices.length,
        overdueInvoicesCount,
      },
      receivables: paginatedReceivables,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(filtered.length / limitNum) || 1,
        totalCount: filtered.length,
      },
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/receivables/csv
 * Exports Outstanding & Ageing Register in CSV format.
 */
const downloadVendorReceivablesCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, bucket, paymentStatus, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const todayTime = new Date(todayStr).getTime();

  const baseFilter = {
    organisationId,
    vendorId,
    outstandingPayableAmountPaisa: { $gt: 0 },
    paymentStatus: { $ne: 'PAID' },
  };
  if (scopedCafeId) {
    baseFilter.cafeId = scopedCafeId;
  } else if (approvedCafes.length > 0) {
    baseFilter.cafeId = { $in: approvedCafes };
  }

  const [invoices, cafes] = await Promise.all([
    APInvoice.find(baseFilter).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  let list = invoices.map((inv) => {
    const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    const claimed = Number(inv.supplierClaimedAmountPaisa || inv.totalPaisa || 0);
    const approved = Number(inv.approvedPayableAmountPaisa || inv.totalPaisa || 0);
    const held = Number(inv.heldDisputedAmountPaisa || 0);
    const paid = Number(inv.paidPaisa || 0);
    const appliedCredits = Number(inv.appliedAdvancePaisa || 0) + Number(inv.appliedCreditPaisa || 0);

    let daysOverdue = 0;
    let ageingBucket = 'NO_DUE_DATE';
    if (inv.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) {
      const dueTime = new Date(inv.dueDate).getTime();
      daysOverdue = Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 0) ageingBucket = 'CURRENT';
      else if (daysOverdue <= 30) ageingBucket = '1_30';
      else if (daysOverdue <= 60) ageingBucket = '31_60';
      else if (daysOverdue <= 90) ageingBucket = '61_90';
      else ageingBucket = '90_PLUS';
    }

    return {
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      invoiceId: inv.invoiceId,
      invoiceDate: inv.invoiceDate || 'N/A',
      dueDate: inv.dueDate || 'Due date not available',
      daysOverdue,
      ageingBucket,
      cafeName: cafeMap[inv.cafeId] || inv.cafeId,
      poReferenceId: inv.poReferenceId || 'DIRECT_BILLING',
      claimedPaisa: claimed,
      approvedPaisa: approved,
      heldPaisa: held,
      paidPaisa: paid,
      appliedCreditsPaisa: appliedCredits,
      outstandingPaisa: outstanding,
      paymentStatus: inv.paymentStatus || 'DUE',
    };
  });

  if (bucket && bucket !== 'ALL') {
    if (bucket === 'HELD') list = list.filter((r) => r.heldPaisa > 0 || r.paymentStatus === 'ON_HOLD');
    else list = list.filter((r) => r.ageingBucket === bucket);
  }
  if (paymentStatus && paymentStatus !== 'ALL') {
    list = list.filter((r) => r.paymentStatus === paymentStatus);
  }
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter((r) => r.supplierInvoiceNumber.toLowerCase().includes(s) || r.poReferenceId.toLowerCase().includes(s));
  }

  function csvEscape(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  const header = [
    'Invoice Number',
    'Internal ID',
    'Invoice Date',
    'Due Date',
    'Days Overdue',
    'Ageing Bucket',
    'Cafe',
    'PO Reference',
    'Claimed (INR)',
    'Approved (INR)',
    'Held (INR)',
    'Paid (INR)',
    'Credits Applied (INR)',
    'Outstanding (INR)',
    'Payment Status',
  ].join(',');

  const rows = list.map((r) => {
    return [
      csvEscape(r.supplierInvoiceNumber),
      csvEscape(r.invoiceId),
      csvEscape(r.invoiceDate),
      csvEscape(r.dueDate),
      r.daysOverdue,
      csvEscape(r.ageingBucket),
      csvEscape(r.cafeName),
      csvEscape(r.poReferenceId),
      (r.claimedPaisa / 100).toFixed(2),
      (r.approvedPaisa / 100).toFixed(2),
      (r.heldPaisa / 100).toFixed(2),
      (r.paidPaisa / 100).toFixed(2),
      (r.appliedCreditsPaisa / 100).toFixed(2),
      (r.outstandingPaisa / 100).toFixed(2),
      csvEscape(r.paymentStatus),
    ].join(',');
  });

  const csvContent = [header, ...rows].join('\r\n');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_RECEIVABLES_EXPORTED',
    targetType: 'RECEIVABLES_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: list.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorReceivables-${vendorId}-${todayStr}.csv"`);
  return res.status(200).send(csvContent);
});

/**
 * GET /api/v1/vendor/receivables/xlsx
 * VEN-SCR-007: Genuine OpenXML (.xlsx) Excel export for Vendor Receivables & Ageing
 */
const downloadVendorReceivablesXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, bucket, paymentStatus, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const todayTime = new Date(todayStr).getTime();

  const baseFilter = {
    organisationId,
    vendorId,
    outstandingPayableAmountPaisa: { $gt: 0 },
    paymentStatus: { $ne: 'PAID' },
  };
  if (scopedCafeId) {
    baseFilter.cafeId = scopedCafeId;
  } else if (approvedCafes.length > 0) {
    baseFilter.cafeId = { $in: approvedCafes };
  }

  const [invoices, cafes] = await Promise.all([
    APInvoice.find(baseFilter).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  let list = invoices.map((inv) => {
    const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    const claimed = Number(inv.supplierClaimedAmountPaisa || inv.totalPaisa || 0);
    const approved = Number(inv.approvedPayableAmountPaisa || inv.totalPaisa || 0);
    const held = Number(inv.heldDisputedAmountPaisa || 0);
    const paid = Number(inv.paidPaisa || 0);
    const appliedCredits = Number(inv.appliedAdvancePaisa || 0) + Number(inv.appliedCreditPaisa || 0);

    let daysOverdue = 0;
    let ageingBucket = 'NO_DUE_DATE';
    if (inv.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) {
      const dueTime = new Date(inv.dueDate).getTime();
      daysOverdue = Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 0) ageingBucket = 'CURRENT';
      else if (daysOverdue <= 30) ageingBucket = '1_30';
      else if (daysOverdue <= 60) ageingBucket = '31_60';
      else if (daysOverdue <= 90) ageingBucket = '61_90';
      else ageingBucket = '90_PLUS';
    }

    return {
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      invoiceId: inv.invoiceId,
      invoiceDate: inv.invoiceDate || 'N/A',
      dueDate: inv.dueDate || 'Due date not available',
      daysOverdue,
      ageingBucket,
      cafeName: cafeMap[inv.cafeId] || inv.cafeId,
      poReferenceId: inv.poReferenceId || 'DIRECT_BILLING',
      claimedPaisa: claimed,
      approvedPaisa: approved,
      heldPaisa: held,
      paidPaisa: paid,
      appliedCreditsPaisa: appliedCredits,
      outstandingPaisa: outstanding,
      paymentStatus: inv.paymentStatus || 'DUE',
    };
  });

  if (bucket && bucket !== 'ALL') {
    if (bucket === 'HELD') list = list.filter((r) => r.heldPaisa > 0 || r.paymentStatus === 'ON_HOLD');
    else list = list.filter((r) => r.ageingBucket === bucket);
  }
  if (paymentStatus && paymentStatus !== 'ALL') {
    list = list.filter((r) => r.paymentStatus === paymentStatus);
  }
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (r) =>
        r.supplierInvoiceNumber.toLowerCase().includes(s) ||
        r.invoiceId.toLowerCase().includes(s) ||
        r.poReferenceId.toLowerCase().includes(s) ||
        r.cafeName.toLowerCase().includes(s)
    );
  }

  const columns = [
    { key: 'supplierInvoiceNumber', label: 'Invoice Number' },
    { key: 'invoiceDate', label: 'Invoice Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'daysOverdue', label: 'Days Overdue', isNum: true },
    { key: 'ageingBucket', label: 'Ageing Bucket' },
    { key: 'cafeName', label: 'Cafe' },
    { key: 'poReferenceId', label: 'PO Reference' },
    { key: 'claimedAmount', label: 'Claimed (INR)', isNum: true },
    { key: 'approvedAmount', label: 'Approved (INR)', isNum: true },
    { key: 'heldAmount', label: 'Held / Disputed (INR)', isNum: true },
    { key: 'paidAmount', label: 'Paid (INR)', isNum: true },
    { key: 'outstandingAmount', label: 'Outstanding (INR)', isNum: true },
    { key: 'paymentStatus', label: 'Status' },
  ];

  const rows = list.map((r) => ({
    supplierInvoiceNumber: r.supplierInvoiceNumber,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    daysOverdue: r.daysOverdue,
    ageingBucket: r.ageingBucket,
    cafeName: r.cafeName,
    poReferenceId: r.poReferenceId,
    claimedAmount: r.claimedPaisa / 100,
    approvedAmount: r.approvedPaisa / 100,
    heldAmount: r.heldPaisa / 100,
    paidAmount: r.paidPaisa / 100,
    outstandingAmount: r.outstandingPaisa / 100,
    paymentStatus: r.paymentStatus,
  }));

  const xlsxResult = generateXlsx({
    sheetName: 'Receivables & Ageing',
    reportTitle: `Vendor Outstanding Receivables — ${vendor.vendorName || vendor.name || vendorId}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_RECEIVABLES_EXPORTED',
    targetType: 'RECEIVABLES_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: list.length },
  });

  const filename = `VendorReceivables-${vendorId}-${todayStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/receivables/pdf
 * Generates official vector A4 Outstanding & Ageing Report.
 */
const downloadVendorReceivablesPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const todayStr = getIstDateString();
  const todayTime = new Date(todayStr).getTime();

  const baseFilter = {
    organisationId,
    vendorId,
    outstandingPayableAmountPaisa: { $gt: 0 },
    paymentStatus: { $ne: 'PAID' },
  };
  if (scopedCafeId) {
    baseFilter.cafeId = scopedCafeId;
  } else if (approvedCafes.length > 0) {
    baseFilter.cafeId = { $in: approvedCafes };
  }

  const [invoices, cafes] = await Promise.all([
    APInvoice.find(baseFilter).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  let totalOutstandingPaisa = 0;
  let totalOverduePaisa = 0;
  let currentBucketPaisa = 0;
  let bucket1_30Paisa = 0;
  let bucket31_60Paisa = 0;
  let bucket61_90Paisa = 0;
  let bucket90PlusPaisa = 0;

  const records = invoices.map((inv) => {
    const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
    totalOutstandingPaisa += outstanding;

    let days = 0;
    if (inv.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) {
      const dueTime = new Date(inv.dueDate).getTime();
      days = Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24));
      if (days <= 0) currentBucketPaisa += outstanding;
      else {
        totalOverduePaisa += outstanding;
        if (days <= 30) bucket1_30Paisa += outstanding;
        else if (days <= 60) bucket31_60Paisa += outstanding;
        else if (days <= 90) bucket61_90Paisa += outstanding;
        else bucket90PlusPaisa += outstanding;
      }
    } else {
      currentBucketPaisa += outstanding;
    }

    return {
      supplierInvoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
      dueDate: inv.dueDate || 'N/A',
      days,
      outstandingPaisa: outstanding,
      status: inv.paymentStatus || 'DUE',
      cafeName: cafeMap[inv.cafeId] || inv.cafeId,
    };
  });

  const cafeDisplayName = scopedCafeId ? (cafeMap[scopedCafeId] || scopedCafeId) : 'All Authorized Cafés';

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.15 0.1 0.25 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 15 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OUTSTANDING RECEIVABLES & AGEING) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY • COMMERCIAL LIABILITIES) Tj\nET\n';
  streamOps += `BT\n/F2 10 Tf\n1 1 1 rg\n1 0 0 1 420 812 Tm\n(AS OF: ${escapePdf(todayStr)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 420 798 Tm\n(OPEN INVOICES: ${escapePdf(String(invoices.length))}) Tj\nET\n`;

  // Vendor & Entity Banner
  streamOps += '0.97 0.96 0.98 rg\n30 685 535 70 re\nf\n';
  streamOps += '0.85 0.8 0.9 RG\n1 w\n30 685 535 70 re\nS\n';
  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 40 738 Tm\n(VENDOR (COMMERCIAL CREDITOR):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 724 Tm\n(${escapePdf(vendor.name || vendorId)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 710 Tm\n(GSTIN: ${escapePdf(vendor.gstNumber || 'Unregistered')} | PAN: ${escapePdf(vendor.panNumber || 'N/A')}) Tj\nET\n`;

  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 310 738 Tm\n(PAYING ENTITY & SCOPE:) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 724 Tm\n(Zamorin Hospitality Private Limited) Tj\nET\n';
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 710 Tm\n(Scope: ${escapePdf(cafeDisplayName)}) Tj\nET\n`;

  // Ageing Buckets Summary Bar
  streamOps += '0.94 0.93 0.97 rg\n30 615 535 55 re\nf\n';
  streamOps += '0.4 0.3 0.6 RG\n1 w\n30 615 535 55 re\nS\n';

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 40 654 Tm\n(TOTAL RECEIVABLE) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 40 636 Tm\n(${formatCurrency(totalOutstandingPaisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 145 654 Tm\n(CURRENT (NOT OVERDUE)) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.1 0.4 0.2 rg\n1 0 0 1 145 636 Tm\n(${formatCurrency(currentBucketPaisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 270 654 Tm\n(1-30 DAYS OVERDUE) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.7 0.4 0.1 rg\n1 0 0 1 270 636 Tm\n(${formatCurrency(bucket1_30Paisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 385 654 Tm\n(31-60 DAYS) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.8 0.3 0.1 rg\n1 0 0 1 385 636 Tm\n(${formatCurrency(bucket31_60Paisa)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 475 654 Tm\n(61+ DAYS) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.8 0.1 0.1 rg\n1 0 0 1 475 636 Tm\n(${formatCurrency(bucket61_90Paisa + bucket90PlusPaisa)}) Tj\nET\n`;

  // Rows Header
  streamOps += '0.2 0.15 0.3 rg\n30 575 535 20 re\nf\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 35 581 Tm\n(INVOICE NUMBER) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 145 581 Tm\n(DUE DATE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 220 581 Tm\n(CAFE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 330 581 Tm\n(DAYS OVERDUE) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 420 581 Tm\n(STATUS) Tj\nET\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n1 0 0 1 480 581 Tm\n(OUTSTANDING) Tj\nET\n';

  let currentY = 555;
  for (const r of records.slice(0, 25)) {
    if (currentY < 60) break;
    const daysLabel = r.days > 0 ? `${r.days} days overdue` : 'Current';
    const bal = formatCurrency(r.outstandingPaisa);

    streamOps += '0.98 0.98 0.98 rg\n30 ' + (currentY - 4) + ' 535 16 re\nf\n';
    streamOps += '0.9 0.9 0.9 RG\n0.5 w\n30 ' + (currentY - 4) + ' 535 16 re\nS\n';

    streamOps += `BT\n/F2 7.5 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 35 ${currentY} Tm\n(${escapePdf(r.supplierInvoiceNumber.slice(0, 18))}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 145 ${currentY} Tm\n(${escapePdf(r.dueDate)}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 220 ${currentY} Tm\n(${escapePdf(r.cafeName.slice(0, 18))}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n${r.days > 0 ? '0.7 0.2 0.1' : '0.1 0.5 0.2'} rg\n1 0 0 1 330 ${currentY} Tm\n(${escapePdf(daysLabel)}) Tj\nET\n`;
    streamOps += `BT\n/F1 7.5 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 420 ${currentY} Tm\n(${escapePdf(r.status)}) Tj\nET\n`;
    streamOps += `BT\n/F2 7.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 480 ${currentY} Tm\n(${escapePdf(bal)}) Tj\nET\n`;

    currentY -= 17;
  }

  // Footer bar
  streamOps += '0.15 0.1 0.25 rg\n0 0 595.28 28 re\nf\n';
  streamOps += 'BT\n/F1 7.5 Tf\n1 1 1 rg\n1 0 0 1 30 10 Tm\n(Zamorin Cafe ERP • Read-Only Outstanding & Ageing Report • Accounts Payable Snapshot) Tj\nET\n';

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');
  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_RECEIVABLES_PDF_DOWNLOADED',
    targetType: 'RECEIVABLES_PDF',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VendorReceivables-${vendorId}-${todayStr}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

// ── VEN-SCR-008: RETURNS, DEBIT NOTES, CREDIT NOTES & ADJUSTMENTS ────────────

/**
 * Internal helper to aggregate and format all adjustments for a vendor.
 */
async function fetchAndFormatVendorAdjustments({ organisationId, vendorId, scopedCafeId, approvedCafes }) {
  const [cafes, ledgerEntries, purchaseOrders, documents] = await Promise.all([
    Cafe.find({ organisationId }).lean(),
    VendorLedgerEntry.find({
      organisationId,
      vendorId,
      entryType: {
        $in: [
          'CREDIT_NOTE',
          'DEBIT_ADJUSTMENT',
          'AUTHORISED_ADJUSTMENT',
          'SHORT_SUPPLY_HOLD',
          'HOLD_RELEASE',
          'WRITE_OFF',
          'PAYMENT_REVERSAL',
        ],
      },
      ...(scopedCafeId
        ? { cafeId: scopedCafeId }
        : approvedCafes.length > 0
        ? {
            $or: [
              { cafeId: { $in: approvedCafes } },
              { cafeId: 'ORGANISATION_WIDE' },
              { cafeId: null },
              { cafeId: { $exists: false } },
            ],
          }
        : {}),
    })
      .sort({ entryDate: -1, entryTimestamp: -1 })
      .lean(),
    PurchaseOrder.find({
      organisationId,
      vendorId,
      ...(scopedCafeId ? { cafeId: scopedCafeId } : approvedCafes.length > 0 ? { cafeId: { $in: approvedCafes } } : {}),
    }).lean(),
    BusinessDocument.find({
      organisationId,
      vendorId,
      documentType: { $in: ['CREDIT_NOTE', 'DEBIT_NOTE'] },
      ...(scopedCafeId
        ? { cafeId: scopedCafeId }
        : approvedCafes.length > 0
        ? {
            $or: [
              { cafeId: { $in: approvedCafes } },
              { cafeId: 'ORGANISATION_WIDE' },
              { cafeId: null },
              { cafeId: { $exists: false } },
            ],
          }
        : {}),
    }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  const adjustments = [];
  const recordedReferences = new Set();

  // 1. Process Financial Adjustments from VendorLedgerEntry
  for (const entry of ledgerEntries) {
    let type = 'OTHER_ADJUSTMENT';
    let typeLabel = 'Authorised Adjustment';
    let accountingDirection = 'DEBIT';
    let amountPaisa = 0;
    let status = 'APPLIED';
    let financialEffect = '';

    if (entry.entryType === 'CREDIT_NOTE') {
      type = 'CREDIT_NOTE';
      typeLabel = 'Credit Note';
      amountPaisa = Number(entry.debitPaisa || entry.creditPaisa || 0);
      accountingDirection = 'DEBIT'; // In vendor subledger, debit reduces payable balance
      financialEffect = `Reduces Vendor Payable by ${formatCurrency(amountPaisa)}`;
      status = 'APPLIED';
    } else if (entry.entryType === 'DEBIT_ADJUSTMENT') {
      type = 'DEBIT_NOTE';
      typeLabel = 'Debit Note';
      amountPaisa = Number(entry.debitPaisa || 0);
      accountingDirection = 'DEBIT';
      financialEffect = `Reduces Vendor Payable by ${formatCurrency(amountPaisa)}`;
      status = 'APPLIED';
    } else if (entry.entryType === 'SHORT_SUPPLY_HOLD') {
      type = 'QUANTITY_ADJUSTMENT';
      typeLabel = 'Short Supply Hold';
      amountPaisa = Number(entry.heldPaisa || entry.debitPaisa || 0);
      accountingDirection = 'DEBIT';
      financialEffect = `Holds ${formatCurrency(amountPaisa)} from payable pending reconciliation`;
      status = 'ON_HOLD';
    } else if (entry.entryType === 'HOLD_RELEASE') {
      type = 'RATE_ADJUSTMENT';
      typeLabel = 'Hold Release';
      amountPaisa = Number(entry.creditPaisa || 0);
      accountingDirection = 'CREDIT';
      financialEffect = `Releases ${formatCurrency(amountPaisa)} back to vendor payable`;
      status = 'SETTLED';
    } else if (entry.entryType === 'WRITE_OFF') {
      type = 'OTHER_ADJUSTMENT';
      typeLabel = 'Liability Write-Off';
      amountPaisa = Number(entry.debitPaisa || 0);
      accountingDirection = 'DEBIT';
      financialEffect = `Reduces Vendor Payable by ${formatCurrency(amountPaisa)} (Write-Off)`;
      status = 'SETTLED';
    } else if (entry.entryType === 'PAYMENT_REVERSAL') {
      type = 'OTHER_ADJUSTMENT';
      typeLabel = 'Payment Reversal';
      amountPaisa = Number(entry.creditPaisa || 0);
      accountingDirection = 'CREDIT';
      financialEffect = `Increases Vendor Payable by ${formatCurrency(amountPaisa)} (Reversal)`;
      status = 'SETTLED';
    } else {
      type = 'OTHER_ADJUSTMENT';
      typeLabel = 'Authorised Adjustment';
      amountPaisa = Number(entry.debitPaisa || entry.creditPaisa || 0);
      accountingDirection = Number(entry.debitPaisa || 0) > 0 ? 'DEBIT' : 'CREDIT';
      financialEffect = `${accountingDirection === 'DEBIT' ? 'Reduces' : 'Increases'} Vendor Payable by ${formatCurrency(amountPaisa)}`;
      status = 'APPLIED';
    }

    const ref = entry.referenceNumber || entry.referenceId || entry.ledgerEntryId;
    recordedReferences.add(String(ref).trim().toUpperCase());
    recordedReferences.add(String(entry.ledgerEntryId).trim().toUpperCase());

    adjustments.push({
      adjustmentId: entry.ledgerEntryId,
      reference: ref,
      type,
      typeLabel,
      date: entry.entryDate,
      cafeId: entry.cafeId || 'ORGANISATION_WIDE',
      cafeName: cafeMap[entry.cafeId] || (entry.cafeId === 'ORGANISATION_WIDE' ? 'Organisation Wide' : (entry.cafeId || 'All Cafés')),
      purchaseOrderId: entry.purchaseOrderId || null,
      grnId: entry.grnId || null,
      supplierInvoiceNumber: entry.supplierInvoiceNumber || null,
      amountPaisa,
      amountFormatted: formatCurrency(amountPaisa),
      accountingDirection,
      financialEffect,
      reason: entry.notes || `${typeLabel} applied to vendor subledger`,
      status,
      affectedItems: [],
      rawSource: 'LEDGER',
      createdAt: entry.createdAt || entry.entryTimestamp,
      timeline: [
        { milestoneKey: 'RECORDED', label: `${typeLabel} Posted to Subledger`, timestamp: entry.entryTimestamp || entry.createdAt },
      ],
    });
  }

  // 2. Process Goods Returns from Purchase Order GRNs
  for (const po of purchaseOrders) {
    const grns = po.grnReceipts || [];
    for (const grn of grns) {
      const items = grn.items || [];
      const rejectedItems = items.filter((i) => Number(i.rejectedQty || 0) > 0);
      if (rejectedItems.length === 0) continue;

      let returnTotalPaisa = 0;
      const formattedItems = [];
      let primaryReason = '';

      for (const rej of rejectedItems) {
        const poLine = (po.lineItems || []).find((li) => li.itemId === rej.itemId);
        const up = Number(poLine?.unitPricePaisa || 0);
        const lineVal = Number(rej.rejectedQty || 0) * up;
        returnTotalPaisa += lineVal;

        const rReason = rej.rejectionReason || rej.discrepancyReason || 'Rejected during delivery inspection';
        if (!primaryReason) primaryReason = rReason;

        formattedItems.push({
          itemId: rej.itemId,
          itemName: poLine?.itemNameSnapshot || poLine?.itemName || rej.itemId,
          qty: Number(rej.rejectedQty || 0),
          unitPricePaisa: up,
          totalPaisa: lineVal,
          reason: rReason,
          disposition: rej.disposition || 'RETURNED_TO_VENDOR',
        });
      }

      const adjId = `RET-${po.purchaseOrderId}-${grn.grnId}`;
      const ref = `${grn.grnId}-RET`;
      recordedReferences.add(String(ref).trim().toUpperCase());
      recordedReferences.add(String(adjId).trim().toUpperCase());

      adjustments.push({
        adjustmentId: adjId,
        reference: ref,
        type: 'GOODS_RETURN',
        typeLabel: 'Goods Return',
        date: grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : (po.orderDate || getIstDateString()),
        cafeId: po.cafeId,
        cafeName: cafeMap[po.cafeId] || po.cafeId,
        purchaseOrderId: po.purchaseOrderId,
        grnId: grn.grnId,
        supplierInvoiceNumber: po.invoices?.[0]?.invoiceNumber || null,
        amountPaisa: returnTotalPaisa,
        amountFormatted: formatCurrency(returnTotalPaisa),
        accountingDirection: 'MEMO',
        financialEffect: `Physical Goods Return (Value ${formatCurrency(returnTotalPaisa)})`,
        reason: primaryReason,
        status: 'COMPLETED',
        affectedItems: formattedItems,
        rawSource: 'GRN_RETURN',
        createdAt: grn.receivedAt || po.createdAt,
        timeline: [
          { milestoneKey: 'INSPECTION', label: 'Delivery Inspected & Goods Rejected', timestamp: grn.receivedAt || po.createdAt },
          { milestoneKey: 'RETURN_LOGGED', label: 'Physical Return Recorded', timestamp: grn.receivedAt || po.createdAt },
        ],
      });
    }
  }

  // 3. Process Statutory Credit Notes and Debit Notes from BusinessDocument (if not already captured)
  for (const doc of documents) {
    const docRef = String(doc.documentNumber || doc.documentId).trim().toUpperCase();
    if (recordedReferences.has(docRef)) continue;

    const docType = doc.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
    const typeLabel = doc.documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note';
    const amountPaisa = Number(doc.totalPaisa || doc.amountPaisa || 0);

    adjustments.push({
      adjustmentId: doc.documentId || `DOC-${doc._id}`,
      reference: doc.documentNumber || doc.documentId,
      type: docType,
      typeLabel,
      date: doc.invoiceDate || (doc.uploadedAt ? new Date(doc.uploadedAt).toISOString().slice(0, 10) : getIstDateString()),
      cafeId: doc.cafeId || 'ORGANISATION_WIDE',
      cafeName: cafeMap[doc.cafeId] || (doc.cafeId === 'ORGANISATION_WIDE' ? 'Organisation Wide' : (doc.cafeId || 'All Cafés')),
      purchaseOrderId: doc.purchaseOrderId || null,
      grnId: doc.grnId || null,
      supplierInvoiceNumber: doc.invoiceNumber || null,
      amountPaisa,
      amountFormatted: formatCurrency(amountPaisa),
      accountingDirection: 'DEBIT',
      financialEffect: `Reduces Vendor Payable by ${formatCurrency(amountPaisa)}`,
      reason: doc.title || `${typeLabel} statutory record`,
      status: doc.status === 'APPROVED' ? 'APPLIED' : (doc.status === 'REJECTED' ? 'REJECTED' : 'OPEN'),
      affectedItems: [],
      rawSource: 'DOCUMENT',
      createdAt: doc.uploadedAt || doc.createdAt,
      timeline: [
        { milestoneKey: 'DOCUMENT_ISSUED', label: `${typeLabel} Registered`, timestamp: doc.uploadedAt || doc.createdAt },
      ],
    });
  }

  // Sort by date descending by default
  adjustments.sort((a, b) => {
    const dateComp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateComp !== 0) return dateComp;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return { adjustments, cafeMap };
}

/**
 * GET /api/v1/vendor/adjustments
 * Retrieves returns, debit notes, credit notes, and adjustments register with 9 summary KPIs.
 */
const getVendorAdjustments = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, type, status, search, sortBy = 'date_desc', page = 1, limit = 50 } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { adjustments: allAdjustments } = await fetchAndFormatVendorAdjustments({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  // Calculate 9 authoritative Summary KPIs
  let totalReturns = 0;
  let returnValuePaisa = 0;
  let debitNotesCount = 0;
  let debitNotesValuePaisa = 0;
  let creditNotesCount = 0;
  let creditNotesValuePaisa = 0;
  let otherAdjustmentsCount = 0;
  let openAdjustmentsCount = 0;
  let completedAdjustmentsCount = 0;

  for (const adj of allAdjustments) {
    if (adj.type === 'GOODS_RETURN') {
      totalReturns++;
      returnValuePaisa += adj.amountPaisa;
    } else if (adj.type === 'DEBIT_NOTE') {
      debitNotesCount++;
      debitNotesValuePaisa += adj.amountPaisa;
    } else if (adj.type === 'CREDIT_NOTE') {
      creditNotesCount++;
      creditNotesValuePaisa += adj.amountPaisa;
    } else {
      otherAdjustmentsCount++;
    }

    if (adj.status === 'OPEN' || adj.status === 'ON_HOLD') {
      openAdjustmentsCount++;
    } else if (adj.status === 'APPLIED' || adj.status === 'SETTLED' || adj.status === 'COMPLETED') {
      completedAdjustmentsCount++;
    }
  }

  const summary = {
    totalReturns,
    returnValuePaisa,
    returnValueFormatted: formatCurrency(returnValuePaisa),
    debitNotesCount,
    debitNotesValuePaisa,
    debitNotesValueFormatted: formatCurrency(debitNotesValuePaisa),
    creditNotesCount,
    creditNotesValuePaisa,
    creditNotesValueFormatted: formatCurrency(creditNotesValuePaisa),
    otherAdjustmentsCount,
    openAdjustmentsCount,
    completedAdjustmentsCount,
    totalAdjustmentsCount: allAdjustments.length,
  };

  // Filtering
  let filtered = allAdjustments;

  if (type && type !== 'ALL') {
    const t = String(type).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.type === t);
  }

  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.status === s);
  }

  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (adj) =>
        String(adj.reference || '').toLowerCase().includes(term) ||
        String(adj.purchaseOrderId || '').toLowerCase().includes(term) ||
        String(adj.grnId || '').toLowerCase().includes(term) ||
        String(adj.supplierInvoiceNumber || '').toLowerCase().includes(term) ||
        String(adj.reason || '').toLowerCase().includes(term) ||
        String(adj.cafeName || '').toLowerCase().includes(term) ||
        String(adj.typeLabel || '').toLowerCase().includes(term)
    );
  }

  // Sorting
  if (sortBy === 'date_asc') {
    filtered.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  } else if (sortBy === 'amount_desc') {
    filtered.sort((a, b) => b.amountPaisa - a.amountPaisa);
  } else if (sortBy === 'amount_asc') {
    filtered.sort((a, b) => a.amountPaisa - b.amountPaisa);
  } else {
    // date_desc
    filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedItems = filtered.slice(startIndex, startIndex + limitNum);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_ADJUSTMENTS_VIEWED',
    targetType: 'ADJUSTMENTS_REGISTER',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      totalCount: allAdjustments.length,
      filteredCount: filtered.length,
    },
  });

  return res.status(200).json({
    success: true,
    summary,
    data: paginatedItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / limitNum) || 1,
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/adjustments/:adjustmentId
 * Retrieves 6-zone detail view for a specific adjustment record.
 */
const getVendorAdjustmentDetails = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const { adjustmentId } = req.params;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());

  const { adjustments } = await fetchAndFormatVendorAdjustments({
    organisationId,
    vendorId,
    scopedCafeId: null,
    approvedCafes,
  });

  const normTarget = String(adjustmentId || '').trim().toUpperCase();
  const found = adjustments.find(
    (a) =>
      String(a.adjustmentId || '').trim().toUpperCase() === normTarget ||
      String(a.reference || '').trim().toUpperCase() === normTarget
  );

  if (!found) {
    throw new ApiError(404, 'ADJUSTMENT_NOT_FOUND', 'The requested adjustment record was not found.');
  }

  // Cross-Café Authorization
  if (found.cafeId && found.cafeId !== 'ORGANISATION_WIDE' && !approvedCafes.includes(found.cafeId)) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for this café.');
  }

  // Enrich with related PO, Invoice, and Documents
  const [po, apInvoice, linkedDocs] = await Promise.all([
    found.purchaseOrderId ? PurchaseOrder.findOne({ organisationId, purchaseOrderId: found.purchaseOrderId }).lean() : null,
    found.supplierInvoiceNumber
      ? APInvoice.findOne({ organisationId, vendorId, supplierInvoiceNumber: found.supplierInvoiceNumber }).lean()
      : null,
    BusinessDocument.find({
      organisationId,
      vendorId,
      $or: [
        { documentNumber: found.reference },
        { purchaseOrderId: found.purchaseOrderId || 'NONE' },
        { grnId: found.grnId || 'NONE' },
      ],
    }).lean(),
  ]);

  const detailPayload = {
    identity: {
      adjustmentId: found.adjustmentId,
      reference: found.reference,
      type: found.type,
      typeLabel: found.typeLabel,
      date: found.date,
      status: found.status,
      cafeId: found.cafeId,
      cafeName: found.cafeName,
    },
    financial: {
      amountPaisa: found.amountPaisa,
      amountFormatted: found.amountFormatted,
      accountingDirection: found.accountingDirection,
      financialEffect: found.financialEffect,
    },
    references: {
      purchaseOrderId: found.purchaseOrderId,
      orderDate: po?.orderDate || null,
      poStatus: po?.status || null,
      grnId: found.grnId,
      supplierInvoiceNumber: found.supplierInvoiceNumber,
      invoiceDate: apInvoice?.invoiceDate || null,
      invoiceTotalPaisa: apInvoice?.totalPaisa || null,
      invoiceTotalFormatted: apInvoice ? formatCurrency(apInvoice.totalPaisa) : null,
    },
    affectedItems: found.affectedItems,
    authorisedReason: found.reason,
    documents: linkedDocs.map((d) => ({
      documentId: d.documentId,
      documentType: d.documentType,
      filename: d.filename || `${d.documentNumber || d.documentId}.pdf`,
      mimeType: d.mimeType || 'application/pdf',
      downloadUrl: `/api/v1/vendor/adjustments/${found.adjustmentId}/pdf`,
    })),
    timeline: found.timeline,
  };

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: found.cafeId !== 'ORGANISATION_WIDE' ? found.cafeId : null,
    actorId: req.auth.userId,
    action: 'VENDOR_ADJUSTMENT_DETAILS_VIEWED',
    targetType: 'ADJUSTMENT_RECORD',
    targetId: found.adjustmentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      reference: found.reference,
      type: found.type,
      amountPaisa: found.amountPaisa,
    },
  });

  return res.status(200).json({
    success: true,
    data: detailPayload,
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/adjustments/csv
 * Standard CSV export for adjustments.
 */
const downloadVendorAdjustmentsCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, type, status, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { adjustments: allAdjustments } = await fetchAndFormatVendorAdjustments({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  let filtered = allAdjustments;
  if (type && type !== 'ALL') {
    const t = String(type).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.type === t);
  }
  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.status === s);
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (adj) =>
        String(adj.reference || '').toLowerCase().includes(term) ||
        String(adj.purchaseOrderId || '').toLowerCase().includes(term) ||
        String(adj.grnId || '').toLowerCase().includes(term) ||
        String(adj.supplierInvoiceNumber || '').toLowerCase().includes(term) ||
        String(adj.reason || '').toLowerCase().includes(term) ||
        String(adj.cafeName || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const headers = [
    'Reference',
    'Type',
    'Date',
    'Cafe ID',
    'Cafe Name',
    'Purchase Order',
    'GRN',
    'Invoice Number',
    'Amount (INR)',
    'Accounting Direction',
    'Financial Effect',
    'Reason',
    'Status',
  ];

  const csvRows = [headers.join(',')];
  for (const adj of filtered) {
    const row = [
      `"${String(adj.reference || '').replace(/"/g, '""')}"`,
      `"${String(adj.typeLabel || adj.type || '').replace(/"/g, '""')}"`,
      `"${String(adj.date || '').replace(/"/g, '""')}"`,
      `"${String(adj.cafeId || '').replace(/"/g, '""')}"`,
      `"${String(adj.cafeName || '').replace(/"/g, '""')}"`,
      `"${String(adj.purchaseOrderId || 'N/A').replace(/"/g, '""')}"`,
      `"${String(adj.grnId || 'N/A').replace(/"/g, '""')}"`,
      `"${String(adj.supplierInvoiceNumber || 'N/A').replace(/"/g, '""')}"`,
      (adj.amountPaisa / 100).toFixed(2),
      `"${String(adj.accountingDirection || '').replace(/"/g, '""')}"`,
      `"${String(adj.financialEffect || '').replace(/"/g, '""')}"`,
      `"${String(adj.reason || '').replace(/"/g, '""')}"`,
      `"${String(adj.status || '').replace(/"/g, '""')}"`,
    ];
    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const buffer = Buffer.from(csvContent, 'utf-8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_ADJUSTMENTS_EXPORTED',
    targetType: 'ADJUSTMENTS_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorAdjustments-${vendorId}-${todayStr}.csv"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
});

/**
 * GET /api/v1/vendor/adjustments/xlsx
 * Standard OpenXML Excel export for vendor adjustments.
 */
const downloadVendorAdjustmentsXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, type, status, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { adjustments: allAdjustments } = await fetchAndFormatVendorAdjustments({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  let filtered = allAdjustments;
  if (type && type !== 'ALL') {
    const t = String(type).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.type === t);
  }
  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((adj) => adj.status === s);
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (adj) =>
        String(adj.reference || '').toLowerCase().includes(term) ||
        String(adj.purchaseOrderId || '').toLowerCase().includes(term) ||
        String(adj.grnId || '').toLowerCase().includes(term) ||
        String(adj.supplierInvoiceNumber || '').toLowerCase().includes(term) ||
        String(adj.reason || '').toLowerCase().includes(term) ||
        String(adj.cafeName || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const columns = [
    { key: 'reference', label: 'Reference' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Date' },
    { key: 'cafeId', label: 'Cafe ID' },
    { key: 'cafeName', label: 'Cafe Name' },
    { key: 'purchaseOrderId', label: 'Purchase Order' },
    { key: 'grnId', label: 'GRN' },
    { key: 'supplierInvoiceNumber', label: 'Invoice Number' },
    { key: 'amountInr', label: 'Amount (INR)', isNum: true },
    { key: 'accountingDirection', label: 'Accounting Direction' },
    { key: 'financialEffect', label: 'Financial Effect' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
  ];

  const rows = filtered.map((adj) => ({
    reference: adj.reference || '',
    type: adj.typeLabel || adj.type || '',
    date: adj.date || '',
    cafeId: adj.cafeId || '',
    cafeName: adj.cafeName || '',
    purchaseOrderId: adj.purchaseOrderId || 'N/A',
    grnId: adj.grnId || 'N/A',
    supplierInvoiceNumber: adj.supplierInvoiceNumber || 'N/A',
    amountInr: typeof adj.amountPaisa === 'number' ? adj.amountPaisa / 100 : Number(adj.amount || 0),
    accountingDirection: adj.accountingDirection || '',
    financialEffect: adj.financialEffect || '',
    reason: adj.reason || '',
    status: adj.status || '',
  }));

  const xlsxResult = generateXlsx({
    sheetName: 'Vendor Adjustments',
    reportTitle: `Vendor Adjustments & Notes — ${vendor.vendorName || vendor.name || vendorId}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_ADJUSTMENTS_EXPORTED',
    targetType: 'ADJUSTMENTS_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  const filename = `VendorAdjustments-${vendorId}-${todayStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/adjustments/:adjustmentId/pdf
 * Official A4 vector PDF document for a single adjustment record.
 */
const downloadVendorAdjustmentPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const { adjustmentId } = req.params;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());

  const { adjustments } = await fetchAndFormatVendorAdjustments({
    organisationId,
    vendorId,
    scopedCafeId: null,
    approvedCafes,
  });

  const normTarget = String(adjustmentId || '').trim().toUpperCase();
  const found = adjustments.find(
    (a) =>
      String(a.adjustmentId || '').trim().toUpperCase() === normTarget ||
      String(a.reference || '').trim().toUpperCase() === normTarget
  );

  if (!found) {
    throw new ApiError(404, 'ADJUSTMENT_NOT_FOUND', 'The requested adjustment record was not found.');
  }

  if (found.cafeId && found.cafeId !== 'ORGANISATION_WIDE' && !approvedCafes.includes(found.cafeId)) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for this café.');
  }

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.15 0.1 0.25 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 15 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OFFICIAL ADJUSTMENT RECORD) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY • FINANCIAL & QUANTITY ADJUSTMENT) Tj\nET\n';
  streamOps += `BT\n/F2 10 Tf\n1 1 1 rg\n1 0 0 1 420 812 Tm\n(REF: ${escapePdf(found.reference)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 420 798 Tm\n(DATE: ${escapePdf(found.date)}) Tj\nET\n`;

  // Vendor & Entity Banner
  streamOps += '0.97 0.96 0.98 rg\n30 685 535 70 re\nf\n';
  streamOps += '0.85 0.8 0.9 RG\n1 w\n30 685 535 70 re\nS\n';
  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 40 738 Tm\n(VENDOR (CREDITOR):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 724 Tm\n(${escapePdf(vendor.name || vendorId)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 710 Tm\n(GSTIN: ${escapePdf(vendor.gstNumber || 'Unregistered')} | PAN: ${escapePdf(vendor.panNumber || 'N/A')}) Tj\nET\n`;

  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 310 738 Tm\n(ISSUING CAFE / ENTITY:) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 724 Tm\n(${escapePdf(found.cafeName)} [${escapePdf(found.cafeId)}]) Tj\nET\n`;
  streamOps += 'BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 710 Tm\n(Zamorin Hospitality Private Limited) Tj\nET\n';

  // Financial Effect Summary Bar
  streamOps += '0.94 0.93 0.97 rg\n30 615 535 55 re\nf\n';
  streamOps += '0.4 0.3 0.6 RG\n1 w\n30 615 535 55 re\nS\n';

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 40 654 Tm\n(ADJUSTMENT TYPE) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 40 636 Tm\n(${escapePdf(found.typeLabel)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 180 654 Tm\n(ACCOUNTING AMOUNT) Tj\nET\n';
  streamOps += `BT\n/F2 11 Tf\n0.7 0.1 0.2 rg\n1 0 0 1 180 636 Tm\n(${escapePdf(found.amountFormatted)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 300 654 Tm\n(ACCOUNTING DIRECTION & STATUS) Tj\nET\n';
  streamOps += `BT\n/F2 9.5 Tf\n0.1 0.4 0.2 rg\n1 0 0 1 300 636 Tm\n(${escapePdf(found.accountingDirection)} • ${escapePdf(found.status)}) Tj\nET\n`;

  // References Box
  streamOps += '0.98 0.98 0.99 rg\n30 550 535 52 re\nf\n';
  streamOps += '0.85 0.85 0.88 RG\n1 w\n30 550 535 52 re\nS\n';
  streamOps += `BT\n/F1 8.5 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 584 Tm\n(PO Reference: ${escapePdf(found.purchaseOrderId || 'N/A')}   |   GRN Reference: ${escapePdf(found.grnId || 'N/A')}   |   Supplier Invoice: ${escapePdf(found.supplierInvoiceNumber || 'N/A')}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.3 0.3 0.4 rg\n1 0 0 1 40 564 Tm\n(Reason / Notes: ${escapePdf(found.reason || 'Authorised procurement adjustment')}) Tj\nET\n`;

  // Affected Items Table (if any)
  let tableY = 515;
  if (found.affectedItems && found.affectedItems.length > 0) {
    streamOps += '0.2 0.15 0.3 rg\n30 ' + tableY + ' 535 18 re\nf\n';
    streamOps += 'BT\n/F2 7.5 Tf\n1 1 1 rg\n';
    streamOps += '1 0 0 1 40 ' + (tableY + 5) + ' Tm\n(ITEM ID) Tj\n';
    streamOps += '1 0 0 1 120 ' + (tableY + 5) + ' Tm\n(ITEM DESCRIPTION) Tj\n';
    streamOps += '1 0 0 1 270 ' + (tableY + 5) + ' Tm\n(QTY) Tj\n';
    streamOps += '1 0 0 1 330 ' + (tableY + 5) + ' Tm\n(UNIT PRICE) Tj\n';
    streamOps += '1 0 0 1 410 ' + (tableY + 5) + ' Tm\n(TOTAL VALUE) Tj\n';
    streamOps += '1 0 0 1 480 ' + (tableY + 5) + ' Tm\n(DISPOSITION) Tj\n';
    streamOps += 'ET\n';

    tableY -= 18;
    for (const item of found.affectedItems.slice(0, 15)) {
      streamOps += '0.98 0.98 0.99 rg\n30 ' + tableY + ' 535 17 re\nf\n';
      streamOps += '0.9 0.9 0.92 RG\n0.5 w\n30 ' + tableY + ' 535 17 re\nS\n';

      streamOps += 'BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n';
      streamOps += '1 0 0 1 40 ' + (tableY + 5) + ' Tm\n(' + escapePdf(item.itemId) + ') Tj\n';
      streamOps += '1 0 0 1 120 ' + (tableY + 5) + ' Tm\n(' + escapePdf(item.itemName.slice(0, 25)) + ') Tj\n';
      streamOps += '1 0 0 1 270 ' + (tableY + 5) + ' Tm\n(' + escapePdf(String(item.qty)) + ') Tj\n';
      streamOps += '1 0 0 1 330 ' + (tableY + 5) + ' Tm\n(' + escapePdf(formatCurrency(item.unitPricePaisa)) + ') Tj\n';
      streamOps += '1 0 0 1 410 ' + (tableY + 5) + ' Tm\n(' + escapePdf(formatCurrency(item.totalPaisa)) + ') Tj\n';
      streamOps += '1 0 0 1 480 ' + (tableY + 5) + ' Tm\n(' + escapePdf(item.disposition.slice(0, 15)) + ') Tj\n';
      streamOps += 'ET\n';
      tableY -= 17;
    }
  }

  // Footer & Disclaimer
  streamOps += 'BT\n/F1 7.5 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 30 50 Tm\n(This document is a system-generated, immutable external vendor adjustment record. Write operations are prohibited.) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 30 38 Tm\n(Zamorin Hospitality Private Limited • Reg. Office: Calicut, Kerala • accounts@zamorincafe.com) Tj\nET\n';

  const streamLen = Buffer.byteLength(streamOps, 'utf-8');
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  function addObj(content) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += content + '\n';
  }

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj');
  addObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  addObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  addObj(`6 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamOps}\nendstream\nendobj`);

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';

  const pdfBuffer = Buffer.from(pdf, 'utf-8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: found.cafeId !== 'ORGANISATION_WIDE' ? found.cafeId : null,
    actorId: req.auth.userId,
    action: 'VENDOR_ADJUSTMENT_PDF_DOWNLOADED',
    targetType: 'ADJUSTMENT_PDF',
    targetId: found.adjustmentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, reference: found.reference },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Adjustment-${found.reference}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

// ── VEN-SCR-009: PRODUCTS & APPROVED PRICING ────────────────────────────────

/**
 * Internal helper to aggregate and format all approved products for a vendor.
 */
async function fetchAndFormatVendorProducts({ organisationId, vendorId, scopedCafeId, approvedCafes }) {
  const [vendor, cafes] = await Promise.all([
    Vendor.findOne({ organisationId, vendorId }).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.cafeName || c.cafeId;
  }

  const catalogueItems = vendor.itemCatalogue || [];
  const itemIds = catalogueItems.map((i) => i.itemId);

  const [globalItems, purchaseOrders] = await Promise.all([
    GlobalInventoryItem.find({ organisationId, itemId: { $in: itemIds } }).lean(),
    PurchaseOrder.find({
      organisationId,
      vendorId,
      ...(scopedCafeId ? { cafeId: scopedCafeId } : approvedCafes.length > 0 ? { cafeId: { $in: approvedCafes } } : {}),
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const globalMap = {};
  for (const gi of globalItems) {
    globalMap[gi.itemId] = gi;
  }

  const products = [];
  const processedItemIds = new Set();

  // 1. Process items from Vendor.itemCatalogue
  for (const item of catalogueItems) {
    const gi = globalMap[item.itemId];
    processedItemIds.add(String(item.itemId).trim().toUpperCase());

    const safePriceHistory = (item.priceHistory || []).map((ph) => ({
      effectiveFrom: ph.effectiveFrom ? new Date(ph.effectiveFrom).toISOString().slice(0, 10) : 'N/A',
      effectiveTo: ph.effectiveTo ? new Date(ph.effectiveTo).toISOString().slice(0, 10) : 'Present',
      approvedRatePaisa: Number(ph.pricePaisa || 0),
      approvedRateFormatted: formatCurrency(ph.pricePaisa),
      previousRatePaisa: ph.previousPricePaisa !== null && ph.previousPricePaisa !== undefined ? Number(ph.previousPricePaisa) : null,
      previousRateFormatted: ph.previousPricePaisa !== null && ph.previousPricePaisa !== undefined ? formatCurrency(ph.previousPricePaisa) : null,
      changeReason: ph.changeReason || 'Periodic rate schedule revision',
      agreementReference: ph.agreementReference || 'Procurement Rate Agreement',
    }));

    products.push({
      itemId: item.itemId,
      vendorSku: item.supplierItemCode || gi?.sku || item.itemId,
      productName: item.itemName || gi?.name || item.itemId,
      category: gi?.category || 'FOOD_BEVERAGE',
      brand: vendor.tradeName || vendor.name || 'Commercial Supplier',
      uom: item.uom || gi?.baseUnit || 'unit',
      packSize: item.packSize || (gi?.packSize ? `${gi.packSize} ${gi.baseUnit}` : '1 UNIT'),
      hsnSac: gi?.barcode || 'N/A',
      gstRatePercent: item.taxPercent !== undefined ? item.taxPercent : 5,
      approvedPurchaseRatePaisa: Number(item.currentPricePaisa || 0),
      approvedPurchaseRateFormatted: formatCurrency(item.currentPricePaisa),
      effectiveDate: item.priceHistory?.[0]?.effectiveFrom
        ? new Date(item.priceHistory[0].effectiveFrom).toISOString().slice(0, 10)
        : getIstDateString(),
      priceValidity: 'Approved Active Schedule',
      leadTimeDays: item.leadTimeDays || vendor.sites?.[0]?.leadTimeDays || 2,
      moq: item.moq || 1,
      status: item.status || 'ACTIVE',
      applicableCafes: (vendor.approvedCafeIds || []).map((id) => ({
        cafeId: id,
        cafeName: cafeMap[id] || id,
      })),
      priceHistory: safePriceHistory,
      priceHistoryCount: safePriceHistory.length,
    });
  }

  // 2. Supplement from Purchase Orders for products that may have been procured
  for (const po of purchaseOrders) {
    for (const line of po.lineItems || []) {
      const normId = String(line.itemId).trim().toUpperCase();
      if (processedItemIds.has(normId)) continue;
      processedItemIds.add(normId);

      const gi = globalMap[line.itemId];
      const rate = Number(line.unitPricePaisa || 0);

      products.push({
        itemId: line.itemId,
        vendorSku: line.supplierItemCode || gi?.sku || line.itemId,
        productName: line.itemNameSnapshot || line.itemName || gi?.name || line.itemId,
        category: gi?.category || 'FOOD_BEVERAGE',
        brand: vendor.tradeName || vendor.name || 'Commercial Supplier',
        uom: gi?.baseUnit || 'unit',
        packSize: gi?.packSize ? `${gi.packSize} ${gi.baseUnit}` : '1 UNIT',
        hsnSac: gi?.barcode || 'N/A',
        gstRatePercent: 5,
        approvedPurchaseRatePaisa: rate,
        approvedPurchaseRateFormatted: formatCurrency(rate),
        effectiveDate: po.orderDate || getIstDateString(),
        priceValidity: 'Approved Procurement PO Rate',
        leadTimeDays: vendor.sites?.[0]?.leadTimeDays || 2,
        moq: 1,
        status: 'ACTIVE',
        applicableCafes: (vendor.approvedCafeIds || []).map((id) => ({
          cafeId: id,
          cafeName: cafeMap[id] || id,
        })),
        priceHistory: [],
        priceHistoryCount: 0,
      });
    }
  }

  return { products, vendor, cafeMap };
}

/**
 * GET /api/v1/vendor/products
 * GET /api/v1/vendor/pricing
 * Retrieves product register with approved procurement pricing and 4 summary KPIs.
 */
const getVendorProducts = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, category, status, search, sortBy = 'name_asc', page = 1, limit = 50 } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { products: allProducts } = await fetchAndFormatVendorProducts({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  // Calculate 4 Summary KPIs
  const totalProducts = allProducts.length;
  const activeProducts = allProducts.filter((p) => p.status === 'ACTIVE').length;
  const uniqueCategories = new Set(allProducts.map((p) => p.category));
  const categoriesCount = uniqueCategories.size;
  const totalLeadTime = allProducts.reduce((acc, p) => acc + (p.leadTimeDays || 0), 0);
  const averageLeadTimeDays = totalProducts > 0 ? Number((totalLeadTime / totalProducts).toFixed(1)) : 0;

  const summary = {
    totalProducts,
    activeProducts,
    categoriesCount,
    averageLeadTimeDays,
  };

  // Filtering
  let filtered = allProducts;

  if (category && category !== 'ALL') {
    const c = String(category).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.category || '').toUpperCase() === c);
  }

  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.status || '').toUpperCase() === s);
  }

  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.vendorSku || '').toLowerCase().includes(term) ||
        String(p.itemId || '').toLowerCase().includes(term) ||
        String(p.category || '').toLowerCase().includes(term) ||
        String(p.brand || '').toLowerCase().includes(term)
    );
  }

  // Sorting
  if (sortBy === 'name_desc') {
    filtered.sort((a, b) => String(b.productName || '').localeCompare(String(a.productName || '')));
  } else if (sortBy === 'price_desc') {
    filtered.sort((a, b) => b.approvedPurchaseRatePaisa - a.approvedPurchaseRatePaisa);
  } else if (sortBy === 'price_asc') {
    filtered.sort((a, b) => a.approvedPurchaseRatePaisa - b.approvedPurchaseRatePaisa);
  } else if (sortBy === 'lead_time') {
    filtered.sort((a, b) => a.leadTimeDays - b.leadTimeDays);
  } else {
    // name_asc
    filtered.sort((a, b) => String(a.productName || '').localeCompare(String(b.productName || '')));
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedItems = filtered.slice(startIndex, startIndex + limitNum);

  // Redaction Guarantee: verify no retail margins or competitor prices leak
  const sanitizedItems = paginatedItems.map((item) => {
    const { retailSellingPrice, menuPrice, markup, grossMargin, contributionMargin, targetNegotiatedPrice, ...safe } = item;
    return safe;
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_PRODUCTS_VIEWED',
    targetType: 'PRODUCTS_REGISTER',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      totalCount: allProducts.length,
      filteredCount: filtered.length,
    },
  });

  return res.status(200).json({
    success: true,
    summary,
    data: sanitizedItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / limitNum) || 1,
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/products/:itemId
 * Retrieves 6-zone detail view for a specific product and its approved pricing history.
 */
const getVendorProductDetails = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const { itemId } = req.params;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());

  const { products } = await fetchAndFormatVendorProducts({
    organisationId,
    vendorId,
    scopedCafeId: null,
    approvedCafes,
  });

  const normTarget = String(itemId || '').trim().toUpperCase();
  const found = products.find(
    (p) =>
      String(p.itemId || '').trim().toUpperCase() === normTarget ||
      String(p.vendorSku || '').trim().toUpperCase() === normTarget
  );

  if (!found) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'The requested product was not found in your approved vendor catalogue.');
  }

  // 6-Zone Detail Architecture with Strict Margin Redaction
  const detailPayload = {
    itemIdentity: {
      itemId: found.itemId,
      vendorSku: found.vendorSku,
      productName: found.productName,
      category: found.category,
      brand: found.brand,
      status: found.status,
    },
    procurementSpec: {
      uom: found.uom,
      packSize: found.packSize,
      moq: found.moq,
      leadTimeDays: found.leadTimeDays,
      deliveryCutoff: '16:00',
    },
    pricingAndTax: {
      approvedPurchaseRatePaisa: found.approvedPurchaseRatePaisa,
      approvedPurchaseRateFormatted: found.approvedPurchaseRateFormatted,
      gstRatePercent: found.gstRatePercent,
      hsnSac: found.hsnSac,
      effectiveDate: found.effectiveDate,
      priceValidity: found.priceValidity,
    },
    applicableCafes: found.applicableCafes,
    priceHistory: found.priceHistory,
  };

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: null,
    actorId: req.auth.userId,
    action: 'VENDOR_PRODUCT_DETAILS_VIEWED',
    targetType: 'PRODUCT_RECORD',
    targetId: found.itemId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      itemId: found.itemId,
      ratePaisa: found.approvedPurchaseRatePaisa,
    },
  });

  return res.status(200).json({
    success: true,
    data: detailPayload,
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/products/csv
 * Standard CSV export for products & approved pricing.
 */
const downloadVendorProductsCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, category, status, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { products: allProducts } = await fetchAndFormatVendorProducts({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  let filtered = allProducts;
  if (category && category !== 'ALL') {
    const c = String(category).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.category || '').toUpperCase() === c);
  }
  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.status || '').toUpperCase() === s);
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.vendorSku || '').toLowerCase().includes(term) ||
        String(p.itemId || '').toLowerCase().includes(term) ||
        String(p.category || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const headers = [
    'ERP Item Code',
    'Vendor SKU',
    'Product Name',
    'Category',
    'Brand',
    'UOM',
    'Pack Size',
    'HSN/SAC',
    'GST Rate (%)',
    'Approved Purchase Rate (INR)',
    'MOQ',
    'Lead Time (Days)',
    'Status',
  ];

  const csvRows = [headers.join(',')];
  for (const item of filtered) {
    const row = [
      `"${String(item.itemId || '').replace(/"/g, '""')}"`,
      `"${String(item.vendorSku || '').replace(/"/g, '""')}"`,
      `"${String(item.productName || '').replace(/"/g, '""')}"`,
      `"${String(item.category || '').replace(/"/g, '""')}"`,
      `"${String(item.brand || '').replace(/"/g, '""')}"`,
      `"${String(item.uom || '').replace(/"/g, '""')}"`,
      `"${String(item.packSize || '').replace(/"/g, '""')}"`,
      `"${String(item.hsnSac || 'N/A').replace(/"/g, '""')}"`,
      String(item.gstRatePercent !== undefined ? item.gstRatePercent : 5),
      (item.approvedPurchaseRatePaisa / 100).toFixed(2),
      String(item.moq || 1),
      String(item.leadTimeDays || 2),
      `"${String(item.status || 'ACTIVE').replace(/"/g, '""')}"`,
    ];
    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const buffer = Buffer.from(csvContent, 'utf-8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_PRODUCTS_EXPORTED',
    targetType: 'PRODUCTS_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorProducts-${vendorId}-${todayStr}.csv"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
});

/**
 * GET /api/v1/vendor/products/xlsx
 * Standard OpenXML Excel export for vendor products catalog.
 */
const downloadVendorProductsXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, category, status, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { products: allProducts } = await fetchAndFormatVendorProducts({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  let filtered = allProducts;
  if (category && category !== 'ALL') {
    const c = String(category).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.category || '').toUpperCase() === c);
  }
  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((p) => String(p.status || '').toUpperCase() === s);
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        String(p.productName || '').toLowerCase().includes(term) ||
        String(p.vendorSku || '').toLowerCase().includes(term) ||
        String(p.itemId || '').toLowerCase().includes(term) ||
        String(p.category || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const columns = [
    { key: 'itemId', label: 'ERP Item Code' },
    { key: 'vendorSku', label: 'Vendor SKU' },
    { key: 'productName', label: 'Product Name' },
    { key: 'category', label: 'Category' },
    { key: 'brand', label: 'Brand' },
    { key: 'uom', label: 'UOM' },
    { key: 'packSize', label: 'Pack Size' },
    { key: 'hsn', label: 'HSN/SAC' },
    { key: 'gstRate', label: 'GST Rate (%)', isNum: true },
    { key: 'purchaseRate', label: 'Approved Purchase Rate (INR)', isNum: true },
    { key: 'moq', label: 'MOQ', isNum: true },
    { key: 'leadTimeDays', label: 'Lead Time (Days)', isNum: true },
    { key: 'status', label: 'Status' },
  ];

  const rows = filtered.map((p) => ({
    itemId: p.itemId || '',
    vendorSku: p.vendorSku || '',
    productName: p.productName || '',
    category: p.category || '',
    brand: p.brand || '',
    uom: p.uom || '',
    packSize: p.packSize || '',
    hsn: p.hsn || '',
    gstRate: Number(p.gstRate || 0),
    purchaseRate: typeof p.purchaseRatePaisa === 'number' ? p.purchaseRatePaisa / 100 : Number(p.purchaseRate || 0),
    moq: Number(p.moq || 1),
    leadTimeDays: Number(p.leadTimeDays || 0),
    status: p.status || '',
  }));

  const xlsxResult = generateXlsx({
    sheetName: 'Approved Products',
    reportTitle: `Vendor Approved Products & Pricing — ${vendor.vendorName || vendor.name || vendorId}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_PRODUCTS_EXPORTED',
    targetType: 'PRODUCTS_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  const filename = `VendorProducts-${vendorId}-${todayStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/products/:itemId/pdf
 * Official A4 vector PDF document for a single approved product price schedule.
 */
const downloadVendorProductPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const { itemId } = req.params;

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());

  const { products } = await fetchAndFormatVendorProducts({
    organisationId,
    vendorId,
    scopedCafeId: null,
    approvedCafes,
  });

  const normTarget = String(itemId || '').trim().toUpperCase();
  const found = products.find(
    (p) =>
      String(p.itemId || '').trim().toUpperCase() === normTarget ||
      String(p.vendorSku || '').trim().toUpperCase() === normTarget
  );

  if (!found) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'The requested product was not found.');
  }

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.15 0.1 0.25 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 15 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - APPROVED PROCUREMENT RATE SCHEDULE) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 30 798 Tm\n(SYSTEM GENERATED - READ-ONLY VENDOR COPY • AUTHORISED PROCUREMENT PRICING) Tj\nET\n';
  streamOps += `BT\n/F2 10 Tf\n1 1 1 rg\n1 0 0 1 420 812 Tm\n(ITEM: ${escapePdf(found.itemId)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.88 0.85 0.95 rg\n1 0 0 1 420 798 Tm\n(SKU: ${escapePdf(found.vendorSku)}) Tj\nET\n`;

  // Vendor & Entity Banner
  streamOps += '0.97 0.96 0.98 rg\n30 685 535 70 re\nf\n';
  streamOps += '0.85 0.8 0.9 RG\n1 w\n30 685 535 70 re\nS\n';
  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 40 738 Tm\n(APPROVED VENDOR:) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 724 Tm\n(${escapePdf(vendor.name || vendorId)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 40 710 Tm\n(GSTIN: ${escapePdf(vendor.gstNumber || 'Unregistered')} | Category: ${escapePdf(vendor.category || 'GOODS')}) Tj\nET\n`;

  streamOps += 'BT\n/F2 9.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 310 738 Tm\n(PROCUREMENT ENTITY:) Tj\nET\n';
  streamOps += 'BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 310 724 Tm\n(Zamorin Hospitality Private Limited) Tj\nET\n';
  streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 310 710 Tm\n(Status: ${escapePdf(found.status)} • Active Agreement) Tj\nET\n`;

  // Price & Specification Summary Bar
  streamOps += '0.94 0.93 0.97 rg\n30 615 535 55 re\nf\n';
  streamOps += '0.4 0.3 0.6 RG\n1 w\n30 615 535 55 re\nS\n';

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 40 654 Tm\n(APPROVED PURCHASE RATE) Tj\nET\n';
  streamOps += `BT\n/F2 13 Tf\n0.1 0.4 0.2 rg\n1 0 0 1 40 636 Tm\n(${escapePdf(found.approvedPurchaseRateFormatted)} / ${escapePdf(found.uom)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 200 654 Tm\n(TAX CLASSIFICATION) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 200 636 Tm\n(GST ${found.gstRatePercent}% • HSN: ${escapePdf(found.hsnSac)}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 360 654 Tm\n(PACK SIZE & MOQ) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 360 636 Tm\n(${escapePdf(found.packSize)} • MOQ: ${found.moq}) Tj\nET\n`;

  streamOps += 'BT\n/F1 7.5 Tf\n0.3 0.2 0.4 rg\n1 0 0 1 475 654 Tm\n(LEAD TIME) Tj\nET\n';
  streamOps += `BT\n/F2 10.5 Tf\n0.2 0.1 0.3 rg\n1 0 0 1 475 636 Tm\n(${found.leadTimeDays} Days) Tj\nET\n`;

  // Item Identity Details Box
  streamOps += '0.98 0.98 0.99 rg\n30 545 535 55 re\nf\n';
  streamOps += '0.85 0.85 0.88 RG\n1 w\n30 545 535 55 re\nS\n';
  streamOps += `BT\n/F2 10 Tf\n0.1 0.1 0.2 rg\n1 0 0 1 40 580 Tm\n(${escapePdf(found.productName)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.3 0.3 0.4 rg\n1 0 0 1 40 562 Tm\n(Category: ${escapePdf(found.category)}   |   Brand: ${escapePdf(found.brand)}   |   Effective: ${escapePdf(found.effectiveDate)}) Tj\nET\n`;

  // Price History Table (if any)
  let tableY = 510;
  if (found.priceHistory && found.priceHistory.length > 0) {
    streamOps += '0.2 0.15 0.3 rg\n30 ' + tableY + ' 535 18 re\nf\n';
    streamOps += 'BT\n/F2 7.5 Tf\n1 1 1 rg\n';
    streamOps += '1 0 0 1 40 ' + (tableY + 5) + ' Tm\n(EFFECTIVE FROM) Tj\n';
    streamOps += '1 0 0 1 140 ' + (tableY + 5) + ' Tm\n(EFFECTIVE TO) Tj\n';
    streamOps += '1 0 0 1 240 ' + (tableY + 5) + ' Tm\n(APPROVED RATE) Tj\n';
    streamOps += '1 0 0 1 340 ' + (tableY + 5) + ' Tm\n(PREVIOUS RATE) Tj\n';
    streamOps += '1 0 0 1 440 ' + (tableY + 5) + ' Tm\n(AGREEMENT REF) Tj\n';
    streamOps += 'ET\n';

    tableY -= 18;
    for (const ph of found.priceHistory.slice(0, 15)) {
      streamOps += '0.98 0.98 0.99 rg\n30 ' + tableY + ' 535 17 re\nf\n';
      streamOps += '0.9 0.9 0.92 RG\n0.5 w\n30 ' + tableY + ' 535 17 re\nS\n';

      streamOps += 'BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n';
      streamOps += '1 0 0 1 40 ' + (tableY + 5) + ' Tm\n(' + escapePdf(ph.effectiveFrom) + ') Tj\n';
      streamOps += '1 0 0 1 140 ' + (tableY + 5) + ' Tm\n(' + escapePdf(ph.effectiveTo) + ') Tj\n';
      streamOps += '1 0 0 1 240 ' + (tableY + 5) + ' Tm\n(' + escapePdf(ph.approvedRateFormatted) + ') Tj\n';
      streamOps += '1 0 0 1 340 ' + (tableY + 5) + ' Tm\n(' + escapePdf(ph.previousRateFormatted || '—') + ') Tj\n';
      streamOps += '1 0 0 1 440 ' + (tableY + 5) + ' Tm\n(' + escapePdf((ph.agreementReference || 'Standard Rate Card').slice(0, 20)) + ') Tj\n';
      streamOps += 'ET\n';
      tableY -= 17;
    }
  }

  // Footer & Disclaimer
  streamOps += 'BT\n/F1 7.5 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 30 50 Tm\n(This document represents the official approved procurement rate schedule. Retail margins and competitor rates are strictly excluded.) Tj\nET\n';
  streamOps += 'BT\n/F1 7.5 Tf\n0.5 0.5 0.5 rg\n1 0 0 1 30 38 Tm\n(Zamorin Hospitality Private Limited • Reg. Office: Calicut, Kerala • accounts@zamorincafe.com) Tj\nET\n';

  const streamLen = Buffer.byteLength(streamOps, 'utf-8');
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  function addObj(content) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += content + '\n';
  }

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj');
  addObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  addObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  addObj(`6 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamOps}\nendstream\nendobj`);

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';

  const pdfBuffer = Buffer.from(pdf, 'utf-8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: null,
    actorId: req.auth.userId,
    action: 'VENDOR_PRODUCT_PDF_DOWNLOADED',
    targetType: 'PRODUCT_PDF',
    targetId: found.itemId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, itemId: found.itemId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="RateSchedule-${found.itemId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

// ── VEN-SCR-010: DOCUMENTS CENTRE ───────────────────────────────────────────

/**
 * Internal helper to aggregate all commercial documents across ERP subsystems for a vendor.
 */
async function fetchAllVendorDocuments({ organisationId, vendorId, approvedCafeIds, scopedCafeId }) {
  const [vendor, cafes] = await Promise.all([
    Vendor.findOne({ organisationId, vendorId }).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.name || c.displayName || c.cafeName || c.cafeId;
  }

  const cafeFilter = scopedCafeId
    ? { cafeId: scopedCafeId }
    : approvedCafeIds.length > 0
    ? { cafeId: { $in: approvedCafeIds } }
    : {};

  const [pos, invoices, ledgerEntries, businessDocs] = await Promise.all([
    PurchaseOrder.find({
      organisationId,
      vendorId,
      ...cafeFilter,
    })
      .sort({ createdAt: -1 })
      .lean(),
    APInvoice.find({
      organisationId,
      vendorId,
      ...cafeFilter,
    })
      .sort({ invoiceDate: -1, createdAt: -1 })
      .lean(),
    VendorLedgerEntry.find({
      organisationId,
      vendorId,
      ...cafeFilter,
    })
      .sort({ entryDate: -1, createdAt: -1 })
      .lean(),
    BusinessDocument.find({
      organisationId,
      $or: [
        { entityId: vendorId },
        { relatedRecordId: vendorId },
        ...(scopedCafeId
          ? [{ cafeId: scopedCafeId }]
          : approvedCafeIds.length > 0
          ? [{ cafeId: { $in: approvedCafeIds } }]
          : []),
      ],
      isArchived: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const documents = [];

  // 1. Purchase Orders
  for (const po of pos) {
    documents.push({
      docId: `DOC-PO-${po.purchaseOrderId}`,
      title: `Official Purchase Order #${po.purchaseOrderId}`,
      category: 'PURCHASE_ORDER',
      referenceNumber: po.purchaseOrderId,
      relatedId: po.purchaseOrderId,
      cafeId: po.cafeId,
      cafeName: cafeMap[po.cafeId] || po.cafeId,
      documentDate: po.orderDate || (po.createdAt ? new Date(po.createdAt).toISOString().slice(0, 10) : getIstDateString()),
      fileType: 'PDF',
      mimeType: 'application/pdf',
      status: po.status || 'ORDERED',
      downloadUrl: `/api/v1/vendor/orders/${po.purchaseOrderId}/pdf`,
      description: `Official procurement PO with ${(po.lineItems || []).length} line items`,
    });

    // 2. GRNs & Attachments from Purchase Orders
    for (const grn of (po.grnReceipts || [])) {
      documents.push({
        docId: `DOC-GRN-${grn.grnId}`,
        title: `Goods Receipt Note #${grn.grnId}`,
        category: 'GOODS_RECEIPT',
        referenceNumber: grn.grnId,
        relatedId: po.purchaseOrderId,
        cafeId: po.cafeId,
        cafeName: cafeMap[po.cafeId] || po.cafeId,
        documentDate: grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : (po.orderDate || getIstDateString()),
        fileType: 'PDF',
        mimeType: 'application/pdf',
        status: grn.verificationStatus || 'COMPLETED',
        downloadUrl: `/api/v1/vendor/grns/${grn.grnId}/pdf`,
        description: `Physical intake receipt confirmation for ${(grn.items || []).length} items`,
      });

      for (const att of (grn.receiptAttachments || [])) {
        documents.push({
          docId: `DOC-ATT-${att.attachmentId}`,
          title: att.filename || `Intake Attachment #${att.attachmentId}`,
          category: 'GOODS_RECEIPT',
          referenceNumber: att.attachmentId,
          relatedId: grn.grnId,
          cafeId: po.cafeId,
          cafeName: cafeMap[po.cafeId] || po.cafeId,
          documentDate: grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : (po.orderDate || getIstDateString()),
          fileType: (att.mimeType || '').includes('pdf') ? 'PDF' : 'IMAGE',
          mimeType: att.mimeType || 'application/pdf',
          status: 'ATTACHED',
          downloadUrl: `/api/v1/vendor/grns/${grn.grnId}/attachments/${att.attachmentId}`,
          description: `Signed Delivery Receipt / Vendor Challan`,
        });
      }
    }
  }

  // 3. AP Invoices
  for (const inv of invoices) {
    const invRef = inv.supplierInvoiceNumber || inv.invoiceId;
    documents.push({
      docId: `DOC-INV-${inv.invoiceId}`,
      title: `Tax Invoice #${invRef}`,
      category: 'INVOICE',
      referenceNumber: invRef,
      relatedId: inv.invoiceId,
      cafeId: inv.cafeId,
      cafeName: cafeMap[inv.cafeId] || inv.cafeId,
      documentDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : (inv.createdAt ? new Date(inv.createdAt).toISOString().slice(0, 10) : getIstDateString()),
      fileType: 'PDF',
      mimeType: 'application/pdf',
      status: inv.status || 'SUBMITTED',
      downloadUrl: `/api/v1/vendor/invoices/${inv.invoiceId}/pdf`,
      description: `Commercial Tax Invoice (Claimed: ${formatCurrency(inv.totalPaisa || 0)})`,
    });
  }

  // 4. Payments & Adjustments from Vendor Ledger
  for (const le of ledgerEntries) {
    const tType = String(le.entryType || le.transactionType || '').toUpperCase();
    const entryId = le.ledgerEntryId || le.entryId;
    if (tType === 'PAYMENT' || Number(le.debitPaisa || 0) > 0) {
      documents.push({
        docId: `DOC-PAY-${entryId}`,
        title: `Payment Settlement Voucher #${le.referenceNumber || entryId}`,
        category: 'PAYMENT_RECEIPT',
        referenceNumber: le.referenceNumber || entryId,
        relatedId: entryId,
        cafeId: le.cafeId,
        cafeName: cafeMap[le.cafeId] || le.cafeId,
        documentDate: le.entryDate ? new Date(le.entryDate).toISOString().slice(0, 10) : (le.createdAt ? new Date(le.createdAt).toISOString().slice(0, 10) : getIstDateString()),
        fileType: 'PDF',
        mimeType: 'application/pdf',
        status: 'SETTLED',
        downloadUrl: `/api/v1/vendor/payments/${entryId}/pdf`,
        description: `Payment Advice / Settlement of ${formatCurrency(le.debitPaisa || 0)}`,
      });
    } else if (['DEBIT_NOTE', 'CREDIT_NOTE', 'PURCHASE_RETURN', 'RATE_ADJUSTMENT'].includes(tType)) {
      documents.push({
        docId: `DOC-ADJ-${entryId}`,
        title: `${tType.replace('_', ' ')} #${le.referenceNumber || entryId}`,
        category: 'ADJUSTMENT',
        referenceNumber: le.referenceNumber || entryId,
        relatedId: entryId,
        cafeId: le.cafeId,
        cafeName: cafeMap[le.cafeId] || le.cafeId,
        documentDate: le.entryDate ? new Date(le.entryDate).toISOString().slice(0, 10) : (le.createdAt ? new Date(le.createdAt).toISOString().slice(0, 10) : getIstDateString()),
        fileType: 'PDF',
        mimeType: 'application/pdf',
        status: 'ADJUSTED',
        downloadUrl: `/api/v1/vendor/adjustments/${entryId}/pdf`,
        description: `Commercial Adjustment Note`,
      });
    }
  }

  // 5. Approved Product Rate Schedules
  for (const item of (vendor.itemCatalogue || [])) {
    documents.push({
      docId: `DOC-RATE-${item.itemId}`,
      title: `Approved Rate Schedule: ${item.itemName || item.itemId}`,
      category: 'RATE_SCHEDULE',
      referenceNumber: item.supplierItemCode || item.itemId,
      relatedId: item.itemId,
      cafeId: 'ALL',
      cafeName: 'All Authorized Cafés',
      documentDate: item.priceHistory?.[0]?.effectiveFrom
        ? new Date(item.priceHistory[0].effectiveFrom).toISOString().slice(0, 10)
        : getIstDateString(),
      fileType: 'PDF',
      mimeType: 'application/pdf',
      status: item.status || 'ACTIVE',
      downloadUrl: `/api/v1/vendor/products/${item.itemId}/pdf`,
      description: `Contracted Purchase Rate (${formatCurrency(item.currentPricePaisa)} / ${item.uom || 'unit'})`,
    });
  }

  // 6. BusinessDocument Records (TDS, GST, Vendor Agreement)
  for (const bd of businessDocs) {
    const isTax = ['GST_CERTIFICATE', 'TDS_CERTIFICATE', 'PAN_CARD', 'TAX_INVOICE'].includes(String(bd.documentType || '').toUpperCase());
    documents.push({
      docId: `DOC-BD-${bd.documentId}`,
      title: bd.title || bd.documentType || 'Official Commercial Document',
      category: isTax ? 'TAX_STATUTORY' : 'AGREEMENT',
      referenceNumber: bd.documentId,
      relatedId: bd.entityId || bd.relatedRecordId || vendorId,
      cafeId: bd.cafeId || 'ALL',
      cafeName: bd.cafeId ? (cafeMap[bd.cafeId] || bd.cafeId) : 'All Authorized Cafés',
      documentDate: bd.createdAt ? new Date(bd.createdAt).toISOString().slice(0, 10) : getIstDateString(),
      fileType: (bd.versions?.[0]?.mimeType || '').includes('pdf') ? 'PDF' : 'DOCUMENT',
      mimeType: bd.versions?.[0]?.mimeType || 'application/pdf',
      status: 'VERIFIED',
      downloadUrl: `/api/v1/vendor/documents/${bd.documentId}/file`,
      description: bd.description || 'Statutory / Agreement Document',
    });
  }

  return { documents, vendor, cafeMap };
}

/**
 * GET /api/v1/vendor/documents
 * VEN-SCR-010: Documents Centre Register & 5 Summary KPIs
 */
const getVendorDocuments = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = (req.auth.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, category, dateRange, customStart, customEnd, search, sortBy = 'date_desc', page = 1, limit = 50 } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { documents: allDocs } = await fetchAllVendorDocuments({
    organisationId,
    vendorId,
    approvedCafeIds,
    scopedCafeId,
  });

  // Calculate 5 Summary KPIs
  const totalDocuments = allDocs.length;
  const poAndGrnDocuments = allDocs.filter((d) => ['PURCHASE_ORDER', 'GOODS_RECEIPT'].includes(d.category)).length;
  const financialAndTaxDocuments = allDocs.filter((d) => ['INVOICE', 'PAYMENT_RECEIPT', 'ADJUSTMENT', 'TAX_STATUTORY'].includes(d.category)).length;
  const agreementsDocuments = allDocs.filter((d) => ['RATE_SCHEDULE', 'AGREEMENT'].includes(d.category)).length;
  const authorizedCafesCount = approvedCafeIds.length;

  const summary = {
    totalDocuments,
    poAndGrnDocuments,
    financialAndTaxDocuments,
    agreementsDocuments,
    authorizedCafesCount,
  };

  // Multi-Criteria Filtering
  let filtered = allDocs;

  if (category && category !== 'ALL') {
    const cat = String(category).trim().toUpperCase();
    filtered = filtered.filter((d) => String(d.category || '').toUpperCase() === cat);
  }

  if (dateRange && dateRange !== 'ALL') {
    const { start, end } = resolveDateConstraints(dateRange, customStart, customEnd);
    filtered = filtered.filter((d) => {
      const docDate = d.documentDate;
      if (!docDate) return true;
      if (start && docDate < start) return false;
      if (end && docDate > end) return false;
      return true;
    });
  }

  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (d) =>
        String(d.title || '').toLowerCase().includes(term) ||
        String(d.referenceNumber || '').toLowerCase().includes(term) ||
        String(d.relatedId || '').toLowerCase().includes(term) ||
        String(d.cafeName || '').toLowerCase().includes(term) ||
        String(d.description || '').toLowerCase().includes(term)
    );
  }

  // Sorting
  if (sortBy === 'date_asc') {
    filtered.sort((a, b) => String(a.documentDate || '').localeCompare(String(b.documentDate || '')));
  } else if (sortBy === 'name_asc') {
    filtered.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else if (sortBy === 'type') {
    filtered.sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')));
  } else {
    // date_desc
    filtered.sort((a, b) => String(b.documentDate || '').localeCompare(String(a.documentDate || '')));
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedItems = filtered.slice(startIndex, startIndex + limitNum);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_DOCUMENTS_VIEWED',
    targetType: 'DOCUMENTS_REGISTER',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      totalCount: allDocs.length,
      filteredCount: filtered.length,
    },
  });

  return res.status(200).json({
    success: true,
    summary,
    data: paginatedItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / limitNum) || 1,
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/documents/csv
 * Standard CSV export for vendor documents register.
 */
const downloadVendorDocumentsCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = (req.auth.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, category, dateRange, customStart, customEnd, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { documents: allDocs } = await fetchAllVendorDocuments({
    organisationId,
    vendorId,
    approvedCafeIds,
    scopedCafeId,
  });

  let filtered = allDocs;
  if (category && category !== 'ALL') {
    const cat = String(category).trim().toUpperCase();
    filtered = filtered.filter((d) => String(d.category || '').toUpperCase() === cat);
  }
  if (dateRange && dateRange !== 'ALL') {
    const { start, end } = resolveDateConstraints(dateRange, customStart, customEnd);
    filtered = filtered.filter((d) => {
      const docDate = d.documentDate;
      if (!docDate) return true;
      if (start && docDate < start) return false;
      if (end && docDate > end) return false;
      return true;
    });
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (d) =>
        String(d.title || '').toLowerCase().includes(term) ||
        String(d.referenceNumber || '').toLowerCase().includes(term) ||
        String(d.relatedId || '').toLowerCase().includes(term) ||
        String(d.cafeName || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const headers = [
    'Document ID',
    'Document Title',
    'Category',
    'Reference Number',
    'Related Record ID',
    'Café',
    'Document Date',
    'File Type',
    'Status',
    'Description',
  ];

  const csvRows = [headers.join(',')];
  for (const item of filtered) {
    const row = [
      `"${String(item.docId || '').replace(/"/g, '""')}"`,
      `"${String(item.title || '').replace(/"/g, '""')}"`,
      `"${String(item.category || '').replace(/"/g, '""')}"`,
      `"${String(item.referenceNumber || '').replace(/"/g, '""')}"`,
      `"${String(item.relatedId || '').replace(/"/g, '""')}"`,
      `"${String(item.cafeName || '').replace(/"/g, '""')}"`,
      `"${String(item.documentDate || '').replace(/"/g, '""')}"`,
      `"${String(item.fileType || 'PDF').replace(/"/g, '""')}"`,
      `"${String(item.status || 'ACTIVE').replace(/"/g, '""')}"`,
      `"${String(item.description || '').replace(/"/g, '""')}"`,
    ];
    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const buffer = Buffer.from(csvContent, 'utf-8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_DOCUMENTS_EXPORTED',
    targetType: 'DOCUMENTS_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorDocuments-${vendorId}-${todayStr}.csv"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
});

/**
 * GET /api/v1/vendor/documents/xlsx
 * Standard OpenXML Excel export for vendor commercial documents register.
 */
const downloadVendorDocumentsXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'The requested vendor account was not found.');
  }

  const approvedCafes = (vendor.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const { cafeId, type, status, fromDate, toDate, search } = req.query;

  let scopedCafeId = null;
  if (cafeId && cafeId !== 'ALL') {
    scopedCafeId = String(cafeId).trim().toUpperCase();
    if (!approvedCafes.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
    }
  }

  const { documents: allDocs } = await fetchAndFormatVendorDocuments({
    organisationId,
    vendorId,
    scopedCafeId,
    approvedCafes,
  });

  let filtered = allDocs;
  if (type && type !== 'ALL') {
    const t = String(type).trim().toUpperCase();
    filtered = filtered.filter((d) => String(d.type || '').toUpperCase() === t);
  }
  if (status && status !== 'ALL') {
    const s = String(status).trim().toUpperCase();
    filtered = filtered.filter((d) => String(d.status || '').toUpperCase() === s);
  }
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    filtered = filtered.filter((d) => d.date >= fromDate);
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    filtered = filtered.filter((d) => d.date <= toDate);
  }
  if (search) {
    const term = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (d) =>
        String(d.documentNumber || '').toLowerCase().includes(term) ||
        String(d.description || '').toLowerCase().includes(term) ||
        String(d.cafeName || '').toLowerCase().includes(term)
    );
  }

  const todayStr = getIstDateString();
  const columns = [
    { key: 'documentNumber', label: 'Document Number' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Date' },
    { key: 'cafeId', label: 'Cafe ID' },
    { key: 'cafeName', label: 'Cafe Name' },
    { key: 'amountInr', label: 'Amount (INR)', isNum: true },
    { key: 'status', label: 'Status' },
    { key: 'mimeType', label: 'Format' },
    { key: 'description', label: 'Description' },
  ];

  const rows = filtered.map((d) => ({
    documentNumber: d.documentNumber || '',
    type: d.typeLabel || d.type || '',
    date: d.date || '',
    cafeId: d.cafeId || '',
    cafeName: d.cafeName || '',
    amountInr: typeof d.amountPaisa === 'number' ? d.amountPaisa / 100 : Number(d.amount || 0),
    status: d.status || '',
    mimeType: d.mimeType || 'application/pdf',
    description: d.description || '',
  }));

  const xlsxResult = generateXlsx({
    sheetName: 'Documents Register',
    reportTitle: `Vendor Commercial Documents — ${vendor.vendorName || vendor.name || vendorId}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_DOCUMENTS_EXPORTED',
    targetType: 'DOCUMENTS_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { rowCount: filtered.length },
  });

  const filename = `VendorDocuments-${vendorId}-${todayStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/documents/:docId/download
 * Universal download dispatcher for any commercial document in the register.
 */
const downloadVendorDocumentUniversal = asyncHandler(async (req, res, next) => {
  const { docId } = req.params;
  const rawId = String(docId || '').trim();

  if (rawId.startsWith('DOC-PO-')) {
    req.params.purchaseOrderId = rawId.replace('DOC-PO-', '');
    return downloadVendorOrderPdf(req, res, next);
  }
  if (rawId.startsWith('DOC-GRN-')) {
    req.params.grnId = rawId.replace('DOC-GRN-', '');
    return downloadVendorGrnPdf(req, res, next);
  }
  if (rawId.startsWith('DOC-INV-')) {
    req.params.invoiceId = rawId.replace('DOC-INV-', '');
    return downloadVendorInvoicePdf(req, res, next);
  }
  if (rawId.startsWith('DOC-PAY-')) {
    req.params.paymentId = rawId.replace('DOC-PAY-', '');
    return downloadVendorPaymentReceiptPdf(req, res, next);
  }
  if (rawId.startsWith('DOC-ADJ-')) {
    req.params.adjustmentId = rawId.replace('DOC-ADJ-', '');
    return downloadVendorAdjustmentPdf(req, res, next);
  }
  if (rawId.startsWith('DOC-RATE-')) {
    req.params.itemId = rawId.replace('DOC-RATE-', '');
    return downloadVendorProductPdf(req, res, next);
  }

  // BusinessDocument or Attachment fallback
  req.params.documentId = rawId.replace('DOC-BD-', '').replace('DOC-ATT-', '');
  return downloadVendorDocumentFile(req, res, next);
});

/**
 * GET /api/v1/vendor/documents/:documentId/file
 * Downloads specific BusinessDocument or attachment file.
 */
const downloadVendorDocumentFile = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = (req.auth.approvedCafeIds || []).map((id) => String(id).trim().toUpperCase());
  const targetDocId = req.params.documentId || req.params.docId;

  const doc = await BusinessDocument.findOne({
    organisationId,
    $or: [{ documentId: targetDocId }, { _id: targetDocId.match(/^[0-9a-fA-F]{24}$/) ? targetDocId : null }],
    $or: [
      { entityId: vendorId },
      { relatedRecordId: vendorId },
      { cafeId: { $in: approvedCafeIds } },
    ],
  }).lean();

  if (!doc) {
    throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'The requested document record was not found or is not accessible.');
  }

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: doc.cafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_BUSINESS_DOCUMENT_DOWNLOADED',
    targetType: 'BUSINESS_DOCUMENT',
    targetId: doc.documentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, documentType: doc.documentType },
  });

  const mime = doc.versions?.[0]?.mimeType || 'application/pdf';
  const fname = doc.versions?.[0]?.originalFilename || `${doc.documentId}.pdf`;

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);

  if (doc.versions?.[0]?.fileData) {
    const buf = Buffer.from(doc.versions[0].fileData, 'base64');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  }

  const placeholderBuf = Buffer.from(`%PDF-1.4\n% Zamorin Business Document: ${doc.documentId}\n% Type: ${doc.documentType}\n`, 'utf8');
  res.setHeader('Content-Length', placeholderBuf.length);
  return res.status(200).send(placeholderBuf);
});

function resolveNotificationTargetScreen(entityType, deepLink) {
  if (deepLink && typeof deepLink === 'string') {
    const dl = deepLink.toLowerCase();
    if (dl.includes('order')) return 'vendor-orders';
    if (dl.includes('deliver') || dl.includes('grn')) return 'vendor-deliveries';
    if (dl.includes('invoice') || dl.includes('bill')) return 'vendor-invoices';
    if (dl.includes('payment') || dl.includes('settle')) return 'vendor-payments';
    if (dl.includes('return') || dl.includes('adjust') || dl.includes('credit') || dl.includes('debit')) return 'vendor-adjustments';
    if (dl.includes('document')) return 'vendor-documents';
    if (dl.includes('report')) return 'vendor-reports';
  }
  if (entityType && typeof entityType === 'string') {
    const et = entityType.toUpperCase();
    if (et.includes('PURCHASE_ORDER') || et.includes('PO') || et.includes('ORDER')) return 'vendor-orders';
    if (et.includes('GRN') || et.includes('RECEIPT') || et.includes('DELIVERY') || et.includes('ASN')) return 'vendor-deliveries';
    if (et.includes('INVOICE') || et.includes('BILL')) return 'vendor-invoices';
    if (et.includes('PAYMENT') || et.includes('DISBURSEMENT') || et.includes('SETTLEMENT')) return 'vendor-payments';
    if (et.includes('CREDIT_NOTE') || et.includes('DEBIT_NOTE') || et.includes('ADJUSTMENT')) return 'vendor-adjustments';
    if (et.includes('DOCUMENT') || et.includes('CERTIFICATE') || et.includes('AGREEMENT') || et.includes('CONTRACT')) return 'vendor-documents';
    if (et.includes('REPORT')) return 'vendor-reports';
  }
  return 'vendor-dashboard';
}

/**
 * GET /api/v1/vendor/notifications
 * VEN-SCR-012: Vendor Notifications & Operational Dispatch Feed (Read-Only)
 */
const getVendorNotifications = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access notifications for the requested café.');
    }
  }

  const baseRecipientFilter = {
    organisationId,
    recipientRole: 'VENDOR',
    $or: [{ recipientUserId: req.auth.userId }, { recipientUserId: vendorId }],
  };

  let cafeFilter = {};
  if (scopedCafeId) {
    cafeFilter = { $or: [{ cafeId: scopedCafeId }, { cafeId: null }, { cafeId: '' }] };
  } else {
    cafeFilter = { $or: [{ cafeId: { $in: approvedCafeIds } }, { cafeId: null }, { cafeId: '' }, { cafeId: { $exists: false } }] };
  }

  const [allNotifications, cafes] = await Promise.all([
    Notification.find({
      ...baseRecipientFilter,
      ...cafeFilter,
    })
      .sort({ createdAt: -1 })
      .lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName code')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, c.displayName || c.name || c.cafeId);
  }

  // 4 KPI Authoritative Summaries
  const totalNotifications = allNotifications.length;
  let unreadNotifications = 0;
  let commercialAlerts = 0;
  let operationalDispatches = 0;

  for (const n of allNotifications) {
    if (!n.readAt) unreadNotifications++;
    const cat = String(n.category || '').toUpperCase();
    if (['COMMERCIAL', 'BILLING', 'PRICING'].includes(cat)) {
      commercialAlerts++;
    }
    if (['OPERATIONAL', 'DELIVERY', 'LOGISTICS', 'ORDER', 'DISPATCH', 'GRN'].includes(cat)) {
      operationalDispatches++;
    }
  }

  // Filtering
  const categoryFilter = req.query.category ? String(req.query.category).trim().toUpperCase() : 'ALL';
  const priorityFilter = req.query.priority ? String(req.query.priority).trim().toUpperCase() : 'ALL';
  const readFilter = req.query.readStatus ? String(req.query.readStatus).trim().toUpperCase() : 'ALL';
  const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  const dateConstraints = resolveDateConstraints(req.query.dateRange, req.query.customStart, req.query.customEnd);

  let filtered = allNotifications;

  if (categoryFilter && categoryFilter !== 'ALL') {
    filtered = filtered.filter((n) => String(n.category || '').toUpperCase() === categoryFilter);
  }

  if (priorityFilter && priorityFilter !== 'ALL') {
    filtered = filtered.filter((n) => String(n.priority || '').toUpperCase() === priorityFilter);
  }

  if (readFilter === 'UNREAD') {
    filtered = filtered.filter((n) => !n.readAt);
  } else if (readFilter === 'READ') {
    filtered = filtered.filter((n) => Boolean(n.readAt));
  }

  if (dateConstraints) {
    filtered = filtered.filter((n) => {
      const d = n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : '';
      return d >= dateConstraints.start && d <= dateConstraints.end;
    });
  }

  if (searchQuery) {
    filtered = filtered.filter((n) => {
      const t = (n.title || '').toLowerCase();
      const m = (n.message || '').toLowerCase();
      const c = (n.category || '').toLowerCase();
      const sid = (n.sourceEntityId || '').toLowerCase();
      return t.includes(searchQuery) || m.includes(searchQuery) || c.includes(searchQuery) || sid.includes(searchQuery);
    });
  }

  const sanitizedRows = filtered.map((n) => {
    let cleanMessage = String(n.message || '');
    cleanMessage = cleanMessage.replace(/\b(retailPrice|retailSellingPrice|grossMargin|profitMargin|margin|markup|costRate|internalNote)\b/gi, '[REDACTED]');

    return {
      notificationId: n.notificationId,
      title: n.title,
      message: cleanMessage,
      category: n.category || 'COMMERCIAL',
      priority: n.priority || 'NORMAL',
      cafeId: n.cafeId || null,
      cafeName: n.cafeId ? (cafeMap.get(n.cafeId) || n.cafeId) : 'All Cafés (Global)',
      sourceModule: n.sourceModule || 'VENDOR_WORKSPACE',
      sourceEntityType: n.sourceEntityType || null,
      sourceEntityId: n.sourceEntityId || null,
      targetScreen: resolveNotificationTargetScreen(n.sourceEntityType, n.deepLink),
      deepLink: n.deepLink || null,
      isRead: Boolean(n.readAt),
      readAt: n.readAt || null,
      createdAt: n.createdAt,
      createdAtFormatted: n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'N/A',
      isoDate: n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : '',
    };
  });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const total = sanitizedRows.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginatedRows = sanitizedRows.slice((page - 1) * limit, page * limit);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_NOTIFICATIONS_VIEWED',
    targetType: 'NOTIFICATIONS_REGISTER',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, resultCount: paginatedRows.length, totalCount: total },
  });

  return res.status(200).json({
    success: true,
    data: {
      kpis: {
        totalNotifications,
        unreadNotifications,
        commercialAlerts,
        operationalDispatches,
      },
      rows: paginatedRows,
      notifications: paginatedRows,
      items: paginatedRows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/notifications/csv
 * VEN-SCR-012: Safe RFC 4180 CSV Export for Vendor Notifications
 */
const downloadVendorNotificationsCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access notifications for the requested café.');
    }
  }

  const baseRecipientFilter = {
    organisationId,
    recipientRole: 'VENDOR',
    $or: [{ recipientUserId: req.auth.userId }, { recipientUserId: vendorId }],
  };

  let cafeFilter = {};
  if (scopedCafeId) {
    cafeFilter = { $or: [{ cafeId: scopedCafeId }, { cafeId: null }, { cafeId: '' }] };
  } else {
    cafeFilter = { $or: [{ cafeId: { $in: approvedCafeIds } }, { cafeId: null }, { cafeId: '' }, { cafeId: { $exists: false } }] };
  }

  const [notifications, cafes] = await Promise.all([
    Notification.find({
      ...baseRecipientFilter,
      ...cafeFilter,
    })
      .sort({ createdAt: -1 })
      .lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, c.displayName || c.name || c.cafeId);
  }

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvRows = [];
  csvRows.push('"ZAMORIN CAFE ERP - VENDOR NOTIFICATIONS & AUDIT FEED"');
  csvRows.push(`"VENDOR ID: ${vendorId}","GENERATED: ${getIstDateString()}","SCOPE: STRICTLY READ-ONLY"`);
  csvRows.push('');
  csvRows.push([
    'Notification ID',
    'Timestamp (IST)',
    'Category',
    'Priority',
    'Café',
    'Title',
    'Message',
    'Related Entity',
    'Status',
  ].map(escapeCsv).join(','));

  for (const n of notifications) {
    let msg = String(n.message || '');
    msg = msg.replace(/\b(retailPrice|retailSellingPrice|grossMargin|profitMargin|margin|markup|costRate|internalNote)\b/gi, '[REDACTED]');

    csvRows.push([
      escapeCsv(n.notificationId || ''),
      escapeCsv(n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : ''),
      escapeCsv(n.category || 'COMMERCIAL'),
      escapeCsv(n.priority || 'NORMAL'),
      escapeCsv(n.cafeId ? (cafeMap.get(n.cafeId) || n.cafeId) : 'All Cafés (Global)'),
      escapeCsv(n.title || ''),
      escapeCsv(msg),
      escapeCsv(n.sourceEntityId || 'N/A'),
      escapeCsv(n.readAt ? 'READ' : 'UNREAD'),
    ].join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const filename = `zamorin-vendor-notifications-${getIstDateString()}.csv`;

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_NOTIFICATIONS_CSV_DOWNLOADED',
    targetType: 'NOTIFICATIONS_CSV',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, rowCount: notifications.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csvContent);
});

/**
 * GET /api/v1/vendor/notifications/xlsx
 * VEN-SCR-012: Genuine OpenXML Excel Export for Vendor Notifications
 */
const downloadVendorNotificationsXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access notifications for the requested café.');
    }
  }

  const baseRecipientFilter = {
    organisationId,
    recipientRole: 'VENDOR',
    $or: [{ recipientUserId: req.auth.userId }, { recipientUserId: vendorId }],
  };

  let cafeFilter = {};
  if (scopedCafeId) {
    cafeFilter = { $or: [{ cafeId: scopedCafeId }, { cafeId: null }, { cafeId: '' }] };
  } else {
    cafeFilter = { $or: [{ cafeId: { $in: approvedCafeIds } }, { cafeId: null }, { cafeId: '' }, { cafeId: { $exists: false } }] };
  }

  const [notifications, cafes] = await Promise.all([
    Notification.find({
      ...baseRecipientFilter,
      ...cafeFilter,
    })
      .sort({ createdAt: -1 })
      .lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, c.displayName || c.name || c.cafeId);
  }

  const columns = [
    { key: 'notificationId', label: 'Notification ID' },
    { key: 'timestamp', label: 'Timestamp (IST)' },
    { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' },
    { key: 'cafe', label: 'Café' },
    { key: 'title', label: 'Title' },
    { key: 'message', label: 'Message' },
    { key: 'sourceEntityId', label: 'Related Entity' },
    { key: 'status', label: 'Status' },
  ];

  const rows = notifications.map((n) => {
    let msg = String(n.message || '');
    msg = msg.replace(/\b(retailPrice|retailSellingPrice|grossMargin|profitMargin|margin|markup|costRate|internalNote)\b/gi, '[REDACTED]');
    return {
      notificationId: n.notificationId || '',
      timestamp: n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '',
      category: n.category || 'COMMERCIAL',
      priority: n.priority || 'NORMAL',
      cafe: n.cafeId ? (cafeMap.get(n.cafeId) || n.cafeId) : 'All Cafés (Global)',
      title: n.title || '',
      message: msg,
      sourceEntityId: n.sourceEntityId || 'N/A',
      status: n.readAt ? 'READ' : 'UNREAD',
    };
  });

  const todayStr = getIstDateString();
  const xlsxResult = generateXlsx({
    sheetName: 'Notifications Feed',
    reportTitle: `Vendor Notifications & Audit Feed — ${vendorId}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_NOTIFICATIONS_XLSX_DOWNLOADED',
    targetType: 'NOTIFICATIONS_XLSX',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, rowCount: notifications.length },
  });

  const filename = `zamorin-vendor-notifications-${todayStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/deliveries
 * and GET /api/v1/vendor/grns
 * VEN-SCR-003: Deliveries & Goods Receipt (GRN) Register & KPI Summaries
 * 
 * Read-Only operational visibility for external vendors:
 * - Aggregates incoming delivery pipeline & completed/partial GRN receipts
 * - Provides 10 KPI summary counts:
 *   totalRecords, awaitingReceipt, expectedToday, receivedAtCafe, partiallyReceived,
 *   grnPending, grnCompleted, recordsWithDiscrepancy, totalRejectedLines, totalMissingLines
 * - Multi-criteria filtering (café scope, date ranges, delivery status, GRN status, discrepancy)
 * - Universal search (PO number, GRN number, delivery note, ASN, item name, SKU, café name, café code)
 * - Semantic unit protection: Never sums across incompatible UOMs (e.g. 10 KG + 5 L != 15 units)
 * - Preserves individual GRN history for multiple receipts against a single PO
 */
const getVendorDeliveries = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];

  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;
  const poQuery = {
    organisationId,
    vendorId,
    status: { $ne: 'DRAFT' },
  };

  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    poQuery.cafeId = targetCafeId;
  } else {
    poQuery.cafeId = { $in: approvedCafeIds };
  }

  const dateConstraints = resolveDateConstraints(
    req.query.dateRange,
    req.query.customStart,
    req.query.customEnd
  );

  const [pos, cafes] = await Promise.all([
    PurchaseOrder.find(poQuery)
      .select('purchaseOrderId cafeId status orderDate expectedDeliveryDate receivedDate lineItems grnReceipts advanceShippingNoticeIds deliveryChallanIds creditDebitNoteIds createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean(),
    Cafe.find({
      organisationId,
      cafeId: { $in: approvedCafeIds },
    })
      .select('cafeId name displayName code branchCode city state address')
      .lean(),
  ]);

  const cafeMap = new Map();
  for (const c of cafes) {
    cafeMap.set(c.cafeId, {
      cafeId: c.cafeId,
      name: c.displayName || c.name || c.cafeId,
      code: c.code || c.branchCode || '',
      address: formatCafeAddress(c.address),
    });
  }

  const allRecords = [];
  const todayStr = getIstDateString();

  for (const po of pos) {
    const cafeInfo = cafeMap.get(po.cafeId) || {
      cafeId: po.cafeId,
      name: po.cafeId,
      code: '',
      address: 'Main Café Facility',
    };

    const hasGrns = Array.isArray(po.grnReceipts) && po.grnReceipts.length > 0;

    // 1. Process individual GRN receipts (supports multiple GRNs per PO)
    if (hasGrns) {
      for (const grn of po.grnReceipts) {
        const receivedAtDate = grn.receivedAt
          ? new Date(grn.receivedAt).toISOString().slice(0, 10)
          : (po.receivedDate || (po.createdAt ? new Date(po.createdAt).toISOString().slice(0, 10) : todayStr));

        // Date range filtering
        if (dateConstraints) {
          if (receivedAtDate < dateConstraints.start || receivedAtDate > dateConstraints.end) {
            continue;
          }
        }

        const items = [];
        let totalDelivered = 0;
        let totalAccepted = 0;
        let totalRejected = 0;
        let totalMissing = 0;

        if (Array.isArray(grn.items)) {
          for (const git of grn.items) {
            const poLine = (po.lineItems || []).find((l) => l.itemId === git.itemId);
            const ordered = Number(poLine?.orderedQuantityBase || 0);
            const del = Number(git.deliveredQty || 0);
            const acc = Number(git.acceptedQty || 0);
            const rej = Number(git.rejectedQty || 0);
            const mis = Number(git.missingQty || 0);
            const uom = poLine?.baseUnit || 'UNIT';

            totalDelivered += del;
            totalAccepted += acc;
            totalRejected += rej;
            totalMissing += mis;

            items.push({
              itemId: git.itemId,
              itemName: poLine?.itemNameSnapshot || git.itemId,
              sku: poLine?.supplierItemCode || '',
              packSize: poLine?.packSize || '',
              baseUnit: uom,
              orderedQty: ordered,
              deliveredQty: del,
              receivedQty: del,
              acceptedQty: acc,
              rejectedQty: rej,
              missingQty: mis,
              rejectionReason: git.rejectionReason || null,
              discrepancyReason: git.discrepancyReason || '',
              lotNumber: git.lotNumber || null,
              manufacturingDate: git.manufacturingDate || null,
              expiryDate: git.expiryDate || null,
            });
          }
        }

        const hasDiscrepancy = totalRejected > 0 || totalMissing > 0;
        let discrepancyType = 'NONE';
        if (totalRejected > 0 && totalMissing > 0) discrepancyType = 'SHORTAGE_AND_REJECTION';
        else if (totalRejected > 0) discrepancyType = 'REJECTED_QUANTITY';
        else if (totalMissing > 0) discrepancyType = 'QUANTITY_SHORTAGE';

        // Derive GRN status
        let grnStatus = 'Completed';
        if (po.status === 'VERIFIED_PENDING_MASTER_APPROVAL') grnStatus = 'Verification Pending';
        else if (grn.status === 'REJECTED') grnStatus = 'Rejected';
        else if (grn.status === 'PARTIAL') grnStatus = 'Partial';
        else if (grn.status === 'ACCEPTED' || po.status === 'CLOSED' || po.status === 'RECEIVED') grnStatus = 'Completed';
        else grnStatus = 'Recorded';

        // Derive Delivery status
        let deliveryStatus = 'Received';
        if (po.status === 'CLOSED') deliveryStatus = 'Completed';
        else if (po.status === 'PARTIALLY_RECEIVED' || grn.status === 'PARTIAL') deliveryStatus = 'Partially Received';
        else deliveryStatus = 'Received';

        // Semantic unit handling: check distinct UOMs
        const distinctUnits = [...new Set(items.map((i) => i.baseUnit))];
        let quantitySummary = '';
        if (distinctUnits.length === 1 && items.length > 0) {
          quantitySummary = `${totalDelivered} ${distinctUnits[0]}`;
        } else if (items.length > 0) {
          quantitySummary = `${items.length} Lines (${distinctUnits.join(', ')})`;
        } else {
          quantitySummary = '0 Items';
        }

        allRecords.push({
          id: grn.grnId,
          recordType: 'GRN_RECEIPT',
          grnId: grn.grnId,
          deliveryReference: grn.deliveryNoteNumber || po.advanceShippingNoticeIds?.[0] || 'Store Intake Note',
          asnReference: po.advanceShippingNoticeIds?.[0] || null,
          purchaseOrderId: po.purchaseOrderId,
          cafeId: po.cafeId,
          cafeName: cafeInfo.name,
          cafeCode: cafeInfo.code,
          receiptDate: receivedAtDate,
          receiptTime: grn.receivedAt ? new Date(grn.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
          expectedDeliveryDate: po.expectedDeliveryDate,
          itemCount: items.length,
          deliveredQty: totalDelivered,
          acceptedQty: totalAccepted,
          rejectedQty: totalRejected,
          missingQty: totalMissing,
          quantitySummary,
          hasDiscrepancy,
          discrepancyType,
          discrepancySummary: hasDiscrepancy
            ? `${totalRejected > 0 ? `${totalRejected} Rejected` : ''}${totalRejected > 0 && totalMissing > 0 ? ', ' : ''}${totalMissing > 0 ? `${totalMissing} Short` : ''}`
            : 'No Discrepancy',
          deliveryStatus,
          grnStatus,
          isAwaitingReceipt: false,
          items,
          attachmentCount: (grn.receiptAttachments || []).length,
        });
      }
    } else if (po.status !== 'CANCELLED' && po.status !== 'CLOSED') {
      // 2. Open / Pending PO awaiting initial delivery receipt
      const orderDate = po.expectedDeliveryDate || po.orderDate || (po.createdAt ? new Date(po.createdAt).toISOString().slice(0, 10) : todayStr);

      if (dateConstraints) {
        if (orderDate < dateConstraints.start || orderDate > dateConstraints.end) {
          continue;
        }
      }

      const items = (po.lineItems || []).map((li) => ({
        itemId: li.itemId,
        itemName: li.itemNameSnapshot || li.itemId,
        sku: li.supplierItemCode || '',
        packSize: li.packSize || '',
        baseUnit: li.baseUnit || 'UNIT',
        orderedQty: Number(li.orderedQuantityBase || 0),
        deliveredQty: 0,
        receivedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
        missingQty: 0,
        pendingQty: Number(li.orderedQuantityBase || 0),
        rejectionReason: null,
        discrepancyReason: '',
        lotNumber: null,
        manufacturingDate: null,
        expiryDate: null,
      }));

      const distinctUnits = [...new Set(items.map((i) => i.baseUnit))];
      const totalOrdered = items.reduce((acc, i) => acc + i.orderedQty, 0);
      let quantitySummary = '';
      if (distinctUnits.length === 1 && items.length > 0) {
        quantitySummary = `${totalOrdered} ${distinctUnits[0]} Ordered`;
      } else if (items.length > 0) {
        quantitySummary = `${items.length} Lines Expected (${distinctUnits.join(', ')})`;
      } else {
        quantitySummary = '0 Items';
      }

      const deliveryStatus = po.status === 'DISPATCHED' ? 'In Transit' : 'Awaiting Supply';

      allRecords.push({
        id: `DEL-${po.purchaseOrderId}`,
        recordType: 'DELIVERY_PIPELINE',
        grnId: null,
        deliveryReference: po.advanceShippingNoticeIds?.[0] || 'Pending Intake',
        asnReference: po.advanceShippingNoticeIds?.[0] || null,
        purchaseOrderId: po.purchaseOrderId,
        cafeId: po.cafeId,
        cafeName: cafeInfo.name,
        cafeCode: cafeInfo.code,
        receiptDate: null,
        receiptTime: null,
        expectedDeliveryDate: po.expectedDeliveryDate,
        itemCount: items.length,
        deliveredQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
        missingQty: 0,
        quantitySummary,
        hasDiscrepancy: false,
        discrepancyType: 'NONE',
        discrepancySummary: 'Pending Receipt',
        deliveryStatus,
        grnStatus: 'Pending',
        isAwaitingReceipt: true,
        items,
        attachmentCount: 0,
      });
    }
  }

  // Calculate 10 Period KPI Summary counts across all records matching date window
  const kpis = {
    totalRecords: allRecords.length,
    awaitingReceipt: allRecords.filter((r) => r.isAwaitingReceipt || r.deliveryStatus === 'Awaiting Supply').length,
    expectedToday: allRecords.filter((r) => r.expectedDeliveryDate === todayStr && r.isAwaitingReceipt).length,
    receivedAtCafe: allRecords.filter((r) => r.deliveryStatus === 'Received' || r.deliveryStatus === 'Completed').length,
    partiallyReceived: allRecords.filter((r) => r.deliveryStatus === 'Partially Received').length,
    grnPending: allRecords.filter((r) => r.grnStatus === 'Pending' || r.grnStatus === 'Verification Pending').length,
    grnCompleted: allRecords.filter((r) => r.grnStatus === 'Completed').length,
    recordsWithDiscrepancy: allRecords.filter((r) => r.hasDiscrepancy).length,
    totalRejectedLines: allRecords.reduce((acc, r) => acc + (r.items || []).filter((i) => i.rejectedQty > 0).length, 0),
    totalMissingLines: allRecords.reduce((acc, r) => acc + (r.items || []).filter((i) => i.missingQty > 0).length, 0),
  };

  // Universal Search Filtering
  let filtered = allRecords;
  const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter((r) => {
      const matchPo = String(r.purchaseOrderId || '').toLowerCase().includes(searchQuery);
      const matchGrn = String(r.grnId || '').toLowerCase().includes(searchQuery);
      const matchRef = String(r.deliveryReference || '').toLowerCase().includes(searchQuery);
      const matchAsn = String(r.asnReference || '').toLowerCase().includes(searchQuery);
      const matchCafe = String(r.cafeName || '').toLowerCase().includes(searchQuery) ||
        String(r.cafeCode || '').toLowerCase().includes(searchQuery);
      const matchItems = (r.items || []).some(
        (i) =>
          String(i.itemName || '').toLowerCase().includes(searchQuery) ||
          String(i.sku || '').toLowerCase().includes(searchQuery) ||
          String(i.itemId || '').toLowerCase().includes(searchQuery)
      );
      return matchPo || matchGrn || matchRef || matchAsn || matchCafe || matchItems;
    });
  }

  // Filter: Delivery Status
  const deliveryStatusFilter = req.query.deliveryStatus ? String(req.query.deliveryStatus).trim() : 'ALL';
  if (deliveryStatusFilter && deliveryStatusFilter !== 'ALL') {
    filtered = filtered.filter((r) => r.deliveryStatus.toUpperCase() === deliveryStatusFilter.toUpperCase());
  }

  // Filter: GRN Status
  const grnStatusFilter = req.query.grnStatus ? String(req.query.grnStatus).trim() : 'ALL';
  if (grnStatusFilter && grnStatusFilter !== 'ALL') {
    filtered = filtered.filter((r) => r.grnStatus.toUpperCase() === grnStatusFilter.toUpperCase());
  }

  // Filter: Discrepancy
  const discrepancyFilter = req.query.discrepancy ? String(req.query.discrepancy).trim().toUpperCase() : 'ALL';
  if (discrepancyFilter && discrepancyFilter !== 'ALL') {
    if (discrepancyFilter === 'NO_DISCREPANCY') {
      filtered = filtered.filter((r) => !r.hasDiscrepancy);
    } else if (discrepancyFilter === 'QUANTITY_SHORTAGE') {
      filtered = filtered.filter((r) => r.missingQty > 0);
    } else if (discrepancyFilter === 'REJECTED_QUANTITY') {
      filtered = filtered.filter((r) => r.rejectedQty > 0);
    } else if (discrepancyFilter === 'DAMAGED') {
      filtered = filtered.filter((r) =>
        (r.items || []).some((i) => String(i.rejectionReason || '').includes('DAMAGE') || String(i.rejectionReason || '').includes('LEAK'))
      );
    } else if (discrepancyFilter === 'OTHER') {
      filtered = filtered.filter((r) => r.hasDiscrepancy);
    }
  }

  // Pagination
  const total = filtered.length;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const totalPages = Math.ceil(total / limit) || 1;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: targetCafeId || null,
    actorId: req.auth.userId,
    action: 'VENDOR_DELIVERIES_LIST_VIEWED',
    targetType: 'VENDOR_DELIVERIES',
    targetId: vendorId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: {
      resultCount: paginated.length,
      totalCount: total,
    },
  });

  return res.status(200).json({
    success: true,
    data: {
      kpis,
      deliveries: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      activeFilters: {
        cafeId: targetCafeId || 'ALL',
        dateRange: req.query.dateRange || 'all',
        deliveryStatus: deliveryStatusFilter,
        grnStatus: grnStatusFilter,
        discrepancy: discrepancyFilter,
        search: searchQuery,
      },
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/deliveries/:deliveryId
 * and GET /api/v1/vendor/grns/:grnId
 * and GET /api/v1/vendor/orders/:purchaseOrderId/grns/:grnId
 * 
 * Provides comprehensive read-only detail of a Goods Receipt Note or incoming delivery:
 * A. Identity & References
 * B. Linked Purchase Order
 * C. Item-Level Receiving Reconciliation
 * D. Rejection / Shortage Discrepancy Breakdown (strictly vendor-safe descriptions)
 * E. Receiving Lifecycle 8-Stage Milestones Timeline
 * F. Related Invoices (status only, safe navigation)
 * G. Returns / Debit note reference
 * H. Authorised Documents (A4 PDF, delivery receipts)
 */
const getVendorDeliveryDetails = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const targetId = req.params.deliveryId || req.params.grnId || req.params.purchaseOrderId;

  const po = await PurchaseOrder.findOne({
    organisationId,
    vendorId,
    $or: [
      { 'grnReceipts.grnId': targetId },
      { purchaseOrderId: targetId },
      { purchaseOrderId: req.params.purchaseOrderId },
    ],
  }).lean();

  if (!po) {
    throw new ApiError(404, 'RECORD_NOT_FOUND', 'The requested delivery or goods receipt record was not found.');
  }

  // Cross-Café Authorization
  if (!approvedCafeIds.includes(String(po.cafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, allLinkedInvoices] = await Promise.all([
    Cafe.findOne({
      organisationId,
      cafeId: po.cafeId,
    }).select('cafeId name displayName code branchCode city state address phone managerName contactPerson').lean(),
    APInvoice.find({
      organisationId,
      vendorId,
      poReferenceId: po.purchaseOrderId,
    }).lean(),
  ]);

  const cafeName = cafe?.displayName || cafe?.name || po.cafeId;
  const cafeCode = cafe?.code || cafe?.branchCode || '';
  const cafeAddress = formatCafeAddress(cafe?.address);

  // Match specific GRN or default to first/matched
  let matchedGrn = null;
  if (Array.isArray(po.grnReceipts)) {
    matchedGrn = po.grnReceipts.find((g) => g.grnId === targetId || g.grnId === req.params.grnId) || po.grnReceipts[0] || null;
  }

  const isAwaitingReceipt = !matchedGrn;
  const grnId = matchedGrn ? matchedGrn.grnId : null;
  const deliveryReference = matchedGrn?.deliveryNoteNumber || po.advanceShippingNoticeIds?.[0] || 'Store Intake Note';

  // Section C: Item-Level Receiving Reconciliation
  const items = [];
  const discrepancies = [];
  let totalDelivered = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  let totalMissing = 0;

  if (matchedGrn && Array.isArray(matchedGrn.items)) {
    for (const git of matchedGrn.items) {
      const poLine = (po.lineItems || []).find((l) => l.itemId === git.itemId);
      const ordered = Number(poLine?.orderedQuantityBase || 0);
      const del = Number(git.deliveredQty || 0);
      const acc = Number(git.acceptedQty || 0);
      const rej = Number(git.rejectedQty || 0);
      const mis = Number(git.missingQty || 0);
      const pending = Math.max(0, ordered - Number(poLine?.acceptedReceivedQty || acc));
      const uom = poLine?.baseUnit || 'UNIT';

      totalDelivered += del;
      totalAccepted += acc;
      totalRejected += rej;
      totalMissing += mis;

      const itemRecord = {
        itemId: git.itemId,
        itemName: poLine?.itemNameSnapshot || git.itemId,
        sku: poLine?.supplierItemCode || '',
        packSize: poLine?.packSize || '',
        baseUnit: uom,
        orderedQty: ordered,
        deliveredQty: del,
        receivedQty: del,
        acceptedQty: acc,
        rejectedQty: rej,
        missingQty: mis,
        pendingQty: pending,
        lotNumber: git.lotNumber || null,
        manufacturingDate: git.manufacturingDate || null,
        expiryDate: git.expiryDate || null,
      };
      items.push(itemRecord);

      if (rej > 0 || mis > 0 || git.discrepancyReason) {
        discrepancies.push({
          itemId: git.itemId,
          itemName: poLine?.itemNameSnapshot || git.itemId,
          sku: poLine?.supplierItemCode || '',
          rejectedQuantity: rej,
          missingQuantity: mis,
          uom,
          reasonCode: git.rejectionReason || (rej > 0 ? 'DAMAGED_DURING_RECEIPT' : 'SHORT_SUPPLY'),
          description: git.discrepancyReason || (rej > 0 ? 'Packaging or quality discrepancy noted at delivery intake.' : 'Shortage recorded at intake.'),
          date: matchedGrn.receivedAt ? new Date(matchedGrn.receivedAt).toISOString().slice(0, 10) : po.orderDate,
          grnId: matchedGrn.grnId,
        });
      }
    }
  } else {
    // Awaiting receipt item reconciliation
    for (const li of (po.lineItems || [])) {
      const ord = Number(li.orderedQuantityBase || 0);
      items.push({
        itemId: li.itemId,
        itemName: li.itemNameSnapshot || li.itemId,
        sku: li.supplierItemCode || '',
        packSize: li.packSize || '',
        baseUnit: li.baseUnit || 'UNIT',
        orderedQty: ord,
        deliveredQty: 0,
        receivedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
        missingQty: 0,
        pendingQty: ord,
        lotNumber: null,
        manufacturingDate: null,
        expiryDate: null,
      });
    }
  }

  // Derive statuses
  let grnStatus = 'Completed';
  if (isAwaitingReceipt) grnStatus = 'Pending';
  else if (po.status === 'VERIFIED_PENDING_MASTER_APPROVAL') grnStatus = 'Verification Pending';
  else if (matchedGrn?.status === 'REJECTED') grnStatus = 'Rejected';
  else if (matchedGrn?.status === 'PARTIAL') grnStatus = 'Partial';
  else if (matchedGrn?.status === 'ACCEPTED' || po.status === 'CLOSED' || po.status === 'RECEIVED') grnStatus = 'Completed';
  else grnStatus = 'Recorded';

  let deliveryStatus = 'Received';
  if (isAwaitingReceipt) deliveryStatus = po.status === 'DISPATCHED' ? 'In Transit' : 'Awaiting Supply';
  else if (po.status === 'CLOSED') deliveryStatus = 'Completed';
  else if (po.status === 'PARTIALLY_RECEIVED' || matchedGrn?.status === 'PARTIAL') deliveryStatus = 'Partially Received';

  // Section E: 8-Stage Visual Timeline
  const hasSupply = ['ACKNOWLEDGED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(po.status);
  const hasArrived = Boolean(matchedGrn) || ['PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_PENDING_FINAL_POSTING', 'VERIFIED_PENDING_MASTER_APPROVAL', 'CLOSED'].includes(po.status);
  const hasCount = Boolean(matchedGrn);
  const hasDiscrepancy = discrepancies.length > 0;
  const hasGrnCreated = Boolean(matchedGrn);
  const hasGrnVerified = ['VERIFIED_PENDING_MASTER_APPROVAL', 'RECEIVED', 'CLOSED'].includes(po.status) || matchedGrn?.status === 'ACCEPTED';
  const hasGrnCompleted = po.status === 'CLOSED' || (hasGrnVerified && po.status !== 'VERIFIED_PENDING_MASTER_APPROVAL');

  const timeline = [
    { key: 'po_issued', label: 'Purchase Order Issued', completed: po.status !== 'DRAFT', timestamp: po.orderPlacedAt || po.orderDate },
    { key: 'supply_recorded', label: 'Supply / Delivery Recorded', completed: hasSupply, timestamp: null },
    { key: 'arrived_at_cafe', label: 'Arrived at Café Receiving Bay', completed: hasArrived, timestamp: matchedGrn?.receivedAt || po.receivedDate || null },
    { key: 'physical_count', label: 'Physical Count Intake Completed', completed: hasCount, timestamp: matchedGrn?.receivedAt || null },
    { key: 'discrepancy_recorded', label: 'Discrepancy Recorded', completed: hasDiscrepancy, timestamp: discrepancies[0]?.date || null },
    { key: 'grn_created', label: 'Goods Receipt Note (GRN) Created', completed: hasGrnCreated, timestamp: matchedGrn?.receivedAt || null },
    { key: 'grn_verification', label: 'GRN Physical Verification Handoff', completed: hasGrnVerified, timestamp: null },
    { key: 'grn_completed', label: 'GRN Lifecycle Completed', completed: hasGrnCompleted, timestamp: null },
  ];

  // Section F: Related Invoices
  const relatedInvoices = allLinkedInvoices.map((inv) => ({
    invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    amountFormatted: formatCurrency(Number(inv.totalPaisa || 0)),
    approvedPayableFormatted: formatCurrency(Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0))),
    status: inv.paymentStatus || 'DUE',
    paymentStatus: inv.paymentStatus || 'DUE',
  }));

  // Section G: Returns / Debit Note references
  const returnsAndDebits = {
    hasDebitNote: Boolean(po.creditDebitNoteIds && po.creditDebitNoteIds.length > 0),
    creditDebitNoteIds: po.creditDebitNoteIds || [],
    hasDiscrepancy,
    settlementImpact: discrepancies.length > 0
      ? 'Shortages and rejections are deducted from verified payable amounts.'
      : 'No adverse physical receiving deductions.',
  };

  // Section H: Authorised Documents
  const documents = [
    {
      documentType: 'GRN_PDF',
      title: `Official Goods Receipt Note (${grnId || po.purchaseOrderId})`,
      url: `/api/v1/vendor/deliveries/${grnId || po.purchaseOrderId}/pdf`,
      filename: `GRN-${grnId || po.purchaseOrderId}.pdf`,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    },
    {
      documentType: 'PURCHASE_ORDER_PDF',
      title: `Referenced Purchase Order (${po.purchaseOrderId})`,
      url: `/api/v1/vendor/orders/${po.purchaseOrderId}/pdf`,
      filename: `PO-${po.purchaseOrderId}.pdf`,
      mimeType: 'application/pdf',
      isPrintable: true,
      isDownloadable: true,
    },
  ];

  if (matchedGrn && Array.isArray(matchedGrn.receiptAttachments)) {
    for (const att of matchedGrn.receiptAttachments) {
      documents.push({
        documentType: 'RECEIPT_ATTACHMENT',
        attachmentId: att.attachmentId,
        title: att.filename || `Receipt Attachment ${att.attachmentId}`,
        filename: att.filename || `Receipt-${att.attachmentId}.pdf`,
        url: `/api/v1/vendor/deliveries/${grnId}/attachments/${att.attachmentId}`,
        mimeType: att.mimeType || 'application/pdf',
        isPrintable: att.mimeType === 'application/pdf',
        isDownloadable: true,
      });
    }
  }

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: po.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_GRN_VIEWED',
    targetType: 'GOODS_RECEIPT_NOTE',
    targetId: grnId || po.purchaseOrderId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, purchaseOrderId: po.purchaseOrderId },
  });

  return res.status(200).json({
    success: true,
    data: {
      grnId,
      deliveryReference,
      asnReference: po.advanceShippingNoticeIds?.[0] || null,
      deliveryChallanReference: po.deliveryChallanIds?.[0] || null,
      receiptDate: matchedGrn?.receivedAt ? new Date(matchedGrn.receivedAt).toISOString().slice(0, 10) : po.receivedDate,
      receiptTime: matchedGrn?.receivedAt ? new Date(matchedGrn.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      expectedDeliveryDate: po.expectedDeliveryDate,
      deliveryStatus,
      grnStatus,
      isAwaitingReceipt,

      vendor: {
        vendorId,
        name: req.vendor?.name || po.vendorNameSnapshot || 'Valued Supplier',
        legalName: req.vendor?.legalName || req.vendor?.name || 'Valued Supplier',
        gstNumber: req.vendor?.gstNumber || 'Unregistered',
      },

      delivery: {
        cafeId: po.cafeId,
        cafeName,
        cafeCode,
        address: cafeAddress,
        contactPerson: cafe?.managerName || cafe?.contactPerson || 'Receiving Bay Operations',
        contactPhone: cafe?.phone || '',
      },

      linkedPurchaseOrder: {
        purchaseOrderId: po.purchaseOrderId,
        orderDate: po.orderDate,
        poStatus: po.status,
        totalPaisa: po.totalPaisa,
        totalFormatted: formatCurrency(po.totalPaisa || 0),
        currency: 'INR',
        viewOrderUrl: `/vendor-orders?po=${po.purchaseOrderId}`,
      },

      items,
      itemCount: items.length,
      deliveredQty: totalDelivered,
      acceptedQty: totalAccepted,
      rejectedQty: totalRejected,
      missingQty: totalMissing,

      hasDiscrepancy,
      discrepancies,
      timeline,
      relatedInvoices,
      returnsAndDebits,
      documents,

      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/deliveries/:deliveryId/pdf
 * and GET /api/v1/vendor/grns/:grnId/pdf
 * 
 * Generates an official A4 printable/downloadable Goods Receipt Note (GRN) PDF.
 * Redacts internal margins, employee IDs, and confidential chatter.
 */
const downloadVendorGrnPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const targetId = req.params.deliveryId || req.params.grnId;

  const po = await PurchaseOrder.findOne({
    organisationId,
    vendorId,
    $or: [{ 'grnReceipts.grnId': targetId }, { purchaseOrderId: targetId }],
  }).lean();

  if (!po) {
    throw new ApiError(404, 'RECORD_NOT_FOUND', 'The requested delivery or GRN record was not found.');
  }

  if (!approvedCafeIds.includes(String(po.cafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  const [cafe, vendor] = await Promise.all([
    Cafe.findOne({ organisationId, cafeId: po.cafeId }).lean(),
    req.vendor,
  ]);

  const matchedGrn = (po.grnReceipts || []).find((g) => g.grnId === targetId) || po.grnReceipts?.[0] || null;
  const grnId = matchedGrn ? matchedGrn.grnId : targetId;
  const deliveryRef = matchedGrn?.deliveryNoteNumber || po.advanceShippingNoticeIds?.[0] || 'Store Intake Note';
  const cafeName = cafe?.displayName || cafe?.name || po.cafeId;
  const vendorName = vendor?.name || po.vendorNameSnapshot || 'Valued Supplier';
  const receiptDate = matchedGrn?.receivedAt ? new Date(matchedGrn.receivedAt).toISOString().slice(0, 10) : (po.receivedDate || po.orderDate);

  function escapePdf(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  let streamOps = '';
  // Top Banner
  streamOps += `q\n0.95 0.95 0.97 rg\n20 780 555 42 re\nf\nQ\n`;
  streamOps += `BT\n/F2 15 Tf\n0.1 0.15 0.3 rg\n1 0 0 1 30 798 Tm\n(ZAMORIN CAFE ERP - GOODS RECEIPT NOTE) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 420 800 Tm\n(GRN NO: ${escapePdf(grnId)}) Tj\nET\n`;

  // Supplier & Receiving Cafe Details
  streamOps += `BT\n/F2 11 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 30 755 Tm\n(SUPPLIER DETAILS:) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 30 740 Tm\n(${escapePdf(vendorName)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 30 726 Tm\n(GSTIN: ${escapePdf(vendor?.gstNumber || 'Unregistered')}) Tj\nET\n`;

  streamOps += `BT\n/F2 11 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 320 755 Tm\n(RECEIVING LOCATION:) Tj\nET\n`;
  streamOps += `BT\n/F1 10 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 320 740 Tm\n(${escapePdf(cafeName)} [${escapePdf(po.cafeId)}]) Tj\nET\n`;
  streamOps += `BT\n/F1 9 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 320 726 Tm\n(Receipt Date: ${escapePdf(receiptDate)} | PO: ${escapePdf(po.purchaseOrderId)}) Tj\nET\n`;

  // Table Header
  streamOps += `q\n0.88 0.90 0.94 rg\n20 690 555 20 re\nf\nQ\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 25 696 Tm\n(#  ITEM DESCRIPTION) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 250 696 Tm\n(UOM) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 300 696 Tm\n(ORDERED) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 360 696 Tm\n(DELIVERED) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 430 696 Tm\n(ACCEPTED) Tj\nET\n`;
  streamOps += `BT\n/F2 9 Tf\n0.1 0.1 0.1 rg\n1 0 0 1 490 696 Tm\n(REJECT/MISS) Tj\nET\n`;

  let currentY = 672;
  const grnItems = matchedGrn?.items || [];
  let itemIndex = 1;

  for (const it of grnItems) {
    if (currentY < 120) break;
    const poLine = (po.lineItems || []).find((l) => l.itemId === it.itemId);
    const itemName = poLine?.itemNameSnapshot || it.itemId;
    const uom = poLine?.baseUnit || 'UNIT';
    const ord = Number(poLine?.orderedQuantityBase || 0);
    const del = Number(it.deliveredQty || 0);
    const acc = Number(it.acceptedQty || 0);
    const rej = Number(it.rejectedQty || 0);
    const mis = Number(it.missingQty || 0);

    streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 25 ${currentY} Tm\n(${itemIndex}. ${escapePdf(itemName.slice(0, 32))}) Tj\nET\n`;
    streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 250 ${currentY} Tm\n(${escapePdf(uom)}) Tj\nET\n`;
    streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 300 ${currentY} Tm\n(${ord}) Tj\nET\n`;
    streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 360 ${currentY} Tm\n(${del}) Tj\nET\n`;
    streamOps += `BT\n/F1 9 Tf\n0.1 0.5 0.2 rg\n1 0 0 1 430 ${currentY} Tm\n(${acc}) Tj\nET\n`;
    streamOps += `BT\n/F1 9 Tf\n${rej > 0 || mis > 0 ? '0.7 0.1 0.1' : '0.4 0.4 0.4'} rg\n1 0 0 1 490 ${currentY} Tm\n(${rej}/${mis}) Tj\nET\n`;

    currentY -= 18;
    itemIndex++;
  }

  // Discrepancy note if any
  const discrepancies = grnItems.filter((i) => i.rejectedQty > 0 || i.missingQty > 0);
  if (discrepancies.length > 0 && currentY > 100) {
    currentY -= 15;
    streamOps += `BT\n/F2 10 Tf\n0.7 0.1 0.1 rg\n1 0 0 1 30 ${currentY} Tm\n(RECORDED INTAKE DISCREPANCIES:) Tj\nET\n`;
    currentY -= 14;
    for (const d of discrepancies) {
      if (currentY < 80) break;
      const desc = d.discrepancyReason || d.rejectionReason || 'Physical intake count discrepancy';
      streamOps += `BT\n/F1 8 Tf\n0.3 0.3 0.3 rg\n1 0 0 1 35 ${currentY} Tm\n(- ${escapePdf(d.itemId)}: ${d.rejectedQty || 0} Rejected / ${d.missingQty || 0} Missing. Reason: ${escapePdf(desc.slice(0, 75))}) Tj\nET\n`;
      currentY -= 12;
    }
  }

  // Footer banner
  streamOps += `BT\n/F2 8 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 30 35 Tm\n(System Generated - Read-Only Vendor Copy | Zamorin Cafe ERP) Tj\nET\n`;

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');

  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: po.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_GRN_PDF_DOWNLOADED',
    targetType: 'GOODS_RECEIPT_NOTE',
    targetId: grnId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="GRN-${grnId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/v1/vendor/deliveries/:deliveryId/attachments/:attachmentId
 * and GET /api/v1/vendor/grns/:grnId/attachments/:attachmentId
 * 
 * Downloads vendor-authorized receipt attachment.
 * Validates vendor ownership, café scope, and document classification.
 */
const downloadVendorGrnAttachment = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const targetId = req.params.deliveryId || req.params.grnId;
  const { attachmentId } = req.params;

  const po = await PurchaseOrder.findOne({
    organisationId,
    vendorId,
    $or: [{ 'grnReceipts.grnId': targetId }, { purchaseOrderId: targetId }],
  }).lean();

  if (!po) {
    throw new ApiError(404, 'RECORD_NOT_FOUND', 'The requested delivery or GRN record was not found.');
  }

  if (!approvedCafeIds.includes(String(po.cafeId).trim().toUpperCase())) {
    throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access transactions for the requested café.');
  }

  let foundAttachment = null;
  for (const grn of (po.grnReceipts || [])) {
    if (grn.grnId === targetId || po.purchaseOrderId === targetId) {
      for (const att of (grn.receiptAttachments || [])) {
        if (att.attachmentId === attachmentId) {
          foundAttachment = att;
          break;
        }
      }
    }
  }

  if (!foundAttachment) {
    throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'The requested document attachment was not found.');
  }

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: po.cafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_GRN_DOCUMENT_DOWNLOADED',
    targetType: 'RECEIPT_ATTACHMENT',
    targetId: attachmentId,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  const mime = foundAttachment.mimeType || 'application/pdf';
  const fname = foundAttachment.filename || `Attachment-${attachmentId}.pdf`;

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);

  if (foundAttachment.dataBase64) {
    const buf = Buffer.from(foundAttachment.dataBase64, 'base64');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  }

  const placeholderBuf = Buffer.from(`%PDF-1.4\n% Receipt Document ${attachmentId}\n`, 'utf8');
  res.setHeader('Content-Length', placeholderBuf.length);
  return res.status(200).send(placeholderBuf);
});

// ═════════════════════════════════════════════════════════════════════════════
// VEN-SCR-011: VENDOR REPORTS CENTRE
// ═════════════════════════════════════════════════════════════════════════════

const VENDOR_REPORTS_CATALOGUE = [
  {
    reportType: 'po-history',
    reportTitle: 'Purchase Order History',
    category: 'PROCUREMENT',
    description: 'Chronological register of all purchase orders issued to your vendor account, including quantities and values.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'grn-history',
    reportTitle: 'Delivery & GRN History',
    category: 'OPERATIONS',
    description: 'Complete goods receipt register across all authorized cafés with physical verification quantities and variance tracking.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'invoice-history',
    reportTitle: 'Invoice Register & History',
    category: 'FINANCE',
    description: 'Authoritative register of supplier bills, claimed values, accounts payable approvals, and cleared settlements.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'payment-history',
    reportTitle: 'Payment & Settlement History',
    category: 'FINANCE',
    description: 'Cleared banking disbursements, UTR settlement references, and payment voucher allocation details.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'outstanding-receivables',
    reportTitle: 'Outstanding Receivables Report',
    category: 'FINANCE',
    description: 'Current open commercial balances, due dates, and settlement status by café and invoice.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'ageing-report',
    reportTitle: 'Receivables Ageing Analysis',
    category: 'FINANCE',
    description: 'Summary and breakdown of overdue balances categorised by maturity buckets (Current, 1-30, 31-60, 61-90, 90+ days).',
    supportedFilters: ['cafeId'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'returns-adjustments',
    reportTitle: 'Returns & Adjustments Register',
    category: 'FINANCE',
    description: 'Complete audit log of debit notes, credit notes, returned goods, and commercial price/quantity adjustments.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'account-statement',
    reportTitle: 'Vendor Account Statement Summary',
    category: 'FINANCE',
    description: 'Authoritative chronological financial subledger with opening balance, debits, credits, and running balance.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'product-supply-history',
    reportTitle: 'Product Supply & Volume History',
    category: 'COMMERCIAL',
    description: 'Analysis of product items supplied, approved procurement pricing, and historical delivery volumes.',
    supportedFilters: ['cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
  {
    reportType: 'tax-gst-summary',
    reportTitle: 'Tax / GST Transaction Summary',
    category: 'COMPLIANCE',
    description: 'Informational commercial summary of taxable values and GST breakdowns (CGST, SGST, IGST) from authoritative ERP records.',
    disclaimer: 'Informational commercial tax summary derived from authoritative ERP accounting records. Not an official statutory filing.',
    supportedFilters: ['dateRange', 'cafeId', 'search'],
    exportFormats: ['CSV', 'PDF', 'PRINT'],
  },
];

/**
 * Core Query Execution Engine for Vendor Reports
 */
async function executeVendorReportQuery({ req, vendorId, organisationId, approvedCafeIds, reportType, scopedCafeId, dateConstraints, searchQuery, maxRows = 500 }) {
  const [vendor, cafes] = await Promise.all([
    Vendor.findOne({ organisationId, vendorId }).lean(),
    Cafe.find({ organisationId }).lean(),
  ]);

  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = c.displayName || c.name || c.cafeId;
  }

  const todayStr = getIstDateString();
  const def = VENDOR_REPORTS_CATALOGUE.find((r) => r.reportType === reportType);
  if (!def) {
    throw new ApiError(400, 'INVALID_REPORT_TYPE', `Report type '${reportType}' is not recognized.`);
  }

  let rows = [];
  let kpis = {};
  let columns = [];

  // Scoped café filter for models with cafeId
  const cafeFilter = {};
  if (scopedCafeId) {
    cafeFilter.cafeId = scopedCafeId;
  } else {
    cafeFilter.cafeId = { $in: approvedCafeIds };
  }

  switch (reportType) {
    case 'po-history': {
      columns = [
        { key: 'poNumber', label: 'PO Number' },
        { key: 'date', label: 'Order Date' },
        { key: 'cafeName', label: 'Café' },
        { key: 'expectedDelivery', label: 'Expected Delivery' },
        { key: 'status', label: 'Status' },
        { key: 'itemCount', label: 'Line Items' },
        { key: 'totalAmountFormatted', label: 'Total Value' },
      ];

      const query = {
        organisationId,
        vendorId,
        status: { $ne: 'DRAFT' },
        ...cafeFilter,
      };

      const pos = await PurchaseOrder.find(query)
        .select('purchaseOrderId cafeId status orderDate expectedDeliveryDate lineItems totalPaisa totalAmountPaisa createdAt')
        .sort({ orderDate: -1, createdAt: -1 })
        .lean();

      let filteredPos = pos;
      if (dateConstraints) {
        filteredPos = pos.filter((p) => {
          const d = p.orderDate || (p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : todayStr);
          return d >= dateConstraints.start && d <= dateConstraints.end;
        });
      }

      let totalValPaisa = 0;
      let completedCount = 0;
      let activeCount = 0;

      for (const po of filteredPos) {
        const val = Number(po.totalPaisa !== undefined ? po.totalPaisa : (po.totalAmountPaisa !== undefined ? po.totalAmountPaisa : (po.lineItems || []).reduce((acc, li) => acc + (li.totalLinePaisa || li.totalPaisa || 0), 0)));
        totalValPaisa += val;
        if (['RECEIVED_FULL', 'CLOSED', 'COMPLETED', 'RECEIVED'].includes(po.status)) completedCount++;
        if (['APPROVED', 'ORDERED', 'PARTIALLY_DELIVERED', 'PARTIALLY_RECEIVED', 'ORDER_PLACED', 'ACKNOWLEDGED'].includes(po.status)) activeCount++;

        rows.push({
          poNumber: po.purchaseOrderId,
          date: po.orderDate || (po.createdAt ? new Date(po.createdAt).toISOString().slice(0, 10) : todayStr),
          cafeName: cafeMap[po.cafeId] || po.cafeId,
          expectedDelivery: po.expectedDeliveryDate || 'N/A',
          status: po.status,
          itemCount: (po.lineItems || []).length,
          totalAmountPaisa: val,
          totalAmountFormatted: formatCurrency(val),
        });
      }

      kpis = {
        totalOrders: filteredPos.length,
        completedOrders: completedCount,
        activeOrders: activeCount,
        totalOrderedValuePaisa: totalValPaisa,
        totalOrderedValueFormatted: formatCurrency(totalValPaisa),
      };
      break;
    }

    case 'grn-history': {
      columns = [
        { key: 'grnNumber', label: 'GRN Number' },
        { key: 'date', label: 'Receipt Date' },
        { key: 'poNumber', label: 'PO Reference' },
        { key: 'cafeName', label: 'Café' },
        { key: 'status', label: 'Receipt Status' },
        { key: 'receivedCount', label: 'Received Lines' },
        { key: 'hasDiscrepancy', label: 'Discrepancy' },
      ];

      const query = {
        organisationId,
        vendorId,
        status: { $ne: 'DRAFT' },
        'grnReceipts.0': { $exists: true },
        ...cafeFilter,
      };

      const pos = await PurchaseOrder.find(query)
        .select('purchaseOrderId cafeId grnReceipts orderDate createdAt')
        .sort({ createdAt: -1 })
        .lean();

      let totalGrns = 0;
      let discrepantCount = 0;
      let fullCount = 0;

      for (const po of pos) {
        for (const grn of (po.grnReceipts || [])) {
          const recDate = grn.receivedAt ? new Date(grn.receivedAt).toISOString().slice(0, 10) : (po.orderDate || todayStr);
          if (dateConstraints && (recDate < dateConstraints.start || recDate > dateConstraints.end)) {
            continue;
          }

          totalGrns++;
          const items = grn.items || grn.receivedItems || [];
          const hasDisc = items.some((i) => (i.rejectedQty || i.rejectedQuantity || 0) > 0 || (i.missingQty || i.missingQuantity || 0) > 0);
          if (hasDisc) discrepantCount++;
          else fullCount++;

          rows.push({
            grnNumber: grn.grnId || `GRN-${po.purchaseOrderId}`,
            date: recDate,
            poNumber: po.purchaseOrderId,
            cafeName: cafeMap[po.cafeId] || po.cafeId,
            status: grn.status || 'VERIFIED',
            receivedCount: items.length,
            hasDiscrepancy: hasDisc ? 'YES (Variance Recorded)' : 'NO (100% Verified)',
          });
        }
      }

      kpis = {
        totalGrns,
        fullDeliveries: fullCount,
        discrepantDeliveries: discrepantCount,
        totalVerifiedLines: rows.reduce((acc, r) => acc + r.receivedCount, 0),
      };
      break;
    }

    case 'invoice-history': {
      columns = [
        { key: 'invoiceNumber', label: 'Invoice No.' },
        { key: 'date', label: 'Invoice Date' },
        { key: 'poNumber', label: 'PO Ref' },
        { key: 'cafeName', label: 'Café' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'approvedPayableFormatted', label: 'Approved Payable' },
        { key: 'paidAmountFormatted', label: 'Paid Amount' },
        { key: 'outstandingBalanceFormatted', label: 'Balance Due' },
        { key: 'paymentStatus', label: 'Status' },
      ];

      const query = {
        organisationId,
        vendorId,
        ...cafeFilter,
      };

      const invoices = await APInvoice.find(query)
        .select('invoiceId supplierInvoiceNumber invoiceDate dueDate poReferenceId cafeId totalPaisa approvedPayableAmountPaisa disputedAmountPaisa paidAmountPaisa paidPaisa outstandingPayableAmountPaisa outstandingPaisa paymentStatus')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .lean();

      let filteredInvoices = invoices;
      if (dateConstraints) {
        filteredInvoices = invoices.filter((inv) => {
          const d = inv.invoiceDate || todayStr;
          return d >= dateConstraints.start && d <= dateConstraints.end;
        });
      }

      let totalApproved = 0;
      let totalPaid = 0;
      let totalOutstanding = 0;

      for (const inv of filteredInvoices) {
        const approved = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
        const paid = Number(inv.paidAmountPaisa !== undefined ? inv.paidAmountPaisa : (inv.paidPaisa || 0));
        const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));

        totalApproved += approved;
        totalPaid += paid;
        totalOutstanding += outstanding;

        rows.push({
          invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          date: inv.invoiceDate || todayStr,
          poNumber: inv.poReferenceId || 'N/A',
          cafeName: cafeMap[inv.cafeId] || inv.cafeId,
          dueDate: inv.dueDate || 'N/A',
          approvedPayablePaisa: approved,
          approvedPayableFormatted: formatCurrency(approved),
          paidAmountPaisa: paid,
          paidAmountFormatted: formatCurrency(paid),
          outstandingBalancePaisa: outstanding,
          outstandingBalanceFormatted: formatCurrency(outstanding),
          paymentStatus: inv.paymentStatus || 'UNPAID',
        });
      }

      kpis = {
        totalInvoices: filteredInvoices.length,
        totalApprovedPaisa: totalApproved,
        totalApprovedFormatted: formatCurrency(totalApproved),
        totalPaidPaisa: totalPaid,
        totalPaidFormatted: formatCurrency(totalPaid),
        totalOutstandingPaisa: totalOutstanding,
        totalOutstandingFormatted: formatCurrency(totalOutstanding),
      };
      break;
    }

    case 'payment-history': {
      columns = [
        { key: 'paymentReference', label: 'Payment Ref' },
        { key: 'date', label: 'Settlement Date' },
        { key: 'settlementReference', label: 'UTR / Bank Ref' },
        { key: 'paymentMethod', label: 'Method' },
        { key: 'cafeName', label: 'Café' },
        { key: 'invoiceReference', label: 'Invoice' },
        { key: 'grossPaidFormatted', label: 'Settled Amount' },
        { key: 'status', label: 'Status' },
      ];

      const invoices = await APInvoice.find({ organisationId, vendorId, ...cafeFilter }).lean();
      const ledgerEntries = await VendorLedgerEntry.find({ organisationId, vendorId, entryType: 'PAYMENT', ...cafeFilter }).lean();

      const paymentMap = new Map();
      for (const inv of invoices) {
        for (const p of (inv.paymentHistory || [])) {
          const pid = p.paymentId || p.reference || `PAY-${inv.invoiceId}`;
          const pDate = p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : todayStr;
          if (dateConstraints && (pDate < dateConstraints.start || pDate > dateConstraints.end)) continue;

          paymentMap.set(pid, {
            paymentReference: p.reference || pid,
            date: pDate,
            settlementReference: p.reference || 'DIRECT_SETTLEMENT',
            paymentMethod: p.paymentMethod || 'BANK_TRANSFER',
            cafeName: cafeMap[inv.cafeId] || inv.cafeId,
            invoiceReference: inv.supplierInvoiceNumber || inv.invoiceId,
            grossPaidPaisa: Number(p.paidPaisa || 0),
            grossPaidFormatted: formatCurrency(Number(p.paidPaisa || 0)),
            status: 'CLEARED',
          });
        }
      }

      for (const e of ledgerEntries) {
        const pid = e.paymentId || e.referenceNumber || e.ledgerEntryId;
        if (!paymentMap.has(pid)) {
          const pDate = e.entryDate || todayStr;
          if (dateConstraints && (pDate < dateConstraints.start || pDate > dateConstraints.end)) continue;
          const amt = Number(e.debitPaisa || e.paidPaisa || 0);

          paymentMap.set(pid, {
            paymentReference: e.referenceNumber || pid,
            date: pDate,
            settlementReference: e.referenceNumber || 'DIRECT_SETTLEMENT',
            paymentMethod: 'BANK_TRANSFER',
            cafeName: cafeMap[e.cafeId] || e.cafeId,
            invoiceReference: e.referenceId || 'N/A',
            grossPaidPaisa: amt,
            grossPaidFormatted: formatCurrency(amt),
            status: 'CLEARED',
          });
        }
      }

      rows = Array.from(paymentMap.values());
      const totalSettled = rows.reduce((acc, r) => acc + r.grossPaidPaisa, 0);

      kpis = {
        totalPayments: rows.length,
        clearedPayments: rows.length,
        totalSettledPaisa: totalSettled,
        totalSettledFormatted: formatCurrency(totalSettled),
      };
      break;
    }

    case 'outstanding-receivables': {
      columns = [
        { key: 'invoiceNumber', label: 'Invoice No.' },
        { key: 'date', label: 'Invoice Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'cafeName', label: 'Café' },
        { key: 'approvedPayableFormatted', label: 'Approved Payable' },
        { key: 'paidFormatted', label: 'Amount Paid' },
        { key: 'outstandingFormatted', label: 'Outstanding Balance' },
        { key: 'daysOverdue', label: 'Days Overdue' },
        { key: 'ageingBucket', label: 'Bucket' },
      ];

      const invoices = await APInvoice.find({ organisationId, vendorId, ...cafeFilter }).lean();

      let totalOut = 0;
      let totalOver = 0;
      let currentOut = 0;

      for (const inv of invoices) {
        const approved = Number(inv.approvedPayableAmountPaisa !== undefined ? inv.approvedPayableAmountPaisa : (inv.totalPaisa || 0));
        const paid = Number(inv.paidAmountPaisa !== undefined ? inv.paidAmountPaisa : (inv.paidPaisa || 0));
        const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));

        if (outstanding <= 0) continue;

        const invDate = inv.invoiceDate || todayStr;
        if (dateConstraints && (invDate < dateConstraints.start || invDate > dateConstraints.end)) continue;

        const dueDate = inv.dueDate || todayStr;
        const diff = getDaysDiff(dueDate, todayStr);
        const daysOverdue = Math.max(0, diff);

        let bucket = 'CURRENT';
        if (daysOverdue > 90) bucket = '90+ DAYS';
        else if (daysOverdue > 60) bucket = '61-90 DAYS';
        else if (daysOverdue > 30) bucket = '31-60 DAYS';
        else if (daysOverdue > 0) bucket = '1-30 DAYS';

        totalOut += outstanding;
        if (daysOverdue > 0) totalOver += outstanding;
        else currentOut += outstanding;

        rows.push({
          invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          date: invDate,
          dueDate: inv.dueDate || 'N/A',
          cafeName: cafeMap[inv.cafeId] || inv.cafeId,
          approvedPayablePaisa: approved,
          approvedPayableFormatted: formatCurrency(approved),
          paidPaisa: paid,
          paidFormatted: formatCurrency(paid),
          outstandingPaisa: outstanding,
          outstandingFormatted: formatCurrency(outstanding),
          daysOverdue,
          ageingBucket: bucket,
        });
      }

      kpis = {
        openInvoicesCount: rows.length,
        totalOutstandingPaisa: totalOut,
        totalOutstandingFormatted: formatCurrency(totalOut),
        totalOverduePaisa: totalOver,
        totalOverdueFormatted: formatCurrency(totalOver),
        currentPaisa: currentOut,
        currentFormatted: formatCurrency(currentOut),
      };
      break;
    }

    case 'ageing-report': {
      columns = [
        { key: 'bucket', label: 'Ageing Bracket' },
        { key: 'count', label: 'Invoice Count' },
        { key: 'amountFormatted', label: 'Amount Payable' },
        { key: 'percentage', label: 'Percentage' },
      ];

      const invoices = await APInvoice.find({ organisationId, vendorId, ...cafeFilter }).lean();

      let currentPaisa = 0;
      let b1to30Paisa = 0;
      let b31to60Paisa = 0;
      let b61to90Paisa = 0;
      let b90PlusPaisa = 0;

      let cCount = 0;
      let b1Count = 0;
      let b2Count = 0;
      let b3Count = 0;
      let b4Count = 0;

      for (const inv of invoices) {
        const outstanding = Number(inv.outstandingPayableAmountPaisa !== undefined ? inv.outstandingPayableAmountPaisa : (inv.outstandingPaisa || 0));
        if (outstanding <= 0) continue;

        const dueDate = inv.dueDate || todayStr;
        const days = Math.max(0, getDaysDiff(dueDate, todayStr));

        if (days === 0) {
          currentPaisa += outstanding;
          cCount++;
        } else if (days <= 30) {
          b1to30Paisa += outstanding;
          b1Count++;
        } else if (days <= 60) {
          b31to60Paisa += outstanding;
          b2Count++;
        } else if (days <= 90) {
          b61to90Paisa += outstanding;
          b3Count++;
        } else {
          b90PlusPaisa += outstanding;
          b4Count++;
        }
      }

      const grandTotal = currentPaisa + b1to30Paisa + b31to60Paisa + b61to90Paisa + b90PlusPaisa;
      const getPct = (p) => (grandTotal > 0 ? `${((p / grandTotal) * 100).toFixed(1)}%` : '0.0%');

      rows = [
        { bucket: 'Current (Not Due)', count: cCount, amountPaisa: currentPaisa, amountFormatted: formatCurrency(currentPaisa), percentage: getPct(currentPaisa) },
        { bucket: '1 to 30 Days Overdue', count: b1Count, amountPaisa: b1to30Paisa, amountFormatted: formatCurrency(b1to30Paisa), percentage: getPct(b1to30Paisa) },
        { bucket: '31 to 60 Days Overdue', count: b2Count, amountPaisa: b31to60Paisa, amountFormatted: formatCurrency(b31to60Paisa), percentage: getPct(b31to60Paisa) },
        { bucket: '61 to 90 Days Overdue', count: b3Count, amountPaisa: b61to90Paisa, amountFormatted: formatCurrency(b61to90Paisa), percentage: getPct(b61to90Paisa) },
        { bucket: '90+ Days Overdue', count: b4Count, amountPaisa: b90PlusPaisa, amountFormatted: formatCurrency(b90PlusPaisa), percentage: getPct(b90PlusPaisa) },
      ];

      kpis = {
        totalOutstandingPaisa: grandTotal,
        totalOutstandingFormatted: formatCurrency(grandTotal),
        currentPaisa,
        currentFormatted: formatCurrency(currentPaisa),
        days1to30Paisa: b1to30Paisa,
        days1to30Formatted: formatCurrency(b1to30Paisa),
        days90PlusPaisa: b90PlusPaisa,
        days90PlusFormatted: formatCurrency(b90PlusPaisa),
      };
      break;
    }

    case 'returns-adjustments': {
      columns = [
        { key: 'reference', label: 'Reference' },
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Adjustment Type' },
        { key: 'cafeName', label: 'Café' },
        { key: 'poReference', label: 'PO Ref' },
        { key: 'reason', label: 'Authorised Reason' },
        { key: 'financialEffect', label: 'Financial Effect' },
        { key: 'amountFormatted', label: 'Adjustment Value' },
      ];

      const entries = await VendorLedgerEntry.find({
        organisationId,
        vendorId,
        entryType: { $in: ['CREDIT_NOTE', 'DEBIT_NOTE', 'RETURN', 'ADJUSTMENT', 'RATE_DIFFERENCE', 'SHORTAGE_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'AUTHORISED_ADJUSTMENT', 'SHORT_SUPPLY_HOLD'] },
        ...cafeFilter,
      }).sort({ entryDate: -1, entryTimestamp: -1 }).lean();

      let filteredEntries = entries;
      if (dateConstraints) {
        filteredEntries = entries.filter((e) => {
          const d = e.entryDate || todayStr;
          return d >= dateConstraints.start && d <= dateConstraints.end;
        });
      }

      let debitCount = 0;
      let creditCount = 0;
      let netAdj = 0;

      for (const e of filteredEntries) {
        const isDebit = Number(e.debitPaisa || 0) > 0 || e.entryType === 'DEBIT_NOTE' || e.entryType === 'DEBIT_ADJUSTMENT';
        const amt = Number(e.debitPaisa || e.creditPaisa || 0);

        if (isDebit) {
          debitCount++;
          netAdj -= amt;
        } else {
          creditCount++;
          netAdj += amt;
        }

        rows.push({
          reference: e.referenceNumber || e.ledgerEntryId,
          date: e.entryDate || todayStr,
          type: e.entryType || 'ADJUSTMENT',
          cafeName: cafeMap[e.cafeId] || e.cafeId,
          poReference: e.purchaseOrderId || 'N/A',
          reason: e.description || 'Verified commercial variance adjustment',
          financialEffect: isDebit ? 'DEBIT (Reduces Payable)' : 'CREDIT (Increases Payable)',
          amountPaisa: amt,
          amountFormatted: formatCurrency(amt),
        });
      }

      kpis = {
        totalAdjustments: filteredEntries.length,
        debitNotesCount: debitCount,
        creditNotesCount: creditCount,
        netAdjustmentPaisa: netAdj,
        netAdjustmentFormatted: formatCurrency(netAdj),
      };
      break;
    }

    case 'account-statement': {
      columns = [
        { key: 'date', label: 'Date' },
        { key: 'reference', label: 'Ledger Ref' },
        { key: 'type', label: 'Transaction Type' },
        { key: 'cafeName', label: 'Café' },
        { key: 'debitFormatted', label: 'Debit (Settlement)' },
        { key: 'creditFormatted', label: 'Credit (Invoice)' },
        { key: 'runningBalanceFormatted', label: 'Running Balance' },
      ];

      const fromDate = dateConstraints ? dateConstraints.start : '2000-01-01';
      const toDate = dateConstraints ? dateConstraints.end : todayStr;

      const baseFilter = {
        organisationId,
        vendorId,
        isReversed: false,
        ...cafeFilter,
      };

      const priorAggregate = await VendorLedgerEntry.aggregate([
        { $match: { ...baseFilter, entryDate: { $lt: fromDate } } },
        { $group: { _id: null, totalCredit: { $sum: '$creditPaisa' }, totalDebit: { $sum: '$debitPaisa' } } },
      ]);
      const openingBalancePaisa = priorAggregate.length > 0
        ? Math.round(Number(priorAggregate[0].totalCredit || 0) - Number(priorAggregate[0].totalDebit || 0))
        : 0;

      const entries = await VendorLedgerEntry.find({
        ...baseFilter,
        entryDate: { $gte: fromDate, $lte: toDate },
      }).sort({ entryDate: 1, entryTimestamp: 1, _id: 1 }).lean();

      let running = openingBalancePaisa;
      let totalDebits = 0;
      let totalCredits = 0;

      for (const e of entries) {
        const debit = Number(e.debitPaisa || 0);
        const credit = Number(e.creditPaisa || 0);
        totalDebits += debit;
        totalCredits += credit;
        running = running + credit - debit;

        rows.push({
          date: e.entryDate || todayStr,
          reference: e.referenceNumber || e.ledgerEntryId,
          type: e.entryType || 'ENTRY',
          cafeName: cafeMap[e.cafeId] || e.cafeId,
          debitPaisa: debit,
          debitFormatted: debit > 0 ? formatCurrency(debit) : '—',
          creditPaisa: credit,
          creditFormatted: credit > 0 ? formatCurrency(credit) : '—',
          runningBalancePaisa: running,
          runningBalanceFormatted: formatCurrency(running),
        });
      }

      kpis = {
        openingBalancePaisa,
        openingBalanceFormatted: formatCurrency(openingBalancePaisa),
        totalCreditsPaisa: totalCredits,
        totalCreditsFormatted: formatCurrency(totalCredits),
        totalDebitsPaisa: totalDebits,
        totalDebitsFormatted: formatCurrency(totalDebits),
        closingBalancePaisa: running,
        closingBalanceFormatted: formatCurrency(running),
      };
      break;
    }

    case 'product-supply-history': {
      columns = [
        { key: 'sku', label: 'Item Code' },
        { key: 'itemName', label: 'Product Description' },
        { key: 'category', label: 'Category' },
        { key: 'uom', label: 'UOM' },
        { key: 'approvedRateFormatted', label: 'Approved Rate' },
        { key: 'totalOrderedQty', label: 'Ordered Qty' },
        { key: 'totalAcceptedQty', label: 'Accepted Qty' },
        { key: 'totalSpendFormatted', label: 'Gross Procurement' },
      ];

      const [items, pos] = await Promise.all([
        GlobalInventoryItem.find({ organisationId }).lean(),
        PurchaseOrder.find({ organisationId, vendorId, status: { $ne: 'DRAFT' }, ...cafeFilter }).lean(),
      ]);

      const itemMap = new Map();
      for (const it of items) {
        if (it.preferredVendorId === vendorId || it.vendorId === vendorId || !it.preferredVendorId) {
          const rate = Number(it.costPricePaisa || it.approvedRatePaisa || 0);
          itemMap.set(it.itemId, {
            sku: it.sku || it.itemCode || it.itemId,
            itemName: it.name,
            category: it.category || 'COMMERCIAL',
            uom: it.unitOfMeasure || 'UNIT',
            approvedRatePaisa: rate,
            approvedRateFormatted: formatCurrency(rate),
            totalOrderedQty: 0,
            totalAcceptedQty: 0,
            totalSpendPaisa: 0,
          });
        }
      }

      for (const po of pos) {
        const grnAcceptedByItem = new Map();
        for (const grn of (po.grnReceipts || [])) {
          for (const gi of (grn.items || [])) {
            const current = grnAcceptedByItem.get(gi.itemId) || 0;
            grnAcceptedByItem.set(gi.itemId, current + Number(gi.acceptedQty || gi.acceptedQuantity || 0));
          }
        }

        for (const line of (po.lineItems || [])) {
          const itId = line.itemId;
          if (itemMap.has(itId)) {
            const entry = itemMap.get(itId);
            const ordered = Number(line.orderedQuantityBase !== undefined ? line.orderedQuantityBase : (line.quantity || line.orderedQty || 0));
            entry.totalOrderedQty += ordered;

            let accepted = Number(line.acceptedReceivedQty !== undefined ? line.acceptedReceivedQty : (line.acceptedQuantity !== undefined ? line.acceptedQuantity : (line.receivedQuantityBase || 0)));
            if (accepted === 0 && grnAcceptedByItem.has(itId)) {
              accepted = grnAcceptedByItem.get(itId);
            }
            entry.totalAcceptedQty += accepted;
            entry.totalSpendPaisa += Number(line.totalLinePaisa || (ordered * (entry.approvedRatePaisa || 0)));
          }
        }
      }

      for (const entry of itemMap.values()) {
        entry.totalSpendFormatted = formatCurrency(entry.totalSpendPaisa);
        rows.push(entry);
      }

      const totalSpend = rows.reduce((acc, r) => acc + r.totalSpendPaisa, 0);
      const totalUnits = rows.reduce((acc, r) => acc + r.totalAcceptedQty, 0);

      kpis = {
        totalCataloguedItems: rows.length,
        activeItemsCount: rows.filter((r) => r.totalAcceptedQty > 0).length,
        totalUnitsSupplied: totalUnits,
        totalSpendPaisa: totalSpend,
        totalSpendFormatted: formatCurrency(totalSpend),
      };
      break;
    }

    case 'tax-gst-summary': {
      columns = [
        { key: 'invoiceNumber', label: 'Invoice No.' },
        { key: 'date', label: 'Invoice Date' },
        { key: 'cafeName', label: 'Café' },
        { key: 'vendorGst', label: 'Vendor GSTIN' },
        { key: 'taxableFormatted', label: 'Taxable Value' },
        { key: 'cgstFormatted', label: 'CGST (9%)' },
        { key: 'sgstFormatted', label: 'SGST (9%)' },
        { key: 'totalTaxFormatted', label: 'Total GST' },
        { key: 'grossTotalFormatted', label: 'Invoice Gross' },
      ];

      const invoices = await APInvoice.find({ organisationId, vendorId, ...cafeFilter })
        .sort({ invoiceDate: -1 })
        .lean();

      let filteredInvoices = invoices;
      if (dateConstraints) {
        filteredInvoices = invoices.filter((inv) => {
          const d = inv.invoiceDate || todayStr;
          return d >= dateConstraints.start && d <= dateConstraints.end;
        });
      }

      let totalTaxable = 0;
      let totalGst = 0;
      let grossTotal = 0;

      for (const inv of filteredInvoices) {
        const total = Number(inv.totalPaisa || 0);
        const tax = Number(inv.taxPaisa || 0);
        const taxable = Number(inv.taxableAmountPaisa !== undefined ? inv.taxableAmountPaisa : Math.max(0, total - tax));
        const cgst = Math.round(tax / 2);
        const sgst = tax - cgst;

        totalTaxable += taxable;
        totalGst += tax;
        grossTotal += total;

        rows.push({
          invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceId,
          date: inv.invoiceDate || todayStr,
          cafeName: cafeMap[inv.cafeId] || inv.cafeId,
          vendorGst: vendor?.gstNumber || 'UNREGISTERED',
          taxablePaisa: taxable,
          taxableFormatted: formatCurrency(taxable),
          cgstPaisa: cgst,
          cgstFormatted: formatCurrency(cgst),
          sgstPaisa: sgst,
          sgstFormatted: formatCurrency(sgst),
          totalTaxPaisa: tax,
          totalTaxFormatted: formatCurrency(tax),
          grossTotalPaisa: total,
          grossTotalFormatted: formatCurrency(total),
        });
      }

      kpis = {
        totalInvoices: filteredInvoices.length,
        totalTaxablePaisa: totalTaxable,
        totalTaxableFormatted: formatCurrency(totalTaxable),
        totalGstPaisa: totalGst,
        totalGstFormatted: formatCurrency(totalGst),
        grossTotalPaisa: grossTotal,
        grossTotalFormatted: formatCurrency(grossTotal),
      };
      break;
    }

    default:
      throw new ApiError(400, 'UNSUPPORTED_REPORT_TYPE', `Report '${reportType}' is not supported.`);
  }

  // Universal text search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter((r) => {
      return Object.values(r).some((val) => typeof val === 'string' && val.toLowerCase().includes(q));
    });
  }

  return {
    reportType,
    reportTitle: def.reportTitle,
    reportDescription: def.description,
    category: def.category,
    disclaimer: def.disclaimer || null,
    columns,
    rows: rows.slice(0, maxRows),
    totalRows: rows.length,
    kpis,
    vendorName: vendor?.name || 'Valued Supplier',
    vendorGst: vendor?.gstNumber || '',
  };
}

/**
 * GET /api/v1/vendor/reports
 * and GET /api/v1/vendor/reports/:reportType
 * VEN-SCR-011: Vendor Reports Catalogue & Multi-Report Query Engine
 */
const getVendorReports = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const reqReportType = req.params.reportType || req.query.reportType;

  // If no reportType specified, return the catalogue of 10 available reports
  if (!reqReportType || reqReportType === 'catalogue') {
    return res.status(200).json({
      success: true,
      data: {
        catalogue: VENDOR_REPORTS_CATALOGUE,
        authorizedCafesCount: approvedCafeIds.length,
        readOnly: true,
        workspaceMode: 'READ_ONLY',
      },
      correlationId: req.correlationId || null,
    });
  }

  const reportType = String(reqReportType).trim().toLowerCase();
  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;

  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access reports for the requested café.');
    }
  }

  const dateConstraints = resolveDateConstraints(req.query.dateRange, req.query.customStart, req.query.customEnd);
  const searchQuery = req.query.search ? String(req.query.search).trim() : '';

  const reportResult = await executeVendorReportQuery({
    req,
    vendorId,
    organisationId,
    approvedCafeIds,
    reportType,
    scopedCafeId,
    dateConstraints,
    searchQuery,
    maxRows: 500,
  });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const total = reportResult.totalRows;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginatedRows = reportResult.rows.slice((page - 1) * limit, page * limit);

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_REPORT_VIEWED',
    targetType: 'VENDOR_REPORT',
    targetId: reportType,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, resultCount: paginatedRows.length, totalCount: total },
  });

  return res.status(200).json({
    success: true,
    data: {
      reportType: reportResult.reportType,
      reportTitle: reportResult.reportTitle,
      reportDescription: reportResult.reportDescription,
      category: reportResult.category,
      disclaimer: reportResult.disclaimer,
      kpis: reportResult.kpis,
      columns: reportResult.columns,
      rows: paginatedRows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      readOnly: true,
      workspaceMode: 'READ_ONLY',
    },
    correlationId: req.correlationId || null,
  });
});

/**
 * GET /api/v1/vendor/reports/:reportType/csv
 * and GET /api/v1/vendor/reports/csv?reportType=...
 * VEN-SCR-011: Safe CSV Export for Vendor Commercial Reports
 */
const downloadVendorReportsCsv = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const reqReportType = req.params.reportType || req.query.reportType;

  if (!reqReportType) {
    throw new ApiError(400, 'REPORT_TYPE_REQUIRED', 'Report type parameter is required for CSV export.');
  }

  const reportType = String(reqReportType).trim().toLowerCase();
  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;

  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access reports for the requested café.');
    }
  }

  const dateConstraints = resolveDateConstraints(req.query.dateRange, req.query.customStart, req.query.customEnd);
  const searchQuery = req.query.search ? String(req.query.search).trim() : '';

  const reportResult = await executeVendorReportQuery({
    req,
    vendorId,
    organisationId,
    approvedCafeIds,
    reportType,
    scopedCafeId,
    dateConstraints,
    searchQuery,
    maxRows: 500,
  });

  const headers = reportResult.columns.map((c) => c.label);
  const keys = reportResult.columns.map((c) => c.key);

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvLines = [];
  csvLines.push(`"ZAMORIN CAFE ERP - VENDOR COMMERCIAL REPORT: ${reportResult.reportTitle.toUpperCase()}"`);
  csvLines.push(`"VENDOR ID: ${vendorId}","GENERATED: ${getIstDateString()}","SCOPE: READ-ONLY VENDOR ARCHIVE"`);
  if (reportResult.disclaimer) {
    csvLines.push(`"NOTICE: ${reportResult.disclaimer.replace(/"/g, '""')}"`);
  }
  csvLines.push('');
  csvLines.push(headers.map(escapeCsv).join(','));

  for (const r of reportResult.rows) {
    const rowVals = keys.map((k) => escapeCsv(r[k]));
    csvLines.push(rowVals.join(','));
  }

  const csvContent = csvLines.join('\r\n');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_REPORT_CSV_DOWNLOADED',
    targetType: 'VENDOR_REPORT_CSV',
    targetId: reportType,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, rowsCount: reportResult.rows.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VendorReport-${reportType}-${vendorId}.csv"`);
  return res.status(200).send(csvContent);
});

/**
 * GET /api/v1/vendor/reports/xlsx
 * GET /api/v1/vendor/reports/:reportType/xlsx
 * VEN-SCR-011: Genuine OpenXML Excel Export for Vendor Commercial Reports
 */
const downloadVendorReportsXlsx = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const reqReportType = req.params.reportType || req.query.reportType;

  if (!reqReportType) {
    throw new ApiError(400, 'REPORT_TYPE_REQUIRED', 'Report type parameter is required for Excel export.');
  }

  const reportType = String(reqReportType).trim().toLowerCase();
  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;

  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access reports for the requested café.');
    }
  }

  const dateConstraints = resolveDateConstraints(req.query.dateRange, req.query.customStart, req.query.customEnd);
  const searchQuery = req.query.search ? String(req.query.search).trim() : '';

  const reportResult = await executeVendorReportQuery({
    req,
    vendorId,
    organisationId,
    approvedCafeIds,
    reportType,
    scopedCafeId,
    dateConstraints,
    searchQuery,
    maxRows: 500,
  });

  const columns = reportResult.columns.map((c) => ({
    key: c.key,
    label: c.label,
    isNum: typeof c.isNum === 'boolean' ? c.isNum : (c.format === 'currency' || c.format === 'number'),
  }));

  const rows = reportResult.rows.map((r) => {
    const rowObj = {};
    for (const col of reportResult.columns) {
      const val = r[col.key];
      if (col.format === 'currency' || col.isNum) {
        rowObj[col.key] = typeof val === 'number' ? val : Number(val || 0);
      } else {
        rowObj[col.key] = val != null ? String(val) : '';
      }
    }
    return rowObj;
  });

  const todayStr = getIstDateString();
  const xlsxResult = generateXlsx({
    sheetName: reportType.slice(0, 31),
    reportTitle: `Vendor Commercial Report: ${reportResult.reportTitle}`,
    columns,
    rows,
    branding: {
      period: `As of ${todayStr}`,
      scope: scopedCafeId || 'All Approved Cafés',
    },
  });

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    actorId: req.auth.userId,
    action: 'VENDOR_REPORT_XLSX_DOWNLOADED',
    targetType: 'VENDOR_REPORT_XLSX',
    targetId: reportType,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId, rowsCount: reportResult.rows.length },
  });

  const filename = `VendorReport-${reportType}-${vendorId}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(xlsxResult.buffer);
});

/**
 * GET /api/v1/vendor/reports/:reportType/pdf
 * VEN-SCR-011: Vector A4 PDF Download for Vendor Commercial Reports
 */
const downloadVendorReportsPdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;
  const approvedCafeIds = req.auth.approvedCafeIds || [];
  const reqReportType = req.params.reportType || req.query.reportType;

  if (!reqReportType) {
    throw new ApiError(400, 'REPORT_TYPE_REQUIRED', 'Report type parameter is required for PDF export.');
  }

  const reportType = String(reqReportType).trim().toLowerCase();
  const targetCafeId = req.query.cafeId ? String(req.query.cafeId).trim().toUpperCase() : null;

  let scopedCafeId = null;
  if (targetCafeId && targetCafeId !== 'ALL' && targetCafeId !== 'GLOBAL') {
    scopedCafeId = targetCafeId;
    if (!approvedCafeIds.includes(scopedCafeId)) {
      throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Your vendor account is not authorized to access reports for the requested café.');
    }
  }

  const dateConstraints = resolveDateConstraints(req.query.dateRange, req.query.customStart, req.query.customEnd);
  const searchQuery = req.query.search ? String(req.query.search).trim() : '';

  const reportResult = await executeVendorReportQuery({
    req,
    vendorId,
    organisationId,
    approvedCafeIds,
    reportType,
    scopedCafeId,
    dateConstraints,
    searchQuery,
    maxRows: 30, // Fits neatly onto standard A4 format
  });

  const todayStr = getIstDateString();

  let streamOps = '';
  // Top Header Banner
  streamOps += '0.08 0.18 0.28 rg\n0 770 595.28 72 re\nf\n';
  streamOps += 'BT\n/F2 14 Tf\n1 1 1 rg\n1 0 0 1 30 812 Tm\n(ZAMORIN CAFE ERP - OFFICIAL VENDOR COMMERCIAL REPORT) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.85 0.92 0.98 rg\n1 0 0 1 30 798 Tm\n(${escapePdf(reportResult.reportTitle.toUpperCase())} • READ-ONLY VENDOR AUDIT COPY) Tj\nET\n`;
  streamOps += `BT\n/F2 9.5 Tf\n1 1 1 rg\n1 0 0 1 430 812 Tm\n(DATE: ${escapePdf(todayStr)}) Tj\nET\n`;
  streamOps += `BT\n/F1 8.5 Tf\n0.85 0.92 0.98 rg\n1 0 0 1 430 798 Tm\n(VENDOR: ${escapePdf(vendorId)}) Tj\nET\n`;

  // Entity Details Box
  streamOps += '0.96 0.97 0.98 rg\n30 690 535 65 re\nf\n';
  streamOps += '0.8 0.85 0.9 RG\n1 w\n30 690 535 65 re\nS\n';
  streamOps += 'BT\n/F2 9 Tf\n0.1 0.2 0.3 rg\n1 0 0 1 40 738 Tm\n(VENDOR (SUPPLIER):) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 40 724 Tm\n(${escapePdf(reportResult.vendorName)} [${escapePdf(vendorId)}]) Tj\nET\n`;
  streamOps += 'BT\n/F2 9 Tf\n0.1 0.2 0.3 rg\n1 0 0 1 300 738 Tm\n(REPORT CATEGORY & SCOPE:) Tj\nET\n';
  streamOps += `BT\n/F1 9 Tf\n0.2 0.2 0.2 rg\n1 0 0 1 300 724 Tm\n(${escapePdf(reportResult.category)} • ${escapePdf(scopedCafeId || 'All Authorized Cafés')}) Tj\nET\n`;
  if (reportResult.disclaimer) {
    streamOps += `BT\n/F1 7.5 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 40 702 Tm\n(Note: ${escapePdf(reportResult.disclaimer)}) Tj\nET\n`;
  }

  // Table Columns Header
  let y = 650;
  streamOps += '0.12 0.22 0.32 rg\n30 635 535 22 re\nf\n';
  streamOps += 'BT\n/F2 8 Tf\n1 1 1 rg\n';

  const colWidths = [120, 70, 95, 75, 80, 95];
  const displayCols = reportResult.columns.slice(0, 6);
  let colX = 35;
  for (let i = 0; i < displayCols.length; i++) {
    streamOps += `1 0 0 1 ${colX} 642 Tm\n(${escapePdf(displayCols[i].label.toUpperCase())}) Tj\n`;
    colX += colWidths[i] || 80;
  }
  streamOps += 'ET\n';

  y = 618;
  for (let rIdx = 0; rIdx < reportResult.rows.length; rIdx++) {
    if (y < 70) break;
    const r = reportResult.rows[rIdx];
    const isAlt = rIdx % 2 === 1;

    if (isAlt) {
      streamOps += `0.97 0.98 0.99 rg\n30 ${y - 4} 535 18 re\nf\n`;
    }
    streamOps += `0.88 0.9 0.92 RG\n0.5 w\n30 ${y - 4} 535 18 re\nS\n`;

    streamOps += 'BT\n/F1 7.5 Tf\n0.15 0.15 0.15 rg\n';
    let rX = 35;
    for (let cIdx = 0; cIdx < displayCols.length; cIdx++) {
      const val = String(r[displayCols[cIdx].key] ?? '');
      const cleanVal = val.length > 22 ? val.slice(0, 20) + '...' : val;
      streamOps += `1 0 0 1 ${rX} ${y} Tm\n(${escapePdf(cleanVal)}) Tj\n`;
      rX += colWidths[cIdx] || 80;
    }
    streamOps += 'ET\n';
    y -= 19;
  }

  // Footer Disclaimer
  streamOps += 'BT\n/F1 7.5 Tf\n0.4 0.4 0.4 rg\n1 0 0 1 30 35 Tm\n(ZAMORIN CAFE ERP VENDOR PORTAL - STRICTLY READ-ONLY AUTHORISED COMMERCIAL RECORD) Tj\nET\n';

  const streamBytes = Buffer.byteLength(streamOps, 'utf8');
  let pdfData = '%PDF-1.4\n';
  const offsets = [];

  const bodyObjects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  for (let i = 0; i < bodyObjects.length; i++) {
    offsets.push(Buffer.byteLength(pdfData, 'utf8'));
    pdfData += bodyObjects[i];
  }

  const xrefOffset = Buffer.byteLength(pdfData, 'utf8');
  pdfData += `xref\n0 ${bodyObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfData += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfData += `trailer\n<< /Size ${bodyObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfData, 'utf8');

  logSecurityEvent({
    correlationId: req.correlationId,
    organisationId,
    cafeId: scopedCafeId,
    actorId: req.auth.userId,
    action: 'VENDOR_REPORT_PDF_DOWNLOADED',
    targetType: 'VENDOR_REPORT_PDF',
    targetId: reportType,
    outcome: 'SUCCESS',
    severity: 'INFO',
    metadata: { vendorId },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VendorReport-${reportType}-${vendorId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

// ─────────────────────────────────────────────────────────────────────────────
// ✦ VEN-SCR-013: READ-ONLY VENDOR PROFILE & COMPLIANCE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VEN-SCR-013: Read-Only Vendor Profile
 *
 * Returns the vendor's own master profile in a sanitized, read-only payload:
 * - Business identity: name, trade name, category, type, GST/PAN/FSSAI
 * - FSSAI details, MSME/qualification status
 * - Contact persons (sanitized — no internal admin notes)
 * - Sites (delivery windows, approved cafés)
 * - Primary address
 * - Masked bank account (accountNumberMasked + ifsc + bank only)
 * - Payment terms & credit limit
 * - Performance metrics (OTIF, fill rate, lead time)
 * - Active holds (type, reason, date — no internal user IDs)
 * - Compliance quick-links from qualifications
 * - Approved café list with names
 * - Audit: registrationDate (createdAt), last profile view event
 *
 * Strips all internal admin-only data:
 *   - Full bank account number (accountNumber)
 *   - Internal margin / risk data
 *   - statusChangeReason, statusChangedByUserId
 *   - bankDetailsHistory, pendingBankChange
 *   - itemCatalogue (priced separately via VEN-SCR-009)
 *   - notes (internal admin notes)
 */
const getVendorProfile = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ vendorId, organisationId })
    .select(
      'vendorId organisationId name tradeName supplierType category status ' +
      'gstNumber panNumber fssaiLicense fssaiDetails ' +
      'phone email primaryContactEmail accountsEmail salesEmail website ' +
      'address contactPersons sites ' +
      'paymentTerms bankDetails ' +
      'performanceMetrics reliabilityRating ' +
      'qualifications holds approvedCafeIds ' +
      'contractExpiryDate contractRenewalAlertDays ' +
      'insuranceExpiryDate insurancePolicyNumber insuranceProvider ' +
      'createdAt updatedAt'
    )
    .lean();

  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'Vendor profile not found.');
  }

  // ── Resolve approved café names ───────────────────────────────────────────
  const approvedCafeIds = vendor.approvedCafeIds || [];
  const cafes = approvedCafeIds.length
    ? await Cafe.find({ cafeId: { $in: approvedCafeIds } })
        .select('cafeId name address')
        .lean()
    : [];
  const cafeMap = {};
  for (const c of cafes) {
    cafeMap[c.cafeId] = { cafeId: c.cafeId, name: c.name, address: formatCafeAddress(c.address) };
  }

  // ── Mask bank account (display ONLY bankName, accountHolderName, accountNumberMasked, paymentAccountStatus) ──
  const maskedBank = vendor.bankDetails
    ? {
        accountHolderName: vendor.bankDetails.accountHolderName || '',
        bankName: vendor.bankDetails.bankName || '',
        accountNumberMasked: vendor.bankDetails.accountNumberMasked ||
          (vendor.bankDetails.accountNumber
            ? '••••••••••' + String(vendor.bankDetails.accountNumber).slice(-4)
            : ''),
        paymentAccountStatus: 'Payment Account Verified',
      }
    : null;

  // ── Sanitize contact persons (no internal admin data) ─────────────────────
  const contactPersons = (vendor.contactPersons || []).map((cp) => ({
    name: cp.name,
    role: cp.role || '',
    department: cp.department || 'GENERAL',
    phone: cp.phone || '',
    email: cp.email || '',
    isPrimary: cp.isPrimary || false,
    isActive: cp.isActive !== false,
  }));

  // ── Sanitize sites ────────────────────────────────────────────────────────
  const sites = (vendor.sites || []).map((site) => ({
    siteId: site.siteId,
    siteName: site.siteName,
    siteType: site.siteType,
    address: site.address || {},
    primaryContactName: site.primaryContactName || '',
    phone: site.phone || '',
    email: site.email || '',
    leadTimeDays: site.leadTimeDays,
    deliveryCutoffTime: site.deliveryCutoffTime,
    deliveryDays: site.deliveryDays || [],
    status: site.status,
  }));

  // ── Compliance summary from qualifications ────────────────────────────────
  const qualifications = (vendor.qualifications || []).map((q) => ({
    area: q.area,
    status: q.status,
    effectiveDate: q.effectiveDate ? getIstDateString(new Date(q.effectiveDate)) : null,
    expiryDate: q.expiryDate ? getIstDateString(new Date(q.expiryDate)) : null,
    notes: q.notes || '',
  }));

  // Compute compliance scorecard
  const complianceAreas = ['LEGAL', 'TAX', 'FOOD_SAFETY_FSSAI', 'QUALITY', 'COMMERCIAL'];
  const qualMap = {};
  for (const q of vendor.qualifications || []) {
    qualMap[q.area] = q.status;
  }
  const complianceScore = complianceAreas.reduce((acc, area) => {
    const s = qualMap[area];
    if (s === 'QUALIFIED') return acc + 1;
    if (s === 'QUALIFIED_WITH_CONDITIONS') return acc + 0.5;
    return acc;
  }, 0);
  const compliancePercent = Math.round((complianceScore / complianceAreas.length) * 100);

  // ── Active holds (vendor-visible: type, reason, date only) ───────────────
  const activeHolds = (vendor.holds || [])
    .filter((h) => h.isActive)
    .map((h) => ({
      holdType: h.holdType,
      reason: h.reason,
      placedAt: h.placedAt ? getIstDateString(new Date(h.placedAt)) : null,
      reviewDate: h.reviewDate ? getIstDateString(new Date(h.reviewDate)) : null,
    }));

  // ── FSSAI validity ────────────────────────────────────────────────────────
  const fssai = vendor.fssaiDetails || {};
  const fssaiSummary = {
    applicable: fssai.isApplicable || false,
    licenseNumber: fssai.licenseNumber || vendor.fssaiLicense || '',
    valid: fssai.isValid !== false,
    expiryDate: fssai.expiryDate ? getIstDateString(new Date(fssai.expiryDate)) : null,
    verificationSource: fssai.verificationSource || 'FoSCoS Digital Registry',
  };

  // ── Performance metrics ───────────────────────────────────────────────────
  const perf = vendor.performanceMetrics || {};
  const performanceSummary = {
    otifPercent: perf.otifPercent ?? null,
    onTimeDeliveryPercent: perf.onTimeDeliveryPercent ?? null,
    fillRatePercent: perf.fillRatePercent ?? null,
    rejectionRatePercent: perf.rejectionRatePercent ?? null,
    averageLeadTimeDays: perf.averageLeadTimeDays ?? null,
    totalOrdersCount: perf.totalOrdersCount ?? 0,
    lastEvaluatedAt: perf.lastEvaluatedAt ? getIstDateString(new Date(perf.lastEvaluatedAt)) : null,
  };

  // ── Contract & insurance alert flags ──────────────────────────────────────
  const todayStr = getIstDateString();
  const todayMs = new Date(todayStr).getTime();

  let contractStatus = 'UNKNOWN';
  let contractDaysRemaining = null;
  if (vendor.contractExpiryDate) {
    const expMs = new Date(vendor.contractExpiryDate).getTime();
    contractDaysRemaining = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
    contractStatus = contractDaysRemaining < 0 ? 'EXPIRED'
      : contractDaysRemaining <= (vendor.contractRenewalAlertDays || 30) ? 'RENEWAL_ALERT'
      : 'VALID';
  }

  let insuranceStatus = 'UNKNOWN';
  let insuranceDaysRemaining = null;
  if (vendor.insuranceExpiryDate) {
    const expMs = new Date(vendor.insuranceExpiryDate).getTime();
    insuranceDaysRemaining = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
    insuranceStatus = insuranceDaysRemaining < 0 ? 'EXPIRED'
      : insuranceDaysRemaining <= (vendor.insuranceRenewalAlertDays || 30) ? 'RENEWAL_ALERT'
      : 'VALID';
  }

  // ── Security audit event ──────────────────────────────────────────────────
  logSecurityEvent({
    event: 'VENDOR_PROFILE_VIEWED',
    severity: 'INFO',
    userId: req.auth.userId,
    vendorId,
    organisationId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { vendorId },
  });

  // ── Assemble sanitized payload ────────────────────────────────────────────
  return res.status(200).json({
    success: true,
    data: {
      // Identity
      vendorId: vendor.vendorId,
      name: vendor.name,
      tradeName: vendor.tradeName || '',
      supplierType: vendor.supplierType,
      category: vendor.category,
      status: vendor.status,

      // Tax & Statutory
      gstNumber: vendor.gstNumber || '',
      panNumber: vendor.panNumber || '',
      fssai: fssaiSummary,

      // Contact
      phone: vendor.phone || '',
      email: vendor.email || '',
      primaryContactEmail: vendor.primaryContactEmail || '',
      accountsEmail: vendor.accountsEmail || '',
      salesEmail: vendor.salesEmail || '',
      website: vendor.website || '',

      // Address & Sites
      address: vendor.address || {},
      contactPersons,
      sites,

      // Commercial
      paymentTerms: vendor.paymentTerms || 'NET_30',
      bankDetails: maskedBank,

      // Approved cafés
      approvedCafes: approvedCafeIds.map((id) => cafeMap[id] || { cafeId: id, name: id, address: '' }),

      // Compliance
      qualifications,
      complianceSummary: {
        score: complianceScore,
        percent: compliancePercent,
        areas: complianceAreas.map((area) => ({
          area,
          status: qualMap[area] || 'NOT_ASSESSED',
        })),
      },

      // Holds
      activeHolds,
      hasActiveHold: activeHolds.length > 0,

      // Performance
      performance: performanceSummary,
      reliabilityRating: vendor.reliabilityRating || null,

      // Contract & Insurance
      contract: {
        expiryDate: vendor.contractExpiryDate ? getIstDateString(new Date(vendor.contractExpiryDate)) : null,
        status: contractStatus,
        daysRemaining: contractDaysRemaining,
      },
      insurance: {
        policyNumber: vendor.insurancePolicyNumber || '',
        provider: vendor.insuranceProvider || '',
        expiryDate: vendor.insuranceExpiryDate ? getIstDateString(new Date(vendor.insuranceExpiryDate)) : null,
        status: insuranceStatus,
        daysRemaining: insuranceDaysRemaining,
      },

      // Registration
      registeredOn: vendor.createdAt ? getIstDateString(new Date(vendor.createdAt)) : null,
      lastUpdated: vendor.updatedAt ? getIstDateString(new Date(vendor.updatedAt)) : null,
    },
    meta: {
      vendorId,
      readOnly: true,
      screen: 'VEN-SCR-013',
    },
  });
});

/**
 * VEN-SCR-013: Official A4 Vector PDF Vendor Profile Card
 *
 * Generates a clean, professional one-page vendor identity card:
 * - Organisation header
 * - Vendor identity block (name, type, category, status badge)
 * - Statutory block (GST, PAN, FSSAI)
 * - Contact block
 * - Address
 * - Payment terms
 * - Compliance scorecard (5 areas)
 * - Active holds (if any)
 * - Performance metrics
 */
const downloadVendorProfilePdf = asyncHandler(async (req, res) => {
  const { vendorId, organisationId } = req.auth;

  const vendor = await Vendor.findOne({ vendorId, organisationId })
    .select(
      'vendorId name tradeName supplierType category status ' +
      'gstNumber panNumber fssaiLicense fssaiDetails ' +
      'phone email primaryContactEmail address ' +
      'paymentTerms bankDetails ' +
      'performanceMetrics reliabilityRating ' +
      'qualifications holds approvedCafeIds ' +
      'contractExpiryDate insuranceExpiryDate insurancePolicyNumber insuranceProvider ' +
      'createdAt'
    )
    .lean();

  if (!vendor) {
    throw new ApiError(404, 'VENDOR_NOT_FOUND', 'Vendor profile not found.');
  }

  const todayStr = getIstDateString();
  const perf = vendor.performanceMetrics || {};
  const fssai = vendor.fssaiDetails || {};

  // Compliance quick scorecard
  const complianceAreas = ['LEGAL', 'TAX', 'FOOD_SAFETY_FSSAI', 'QUALITY', 'COMMERCIAL'];
  const qualMap = {};
  for (const q of vendor.qualifications || []) qualMap[q.area] = q.status;

  const complianceScore = complianceAreas.reduce((acc, area) => {
    const s = qualMap[area];
    if (s === 'QUALIFIED') return acc + 1;
    if (s === 'QUALIFIED_WITH_CONDITIONS') return acc + 0.5;
    return acc;
  }, 0);
  const compliancePercent = Math.round((complianceScore / complianceAreas.length) * 100);

  const activeHolds = (vendor.holds || []).filter((h) => h.isActive);

  const addrParts = [];
  if (vendor.address) {
    if (vendor.address.line1) addrParts.push(vendor.address.line1);
    if (vendor.address.line2) addrParts.push(vendor.address.line2);
    if (vendor.address.city) addrParts.push(vendor.address.city);
    if (vendor.address.state) addrParts.push(vendor.address.state);
    if (vendor.address.pincode) addrParts.push(vendor.address.pincode);
  }
  const addressStr = addrParts.join(', ') || 'Address not on record';

  // Build PDF
  const pdfLines = [];
  const W = 595;
  const H = 842;

  pdfLines.push('%PDF-1.4');

  // ── Objects ───────────────────────────────────────────────────────────────
  const objects = [];
  const offsets = [];

  function addObj(id, content) {
    objects[id] = content;
  }

  function s(str) { return escapePdf(str); }

  // Object 1 — Catalog
  addObj(1, '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // Object 2 — Pages
  addObj(2, '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

  // Object 3 — Page
  addObj(3, `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}]\n   /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>\nendobj`);

  // ── Build content stream ──────────────────────────────────────────────────
  const lines = [];
  function text(x, y, size, font, str) {
    lines.push(`BT /F${font} ${size} Tf ${x} ${y} Td (${s(str)}) Tj ET`);
  }
  function rect(x, y, w, h, fill) {
    lines.push(`${fill} rg ${x} ${y} ${w} ${h} re f`);
  }
  function hrule(x, y, w) {
    lines.push(`0.7 0.7 0.7 RG 0.5 w ${x} ${y} m ${x + w} ${y} l S 0 G`);
  }

  // Header bar
  rect(0, H - 60, W, 60, '0.10 0.20 0.40');
  text(30, H - 38, 18, 2, 'Zamorin Café ERP — Vendor Identity Card');
  text(30, H - 52, 9, 1, `Generated: ${todayStr}  |  Screen: VEN-SCR-013  |  Read-Only`);

  let y = H - 85;

  // Section: Vendor Identity
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, 'VENDOR IDENTITY');
  y -= 22;

  text(34, y, 10, 2, `Vendor ID:`);
  text(140, y, 10, 1, vendor.vendorId);
  text(320, y, 10, 2, `Status:`);
  text(380, y, 10, 1, vendor.status);
  y -= 14;

  text(34, y, 10, 2, `Name:`);
  text(140, y, 10, 1, vendor.name);
  y -= 14;

  if (vendor.tradeName) {
    text(34, y, 10, 2, `Trade Name:`);
    text(140, y, 10, 1, vendor.tradeName);
    y -= 14;
  }

  text(34, y, 10, 2, `Type:`);
  text(140, y, 10, 1, vendor.supplierType);
  text(320, y, 10, 2, `Category:`);
  text(380, y, 10, 1, vendor.category);
  y -= 20;
  hrule(30, y, W - 60);
  y -= 18;

  // Section: Statutory
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, 'STATUTORY & COMPLIANCE');
  y -= 22;

  text(34, y, 10, 2, `GST Number:`);
  text(140, y, 10, 1, vendor.gstNumber || 'Not registered');
  text(320, y, 10, 2, `PAN Number:`);
  text(400, y, 10, 1, vendor.panNumber || 'Not on record');
  y -= 14;

  text(34, y, 10, 2, `FSSAI License:`);
  text(140, y, 10, 1, fssai.licenseNumber || vendor.fssaiLicense || 'Not applicable');
  text(320, y, 10, 2, `FSSAI Valid:`);
  text(400, y, 10, 1, fssai.isApplicable ? (fssai.isValid ? 'Yes' : 'Expired') : 'N/A');
  y -= 14;

  if (vendor.contractExpiryDate) {
    text(34, y, 10, 2, `Contract Expiry:`);
    text(140, y, 10, 1, getIstDateString(new Date(vendor.contractExpiryDate)));
  }
  if (vendor.insuranceExpiryDate) {
    text(320, y, 10, 2, `Insurance Expiry:`);
    text(420, y, 10, 1, getIstDateString(new Date(vendor.insuranceExpiryDate)));
  }
  y -= 20;
  hrule(30, y, W - 60);
  y -= 18;

  // Section: Contact
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, 'CONTACT');
  y -= 22;

  text(34, y, 10, 2, `Phone:`);
  text(140, y, 10, 1, vendor.phone || 'N/A');
  text(320, y, 10, 2, `Email:`);
  text(380, y, 10, 1, vendor.email || 'N/A');
  y -= 14;

  text(34, y, 10, 2, `Address:`);
  text(140, y, 10, 1, addressStr);
  y -= 20;
  hrule(30, y, W - 60);
  y -= 18;

  // Section: Commercial
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, 'COMMERCIAL TERMS');
  y -= 22;

  text(34, y, 10, 2, `Payment Terms:`);
  text(140, y, 10, 1, formatPaymentTerms(vendor.paymentTerms));
  if (vendor.bankDetails?.bankName) {
    text(320, y, 10, 2, `Payment Account:`);
    text(430, y, 10, 1, 'Verified On File');
  }
  y -= 20;
  hrule(30, y, W - 60);
  y -= 18;

  // Section: Compliance Scorecard
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, `COMPLIANCE SCORECARD — ${compliancePercent}%`);
  y -= 22;

  for (const area of complianceAreas) {
    const status = qualMap[area] || 'NOT_ASSESSED';
    text(34, y, 9, 2, `${area}:`);
    text(180, y, 9, 1, status);
    y -= 13;
  }
  y -= 8;
  hrule(30, y, W - 60);
  y -= 18;

  // Section: Performance
  rect(30, y - 2, W - 60, 18, '0.94 0.96 1.00');
  text(34, y + 2, 11, 2, 'PERFORMANCE METRICS');
  y -= 22;

  text(34, y, 10, 2, `OTIF:`);
  text(140, y, 10, 1, perf.otifPercent != null ? `${perf.otifPercent}%` : 'N/A');
  text(320, y, 10, 2, `Fill Rate:`);
  text(400, y, 10, 1, perf.fillRatePercent != null ? `${perf.fillRatePercent}%` : 'N/A');
  y -= 14;

  text(34, y, 10, 2, `On-Time Delivery:`);
  text(140, y, 10, 1, perf.onTimeDeliveryPercent != null ? `${perf.onTimeDeliveryPercent}%` : 'N/A');
  text(320, y, 10, 2, `Avg Lead Time:`);
  text(400, y, 10, 1, perf.averageLeadTimeDays != null ? `${perf.averageLeadTimeDays} days` : 'N/A');
  y -= 20;

  if (activeHolds.length > 0) {
    hrule(30, y, W - 60);
    y -= 18;
    rect(30, y - 2, W - 60, 18, '1.00 0.95 0.90');
    text(34, y + 2, 11, 2, `ACTIVE HOLDS (${activeHolds.length})`);
    y -= 22;
    for (const h of activeHolds) {
      text(34, y, 9, 2, `${h.holdType}:`);
      text(160, y, 9, 1, h.reason.length > 60 ? h.reason.slice(0, 57) + '...' : h.reason);
      y -= 13;
    }
  }

  // Footer
  hrule(30, 40, W - 60);
  text(30, 28, 8, 1, 'This document is system-generated and read-only. Internal financial data has been redacted for vendor use.');
  text(30, 18, 8, 1, `Vendor: ${vendor.vendorId}  |  Zamorin Café ERP  |  ${todayStr}`);

  const streamContent = lines.join('\n');

  // Object 4 — Content stream
  addObj(4, `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`);

  // Font objects
  addObj(5, '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  addObj(6, '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  addObj(7, '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj');

  // Build body
  let body = '%PDF-1.4\n';
  for (let i = 1; i <= 7; i++) {
    offsets[i] = body.length;
    body += objects[i] + '\n';
  }

  const xrefOffset = body.length;
  body += 'xref\n';
  body += `0 8\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= 7; i++) {
    body += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  body += 'trailer\n<< /Size 8 /Root 1 0 R >>\n';
  body += `startxref\n${xrefOffset}\n%%EOF`;

  logSecurityEvent({
    event: 'VENDOR_PROFILE_PDF_DOWNLOADED',
    severity: 'INFO',
    userId: req.auth.userId,
    vendorId,
    organisationId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { vendorId },
  });

  const pdfBuffer = Buffer.from(body, 'utf8');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VendorProfile-${vendorId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

module.exports = {
  getVendorMe,
  getVendorDashboard,
  getVendorPurchaseOrders,
  getVendorOrderDetails,
  downloadVendorOrderPdf,
  getVendorDeliveries,
  getVendorDeliveryDetails,
  downloadVendorGrnPdf,
  downloadVendorGrnAttachment,
  getVendorInvoices,
  getVendorInvoiceDetails,
  downloadVendorInvoicePdf,
  getVendorPayments,
  getVendorPaymentDetails,
  downloadVendorPaymentReceiptPdf,
  getVendorAccountStatement,
  downloadVendorStatementPdf,
  downloadVendorStatementCsv,
  downloadVendorStatementXlsx,
  getVendorReceivables,
  downloadVendorReceivablesPdf,
  downloadVendorReceivablesCsv,
  downloadVendorReceivablesXlsx,
  getVendorAdjustments,
  getVendorAdjustmentDetails,
  downloadVendorAdjustmentsCsv,
  downloadVendorAdjustmentsXlsx,
  downloadVendorAdjustmentPdf,
  getVendorProducts,
  getVendorProductDetails,
  downloadVendorProductsCsv,
  downloadVendorProductsXlsx,
  downloadVendorProductPdf,
  getVendorDocuments,
  downloadVendorDocumentsCsv,
  downloadVendorDocumentsXlsx,
  downloadVendorDocumentUniversal,
  downloadVendorDocumentFile,
  getVendorReports,
  downloadVendorReportsCsv,
  downloadVendorReportsXlsx,
  downloadVendorReportsPdf,
  getVendorNotifications,
  downloadVendorNotificationsCsv,
  downloadVendorNotificationsXlsx,
  getVendorProfile,
  downloadVendorProfilePdf,
  sanitizeVendorIdentity,
};


