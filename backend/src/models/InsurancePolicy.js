'use strict';

const mongoose = require('mongoose');

const insurancePolicySchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    policyId: {
      type: String,
      required: true,
    },
    policyNumber: {
      type: String,
      required: true,
      trim: true,
    },
    insurerName: {
      type: String,
      required: true,
      trim: true,
    },
    brokerName: {
      type: String,
      default: '',
      trim: true,
    },
    policyType: {
      type: String,
      required: true,
      enum: [
        'STANDARD_FIRE_SPECIAL_PERILS',
        'BURGLARY_THEFT',
        'PUBLIC_LIABILITY',
        'WORKMEN_COMPENSATION',
        'DIRECTORS_OFFICERS',
        'CYBER_RISK',
        'TRANSIT_STOCK',
        'BUSINESS_INTERRUPTION',
        'EQUIPMENT_BREAKDOWN',
      ],
      default: 'STANDARD_FIRE_SPECIAL_PERILS',
    },
    insuredEntity: {
      type: String,
      default: 'Zamorin Cafe LLP',
    },
    insuredCafeId: {
      type: String,
      default: null,
      index: true,
    },
    insuredAssetId: {
      type: String,
      default: null,
    },
    coverageSummary: {
      type: String,
      required: true,
      trim: true,
    },
    sumInsured: {
      type: Number,
      required: true,
      min: 0,
    },
    deductibleAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    premiumAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RENEWAL_DUE', 'EXPIRED', 'CANCELLED', 'PENDING_UNDERWRITING'],
      default: 'ACTIVE',
    },
    documents: [
      {
        documentId: { type: String, required: true },
        title: { type: String, default: 'Policy Schedule' },
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

insurancePolicySchema.index({ organisationId: 1, policyId: 1 }, { unique: true });
insurancePolicySchema.index({ organisationId: 1, status: 1 });
insurancePolicySchema.index({ organisationId: 1, endDate: 1 });

const InsurancePolicy = mongoose.model('InsurancePolicy', insurancePolicySchema);

module.exports = { InsurancePolicy };
