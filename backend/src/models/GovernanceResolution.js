'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 15: GOVERNANCE RESOLUTION MODEL
 * ============================================================================
 * Tracks formal resolutions distinguishing Statutory, Articles, Board, and
 * Internal Policy authorities with explicit voting and lifecycle gates.
 */

const GovernanceResolutionSchema = new mongoose.Schema(
  {
    resolutionId: {
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
    meetingId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    resolutionNumber: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    resolutionText: {
      type: String,
      required: true,
    },
    authorityCategory: {
      type: String,
      enum: [
        'STATUTORY',
        'ARTICLES_CONSTITUTION',
        'BOARD_SHAREHOLDER_RESOLUTION',
        'ZAMORIN_INTERNAL_POLICY',
      ],
      required: true,
      index: true,
    },
    proposerName: {
      type: String,
      required: true,
      trim: true,
    },
    votingResult: {
      type: String,
      enum: ['UNANIMOUS_PASS', 'MAJORITY_PASS', 'REJECTED', 'WITHDRAWN', 'PENDING_VOTE'],
      default: 'PENDING_VOTE',
    },
    effectiveDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'REVIEW', 'APPROVED', 'ACTIONED', 'CLOSED'],
      default: 'DRAFT',
      index: true,
    },
    actionItems: [
      {
        description: String,
        assignedToUserId: String,
        dueDate: Date,
        completedAt: Date,
      },
    ],
    supportingDocumentId: {
      type: String,
      default: null,
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

GovernanceResolutionSchema.index({ organisationId: 1, resolutionId: 1 }, { unique: true });
GovernanceResolutionSchema.index({ organisationId: 1, status: 1 });

const GovernanceResolution = mongoose.models.GovernanceResolution || mongoose.model(
  'GovernanceResolution',
  GovernanceResolutionSchema
);
GovernanceResolution.GovernanceResolution = GovernanceResolution;
GovernanceResolution.GovernanceResolutionSchema = GovernanceResolutionSchema;

module.exports = GovernanceResolution;
