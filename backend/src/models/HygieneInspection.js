'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — HYGIENE INSPECTION EXECUTION MODEL
 * ============================================================================
 * Records actual execution of a hygiene checklist against a versioned template,
 * tracking answers, exception findings, corrective actions, and verification.
 */

const mongoose = require('mongoose');

const hygieneResponseSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true }, // e.g., 'PASS', 'FAIL', 'NA', or numeric/text
    isException: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
    evidenceAttachmentId: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const correctiveActionSchema = new mongoose.Schema(
  {
    actionId: { type: String, required: true, trim: true },
    finding: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['MINOR', 'MAJOR', 'CRITICAL'],
      default: 'MINOR',
    },
    assignedToUserId: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    actionPlan: { type: String, required: true, trim: true },
    actionTaken: { type: String, trim: true, default: '' },
    actionTakenAt: { type: Date, default: null },
    actionEvidenceAttachmentId: { type: String, trim: true, default: null },
    verifiedByUserId: { type: String, trim: true, default: null },
    verifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['OPEN', 'ASSIGNED', 'ACTION_TAKEN', 'VERIFIED', 'CLOSED', 'ESCALATED'],
      default: 'OPEN',
    },
    escalatedIncidentId: { type: String, trim: true, default: null },
    escalatedCapaId: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const hygieneInspectionSchema = new mongoose.Schema(
  {
    inspectionId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    templateId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    templateVersion: {
      type: Number,
      required: true,
      min: 1,
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
    inspectedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    inspectedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    responses: {
      type: [hygieneResponseSchema],
      required: true,
    },
    overallResult: {
      type: String,
      enum: ['PASSED', 'FAILED_WITH_ACTION', 'CRITICAL_FAIL'],
      required: true,
      index: true,
    },
    correctiveActions: {
      type: [correctiveActionSchema],
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
    status: {
      type: String,
      enum: ['COMPLETED', 'ACTION_REQUIRED', 'ALL_ACTIONS_CLOSED'],
      default: 'COMPLETED',
      index: true,
    },
    metadata: {
      deviceId: { type: String, trim: true, default: null },
      correlationId: { type: String, trim: true, default: null },
      clientIp: { type: String, trim: true, default: null },
    },
    auditHistory: [
      {
        action: { type: String, required: true },
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

hygieneInspectionSchema.index(
  { organisationId: 1, inspectionId: 1 },
  { unique: true }
);

hygieneInspectionSchema.index(
  { organisationId: 1, cafeId: 1, inspectedAt: -1 }
);

const HygieneInspection =
  mongoose.models.HygieneInspection ||
  mongoose.model('HygieneInspection', hygieneInspectionSchema);

module.exports = {
  HygieneInspection,
};
