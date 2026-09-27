'use strict';

const mongoose = require('mongoose');

const EXPENSE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'RETURNED',
  'APPROVED',
  'REJECTED',
  'PAID',
  'REVERSED',
  'CANCELLED',
  'CLOSED',
  'ARCHIVED',
];

const EXPENSE_TYPES = [
  'COMPANY_PAID',
  'EMPLOYEE_REIMBURSEMENT',
  'PETTY_CASH',
  'CORPORATE_CARD',
  'EMERGENCY_NON_PO',
  'OPERATIONAL_ADVANCE',
  'RECURRING',
  'IMPORTED',
];

const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'UPI',
  'BANK_TRANSFER',
  'WALLET',
  'CREDIT',
  'COMPANY_BANK_UPI',
  'PETTY_CASH',
  'CORPORATE_CARD',
  'EMPLOYEE_FUNDS',
  'OPERATIONAL_ADVANCE',
];

const RECEIPT_STATUSES = [
  'NOT_REQUIRED',
  'REQUIRED',
  'ATTACHED',
  'VERIFIED',
  'MISSING',
  'WAIVED',
  'INVALID',
];

const AUDIT_STATUSES = [
  'NOT_REQUIRED',
  'SELECTED',
  'UNDER_REVIEW',
  'CLEARED',
  'EXCEPTION',
];

const FINANCE_STATUSES = [
  'NOT_SENT',
  'AWAITING_FINANCE',
  'POSTED',
  'PAYMENT_PENDING',
  'PAID',
  'REIMBURSED',
  'ON_HOLD',
  'REVERSED',
];

const expenseItemSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amountPaisa: {
      type: Number,
      required: true,
      min: 1,
    },
    taxPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPaisa: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const expenseAllocationSchema = new mongoose.Schema(
  {
    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    department: {
      type: String,
      trim: true,
      default: 'Operations',
    },
    costCentre: {
      type: String,
      trim: true,
      default: '',
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    amountPaisa: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const expenseEvidenceSchema = new mongoose.Schema(
  {
    documentId: {
      type: String,
      required: true,
      trim: true,
    },
    documentType: {
      type: String,
      enum: ['RECEIPT', 'TAX_INVOICE', 'PAYMENT_PROOF', 'DELIVERY_NOTE', 'MAINTENANCE_REPORT', 'SUPPORTING_NOTE'],
      default: 'RECEIPT',
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    fileHash: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    uploadedBy: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    expenseId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^EX-\d{8}-\d{4,}$/,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    expenseType: {
      type: String,
      enum: EXPENSE_TYPES,
      default: 'COMPANY_PAID',
      index: true,
    },

    ownerUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    preparerUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
      index: true,
    },

    purpose: {
      type: String,
      trim: true,
      maxlength: 500,
      default: 'Café Operations',
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    amountPaisa: {
      type: Number,
      min: 1,
      default: function () {
        return Math.round(this.amount * 100);
      },
    },

    taxPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPaisa: {
      type: Number,
      default: function () {
        return this.amountPaisa + this.taxPaisa;
      },
    },

    currency: {
      type: String,
      immutable: true,
      enum: ['INR'],
      default: 'INR',
    },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: 'CASH',
    },

    paymentSource: {
      type: String,
      enum: ['COMPANY_BANK_UPI', 'CASH', 'PETTY_CASH', 'CORPORATE_CARD', 'EMPLOYEE_FUNDS', 'OPERATIONAL_ADVANCE'],
      default: 'CASH',
    },

    vendorName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 150,
      default: '',
    },

    receiptUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    receiptStatus: {
      type: String,
      enum: RECEIPT_STATUSES,
      default: 'ATTACHED',
      index: true,
    },

    missingReceipt: {
      isDeclared: { type: Boolean, default: false },
      reason: { type: String, trim: true, default: '' },
      explanation: { type: String, trim: true, default: '' },
      waiverApprovedBy: { type: String, trim: true, default: null },
      waiverApprovedAt: { type: Date, default: null },
    },

    evidence: {
      type: [expenseEvidenceSchema],
      default: [],
    },

    items: {
      type: [expenseItemSchema],
      default: [],
    },

    allocations: {
      type: [expenseAllocationSchema],
      default: [],
    },

    gstDetails: {
      supplierGstin: { type: String, trim: true, uppercase: true, default: '' },
      invoiceNumber: { type: String, trim: true, uppercase: true, default: '' },
      invoiceDate: { type: String, trim: true, default: '' },
      placeOfSupply: { type: String, trim: true, default: '32-Kerala' },
      taxableAmountPaisa: { type: Number, default: 0 },
      cgstPaisa: { type: Number, default: 0 },
      sgstPaisa: { type: Number, default: 0 },
      igstPaisa: { type: Number, default: 0 },
      reverseCharge: { type: Boolean, default: false },
    },

    relatedRecords: {
      spendRequestId: { type: String, trim: true, default: null },
      poNumber: { type: String, trim: true, default: null },
      inventoryReceiptId: { type: String, trim: true, default: null },
      assetId: { type: String, trim: true, default: null },
      workOrderId: { type: String, trim: true, default: null },
      departmentOrderId: { type: String, trim: true, default: null },
      cardTransactionId: { type: String, trim: true, default: null },
      advanceId: { type: String, trim: true, default: null },
    },

    personalPortionPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },

    policySnapshot: {
      policyVersion: { type: String, default: 'V1.0' },
      rulesEvaluated: { type: [String], default: [] },
      exceptions: { type: [String], default: [] },
      status: { type: String, default: 'COMPLIANT' },
    },

    approvalSnapshot: {
      version: { type: Number, default: 1 },
      approvedAt: { type: Date, default: null },
      approvedBy: { type: String, trim: true, default: null },
      approvedAmountPaisa: { type: Number, default: 0 },
      reason: { type: String, trim: true, default: '' },
    },

    auditState: {
      status: { type: String, enum: AUDIT_STATUSES, default: 'NOT_REQUIRED' },
      selectedReason: { type: String, trim: true, default: '' },
      reviewedBy: { type: String, trim: true, default: null },
      reviewedAt: { type: Date, default: null },
      notes: { type: String, trim: true, default: '' },
    },

    financeHandoff: {
      status: { type: String, enum: FINANCE_STATUSES, default: 'NOT_SENT', index: true },
      sentAt: { type: Date, default: null },
      apRecordId: { type: String, trim: true, default: null },
      postingStatus: { type: String, trim: true, default: 'PENDING' },
      paymentStatus: { type: String, trim: true, default: 'UNPAID' },
      correlationId: { type: String, trim: true, default: null },
      holdReason: { type: String, trim: true, default: '' },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    status: {
      type: String,
      required: true,
      enum: EXPENSE_STATUSES,
      default: 'DRAFT',
      index: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    submittedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    decisionAt: {
      type: Date,
      default: null,
    },

    decisionBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    decisionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    paidAt: {
      type: Date,
      default: null,
    },

    paidBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    paymentReference: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 200,
      default: '',
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    reversedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    reversalReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    timezone: {
      type: String,
      immutable: true,
      default: 'Asia/Kolkata',
    },

    createdBy: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    updatedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
    collection: 'expenses',
  }
);

expenseSchema.index(
  { organisationId: 1, cafeId: 1, businessDate: 1, status: 1 },
  { name: 'expense_cafe_date_status' }
);

expenseSchema.index(
  { organisationId: 1, status: 1, submittedAt: -1 },
  { name: 'expense_org_status_submitted' }
);

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = {
  Expense,
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  RECEIPT_STATUSES,
  AUDIT_STATUSES,
  FINANCE_STATUSES,
};