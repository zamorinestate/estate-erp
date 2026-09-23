'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — HYGIENE CHECKLIST TEMPLATE MODEL
 * ============================================================================
 * Versioned, immutable hygiene checklist templates covering opening, closing,
 * kitchen hygiene, food-contact surfaces, handwashing, pest control, refrigeration,
 * potable water, storage, and waste management.
 */

const mongoose = require('mongoose');

const CHECKLIST_DOMAINS = [
  'OPENING_HYGIENE',
  'CLOSING_HYGIENE',
  'KITCHEN_HYGIENE',
  'FOOD_CONTACT_SURFACES',
  'HANDWASHING_SANITATION',
  'PERSONAL_HYGIENE',
  'CLEANING_SCHEDULE',
  'PEST_CONTROL_EVIDENCE',
  'POTABLE_WATER_TESTING',
  'REFRIGERATION_FREEZER_CHECKS',
  'DRY_COLD_STORAGE',
  'WASTE_HANDLING',
  'CORRECTIVE_ACTIONS',
];

const TEMPLATE_CLASSIFICATIONS = [
  'STATUTORY_SCHEDULE_4',
  'FSMS_REQUIREMENT',
  'INTERNAL_CONTROL',
  'CAFE_SPECIFIC',
];

const SCHEDULE_4_PARTS = [
  'PART_I',   // Petty food business operators applying for registration
  'PART_II',  // Manufacturing / processing / packaging / storage / distribution
  'PART_III', // Milk and milk products (dedicated dairy only)
  'PART_IV',  // Slaughterhouse / meat processing
  'PART_V',   // Catering / food service establishments (Zamorin Café primary baseline)
  'NOT_APPLICABLE',
];

const KINDS_OF_BUSINESS = [
  'FOOD_SERVICE_RESTAURANT_CAFE',
  'PETTY_FOOD_BUSINESS',
  'MANUFACTURING_PROCESSING',
  'MILK_PROCESSING',
  'CATERING',
];

const CHECKLIST_FREQUENCIES = [
  'DAILY_OPENING',
  'DAILY_CLOSING',
  'DAILY_MIDDAY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SHIFT_HANDOVER',
  'AD_HOC',
];

const QUESTION_RESPONSE_TYPES = [
  'PASS_FAIL_NA',
  'NUMERIC_VALUE',
  'TEMPERATURE_C',
  'TEXT_OBSERVATION',
];

const checklistQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    guidance: { type: String, trim: true, default: '' },
    domain: { type: String, enum: CHECKLIST_DOMAINS, required: true },
    responseType: { type: String, enum: QUESTION_RESPONSE_TYPES, default: 'PASS_FAIL_NA' },
    mandatoryEvidence: { type: Boolean, default: false },
    exceptionThreshold: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      failingResponses: { type: [String], default: ['FAIL'] },
    },
    criticality: {
      type: String,
      enum: ['STANDARD', 'MAJOR', 'CRITICAL'],
      default: 'STANDARD',
    },
  },
  { _id: false }
);

const hygieneChecklistTemplateSchema = new mongoose.Schema(
  {
    templateId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    frequency: {
      type: String,
      enum: CHECKLIST_FREQUENCIES,
      required: true,
    },
    classification: {
      type: String,
      enum: TEMPLATE_CLASSIFICATIONS,
      default: 'STATUTORY_SCHEDULE_4',
    },
    schedule4Part: {
      type: String,
      enum: SCHEDULE_4_PARTS,
      default: 'PART_V',
    },
    kindOfBusiness: {
      type: String,
      enum: KINDS_OF_BUSINESS,
      default: 'FOOD_SERVICE_RESTAURANT_CAFE',
    },
    applicableCafes: {
      type: [String],
      default: [], // Empty array indicates estate-wide (all cafes)
    },
    applicableRoles: {
      type: [String],
      default: ['CAFE_ADMIN', 'STAFF', 'MASTER', 'OWNER'],
    },
    responsibleRole: {
      type: String,
      default: 'CAFE_ADMIN',
    },
    approverRole: {
      type: String,
      default: 'OWNER',
    },
    questions: {
      type: [checklistQuestionSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'A checklist template must contain at least one question.',
      },
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    supersededDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    createdByUserId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

hygieneChecklistTemplateSchema.index(
  { organisationId: 1, templateId: 1, version: 1 },
  { unique: true }
);

hygieneChecklistTemplateSchema.index(
  { organisationId: 1, status: 1, frequency: 1 }
);

const HygieneChecklistTemplate =
  mongoose.models.HygieneChecklistTemplate ||
  mongoose.model('HygieneChecklistTemplate', hygieneChecklistTemplateSchema);

module.exports = {
  HygieneChecklistTemplate,
  CHECKLIST_DOMAINS,
  TEMPLATE_CLASSIFICATIONS,
  SCHEDULE_4_PARTS,
  KINDS_OF_BUSINESS,
  CHECKLIST_FREQUENCIES,
  QUESTION_RESPONSE_TYPES,
};
