'use strict';

const mongoose = require('mongoose');
const { retentionPolicyService } = require('../services/retentionPolicyService');

const documentVersionSchema = new mongoose.Schema(
  {
    version: {
      type: Number,
      required: true,
    },
    originalFilename: {
      type: String,
      required: true,
      trim: true,
    },
    internalFilename: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    checksum: {
      type: String,
      trim: true,
      default: null,
    },
    sha256: {
      type: String,
      trim: true,
      default: null,
    },
    fileData: {
      type: String,
      default: null,
    },
    fileBuffer: {
      type: Buffer,
      default: null,
      select: false,
    },
    storagePath: {
      type: String,
      trim: true,
      default: null,
    },
    storageKey: {
      type: String,
      trim: true,
      default: null,
    },
    storageObjectKey: {
      type: String,
      trim: true,
      default: null,
    },
    gridFsFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    bucketName: {
      type: String,
      trim: true,
      default: 'zamorinDocuments',
    },
    storageDriver: {
      type: String,
      default: 'GRIDFS',
    },
    storageProvider: {
      type: String,
      default: 'GRIDFS',
    },
    storageContainer: {
      type: String,
      default: null,
    },
    storageVersionId: {
      type: String,
      default: null,
    },
    securityScanStatus: {
      type: String,
      enum: ['PENDING_SCAN', 'CLEAN', 'REJECTED', 'SCAN_FAILED', 'PENDING', 'INFECTED', 'SCANNER_UNAVAILABLE', 'SCAN_ERROR'],
      default: 'PENDING_SCAN',
    },
    scanStatus: {
      type: String,
      enum: ['PENDING', 'PENDING_SCAN', 'CLEAN', 'INFECTED', 'REJECTED', 'SCAN_FAILED', 'SCANNER_UNAVAILABLE', 'SCAN_ERROR'],
      default: 'PENDING_SCAN',
    },
    securityScanDetails: {
      type: String,
      trim: true,
      default: '',
    },
    changeReason: {
      type: String,
      trim: true,
      default: '',
    },
    uploadedBy: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedByUserId: {
      type: String,
      trim: true,
      default: null,
    },
    uploadedByRole: {
      type: String,
      trim: true,
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    // Restoration Provenance (EXT-04)
    restoredFromRevision: {
      type: Number,
      default: null,
    },
    restoredFromBackup: {
      type: Boolean,
      default: false,
    },
    restoredFromGridFsFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    restoredFromBackupTimestamp: {
      type: Date,
      default: null,
    },
    sourceSha256: {
      type: String,
      trim: true,
      default: null,
    },
    sourceScanStatus: {
      type: String,
      default: null,
    },
    restoreReason: {
      type: String,
      trim: true,
      default: null,
    },
    restoreCorrelationId: {
      type: String,
      trim: true,
      default: null,
    },
    restoredAt: {
      type: Date,
      default: null,
    },
    restoredBy: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: true }
);

const businessDocumentSchema = new mongoose.Schema(
  {
    documentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
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
      default: null,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // e.g., 'PURCHASE_ORDER', 'EXPENSE', 'CAFE', 'ASSET', 'INCIDENT', 'EMPLOYEE', 'COMPLIANCE'
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // e.g., PO-1234, EXP-5678
      index: true,
    },
    relatedModule: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    relatedRecordId: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    documentType: {
      type: String,
      required: true,
      trim: true, // e.g., 'SUPPLIER_INVOICE', 'DELIVERY_CHALLAN', 'QUOTATION', 'CREDIT_NOTE', 'EXPENSE_RECEIPT', 'GST_CERTIFICATE'
    },
    classification: {
      type: String,
      enum: [
        'PUBLIC_BUSINESS',
        'INTERNAL',
        'CONFIDENTIAL',
        'RESTRICTED_HR',
        'RESTRICTED_FINANCIAL',
        'MANAGEMENT_CONFIDENTIAL',
        'PROCUREMENT',
        'INVENTORY',
        'FINANCE',
        'HR_SELF',
        'HR_CONFIDENTIAL',
        'SUPPLIER_GENERAL',
        'SUPPLIER_BANKING',
        'COMPLIANCE',
        'ASSET',
      ],
      default: 'PROCUREMENT',
      index: true,
    },
    visibilityScope: {
      type: String,
      enum: ['GLOBAL', 'ORGANISATION_SCOPED', 'CAFE_SCOPED', 'USER_SCOPED'],
      default: 'CAFE_SCOPED',
      index: true,
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    documentNumber: {
      type: String,
      trim: true,
      default: '',
    },
    entityName: {
      type: String,
      trim: true,
      default: '',
    },
    invoiceDate: {
      type: Date,
      default: null,
    },
    expiryDate: {
      type: Date,
      default: null,
      index: true,
    },
    renewalOwner: {
      type: String,
      trim: true,
      default: null,
    },
    supersededBy: {
      type: String,
      trim: true,
      default: null,
    },
    amountPaisa: {
      type: Number,
      min: 0,
      default: null,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    // File Metadata
    originalFilename: {
      type: String,
      required: true,
      trim: true,
    },
    originalFileName: {
      type: String,
      trim: true,
    },
    safeDisplayFileName: {
      type: String,
      trim: true,
    },
    extension: {
      type: String,
      trim: true,
      lowercase: true,
    },
    declaredMimeType: {
      type: String,
      trim: true,
      lowercase: true,
    },
    detectedMimeType: {
      type: String,
      trim: true,
      lowercase: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    fileSizeBytes: {
      type: Number,
      min: 0,
    },
    checksum: {
      type: String,
      trim: true,
      default: null,
    },
    sha256: {
      type: String,
      trim: true,
      default: null,
    },

    // Binary Storage References (Zero provider lock-in)
    storageProvider: {
      type: String,
      trim: true,
      default: 'S3_COMPATIBLE',
      index: true,
    },
    storageContainer: {
      type: String,
      trim: true,
      default: null,
    },
    storageObjectKey: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    gridFsFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    bucketName: {
      type: String,
      trim: true,
      default: 'zamorinDocuments',
    },
    storageKey: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    storageVersionId: {
      type: String,
      trim: true,
      default: null,
    },
    storageRegion: {
      type: String,
      trim: true,
      default: null,
    },
    storagePath: {
      type: String,
      trim: true,
      default: null,
    },
    storageDriver: {
      type: String,
      default: 'GRIDFS',
      index: true,
    },
    quarantineObjectKey: {
      type: String,
      trim: true,
      default: null,
    },

    fileData: {
      type: String,
      default: null,
    },
    fileBuffer: {
      type: Buffer,
      default: null,
      select: false,
    },

    // Upload, Scan, and Document Status State Machines
    uploadStatus: {
      type: String,
      enum: [
        'INITIATED',
        'UPLOADING',
        'UPLOADED',
        'PENDING_SCAN',
        'QUARANTINED',
        'SCANNING',
        'AVAILABLE',
        'UPLOAD_FAILED',
        'VALIDATION_REJECTED',
        'MALWARE_REJECTED',
        'SCAN_FAILED',
        'SCANNER_UNAVAILABLE',
        'MANUAL_REVIEW_REQUIRED',
        'DELETED',
      ],
      default: 'INITIATED',
      index: true,
    },
    scanStatus: {
      type: String,
      enum: ['PENDING', 'PENDING_SCAN', 'CLEAN', 'INFECTED', 'REJECTED', 'SCAN_FAILED', 'SCANNER_UNAVAILABLE', 'SCAN_ERROR'],
      default: 'PENDING_SCAN',
      index: true,
    },
    securityScanStatus: {
      type: String,
      enum: ['PENDING_SCAN', 'CLEAN', 'REJECTED', 'SCAN_FAILED', 'INFECTED', 'SCANNER_UNAVAILABLE'],
      default: 'PENDING_SCAN',
      index: true,
    },
    securityScanDetails: {
      type: String,
      trim: true,
      default: '',
    },
    documentStatus: {
      type: String,
      enum: ['UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUPERSEDED', 'ARCHIVED', 'DISPOSED'],
      default: 'UPLOADED',
      index: true,
    },
    status: {
      type: String,
      enum: ['UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUPERSEDED', 'ARCHIVED', 'DISPOSED'],
      default: 'UPLOADED',
      index: true,
    },

    // Versions
    currentVersion: {
      type: Number,
      default: 1,
    },
    versions: {
      type: [documentVersionSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    // Actor Information & Timestamps
    uploadedBy: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedByUserId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    uploadedByRole: {
      type: String,
      trim: true,
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    availableAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationReason: {
      type: String,
      trim: true,
      default: '',
    },

    // Deletion & Retention
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      default: null,
    },
    deletionReason: {
      type: String,
      default: null,
    },
    retentionClass: {
      type: String,
      trim: true,
      default: 'STANDARD',
    },
    retentionPolicyId: {
      type: String,
      trim: true,
      default: null,
    },
    retentionUntil: {
      type: Date,
      default: null,
      index: true,
    },
    statutoryRecord: {
      type: Boolean,
      default: false,
      index: true,
    },
    financialRecord: {
      type: Boolean,
      default: false,
      index: true,
    },
    legalHold: {
      type: Boolean,
      default: false,
      index: true,
    },
    legalHoldReason: {
      type: String,
      trim: true,
      default: null,
    },
    legalHoldPlacedAt: {
      type: Date,
      default: null,
    },
    legalHoldPlacedBy: {
      type: String,
      trim: true,
      default: null,
    },
    proceedingHold: {
      type: Boolean,
      default: false,
      index: true,
    },
    proceedingHoldReason: {
      type: String,
      trim: true,
      default: null,
    },
    investigationHold: {
      type: Boolean,
      default: false,
      index: true,
    },
    investigationHoldReason: {
      type: String,
      trim: true,
      default: null,
    },

    // GST/CGST Section 36 retention
    financialYear: {
      type: String,
      trim: true,
      default: null,
    },
    annualReturnDueDate: {
      type: Date,
      default: null,
    },
    statutoryRetentionUntil: {
      type: Date,
      default: null,
      index: true,
    },
    organisationRetentionUntil: {
      type: Date,
      default: null,
    },
    effectiveRetentionUntil: {
      type: Date,
      default: null,
      index: true,
    },
    dispositionEligibleAt: {
      type: Date,
      default: null,
    },
    disposedAt: {
      type: Date,
      default: null,
    },
    disposedBy: {
      type: String,
      trim: true,
      default: null,
    },
    dispositionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'business_documents',
  }
);

// Virtuals and bidirectional synchronizers
businessDocumentSchema.pre('validate', function () {
  if (!this.entityType && this.relatedModule) {
    this.entityType = this.relatedModule;
  }
  if (!this.relatedModule && this.entityType) {
    this.relatedModule = this.entityType;
  }
  if (!this.entityId && this.relatedRecordId) {
    this.entityId = this.relatedRecordId;
  }
  if (!this.relatedRecordId && this.entityId) {
    this.relatedRecordId = this.entityId;
  }
  if (!this.originalFileName && this.originalFilename) {
    this.originalFileName = this.originalFilename;
  }
  if (!this.originalFilename && this.originalFileName) {
    this.originalFilename = this.originalFileName;
  }
  if (!this.safeDisplayFileName && this.originalFilename) {
    this.safeDisplayFileName = this.originalFilename;
  }
  if (!this.sha256 && this.checksum) {
    this.sha256 = this.checksum;
  }
  if (!this.checksum && this.sha256) {
    this.checksum = this.sha256;
  }
  if (!this.fileSizeBytes && this.sizeBytes) {
    this.fileSizeBytes = this.sizeBytes;
  }
  if (!this.sizeBytes && this.fileSizeBytes) {
    this.sizeBytes = this.fileSizeBytes;
  }
  if (!this.storageObjectKey && this.storageKey) {
    this.storageObjectKey = this.storageKey;
  }
  if (!this.storageKey && this.storageObjectKey) {
    this.storageKey = this.storageObjectKey;
  }
  if (this.isModified('documentStatus') && this.documentStatus) {
    this.status = this.documentStatus;
  } else if (this.isModified('status') && this.status) {
    this.documentStatus = this.status;
  } else {
    if (!this.documentStatus && this.status) this.documentStatus = this.status;
    if (!this.status && this.documentStatus) this.status = this.documentStatus;
  }
  if (!this.internalFilename && this.documentId) {
    const ext = this.extension || (this.mimeType ? (this.mimeType.includes('pdf') ? 'pdf' : (this.mimeType.includes('png') ? 'png' : 'jpg')) : 'bin');
    this.internalFilename = `${this.documentId}.${ext}`;
  }
  if (!this.scanStatus && this.securityScanStatus) {
    this.scanStatus = this.securityScanStatus === 'CLEAN' ? 'CLEAN' : (this.securityScanStatus === 'REJECTED' ? 'INFECTED' : 'PENDING');
  }
  if (!this.declaredMimeType && this.mimeType) {
    this.declaredMimeType = this.mimeType;
  }
  if (!this.extension && this.originalFilename) {
    const extMatch = this.originalFilename.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) this.extension = extMatch[1].toLowerCase();
  }
});

businessDocumentSchema.pre('save', function (next) {
  const STATUTORY_TYPES = [
    'SUPPLIER_INVOICE',
    'TAX_INVOICE',
    'GST_CERTIFICATE',
    'DELIVERY_CHALLAN',
    'AP_INVOICE',
    'CREDIT_NOTE',
    'DEBIT_NOTE',
    'TAX_SUPPORTING_DOCUMENT',
    'PURCHASE_RECEIPT',
  ];
  if (STATUTORY_TYPES.includes(this.documentType) || this.classification === 'FINANCE' || this.classification === 'COMPLIANCE') {
    this.statutoryRecord = true;
    if (this.classification === 'FINANCE' || (this.documentType && this.documentType.includes('INVOICE'))) {
      this.financialRecord = true;
    }
  }

  if (this.statutoryRecord && !this.statutoryRetentionUntil) {
    const documentDate = this.invoiceDate || this.uploadedAt || new Date();
    const gst = retentionPolicyService.calculateGstStatutoryRetention(documentDate);

    this.financialYear = this.financialYear || gst.financialYear;
    this.annualReturnDueDate = this.annualReturnDueDate || gst.annualReturnDueDate;
    this.statutoryRetentionUntil = gst.statutoryRetentionUntil;
    this.retentionPolicyId = this.retentionPolicyId || 'TAX_RECORDS';

    const orgUntil = this.organisationRetentionUntil ? new Date(this.organisationRetentionUntil) : null;
    const effectiveUntil = (orgUntil && orgUntil > gst.statutoryRetentionUntil)
      ? orgUntil
      : gst.statutoryRetentionUntil;

    this.retentionUntil = effectiveUntil;
    this.effectiveRetentionUntil = effectiveUntil;
    this.dispositionEligibleAt = effectiveUntil;
  }
  if (typeof next === 'function') {
    next();
  }
});

businessDocumentSchema.virtual('version').get(function () {
  return this.currentVersion;
}).set(function (v) {
  this.currentVersion = v;
});

businessDocumentSchema.virtual('isPrivate').get(function () {
  return this.visibilityScope !== 'PUBLIC';
});

businessDocumentSchema.virtual('isQuarantined').get(function () {
  return this.uploadStatus === 'QUARANTINED' || Boolean(this.quarantineObjectKey && !this.storageObjectKey);
});

documentVersionSchema.virtual('versionNumber').get(function () {
  return this.version;
});

businessDocumentSchema.index({ organisationId: 1, entityType: 1, entityId: 1 });
businessDocumentSchema.index({ organisationId: 1, relatedModule: 1, relatedRecordId: 1 });
businessDocumentSchema.index({ organisationId: 1, cafeId: 1, isDeleted: 1 });

const BusinessDocument =
  mongoose.models.BusinessDocument ||
  mongoose.model('BusinessDocument', businessDocumentSchema);

module.exports = {
  BusinessDocument,
};
