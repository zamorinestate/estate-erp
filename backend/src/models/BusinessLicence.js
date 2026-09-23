'use strict';

const mongoose = require('mongoose');

const businessLicenceSchema = new mongoose.Schema(
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
    licenceId: {
      type: String,
      required: true,
    },
    licenceType: {
      type: String,
      required: true,
      enum: [
        'FSSAI_REGISTRATION',
        'FSSAI_STATE_LICENCE',
        'FSSAI_CENTRAL_LICENCE',
        'LOCAL_TRADE_HEALTH',
        'SHOPS_AND_ESTABLISHMENTS',
        'FIRE_SAFETY_NOC',
        'GST_REGISTRATION',
        'MUNICIPAL_SIGNAGE',
        'POLLUTION_CONTROL',
        'OTHER_BUSINESS_PERMIT',
      ],
      default: 'OTHER_BUSINESS_PERMIT',
    },
    authority: {
      type: String,
      required: true,
      trim: true,
    },
    referenceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    entityName: {
      type: String,
      default: 'Zamorin Cafe LLP',
    },
    premisesAddress: {
      type: String,
      default: '',
    },
    issueDate: {
      type: Date,
      required: true,
    },
    isPerpetual: {
      type: Boolean,
      default: false,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    nextReviewDate: {
      type: Date,
      default: null,
    },
    renewalPeriodDays: {
      type: Number,
      default: null,
    },
    responsiblePerson: {
      type: String,
      default: '',
    },
    conditions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'SURRENDERED', 'UNDER_REVIEW', 'EXPIRED'],
      default: 'ACTIVE',
    },
    stage01FoodSafetyRef: {
      type: String,
      default: null,
    },
    documents: [
      {
        documentId: { type: String, required: true },
        title: { type: String, default: 'Licence Certificate' },
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

businessLicenceSchema.index({ organisationId: 1, licenceId: 1 }, { unique: true });
businessLicenceSchema.index({ organisationId: 1, licenceType: 1 });
businessLicenceSchema.index({ organisationId: 1, status: 1 });

const BusinessLicence = mongoose.model('BusinessLicence', businessLicenceSchema);

module.exports = { BusinessLicence };
