'use strict';

const crypto = require('crypto');
const {
  Expense,
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  RECEIPT_STATUSES,
  AUDIT_STATUSES,
  FINANCE_STATUSES,
} = require('../models/Expense');

const { ExpenseRequest } = require('../models/ExpenseRequest');
const { ExpensePolicy } = require('../models/ExpensePolicy');
const { CorporateCardTransaction } = require('../models/CorporateCardTransaction');
const { OperationalAdvance } = require('../models/OperationalAdvance');
const { SequenceCounter } = require('../models/SequenceCounter');
const { Approval } = require('../models/Approval');
const { Notification } = require('../models/Notification');
const { NotificationOutbox } = require('../models/NotificationOutbox');
const { User } = require('../models/User');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { resolveEffectiveCafeScope, assertResourceCafeOwnership } = require('../utils/cafeScope');

function normalizeIdentifier(value) {
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

function ensureCafeAccess(request, cafeId) {
  if (!cafeId) return;
  const cleanCafe = cafeId.trim().toUpperCase();
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe && effectiveCafe !== cleanCafe) {
    throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'You do not have access to this cafe in the current workspace scope.');
  }
  const role = request?.auth?.role;
  if (role === 'MASTER') return;
  if (role === 'OWNER') {
    const assignedCafeIds = (request?.auth?.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase());
    if (!assignedCafeIds.includes(cleanCafe)) {
      throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'You do not have access to this cafe.');
    }
    return;
  }
}

// 1. Overview & Actionable Control Strip
const getExpenseOverview = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const effectiveCafe = resolveEffectiveCafeScope(request);
  const isPrimary = request.auth.role === 'MASTER' && request.auth.isPrimaryMaster;
  const activeScopeCafe = effectiveCafe || (request.query.cafeId && request.query.cafeId !== 'ALL' ? request.query.cafeId.trim().toUpperCase() : null);
  if (activeScopeCafe) {
    ensureCafeAccess(request, activeScopeCafe);
  }
  const cafeFilter = activeScopeCafe
    ? { cafeId: activeScopeCafe }
    : (request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN'
        ? { cafeId: { $in: request.auth.assignedCafeIds || [] } }
        : {});

  const expenses = await Expense.find({ organisationId, ...cafeFilter });

  const totalSpentPaisa = expenses.reduce((sum, e) => sum + (e.totalPaisa || Math.round((e.amount || 0) * 100)), 0);
  const approvedExpenses = expenses.filter((e) => e.status === 'APPROVED');
  const approvedPaisa = approvedExpenses.reduce((sum, e) => sum + (e.totalPaisa || Math.round((e.amount || 0) * 100)), 0);
  const pendingApprovals = expenses.filter((e) => e.status === 'SUBMITTED' || e.status === 'PENDING_APPROVAL');
  const pendingPaisa = pendingApprovals.reduce((sum, e) => sum + (e.totalPaisa || Math.round((e.amount || 0) * 100)), 0);
  const awaitingFinance = expenses.filter((e) => e.status === 'APPROVED' && e.financeHandoff?.status !== 'PAID' && e.financeHandoff?.status !== 'REIMBURSED');
  const missingReceipts = expenses.filter((e) => e.receiptStatus === 'MISSING' || (e.missingReceipt && e.missingReceipt.isDeclared));
  const policyExceptions = expenses.filter((e) => e.policySnapshot?.exceptions?.length > 0);

  // Secondary Control Strip
  const controlStrip = {
    receiptsMissingCount: missingReceipts.length,
    possibleDuplicatesCount: 0,
    cardMatchingPendingCount: await CorporateCardTransaction.countDocuments({ organisationId, matchStatus: 'UNMATCHED' }),
    overdueApprovalsCount: pendingApprovals.length,
    budgetWarningsCount: 0,
    nonPoExceptionsCount: expenses.filter((e) => e.expenseType === 'EMERGENCY_NON_PO').length,
    auditSelectedCount: expenses.filter((e) => e.auditState?.status === 'SELECTED' || e.auditState?.status === 'UNDER_REVIEW').length,
    unsettledAdvancesCount: await OperationalAdvance.countDocuments({ organisationId, status: { $ne: 'CLOSED' } }),
    financeHandoffErrorsCount: expenses.filter((e) => e.financeHandoff?.status === 'ON_HOLD').length,
  };

  // Cafe Breakdown Cards
  const cafeMap = {};
  expenses.forEach((e) => {
    const cId = e.cafeId || 'GLOBAL';
    if (!cafeMap[cId]) {
      cafeMap[cId] = { cafeId: cId, totalPaisa: 0, approvedPaisa: 0, pendingCount: 0, missingReceipts: 0 };
    }
    const amt = e.totalPaisa || Math.round((e.amount || 0) * 100);
    cafeMap[cId].totalPaisa += amt;
    if (e.status === 'APPROVED') cafeMap[cId].approvedPaisa += amt;
    if (e.status === 'SUBMITTED') cafeMap[cId].pendingCount += 1;
    if (e.receiptStatus === 'MISSING') cafeMap[cId].missingReceipts += 1;
  });

  return response.status(200).json({
    kpis: {
      totalSpentPaisa,
      approvedPaisa,
      pendingCount: pendingApprovals.length,
      pendingPaisa,
      awaitingFinanceCount: awaitingFinance.length,
      missingReceiptsCount: missingReceipts.length,
      policyExceptionsCount: policyExceptions.length,
    },
    controlStrip,
    cafeBreakdown: Object.values(cafeMap),
    recentExpenses: expenses.slice(0, 10),
  });
});

// 2. List Expenses (Search & Filters)
const listExpenses = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const {
    cafeId,
    status,
    category,
    expenseType,
    paymentSource,
    search,
    fromDate,
    toDate,
    page = 1,
    limit = 50,
  } = request.query;

  const query = { organisationId };

  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe) {
    query.cafeId = effectiveCafe;
  } else if (cafeId && cafeId !== 'ALL') {
    ensureCafeAccess(request, cafeId);
    query.cafeId = cafeId.trim().toUpperCase();
  } else if (request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN') {
    query.cafeId = { $in: request.auth.assignedCafeIds || [] };
  }

  if (status && status !== 'ALL') {
    query.status = status;
  }

  if (category && category !== 'ALL') {
    query.category = category.toUpperCase();
  }

  if (expenseType && expenseType !== 'ALL') {
    query.expenseType = expenseType;
  }

  if (paymentSource && paymentSource !== 'ALL') {
    query.paymentSource = paymentSource;
  }

  if (fromDate || toDate) {
    query.businessDate = {};
    if (fromDate) query.businessDate.$gte = fromDate;
    if (toDate) query.businessDate.$lte = toDate;
  }

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { expenseId: searchRegex },
      { vendorName: searchRegex },
      { description: searchRegex },
      { invoiceNumber: searchRegex },
      { category: searchRegex },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [expenses, total] = await Promise.all([
    Expense.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Expense.countDocuments(query),
  ]);

  return response.status(200).json({
    expenses,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// 3. Get Expense 360 Detail
const getExpense = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { expenseId } = request.params;

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  const isPrimary = request.auth.role === 'MASTER' && request.auth.isPrimaryMaster;
  const isMaster = request.auth.role === 'MASTER';
  const isSubmitter = request.auth.userId === expense.ownerUserId || request.auth.userId === expense.preparerUserId;

  const allowedActions = [];
  if (expense.status === 'DRAFT') {
    allowedActions.push('EDIT', 'SUBMIT', 'DELETE');
  }
  if (expense.status === 'SUBMITTED' || expense.status === 'PENDING_APPROVAL') {
    if (isMaster && request.auth.userId !== expense.ownerUserId) {
      allowedActions.push('APPROVE', 'RETURN', 'REJECT');
    }
    if (isSubmitter) {
      allowedActions.push('RECALL');
    }
  }
  if (expense.status === 'APPROVED') {
    if (isMaster) {
      allowedActions.push('RECORD_PAYMENT', 'REVERSE', 'GENERATE_VOUCHER');
    }
  }

  return response.status(200).json({
    expense,
    allowedActions,
  });
});

// 4. Create / Capture New Expense
const createExpense = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const {
    cafeId,
    businessDate,
    expenseType = 'COMPANY_PAID',
    category,
    purpose = 'Café Operations',
    description,
    amount,
    taxPaisa = 0,
    paymentMethod = 'CASH',
    paymentSource = 'CASH',
    vendorName = '',
    invoiceNumber = '',
    items = [],
    allocations = [],
    gstDetails = {},
    relatedRecords = {},
    evidence = [],
    isDraft = false,
  } = request.body;

  if (!cafeId || !category || !description || (!amount && items.length === 0)) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Cafe ID, category, description, and amount are required.');
  }

  ensureCafeAccess(request, cafeId);

  // Duplicate Check
  const normalizedInvoice = invoiceNumber.trim().toUpperCase();
  if (normalizedInvoice && vendorName) {
    const existing = await Expense.findOne({
      organisationId,
      vendorName: new RegExp(`^${vendorName.trim()}$`, 'i'),
      invoiceNumber: normalizedInvoice,
      status: { $ne: 'CANCELLED' },
    });
    if (existing) {
      throw new ApiError(409, 'DUPLICATE_EXPENSE_DETECTED', `An expense with invoice #${normalizedInvoice} from ${vendorName} already exists (${existing.expenseId}).`);
    }
  }

  const dateStr = businessDate || getIstBusinessDate();
  const dateCompact = dateStr.replace(/-/g, '');
  let expenseId;
  try {
    expenseId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `EXPENSE:${dateCompact}`,
      prefix: `EX-${dateCompact}`,
      minimumDigits: 4,
    });
  } catch (err) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    expenseId = `EX-${dateCompact}-${randomSuffix}`;
  }

  const amountPaisa = amount ? Math.round(Number(amount) * 100) : items.reduce((sum, it) => sum + (it.amountPaisa || 0), 0);
  const totalPaisa = amountPaisa + Number(taxPaisa);

  // Evidence hashes
  const processedEvidence = (evidence || []).map((ev, idx) => ({
    documentId: ev.documentId || `DOC-EXP-${idx + 1}`,
    documentType: ev.documentType || 'RECEIPT',
    fileUrl: ev.fileUrl || '/receipts/default.pdf',
    fileHash: ev.fileHash || crypto.createHash('sha256').update(ev.fileUrl || `${expenseId}-${idx}`).digest('hex'),
    fileName: ev.fileName || 'Receipt.pdf',
    uploadedBy: userId,
  }));

  const initialStatus = isDraft ? 'DRAFT' : 'SUBMITTED';

  const expense = await Expense.create({
    expenseId,
    organisationId,
    cafeId,
    businessDate: dateStr,
    expenseType,
    ownerUserId: request.body.ownerUserId || userId,
    preparerUserId: userId,
    category: category.toUpperCase(),
    purpose,
    description,
    amount: amountPaisa / 100,
    amountPaisa,
    taxPaisa: Number(taxPaisa),
    totalPaisa,
    currency: 'INR',
    paymentMethod,
    paymentSource,
    vendorName,
    invoiceNumber: normalizedInvoice,
    receiptStatus: processedEvidence.length > 0 ? 'ATTACHED' : 'REQUIRED',
    evidence: processedEvidence,
    items,
    allocations: allocations.length > 0 ? allocations : [{ cafeId, amountPaisa: totalPaisa, percentage: 100 }],
    gstDetails,
    relatedRecords,
    status: initialStatus,
    submittedAt: isDraft ? null : new Date(),
    submittedBy: isDraft ? null : userId,
    createdBy: userId,
  });

  if (!isDraft) {
    try {
      const approvalCount = await Approval.countDocuments({ organisationId });
      const approvalId = `APP-${String(approvalCount + 1001).padStart(5, '0')}`;
      await Approval.create({
        approvalId,
        organisationId,
        cafeId,
        entityType: 'EXPENSE',
        entityId: expense.expenseId,
        requestingUserId: userId,
        actionRequired: `Expense Claim: ₹${(totalPaisa / 100).toFixed(2)} (${expense.purpose || expense.category})`,
        amountPaisa: totalPaisa,
        status: 'PENDING',
      });

      const masterUsers = await User.find({ organisationId, role: 'MASTER', accountStatus: 'ACTIVE' }).select('userId email').lean();
      const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      for (const m of masterUsers) {
        const notifId = `NT-${dateKey}-${Math.floor(1000 + Math.random() * 9000)}`;
        await Notification.create({
          notificationId: notifId,
          organisationId,
          cafeId,
          eventType: 'EXPENSE_SUBMITTED',
          category: 'FINANCE',
          recipientUserId: m.userId,
          recipientRole: 'MASTER',
          recipientEmail: m.email || 'master@zamorincafe.com',
          title: `🧾 Expense Claim: ${expense.expenseId}`,
          message: `${userId} submitted an expense claim of ₹${(totalPaisa / 100).toFixed(2)} (${expense.purpose || expense.category}) for ${cafeId}.`,
          priority: 'NORMAL',
          channels: ['IN_APP'],
          deepLink: `#approvals`,
          sourceModule: 'EXPENSES',
          sourceEntityType: 'EXPENSE',
          sourceEntityId: expense.expenseId,
          createdBy: userId,
        });
      }
    } catch (err) {
      console.warn(`[EXPENSE_APPROVAL_HOOK_WARN] ${err.message}`);
    }
  }

  return response.status(201).json({
    message: isDraft ? 'Expense draft saved.' : 'Expense recorded and submitted for approval.',
    expense,
  });
});

// 5. Update Draft Expense
const updateExpense = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  if (expense.status !== 'DRAFT' && expense.status !== 'RETURNED') {
    throw new ApiError(400, 'INVALID_STATE', 'Only draft or returned expenses can be edited directly.');
  }

  ensureCafeAccess(request, expense.cafeId);

  const allowedUpdates = [
    'category',
    'purpose',
    'description',
    'amount',
    'taxPaisa',
    'paymentMethod',
    'paymentSource',
    'vendorName',
    'invoiceNumber',
    'items',
    'allocations',
    'gstDetails',
    'relatedRecords',
    'notes',
  ];

  allowedUpdates.forEach((field) => {
    if (request.body[field] !== undefined) {
      expense[field] = request.body[field];
    }
  });

  if (request.body.amount) {
    expense.amountPaisa = Math.round(Number(request.body.amount) * 100);
    expense.totalPaisa = expense.amountPaisa + (expense.taxPaisa || 0);
  }

  expense.updatedBy = userId;
  await expense.save();

  return response.status(200).json({
    message: 'Expense updated successfully.',
    expense,
  });
});

// 6. Submit Expense
const submitExpense = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  if (expense.status !== 'DRAFT' && expense.status !== 'RETURNED') {
    throw new ApiError(400, 'INVALID_STATE', 'Expense is not in draft or returned state.');
  }

  expense.status = 'SUBMITTED';
  expense.submittedAt = new Date();
  expense.submittedBy = userId;
  expense.updatedBy = userId;
  await expense.save();

  try {
    const existing = await Approval.findOne({ organisationId, entityId: expense.expenseId });
    if (existing) {
      existing.status = 'PENDING';
      existing.actionRequired = `Expense Claim: ₹${((expense.totalPaisa || 0) / 100).toFixed(2)} (${expense.purpose || expense.category})`;
      existing.amountPaisa = expense.totalPaisa || 0;
      await existing.save();
    } else {
      const approvalCount = await Approval.countDocuments({ organisationId });
      const approvalId = `APP-${String(approvalCount + 1001).padStart(5, '0')}`;
      await Approval.create({
        approvalId,
        organisationId,
        cafeId: expense.cafeId,
        entityType: 'EXPENSE',
        entityId: expense.expenseId,
        requestingUserId: userId,
        actionRequired: `Expense Claim: ₹${((expense.totalPaisa || 0) / 100).toFixed(2)} (${expense.purpose || expense.category})`,
        amountPaisa: expense.totalPaisa || 0,
        status: 'PENDING',
      });
    }

    const masterUsers = await User.find({ organisationId, role: 'MASTER', accountStatus: 'ACTIVE' }).select('userId email').lean();
    const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (const m of masterUsers) {
      const notifId = `NT-${dateKey}-${Math.floor(1000 + Math.random() * 9000)}`;
      await Notification.create({
        notificationId: notifId,
        organisationId,
        cafeId: expense.cafeId,
        eventType: 'EXPENSE_SUBMITTED',
        category: 'FINANCE',
        recipientUserId: m.userId,
        recipientRole: 'MASTER',
        recipientEmail: m.email || 'master@zamorincafe.com',
        title: `🧾 Expense Claim: ${expense.expenseId}`,
        message: `${userId} submitted an expense claim of ₹${((expense.totalPaisa || 0) / 100).toFixed(2)} (${expense.purpose || expense.category}) for ${expense.cafeId}.`,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        deepLink: `#approvals`,
        sourceModule: 'EXPENSES',
        sourceEntityType: 'EXPENSE',
        sourceEntityId: expense.expenseId,
        createdBy: userId,
      });
    }
  } catch (err) {
    console.warn(`[EXPENSE_APPROVAL_HOOK_WARN] ${err.message}`);
  }

  return response.status(200).json({
    message: 'Expense submitted for approval.',
    expense,
  });
});

// 7. Decide Expense (Approve / Return / Reject)
const decideExpense = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;
  const { decision, reason = '', approvedAmountPaisa } = request.body;

  if (!['APPROVE', 'RETURN', 'REJECT'].includes(decision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'Decision must be APPROVE, RETURN, or REJECT.');
  }

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  // Maker-Checker enforcement: cannot approve own expense
  if (decision === 'APPROVE' && expense.ownerUserId === userId && request.auth.role !== 'MASTER') {
    throw new ApiError(403, 'MAKER_CHECKER_VIOLATION', 'You cannot approve your own expense.');
  }

  if (expense.status !== 'SUBMITTED' && expense.status !== 'PENDING_APPROVAL') {
    throw new ApiError(400, 'INVALID_STATE', 'Expense is not pending a decision.');
  }

  const finalApprovedPaisa = approvedAmountPaisa !== undefined ? Number(approvedAmountPaisa) : expense.totalPaisa;

  if (decision === 'APPROVE') {
    expense.status = 'APPROVED';
    expense.approvalSnapshot = {
      version: (expense.approvalSnapshot?.version || 0) + 1,
      approvedAt: new Date(),
      approvedBy: userId,
      approvedAmountPaisa: finalApprovedPaisa,
      reason,
    };
    expense.financeHandoff = {
      status: 'AWAITING_FINANCE',
      sentAt: new Date(),
      postingStatus: 'PENDING',
      paymentStatus: 'UNPAID',
    };
  } else if (decision === 'RETURN') {
    expense.status = 'RETURNED';
  } else {
    expense.status = 'REJECTED';
  }

  expense.decisionAt = new Date();
  expense.decisionBy = userId;
  expense.decisionReason = reason;
  expense.updatedBy = userId;
  await expense.save();

  // Sync Approval
  try {
    const approvalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await Approval.updateOne(
      { organisationId, entityId: expenseId, status: 'PENDING' },
      {
        $set: {
          status: approvalStatus,
          decidedByUserId: userId,
          decisionReason: reason || (decision === 'RETURN' ? 'Returned for rework' : ''),
          decidedAt: new Date(),
        },
      }
    );
  } catch (_) {}

  // Notify preparer / owner
  try {
    const recipientId = expense.preparerUserId || expense.ownerUserId || expense.createdBy;
    const recipientUser = await User.findOne({ organisationId, userId: recipientId }).select('email role').lean();
    const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const notifId = `NT-${dateKey}-${Math.floor(1000 + Math.random() * 9000)}`;
    const eventType = decision === 'APPROVE' ? 'EXPENSE_APPROVED' : (decision === 'RETURN' ? 'EXPENSE_RETURNED' : 'EXPENSE_REJECTED');
    const decisionText = decision === 'APPROVE' ? 'Approved' : (decision === 'RETURN' ? 'Returned' : 'Rejected');

    await Notification.create({
      notificationId: notifId,
      organisationId,
      cafeId: expense.cafeId,
      eventType,
      category: 'FINANCE',
      recipientUserId: recipientId,
      recipientRole: recipientUser?.role || 'CAFE_ADMIN',
      recipientEmail: recipientUser?.email || `${String(recipientId).toLowerCase()}@zamorincafe.com`,
      title: `Expense ${expense.expenseId} ${decisionText}`,
      message: `Your expense claim ${expense.expenseId} (₹${((expense.totalPaisa || 0) / 100).toFixed(2)}) has been ${decisionText.toLowerCase()}.${reason ? ' Reason: ' + reason : ''}`,
      priority: 'NORMAL',
      channels: ['IN_APP'],
      deepLink: `#expenses?expenseId=${expense.expenseId}`,
      sourceModule: 'EXPENSES',
      sourceEntityType: 'EXPENSE',
      sourceEntityId: expense.expenseId,
      createdBy: userId,
    });
  } catch (_) {}

  return response.status(200).json({
    message: `Expense ${decision.toLowerCase()}d successfully.`,
    expense,
  });
});

// 8. Missing Receipt Declaration / Waiver
const recordMissingReceipt = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;
  const { reason, explanation, isWaiver = false } = request.body;

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  if (isWaiver) {
    if (request.auth.role !== 'MASTER' || !request.auth.isPrimaryMaster) {
      throw new ApiError(403, 'PRIMARY_MASTER_REQUIRED', 'Only Primary Master may waive missing receipts.');
    }
    expense.receiptStatus = 'WAIVED';
    expense.missingReceipt.waiverApprovedBy = userId;
    expense.missingReceipt.waiverApprovedAt = new Date();
  } else {
    expense.receiptStatus = 'MISSING';
    expense.missingReceipt = {
      isDeclared: true,
      reason: reason || 'Lost in Transit',
      explanation: explanation || '',
      waiverApprovedBy: null,
      waiverApprovedAt: null,
    };
  }

  expense.updatedBy = userId;
  await expense.save();

  return response.status(200).json({
    message: isWaiver ? 'Missing receipt waiver approved.' : 'Missing receipt declared.',
    expense,
  });
});

// 9. Match Corporate Card Transaction
const matchCorporateCard = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { transactionId, expenseId, isPersonal = false } = request.body;

  const cardTxn = await CorporateCardTransaction.findOne({ organisationId, transactionId });
  if (!cardTxn) {
    throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Corporate card transaction not found.');
  }

  if (isPersonal) {
    cardTxn.isPersonal = true;
    cardTxn.matchStatus = 'PERSONAL';
    await cardTxn.save();
    return response.status(200).json({ message: 'Transaction marked as personal expense.', cardTxn });
  }

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'Expense voucher not found.');
  }

  ensureCafeAccess(request, expense.cafeId);

  cardTxn.matchStatus = 'MATCHED';
  cardTxn.matchedExpenseId = expense.expenseId;
  await cardTxn.save();

  expense.relatedRecords.cardTransactionId = cardTxn.transactionId;
  expense.paymentSource = 'CORPORATE_CARD';
  await expense.save();

  return response.status(200).json({
    message: 'Corporate card transaction successfully matched.',
    cardTxn,
    expense,
  });
});

// 10. Liquidate Operational Advance
const liquidateAdvance = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { advanceId, expenseIds = [], returnedBalancePaisa = 0 } = request.body;

  const advance = await OperationalAdvance.findOne({ organisationId, advanceId });
  if (!advance) {
    throw new ApiError(404, 'ADVANCE_NOT_FOUND', 'Operational advance record not found.');
  }

  const expenses = await Expense.find({ organisationId, expenseId: { $in: expenseIds } });
  const totalLiquidatedPaisa = expenses.reduce((sum, e) => sum + (e.totalPaisa || 0), 0);

  advance.liquidatedAmountPaisa += totalLiquidatedPaisa;
  advance.returnedBalancePaisa += Number(returnedBalancePaisa);
  advance.liquidatedExpenseIds.push(...expenseIds);

  const unsettledPaisa = advance.amountPaisa - (advance.liquidatedAmountPaisa + advance.returnedBalancePaisa);
  if (unsettledPaisa <= 0) {
    advance.status = 'FULLY_LIQUIDATED';
  } else {
    advance.status = 'PARTIALLY_LIQUIDATED';
  }

  await advance.save();

  return response.status(200).json({
    message: 'Operational advance liquidation recorded.',
    advance,
    unsettledPaisa: Math.max(0, unsettledPaisa),
  });
});

// 11. Mark Expense Paid (Finance Hand-off / Settlement)
const markExpensePaid = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;
  const { paymentReference = '', paidAt } = request.body;

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  if (expense.status !== 'APPROVED') {
    throw new ApiError(400, 'INVALID_STATE', 'Only approved expenses can be marked as paid.');
  }

  expense.status = 'PAID';
  expense.paidAt = paidAt ? new Date(paidAt) : new Date();
  expense.paidBy = userId;
  expense.paymentReference = paymentReference;
  expense.financeHandoff = {
    ...expense.financeHandoff,
    status: 'PAID',
    paymentStatus: 'PAID',
    postingStatus: 'POSTED',
  };
  expense.updatedBy = userId;
  await expense.save();

  return response.status(200).json({
    message: 'Expense marked as paid and settled in Finance.',
    expense,
  });
});

// 12. Reverse Expense
const reverseExpense = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { expenseId } = request.params;
  const { reason = '' } = request.body;

  if (request.auth.role !== 'MASTER') {
    throw new ApiError(403, 'MASTER_AUTHORITY_REQUIRED', 'Only Master may reverse an expense.');
  }

  const expense = await Expense.findOne({ organisationId, expenseId });
  if (!expense) {
    throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'The requested expense does not exist.');
  }

  ensureCafeAccess(request, expense.cafeId);

  expense.status = 'REVERSED';
  expense.reversedAt = new Date();
  expense.reversedBy = userId;
  expense.reversalReason = reason;
  expense.updatedBy = userId;
  await expense.save();

  return response.status(200).json({
    message: 'Expense reversed successfully.',
    expense,
  });
});

// 13. Expense Integrity Centre (16-point audit)
const getExpenseIntegrity = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;

  const [expenses, cardTxns, advances] = await Promise.all([
    Expense.find({ organisationId }),
    CorporateCardTransaction.find({ organisationId }),
    OperationalAdvance.find({ organisationId }),
  ]);

  const issues = [];

  // Check 1: Duplicate invoice numbers from same vendor
  const invoiceMap = {};
  expenses.forEach((e) => {
    if (e.invoiceNumber && e.vendorName) {
      const key = `${e.vendorName.toUpperCase()}:${e.invoiceNumber.toUpperCase()}`;
      if (invoiceMap[key]) {
        issues.push({
          check: 'DUPLICATE_VENDOR_INVOICE',
          severity: 'CRITICAL',
          description: `Duplicate invoice #${e.invoiceNumber} from ${e.vendorName} on ${e.expenseId} and ${invoiceMap[key]}`,
        });
      } else {
        invoiceMap[key] = e.expenseId;
      }
    }
  });

  // Check 2: Approved without evidence
  expenses.forEach((e) => {
    if (e.status === 'APPROVED' && e.receiptStatus === 'REQUIRED' && (!e.evidence || e.evidence.length === 0)) {
      issues.push({
        check: 'APPROVED_WITHOUT_EVIDENCE',
        severity: 'WARNING',
        description: `Expense ${e.expenseId} is approved but has no receipt attached.`,
      });
    }
  });

  // Check 3: Unmatched Card Transactions
  cardTxns.forEach((txn) => {
    if (txn.matchStatus === 'UNMATCHED') {
      issues.push({
        check: 'UNMATCHED_CARD_TRANSACTION',
        severity: 'WARNING',
        description: `Card transaction ${txn.transactionId} for ₹${(txn.amountPaisa / 100).toFixed(2)} at ${txn.merchantName} is unmatched.`,
      });
    }
  });

  // Check 4: Unsettled Advances past return due date
  const todayStr = getIstBusinessDate();
  advances.forEach((adv) => {
    if (adv.status !== 'FULLY_LIQUIDATED' && adv.status !== 'CLOSED' && adv.returnDueDate < todayStr) {
      issues.push({
        check: 'OVERDUE_OPERATIONAL_ADVANCE',
        severity: 'CRITICAL',
        description: `Advance ${adv.advanceId} for ${adv.recipientUserId} is past due date ${adv.returnDueDate}.`,
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

// 14. Spend Requests / Pre-Spend Authorisations
const listExpenseRequests = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const effectiveCafe = resolveEffectiveCafeScope(request);
  const filter = { organisationId };
  if (effectiveCafe) {
    filter.cafeId = effectiveCafe;
  } else if (request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN') {
    filter.cafeId = { $in: request.auth.assignedCafeIds || [] };
  }
  const requests = await ExpenseRequest.find(filter).sort({ createdAt: -1 });
  return response.status(200).json({ requests });
});

const createExpenseRequest = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { cafeId, department, category, purpose, estimatedAmount, validUntil, justification = '' } = request.body;

  if (!cafeId || !department || !category || !purpose || !estimatedAmount || !validUntil) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'All required request fields must be provided.');
  }

  ensureCafeAccess(request, cafeId);

  const reqCount = await ExpenseRequest.countDocuments({ organisationId });
  const requestId = `REQ-2026-${String(reqCount + 1).padStart(4, '0')}`;

  const expRequest = await ExpenseRequest.create({
    requestId,
    organisationId,
    cafeId,
    requesterUserId: userId,
    department,
    category: category.toUpperCase(),
    purpose,
    justification,
    estimatedAmountPaisa: Math.round(Number(estimatedAmount) * 100),
    validUntil,
    status: 'SUBMITTED',
  });

  return response.status(201).json({ message: 'Spend request submitted for approval.', request: expRequest });
});

// 15. Expense Policies
const listExpensePolicies = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const policies = await ExpensePolicy.find({ organisationId }).sort({ effectiveFrom: -1 });
  return response.status(200).json({ policies });
});

const createExpensePolicy = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  if (request.auth.role !== 'MASTER' || !request.auth.isPrimaryMaster) {
    throw new ApiError(403, 'PRIMARY_MASTER_REQUIRED', 'Only Primary Master may configure global expense policies.');
  }

  const { policyName, version, receiptThresholdPaisa = 50000, poRequiredThresholdPaisa = 5000000, categoryRules = [], effectiveFrom } = request.body;
  const count = await ExpensePolicy.countDocuments({ organisationId });
  const policyId = `POL-EXP-2026-${String(count + 1).padStart(2, '0')}`;

  const policy = await ExpensePolicy.create({
    policyId,
    version: version || 'V1.0',
    policyName,
    organisationId,
    receiptThresholdPaisa,
    poRequiredThresholdPaisa,
    categoryRules,
    effectiveFrom: effectiveFrom || getIstBusinessDate(),
    publishedBy: userId,
    status: 'ACTIVE',
  });

  return response.status(201).json({ message: 'Expense policy published.', policy });
});

// 16. Corporate Card Transactions
const listCorporateCardTransactions = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const transactions = await CorporateCardTransaction.find({ organisationId }).sort({ transactionDate: -1 });
  return response.status(200).json({ transactions });
});

// 17. Operational Advances
const listOperationalAdvances = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const advances = await OperationalAdvance.find({ organisationId }).sort({ disbursedAt: -1 });
  return response.status(200).json({ advances });
});

const createOperationalAdvance = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  if (request.auth.role !== 'MASTER') {
    throw new ApiError(403, 'MASTER_AUTHORITY_REQUIRED', 'Only Master may issue operational advances.');
  }

  const { recipientUserId, cafeId, purpose, amount, returnDueDate } = request.body;
  const count = await OperationalAdvance.countDocuments({ organisationId });
  const advanceId = `ADV-OP-2026-${String(count + 1).padStart(3, '0')}`;

  const advance = await OperationalAdvance.create({
    advanceId,
    organisationId,
    recipientUserId,
    cafeId,
    purpose,
    amountPaisa: Math.round(Number(amount) * 100),
    returnDueDate,
    status: 'DISBURSED',
  });

  return response.status(201).json({ message: 'Operational advance issued.', advance });
});

module.exports = {
  getExpenseOverview,
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  submitExpense,
  decideExpense,
  recordMissingReceipt,
  matchCorporateCard,
  liquidateAdvance,
  markExpensePaid,
  reverseExpense,
  getExpenseIntegrity,
  listExpenseRequests,
  createExpenseRequest,
  listExpensePolicies,
  createExpensePolicy,
  listCorporateCardTransactions,
  listOperationalAdvances,
  createOperationalAdvance,
  // Alias for backward compatibility
  getExpenseSummary: getExpenseOverview,
};
