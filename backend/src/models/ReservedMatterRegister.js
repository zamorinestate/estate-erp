'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 15: RESERVED MATTER REGISTER MODEL
 * ============================================================================
 * Defines governance matters strictly reserved to the Board, Shareholders, or
 * Primary Master that CANNOT be bypassed or overridden by operational delegation.
 */

const ReservedMatterRegisterSchema = new mongoose.Schema(
  {
    matterId: {
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
    category: {
      type: String,
      enum: [
        'CAPITAL_EXPENDITURE_ABOVE_THRESHOLD',
        'BORROWING_AND_CREDIT_FACILITIES',
        'MERGERS_ACQUISITIONS_OUTLET_CLOSURE',
        'KEY_MANAGEMENT_PERSONNEL_APPOINTMENT',
        'DIVIDEND_AND_PROFIT_DISTRIBUTION',
        'STATUTORY_SIGNATORY_APPOINTMENT',
        'TECHNICAL_ROOT_AND_SECRETS_ADMIN',
        'OTHER_RESERVED_MATTER',
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    reservedToAuthority: {
      type: String,
      enum: ['BOARD_OF_DIRECTORS', 'SHAREHOLDERS_GENERAL_MEETING', 'PRIMARY_MASTER_TECHNICAL', 'OWNER_EXECUTIVE'],
      required: true,
    },
    statutoryProvisionRef: {
      type: String,
      default: 'Companies Act 2013 s. 179 / Articles of Association',
    },
    delegationAllowed: {
      type: Boolean,
      default: false, // Default is strictly false
    },
    delegationConditions: {
      type: String,
      default: 'PROHIBITED — RESERVED TO GOVERNING BODY',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

ReservedMatterRegisterSchema.index({ organisationId: 1, matterId: 1 }, { unique: true });
ReservedMatterRegisterSchema.index({ organisationId: 1, category: 1 });

const ReservedMatterRegister = mongoose.models.ReservedMatterRegister || mongoose.model(
  'ReservedMatterRegister',
  ReservedMatterRegisterSchema
);
ReservedMatterRegister.ReservedMatterRegister = ReservedMatterRegister;
ReservedMatterRegister.ReservedMatterRegisterSchema = ReservedMatterRegisterSchema;

module.exports = ReservedMatterRegister;
