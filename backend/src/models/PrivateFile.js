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
      },
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    collection: 'private_files',
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
