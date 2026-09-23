'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: UTILITY METER MODEL
 * ============================================================================
 * Registers electricity, water, gas, and generator fuel meters at café level.
 */

const UtilityMeterSchema = new mongoose.Schema(
  {
    meterId: {
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
    utilityType: {
      type: String,
      enum: ['ELECTRICITY', 'WATER', 'LPG_GAS', 'GENERATOR_FUEL', 'OTHER'],
      required: true,
      index: true,
    },
    providerName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    meterSerialNumber: {
      type: String,
      required: true,
      trim: true,
    },
    unitOfMeasure: {
      type: String,
      enum: ['KWH', 'LITRE', 'KG', 'CUBIC_METER'],
      required: true,
    },
    readingMethod: {
      type: String,
      enum: ['MANUAL_LOG', 'SMART_METER_MANUAL_IMPORT', 'PROVIDER_BILL_DERIVED'],
      default: 'MANUAL_LOG',
    },
    openingReading: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    multiplier: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'],
      default: 'ACTIVE',
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    createdByUserId: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

UtilityMeterSchema.index({ organisationId: 1, meterId: 1 }, { unique: true });
UtilityMeterSchema.index({ organisationId: 1, cafeId: 1, utilityType: 1 });

const UtilityMeter = mongoose.models.UtilityMeter || mongoose.model('UtilityMeter', UtilityMeterSchema);
UtilityMeter.UtilityMeter = UtilityMeter;
UtilityMeter.UtilityMeterSchema = UtilityMeterSchema;

module.exports = UtilityMeter;
