'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — ENTERPRISE RISK REGISTER MODEL (STAGE 02)
 * ============================================================================
 * Central enterprise risk register capturing inherent vs residual risk,
 * configurable scoring methodologies, mitigations, and treatments.
 */

const mongoose = require('mongoose');

const RISK_DOMAINS = [
  'FINANCIAL',
  'CASH_TREASURY',
  'PROCUREMENT_SUPPLY',
  'PAYROLL_WORKFORCE',
  'FOOD_SAFETY_HYGIENE',
  'PEOPLE_OPERATIONS',
  'CYBERSECURITY_ACCESS',
  'PRIVACY_PII',
  'STATUTORY_COMPLIANCE',
  'ASSET_RELIABILITY',
  'BUSINESS_CONTINUITY',
  'BRAND_REPUTATION',
  'OPERATIONAL_EXCELLENCE',
  'OTHER',
];

const RISK_TREATMENTS = [
  'ACCEPT',
  'MITIGATE',
  'AVOID',
  'TRANSFER',
  'MONITOR',
];

const RISK_STATUSES = [
  'ACTIVE',
  'UNDER_REVIEW',
  'MITIGATED',
  'ACCEPTED',
  'RETIRED',
];

const enterpriseRiskSchema = new mongoose.Schema(
  {
    riskId: {
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
      default: null, // Null indicates portfolio/estate-wide risk
      index: true,
    },
    domain: {
      type: String,
      enum: RISK_DOMAINS,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    businessObjective: {
      type: String,
      trim: true,
      default: '',
    },
    // Inherent Risk (Before Controls)
    inherentLikelihood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    inherentImpact: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    inherentScore: {
      type: Number,
      required: true,
      min: 1,
      max: 25,
    },
    inherentSeverity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
    },
    // Existing Controls
    controlIds: {
      type: [String],
      default: [],
    },
    controlEffectivenessRating: {
      type: String,
      enum: ['STRONG', 'ADEQUATE', 'DEFICIENT', 'UNTESTED'],
      default: 'ADEQUATE',
    },
    // Residual Risk (After Controls)
    residualLikelihood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    residualImpact: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    residualScore: {
      type: Number,
      required: true,
      min: 1,
      max: 25,
    },
    residualSeverity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
      index: true,
    },
    riskOwnerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    reviewDate: {
      type: Date,
      required: true,
      index: true,
    },
    treatment: {
      type: String,
      enum: RISK_TREATMENTS,
      default: 'MITIGATE',
    },
    treatmentPlan: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: RISK_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    scoringMethodologyVersion: {
      type: String,
      default: '5X5_MATRIX_V1',
    },
    linkedIncidentIds: {
      type: [String],
      default: [],
    },
    linkedRecallIds: {
      type: [String],
      default: [],
    },
    linkedCapaIds: {
      type: [String],
      default: [],
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        previousScore: { type: Number },
        newScore: { type: Number },
        rationale: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

enterpriseRiskSchema.virtual('linkedStage01IncidentId').get(function () {
  return this.linkedIncidentIds && this.linkedIncidentIds.length > 0 ? this.linkedIncidentIds[0] : null;
});

enterpriseRiskSchema.virtual('linkedStage01CapaId').get(function () {
  return this.linkedCapaIds && this.linkedCapaIds.length > 0 ? this.linkedCapaIds[0] : null;
});

enterpriseRiskSchema.index(
  { organisationId: 1, riskId: 1 },
  { unique: true }
);

enterpriseRiskSchema.index(
  { organisationId: 1, residualSeverity: 1, status: 1 }
);

const EnterpriseRisk =
  mongoose.models.EnterpriseRisk ||
  mongoose.model('EnterpriseRisk', enterpriseRiskSchema);

module.exports = {
  EnterpriseRisk,
  RISK_DOMAINS,
  RISK_TREATMENTS,
  RISK_STATUSES,
};
