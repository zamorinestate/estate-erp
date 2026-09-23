const mongoose = require('mongoose');

const DelegationOfAuthoritySchema = new mongoose.Schema({
  delegationId: {
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
  delegatorUserId: {
    type: String,
    required: true,
    index: true
  },
  delegateUserId: {
    type: String,
    required: true,
    index: true
  },
  // Delegate may only act for specified delegated café(s). No unconstrained org-wide fallback.
  cafeScope: [{
    type: String,
    required: true
  }],
  actionPermissions: [{
    type: String,
    required: true,
    trim: true
  }],
  module: {
    type: String,
    required: true,
    enum: ['FINANCE_EXPENSE', 'PROCUREMENT', 'CAPEX', 'REFUND', 'CONTRACTS', 'SUPPLIER', 'MASTER_DATA', 'COMPLIANCE', 'OTHER']
  },
  maxMonetaryAmount: {
    type: Number,
    default: null // null means non-monetary or strict zero ceiling unless explicitly numeric
  },
  transactionType: {
    type: String,
    default: 'ALL'
  },
  startAt: {
    type: Date,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true
  },
  restrictions: [{
    type: String
  }],
  sourceAuthorityType: {
    type: String,
    enum: ['STATUTORY', 'ARTICLES', 'BOARD_RESOLUTION', 'INTERNAL_POLICY'],
    required: true
  },
  sourceAuthorityReference: {
    type: String,
    required: true
  },
  approvalResolutionId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true
  },
  revokedAt: {
    type: Date,
    default: null
  },
  revokedByUserId: {
    type: String,
    default: null
  },
  revocationReason: {
    type: String,
    default: null
  },
  allowSubDelegation: {
    type: Boolean,
    default: false // Strict default: NO SUB-DELEGATION
  },
  subDelegatedFromId: {
    type: String,
    default: null
  },
  auditTrail: [{
    action: { type: String, required: true },
    performedBy: { type: String },
    timestamp: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  strict: false
});

DelegationOfAuthoritySchema.index({ organisationId: 1, delegateUserId: 1, status: 1 });
DelegationOfAuthoritySchema.index({ organisationId: 1, expiresAt: 1 });

const DelegationOfAuthority = mongoose.models.DelegationOfAuthority || mongoose.model('DelegationOfAuthority', DelegationOfAuthoritySchema);
DelegationOfAuthority.DelegationOfAuthority = DelegationOfAuthority;
DelegationOfAuthority.DelegationOfAuthoritySchema = DelegationOfAuthoritySchema;

module.exports = DelegationOfAuthority;
