'use strict';

/**
 * ATTENDANCE CORRECTION REQUEST — MONGOOSE MODEL
 * Canonical data model for employee attendance regularisation / correction requests.
 */

const mongoose = require('mongoose');

const CORRECTION_ISSUE_TYPES = [
  'MISSED_CHECK_IN',
  'MISSED_CHECK_OUT',
  'WRONG_CHECK_IN',
  'WRONG_CHECK_OUT',
  'WRONG_BREAK',
  'INCORRECT_STATUS',
  'SHIFT_MISMATCH',
  'OTHER',
];

const CORRECTION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

const correctionBreakSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    durationMinutes: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const attendanceCorrectionRequestSchema = new mongoose.Schema(
  {
    correctionRequestId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^(CR|ACR)-\d{8}-\d{3,}$/,
      index: true,
    },

    requestId: {
      type: String,
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
      trim: true,
      uppercase: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    attendanceId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    issueType: {
      type: String,
      required: true,
      enum: CORRECTION_ISSUE_TYPES,
      default: 'OTHER',
    },

    requestedCheckInAt: {
      type: Date,
      default: null,
    },

    requestedCheckOutAt: {
      type: Date,
      default: null,
    },

    requestedBreaks: [correctionBreakSchema],

    requestedBreakMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    requestedStatus: {
      type: String,
      trim: true,
      default: null,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      required: true,
      enum: CORRECTION_STATUSES,
      default: 'PENDING',
      index: true,
    },

    submittedBy: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    reviewedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    reviewedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    reviewRemarks: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    appliedAttendanceId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'attendance_correction_requests',
  }
);

attendanceCorrectionRequestSchema.index(
  { organisationId: 1, cafeId: 1, status: 1 },
  { name: 'org_cafe_status' }
);

attendanceCorrectionRequestSchema.index(
  { organisationId: 1, userId: 1, businessDate: 1 },
  { name: 'org_user_date' }
);

const AttendanceCorrectionRequest =
  mongoose.models.AttendanceCorrectionRequest ||
  mongoose.model('AttendanceCorrectionRequest', attendanceCorrectionRequestSchema);

module.exports = {
  AttendanceCorrectionRequest,
  CORRECTION_ISSUE_TYPES,
  CORRECTION_STATUSES,
};
