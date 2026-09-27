'use strict';

/**
 * STAFF LOAN & ADVANCE — MONGOOSE MODEL (SCR-014)
 *
 * Canonical model for Employee Loans and Salary Advances.
 * Manages principal, interest policy, tenures, instalments, arrears,
 * statutory deduction references, and comprehensive lifecycle states.
 */

const mongoose = require('mongoose');

const LOAN_ADVANCE_TYPES = ['LOAN', 'SALARY_ADVANCE'];

const LOAN_CATEGORIES = [
  'WELFARE',
  'EMERGENCY',
  'MEDICAL',
  'EDUCATION',
  'HOUSING',
  'GENERAL',
  'SALARY_ADVANCE',
];

const LOAN_ADVANCE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'MORE_INFO_REQUIRED',
  'APPROVED',
  'DISBURSEMENT_PENDING',
  'DISBURSED',
  'ACTIVE',
  'PAUSED',
  'IN_ARREARS',
  'SETTLEMENT_PENDING',
  'REPAID',
  'CLOSED',
  'REJECTED',
  'WITHDRAWN',
  'CANCELLED',
];

const INTEREST_METHODS = ['INTEREST_FREE', 'FIXED', 'REDUCING_BALANCE'];

function createPaiseField({ required = false, positive = false, defaultValue = 0 } = {}) {
  return {
    type: Number,
    required,
    default: defaultValue,
    min: 0,
    validate: {
      validator(value) {
        return Number.isSafeInteger(value) && (!positive || value > 0);
      },
      message: 'Money values must be safe integer amounts in paise.',
    },
  };
}

const staffLoanAdvanceSchema = new mongoose.Schema(
  {
    loanAdvanceId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^(LN|ADV)-\d{4,}/,
      index: true,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      default: 'ZAMORIN',
      index: true,
    },

    cafeId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    employeeUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    employeeName: {
      type: String,
      trim: true,
      default: '',
    },

    requestType: {
      type: String,
      required: true,
      immutable: true,
      enum: LOAN_ADVANCE_TYPES,
      default: 'LOAN',
      index: true,
    },

    loanCategory: {
      type: String,
      enum: LOAN_CATEGORIES,
      default: 'WELFARE',
    },

    requestedAmountPaise: createPaiseField({ required: true, positive: true }),
    approvedAmountPaise: createPaiseField({ defaultValue: 0 }),
    disbursedAmountPaise: createPaiseField({ defaultValue: 0 }),

    principalPaise: createPaiseField({ defaultValue: 0 }),
    outstandingPrincipalPaise: createPaiseField({ defaultValue: 0 }),
    outstandingInterestPaise: createPaiseField({ defaultValue: 0 }),
    arrearsPaise: createPaiseField({ defaultValue: 0 }),
    totalRepaidPaise: createPaiseField({ defaultValue: 0 }),

    interestMethod: {
      type: String,
      enum: INTEREST_METHODS,
      default: 'INTEREST_FREE',
    },

    annualInterestRatePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    tenureMonths: {
      type: Number,
      default: 1,
      min: 1,
      max: 60,
    },

    monthlyInstalmentPaise: createPaiseField({ defaultValue: 0 }),

    requestReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    status: {
      type: String,
      required: true,
      enum: LOAN_ADVANCE_STATUSES,
      default: 'SUBMITTED',
      index: true,
    },

    policyVersion: {
      type: String,
      default: 'POL-LOAN-2026-V1',
    },

    deductionReference: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    currency: {
      type: String,
      default: 'INR',
      immutable: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    disbursedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    approvedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    disbursedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    disbursementDetails: {
      paymentMethod: { type: String, default: 'BANK_TRANSFER' },
      bankTransactionRef: { type: String, default: null },
      disbursementAccountRef: { type: String, default: null },
    },

    pauseDetails: {
      isPaused: { type: Boolean, default: false },
      pauseFromPeriod: { type: String, default: null },
      resumePeriod: { type: String, default: null },
      pauseReason: { type: String, default: null },
      approvedByUserId: { type: String, default: null },
      approvedAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null },
      notes: { type: String, default: null },
      rejectionReason: { type: String, default: null },
    },

    settlementDetails: {
      isSettled: { type: Boolean, default: false },
      settlementRequested: { type: Boolean, default: false },
      settlementRequestedAt: { type: Date, default: null },
      settlementQuotePaise: { type: Number, default: 0 },
      settledAmountPaise: { type: Number, default: 0 },
      settledAt: { type: Date, default: null },
      paymentRef: { type: String, default: null },
      paymentMode: { type: String, default: null },
      notes: { type: String, default: null },
      noDueCertificateGenerated: { type: Boolean, default: false },
    },

    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    createdByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    updatedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    optimisticConcurrency: true,
    collection: 'staff_loans_advances',
  }
);

staffLoanAdvanceSchema.index({ organisationId: 1, employeeUserId: 1, status: 1 });

const StaffLoanAdvance =
  mongoose.models.StaffLoanAdvance || mongoose.model('StaffLoanAdvance', staffLoanAdvanceSchema);

module.exports = {
  StaffLoanAdvance,
  LOAN_ADVANCE_TYPES,
  LOAN_CATEGORIES,
  LOAN_ADVANCE_STATUSES,
  INTEREST_METHODS,
};
