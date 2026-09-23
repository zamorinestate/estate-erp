'use strict';

const mongoose = require('mongoose');

const complianceObligationSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    cafeId: {
      type: String,
      default: null,
      index: true,
    },
    obligationId: {
      type: String,
      required: true,
      unique: false, // Tenant-scoped uniqueness enforced in index
    },
    domain: {
      type: String,
      required: true,
      enum: [
        'FOOD_SAFETY',
        'LABOUR_EMPLOYMENT',
        'TAX_FINANCE',
        'MUNICIPAL_TRADE',
        'FIRE_SAFETY',
        'ENVIRONMENTAL',
        'CONTRACTUAL',
        'DATA_PRIVACY',
        'OTHER',
      ],
      default: 'OTHER',
    },
    authority: {
      type: String,
      required: true,
      trim: true,
    },
    jurisdiction: {
      type: String,
      default: 'India / Kerala',
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    reference: {
      type: String,
      default: '',
      trim: true,
    },
    requirementSummary: {
      type: String,
      required: true,
      trim: true,
    },
    applicability: {
      type: String,
      enum: ['APPLICABLE', 'NOT_APPLICABLE', 'CONDITIONALLY_APPLICABLE'],
      default: 'APPLICABLE',
    },
    applicableEntity: {
      type: String,
      default: 'ZAMORIN_CAFE_LLP',
    },
    applicableCafes: {
      type: [String],
      default: [],
    },
    responsibleRole: {
      type: String,
      default: 'OWNER',
    },
    responsibleUserId: {
      type: String,
      default: null,
    },
    recurrence: {
      type: String,
      enum: ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'EVENT_DRIVEN', 'CONTINUOUS'],
      default: 'ANNUAL',
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    futureCommencementDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    evidenceRequirements: {
      type: String,
      default: '',
    },
    riskClassification: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: [
        'NOT_ASSESSED',
        'APPLICABLE',
        'NOT_APPLICABLE',
        'UPCOMING',
        'ACTION_REQUIRED',
        'EVIDENCE_PENDING',
        'COMPLETED',
        'OVERDUE',
        'UNDER_REVIEW',
      ],
      default: 'NOT_ASSESSED',
    },
    linkedLicenceId: {
      type: String,
      default: null,
    },
    linkedContractId: {
      type: String,
      default: null,
    },
    linkedInsuranceId: {
      type: String,
      default: null,
    },
    linkedRiskId: {
      type: String,
      default: null,
    },
    documents: [
      {
        documentId: { type: String, required: true },
        title: { type: String, default: 'Evidence' },
        mimeType: { type: String, default: 'application/pdf' },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: String },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

complianceObligationSchema.index({ organisationId: 1, obligationId: 1 }, { unique: true });
complianceObligationSchema.index({ organisationId: 1, status: 1 });
complianceObligationSchema.index({ organisationId: 1, domain: 1 });

const ComplianceObligation = mongoose.model('ComplianceObligation', complianceObligationSchema);

module.exports = { ComplianceObligation };
