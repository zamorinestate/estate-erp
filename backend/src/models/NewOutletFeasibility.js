'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — NEW OUTLET FEASIBILITY MODEL (STAGE 03)
 * ============================================================================
 * Comprehensive feasibility modeling for proposed new outlets with transparent
 * formula lineage and 30/90/180-day actual tracking.
 */

const mongoose = require('mongoose');

const newOutletFeasibilitySchema = new mongoose.Schema(
  {
    feasibilityId: {
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
    outletName: {
      type: String,
      required: true,
      trim: true,
    },
    proposedLocation: {
      type: String,
      required: true,
      trim: true,
    },
    operatingDaysPerMonth: {
      type: Number,
      default: 30,
      min: 1,
      max: 31,
    },
    expectedBillsPerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    averageBillValuePaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyRentPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    securityDepositPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    initialCapexPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    staffingCount: {
      type: Number,
      default: 5,
      min: 1,
    },
    monthlyPayrollPaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    foodCostPercentage: {
      type: Number,
      default: 32, // 32% food cost default
      min: 0,
      max: 100,
    },
    monthlyUtilitiesPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    workingCapitalPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    calculatedMetrics: {
      monthlyRevenuePaisa: { type: Number, default: 0 },
      monthlyFoodCostPaisa: { type: Number, default: 0 },
      grossContributionPaisa: { type: Number, default: 0 },
      monthlyOperatingCostsPaisa: { type: Number, default: 0 },
      monthlyNetProfitPaisa: { type: Number, default: 0 },
      breakEvenBillsPerDay: { type: Number, default: 0 },
      paybackMonths: { type: Number, default: null },
      paybackStatus: { type: String, default: 'ACHIEVABLE' },
    },
    actualComparisons: {
      day30ActualRevenuePaisa: { type: Number, default: null },
      day90ActualRevenuePaisa: { type: Number, default: null },
      day180ActualRevenuePaisa: { type: Number, default: null },
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

newOutletFeasibilitySchema.index(
  { organisationId: 1, feasibilityId: 1 },
  { unique: true }
);

const NewOutletFeasibility =
  mongoose.models.NewOutletFeasibility ||
  mongoose.model('NewOutletFeasibility', newOutletFeasibilitySchema);

module.exports = {
  NewOutletFeasibility,
};
