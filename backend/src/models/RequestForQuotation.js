'use strict';

const mongoose = require('mongoose');

const RFQ_STATUSES = [
  'OPEN',
  'CLOSED',
  'AWARDED',
  'CANCELLED',
];

const requestForQuotationSchema = new mongoose.Schema(
  {
    rfqId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    scopeType: {
      type: String,
      enum: ['ORGANISATION', 'CAFE'],
      required: true,
      default: 'CAFE',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    deadline: {
      type: Date,
      required: true,
      index: true,
    },
    invitedVendorIds: {
      type: [String],
      default: [],
      set(values) {
        if (!Array.isArray(values)) return [];
        return [
          ...new Set(
            values
              .filter(Boolean)
              .map((value) => String(value).trim().toUpperCase())
              .filter(Boolean)
          ),
        ];
      },
    },
    status: {
      type: String,
      enum: RFQ_STATUSES,
      default: 'OPEN',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: '',
    },
    createdByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    awardedVendorId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    supplierResponses: [
      {
        vendorId: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
        },
        quoteReference: {
          type: String,
          trim: true,
          default: '',
        },
        amountPaisa: {
          type: Number,
          min: 0,
          default: null,
        },
        currency: {
          type: String,
          trim: true,
          uppercase: true,
          default: 'INR',
        },
        receivedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['RECEIVED', 'WITHDRAWN', 'REJECTED', 'SELECTED'],
          default: 'RECEIVED',
        },
      },
    ],
  },
  { timestamps: true }
);

requestForQuotationSchema.index(
  { organisationId: 1, rfqId: 1 },
  { unique: true }
);

requestForQuotationSchema.index({
  organisationId: 1,
  cafeId: 1,
  status: 1,
  deadline: 1,
});

const RequestForQuotation =
  mongoose.models.RequestForQuotation ||
  mongoose.model('RequestForQuotation', requestForQuotationSchema);

module.exports = {
  RequestForQuotation,
  RFQ_STATUSES,
};
