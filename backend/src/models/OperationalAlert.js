'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OPERATIONAL ALERT MONGOOSE MODEL
 * ============================================================================
 * Standardized alert schema supporting SEV-1 through SEV-4 classification,
 * intelligent deduplication, cooldown tracking, and multi-tenant scoping.
 */

const mongoose = require('mongoose');

const ALERT_SEVERITIES = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'];

const ALERT_CATEGORIES = [
  'SYSTEM_AVAILABILITY',
  'DATABASE_HEALTH',
  'DOCUMENT_STORAGE',
  'SECURITY_BREACH_ATTEMPT',
  'AUTHENTICATION_DEGRADATION',
  'POS_TRANSACTION_FAILURE',
  'EXPORT_ENGINE_ERROR',
  'BACKUP_FAILURE',
  'SCHEDULED_JOB_FAILURE',
  'CAPACITY_EXHAUSTION',
  'OPERATIONAL_POLICY_BREACH',
  'ASSET_MAINTENANCE',
];

const ALERT_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'SUPPRESSED',
];

const operationalAlertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      enum: ALERT_CATEGORIES,
      required: true,
    },
    severity: {
      type: String,
      enum: ALERT_SEVERITIES,
      required: true,
      default: 'SEV-3',
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    deduplicationKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      default: 'ZAMORIN',
      index: true,
    },
    cafeId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    firstDetected: {
      type: Date,
      default: Date.now,
    },
    lastDetected: {
      type: Date,
      default: Date.now,
    },
    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ALERT_STATUSES,
      default: 'OPEN',
      index: true,
    },
    acknowledgedBy: {
      type: String,
      trim: true,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolution: {
      type: String,
      trim: true,
      default: null,
    },
    relatedRequestIds: [
      {
        type: String,
        trim: true,
      },
    ],
    relatedRelease: {
      type: String,
      trim: true,
      default: null,
    },
    relatedIncidentId: {
      type: String,
      trim: true,
      default: null,
    },
    cooldownUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

operationalAlertSchema.index({ organisationId: 1, status: 1, severity: 1 });
operationalAlertSchema.index({ deduplicationKey: 1, status: 1 });

const OperationalAlert = mongoose.models.OperationalAlert || mongoose.model('OperationalAlert', operationalAlertSchema);

module.exports = {
  ALERT_SEVERITIES,
  ALERT_CATEGORIES,
  ALERT_STATUSES,
  OperationalAlert,
};
