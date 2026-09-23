'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD RECALL MASTER & LIFECYCLE MODEL
 * ============================================================================
 * Governs internal food safety recalls, distinguishing Internal Zamorin Recall ID
 * from optional official FoSCoS Regulatory Recall Reference (FSSAI 18 March 2026 Order).
 * Enforces an 8-state server-validated lifecycle, quarantine quantity reconciliation,
 * customer PII-minimised sales impact tracking, and regulatory communications.
 */

const mongoose = require('mongoose');

const RECALL_LIFECYCLE_STATES = [
  'DETECTED',
  'RISK_ASSESSED',
  'QUARANTINED',
  'RECALL_INITIATED',
  'AFFECTED_STOCK_IDENTIFIED',
  'ACTION_COMPLETED',
  'VERIFIED',
  'CLOSED',
];

const VALID_TRANSITIONS = {
  DETECTED: ['RISK_ASSESSED', 'CLOSED'],
  RISK_ASSESSED: ['QUARANTINED', 'CLOSED'],
  QUARANTINED: ['RECALL_INITIATED', 'CLOSED'],
  RECALL_INITIATED: ['AFFECTED_STOCK_IDENTIFIED', 'CLOSED'],
  AFFECTED_STOCK_IDENTIFIED: ['ACTION_COMPLETED'],
  ACTION_COMPLETED: ['VERIFIED'],
  VERIFIED: ['CLOSED'],
  CLOSED: [], // Terminal state; reopen requires explicit audited action
};

const stockDispositionSchema = new mongoose.Schema(
  {
    cafeId: { type: String, required: true, trim: true, uppercase: true },
    lotId: { type: String, required: true, trim: true },
    originallyIdentifiedQty: { type: Number, required: true, min: 0 },
    quarantinedQty: { type: Number, required: true, min: 0 },
    returnedToSupplierQty: { type: Number, default: 0, min: 0 },
    destroyedQty: { type: Number, default: 0, min: 0 },
    releasedQty: { type: Number, default: 0, min: 0 },
    disposedQty: { type: Number, default: 0, min: 0 },
    dispositionEvidenceAttachmentId: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const affectedSaleSchema = new mongoose.Schema(
  {
    billId: { type: String, required: true, trim: true },
    cafeId: { type: String, required: true, trim: true, uppercase: true },
    soldAt: { type: Date, required: true },
    menuItemId: { type: String, required: true, trim: true },
    menuItemName: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    lotConfidence: {
      type: String,
      enum: ['DIRECT_BOM_CONFIRMED', 'TIME_WINDOW_PROBABLE', 'INDIRECT_ASSOCIATION'],
      default: 'DIRECT_BOM_CONFIRMED',
    },
    // Masked customer identifier for PII minimisation
    maskedCustomerIdentifier: { type: String, trim: true, default: 'ANONYMOUS_OR_MASKED' },
  },
  { _id: false }
);

const recallCommunicationSchema = new mongoose.Schema(
  {
    communicationType: {
      type: String,
      enum: ['REGULATORY_SUBMISSION', 'REGULATORY_NOTIFICATION', 'SUPPLIER_FORMAL_NOTICE', 'CUSTOMER_PUBLIC_ADVISORY', 'INTERNAL_BULLETIN'],
      required: true,
    },
    audience: { type: String, required: true, trim: true },
    authority: { type: String, trim: true, default: 'FSSAI / FoSCoS' },
    communicatedAt: { type: Date, default: Date.now },
    contentReference: { type: String, required: true, trim: true },
    evidenceAttachmentId: { type: String, trim: true, default: null },
    responsiblePerson: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const foodRecallCaseSchema = new mongoose.Schema(
  {
    recallId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    foscosRegulatoryReference: {
      type: String,
      trim: true,
      default: null, // Strictly optional; NEVER fabricated
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ['INTERNAL_INSPECTION', 'SUPPLIER_ALERT', 'FSSAI_ALERT', 'CUSTOMER_COMPLAINT', 'LAB_RESULT'],
      default: 'INTERNAL_INSPECTION',
    },
    detectionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    severity: {
      type: String,
      enum: ['CLASS_I_SERIOUS_HEALTH', 'CLASS_II_TEMPORARY_HEALTH', 'CLASS_III_UNLIKELY_HEALTH', 'INTERNAL_PRECAUTIONARY'],
      required: true,
      default: 'CLASS_II_TEMPORARY_HEALTH',
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    affectedCafes: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'A recall must designate at least one affected café.',
      },
    },
    supplierId: { type: String, trim: true, default: null },
    supplierName: { type: String, trim: true, default: '' },
    ingredientId: { type: String, trim: true, default: null },
    ingredientName: { type: String, trim: true, default: '' },
    sku: { type: String, trim: true, default: '' },
    lotBatch: { type: String, trim: true, default: '' },
    affectedMenuItems: { type: [String], default: [] },
    stockDispositions: {
      type: [stockDispositionSchema],
      default: [],
    },
    potentiallyAffectedSales: {
      type: [affectedSaleSchema],
      default: [],
    },
    communications: {
      type: [recallCommunicationSchema],
      default: [],
    },
    riskAssessment: {
      hazardIdentified: { type: String, default: '' },
      affectedFoodCategory: { type: String, default: '' },
      populationExposure: { type: String, default: '' },
      likelihood: { type: String, enum: ['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'], default: 'POSSIBLE' },
      consequenceSeverity: { type: String, enum: ['INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC'], default: 'MODERATE' },
      traceabilityConfidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', 'PARTIAL'], default: 'HIGH' },
      assessorUserId: { type: String, default: '' },
      assessedAt: { type: Date, default: null },
      methodologyVersion: { type: String, default: 'FSSAI_2026_RECALL_REGULATIONS' },
    },
    // FoSCoS Food Recall Filing Governance (FSSAI Order 18 March 2026)
    regulatoryApplicability: {
      type: String,
      enum: ['NOT_ASSESSED', 'MANDATORY_REGULATORY', 'VOLUNTARY_INTERNAL_ONLY', 'EXEMPT'],
      default: 'NOT_ASSESSED',
      index: true,
    },
    regulatoryAssessment: {
      rationale: { type: String, default: '' },
      assessedBy: { type: String, default: '' },
      assessedAt: { type: Date, default: null },
      closureExemptionReason: { type: String, default: '' },
      closureExemptionAuthorizedBy: { type: String, default: '' },
    },
    foscosFilingStatus: {
      type: String,
      enum: ['NOT_ASSESSED', 'NOT_APPLICABLE', 'REQUIRED_PENDING', 'SUBMITTED', 'ACKNOWLEDGED', 'UPDATED', 'COMPLETED'],
      default: 'NOT_ASSESSED',
      index: true,
    },
    filingRequiredDate: { type: Date, default: null },
    filingCompletedDate: { type: Date, default: null },
    filingEvidenceAttachmentId: { type: String, default: null },
    filingResponsiblePerson: { type: String, default: null },
    authorityNotes: { type: String, default: '' },

    status: {
      type: String,
      enum: RECALL_LIFECYCLE_STATES,
      default: 'DETECTED',
      index: true,
    },
    responsiblePersonUserId: {
      type: String,
      required: true,
      trim: true,
    },
    linkedIncidentId: { type: String, trim: true, default: null },
    linkedCapaId: { type: String, trim: true, default: null },
    evidenceAttachmentIds: { type: [String], default: [] },
    auditHistory: [
      {
        fromState: { type: String },
        toState: { type: String, required: true },
        transitionedBy: { type: String, required: true },
        transitionedAt: { type: Date, default: Date.now },
        rationale: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

foodRecallCaseSchema.index(
  { organisationId: 1, recallId: 1 },
  { unique: true }
);

foodRecallCaseSchema.methods.canTransitionTo = function (nextState) {
  const allowed = VALID_TRANSITIONS[this.status] || [];
  return allowed.includes(nextState);
};

const FoodRecallCase =
  mongoose.models.FoodRecallCase ||
  mongoose.model('FoodRecallCase', foodRecallCaseSchema);

module.exports = {
  FoodRecallCase,
  RECALL_LIFECYCLE_STATES,
  VALID_TRANSITIONS,
};
