'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — INTERNAL CONTROL LIBRARY MODEL (STAGE 02)
 * ============================================================================
 * Governs internal financial, food safety, inventory, and operational controls.
 * Captures preventive, detective, and corrective controls with effectiveness audits.
 */

const mongoose = require('mongoose');

const CONTROL_TYPES = [
  'PREVENTIVE',
  'DETECTIVE',
  'CORRECTIVE',
];

const CONTROL_FREQUENCIES = [
  'CONTINUOUS_AUTOMATED',
  'TRANSACTIONAL',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
];

const EFFECTIVENESS_STATUSES = [
  'EFFECTIVE',
  'PARTIALLY_EFFECTIVE',
  'DEFICIENT',
  'UNTESTED',
];

const controlLibraryItemSchema = new mongoose.Schema(
  {
    controlId: {
      type: String,
      required: true,
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
    domain: {
      type: String,
      required: true,
      trim: true,
    },
    controlObjective: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    controlType: {
      type: String,
      enum: CONTROL_TYPES,
      default: 'PREVENTIVE',
    },
    frequency: {
      type: String,
      enum: CONTROL_FREQUENCIES,
      default: 'DAILY',
    },
    controlOwnerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    evidenceRequirement: {
      type: String,
      required: true,
      trim: true,
    },
    applicableCafes: {
      type: [String],
      default: [], // Empty indicates estate-wide
    },
    relatedRiskIds: {
      type: [String],
      default: [],
    },
    lastTestedDate: {
      type: Date,
      default: null,
    },
    nextReviewDate: {
      type: Date,
      default: null,
    },
    effectiveness: {
      type: String,
      enum: EFFECTIVENESS_STATUSES,
      default: 'UNTESTED',
      index: true,
    },
    deficiencyNotes: {
      type: String,
      trim: true,
      default: '',
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

controlLibraryItemSchema.index(
  { organisationId: 1, controlId: 1 },
  { unique: true }
);

const ControlLibraryItem =
  mongoose.models.ControlLibraryItem ||
  mongoose.model('ControlLibraryItem', controlLibraryItemSchema);

module.exports = {
  ControlLibraryItem,
  CONTROL_TYPES,
  CONTROL_FREQUENCIES,
  EFFECTIVENESS_STATUSES,
};
