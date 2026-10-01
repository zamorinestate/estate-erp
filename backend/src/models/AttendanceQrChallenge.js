'use strict';

const mongoose = require('mongoose');
const { generateSixDigitPin } = require('../utils/secureRandom');

const attendanceQrChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    opaqueToken: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },

    organisationId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    deviceId: {
      type: String,
      default: 'OPS_CONSOLE',
      trim: true,
      index: true,
    },

    cafeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    purpose: {
      type: String,
      enum: ['ATTENDANCE_PUNCH'],
      default: 'ATTENDANCE_PUNCH',
      index: true,
    },

    issuedByUserId: {
      type: String,
      trim: true,
      default: 'SYSTEM',
    },

    issuedByRole: {
      type: String,
      trim: true,
      default: 'SYSTEM',
    },

    rotationIntervalSeconds: {
      type: Number,
      default: 45,
    },

    fallbackPin: {
      type: String,
      default: generateSixDigitPin,
      trim: true,
      index: true,
    },

    pinAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL auto-cleanup
    },

    nonce: {
      type: String,
      required: true,
      trim: true,
    },

    signature: {
      type: String,
      required: true,
    },

    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'attendance_qr_challenges',
  }
);

attendanceQrChallengeSchema.index({ organisationId: 1, cafeId: 1, expiresAt: 1 });

const AttendanceQrChallenge = mongoose.models.AttendanceQrChallenge || mongoose.model('AttendanceQrChallenge', attendanceQrChallengeSchema);

module.exports = {
  AttendanceQrChallenge,
};
