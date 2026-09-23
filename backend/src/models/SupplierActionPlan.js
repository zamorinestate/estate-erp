'use strict';

const mongoose = require('mongoose');

const supplierActionPlanSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    vendorId: {
      type: String,
      required: true,
      index: true,
    },
    actionId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    finding: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['QUALITY_DEFECT', 'DELIVERY_DELAY', 'PRICE_VARIANCE', 'COMPLIANCE_GAP', 'INVOICE_MISMATCH', 'OTHER'],
      default: 'QUALITY_DEFECT',
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    actionRequired: {
      type: String,
      required: true,
      trim: true,
    },
    responsibleOwner: {
      type: String,
      required: true,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'VERIFIED', 'CLOSED', 'CANCELLED'],
      default: 'OPEN',
      index: true,
    },
    evidenceNotes: {
      type: String,
      default: '',
    },
    evidenceAttachmentIds: [
      {
        type: String,
      },
    ],
    verifiedBy: {
      type: String,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    closureReason: {
      type: String,
      default: null,
    },
    linkedRiskId: {
      type: String,
      default: null,
    },
    linkedContractId: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

supplierActionPlanSchema.index({ organisationId: 1, actionId: 1 }, { unique: true });
supplierActionPlanSchema.index({ organisationId: 1, vendorId: 1, status: 1 });

const SupplierActionPlan = mongoose.model('SupplierActionPlan', supplierActionPlanSchema);

module.exports = { SupplierActionPlan };
