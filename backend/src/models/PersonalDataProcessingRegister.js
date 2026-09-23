'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — PERSONAL DATA PROCESSING REGISTER (STAGE 08)
 * ============================================================================
 * Internal RoPA (Record of Processing Activities) tailored for DPDP Act readiness.
 * Covers purpose, ground, retention basis, security classification, and
 * separates IN_FORCE requirements from FUTURE_EFFECTIVE requirements.
 */

const mongoose = require('mongoose');

const DATA_PRINCIPAL_TYPES = [
  'EMPLOYEE',
  'CUSTOMER',
  'SUPPLIER_CONTACT',
  'CONTRACTOR',
  'CANDIDATE',
  'ACCOUNT_USER',
];

const LEGAL_STATUSES = [
  'IN_FORCE',
  'FUTURE_EFFECTIVE',
  'SUPERSEDED',
  'NOT_APPLICABLE',
  'UNDER_REVIEW',
];

const SECURITY_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
];

const personalDataProcessingRegisterSchema = new mongoose.Schema(
  {
    registerId: {
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
    businessOwner: {
      type: String,
      required: true,
      trim: true,
    },
    systemModule: {
      type: String,
      required: true,
      trim: true,
    },
    dataPrincipalType: {
      type: String,
      enum: DATA_PRINCIPAL_TYPES,
      required: true,
      index: true,
    },
    personalDataCategories: [
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
    processingGround: {
      type: String,
      required: true,
      trim: true, // e.g. 'LEGITIMATE_USE_EMPLOYMENT', 'CONSENT', 'STATUTORY_COMPLIANCE'
    },
    storageSystem: {
      type: String,
      trim: true,
      default: 'MongoDB Protected Tenant Database',
    },
    retentionPeriodYears: {
      type: Number,
      required: true,
      min: 0,
    },
    retentionBasis: {
      type: String,
      required: true,
      trim: true, // e.g. 'Income Tax Act 8-Year Mandate', 'EPFO/ESIC Statutory Period'
    },
    deletionRule: {
      type: String,
      trim: true,
      default: 'Secure cryptographic purge upon expiration of statutory retention period',
    },
    securityClassification: {
      type: String,
      enum: SECURITY_CLASSIFICATIONS,
      default: 'CONFIDENTIAL',
    },
    currentLegalStatus: {
      type: String,
      enum: LEGAL_STATUSES,
      default: 'IN_FORCE',
    },
    dpdpCommencementDate: {
      type: String,
      trim: true,
      default: '2025-11-13',
    },
    isFutureEffectiveOnly: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'personal_data_processing_registers',
  }
);

personalDataProcessingRegisterSchema.index({ organisationId: 1, dataPrincipalType: 1 });
personalDataProcessingRegisterSchema.index({ organisationId: 1, currentLegalStatus: 1 });

const PersonalDataProcessingRegister =
  mongoose.models.PersonalDataProcessingRegister ||
  mongoose.model('PersonalDataProcessingRegister', personalDataProcessingRegisterSchema);

module.exports = {
  PersonalDataProcessingRegister,
  DATA_PRINCIPAL_TYPES,
  LEGAL_STATUSES,
  SECURITY_CLASSIFICATIONS,
};
