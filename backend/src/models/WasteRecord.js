'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: WASTE RECORD MODEL
 * ============================================================================
 * Tracks food waste, packaging waste, and recycling with canonical links to
 * inventory wastage to prevent financial double counting.
 */

const WasteRecordSchema = new mongoose.Schema(
  {
    wasteId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cafeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    wasteCategory: {
      type: String,
      enum: [
        'FOOD_WASTE',
        'PACKAGING_WASTE',
        'USED_COOKING_OIL',
        'RECYCLING',
        'MUNICIPAL_SOLID',
        'OTHER',
      ],
      required: true,
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitOfMeasure: {
      type: String,
      enum: ['KG', 'LITRE', 'UNITS'],
      required: true,
    },
    sourceProcess: {
      type: String,
      enum: ['PREP_WASTE', 'EXPIRED_SPOILED', 'PLATE_WASTE', 'PACKAGING_RECEIPT', 'STORE_OPS'],
      default: 'STORE_OPS',
    },
    reason: {
      type: String,
      required: true,
    },
    inventoryWastageReference: {
      type: String,
      trim: true,
      default: null, // Links to canonical WastageRecord in inventory to prevent double-counting
    },
    costImpactRupees: {
      type: Number,
      default: 0,
    },
    disposalRoute: {
      type: String,
      enum: [
        'AUTHORISED_COLLECTOR',
        'MUNICIPAL_COLLECTION',
        'ON_SITE_COMPOSTING',
        'CERTIFIED_RECYCLER',
        'OTHER',
      ],
      required: true,
    },
    collectorName: {
      type: String,
      trim: true,
      default: null,
    },
    collectorAuthReference: {
      type: String,
      trim: true,
      default: null,
    },
    receiptAttachmentId: {
      type: String,
      default: null,
    },
    recordedByUserId: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

WasteRecordSchema.index({ organisationId: 1, wasteId: 1 }, { unique: true });
WasteRecordSchema.index({ organisationId: 1, cafeId: 1, wasteCategory: 1, date: -1 });

const WasteRecord = mongoose.models.WasteRecord || mongoose.model('WasteRecord', WasteRecordSchema);
WasteRecord.WasteRecord = WasteRecord;
WasteRecord.WasteRecordSchema = WasteRecordSchema;

module.exports = WasteRecord;
