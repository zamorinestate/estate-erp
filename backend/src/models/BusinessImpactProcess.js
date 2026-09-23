'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — BUSINESS IMPACT ANALYSIS & PROCESS MODEL (STAGE 09)
 * ============================================================================
 * Defines critical business processes, RTO/RPO targets, dependencies,
 * and preserves the frozen financial invariant:
 * NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE.
 */

const mongoose = require('mongoose');

const CRITICALITY_TIERS = [
  'MISSION_CRITICAL',
  'BUSINESS_CRITICAL',
  'OPERATIONAL',
  'ADMINISTRATIVE',
];

const businessImpactProcessSchema = new mongoose.Schema(
  {
    processId: {
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
    processName: {
      type: String,
      required: true,
      trim: true,
    },
    criticalityTier: {
      type: String,
      enum: CRITICALITY_TIERS,
      default: 'BUSINESS_CRITICAL',
      index: true,
    },
    ownerRole: {
      type: String,
      required: true,
      trim: true,
    },
    maxAcceptableInterruptionMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    targetRtoMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    targetRpoMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    rtoRpoStatus: {
      type: String,
      default: 'TARGET_ESTABLISHED_PENDING_DRILL_PROOF',
    },
    financialImpactPerHourPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },
    foodSafetyImpactDescription: {
      type: String,
      trim: true,
      default: 'None',
    },
    dependencies: [
      {
        dependencyType: { type: String, trim: true }, // e.g. 'DATABASE', 'REDIS', 'NETWORK', 'POWER', 'SUPPLIER'
        entityName: { type: String, trim: true },
        isRedundant: { type: Boolean, default: false },
      },
    ],
    offlineFallbackMechanism: {
      type: String,
      trim: true,
      default: 'Paper order pad / draft cart buffer with manual operational queue',
    },
    offlineFinancialInvariant: {
      type: String,
      default: 'NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE. Offline draft orders cannot generate final GST invoices or ledger entries.',
    },
    lastReviewedDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: () => new Date().toISOString().split('T')[0],
    },
  },
  {
    timestamps: true,
    collection: 'business_impact_processes',
  }
);

businessImpactProcessSchema.index({ organisationId: 1, criticalityTier: 1 });

const BusinessImpactProcess =
  mongoose.models.BusinessImpactProcess ||
  mongoose.model('BusinessImpactProcess', businessImpactProcessSchema);

module.exports = {
  BusinessImpactProcess,
  CRITICALITY_TIERS,
};
