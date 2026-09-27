'use strict';

/**
 * APPROVAL — MONGOOSE MODEL
 */

const mongoose = require('mongoose');

const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const approvalSchema = new mongoose.Schema(
  {
    approvalId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^APP-\d{4,}$/,
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

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    entityId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    requestingUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    actionRequired: {
      type: String,
      required: true,
      trim: true,
    },

    amountPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: APPROVAL_STATUSES,
      default: 'PENDING',
      index: true,
    },

    decidedByUserId: {
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

    decidedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    collection: 'approvals',
  }
);

approvalSchema.index(
  { organisationId: 1, status: 1 },
  { name: 'org_status' }
);

approvalSchema.index(
  { organisationId: 1, entityType: 1, entityId: 1 },
  { unique: true, name: 'org_entity_unique' }
);

approvalSchema.pre('validate', function normaliseApprovalFields() {
  const upperFields = ['approvalId', 'organisationId', 'cafeId', 'entityType', 'entityId', 'requestingUserId', 'decidedByUserId'];
  for (const field of upperFields) {
    if (this[field] && typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }
  if (this.status) this.status = this.status.trim().toUpperCase();
});

const Approval =
  mongoose.models.Approval ||
  mongoose.model('Approval', approvalSchema);

module.exports = {
  Approval,
  APPROVAL_STATUSES,
};
