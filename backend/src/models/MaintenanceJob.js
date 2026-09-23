'use strict';

/**
 * MAINTENANCE JOB — MONGOOSE MODEL
 */

const mongoose = require('mongoose');

const MAINTENANCE_STATUSES = ['LOGGED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const MAINTENANCE_TYPES = [
  'PREVENTIVE_MAINTENANCE',
  'CORRECTIVE_REPAIR',
  'INSPECTION',
  'CALIBRATION',
  'CLEANING_SERVICE',
  'WARRANTY_SERVICE',
  'OTHER',
];

const MAINTENANCE_RESULTS = ['PASS', 'COMPLETED', 'REQUIRES_FOLLOWUP', 'FAILED'];

const rescheduleEntrySchema = new mongoose.Schema(
  {
    oldDueDate: { type: String, trim: true, default: null },
    newDueDate: { type: String, required: true, trim: true },
    rescheduledByUserId: { type: String, required: true, trim: true, uppercase: true },
    reason: { type: String, required: true, trim: true },
    rescheduledAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const maintenanceJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^MNT-\d{4,}$/,
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

    assetId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    planId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    maintenanceType: {
      type: String,
      enum: MAINTENANCE_TYPES,
      default: 'PREVENTIVE_MAINTENANCE',
      index: true,
    },

    scheduledDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
      index: true,
    },

    issueDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    workSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    status: {
      type: String,
      enum: MAINTENANCE_STATUSES,
      default: 'LOGGED',
      index: true,
    },

    result: {
      type: String,
      enum: MAINTENANCE_RESULTS,
      default: 'COMPLETED',
    },

    costPaisa: {
      type: Number,
      min: 0,
      default: 0,
    },

    technicianName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    performedBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    serviceProviderId: {
      type: String,
      trim: true,
      default: null,
    },

    resolutionNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    evidenceDocumentIds: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],

    rescheduleHistory: [rescheduleEntrySchema],

    loggedByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    collection: 'maintenance_jobs',
  }
);

maintenanceJobSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 },
  { name: 'org_cafe_status' }
);

maintenanceJobSchema.index(
  { organisationId: 1, assetId: 1, completedAt: -1 },
  { name: 'org_asset_completed' }
);

maintenanceJobSchema.pre('validate', function normaliseMntFields() {
  const upperFields = ['jobId', 'organisationId', 'cafeId', 'assetId', 'planId', 'loggedByUserId'];
  for (const field of upperFields) {
    if (this[field] && typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }
  if (this.status) this.status = this.status.trim().toUpperCase();
  if (this.maintenanceType) this.maintenanceType = this.maintenanceType.trim().toUpperCase();
  if (this.result) this.result = this.result.trim().toUpperCase();
});

const MaintenanceJob =
  mongoose.models.MaintenanceJob ||
  mongoose.model('MaintenanceJob', maintenanceJobSchema);

module.exports = {
  MaintenanceJob,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  MAINTENANCE_RESULTS,
};
