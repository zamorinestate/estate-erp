'use strict';

/**
 * LEAVE REQUEST — MONGOOSE MODEL (SCREEN EMP-SCR-004: MY LEAVE)
 */

const mongoose = require('mongoose');

const LEAVE_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'RECOMMENDED',
  'INFORMATION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
];

const LEAVE_TYPES = [
  'CASUAL',
  'SICK',
  'EARNED',
  'UNPAID',
  'COMP_OFF',
  'RESTRICTED_HOLIDAY',
  'OTHER',
];

const DURATION_UNITS = [
  'FULL_DAY',
  'FIRST_HALF',
  'SECOND_HALF',
];

const dayBreakdownSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
    },
    dayType: {
      type: String,
      enum: ['SCHEDULED', 'HOLIDAY', 'WEEKLY_OFF', 'UNSCHEDULED'],
      default: 'SCHEDULED',
    },
    charge: {
      type: Number,
      default: 1.0,
    },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    leaveId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^LR-\d{8}-\d{3,}$/,
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

    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      default: 'CASUAL',
      required: true,
    },

    startDate: {
      type: String,
      required: true, // 'YYYY-MM-DD'
    },

    endDate: {
      type: String,
      required: true, // 'YYYY-MM-DD'
    },

    durationUnit: {
      type: String,
      enum: DURATION_UNITS,
      default: 'FULL_DAY',
    },

    requestedDays: {
      type: Number,
      required: true,
      min: 0.5,
    },

    dayBreakdown: [dayBreakdownSchema],

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    attachmentUrl: {
      type: String,
      default: null,
    },

    attachmentName: {
      type: String,
      default: null,
    },

    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: 'PENDING',
      index: true,
    },

    recommendedByUserId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    recommendedAt: {
      type: Date,
      default: null,
    },

    decisionByUserId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    decisionAt: {
      type: Date,
      default: null,
    },

    decisionReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    cancellationReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    cancellationRequestedAt: {
      type: Date,
      default: null,
    },

    infoRequestedNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    infoSuppliedNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

leaveRequestSchema.index({ organisationId: 1, userId: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ organisationId: 1, status: 1, createdAt: -1 });

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);

module.exports = {
  LeaveRequest,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  DURATION_UNITS,
};
