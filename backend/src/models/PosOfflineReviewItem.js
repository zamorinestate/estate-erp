'use strict';

/**
 * POS OFFLINE REVIEW ITEM — MONGOOSE MODEL (REC-13A)
 *
 * Persists offline-captured POS transactions that require authorized review before
 * financial finalization (e.g. originating operator disabled/terminated, pricing conflict,
 * café operational state changes).
 *
 * Preserves immutable client capture evidence while enforcing server-governed authorization:
 * - Review actions: APPROVE_AND_FINALIZE, REJECT, ESCALATE
 * - Strict role enforcement: Assigned CAFE_ADMIN, MASTER, OWNER (STAFF strictly denied)
 * - Strict cross-café isolation (Foreign Café Admin denied with 403)
 * - Separate tracking of originating cashier vs reviewer identity
 * - Exactly-once finalization via canonical REC-04B PosOrderService pipeline
 */

const mongoose = require('mongoose');

const OFFLINE_REVIEW_STATUSES = [
  'PENDING_REVIEW',
  'APPROVING',
  'APPROVED_FINALIZED',
  'REJECTED',
  'ESCALATED',
];

const posOfflineReviewItemSchema = new mongoose.Schema(
  {
    reviewId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    saleAttemptId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    clientOfflineId: {
      type: String,
      required: true,
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
    originatingUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    originatingShiftId: {
      type: String,
      trim: true,
      default: null,
    },
    originatingDeviceId: {
      type: String,
      trim: true,
      default: '',
    },
    capturedAtClient: {
      type: Date,
      required: true,
    },
    serverReceivedAt: {
      type: Date,
      default: Date.now,
    },
    catalogVersion: {
      type: String,
      default: null,
      trim: true,
    },
    totalPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
      trim: true,
      default: 'CASH',
    },
    reviewReason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: OFFLINE_REVIEW_STATUSES,
      default: 'PENDING_REVIEW',
      index: true,
    },
    payloadSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Audit of review decision
    reviewedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    reviewedByRole: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    reviewDecision: {
      type: String,
      enum: ['APPROVE_AND_FINALIZE', 'REJECT', 'ESCALATE', null],
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    finalizedBillId: {
      type: String,
      trim: true,
      default: null,
    },
    finalizedInvoiceNumber: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'pos_offline_review_items',
  }
);

// Compound unique index ensuring only 1 review record per saleAttemptId per cafe
posOfflineReviewItemSchema.index(
  { organisationId: 1, cafeId: 1, saleAttemptId: 1 },
  { unique: true, name: 'org_cafe_sale_attempt_review_unique' }
);

posOfflineReviewItemSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 },
  { name: 'org_cafe_status' }
);

const PosOfflineReviewItem =
  mongoose.models.PosOfflineReviewItem ||
  mongoose.model('PosOfflineReviewItem', posOfflineReviewItemSchema);

module.exports = {
  PosOfflineReviewItem,
  OFFLINE_REVIEW_STATUSES,
};
