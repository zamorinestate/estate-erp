'use strict';

/**
 * ATTENDANCE — MONGOOSE MODEL (SCREEN 004: ATTENDANCE & SHIFTS)
 */

const mongoose = require('mongoose');

const {
  calculateAttendanceMetrics,
} = require('../../services/attendanceCalculationService');

const ATTENDANCE_STATUSES = [
  'CHECKED_IN',
  'CHECKED_OUT',
  'ON_BREAK',
  'MISSED_PUNCH',
  'ABSENT',
  'ON_LEAVE',
  'HALF_DAY',
  'HOLIDAY',
  'WEEKLY_OFF',
  'NOT_SCHEDULED',
  'SCHEDULED',
  'MANUALLY_CORRECTED',
];

const breakEntrySchema = new mongoose.Schema(
  {
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const ATTENDANCE_SOURCES = [
  'SELF',
  'CAFE_ADMIN',
  'MASTER',
  'SYSTEM',
  'OFFLINE_SYNC',
];

const rawTimeEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ['CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT'],
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: 'SELF',
    },
    recordedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    isGeofenceVerified: {
      type: Boolean,
      default: true,
    },
    isQrVerified: {
      type: Boolean,
      default: true,
    },
    isSelfieVerified: {
      type: Boolean,
      default: true,
    },
    selfieFileId: {
      type: String,
      default: null,
    },
    isOfflineSync: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const punchEvidenceSchema = new mongoose.Schema(
  {
    photoFileId: {
      type: String,
      trim: true,
      default: null,
    },
    selfieMediaId: {
      type: String,
      trim: true,
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED', 'PENDING', 'FLAGGED', 'REJECTED'],
      default: 'VERIFIED',
    },
    integrityState: {
      type: String,
      enum: ['UNVERIFIED', 'PASS', 'QUARANTINED'],
      default: 'UNVERIFIED',
    },
    integrityLastCheckedAt: {
      type: Date,
      default: null,
    },
    integrityFailedChecks: {
      type: [String],
      default: [],
    },
    integrityAuditEventId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    integrityReleaseAuditEventId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    integrityReleasedAt: {
      type: Date,
      default: null,
    },
    integrityReleasedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    integrityReleaseReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    qrChallengeId: {
      type: String,
      trim: true,
      default: null,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    accuracyMeters: {
      type: Number,
      default: null,
    },
    distanceMeters: {
      type: Number,
      default: null,
    },
    geofencePolicyVersion: {
      type: Number,
      enum: [1, null],
      default: null,
    },
    cafeLatitude: {
      type: Number,
      default: null,
    },
    cafeLongitude: {
      type: Number,
      default: null,
    },
    allowedRadiusMeters: {
      type: Number,
      default: null,
    },
    geofenceVerified: {
      type: Boolean,
      default: false,
    },
    qrVerified: {
      type: Boolean,
      default: false,
    },
    serverTimestamp: {
      type: Date,
      default: Date.now,
    },
    deviceId: {
      type: String,
      trim: true,
      default: null,
    },
    deviceFingerprint: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    attendanceId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^AT-\d{8}-\d{3,}$/,
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

    businessDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: ATTENDANCE_STATUSES,
      default: 'CHECKED_IN',
      index: true,
    },

    shiftId: {
      type: String,
      default: null,
    },

    shiftName: {
      type: String,
      default: null,
    },

    scheduledStart: {
      type: String,
      default: null,
    },

    scheduledEnd: {
      type: String,
      default: null,
    },

    checkInAt: {
      type: Date,
      default: null,
    },

    checkOutAt: {
      type: Date,
      default: null,
    },

    checkInSource: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: 'SELF',
    },

    checkOutSource: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: null,
    },

    checkInRecordedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    checkOutRecordedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    regularMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    breaks: [breakEntrySchema],

    breakMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    scheduledStartAt: {
      type: Date,
      default: null,
    },

    scheduledEndAt: {
      type: Date,
      default: null,
    },

    scheduledDurationMinutes: {
      type: Number,
      min: 0,
      default: null,
    },

    detectedOvertimeMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    approvedOvertimeMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    overtimeMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    overtimeStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING_REVIEW', 'VERIFIED_BY_ADMIN', 'APPROVED_BY_PRIMARY', 'REJECTED'],
      default: 'NOT_APPLICABLE',
    },

    overtimeDecidedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    overtimeDecidedAt: {
      type: Date,
      default: null,
    },

    overtimeReason: {
      type: String,
      trim: true,
      default: '',
    },

    totalWorkedMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    payableMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Secondary Condition Markers
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, min: 0, default: 0 },
    isEarlyExit: { type: Boolean, default: false },
    earlyDepartureMinutes: { type: Number, min: 0, default: 0 },
    isOvertime: { type: Boolean, default: false },
    isManualEntry: { type: Boolean, default: false },
    isCorrection: { type: Boolean, default: false },
    geofenceException: { type: Boolean, default: false },
    qrException: { type: Boolean, default: false },
    deviceException: { type: Boolean, default: false },

    // Evidence & Privacy
    selfieFileId: { type: String, default: null },
    attendanceEvidence: {
      checkIn: {
        type: punchEvidenceSchema,
        default: null,
      },
      checkOut: {
        type: punchEvidenceSchema,
        default: null,
      },
    },
    isEvidenceHold: { type: Boolean, default: false },
    evidenceHoldReason: { type: String, default: '' },
    isSelfiePurged: { type: Boolean, default: false },
    selfiePurgedAt: { type: Date, default: null },

    // Attestation & Closure
    isEmployeeAttested: { type: Boolean, default: false },
    attestedAt: { type: Date, default: null },
    isLocked: { type: Boolean, default: false },

    // Raw Ledger
    rawTimeEvents: [rawTimeEventSchema],

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    correctionRequired: {
      type: Boolean,
      default: false,
    },

    correctionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    timezone: {
      type: String,
      immutable: true,
      default: 'Asia/Kolkata',
    },

    createdBy: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    updatedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
    collection: 'attendance',
  }
);

attendanceSchema.index(
  {
    organisationId: 1,
    userId: 1,
    businessDate: 1,
  },
  {
    unique: true,
    name: 'user_business_date_unique',
  }
);

attendanceSchema.index(
  {
    organisationId: 1,
    cafeId: 1,
    businessDate: 1,
    status: 1,
  },
  {
    name: 'cafe_date_status',
  }
);

attendanceSchema.pre(
  'validate',
  function normalizeAttendanceFields() {
    if (this.attendanceId) {
      this.attendanceId =
        this.attendanceId.trim().toUpperCase();
    }

    if (this.organisationId) {
      this.organisationId =
        this.organisationId.trim().toUpperCase();
    }

    if (this.cafeId) {
      this.cafeId =
        this.cafeId.trim().toUpperCase();
    }

    if (this.userId) {
      this.userId =
        this.userId.trim().toUpperCase();
    }
  }
);

attendanceSchema.methods.calculateWorkedMinutes =
  function calculateWorkedMinutes() {
    const metrics = calculateAttendanceMetrics({
      checkInAt: this.checkInAt,
      checkOutAt: this.checkOutAt,
      breaks: this.breaks,
      scheduledStartAt: this.scheduledStartAt,
      scheduledEndAt: this.scheduledEndAt,
      scheduledDurationMinutes: this.scheduledDurationMinutes,
      approvedOvertimeMinutes: this.approvedOvertimeMinutes,
    });

    this.breakMinutes = metrics.breakMinutes;
    this.totalWorkedMinutes = metrics.totalWorkedMinutes;
    this.regularMinutes = metrics.regularMinutes;
    this.detectedOvertimeMinutes = metrics.detectedOvertimeMinutes;
    this.overtimeMinutes = metrics.overtimeMinutes;
    this.isOvertime = metrics.isOvertime;
    this.isLate = metrics.isLate;
    this.lateMinutes = metrics.lateMinutes;
    this.isEarlyExit = metrics.isEarlyExit;
    this.earlyDepartureMinutes = metrics.earlyDepartureMinutes;
    this.payableMinutes = metrics.payableMinutes;
  };

attendanceSchema.pre(
  'save',
  function calculateAttendanceTotals() {
    this.calculateWorkedMinutes();
  }
);

const Attendance =
  mongoose.models.Attendance ||
  mongoose.model(
    'Attendance',
    attendanceSchema
  );

module.exports = {
  Attendance,
  ATTENDANCE_STATUSES,
  ATTENDANCE_SOURCES,
};