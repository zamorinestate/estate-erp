'use strict';

const mongoose = require('mongoose');

const DEVICE_CLASSES = ['PERSONAL', 'CAFE_OWNED'];
const DEVICE_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
  'TRANSFERRED',
  'LOST',
  'RETIRED',
  'REPLACED',
];

const deviceRegistrationSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
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

    deviceClass: {
      type: String,
      required: true,
      enum: DEVICE_CLASSES,
      default: 'PERSONAL',
      index: true,
    },

    assignedCafeId: {
      type: String,
      default: null,
      trim: true,
      index: true,
      validate: {
        validator: function (v) {
          if (this.deviceClass === 'CAFE_OWNED') {
            return typeof v === 'string' && /^ZC-(?:CAF-)?\d{4,}$/.test(v);
          }
          return true;
        },
        message: 'Assigned cafeId must match /^ZC-(?:CAF-)?\\d{4,}$/ when deviceClass is CAFE_OWNED',
      },
    },

    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    platform: {
      type: String,
      enum: ['ANDROID', 'IOS', 'WEB_POS', 'DESKTOP', 'UNKNOWN'],
      default: 'UNKNOWN',
    },

    appVersion: {
      type: String,
      default: '2.0.1',
      trim: true,
    },

    status: {
      type: String,
      required: true,
      enum: DEVICE_STATUSES,
      default: 'PENDING',
      index: true,
    },

    publicSigningKey: {
      type: String,
      default: null,
    },

    signingKeyThumbprint: {
      type: String,
      default: null,
      index: true,
    },

    signingKeyAlgorithm: {
      type: String,
      enum: ['ES256', null],
      default: null,
    },

    signingKeyProvider: {
      type: String,
      enum: ['ANDROID_KEYSTORE', 'APPLE_SECURE_ENCLAVE', 'APPLE_KEYCHAIN', 'WINDOWS_CNG', 'WEB_CRYPTO', 'UNKNOWN', null],
      default: null,
    },

    signingKeyCreatedAt: {
      type: Date,
      default: null,
    },

    signingKeyLastVerifiedAt: {
      type: Date,
      default: null,
    },

    webAuthnCredentialIds: {
      type: [String],
      default: [],
    },

    credentialBackupEligible: {
      type: Boolean,
      default: false,
    },

    trustLevel: {
      type: String,
      enum: ['UNVERIFIED', 'ENROLLED', 'HARDWARE_BACKED', 'MANAGED_FLEET'],
      default: 'UNVERIFIED',
    },

    policyVersion: {
      type: Number,
      default: 1,
      min: 1,
    },

    deviceVersion: {
      type: Number,
      default: 1,
      min: 1,
    },

    enrollmentCode: {
      type: String,
      default: null,
      index: true,
    },

    enrollmentExpiresAt: {
      type: Date,
      default: null,
    },

    enrollmentApprovedBy: {
      type: String,
      default: null,
    },

    enrollmentApprovedAt: {
      type: Date,
      default: null,
    },

    lastSeenAt: {
      type: Date,
      default: null,
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revocationReason: {
      type: String,
      default: null,
      trim: true,
    },

    retiredAt: {
      type: Date,
      default: null,
    },

    replacedAt: {
      type: Date,
      default: null,
    },

    replacedByDeviceId: {
      type: String,
      default: null,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'device_registrations',
  }
);

deviceRegistrationSchema.index({ organisationId: 1, assignedCafeId: 1, status: 1 });
deviceRegistrationSchema.index({ organisationId: 1, deviceClass: 1, status: 1 });
deviceRegistrationSchema.index({ organisationId: 1, status: 1, lastSeenAt: -1 });
deviceRegistrationSchema.index({ organisationId: 1, status: 1, createdAt: -1 });

const DeviceRegistration = mongoose.models.DeviceRegistration || mongoose.model('DeviceRegistration', deviceRegistrationSchema);

module.exports = {
  DeviceRegistration,
  DEVICE_CLASSES,
  DEVICE_STATUSES,
};
