'use strict';

/**
 * TrashEntry — SCR-024
 *
 * Authoritative record of soft-deleted, recoverable ERP items with retention
 * countdowns, preservation holds, and domain-aware restoration metadata.
 *
 * RULES:
 *   1. Every soft-deleted item enters Trash with source-module context and owner.
 *   2. Retention starts from DeletedAt, CreatedAt, or EventDate as defined by policy.
 *   3. Active preservation holds strictly prevent irreversible disposition.
 *   4. Deleted items preserve payload snapshots and file references for safe restoration.
 *   5. Permanent disposition deletes payloads and leaves minimal audit references only.
 */

const mongoose = require('mongoose');

const SOURCE_MODULES = [
  'INVENTORY',
  'MENU',
  'VENDOR',
  'CUSTOMERS',
  'DEPARTMENT_ORDERS',
  'ASSETS',
  'EXPENSES',
  'QUALITY',
  'EMPLOYEES',
  'PROCUREMENT',
  'DOCUMENTS',
  'COMMUNICATIONS',
  'GENERAL',
];

const DELETE_REASONS = [
  'DUPLICATE',
  'MISTAKE',
  'REPLACED',
  'INCORRECT_RECORD',
  'NO_LONGER_REQUIRED',
  'TEST_DATA',
  'SUPERSEDED',
  'OTHER',
];

const LIFECYCLE_STATUSES = [
  'RECOVERABLE',
  'EXPIRING_SOON',
  'RETENTION_COMPLETE',
  'ON_HOLD',
  'DISPOSITION_REVIEW',
  'DISPOSITION_APPROVED',
  'DISPOSITION_PROCESSING',
  'DISPOSED',
  'RESTORED',
];

const RESTORE_ELIGIBILITIES = [
  'ELIGIBLE',
  'ELIGIBLE_WITH_WARNINGS',
  'CONFLICT',
  'PARENT_DELETED',
  'BLOCKED_BY_POLICY',
];

const holdSchema = new mongoose.Schema(
  {
    holdId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    scope: {
      type: String,
      enum: ['RECORD', 'MODULE', 'LEGAL_REVIEW', 'AUDIT_HOLD'],
      default: 'RECORD',
    },
    placedByUserId: {
      type: String,
      required: true,
      trim: true,
    },
    placedByName: {
      type: String,
      default: '',
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
    reviewDate: {
      type: Date,
      default: null,
    },
    releasedByUserId: {
      type: String,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releaseReason: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const trashEntrySchema = new mongoose.Schema(
  {
    trashId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      match: /^TRASH-\d{6}-\d{5}$/,
    },

    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'GLOBAL',
      index: true,
    },

    sourceModule: {
      type: String,
      required: true,
      enum: SOURCE_MODULES,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    entityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    recordReference: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    recordTitle: {
      type: String,
      required: true,
      trim: true,
    },

    originalStatus: {
      type: String,
      trim: true,
      default: 'ACTIVE',
    },

    deletedByUserId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    deletedByName: {
      type: String,
      trim: true,
      default: '',
    },

    deletedByRole: {
      type: String,
      trim: true,
      default: 'MASTER',
    },

    deletedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    deleteReason: {
      type: String,
      enum: DELETE_REASONS,
      default: 'NO_LONGER_REQUIRED',
    },

    deleteNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    deleteBatchId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    retentionPolicyId: {
      type: String,
      trim: true,
      default: 'RET-DEFAULT-30D',
      index: true,
    },

    retentionPolicyVersion: {
      type: Number,
      default: 1,
    },

    retentionStartBasis: {
      type: String,
      enum: ['DELETED_AT', 'CREATED_AT', 'EVENT_DRIVEN'],
      default: 'DELETED_AT',
    },

    retentionStartAt: {
      type: Date,
      default: Date.now,
    },

    retentionDurationDays: {
      type: Number,
      default: 30,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    holdState: {
      type: String,
      enum: ['NONE', 'ACTIVE'],
      default: 'NONE',
      index: true,
    },

    holds: {
      type: [holdSchema],
      default: [],
    },

    lifecycleStatus: {
      type: String,
      enum: LIFECYCLE_STATUSES,
      default: 'RECOVERABLE',
      index: true,
    },

    restoreEligibility: {
      type: String,
      enum: RESTORE_ELIGIBILITIES,
      default: 'ELIGIBLE',
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    attachments: {
      type: [
        {
          // Legacy display/reference fields are retained for restoration and
          // backward compatibility. Permanent disposition must never infer a
          // provider locator from storageUrl or legacy fileId.
          fileId: String,
          fileName: String,
          mimeType: String,
          fileSize: Number,
          storageUrl: String,

          // Canonical deletion locators. At least one of these must be present
          // before an attachment is eligible for verified permanent deletion.
          storageKey: {
            type: String,
            trim: true,
            default: null,
          },
          gridFsFileId: {
            type: String,
            trim: true,
            default: null,
          },
          storageProvider: {
            type: String,
            trim: true,
            uppercase: true,
            default: null,
          },
        },
      ],
      default: [],
    },

    restoredAt: {
      type: Date,
      default: null,
    },

    restoredByUserId: {
      type: String,
      default: null,
    },

    dispositionRequestId: {
      type: String,
      default: null,
    },

    dispositionRequestedByUserId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    dispositionRequestedAt: {
      type: Date,
      default: null,
    },

    dispositionJustification: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    dispositionApprovedByUserId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    dispositionApprovedAt: {
      type: Date,
      default: null,
    },

    dispositionApprovalReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    dispositionProcessingStartedAt: {
      type: Date,
      default: null,
    },

    dispositionProcessingStartedByUserId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    dispositionExecutionAuthorizationAuditEventId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    dispositionStorageStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'VERIFIED_DELETED', 'FAILED'],
      default: 'NOT_REQUIRED',
      index: true,
    },

    dispositionStorageVerifiedAt: {
      type: Date,
      default: null,
    },

    dispositionStorageLastAttemptAt: {
      type: Date,
      default: null,
    },

    dispositionStorageLastError: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    dispositionStorageSummary: {
      totalAttachments: { type: Number, min: 0, default: 0 },
      verifiedDeleted: { type: Number, min: 0, default: 0 },
      alreadyMissing: { type: Number, min: 0, default: 0 },
      locatorTypes: { type: [String], default: [] },
    },

    dispositionCertificateId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'trash_entries',
  }
);

trashEntrySchema.index({ organisationId: 1, lifecycleStatus: 1, expiresAt: 1 });
trashEntrySchema.index({ organisationId: 1, sourceModule: 1, deletedAt: -1 });

/**
 * Calculate effective lifecycle status
 */
trashEntrySchema.methods.calculateStatus = function (now = new Date()) {
  if (this.lifecycleStatus === 'RESTORED' || this.lifecycleStatus === 'DISPOSED') {
    return this.lifecycleStatus;
  }
  const hasActiveHold = this.holds.some((h) => !h.releasedAt);
  if (hasActiveHold) return 'ON_HOLD';
  if (this.lifecycleStatus === 'DISPOSITION_REVIEW' || this.lifecycleStatus === 'DISPOSITION_APPROVED' || this.lifecycleStatus === 'DISPOSITION_PROCESSING') {
    return this.lifecycleStatus;
  }
  if (now > this.expiresAt) return 'RETENTION_COMPLETE';
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (this.expiresAt <= sevenDaysFromNow) return 'EXPIRING_SOON';
  return 'RECOVERABLE';
};

const TrashEntry = mongoose.model('TrashEntry', trashEntrySchema);

module.exports = {
  TrashEntry,
  SOURCE_MODULES,
  DELETE_REASONS,
  LIFECYCLE_STATUSES,
  RESTORE_ELIGIBILITIES,
};
