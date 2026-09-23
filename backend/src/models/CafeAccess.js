'use strict';

const mongoose = require('mongoose');

const ACCESS_STATUSES = [
  'ACTIVE',
  'DISABLED',
  'SUSPENDED',
  'LOCKED',
];

const PROVISIONING_STATUSES = [
  'PROVISIONING',
  'READY',
  'SUSPENDED',
  'ERROR',
  'ARCHIVED',
];

const cafeAccessSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
    },

    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
    },

    accessStatus: {
      type: String,
      enum: ACCESS_STATUSES,
      default: 'ACTIVE',
      index: true,
    },

    provisioningStatus: {
      type: String,
      enum: PROVISIONING_STATUSES,
      default: 'PROVISIONING',
      index: true,
    },

    // Permanent 6-digit Café PIN storage (Legacy commissioning artifact - retired in REC-02)
    permanentCafePinEncrypted: {
      type: String,
      required: false,
      select: false, // Never return in unprojected queries
    },

    // HMAC-SHA256 index for constant-time lookups without exposing plaintext
    permanentCafePinLookupHash: {
      type: String,
      required: false,
      sparse: true,
      unique: true,
      index: true,
      select: false,
    },

    // Dedicated QR Access Credential (SHA-256 hash of high-entropy opaque token)
    qrCredentialHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false,
    },

    qrTokenEncrypted: {
      type: String,
      select: false,
    },

    qrVersion: {
      type: Number,
      default: 1,
      min: 1,
    },

    qrEnabled: {
      type: Boolean,
      default: true,
    },

    qrCreatedAt: {
      type: Date,
      default: Date.now,
    },

    qrRevokedAt: {
      type: Date,
      default: null,
    },

    qrRevokedBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    qrRevokeReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    qrHistory: [
      {
        version: Number,
        action: {
          type: String,
          enum: ['CREATED', 'ROTATED', 'REVOKED', 'REACTIVATED'],
        },
        actionAt: {
          type: Date,
          default: Date.now,
        },
        actorUserId: String,
        actorRole: String,
        reason: String,
      },
    ],

    qrLastUsedAt: {
      type: Date,
      default: null,
    },

    // Dedicated Café Operations Login Link Credential (SHA-256 hash of opaque token)
    linkCredentialHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false,
    },

    linkTokenEncrypted: {
      type: String,
      select: false,
    },

    linkVersion: {
      type: Number,
      default: 1,
      min: 1,
    },

    linkEnabled: {
      type: Boolean,
      default: true,
    },

    linkCreatedAt: {
      type: Date,
      default: Date.now,
    },

    linkLastUsedAt: {
      type: Date,
      default: null,
    },

    // Emergency Governance Lock
    emergencyLockReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    emergencyLockedAt: {
      type: Date,
      default: null,
    },

    emergencyLockedBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    // Maintenance Mode
    maintenanceMode: {
      type: Boolean,
      default: false,
    },

    maintenanceReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // Post-creation & diagnostic integrity records
    lastValidatedAt: {
      type: Date,
      default: null,
    },

    lastValidationResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    createdBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    updatedBy: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'cafe_access_records',
  }
);

cafeAccessSchema.index(
  { organisationId: 1, cafeId: 1 },
  { unique: true }
);

const CafeAccess =
  mongoose.models.CafeAccess ||
  mongoose.model('CafeAccess', cafeAccessSchema);

module.exports = {
  CafeAccess,
  ACCESS_STATUSES,
  PROVISIONING_STATUSES,
};
