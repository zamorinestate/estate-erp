'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD SAFETY REGISTRATION & LICENCE GOVERNANCE MODEL
 * ============================================================================
 * Conforms to the 2026 FSSAI Regulatory Framework (Perpetual Validity Regime
 * unless suspended, cancelled, or surrendered; legacy regime renewal support).
 */

const mongoose = require('mongoose');

const REGISTRATION_TYPES = [
  'REGISTRATION',     // Petty food business (FoSCoS registration)
  'STATE_LICENSE',    // State FSSAI Licence (turnover / capacity threshold)
  'CENTRAL_LICENSE',  // Central FSSAI Licence (head office / large scale / interstate)
];

const REGULATORY_REGIMES = [
  '2026_AMENDMENT_PERPETUAL', // 2026 amended framework: perpetual validity
  'LEGACY_EXPIRING',           // Pre-2026 legacy framework requiring periodic renewal
];

const REGULATORY_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'SURRENDERED',
  'LEGACY_RENEWAL_REQUIRED',
  'MIGRATION_REQUIRED',
  'UNDER_REVIEW',
];

const INTERNAL_COMPLIANCE_STATES = [
  'COMPLIANT',
  'ACTION_REQUIRED',
  'SERIOUS_NONCOMPLIANCE',
  'ESCALATED',
  'REGULATORY_RISK',
];

const foodSafetyRegistrationSchema = new mongoose.Schema(
  {
    registrationId: {
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
    fssaiNumber: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{14}$/,
      index: true,
    },
    registrationType: {
      type: String,
      enum: REGISTRATION_TYPES,
      required: true,
      default: 'STATE_LICENSE',
    },
    businessCategory: {
      type: String,
      trim: true,
      default: 'Food Service / Catering Establishments',
    },
    authority: {
      type: String,
      trim: true,
      default: 'Food Safety and Standards Authority of India (FSSAI)',
    },
    regimeVersion: {
      type: String,
      enum: REGULATORY_REGIMES,
      default: '2026_AMENDMENT_PERPETUAL',
      required: true,
    },
    isPerpetual: {
      type: Boolean,
      default: true,
    },
    issueDate: {
      type: Date,
      required: true,
    },
    legacyExpiryDate: {
      type: Date,
      default: null,
      validate: {
        validator: function (v) {
          // Expiry date is ONLY permitted if regime is LEGACY_EXPIRING or isPerpetual is false
          if (this.isPerpetual && v != null) {
            return false;
          }
          return true;
        },
        message: 'Expiry date is prohibited for licences operating under the 2026 perpetual validity regime.',
      },
    },
    status: {
      type: String,
      enum: REGULATORY_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    internalComplianceState: {
      type: String,
      enum: INTERNAL_COMPLIANCE_STATES,
      default: 'COMPLIANT',
      index: true,
    },
    regulatorOrderReference: {
      type: String,
      trim: true,
      default: null,
    },
    responsiblePerson: {
      type: String,
      required: true,
      trim: true,
    },
    complianceOwner: {
      type: String,
      required: true,
      trim: true,
    },
    conditions: {
      type: [String],
      default: [],
    },
    certificateAttachmentId: {
      type: String,
      trim: true,
      default: null,
    },
    lastVerificationDate: {
      type: Date,
      default: null,
    },
    nextComplianceDate: {
      type: Date,
      default: null,
    },
    sourceReference: {
      type: String,
      trim: true,
      default: 'FSSAI/FoSCoS Statutory Records',
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        previousStatus: { type: String },
        newStatus: { type: String },
        reason: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

foodSafetyRegistrationSchema.index(
  { organisationId: 1, registrationId: 1 },
  { unique: true }
);

foodSafetyRegistrationSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 }
);

const FoodSafetyRegistration =
  mongoose.models.FoodSafetyRegistration ||
  mongoose.model('FoodSafetyRegistration', foodSafetyRegistrationSchema);

module.exports = {
  FoodSafetyRegistration,
  REGISTRATION_TYPES,
  REGULATORY_REGIMES,
  REGULATORY_STATUSES,
  INTERNAL_COMPLIANCE_STATES,
};
