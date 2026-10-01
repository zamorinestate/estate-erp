'use strict';

const mongoose = require('mongoose');

const gstinItemSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true },
    stateCode: { type: String, required: true, trim: true, match: /^\d{2}$/ },
    number: { type: String, required: true, trim: true, uppercase: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const licenceItemSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    validFrom: { type: Date, default: null },
    validTill: { type: Date, default: null },
  },
  { _id: false }
);

const companyIdentitySchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    legalName: {
      type: String,
      required: true,
      trim: true,
    },

    brandName: {
      type: String,
      required: true,
      trim: true,
    },

    tagline: {
      type: String,
      trim: true,
      default: '',
    },

    logo: {
      primarySvg: { type: String, default: '' },
      monochromeSvg: { type: String, default: '' },
      primaryPngUrl: { type: String, default: '/assets/zamorin-estate-logo.png' },
      monochromePngUrl: { type: String, default: '/assets/zamorin-estate-mark.png' },
      ingestedAt: { type: Date, default: Date.now },
    },

    pan: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    cin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    udyamNumber: {
      type: String,
      trim: true,
      default: '',
    },

    registeredAddress: {
      line1: { type: String, trim: true, default: '' },
      line2: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      stateCode: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' },
    },

    gstin: {
      type: [gstinItemSchema],
      default: [],
    },

    licences: {
      type: [licenceItemSchema],
      default: [],
    },

    contact: {
      phone: { type: String, trim: true, default: '' },
      supportPhone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
      supportEmail: { type: String, trim: true, lowercase: true, default: '' },
      website: { type: String, trim: true, default: '' },
      whatsapp: { type: String, trim: true, default: '' },
    },

    banking: {
      accountName: { type: String, trim: true, default: '' },
      bankName: { type: String, trim: true, default: '' },
      accountNumberMasked: { type: String, trim: true, default: '' },
      ifsc: { type: String, trim: true, uppercase: true, default: '' },
    },

    authorisedSignatory: {
      name: { type: String, trim: true, default: '' },
      designation: { type: String, trim: true, default: '' },
    },

    financialYearStartMonth: {
      type: Number,
      default: 4, // April
    },

    defaultCurrency: {
      type: String,
      default: 'INR',
      trim: true,
    },

    version: {
      type: Number,
      required: true,
      default: 1,
    },

    status: {
      type: String,
      enum: ['CURRENT', 'SUPERSEDED'],
      default: 'CURRENT',
      index: true,
    },

    effectiveFrom: {
      type: Date,
      default: Date.now,
    },

    createdBy: {
      type: String,
      default: 'SYSTEM',
    },

    changeReason: {
      type: String,
      default: '',
    },

    supersedesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyIdentity',
      default: null,
    },

    supersededById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyIdentity',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'company_identities',
  }
);

companyIdentitySchema.index({ organisationId: 1, status: 1 });
companyIdentitySchema.index(
  { organisationId: 1, version: 1 },
  { unique: true, name: 'uq_company_identity_org_version' }
);

const CompanyIdentity = mongoose.model('CompanyIdentity', companyIdentitySchema);

module.exports = {
  CompanyIdentity,
};
