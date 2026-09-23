'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — TRACEABILITY GAP REGISTER MODEL
 * ============================================================================
 * Tracks identified gaps in the farm-to-fork supply chain and recipe mapping,
 * preventing incomplete traceability from being treated as complete.
 */

const mongoose = require('mongoose');

const GAP_TYPES = [
  'MISSING_SUPPLIER_LOT',
  'UNMAPPED_RECIPE_INGREDIENT',
  'STOCK_BATCH_UNAVAILABLE',
  'MISSING_GRN_RELATIONSHIP',
  'SALE_RECIPE_MAPPING_INCOMPLETE',
  'RECEIVING_INSPECTION_MISSING',
];

const GAP_STATUSES = [
  'OPEN',
  'UNDER_INVESTIGATION',
  'REMEDIATION_SCHEDULED',
  'RESOLVED',
  'EXCEPTION_ACCEPTED',
];

const traceabilityGapSchema = new mongoose.Schema(
  {
    gapId: {
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
    cafeId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    gapType: {
      type: String,
      enum: GAP_TYPES,
      required: true,
      index: true,
    },
    affectedEntity: {
      entityType: { type: String, required: true }, // e.g., 'PO', 'GRN', 'RECIPE', 'INVENTORY_LOT', 'BILL'
      entityId: { type: String, required: true },
      title: { type: String, default: '' },
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    assignedOwnerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    remediationAction: {
      type: String,
      trim: true,
      default: '',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: GAP_STATUSES,
      default: 'OPEN',
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

traceabilityGapSchema.index(
  { organisationId: 1, gapId: 1 },
  { unique: true }
);

traceabilityGapSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 }
);

const TraceabilityGap =
  mongoose.models.TraceabilityGap ||
  mongoose.model('TraceabilityGap', traceabilityGapSchema);

module.exports = {
  TraceabilityGap,
  GAP_TYPES,
  GAP_STATUSES,
};
