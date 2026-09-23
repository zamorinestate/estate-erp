const mongoose = require('mongoose');

const ConflictOfInterestDeclarationSchema = new mongoose.Schema({
  declarationId: {
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
  declarantUserId: {
    type: String,
    required: true,
    index: true
  },
  declarantName: {
    type: String,
    required: true
  },
  designation: {
    type: String,
    required: true
  },
  declarationType: {
    type: String,
    enum: [
      'DIRECTOR_INTEREST_SEC_184',
      'RELATED_PARTY_TRANSACTION',
      'SUPPLIER_CONFLICT',
      'EMPLOYMENT_CONFLICT',
      'OTHER_PECUNIARY_INTEREST'
    ],
    required: true
  },
  relatedPartyOrEntity: {
    type: String,
    required: true
  },
  natureOfInterest: {
    type: String,
    required: true
  },
  shareholdingOrPecuniaryValue: {
    type: String,
    default: null
  },
  dateOfDeclaration: {
    type: Date,
    required: true,
    default: Date.now
  },
  effectivePeriodStart: {
    type: Date,
    required: true
  },
  effectivePeriodEnd: {
    type: Date,
    required: true
  },
  statutorySource: {
    type: String,
    enum: ['COMPANIES_ACT_SEC_184', 'SEBI_LODR', 'INTERNAL_GOVERNANCE_CODE'],
    default: 'COMPANIES_ACT_SEC_184'
  },
  statutoryReference: {
    type: String,
    default: 'Section 184(1), Companies Act, 2013'
  },
  mitigationsOrRestrictions: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['SUBMITTED', 'NOTED_BY_BOARD', 'ACTIVE_MONITORING', 'RESOLVED', 'EXPIRED'],
    default: 'SUBMITTED',
    index: true
  },
  reviewedBy: {
    type: String,
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNotes: {
    type: String,
    default: null
  },
  evidenceAttachments: [{
    attachmentId: { type: String },
    name: { type: String },
    url: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  strict: false
});

ConflictOfInterestDeclarationSchema.index({ organisationId: 1, declarantUserId: 1 });
ConflictOfInterestDeclarationSchema.index({ organisationId: 1, relatedPartyOrEntity: 'text' });

const ConflictOfInterestDeclaration = mongoose.models.ConflictOfInterestDeclaration || mongoose.model('ConflictOfInterestDeclaration', ConflictOfInterestDeclarationSchema);
ConflictOfInterestDeclaration.ConflictOfInterestDeclaration = ConflictOfInterestDeclaration;
ConflictOfInterestDeclaration.ConflictOfInterestDeclarationSchema = ConflictOfInterestDeclarationSchema;

module.exports = ConflictOfInterestDeclaration;
