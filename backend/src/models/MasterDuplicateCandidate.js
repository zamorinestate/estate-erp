'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — MASTER DUPLICATE CANDIDATE & MERGE AUDIT (STAGE 10)
 * ============================================================================
 * Governed duplicate detection and merge workflow:
 * CANDIDATE -> REVIEW -> SURVIVOR_SELECTION -> IMPACT_ANALYSIS -> APPROVED -> MERGED / DISMISSED
 *
 * CRITICAL INVARIANTS:
 * - Zero automatic destructive merges. Human review required.
 * - Statutory & Financial Immutability: Historical invoices, payments, and journals
 *   are NEVER rewritten. Merges redirect through canonical alias records.
 */

const mongoose = require('mongoose');

const MERGE_STATUSES = [
  'CANDIDATE',
  'REVIEW',
  'SURVIVOR_SELECTION',
  'IMPACT_ANALYSIS',
  'APPROVED',
  'MERGED',
  'DISMISSED',
];

const ALLOWED_MERGE_TRANSITIONS = {
  CANDIDATE: ['REVIEW', 'DISMISSED'],
  REVIEW: ['SURVIVOR_SELECTION', 'DISMISSED'],
  SURVIVOR_SELECTION: ['IMPACT_ANALYSIS', 'DISMISSED'],
  IMPACT_ANALYSIS: ['APPROVED', 'DISMISSED'],
  APPROVED: ['MERGED', 'DISMISSED'],
  MERGED: [],
  DISMISSED: [],
};

const masterDuplicateCandidateSchema = new mongoose.Schema(
  {
    candidateId: {
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
    recordAId: {
      type: String,
      required: true,
      trim: true,
    },
    recordBId: {
      type: String,
      required: true,
      trim: true,
    },
    fieldsCompared: [
      {
        type: String,
        trim: true,
      },
    ],
    matchConfidencePercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    matchMethod: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: MERGE_STATUSES,
      default: 'CANDIDATE',
      index: true,
    },
    survivorRecordId: {
      type: String,
      trim: true,
      default: null,
    },
    retiredRecordId: {
      type: String,
      trim: true,
      default: null,
    },
    impactAnalysis: {
      affectedTransactionsCount: { type: Number, default: 0 },
      affectedPurchaseOrdersCount: { type: Number, default: 0 },
      affectedContractsCount: { type: Number, default: 0 },
      financialImmutabilityPreserved: { type: Boolean, default: true },
      aliasRedirectConfigured: { type: Boolean, default: false },
    },
    resolutionNotes: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
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
    collection: 'master_duplicate_candidates',
  }
);

masterDuplicateCandidateSchema.index({ organisationId: 1, domainCode: 1, status: 1 });

const MasterDuplicateCandidate =
  mongoose.models.MasterDuplicateCandidate ||
  mongoose.model('MasterDuplicateCandidate', masterDuplicateCandidateSchema);

module.exports = {
  MasterDuplicateCandidate,
  MERGE_STATUSES,
  ALLOWED_MERGE_TRANSITIONS,
};
