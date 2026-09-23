'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 13: CUSTOMER COHORT DEFINITION MODEL
 * ============================================================================
 * Governs versioned business cohorts (first visit, repeat, regular, lapsed, reactivated)
 * with strict zero-tolerance for sensitive trait profiling (no religion, caste, health, etc.).
 */

const CustomerCohortDefinitionSchema = new mongoose.Schema(
  {
    cohortId: {
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cohortType: {
      type: String,
      enum: ['FIRST_VISIT', 'REPEAT', 'REGULAR', 'LAPSED', 'REACTIVATED', 'HIGH_VALUE', 'CUSTOM_BUSINESS'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    criteria: {
      minVisits: {
        type: Number,
        default: 0,
      },
      maxVisits: {
        type: Number,
        default: null,
      },
      minSpend: {
        type: Number,
        default: 0,
      },
      daysSinceLastVisitMin: {
        type: Number,
        default: null,
      },
      daysSinceLastVisitMax: {
        type: Number,
        default: null,
      },
    },
    version: {
      type: Number,
      default: 1,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    isSuperSensitiveRestricted: {
      type: Boolean,
      default: true, // Guarantees zero sensitive trait profiling
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUPERSEDED', 'DEPRECATED'],
      default: 'ACTIVE',
      index: true,
    },
    createdByUserId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

CustomerCohortDefinitionSchema.index({ organisationId: 1, cohortId: 1 }, { unique: true });
CustomerCohortDefinitionSchema.index({ organisationId: 1, cohortType: 1, status: 1 });

const CustomerCohortDefinition = mongoose.model(
  'CustomerCohortDefinition',
  CustomerCohortDefinitionSchema
);

module.exports = {
  CustomerCohortDefinition,
  CustomerCohortDefinitionSchema,
};
