'use strict';

const mongoose = require('mongoose');

const SOP_DOMAINS = [
  'FOOD_SAFETY',
  'POS_BILLING',
  'CASH_HANDLING',
  'HYGIENE_CLEANING',
  'PROCUREMENT_RECEIVING',
  'INVENTORY_COUNTING',
  'PEOPLE_HR',
  'CYBERSECURITY_PRIVACY',
  'EMERGENCY_DISASTER',
  'OTHER',
];

const SOP_STATUSES = [
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'EFFECTIVE',
  'SUPERSEDED',
  'RETIRED',
];

const sopVersionLineageSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    status: { type: String, required: true },
    approvedByUserId: { type: String, default: null },
    effectiveDate: { type: Date, default: null },
    changeSummary: { type: String, required: true },
    contentSnapshot: { type: String, default: '' },
    checksum: { type: String, default: '' },
    archivedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const standardOperatingProcedureSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    sopId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      enum: SOP_DOMAINS,
      default: 'FOOD_SAFETY',
      index: true,
    },
    applicableCafes: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    applicableRoles: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    version: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: SOP_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    reviewDate: {
      type: Date,
      default: null,
    },
    supersededDate: {
      type: Date,
      default: null,
    },
    changeSummary: {
      type: String,
      default: 'Initial Draft Creation',
    },
    content: {
      type: String,
      required: true,
    },
    isAcknowledgementRequired: {
      type: Boolean,
      default: true,
    },
    isTrainingRequired: {
      type: Boolean,
      default: false,
    },
    isCompetencyRequired: {
      type: Boolean,
      default: false,
    },
    linkedObligationId: {
      type: String,
      default: null,
    },
    linkedRiskId: {
      type: String,
      default: null,
    },
    ownerUserId: {
      type: String,
      required: true,
    },
    approverUserId: {
      type: String,
      default: null,
    },
    versionLineage: [sopVersionLineageSchema],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

standardOperatingProcedureSchema.index({ organisationId: 1, sopId: 1 }, { unique: true });
standardOperatingProcedureSchema.index({ organisationId: 1, domain: 1, status: 1 });

const StandardOperatingProcedure = mongoose.model(
  'StandardOperatingProcedure',
  standardOperatingProcedureSchema
);

module.exports = {
  StandardOperatingProcedure,
  SOP_DOMAINS,
  SOP_STATUSES,
};
