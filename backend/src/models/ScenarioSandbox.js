'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — SCENARIO SANDBOX MODEL (STAGE 03)
 * ============================================================================
 * What-If Sandbox environment for financial and operational sensitivity modeling.
 * INVARIANT: Scenarios NEVER post to the accounting ledger or overwrite Actuals.
 */

const mongoose = require('mongoose');

const scenarioSandboxSchema = new mongoose.Schema(
  {
    scenarioId: {
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
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    scenarioType: {
      type: String,
      enum: ['BASE', 'DOWNSIDE', 'UPSIDE', 'CUSTOM'],
      default: 'CUSTOM',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    assumptions: {
      revenueChangePct: { type: Number, default: 0 },
      priceChangePct: { type: Number, default: 0 },
      volumeChangePct: { type: Number, default: 0 },
      foodCostChangePct: { type: Number, default: 0 },
      supplierCostChangePct: { type: Number, default: 0 },
      wageChangePct: { type: Number, default: 0 },
      newStaffingCostPaisa: { type: Number, default: 0 },
      rentChangePaisa: { type: Number, default: 0 },
      utilityChangePct: { type: Number, default: 0 },
    },
    baselineValues: {
      revenuePaisa: { type: Number, default: 0 },
      foodCostPaisa: { type: Number, default: 0 },
      payrollPaisa: { type: Number, default: 0 },
      fixedCostPaisa: { type: Number, default: 0 },
      utilityCostPaisa: { type: Number, default: 0 },
    },
    projectedOutputs: {
      revenuePaisa: { type: Number, default: 0 },
      foodCostPaisa: { type: Number, default: 0 },
      payrollPaisa: { type: Number, default: 0 },
      utilityCostPaisa: { type: Number, default: 0 },
      totalCostPaisa: { type: Number, default: 0 },
      operatingContributionPaisa: { type: Number, default: 0 },
      grossContributionPaisa: { type: Number, default: 0 },
      operatingProfitPaisa: { type: Number, default: 0 },
      projectedCashFlowPaisa: { type: Number, default: 0 },
      breakEvenRevenuePaisa: { type: Number, default: 0 },
      breakEvenStatus: { type: String, default: 'ACHIEVABLE' },
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
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

scenarioSandboxSchema.index(
  { organisationId: 1, scenarioId: 1 },
  { unique: true }
);

const ScenarioSandbox =
  mongoose.models.ScenarioSandbox ||
  mongoose.model('ScenarioSandbox', scenarioSandboxSchema);

module.exports = {
  ScenarioSandbox,
};
