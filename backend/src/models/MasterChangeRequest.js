'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — MASTER CHANGE REQUEST MODEL (STAGE 10)
 * ============================================================================
 * Governs high-risk field changes (GSTIN, supplier banking, PAN, legal entity names)
 * through mandatory dual maker-checker authorization and audit logging.
 */

const mongoose = require('mongoose');

const CHANGE_REQUEST_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'APPLIED',
];

const masterChangeRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    domainCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    recordId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    fieldName: {
      type: String,
      required: true,
      trim: true,
    },
    currentValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    proposedValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    isSensitiveField: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: CHANGE_REQUEST_STATUSES,
      default: 'PENDING_APPROVAL',
      index: true,
    },
    requestedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    approvedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvalNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'master_change_requests',
  }
);

masterChangeRequestSchema.index({ organisationId: 1, domainCode: 1, status: 1 });

const MasterChangeRequest =
  mongoose.models.MasterChangeRequest ||
  mongoose.model('MasterChangeRequest', masterChangeRequestSchema);

module.exports = {
  MasterChangeRequest,
  CHANGE_REQUEST_STATUSES,
};
