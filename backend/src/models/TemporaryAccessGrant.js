'use strict';

const mongoose = require('mongoose');

const TEMPORARY_ACCESS_STATUSES = [
  'ACTIVE',
  'REVOKED',
  'EXPIRED',
];

const temporaryAccessGrantSchema = new mongoose.Schema(
  {
    grantId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
      match: /^TAG-\d{6}-\d{5}$/,
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
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
    sourceRequestId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    permissionCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 150,
      match: /^[A-Z0-9_:.]+$/,
      index: true,
    },
    moduleCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 100,
      default: null,
      index: true,
    },
    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    reportDomain: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    effectiveTo: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: TEMPORARY_ACCESS_STATUSES,
      required: true,
      default: 'ACTIVE',
      index: true,
    },
    approvedByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },
    approvedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    approvalReason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    revokedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revocationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'temporary_access_grants',
  }
);

temporaryAccessGrantSchema.index({
  organisationId: 1,
  userId: 1,
  permissionCode: 1,
  cafeId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

temporaryAccessGrantSchema.pre('validate', function normalizeAndValidate() {
  for (const field of [
    'grantId',
    'organisationId',
    'userId',
    'sourceRequestId',
    'permissionCode',
    'moduleCode',
    'cafeId',
    'reportDomain',
    'approvedByUserId',
    'revokedByUserId',
  ]) {
    if (typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }

  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) <= new Date(this.effectiveFrom)
  ) {
    this.invalidate('effectiveTo', 'Temporary access expiry must be after its start time.');
  }

  if (this.status === 'REVOKED' && (!this.revokedByUserId || !this.revokedAt)) {
    this.invalidate('status', 'A revoked temporary grant requires revocation lineage.');
  }
});

temporaryAccessGrantSchema.statics.findActiveGrant = function findActiveGrant({
  organisationId,
  userId,
  permissionCode,
  at = new Date(),
}) {
  return this.findOne({
    organisationId: String(organisationId || '').trim().toUpperCase(),
    userId: String(userId || '').trim().toUpperCase(),
    permissionCode: String(permissionCode || '').trim().toUpperCase(),
    status: 'ACTIVE',
    effectiveFrom: { $lte: at },
    effectiveTo: { $gt: at },
  });
};

const TemporaryAccessGrant =
  mongoose.models.TemporaryAccessGrant ||
  mongoose.model('TemporaryAccessGrant', temporaryAccessGrantSchema);

module.exports = {
  TemporaryAccessGrant,
  TEMPORARY_ACCESS_STATUSES,
};
