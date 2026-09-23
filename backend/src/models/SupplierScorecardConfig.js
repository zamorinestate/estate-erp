'use strict';

const mongoose = require('mongoose');

const supplierScorecardConfigSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    evaluationPeriodDays: {
      type: Number,
      default: 90, // e.g. 90-day rolling performance window
    },
    // Configurable weights (must sum to 100)
    weights: {
      qualityWeight: { type: Number, default: 30, min: 0, max: 100 },
      deliveryWeight: { type: Number, default: 25, min: 0, max: 100 },
      priceCompetitivenessWeight: { type: Number, default: 20, min: 0, max: 100 },
      complianceWeight: { type: Number, default: 15, min: 0, max: 100 },
      responsivenessWeight: { type: Number, default: 10, min: 0, max: 100 },
    },
    missingDataStrategy: {
      type: String,
      enum: ['EXCLUDE_COMPONENT_PRO_RATA', 'MARK_UNAVAILABLE', 'DEFAULT_NEUTRAL'],
      default: 'EXCLUDE_COMPONENT_PRO_RATA',
    },
    formulaDescription: {
      type: String,
      default: 'Weighted score = sum(component_score * weight) / sum(available_weights)',
    },
    updatedBy: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
  }
);

supplierScorecardConfigSchema.index({ organisationId: 1, isActive: 1 });

const SupplierScorecardConfig = mongoose.model(
  'SupplierScorecardConfig',
  supplierScorecardConfigSchema
);

module.exports = { SupplierScorecardConfig };
