'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — ASSET BREAKDOWN LOG (STAGE 07)
 * ============================================================================
 * Authoritative governed breakdown lifecycle:
 * REPORTED -> TRIAGED -> ISOLATED -> REPAIRING -> TESTING -> RETURNED_TO_SERVICE -> CLOSED
 * Captures downtime, failure cause, repair costs, safety hold, and Food Safety review link.
 */

const mongoose = require('mongoose');

const BREAKDOWN_STATUSES = [
  'REPORTED',
  'TRIAGED',
  'ISOLATED',
  'REPAIRING',
  'TESTING',
  'RETURNED_TO_SERVICE',
  'CLOSED',
];

const ALLOWED_BREAKDOWN_TRANSITIONS = {
  REPORTED: ['TRIAGED'],
  TRIAGED: ['ISOLATED', 'REPAIRING'],
  ISOLATED: ['REPAIRING'],
  REPAIRING: ['TESTING'],
  TESTING: ['RETURNED_TO_SERVICE', 'REPAIRING'],
  RETURNED_TO_SERVICE: ['CLOSED'],
  CLOSED: [],
};

const assetBreakdownLogSchema = new mongoose.Schema(
  {
    breakdownId: {
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
    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    assetId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    failureDescription: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: BREAKDOWN_STATUSES,
      default: 'REPORTED',
      index: true,
    },
    downtimeMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    rootCause: {
      type: String,
      trim: true,
      default: '',
    },
    repairCostPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    partsCostPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    serviceVendorId: {
      type: String,
      trim: true,
      default: null,
    },
    safetyIsolationConfirmed: {
      type: Boolean,
      default: false,
    },
    foodSafetyRiskIdentified: {
      type: Boolean,
      default: false,
    },
    foodSafetyReviewCandidate: {
      isCandidate: { type: Boolean, default: false },
      linkedIncidentId: { type: String, trim: true, default: null },
      triageNotes: { type: String, trim: true, default: '' },
    },
    evidenceAttachmentId: {
      type: String,
      trim: true,
      default: null,
    },
    reportedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    closedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        fromStatus: { type: String, default: null },
        toStatus: { type: String, default: null },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'asset_breakdown_logs',
  }
);

assetBreakdownLogSchema.index({ organisationId: 1, cafeId: 1, status: 1 });
assetBreakdownLogSchema.index({ organisationId: 1, assetId: 1 });

const AssetBreakdownLog =
  mongoose.models.AssetBreakdownLog ||
  mongoose.model('AssetBreakdownLog', assetBreakdownLogSchema);

module.exports = {
  AssetBreakdownLog,
  BREAKDOWN_STATUSES,
  ALLOWED_BREAKDOWN_TRANSITIONS,
};
