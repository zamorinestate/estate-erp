'use strict';

const mongoose = require('mongoose');

const paymentRunSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    paymentRunId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    runDate: {
      type: String,
      required: true,
      index: true,
    },
    bankAccountId: {
      type: String,
      required: true,
      trim: true,
    },
    totalAmountPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    itemCount: {
      type: Number,
      required: true,
      min: 1,
    },
    selectedInvoiceIds: {
      type: [String],
      required: true,
      default: [],
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'EXECUTED',
        'VOIDED',
      ],
      default: 'DRAFT',
      index: true,
    },
    makerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    checkerUserId: {
      type: String,
      trim: true,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    executedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    executionReference: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE'],
      default: 'BANK_TRANSFER',
    },
  },
  {
    timestamps: true,
  }
);

paymentRunSchema.index(
  { organisationId: 1, paymentRunId: 1 },
  { unique: true }
);

const PaymentRun =
  mongoose.models.PaymentRun || mongoose.model('PaymentRun', paymentRunSchema);

module.exports = {
  PaymentRun,
};
