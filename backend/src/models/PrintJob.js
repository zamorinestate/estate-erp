'use strict';

/**
 * PRINT JOB — MONGOOSE MODEL (REC-04)
 *
 * Persists durable print and reprint job attempts, status tracking,
 * and hardware error codes decoupled from the financial transaction lifecycle.
 */

const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema(
  {
    printJobId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    billId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    printerTarget: {
      type: String,
      trim: true,
      default: 'DEFAULT_THERMAL',
    },
    jobType: {
      type: String,
      enum: ['RECEIPT', 'REPRINT', 'KOT', 'SUMMARY'],
      default: 'RECEIPT',
    },
    status: {
      type: String,
      enum: ['QUEUED', 'DISPATCHED', 'PRINTED', 'FAILED', 'CANCELLED'],
      default: 'QUEUED',
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    requestedBy: {
      type: String,
      required: true,
      trim: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    dispatchedDeviceId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    acknowledgedByDeviceId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },

    ackChallenge: {
      type: String,
      default: null,
    },
    ackChallengeIssuedAt: {
      type: Date,
      default: null,
    },
    attestationRequired: {
      type: Boolean,
      default: false,
    },
    attestationKeyThumbprint: {
      type: String,
      default: null,
    },
    attestationVerifiedAt: {
      type: Date,
      default: null,
    },
    ackSignatureHash: {
      type: String,
      default: null,
    },
    drawerKickRequested: {
      type: Boolean,
      default: false,
    },
    drawerKickStatus: {
      type: String,
      enum: ['NOT_REQUESTED', 'DISPATCHED', 'ACKNOWLEDGED', 'FAILED', 'UNKNOWN'],
      default: 'NOT_REQUESTED',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failureCode: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
      trim: true,
    },
    printBufferBase64: {
      type: String,
      default: null,
    },
    htmlPreview: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'print_jobs',
  }
);

printJobSchema.index({ organisationId: 1, cafeId: 1, billId: 1, createdAt: -1 });

const PrintJob =
  mongoose.models.PrintJob ||
  mongoose.model('PrintJob', printJobSchema);

module.exports = {
  PrintJob,
};
