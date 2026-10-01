'use strict';

/**
 * QUALITY CHECKLIST — MONGOOSE MODEL
 */

const mongoose = require('mongoose');

const CHECKLIST_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'AD_HOC'];
const OVERALL_RESULTS = ['PASSED', 'FAILED_WITH_ACTION', 'CRITICAL_FAIL'];

const checklistItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    isPassed: { type: Boolean, required: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: true }
);

const qualityChecklistSchema = new mongoose.Schema(
  {
    checklistId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^QC-\d{4,}$/,
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

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    templateId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    templateVersion: {
      type: String,
      trim: true,
      default: null,
    },

    frequency: {
      type: String,
      enum: CHECKLIST_FREQUENCIES,
      default: 'DAILY',
    },

    items: {
      type: [checklistItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Checklist must have at least one item.',
      },
    },

    overallResult: {
      type: String,
      enum: OVERALL_RESULTS,
      required: true,
    },

    inspectionDate: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    inspectedByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    actionRequired: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // ── Compliance Calendar (Capability 03) ───────────────────────────────────
    // ISO date of the next scheduled inspection for this checklist template.
    nextDueDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
      index: true,
    },

    // Scheduled time of day for the inspection (HH:MM in Asia/Kolkata).
    scheduledTime: {
      type: String,
      trim: true,
      match: /^\d{2}:\d{2}$/,
      default: null,
    },

    // Whether a compliance reminder notification has been dispatched.
    reminderSentAt: {
      type: Date,
      default: null,
    },

    // Manager sign-off: who verified this inspection result.
    managerSignOffUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    signOffAt: {
      type: Date,
      default: null,
    },

    signOffNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    collection: 'quality_checklists',
  }
);

qualityChecklistSchema.index(
  { organisationId: 1, cafeId: 1, inspectionDate: -1 },
  { name: 'org_cafe_date' }
);

// Compliance calendar due-date index (Capability 03)
qualityChecklistSchema.index(
  { organisationId: 1, cafeId: 1, nextDueDate: 1 },
  { sparse: true, name: 'org_cafe_due_date' }
);

qualityChecklistSchema.pre('validate', function normaliseQCFields() {
  const upperFields = ['checklistId', 'organisationId', 'cafeId', 'inspectedByUserId', 'templateId'];
  for (const field of upperFields) {
    if (this[field] && typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }
  if (this.frequency) this.frequency = this.frequency.trim().toUpperCase();
  if (this.overallResult) this.overallResult = this.overallResult.trim().toUpperCase();
  if (this.managerSignOffUserId && typeof this.managerSignOffUserId === 'string') {
    this.managerSignOffUserId = this.managerSignOffUserId.trim().toUpperCase();
  }
});

const QualityChecklist =
  mongoose.models.QualityChecklist ||
  mongoose.model('QualityChecklist', qualityChecklistSchema);

module.exports = {
  QualityChecklist,
  CHECKLIST_FREQUENCIES,
  OVERALL_RESULTS,
};
