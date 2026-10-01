'use strict';

const mongoose = require('mongoose');

const QUALITY_HOLD_STATUSES = ['ON_HOLD', 'RELEASED', 'DISPOSED', 'RETURNED_TO_VENDOR'];
const QUALITY_HOLD_DISPOSITIONS = ['RELEASE', 'DISPOSE', 'RETURN_TO_VENDOR'];

const qualityHoldSchema = new mongoose.Schema(
  {
    holdId: {
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
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    inventoryLotId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    supplierLot: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    itemId: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    quantityHeld: {
      type: Number,
      required: true,
      min: 0.000001,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      default: 'units',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: QUALITY_HOLD_STATUSES,
      default: 'ON_HOLD',
      index: true,
    },
    previousInventoryLotStatus: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    placedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    placedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    disposition: {
      type: String,
      enum: [...QUALITY_HOLD_DISPOSITIONS, null],
      default: null,
    },
    dispositionNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    releasedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    auditHistory: [
      {
        action: { type: String, required: true, trim: true, uppercase: true },
        performedByUserId: { type: String, required: true, trim: true, uppercase: true },
        performedAt: { type: Date, default: Date.now },
        notes: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true }
);

qualityHoldSchema.index({ organisationId: 1, holdId: 1 }, { unique: true });
qualityHoldSchema.index({ organisationId: 1, cafeId: 1, status: 1 });
qualityHoldSchema.index({ organisationId: 1, cafeId: 1, inventoryLotId: 1, status: 1 });

const QualityHold =
  mongoose.models.QualityHold ||
  mongoose.model('QualityHold', qualityHoldSchema);

module.exports = {
  QualityHold,
  QUALITY_HOLD_STATUSES,
  QUALITY_HOLD_DISPOSITIONS,
};
