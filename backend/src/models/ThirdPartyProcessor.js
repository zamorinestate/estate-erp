'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — THIRD-PARTY PROCESSOR REGISTER (STAGE 08)
 * ============================================================================
 * Governance of data processors, service contracts, data storage geographies,
 * cross-border transfers (DPDP Rule 15 readiness), and exit/deletion obligations.
 *
 * IMPORTANT DPDP COMPLIANCE NOTE:
 * The DPDP Act does NOT impose a blanket localisation rule requiring all
 * processing in domestic/MeitY data centres. Cross-border transfers are
 * governed based on Central Government notifications and restrictions.
 */

const mongoose = require('mongoose');

const thirdPartyProcessorSchema = new mongoose.Schema(
  {
    processorId: {
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
    providerName: {
      type: String,
      required: true,
      trim: true,
    },
    serviceDescription: {
      type: String,
      required: true,
      trim: true,
    },
    dataCategoriesProcessed: [
      {
        type: String,
        trim: true,
      },
    ],
    purpose: {
      type: String,
      required: true,
      trim: true,
    },
    contractReference: {
      type: String,
      trim: true,
      default: '',
    },
    securityReviewDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
    },
    // Backward-compatible geography field
    dataStorageGeography: {
      type: String,
      trim: true,
      default: 'India',
    },
    // Cross-border transfer governance fields (Requirements #44-#48)
    processingCountry: {
      type: String,
      trim: true,
      default: 'India',
    },
    storageCountry: {
      type: String,
      trim: true,
      default: 'India',
    },
    transferDestination: {
      type: String,
      trim: true,
      default: '',
    },
    isCrossBorder: {
      type: Boolean,
      default: false,
    },
    applicableRestriction: {
      type: String,
      trim: true,
      default: 'NONE', // 'NONE', 'SECTORAL_RESTRICTION', 'CENTRAL_GOVERNMENT_ORDER', 'SPECIAL_LOCALISATION'
    },
    foreignStateControlRelationship: {
      type: String,
      trim: true,
      default: 'NONE',
    },
    centralGovernmentOrder: {
      type: String,
      trim: true,
      default: '',
    },
    sectoralLawRestriction: {
      type: String,
      trim: true,
      default: '',
    },
    governmentOrderReference: {
      type: String,
      trim: true,
      default: '',
    },
    effectiveDate: {
      type: String,
      trim: true,
      default: null,
    },
    transferAssessment: {
      assessed: { type: Boolean, default: false },
      assessmentDate: { type: String, default: null },
      safeguards: { type: String, default: '' },
      riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'UNASSESSED'],
        default: 'UNASSESSED',
      },
    },
    decision: {
      type: String,
      enum: ['PERMITTED', 'RESTRICTED', 'PROHIBITED', 'PENDING_EVALUATION'],
      default: 'PERMITTED',
    },
    evidence: {
      type: String,
      trim: true,
      default: '',
    },
    contractGovernance: {
      hasDpa: { type: Boolean, default: true },
      contractRef: { type: String, default: '' },
      auditRights: { type: Boolean, default: true },
      internalSafeguards: { type: String, default: 'INTERNAL_CONTRACT_SECURITY_GOVERNANCE' },
    },
    technicalControlStatus: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PLANNED'],
      default: 'ACTIVE',
    },
    legalRequirementStatus: {
      type: String,
      enum: ['FUTURE_EFFECTIVE', 'IN_FORCE', 'NOT_APPLICABLE'],
      default: 'FUTURE_EFFECTIVE',
    },
    securityReview: {
      reviewed: { type: Boolean, default: true },
      reviewDate: { type: String, default: null },
      reviewer: { type: String, default: '' },
    },
    approval: {
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'CONDITIONAL'],
        default: 'APPROVED',
      },
      approvedBy: { type: String, default: '' },
    },
    rule15ReadinessStatus: {
      type: String,
      enum: ['IMPLEMENTED / FUTURE-COMPLIANCE READY', 'FUTURE_COMPLIANCE_READINESS', 'NOT_APPLICABLE', 'COMPLIANT'],
      default: 'IMPLEMENTED / FUTURE-COMPLIANCE READY',
    },
    subProcessors: [
      {
        name: { type: String, trim: true },
        service: { type: String, trim: true },
        country: { type: String, trim: true },
      },
    ],
    exitDeletionObligation: {
      type: String,
      trim: true,
      default: 'Mandatory certificate of destruction within 30 days of contract termination',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'third_party_processors',
  }
);

thirdPartyProcessorSchema.index({ organisationId: 1, isActive: 1 });

const ThirdPartyProcessor =
  mongoose.models.ThirdPartyProcessor ||
  mongoose.model('ThirdPartyProcessor', thirdPartyProcessorSchema);

module.exports = {
  ThirdPartyProcessor,
};
