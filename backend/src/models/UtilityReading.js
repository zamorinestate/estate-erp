'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: UTILITY READING MODEL
 * ============================================================================
 * Captures utility readings, verifies period sequence, prevents rollovers/negatives,
 * and validates consumption without IoT telemetry overclaims.
 */

const UtilityReadingSchema = new mongoose.Schema(
  {
    readingId: {
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
    meterId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    utilityType: {
      type: String,
      enum: ['ELECTRICITY', 'WATER', 'LPG_GAS', 'GENERATOR_FUEL', 'OTHER'],
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    startReading: {
      type: Number,
      required: true,
      min: 0,
    },
    endReading: {
      type: Number,
      required: true,
      min: 0,
    },
    consumption: {
      type: Number,
      required: true,
      min: 0,
    },
    unitOfMeasure: {
      type: String,
      required: true,
    },
    readingType: {
      type: String,
      enum: ['ACTUAL', 'ESTIMATED', 'CORRECTED'],
      default: 'ACTUAL',
    },
    costEstimate: {
      type: Number,
      default: 0,
    },
    isAnomaly: {
      type: Boolean,
      default: false,
    },
    anomalyReason: {
      type: String,
      default: '',
    },
    evidenceAttachmentId: {
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

UtilityReadingSchema.index({ organisationId: 1, readingId: 1 }, { unique: true });
UtilityReadingSchema.index({ organisationId: 1, cafeId: 1, meterId: 1, periodEnd: -1 });

const UtilityReading = mongoose.models.UtilityReading || mongoose.model('UtilityReading', UtilityReadingSchema);
UtilityReading.UtilityReading = UtilityReading;
UtilityReading.UtilityReadingSchema = UtilityReadingSchema;

module.exports = UtilityReading;
