'use strict';

const mongoose = require('mongoose');

const businessContractSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    cafeId: {
      type: String,
      default: null,
      index: true,
    },
    contractId: {
      type: String,
      required: true,
    },
    contractType: {
      type: String,
      required: true,
      enum: [
        'SUPPLIER_AGREEMENT',
        'COMMERCIAL_LEASE',
        'AMC_MAINTENANCE',
        'TECHNOLOGY_SOFTWARE',
        'CONSULTING_SERVICES',
        'EMPLOYMENT_CORPORATE',
        'WASTE_MANAGEMENT',
        'OTHER',
      ],
      default: 'OTHER',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    parties: [
      {
        name: { type: String, required: true },
        role: { type: String, default: 'PARTY' }, // e.g. 'LESSOR', 'LESSEE', 'CLIENT', 'SERVICE_PROVIDER'
        identifier: { type: String, default: '' },
      },
    ],
    counterpartyName: {
      type: String,
      required: true,
      trim: true,
    },
    counterpartyId: {
      type: String,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
    lineage: [
      {
        version: { type: Number, required: true },
        amendmentType: { type: String, enum: ['ORIGINAL', 'AMENDMENT', 'ADDENDUM', 'RENEWAL'], default: 'ORIGINAL' },
        amendedAt: { type: Date, default: Date.now },
        amendedBy: { type: String },
        changeSummary: { type: String },
        documentId: { type: String },
      },
    ],
    status: {
      type: String,
      enum: [
        'DRAFT',
        'REVIEW',
        'APPROVAL',
        'EXECUTION_PENDING',
        'EXECUTED',
        'ACTIVE',
        'RENEWAL_REVIEW',
        'RENEWED',
        'EXPIRED',
        'TERMINATED',
      ],
      default: 'DRAFT',
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    commencementDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isAutoRenewal: {
      type: Boolean,
      default: false,
    },
    renewalNoticeDays: {
      type: Number,
      default: 30,
    },
    terminationNoticeDays: {
      type: Number,
      default: 30,
    },
    governingLaw: {
      type: String,
      default: 'Laws of India; Courts of Kozhikode, Kerala',
    },
    commercialValue: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    paymentObligations: {
      type: String,
      default: '',
    },
    ownerId: {
      type: String,
      default: null,
    },
    reviewerId: {
      type: String,
      default: null,
    },
    approverId: {
      type: String,
      default: null,
    },
    executedDate: {
      type: Date,
      default: null,
    },
    confidentialityLevel: {
      type: String,
      enum: ['CONFIDENTIAL', 'RESTRICTED', 'INTERNAL'],
      default: 'INTERNAL',
    },
    linkedSupplierId: {
      type: String,
      default: null,
    },
    linkedAssetId: {
      type: String,
      default: null,
    },
    linkedCapexId: {
      type: String,
      default: null,
    },
    documents: [
      {
        documentId: { type: String, required: true },
        title: { type: String, default: 'Contract Agreement' },
        version: { type: Number, default: 1 },
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

businessContractSchema.index({ organisationId: 1, contractId: 1 }, { unique: true });
businessContractSchema.index({ organisationId: 1, status: 1 });
businessContractSchema.index({ organisationId: 1, counterpartyName: 1 });

const BusinessContract = mongoose.model('BusinessContract', businessContractSchema);

module.exports = { BusinessContract };
