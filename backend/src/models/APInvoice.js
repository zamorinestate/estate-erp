'use strict';

const mongoose = require('mongoose');

const apInvoiceSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    invoiceId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    vendorId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vendorName: {
      type: String,
      required: true,
      trim: true,
    },
    rawSupplierInvoiceNumber: {
      type: String,
      trim: false,
    },
    supplierInvoiceNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
      set: function (val) {
        if (typeof val === 'string' && this && typeof this === 'object') {
          if (!this.rawSupplierInvoiceNumber) {
            this.rawSupplierInvoiceNumber = val;
          }
          return val.trim().toUpperCase();
        }
        return val;
      },
    },
    invoiceDate: {
      type: String,
      required: true,
      index: true,
    },
    dueDate: {
      type: String,
      required: true,
      index: true,
    },
    amountPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    taxPaisa: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    // ── Three-Value Financial Architecture ──
    supplierClaimedAmountPaisa: {
      type: Number,
      min: 0,
      default: function () {
        return this.totalPaisa || 0;
      },
    },
    approvedPayableAmountPaisa: {
      type: Number,
      min: 0,
      default: function () {
        return this.totalPaisa || 0;
      },
    },
    heldDisputedAmountPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    paidPaisa: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    amountPaidPaisa: {
      type: Number,
      min: 0,
      default: function () {
        return this.paidPaisa || 0;
      },
    },
    appliedAdvancePaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    appliedCreditPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    outstandingPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    outstandingPayableAmountPaisa: {
      type: Number,
      min: 0,
      default: function () {
        return this.outstandingPaisa !== undefined ? this.outstandingPaisa : (this.totalPaisa || 0);
      },
    },
    outstandingBalancePaisa: {
      type: Number,
      min: 0,
      default: function () {
        return this.outstandingPayableAmountPaisa !== undefined ? this.outstandingPayableAmountPaisa : (this.totalPaisa || 0);
      },
    },
    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      index: true,
    },
    poReferenceId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    grnIds: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    businessDocumentId: {
      type: String,
      trim: true,
      default: null,
    },
    lineItems: [
      {
        itemId: { type: String, trim: true, uppercase: true },
        itemName: { type: String, trim: true, default: '' },
        invoiceQuantity: { type: Number, min: 0, default: 0 },
        acceptedQuantity: { type: Number, min: 0, default: 0 },
        rejectedQuantity: { type: Number, min: 0, default: 0 },
        unitPricePaisa: { type: Number, min: 0, default: 0 },
        lineTotalPaisa: { type: Number, min: 0, default: 0 },
        payableAmountPaisa: { type: Number, min: 0, default: 0 },
        disputeReason: { type: String, trim: true, default: '' },
      },
    ],
    expenseReferenceId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    validationStatus: {
      type: String,
      enum: ['INCOMPLETE', 'VALIDATED'],
      default: 'VALIDATED',
    },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    accountingStatus: {
      type: String,
      enum: ['UNACCOUNTED', 'POSTED'],
      default: 'UNACCOUNTED',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: [
        'NOT_DUE',
        'DUE',
        'PARTIALLY_PAID',
        'PAID',
        'OVERDUE',
        'ON_HOLD',
        'DISPUTED',
        'CREDIT_PENDING',
        'CANCELLED',
        'UNPAID',
        'SCHEDULED',
      ],
      default: 'UNPAID',
      index: true,
    },
    paymentHistory: [
      {
        paymentId: { type: String, required: true },
        paidPaisa: { type: Number, required: true },
        paidAt: { type: Date, default: Date.now },
        paidByUserId: { type: String, required: true },
        paymentMethod: { type: String, default: 'BANK_TRANSFER' },
        reference: { type: String, default: '' },
      },
    ],
    gstMonitoring: {
      isGstApplicable: { type: Boolean, default: true },
      invoiceDate: { type: String, default: null },
      daysSinceInvoice: { type: Number, default: 0 },
      unpaidProportionPaisa: { type: Number, default: 0 },
      is180DayRisk: { type: Boolean, default: false },
      riskCategory: {
        type: String,
        enum: ['NONE', 'APPROACHING_165_DAYS', 'APPROACHING_175_DAYS', 'OVERDUE_180_DAYS'],
        default: 'NONE',
      },
    },
    holds: [
      {
        holdCode: { type: String, required: true },
        reason: { type: String, required: true },
        placedAt: { type: Date, default: Date.now },
        placedBy: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

apInvoiceSchema.methods.recalculateOutstanding = function () {
  const approved = Number(this.approvedPayableAmountPaisa !== undefined ? this.approvedPayableAmountPaisa : this.totalPaisa) || 0;
  const paid = Number(this.paidPaisa || 0);
  const adv = Number(this.appliedAdvancePaisa || 0);
  const cred = Number(this.appliedCreditPaisa || 0);
  const netOutstanding = Math.max(0, approved - paid - adv - cred);

  this.outstandingPayableAmountPaisa = netOutstanding;
  this.outstandingPaisa = netOutstanding;
  this.outstandingBalancePaisa = netOutstanding;
  this.amountPaidPaisa = paid;

  const activeHolds = (this.holds || []).filter(h => !h.releasedAt);
  if (activeHolds.length > 0) {
    this.paymentStatus = 'ON_HOLD';
  } else if (netOutstanding === 0 && (paid > 0 || adv > 0 || cred > 0)) {
    this.paymentStatus = 'PAID';
  } else if (paid > 0 || adv > 0 || cred > 0) {
    this.paymentStatus = 'PARTIALLY_PAID';
  } else {
    this.paymentStatus = 'DUE';
  }

  return netOutstanding;
};

apInvoiceSchema.pre('validate', function (next) {
  if (this.supplierInvoiceNumber) {
    if (!this.rawSupplierInvoiceNumber) {
      this.rawSupplierInvoiceNumber = this.supplierInvoiceNumber;
    }
    this.supplierInvoiceNumber = this.supplierInvoiceNumber.trim().toUpperCase();
  }
  if (typeof this.recalculateOutstanding === 'function') {
    this.recalculateOutstanding();
  }
  if (typeof next === 'function') next();
});

apInvoiceSchema.index(
  { organisationId: 1, invoiceId: 1 },
  { unique: true }
);

apInvoiceSchema.index(
  { organisationId: 1, vendorId: 1, supplierInvoiceNumber: 1 },
  { unique: true, name: 'org_vendor_invoice_unique' }
);

apInvoiceSchema.index(
  { organisationId: 1, vendorName: 1, supplierInvoiceNumber: 1 },
  { unique: true }
);

const APInvoice =
  mongoose.models.APInvoice || mongoose.model('APInvoice', apInvoiceSchema);

module.exports = {
  APInvoice,
};
