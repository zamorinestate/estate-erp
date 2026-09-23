'use strict';

const mongoose = require('mongoose');

const insuranceClaimSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    claimId: {
      type: String,
      required: true,
    },
    policyId: {
      type: String,
      required: true,
      index: true,
    },
    incidentDate: {
      type: Date,
      required: true,
    },
    reportedDate: {
      type: Date,
      default: Date.now,
    },
    cafeId: {
      type: String,
      default: null,
      index: true,
    },
    assetId: {
      type: String,
      default: null,
    },
    insurerClaimReference: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedLoss: {
      type: Number,
      required: true,
      min: 0,
    },
    claimedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    settlementAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        'INCIDENT_RECORDED',
        'CLAIM_ASSESSMENT',
        'DOCUMENTS_PENDING',
        'SUBMITTED',
        'ACKNOWLEDGEMENT',
        'ASSESSMENT',
        'DECISION',
        'SETTLEMENT_PENDING',
        'SETTLED',
        'REJECTED',
        'WITHDRAWN',
        'CLOSED',
      ],
      default: 'INCIDENT_RECORDED',
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    surveyorDetails: {
      name: { type: String, default: '' },
      contact: { type: String, default: '' },
      surveyDate: { type: Date, default: null },
      reportDocumentId: { type: String, default: null },
    },
    documents: [
      {
        documentId: { type: String, required: true },
        title: { type: String, default: 'Claim Document' },
        mimeType: { type: String, default: 'application/pdf' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

insuranceClaimSchema.index({ organisationId: 1, claimId: 1 }, { unique: true });
insuranceClaimSchema.index({ organisationId: 1, policyId: 1 });
insuranceClaimSchema.index({ organisationId: 1, status: 1 });

const InsuranceClaim = mongoose.model('InsuranceClaim', insuranceClaimSchema);

module.exports = { InsuranceClaim };
