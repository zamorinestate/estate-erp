'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 12: MENU LABELLING APPLICABILITY MODEL
 * ============================================================================
 * Evaluates food-service menu display applicability under FSSAI Labelling and
 * Display Regulations, 2020 (Central licence or >=10 outlets criteria).
 */

const MenuLabellingApplicabilitySchema = new mongoose.Schema(
  {
    applicabilityId: {
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
      trim: true,
      default: null,
      index: true,
    },
    fssaiLicenceType: {
      type: String,
      enum: ['CENTRAL_LICENCE', 'STATE_LICENCE', 'BASIC_REGISTRATION'],
      required: true,
    },
    totalOperationalOutlets: {
      type: Number,
      required: true,
      min: 1,
    },
    qualifiesForMandatoryMenuLabelling: {
      type: Boolean,
      required: true,
      index: true,
    },
    qualificationCriteriaMet: [
      {
        type: String,
      },
    ],
    exemptionsApplied: [
      {
        type: String,
      },
    ],
    statutoryDisplayRequirements: {
      calorificValuePerServing: {
        type: Boolean,
        default: false,
      },
      servingSize: {
        type: Boolean,
        default: false,
      },
      adultCalorieReferenceMessage: {
        type: Boolean,
        default: false,
      },
      allergenInformation: {
        type: Boolean,
        default: false,
      },
      vegNonVegLogo: {
        type: Boolean,
        default: true, // Universal FSSAI requirement
      },
      nutritionalInfoOnRequest: {
        type: Boolean,
        default: false,
      },
      eCommerceListingSync: {
        type: Boolean,
        default: false,
      },
    },
    ruleVersion: {
      type: String,
      default: 'FSSAI_LABELLING_DISPLAY_REGULATIONS_2020_AMENDED',
    },
    evaluationDate: {
      type: Date,
      default: Date.now,
    },
    evaluatedByUserId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

MenuLabellingApplicabilitySchema.index({ organisationId: 1, applicabilityId: 1 }, { unique: true });
MenuLabellingApplicabilitySchema.index({ organisationId: 1, cafeId: 1 });

const MenuLabellingApplicability = mongoose.model(
  'MenuLabellingApplicability',
  MenuLabellingApplicabilitySchema
);

module.exports = {
  MenuLabellingApplicability,
  MenuLabellingApplicabilitySchema,
};
