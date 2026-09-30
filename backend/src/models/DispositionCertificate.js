'use strict';

/**
 * DispositionCertificate — SCR-024
 *
 * Immutable proof of permanent, governed data disposition.
 * Contains safe, minimized metadata only (NEVER contains disposed payload).
 * Generates ZURF v1 compliance certificates for audit and regulatory compliance.
 */

const mongoose = require('mongoose');

const dispositionCertificateSchema = new mongoose.Schema(
  {
    certificateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      match: /^CERT-DISP-\d{6}-\d{5}$/,
    },

    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'GLOBAL',
      index: true,
    },

    trashId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    sourceModule: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    entityId: {
      type: String,
      required: true,
      trim: true,
    },

    recordReference: {
      type: String,
      required: true,
      trim: true,
    },

    policyId: {
      type: String,
      required: true,
      trim: true,
    },

    policyVersion: {
      type: Number,
      default: 1,
    },

    retentionCompletedAt: {
      type: Date,
      required: true,
    },

    requestedByUserId: {
      type: String,
      trim: true,
      default: 'SYSTEM',
    },

    approvedByUserId: {
      type: String,
      trim: true,
      default: 'MASTER',
    },

    executedByUserId: {
      type: String,
      required: true,
      trim: true,
      default: 'SYSTEM_PURGE_WORKER',
    },

    executedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    propagationStages: {
      // Fail closed: a stage is never certified COMPLETED merely because no
      // explicit value was supplied. Only verified execution may set COMPLETED.
      primaryDatabase: { type: String, enum: ['COMPLETED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
      searchIndex: { type: String, enum: ['COMPLETED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
      fileStorage: { type: String, enum: ['COMPLETED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
      cacheLayer: { type: String, enum: ['COMPLETED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
      analyticsReadModel: { type: String, enum: ['COMPLETED', 'FAILED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
    },

    integrityHash: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'disposition_certificates',
  }
);

const DispositionCertificate = mongoose.model('DispositionCertificate', dispositionCertificateSchema);

module.exports = {
  DispositionCertificate,
};
