'use strict';

const mongoose = require('mongoose');

const COMPETENCY_STATUSES = [
  'ATTENDED',
  'COMPLETED',
  'ASSESSED',
  'COMPETENT',
  'NEEDS_RETRAINING',
];

const EVIDENCE_TYPES = [
  'ASSESSMENT_PASSED',
  'SUPERVISOR_OBSERVATION',
  'CERTIFICATION',
  'PRACTICAL_CHECK',
  'AUTHORISED_COMPETENCY_DECLARATION',
];

const employeeCompetencySchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    competencyId: {
      type: String,
      required: true,
    },
    skillName: {
      type: String,
      required: true,
    },
    domain: {
      type: String,
      default: 'OPERATIONS',
    },
    status: {
      type: String,
      enum: COMPETENCY_STATUSES,
      default: 'ATTENDED',
      index: true,
    },
    isCompetent: {
      type: Boolean,
      default: false,
    },
    evidenceType: {
      type: String,
      enum: EVIDENCE_TYPES,
      default: null,
    },
    assessedByUserId: {
      type: String,
      default: null,
    },
    assessedAt: {
      type: Date,
      default: null,
    },
    score: {
      type: Number,
      default: null,
    },
    passThreshold: {
      type: Number,
      default: 80,
    },
    assessmentNotes: {
      type: String,
      default: '',
    },
    validUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

employeeCompetencySchema.index(
  { organisationId: 1, userId: 1, competencyId: 1 },
  { unique: true }
);

const EmployeeCompetency = mongoose.model('EmployeeCompetency', employeeCompetencySchema);

module.exports = {
  EmployeeCompetency,
  COMPETENCY_STATUSES,
  EVIDENCE_TYPES,
};
