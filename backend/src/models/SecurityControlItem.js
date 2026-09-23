'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — SECURITY CONTROL ITEM (NIST CSF 2.0 MAPPING) (STAGE 08)
 * ============================================================================
 * Internal cybersecurity governance mapped to NIST CSF 2.0 functions:
 * GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER.
 *
 * NOTE: NIST CSF 2.0 is an internal framework reference, NOT an Indian statute.
 * We do not claim external certification without formal accreditation.
 */

const mongoose = require('mongoose');

const NIST_CSF_FUNCTIONS = [
  'GOVERN',
  'IDENTIFY',
  'PROTECT',
  'DETECT',
  'RESPOND',
  'RECOVER',
];

const CONTROL_EFFECTIVENESS = [
  'HIGHLY_EFFECTIVE',
  'EFFECTIVE',
  'PARTIALLY_EFFECTIVE',
  'DEFICIENT',
  'NOT_EVALUATED',
];

const securityControlItemSchema = new mongoose.Schema(
  {
    controlId: {
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
    csfFunction: {
      type: String,
      enum: NIST_CSF_FUNCTIONS,
      required: true,
      index: true,
    },
    categoryCode: {
      type: String,
      required: true,
      trim: true, // e.g. 'GV.OC', 'ID.AM', 'PR.AC', 'DE.CM', 'RS.MA', 'RC.RP'
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    objective: {
      type: String,
      required: true,
      trim: true,
    },
    implementationStatus: {
      type: String,
      enum: ['IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'NOT_APPLICABLE'],
      default: 'IMPLEMENTED',
    },
    technicalMechanism: {
      type: String,
      trim: true,
      default: '',
    },
    effectiveness: {
      type: String,
      enum: CONTROL_EFFECTIVENESS,
      default: 'EFFECTIVE',
    },
    deficiencyNotes: {
      type: String,
      trim: true,
      default: '',
    },
    frameworkNotice: {
      type: String,
      default: 'NIST CSF 2.0 internal taxonomy reference. Not a statutory regulation or third-party certification.',
    },
    isNistStatutory: {
      type: Boolean,
      default: false,
    },
    isExternalCertified: {
      type: Boolean,
      default: false,
    },
    lastAssessedDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: () => new Date().toISOString().split('T')[0],
    },
    ownerRole: {
      type: String,
      trim: true,
      default: 'Chief Technology Officer / CISO',
    },
  },
  {
    timestamps: true,
    collection: 'security_control_items',
  }
);

securityControlItemSchema.index({ organisationId: 1, csfFunction: 1 });

const SecurityControlItem =
  mongoose.models.SecurityControlItem ||
  mongoose.model('SecurityControlItem', securityControlItemSchema);

module.exports = {
  SecurityControlItem,
  NIST_CSF_FUNCTIONS,
  CONTROL_EFFECTIVENESS,
};
