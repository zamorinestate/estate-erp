'use strict';

/**
 * PERSONAL LEDGER & OWNER ACCOUNT — MONGOOSE MODEL (SCR-018)
 *
 * AUTHORIZATION:
 *   - PRIMARY MASTER (role = MASTER && isPrimaryMaster === true): Full authority.
 *   - OWNER (role = OWNER): Authorized according to authorized Owner-account scope.
 *   - CAFE_ADMIN and STAFF: Strictly denied; MASTER access requires Primary Master authority.
 *
 * Immutability:
 *   - Financial entries are NEVER deleted. Corrections are made via reversing entries
 *     or controlled classification reversals that preserve complete audit history.
 *
 * Precision:
 *   - Currency: INR only. All amounts stored as integer paise (1 INR = 100 paise).
 */

const mongoose = require('mongoose');

const ENTRY_TYPES = [
  'CREDIT',  // Inflow — money coming in to personal account / amount owed by company
  'DEBIT',   // Outflow — money going out of personal account / amount owed to company
];

const ENTRY_STATUSES = [
  'ACTIVE',     // Counted in balance
  'REVERSED',   // Replaced by a correcting/reversing entry — excluded from balance
];

const ACCOUNT_TYPES = [
  'OWNER_CURRENT_ACCOUNT',
  'PRIMARY_MASTER_PERSONAL_LEDGER',
  'OWNER_FUNDING_ACCOUNT',
  'DIRECTOR_SHAREHOLDER_LOAN',
  'OWNER_RECEIVABLE',
  'REIMBURSEMENT_PAYABLE',
];

const ENTRY_CATEGORIES = [
  // SCR-018 Governed Taxonomy
  'BUSINESS_EXPENSE_PAID_PERSONALLY',
  'COMPANY_PAID_PERSONAL_EXPENSE',
  'FUNDS_ADVANCED_TO_COMPANY',
  'DIRECTOR_LOAN_TO_COMPANY',
  'CURRENT_ACCOUNT_FUNDING',
  'CAPITAL_CONTRIBUTION_REF',
  'REIMBURSEMENT_TO_OWNER',
  'REPAYMENT_OF_LOAN',
  'DECLARED_DIVIDEND_PAYMENT',
  'AMOUNT_RECOVERABLE_FROM_OWNER',
  'APPROVED_SETTLEMENT',
  'CORRECTION',
  // Backward compatibility
  'PERSONAL_TRANSFER',
  'BUSINESS_REIMBURSEMENT',
  'PERSONAL_SPEND',
  'SAVINGS',
  'INVESTMENT',
  'LOAN_GIVEN',
  'LOAN_RECEIVED',
  'LOAN_REPAYMENT',
  'DIVIDEND',
  'WITHDRAWAL',
  'DEPOSIT',
  'OTHER',
];

const ECONOMIC_DIRECTIONS = [
  'DUE_TO_OWNER',       // Company owes Owner (e.g. personal expense paid for business)
  'DUE_FROM_OWNER',     // Owner owes Company (e.g. company paid personal expense)
  'EQUITY_FUNDING',     // Capital / owner equity reference
  'DIVIDEND_PAYABLE',   // Dividend entitlement
  'NEUTRAL',            // Internal transfer / offset
];

const WORKFLOW_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CLASSIFIED',
  'POSTING_PENDING',
  'POSTED',
  'POSTING_FAILED',
  'SETTLED',
  'REVERSED',
];

const ACCOUNTING_TREATMENTS = [
  'PERSONAL',               // Isolated personal movement
  'BUSINESS_EXPENSE',       // Operating P&L cost
  'BUSINESS_ASSET',         // Fixed / capital asset
  'INVENTORY',              // Raw material / stock
  'PREPAID_EXPENSE',        // Deferred asset
  'OWNER_LOAN',             // Formal liability
  'CAPITAL_REFERENCE',      // Equity infusion reference
  'DIVIDEND_PAYABLE',       // Declared dividend liability
  'REIMBURSEMENT_PAYABLE',  // Approved reimbursement
  'OWNER_RECEIVABLE',       // Recoverable from owner
];

const SETTLEMENT_STATUSES = [
  'UNSETTLED',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'NOT_APPLICABLE',
];

const CONFIRMATION_STATUSES = [
  'UNCONFIRMED',
  'CONFIRMED',
  'DISPUTED',
];

const splitSchema = new mongoose.Schema(
  {
    splitId: { type: String, required: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    category: { type: String, required: true },
    accountingTreatment: { type: String, enum: ACCOUNTING_TREATMENTS, default: 'BUSINESS_EXPENSE' },
    targetGLAccount: { type: String, trim: true, default: '' },
    cafeId: { type: String, trim: true, default: null },
    memo: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, default: 'application/pdf' },
    fileUrl: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    checksum: { type: String, default: '' },
    status: { type: String, default: 'CURRENT' },
    version: { type: Number, default: 1 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
  },
  { _id: false }
);

const personalLedgerSchema = new mongoose.Schema(
  {
    // ── Business identifier ──────────────────────────────────────────────────
    ledgerEntryId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^PL-\d{8}-\d{4,}$/,
      index: true,
    },

    voucherNumber: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    // ── Scope & Account Definition ───────────────────────────────────────────
    accountType: {
      type: String,
      enum: ACCOUNT_TYPES,
      default: 'OWNER_CURRENT_ACCOUNT',
      index: true,
    },

    accountHolderId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    ownerUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    legalEntityId: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'LE-ZAMORIN-INDIA',
      index: true,
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    financialYear: {
      type: String,
      trim: true,
      default: '2026-2027',
      index: true,
    },

    // ── Entry Core & Precision ───────────────────────────────────────────────
    entryType: {
      type: String,
      required: true,
      immutable: true,
      enum: ENTRY_TYPES,
    },

    amountPaisa: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'amountPaisa must be an integer (INR stored as paisa).',
      },
    },

    category: {
      type: String,
      required: true,
      enum: ENTRY_CATEGORIES,
      index: true,
    },

    direction: {
      type: String,
      enum: ECONOMIC_DIRECTIONS,
      default: 'NEUTRAL',
      index: true,
    },

    workflowStatus: {
      type: String,
      enum: WORKFLOW_STATUSES,
      default: 'POSTED',
      index: true,
    },

    accountingTreatment: {
      type: String,
      enum: ACCOUNTING_TREATMENTS,
      default: 'PERSONAL',
      index: true,
    },

    businessDate: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    serverTimestamp: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
      index: true,
    },

    // ── Descriptive & Payment References ─────────────────────────────────────
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1000,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: '',
    },

    businessPurpose: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    paymentSource: {
      type: String,
      trim: true,
      default: 'PERSONAL_BANK',
    },

    paymentReference: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    counterparty: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    externalReference: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // ── Splits & Multi-line Allocations ──────────────────────────────────────
    splits: [splitSchema],

    // ── Settlements & Recoveries ─────────────────────────────────────────────
    settlementStatus: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: 'NOT_APPLICABLE',
      index: true,
    },

    settledAmountPaisa: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'settledAmountPaisa must be an integer.',
      },
    },

    outstandingAmountPaisa: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'outstandingAmountPaisa must be an integer.',
      },
    },

    settlementBatchRef: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Finance GL Integration ───────────────────────────────────────────────
    financeJournalRef: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    financePostingStatus: {
      type: String,
      enum: ['NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED'],
      default: 'NOT_POSTED',
      index: true,
    },

    financePostingError: {
      type: String,
      trim: true,
      default: null,
    },

    financePostedAt: {
      type: Date,
      default: null,
    },

    // ── Reversal / Correction Linkage ────────────────────────────────────────
    status: {
      type: String,
      required: true,
      enum: ENTRY_STATUSES,
      default: 'ACTIVE',
      index: true,
    },

    originalEntryId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    reversalReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    correctedByEntryId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    correctedAt: {
      type: Date,
      default: null,
    },

    // ── Evidence & Supporting Documents ──────────────────────────────────────
    evidence: [evidenceSchema],

    attachmentFileId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    // ── India Governance & Statutory Metadata ────────────────────────────────
    complianceReview: {
      directorDeclarationReceived: { type: Boolean, default: false },
      declarationDate: { type: String, default: null },
      sourceOfFundsVerified: { type: Boolean, default: false },
      dpt3Reportable: { type: Boolean, default: false },
      dpt3FilingRef: { type: String, default: null },
      section185ReviewRequired: { type: Boolean, default: false },
      section186ReviewRequired: { type: Boolean, default: false },
      section188RelatedParty: { type: Boolean, default: false },
      relatedPartyRelationship: { type: String, default: null },
      taxReviewState: { type: String, default: 'TAX_REVIEW_NOT_REQUIRED' },
      reviewStatus: { type: String, default: 'DOCUMENTATION_COMPLETE' },
    },

    // ── Owner Balance Confirmation ───────────────────────────────────────────
    confirmationStatus: {
      type: String,
      enum: CONFIRMATION_STATUSES,
      default: 'UNCONFIRMED',
      index: true,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    discrepancyNote: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Audit Actor ──────────────────────────────────────────────────────────
    createdByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    correlationId: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 150,
      default: null,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    optimisticConcurrency: true,
    collection: 'personal_ledger_entries',
  }
);

personalLedgerSchema.index(
  {
    organisationId: 1,
    idempotencyKey: 1,
  },
  {
    name: 'org_idempotency_key',
    unique: true,
    sparse: true,
  }
);

personalLedgerSchema.index(
  {
    organisationId: 1,
    externalReference: 1,
  },
  {
    name: 'org_external_reference_unique',
    unique: true,
    sparse: true,
  }
);

// ── Compound Indexes ─────────────────────────────────────────────────────────

personalLedgerSchema.index(
  {
    ownerUserId: 1,
    organisationId: 1,
    businessDate: -1,
  },
  { name: 'owner_org_date_desc' }
);

personalLedgerSchema.index(
  {
    accountHolderId: 1,
    organisationId: 1,
    status: 1,
    businessDate: -1,
  },
  { name: 'acc_org_status_date' }
);

personalLedgerSchema.index(
  {
    organisationId: 1,
    accountType: 1,
    workflowStatus: 1,
  },
  { name: 'org_acctype_workflow' }
);

// ── Normalise fields ─────────────────────────────────────────────────────────

personalLedgerSchema.pre('validate', function normalisePersonalLedgerFields() {
  const stringFields = [
    'ledgerEntryId',
    'voucherNumber',
    'accountHolderId',
    'ownerUserId',
    'organisationId',
    'legalEntityId',
    'cafeId',
    'originalEntryId',
    'correctedByEntryId',
    'createdByUserId',
    'correlationId',
    'attachmentFileId',
  ];

  for (const field of stringFields) {
    if (this[field] && typeof this[field] === 'string') {
      this[field] = this[field].trim().toUpperCase();
    }
  }

  if (this.idempotencyKey && typeof this.idempotencyKey === 'string') {
    this.idempotencyKey = this.idempotencyKey.trim();
  }

  if (this.externalReference && typeof this.externalReference === 'string') {
    this.externalReference = this.externalReference.trim();
    if (!this.externalReference) this.externalReference = null;
  } else if (!this.externalReference) {
    this.externalReference = null;
  }

  if (this.entryType) {
    this.entryType = this.entryType.trim().toUpperCase();
  }
  if (this.category) {
    this.category = this.category.trim().toUpperCase();
  }
  if (this.status) {
    this.status = this.status.trim().toUpperCase();
  }

  if (!this.voucherNumber && this.ledgerEntryId) {
    this.voucherNumber = this.ledgerEntryId;
  }
  if (!this.accountHolderId && this.ownerUserId) {
    this.accountHolderId = this.ownerUserId;
  }

  // Derive initial economic direction if not explicitly set
  if (!this.direction || this.direction === 'NEUTRAL') {
    if (this.category === 'BUSINESS_EXPENSE_PAID_PERSONALLY' || this.category === 'FUNDS_ADVANCED_TO_COMPANY' || this.category === 'DIRECTOR_LOAN_TO_COMPANY') {
      this.direction = 'DUE_TO_OWNER';
    } else if (this.category === 'COMPANY_PAID_PERSONAL_EXPENSE' || this.category === 'AMOUNT_RECOVERABLE_FROM_OWNER') {
      this.direction = 'DUE_FROM_OWNER';
    } else if (this.category === 'CAPITAL_CONTRIBUTION_REF') {
      this.direction = 'EQUITY_FUNDING';
    } else if (this.category === 'DECLARED_DIVIDEND_PAYMENT' || this.category === 'DIVIDEND') {
      this.direction = 'DIVIDEND_PAYABLE';
    }
  }

  // Initialize outstanding amount for due balances
  if (this.direction === 'DUE_TO_OWNER' || this.direction === 'DUE_FROM_OWNER') {
    if (this.settlementStatus === 'NOT_APPLICABLE') {
      this.settlementStatus = 'UNSETTLED';
    }
    if (this.outstandingAmountPaisa === 0 && this.settledAmountPaisa === 0) {
      this.outstandingAmountPaisa = this.amountPaisa;
    }
  }
});

// ── Guard against direct deletion ────────────────────────────────────────────

const BLOCKED_OPERATIONS = [
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

BLOCKED_OPERATIONS.forEach((op) => {
  personalLedgerSchema.pre(op, function blockPersonalLedgerDeletion() {
    throw new Error(
      'Personal Ledger entries are immutable and cannot be deleted. ' +
      'Post a reversing entry instead.'
    );
  });
});

// ── Virtual: amount in INR (for display) ─────────────────────────────────────

personalLedgerSchema.virtual('amountInr').get(function getAmountInr() {
  return this.amountPaisa / 100;
});

// ── Static: calculate running balance ────────────────────────────────────────

personalLedgerSchema.statics.calculateBalance =
  async function calculateBalance({ ownerUserId, accountHolderId, organisationId }) {
    const matchFilter = {
      organisationId: organisationId.trim().toUpperCase(),
      status: 'ACTIVE',
    };

    if (accountHolderId && ownerUserId) {
      matchFilter.$or = [
        { accountHolderId: accountHolderId.trim().toUpperCase() },
        { ownerUserId: ownerUserId.trim().toUpperCase() },
      ];
    } else if (accountHolderId) {
      matchFilter.accountHolderId = accountHolderId.trim().toUpperCase();
    } else if (ownerUserId) {
      matchFilter.ownerUserId = ownerUserId.trim().toUpperCase();
    }

    const result = await this.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$entryType',
          totalPaisa: { $sum: '$amountPaisa' },
        },
      },
    ]);

    let creditPaisa = 0;
    let debitPaisa = 0;

    for (const row of result) {
      if (row._id === 'CREDIT') creditPaisa = row.totalPaisa;
      if (row._id === 'DEBIT') debitPaisa = row.totalPaisa;
    }

    // Also calculate Due To and Due From balances
    const directionResult = await this.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$direction',
          totalOutstandingPaisa: { $sum: '$outstandingAmountPaisa' },
          totalAmountPaisa: { $sum: '$amountPaisa' },
        },
      },
    ]);

    let dueToOwnerPaisa = 0;
    let dueFromOwnerPaisa = 0;

    for (const row of directionResult) {
      if (row._id === 'DUE_TO_OWNER') dueToOwnerPaisa = row.totalOutstandingPaisa || row.totalAmountPaisa;
      if (row._id === 'DUE_FROM_OWNER') dueFromOwnerPaisa = row.totalOutstandingPaisa || row.totalAmountPaisa;
    }

    return {
      creditPaisa,
      debitPaisa,
      balancePaisa: creditPaisa - debitPaisa,
      dueToOwnerPaisa,
      dueFromOwnerPaisa,
      netCurrentAccountPositionPaisa: dueToOwnerPaisa - dueFromOwnerPaisa,
    };
  };

const PersonalLedger =
  mongoose.models.PersonalLedger ||
  mongoose.model('PersonalLedger', personalLedgerSchema);

module.exports = {
  PersonalLedger,
  ENTRY_TYPES,
  ENTRY_STATUSES,
  ENTRY_CATEGORIES,
  ACCOUNT_TYPES,
  ECONOMIC_DIRECTIONS,
  WORKFLOW_STATUSES,
  ACCOUNTING_TREATMENTS,
  SETTLEMENT_STATUSES,
  CONFIRMATION_STATUSES,
};
