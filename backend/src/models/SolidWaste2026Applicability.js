'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 14: SOLID WASTE MANAGEMENT 2026 APPLICABILITY MODEL
 * ============================================================================
 * Evaluates generator obligations under MoEFCC Solid Waste Management Rules, 2026
 * (S.O. 388(E) dated 27 January 2026). Decouples Bulk Waste Generator (BWG) status
 * based on actual premises area/waste thresholds (never hardcodes all cafés as BWG).
 */

const SolidWaste2026ApplicabilitySchema = new mongoose.Schema(
  {
    recordId: {
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
    statutoryRuleVersion: {
      type: String,
      default: 'SWM_RULES_2026_CPCB_MOEFCC',
    },
    floorAreaSqMetres: {
      type: Number,
      default: 250,
      min: 0,
    },
    dailyWaterConsumptionLitres: {
      type: Number,
      default: 1500,
      min: 0,
    },
    premisesPlinthAreaSqMetres: {
      type: Number,
      default: 250,
      min: 0,
    },
    averageDailyWasteGeneratedKg: {
      type: Number,
      required: true,
      min: 0,
    },
    isBulkWasteGenerator: {
      type: Boolean,
      required: true,
      index: true,
    },
    bwgClassificationCriteria: {
      type: String,
      default: 'NONE_TRIGGERED_STANDARD_GENERATOR',
    },
    bwgCriteriaTriggered: [
      {
        type: String,
      },
    ],
    mandatedSegregationStreams: [
      {
        type: String, // 'WET', 'DRY', 'SANITARY', 'SPECIAL_CARE'
      },
    ],
    localUrbanBodyName: {
      type: String,
      default: 'Kozhikode Municipal Corporation',
      trim: true,
    },
    localBodyRegistrationRequired: {
      type: Boolean,
      default: false,
    },
    localBodyRegistrationStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'REGISTERED'],
      default: 'NOT_APPLICABLE',
    },
    authorisedCollectorContractRef: {
      type: String,
      trim: true,
      default: null,
    },
    eprProducerImporterStatus: {
      type: String,
      default: 'NOT_EPR_PRODUCER_STANDALONE_FBO', // Prevents false EPR branding liability
    },
    evaluationDate: {
      type: Date,
      default: Date.now,
    },
    evaluatedByUserId: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

SolidWaste2026ApplicabilitySchema.index({ organisationId: 1, recordId: 1 }, { unique: true });
SolidWaste2026ApplicabilitySchema.index({ organisationId: 1, cafeId: 1 }, { unique: true });

const SolidWaste2026Applicability = mongoose.models.SolidWaste2026Applicability || mongoose.model(
  'SolidWaste2026Applicability',
  SolidWaste2026ApplicabilitySchema
);
SolidWaste2026Applicability.SolidWaste2026Applicability = SolidWaste2026Applicability;
SolidWaste2026Applicability.SolidWaste2026ApplicabilitySchema = SolidWaste2026ApplicabilitySchema;

module.exports = SolidWaste2026Applicability;
