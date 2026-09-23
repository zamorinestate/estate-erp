'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — INTERNAL AUDIT PLAN & PROGRAMME MODEL (STAGE 02)
 * ============================================================================
 * Formal audit governance: Audit Plan -> Audit Programme -> Testing Procedures.
 */

const mongoose = require('mongoose');

const AUDIT_STATUSES = [
  'DRAFT',
  'PLANNED',
  'IN_PROGRESS',
  'FIELDWORK_COMPLETED',
  'REPORT_ISSUED',
  'CLOSED',
];

const auditProgrammeItemSchema = new mongoose.Schema(
  {
    procedureId: { type: String, required: true, trim: true },
    procedureTitle: { type: String, required: true, trim: true },
    controlTestedId: { type: String, trim: true, default: null },
    sampleDataSource: { type: String, required: true, trim: true },
    responsibleAuditorUserId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'TESTED_SATISFACTORY', 'EXCEPTION_IDENTIFIED'],
      default: 'NOT_STARTED',
    },
    sampleSize: { type: Number, default: 0 },
    exceptionsFoundCount: { type: Number, default: 0 },
    evidenceAttachmentIds: { type: [String], default: [] },
    auditorConclusion: { type: String, trim: true, default: '' },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const internalAuditPlanSchema = new mongoose.Schema(
  {
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
    cafes: {
      type: [String],
      default: [], // Empty indicates estate-wide
    },
    auditDomain: {
      type: String,
      required: true,
      trim: true,
    },
    objective: {
      type: String,
      required: true,
      trim: true,
    },
    scopeDescription: {
      type: String,
      required: true,
      trim: true,
    },
    auditPeriod: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    linkedRiskIds: {
      type: [String],
      default: [],
    },
    leadAuditorUserId: {
      type: String,
      required: true,
      trim: true,
    },
    plannedStartDate: {
      type: Date,
      required: true,
    },
    plannedCompletionDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: AUDIT_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    programme: {
      type: [auditProgrammeItemSchema],
      default: [],
    },
    findingsCount: {
      type: Number,
      default: 0,
    },
    executiveSummary: {
      type: String,
      trim: true,
      default: '',
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

internalAuditPlanSchema.index(
  { organisationId: 1, auditId: 1 },
  { unique: true }
);

const InternalAuditPlan =
  mongoose.models.InternalAuditPlan ||
  mongoose.model('InternalAuditPlan', internalAuditPlanSchema);

module.exports = {
  InternalAuditPlan,
  AUDIT_STATUSES,
};
