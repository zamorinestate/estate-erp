'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 13: LOYALTY RULE VERSION MODEL
 * ============================================================================
 * Tracks versioned earn, redeem, and expiry rules for the canonical loyalty
 * ledger without altering historical points lineage or balances.
 */

const LoyaltyRuleVersionSchema = new mongoose.Schema(
  {
    ruleVersionId: {
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
    programmeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    earnRatePointsPerRupee: {
      type: Number,
      required: true,
      min: 0,
      default: 1, // e.g. 1 pt per ₹10 spent
    },
    spendPerPointEarned: {
      type: Number,
      required: true,
      min: 1,
      default: 10,
    },
    redemptionValueRupeesPerPoint: {
      type: Number,
      required: true,
      min: 0,
      default: 0.25, // e.g. 1 point = ₹0.25
    },
    pointsExpiryMonths: {
      type: Number,
      required: true,
      default: 12,
    },
    minRedemptionPoints: {
      type: Number,
      default: 100,
    },
    maxRedemptionPercentagePerBill: {
      type: Number,
      default: 50, // max 50% of bill payable via loyalty
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    supersededAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'SUPERSEDED'],
      default: 'ACTIVE',
      index: true,
    },
    notes: {
      type: String,
      default: '',
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

LoyaltyRuleVersionSchema.index({ organisationId: 1, ruleVersionId: 1 }, { unique: true });
LoyaltyRuleVersionSchema.index({ organisationId: 1, programmeId: 1, status: 1 });

const LoyaltyRuleVersion = mongoose.model('LoyaltyRuleVersion', LoyaltyRuleVersionSchema);

module.exports = {
  LoyaltyRuleVersion,
  LoyaltyRuleVersionSchema,
};
