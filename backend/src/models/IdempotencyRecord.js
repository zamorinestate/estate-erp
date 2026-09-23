'use strict';

/**
 * IDEMPOTENCY RECORD — MONGOOSE MODEL (REC-04)
 *
 * Persists client-generated idempotency keys and request fingerprints
 * to guarantee exactly-once financial mutation and safe transaction replay.
 */

const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema(
  {
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
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requestFingerprint: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PROCESSING',
      index: true,
    },
    billId: {
      type: String,
      default: null,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },
    saleAttemptId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    responseSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'idempotency_records',
  }
);

idempotencyRecordSchema.index(
  { organisationId: 1, cafeId: 1, idempotencyKey: 1 },
  { unique: true }
);

// Automatic 7-day retention TTL index
idempotencyRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

const IdempotencyRecord =
  mongoose.models.IdempotencyRecord ||
  mongoose.model('IdempotencyRecord', idempotencyRecordSchema);

module.exports = {
  IdempotencyRecord,
};
