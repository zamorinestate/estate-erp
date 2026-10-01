'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { DEVICE_STATUS } = require('../utils/constants');

const CafeOpsDeviceSchema = new Schema({
  deviceCode: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true, trim: true },
  organisationId: { type: Schema.Types.ObjectId, required: true, index: true },
  cafeId: { type: Schema.Types.ObjectId, required: true, index: true },
  // Display-only cache, never used for authorization (that's always cafeId).
  // This module doesn't own the real Cafe collection (see
  // config/integrationRefs.js) — this field exists purely so screens can
  // show "Main Campus Cafe" instead of a raw ObjectId. Set once at
  // enrollment from the enrollment token; update via reassign-cafe.
  cafeDisplayName: { type: String },
  platform: { type: String, enum: ['android', 'ios', 'macos', 'windows', 'web'], default: 'web' },
  appVersion: { type: String },
  osVersion: { type: String },
  lifecycleStatus: { type: String, enum: Object.values(DEVICE_STATUS), default: DEVICE_STATUS.ACTIVE, index: true },
  integrityState: { type: String, enum: ['UNKNOWN', 'READY', 'FAILED'], default: 'UNKNOWN' },
  signingKeyThumbprint: { type: String, default: null, index: true },
  signingKeyAlgorithm: { type: String, enum: ['ES256', null], default: null },
  signingKeyProvider: { type: String, default: null },
  signingKeyHardwareBackedVerified: { type: Boolean, default: false },
  signingKeyHardwareSecurityLevel: {
    type: String,
    enum: ['UNKNOWN', 'SOFTWARE', 'TRUSTED_ENVIRONMENT', 'STRONGBOX'],
    default: 'UNKNOWN',
  },
  signingKeyHardwareAttestationVerifiedAt: { type: Date, default: null },
  attestationCapable: { type: Boolean, default: false },
  lastSeenAt: { type: Date },
  lastSyncAt: { type: Date },
  enrolledAt: { type: Date, default: Date.now },
  revokedAt: { type: Date },
  retiredAt: { type: Date },
  lostAt: { type: Date },
  replacedAt: { type: Date },
  reassignedAt: { type: Date },
  previousCafeId: { type: Schema.Types.ObjectId },
  replacesDeviceId: { type: Schema.Types.ObjectId, ref: 'CafeOpsDevice' },
  lifecycleReason: { type: String },
  lifecycleActorEmployeeId: { type: Schema.Types.ObjectId },
  // Long-lived device credential established at enrollment. High-entropy
  // (32 random bytes) so a fast SHA-256 lookup hash is appropriate here —
  // unlike the operator PIN, this is not a low-entropy human-guessable
  // secret, so it doesn't need bcrypt's deliberate slowness (see
  // operatorPinService.js for why the PIN gets different treatment).
  deviceTokenHash: { type: String, required: true, select: false },
}, { timestamps: true });

module.exports = mongoose.model('CafeOpsDevice', CafeOpsDeviceSchema);
