'use strict';

/**
 * POS RECONCILIATION JOB — MONGOOSE MODEL (REC-04B)
 *
 * Persists durable reconciliation tasks for mandatory post-commit side effects
 * (BOM depletion, Cash ledger posting) when immediate processing fails.
 * Guarantees zero silent accounting or inventory divergence with:
 *  - Configurable retries (maxAttempts)
 *  - Exactly-once guards preventing double deductions / double postings
 *  - Escalation to MANUAL_REVIEW_REQUIRED
 *  - Operational alert triggering
 */

const mongoose = require('mongoose');

const RECONCILIATION_EFFECT_TYPES = ['BOM_DEPLETION', 'CASH_LEDGER'];

const RECONCILIATION_STATUSES = [
  'PENDING_RECONCILIATION',
  'IN_PROGRESS',
  'RESOLVED',
  'MANUAL_REVIEW_REQUIRED',
];

const posReconciliationJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
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
    billId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },
    effectType: {
      type: String,
      enum: RECONCILIATION_EFFECT_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RECONCILIATION_STATUSES,
      default: 'PENDING_RECONCILIATION',
      index: true,
    },
    expectedAmount: {
      type: Number,
      default: 0,
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    lastAttemptAt: {
      type: Date,
      default: Date.now,
    },
    nextRetryAt: {
      type: Date,
      default: Date.now,
    },
    lastErrorCode: {
      type: String,
      default: null,
      trim: true,
    },
    lastErrorMessage: {
      type: String,
      default: null,
      maxlength: 500,
    },
    payloadSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'pos_reconciliation_jobs',
  }
);

// Compound unique index ensuring only 1 job per bill per effect type
posReconciliationJobSchema.index(
  { organisationId: 1, billId: 1, effectType: 1 },
  { unique: true, name: 'org_bill_effect_unique' }
);

posReconciliationJobSchema.index(
  { organisationId: 1, cafeId: 1, status: 1, nextRetryAt: 1 },
  { name: 'org_cafe_status_retry' }
);

const PosReconciliationJob =
  mongoose.models.PosReconciliationJob ||
  mongoose.model('PosReconciliationJob', posReconciliationJobSchema);

module.exports = {
  PosReconciliationJob,
  RECONCILIATION_EFFECT_TYPES,
  RECONCILIATION_STATUSES,
};
