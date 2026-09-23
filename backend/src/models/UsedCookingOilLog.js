'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: USED COOKING OIL (RUCO) LOG MODEL
 * ============================================================================
 * Enforces FSSAI RUCO guidance: monitors frying oil quality, strictly enforces
 * Total Polar Compounds (TPC) <= 25% boundary, prohibits discarded oil from
 * re-entering food inventory, and tracks authorised disposal evidence.
 */

const UsedCookingOilLogSchema = new mongoose.Schema(
  {
    ucoLogId: {
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
    oilType: {
      type: String,
      default: 'VEGETABLE_COOKING_OIL',
      trim: true,
    },
    logDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    fryingStationRef: {
      type: String,
      default: 'FRYER_STATION_1',
    },
    tpcReadingPct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    tpcMeasurementMethod: {
      type: String,
      enum: ['DIGITAL_TESTER_PROBE', 'CALIBRATED_SENSOR_STRIP', 'EXTERNAL_LAB_TEST'],
      default: 'DIGITAL_TESTER_PROBE',
    },
    tpcLimitThresholdPct: {
      type: Number,
      default: 25.0, // FSSAI RUCO statutory limit
    },
    isAboveSafetyLimit: {
      type: Boolean,
      default: false,
    },
    actionTaken: {
      type: String,
      enum: ['CONTINUE_MONITORED_USE', 'DISCARDED_FOR_COLLECTION', 'REPLACED_FRESH_OIL'],
      default: 'CONTINUE_MONITORED_USE',
    },
    quantityDiscardedLitres: {
      type: Number,
      default: 0,
      min: 0,
    },
    disposalQuantityLitres: {
      type: Number,
      default: 0,
      min: 0,
    },
    authorisedCollectorName: {
      type: String,
      trim: true,
      default: null,
    },
    collectorAuthCertificateRef: {
      type: String,
      trim: true,
      default: null,
    },
    collectionReceiptAttachmentId: {
      type: String,
      default: null,
    },
    reentryBlocked: {
      type: Boolean,
      default: true, // Guarantees discarded oil CANNOT be returned to food inventory
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

UsedCookingOilLogSchema.index({ organisationId: 1, ucoLogId: 1 }, { unique: true });
UsedCookingOilLogSchema.index({ organisationId: 1, cafeId: 1, logDate: -1 });

const UsedCookingOilLog = mongoose.models.UsedCookingOilLog || mongoose.model('UsedCookingOilLog', UsedCookingOilLogSchema);
UsedCookingOilLog.UsedCookingOilLog = UsedCookingOilLog;
UsedCookingOilLog.UsedCookingOilLogSchema = UsedCookingOilLogSchema;

module.exports = UsedCookingOilLog;
