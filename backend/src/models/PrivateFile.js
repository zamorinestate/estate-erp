'use strict';

/**
 * PRIVATE FILE — MONGOOSE MODEL
 */

const mongoose = require('mongoose');

const privateFileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^FILE-\d{4,}$/,
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

    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },

    sha256: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },

    storagePath: {
      type: String,
      required: true,
      trim: true,
    },

    uploadedByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    // Optional secure-attendance binding. Generic private files leave this null.
    // Attendance selfies are bound to the verified employee scan grant so a
    // previously uploaded file ID cannot be replayed for another QR challenge
    // or reused across CHECK_IN / CHECK_OUT transitions.
    attendanceContext: {
      challengeId: {
        type: String,
        default: null,
        trim: true,
        index: true,
      },
      cafeId: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
        index: true,
      },
      punchType: {
        type: String,
        enum: ['CHECK_IN', 'CHECK_OUT', null],
        default: null,
      },
      boundAt: {
        type: Date,
        default: null,
      },
      grantExpiresAt: {
        type: Date,
        default: null,
        index: true,
      },
    },

    // Atomic linkage guard between a verified punch and orphan cleanup.
    // RESERVED is acquired before Attendance.save(); COMMITTED is written only
    // after the attendance record has been persisted. Orphan reconciliation
    // must never claim either state.
    attendanceLink: {
      status: {
        type: String,
        enum: ['RESERVED', 'COMMITTED', null],
        default: null,
        index: true,
      },
      claimId: {
        type: String,
        default: null,
        trim: true,
      },
      reservedAt: {
        type: Date,
        default: null,
      },
      committedAt: {
        type: Date,
        default: null,
      },
      attendanceId: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
      },
      punchType: {
        type: String,
        enum: ['CHECK_IN', 'CHECK_OUT', null],
        default: null,
      },
      linkedByUserId: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
      },
    },

    // State used only for expired, unlinked attendance-selfie reconciliation.
    // Linked evidence is never eligible for this cleanup flow.
    attendanceCleanup: {
      status: {
        type: String,
        enum: ['CLAIMED', 'FAILED', 'STORAGE_DELETED', null],
        default: null,
        index: true,
      },
      claimId: {
        type: String,
        default: null,
        trim: true,
      },
      claimedAt: {
        type: Date,
        default: null,
      },
      claimedByUserId: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
      },
      attemptCount: {
        type: Number,
        min: 0,
        default: 0,
      },
      lastAttemptAt: {
        type: Date,
        default: null,
      },
      storageDeletedAt: {
        type: Date,
        default: null,
      },
      lastError: {
        type: String,
        default: '',
        maxlength: 1000,
      },
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    collection: 'private_files',
  }
);

privateFileSchema.index(
  {
    organisationId: 1,
    'attendanceContext.grantExpiresAt': 1,
    'attendanceLink.status': 1,
    'attendanceCleanup.status': 1,
  },
  {
    name: 'attendance_orphan_reconciliation_scan',
  }
);

privateFileSchema.pre('validate', function normaliseFileFields() {
  const upperFields = ['fileId', 'organisationId', 'uploadedByUserId'];
  for (const field of upperFields) {
    if (this[field] && typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }
});

const PrivateFile =
  mongoose.models.PrivateFile ||
  mongoose.model('PrivateFile', privateFileSchema);

module.exports = {
  PrivateFile,
};
