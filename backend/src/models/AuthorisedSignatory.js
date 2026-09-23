const mongoose = require('mongoose');

const AuthorisedSignatorySchema = new mongoose.Schema({
  signatoryId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  organisationId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    default: null,
    index: true
  },
  signatoryName: {
    type: String,
    required: true
  },
  designation: {
    type: String,
    required: true
  },
  authorityType: {
    type: String,
    enum: ['SOLE', 'JOINT', 'CONDITIONAL'],
    default: 'CONDITIONAL'
  },
  entityName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['BANKING_FINANCE', 'STATUTORY_FILINGS', 'STATUTORY_LEGAL', 'COMMERCIAL_CONTRACTS', 'REAL_ESTATE_LEASES', 'EMPLOYMENT_HR', 'OTHER'],
    required: true
  },
  monetaryLimit: {
    type: Number,
    default: null // null indicates non-monetary or strict ceiling
  },
  cafeScope: [{
    type: String
  }],
  startAt: {
    type: Date,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  legalOrPolicySource: {
    type: String,
    enum: ['STATUTORY', 'ARTICLES', 'BOARD_RESOLUTION', 'POWER_OF_ATTORNEY', 'INTERNAL_POLICY'],
    required: true
  },
  sourceReference: {
    type: String,
    required: true
  },
  resolutionReference: {
    type: String,
    default: null
  },
  // Evidence of authority (Strictly ZERO cryptographic private keys, DSC PINs, or bank passwords stored)
  evidenceAttachments: [{
    attachmentId: { type: String },
    name: { type: String },
    url: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: String }
  }],
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true
  },
  revocationDetails: {
    revokedAt: { type: Date },
    revokedBy: { type: String },
    reason: { type: String }
  },
  notes: {
    type: String
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  strict: false
});

AuthorisedSignatorySchema.index({ organisationId: 1, status: 1 });
AuthorisedSignatorySchema.index({ organisationId: 1, expiresAt: 1 });

const AuthorisedSignatory = mongoose.models.AuthorisedSignatory || mongoose.model('AuthorisedSignatory', AuthorisedSignatorySchema);
AuthorisedSignatory.AuthorisedSignatory = AuthorisedSignatory;
AuthorisedSignatory.AuthorisedSignatorySchema = AuthorisedSignatorySchema;

module.exports = AuthorisedSignatory;
