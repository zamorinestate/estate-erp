'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FORECAST MODEL (STAGE 03)
 * ============================================================================
 * Deterministic forward-looking financial forecasting with complete formula
 * lineage and source Actuals tracing.
 */

const mongoose = require('mongoose');

const forecastAssumptionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    value: { type: Number, required: true },
    unit: { type: String, default: 'PERCENT' },
  },
  { _id: false }
);

const forecastLineSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    forecastedAmountPaisa: { type: Number, required: true, default: 0 },
    runRateBasisPaisa: { type: Number, default: 0 },
    appliedMultiplier: { type: Number, default: 1.0 },
    calculationFormula: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const forecastModelSchema = new mongoose.Schema(
  {
    forecastId: {
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
    fiscalYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    forecastHorizonMonths: {
      type: Number,
      default: 12,
      min: 1,
      max: 36,
    },
    assumptions: {
      type: [forecastAssumptionSchema],
      default: [],
    },
    baselinePeriod: {
      from: { type: Date },
      to: { type: Date },
    },
    lines: {
      type: [forecastLineSchema],
      default: [],
    },
    totalForecastedPaisa: {
      type: Number,
      default: 0,
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

forecastModelSchema.index(
  { organisationId: 1, fiscalYear: 1, cafeId: 1, version: 1 },
  { unique: true }
);

const ForecastModel =
  mongoose.models.ForecastModel ||
  mongoose.model('ForecastModel', forecastModelSchema);

module.exports = {
  ForecastModel,
};
