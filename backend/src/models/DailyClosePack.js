'use strict';

const mongoose = require('mongoose');

const dailyClosePackSchema = new mongoose.Schema(
  {
    packId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    businessDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    shiftId: {
      type: String,
      trim: true,
      default: '',
    },
    submittedByUserId: {
      type: String,
      required: true,
      trim: true,
    },
    submittedByRole: {
      type: String,
      trim: true,
      default: 'CAFE_ADMIN',
    },
    grossSalesPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    netSalesPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    cashCollectedPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    cashCountedPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    variancePaisa: {
      type: Number,
      default: 0,
    },
    varianceExplanation: {
      type: String,
      trim: true,
      default: '',
    },
    depositChallanNumber: {
      type: String,
      trim: true,
      default: '',
    },
    bankName: {
      type: String,
      trim: true,
      default: '',
    },
    depositAmountPaisa: {
      type: Number,
      default: 0,
      min: 0,
    },
    depositSlipAttached: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'ACKNOWLEDGED', 'RETURNED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    reviewedByUserId: {
      type: String,
      trim: true,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'daily_close_packs',
  }
);

dailyClosePackSchema.index({ organisationId: 1, cafeId: 1, businessDate: 1 }, { unique: true });

module.exports = mongoose.model('DailyClosePack', dailyClosePackSchema);
