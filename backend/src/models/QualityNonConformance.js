'use strict';

const mongoose = require('mongoose');

const NCR_SOURCES = [
  'MANUAL_OBSERVATION',
  'RECEIVING_INSPECTION',
  'CHECKLIST_CRITICAL_FAIL',
  'TEMPERATURE_EXCURSION',
  'SUPPLIER_QUALITY',
  'INTERNAL_AUDIT',
  'CUSTOMER_COMPLAINT',
  'OTHER',
];

const NCR_SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL'];
const NCR_STATUSES = ['OPEN', 'INVESTIGATING', 'CAPA_REQUIRED', 'CLOSED'];

const qualityNonConformanceSchema = new mongoose.Schema(
  {
    ncrId: {
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
      enum: NCR_SOURCES,
      required: true,
      default: 'MANUAL_OBSERVATION',
      index: true,
    },
    severity: {
      type: String,
      enum: NCR_SEVERITIES,
      required: true,
      default: 'MAJOR',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: '',
    },
    immediateAction: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: '',
    },
    status: {
      type: String,
      enum: NCR_STATUSES,
      default: 'OPEN',
      index: true,
    },
    reportedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    reportedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    linkedChecklistId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    linkedCapaIds: {
      type: [String],
      default: [],
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
    auditHistory: [
      {
        action: { type: String, required: true, trim: true, uppercase: true },
        performedByUserId: { type: String, required: true, trim: true, uppercase: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true }
);

qualityNonConformanceSchema.index({ organisationId: 1, ncrId: 1 }, { unique: true });
qualityNonConformanceSchema.index({ organisationId: 1, cafeId: 1, status: 1, severity: 1 });

const QualityNonConformance =
  mongoose.models.QualityNonConformance ||
  mongoose.model('QualityNonConformance', qualityNonConformanceSchema);

module.exports = {
  QualityNonConformance,
  NCR_SOURCES,
  NCR_SEVERITIES,
  NCR_STATUSES,
};
