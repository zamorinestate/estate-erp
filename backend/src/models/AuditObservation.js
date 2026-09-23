'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — AUDIT OBSERVATION / FINDING MODEL (STAGE 02)
 * ============================================================================
 * Formal audit finding records enforcing full lifecycle:
 * OPEN -> INVESTIGATING -> ACTION_AGREED -> REMEDIATION -> VERIFICATION -> CLOSED.
 */

const mongoose = require('mongoose');

const FINDING_LIFECYCLE_STATES = [
  'OPEN',
  'INVESTIGATING',
  'ACTION_AGREED',
  'REMEDIATION',
  'VERIFICATION',
  'CLOSED',
];

const VALID_FINDING_TRANSITIONS = {
  OPEN: ['INVESTIGATING', 'ACTION_AGREED'],
  INVESTIGATING: ['ACTION_AGREED', 'CLOSED'],
  ACTION_AGREED: ['REMEDIATION'],
  REMEDIATION: ['VERIFICATION'],
  VERIFICATION: ['CLOSED', 'REMEDIATION'], // Can send back to remediation if verification fails
  CLOSED: [], // Terminal; reopen requires explicit audited action
};

const auditObservationSchema = new mongoose.Schema(
  {
    findingId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    auditId: {
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    conditionFact: {
      type: String,
      required: true,
      trim: true,
    },
    criteriaPolicy: {
      type: String,
      required: true,
      trim: true,
    },
    cause: {
      type: String,
      required: true,
      trim: true,
    },
    riskImpact: {
      type: String,
      required: true,
      trim: true,
    },
    recommendation: {
      type: String,
      required: true,
      trim: true,
    },
    managementResponse: {
      type: String,
      trim: true,
      default: '',
    },
    responsibleOwnerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: FINDING_LIFECYCLE_STATES,
      default: 'OPEN',
      index: true,
    },
    evidenceAttachmentIds: {
      type: [String],
      default: [],
    },
    verifiedByUserId: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationNotes: {
      type: String,
      trim: true,
      default: '',
    },
    closedAt: {
      type: Date,
      default: null,
    },
    auditHistory: [
      {
        fromState: { type: String },
        toState: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

auditObservationSchema.index(
  { organisationId: 1, findingId: 1 },
  { unique: true }
);

auditObservationSchema.methods.canTransitionTo = function (nextState) {
  const allowed = VALID_FINDING_TRANSITIONS[this.status] || [];
  return allowed.includes(nextState);
};

const AuditObservation =
  mongoose.models.AuditObservation ||
  mongoose.model('AuditObservation', auditObservationSchema);

module.exports = {
  AuditObservation,
  FINDING_LIFECYCLE_STATES,
  VALID_FINDING_TRANSITIONS,
};
