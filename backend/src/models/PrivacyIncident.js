'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — PRIVACY INCIDENT GOVERNANCE (STAGE 08)
 * ============================================================================
 * Governed incident response lifecycle:
 * DETECTED -> TRIAGED -> CONTAINED -> ASSESSED -> NOTIFICATION_ASSESSMENT -> ACTION -> RECOVERED -> CLOSED
 * Captures affected Data Principal counts, containment evidence, and Board notification assessment.
 */

const mongoose = require('mongoose');

const PRIVACY_INCIDENT_STATUSES = [
  'DETECTED',
  'TRIAGED',
  'CONTAINED',
  'ASSESSED',
  'NOTIFICATION_ASSESSMENT',
  'ACTION',
  'RECOVERED',
  'CLOSED',
];

const ALLOWED_INCIDENT_TRANSITIONS = {
  DETECTED: ['TRIAGED'],
  TRIAGED: ['CONTAINED'],
  CONTAINED: ['ASSESSED'],
  ASSESSED: ['NOTIFICATION_ASSESSMENT'],
  NOTIFICATION_ASSESSMENT: ['ACTION'],
  ACTION: ['RECOVERED'],
  RECOVERED: ['CLOSED'],
  CLOSED: [],
};

const privacyIncidentSchema = new mongoose.Schema(
  {
    incidentId: {
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
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: PRIVACY_INCIDENT_STATUSES,
      default: 'DETECTED',
      index: true,
    },
    affectedDataCategories: [
      {
        type: String,
        trim: true,
      },
    ],
    estimatedAffectedPrincipals: {
      type: Number,
      min: 0,
      default: 0,
    },
    containmentActions: {
      type: String,
      trim: true,
      default: '',
    },
    notificationRequired: {
      type: Boolean,
      default: false,
    },
    notificationRationale: {
      type: String,
      trim: true,
      default: '',
    },
    rootCauseAnalysis: {
      type: String,
      trim: true,
      default: '',
    },
    reportedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    closedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        fromStatus: { type: String, default: null },
        toStatus: { type: String, default: null },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'privacy_incidents',
  }
);

privacyIncidentSchema.index({ organisationId: 1, status: 1 });

const PrivacyIncident =
  mongoose.models.PrivacyIncident ||
  mongoose.model('PrivacyIncident', privacyIncidentSchema);

module.exports = {
  PrivacyIncident,
  PRIVACY_INCIDENT_STATUSES,
  ALLOWED_INCIDENT_TRANSITIONS,
};
