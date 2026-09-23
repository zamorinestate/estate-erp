'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 12: MENU PRICE PROPOSAL & SIMULATION MODEL
 * ============================================================================
 * Governs evidence-based price proposals, simulations, margin impacts,
 * future-effective scheduling, and approvals without mutating live POS prices.
 */

const MenuPriceProposalSchema = new mongoose.Schema(
  {
    proposalId: {
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
      default: null, // null denotes organisation-wide default
      index: true,
    },
    menuItemId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    currentPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    proposedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    priceDelta: {
      type: Number,
      default: 0,
    },
    priceDeltaPct: {
      type: Number,
      default: 0,
    },
    ingredientCostSnapshot: {
      type: Number,
      default: 0,
    },
    costAvailabilityStatus: {
      type: String,
      enum: ['AVAILABLE', 'COST_UNAVAILABLE_INCOMPLETE_MASTER_DATA'],
      default: 'AVAILABLE',
    },
    projectedVolumeDeltaPct: {
      type: Number,
      default: 0,
    },
    projectedRevenue: {
      type: Number,
      default: 0,
    },
    projectedContribution: {
      type: Number,
      default: 0,
    },
    projectedFoodCostPct: {
      type: Number,
      default: 0,
    },
    taxRatePct: {
      type: Number,
      default: 5, // 5% GST for restaurant service
    },
    projectedTaxEffect: {
      type: Number,
      default: 0,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'EFFECTIVE', 'SUPERSEDED'],
      default: 'DRAFT',
      index: true,
    },
    rationale: {
      type: String,
      required: true,
    },
    proposedByUserId: {
      type: String,
      required: true,
    },
    approvedByUserId: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

MenuPriceProposalSchema.index({ organisationId: 1, proposalId: 1 }, { unique: true });
MenuPriceProposalSchema.index({ organisationId: 1, menuItemId: 1, status: 1 });

const MenuPriceProposal = mongoose.model('MenuPriceProposal', MenuPriceProposalSchema);

module.exports = {
  MenuPriceProposal,
  MenuPriceProposalSchema,
};
