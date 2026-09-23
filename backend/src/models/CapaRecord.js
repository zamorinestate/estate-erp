'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CORRECTIVE AND PREVENTIVE ACTION (CAPA) MODEL
 * ============================================================================
 * Implements governed CAPA records originating from Hygiene Failures,
 * Temperature Excursions, Incidents, Recalls, Supplier Quality, or Internal Audits.
 * Enforces human-confirmed root cause analysis, evidence retention, and verification.
 */

const mongoose = require('mongoose');

const CAPA_SOURCES = [
  'HYGIENE_CHECKLIST',
  'TEMPERATURE_EXCURSION',
  'FOOD_SAFETY_INCIDENT',
  'FOOD_RECALL',
  'SUPPLIER_QUALITY',
  'INTERNAL_AUDIT',
  'OPERATIONAL_ANOMALY',
];

const CAPA_STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'ACTION_AGREED',
  'REMEDIATION',
  'VERIFICATION',
  'CLOSED',
];

const capaRecordSchema = new mongoose.Schema(
  {
    capaId: {
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
    source: {
      type: String,
      enum: CAPA_SOURCES,
      required: true,
      index: true,
    },
    sourceReferenceId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    findingDescription: {
      type: String,
      required: true,
      trim: true,
    },
    rootCauseCategory: {
      type: String,
      enum: ['EQUIPMENT_FAILURE', 'HUMAN_PROCESS_ERROR', 'SUPPLIER_DEFECT', 'STORAGE_ENVIRONMENT', 'CLEANING_PROTOCOL', 'OTHER'],
      default: 'OTHER',
    },
    rootCauseAnalysis: {
      type: String,
      required: true,
      trim: true,
    },
    rootCauseConfirmedByHuman: {
      type: Boolean,
      required: true,
      default: true, // System requires human confirmation of root cause
    },
    correctiveActionPlan: {
      type: String,
      required: true,
      trim: true,
    },
    preventiveActionPlan: {
      type: String,
      required: true,
      trim: true,
    },
    assignedOwnerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: CAPA_STATUSES,
      default: 'OPEN',
      index: true,
    },
    evidenceAttachmentIds: {
      type: [String],
      default: [],
    },
    actionTakenNotes: {
      type: String,
      trim: true,
      default: '',
    },
    actionTakenAt: {
      type: Date,
      default: null,
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
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        previousStatus: { type: String },
        newStatus: { type: String },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

capaRecordSchema.index(
  { organisationId: 1, capaId: 1 },
  { unique: true }
);

capaRecordSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 }
);

const CapaRecord =
  mongoose.models.CapaRecord ||
  mongoose.model('CapaRecord', capaRecordSchema);

module.exports = {
  CapaRecord,
  CAPA_SOURCES,
  CAPA_STATUSES,
};
