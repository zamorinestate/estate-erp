'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BusinessDocument } = require('../models/BusinessDocument');
const { SequenceCounter } = require('../models/SequenceCounter');
const auditService = require('./auditService');
const { DocumentMalwareScanner, defaultMalwareScanner, StaticFileSecurityValidator, getScannerRuntimeStatus } = require('./security/DocumentMalwareScanner');
const { documentStorageAdapter } = require('./documentStorageAdapter');
const { ApiError } = require('../utils/ApiError');
const { retentionPolicyService } = require('./retentionPolicyService');
const { Vendor } = require('../models/Vendor');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { DuplicateDetectionService } = require('./duplicateDetectionService');

const CANONICAL_PROCUREMENT_DOCUMENT_TYPES = [
  'SUPPLIER_INVOICE',
  'DELIVERY_CHALLAN',
  'PURCHASE_RECEIPT',
  'QUOTATION',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'PACKING_LIST',
  'QUALITY_CERTIFICATE',
  'TAX_SUPPORTING_DOCUMENT',
  'OTHER_PROCUREMENT_DOCUMENT',
];

// Strict extension & MIME validation: PDF, JPG, PNG only
const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
]);

const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

// Disallowed dangerous executable / script extensions
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'ps1', 'sh', 'js', 'html', 'htm', 'svg',
  'vbs', 'jar', 'msi', 'com', 'scr', 'pif', 'php', 'asp', 'aspx', 'jsp',
  'zip', 'rar', 'tar', 'gz', '7z', 'bz2'
]);

const DEFAULT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024; // 15MB hard boundary

class DocumentAttachmentService {
  static getStorageAdapter() {
    return documentStorageAdapter;
  }

  static getMalwareScanner() {
    return defaultMalwareScanner;
  }

  /**
   * Sanitizes and validates filename against traversal, null bytes, and dangerous extensions.
   */
  static sanitizeFilename(rawFilename = '') {
    if (!rawFilename || typeof rawFilename !== 'string') {
      throw new ApiError(400, 'INVALID_FILENAME', 'A valid filename is mandatory.');
    }

    // 1. Null byte and control char check
    if (rawFilename.includes('\0') || /[\x00-\x1f\x7f]/.test(rawFilename)) {
      throw new ApiError(400, 'FILENAME_INJECTION_DETECTED', 'Filename contains prohibited control characters or null bytes.');
    }

    // 2. Traversal patterns check
    const decoded = decodeURIComponent(rawFilename).replace(/\\/g, '/');
    if (decoded.includes('../') || decoded.includes('/..') || decoded.startsWith('..')) {
      throw new ApiError(400, 'DIRECTORY_TRAVERSAL_DETECTED', 'Path traversal characters are prohibited in filenames.');
    }

    const baseName = path.basename(decoded).trim();
    if (!baseName || baseName === '.' || baseName === '..') {
      throw new ApiError(400, 'INVALID_FILENAME', 'Invalid file base name.');
    }

    // 3. Double-extension attack inspection (e.g. invoice.pdf.exe, receipt.jpg.js)
    const parts = baseName.split('.');
    if (parts.length < 2) {
      throw new ApiError(400, 'INVALID_FILE_EXTENSION', 'File must have an explicit extension.');
    }

    const ext = parts[parts.length - 1].toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new ApiError(400, 'UNSUPPORTED_FILE_EXTENSION', `File extension .${ext} is prohibited. Allowed: .pdf, .jpg, .jpeg, .png.`);
    }

    // Check intermediate extensions for disguised executables / scripts / macros
    for (let i = 1; i < parts.length - 1; i++) {
      const intermediate = parts[i].toLowerCase();
      if (DANGEROUS_EXTENSIONS.has(intermediate) || intermediate === 'pdf' || intermediate === 'jpg') {
        throw new ApiError(400, 'DOUBLE_EXTENSION_PROHIBITED', `Double or disguised extension pattern '.${intermediate}.${ext}' detected.`);
      }
    }

    // Safe display filename: strip non-alphanumeric except safe punctuation
    const safeDisplay = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return {
      sanitizedName: baseName,
      safeDisplayFileName: safeDisplay,
      extension: ext,
    };
  }

  static validateFileMime(mimeType, filename = '') {
    const normMime = String(mimeType || '').trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normMime)) {
      throw new ApiError(400, 'UNSUPPORTED_ATTACHMENT_TYPE', `File type ${normMime} is prohibited. Allowed types: PDF, JPG, PNG.`);
    }
    return true;
  }

  static validateFileSize(sizeBytes, maxBytes = DEFAULT_DOCUMENT_MAX_BYTES) {
    if (typeof sizeBytes !== 'number' || isNaN(sizeBytes) || sizeBytes <= 0) {
      throw new ApiError(400, 'ZERO_BYTE_FILE_REJECTED', 'Zero-byte or invalid file size is prohibited.');
    }
    if (sizeBytes > maxBytes) {
      throw new ApiError(400, 'ATTACHMENT_SIZE_EXCEEDED', `File size ${sizeBytes} exceeds maximum permitted limit of ${maxBytes} bytes.`);
    }
    return true;
  }

  static validateMagicBytes(buffer, mimeType) {
    if (!buffer || buffer.length < 4) {
      throw new ApiError(400, 'CORRUPTED_FILE', 'File content is empty or corrupted.');
    }
    const norm = String(mimeType || '').toLowerCase();
    if (norm === 'application/pdf') {
      // PDF magic bytes: %PDF (0x25, 0x50, 0x44, 0x46)
      if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
        throw new ApiError(400, 'INVALID_FILE_SIGNATURE', 'File signature does not match valid PDF specification.');
      }
    } else if (norm === 'image/png') {
      // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        throw new ApiError(400, 'INVALID_FILE_SIGNATURE', 'File signature does not match valid PNG specification.');
      }
    } else if (norm === 'image/jpeg' || norm === 'image/jpg') {
      // JPEG magic bytes: 0xFF, 0xD8, 0xFF
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new ApiError(400, 'INVALID_FILE_SIGNATURE', 'File signature does not match valid JPEG specification.');
      }
    } else {
      throw new ApiError(400, 'UNSUPPORTED_ATTACHMENT_TYPE', `Unsupported MIME: ${norm}`);
    }
    return true;
  }

  static async computeStreamChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  static computeChecksum(bufferOrBase64) {
    if (!bufferOrBase64) return null;
    return crypto.createHash('sha256').update(bufferOrBase64).digest('hex');
  }

  static generateDocumentId(moduleCode = 'DOC', cafeCode = 'ZC01') {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `DOC-${moduleCode}-${cafeCode}-${d}-${rand}`;
  }

  /**
   * Central Authorization & Record-Level Policy Evaluation.
   * Checks actor validity, tenant isolation, café assignment, classification, and document lifecycle.
   */
  static assertDocumentAuthorization(docOrOptions, maybeAuth, maybeAction = 'VIEW') {
    let doc = docOrOptions;
    let auth = maybeAuth;
    let action = maybeAction;
    if (docOrOptions && typeof docOrOptions === 'object' && docOrOptions.doc && docOrOptions.auth) {
      doc = docOrOptions.doc;
      auth = docOrOptions.auth;
      action = docOrOptions.action || maybeAction || 'VIEW';
    }

    if (!auth || !auth.role) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    // 0. Active User Verification (Revoked / disabled user cannot perform document actions)
    if (auth.userStatus === 'DISABLED' || auth.isDisabled === true) {
      throw new ApiError(403, 'USER_DISABLED', 'User account is disabled or revoked.');
    }

    const role = auth.role;
    const isMaster = role === 'MASTER';
    const isOwner = role === 'OWNER';
    const isRegional = role === 'REGIONAL_MANAGER';
    const isCafeAdmin = role === 'CAFE_ADMIN';
    const isStaff = role === 'STAFF';

    // 1. Cross-Organisation Isolation
    if (doc.organisationId && doc.organisationId !== auth.organisationId) {
      throw new ApiError(403, 'CROSS_ORG_ACCESS_DENIED', 'Unauthorized cross-organisation document access.');
    }

    // 2. Cross-Café Isolation
    const docCafe = doc.cafeId || 'GLOBAL';
    if (docCafe !== 'GLOBAL' && !isMaster && !isRegional) {
      const isGlobalAssigned = Array.isArray(auth.assignedCafeIds) && auth.assignedCafeIds.includes('GLOBAL');
      const assigned =
        isGlobalAssigned ||
        (auth.assignedCafeIds && auth.assignedCafeIds.includes(docCafe)) ||
        auth.primaryCafeId === docCafe;
      if (!assigned) {
        throw new ApiError(403, 'CROSS_CAFE_ACCESS_DENIED', 'Unauthorized cross-café document access.');
      }
    }

    const act = String(action || 'VIEW').toUpperCase();

    // 3. Action: PERMANENT_DELETE check must be Master-only FIRST
    if (act === 'PERMANENT_DELETE') {
      if (!isMaster) {
        throw new ApiError(403, 'PERMANENT_DELETE_DENIED', 'Permanent delete is strictly restricted to MASTER.');
      }

      // Legal Hold
      if (doc.legalHold === true) {
        throw new ApiError(400, 'LEGAL_HOLD_ACTIVE', 'Document is under active legal hold. Permanent deletion is prohibited.');
      }

      // Proceeding / Appeal / Revision Hold (Section 36 CGST Proviso)
      if (doc.proceedingHold === true) {
        throw new ApiError(400, 'PROCEEDING_HOLD_ACTIVE', 'Document is subject to an active appeal, revision, or proceeding hold. Permanent deletion is prohibited.');
      }

      // Investigation / Audit Hold
      if (doc.investigationHold === true) {
        throw new ApiError(400, 'INVESTIGATION_HOLD_ACTIVE', 'Document is under active investigation or audit hold. Permanent deletion is prohibited.');
      }

      // Retention Period Check
      let effectiveRetentionUntil = doc.effectiveRetentionUntil || doc.retentionUntil || null;
      if (!effectiveRetentionUntil &&
          (doc.statutoryRecord || doc.financialRecord ||
           (doc.documentType && doc.documentType.includes('INVOICE')))) {
        const documentDate = doc.invoiceDate || doc.uploadedAt || new Date();
        const gst = retentionPolicyService.calculateGstStatutoryRetention(documentDate);
        effectiveRetentionUntil = gst.statutoryRetentionUntil;
      }

      if (effectiveRetentionUntil && new Date() < new Date(effectiveRetentionUntil)) {
        throw new ApiError(
          400,
          'RETENTION_PERIOD_ACTIVE',
          `Document retention period is active until ${new Date(effectiveRetentionUntil).toISOString().slice(0, 10)}. Permanent deletion prohibited.`
        );
      }

      if (doc.dispositionEligibleAt && new Date() < new Date(doc.dispositionEligibleAt)) {
        throw new ApiError(400, 'RETENTION_PERIOD_ACTIVE', 'Document is not yet eligible for disposition.');
      }

      return true;
    }

    // 4. Historical / archived preview and download checks
    if (doc.isDeleted && act !== 'RESTORE') {
      if (doc.status === 'DISPOSED' || doc.documentStatus === 'DISPOSED') {
        throw new ApiError(410, 'DOCUMENT_DISPOSED', 'Document content has been permanently disposed under retention policy.');
      }
      if (!isMaster && !isOwner) {
        throw new ApiError(403, 'ARCHIVED_DOCUMENT_RESTRICTED', 'Archived historical records can only be accessed by authorized historical/audit users.');
      }
      return true;
    }

    // 5. Resource Classification Gate
    const classification = doc.classification || 'PROCUREMENT';

    if (classification === 'MANAGEMENT_CONFIDENTIAL') {
      if (!isMaster && !isOwner) {
        throw new ApiError(403, 'CONFIDENTIAL_RESOURCE_DENIED', 'Management confidential files are restricted to Master and Owner.');
      }
    }

    if (classification === 'SUPPLIER_BANKING') {
      if (isStaff) {
        throw new ApiError(403, 'BANKING_RESOURCE_DENIED', 'Staff are prohibited from viewing supplier banking attachments.');
      }
    }

    if (classification === 'FINANCE' || classification === 'RESTRICTED_FINANCIAL') {
      if (isStaff) {
        throw new ApiError(403, 'FINANCE_RESOURCE_DENIED', 'Staff are prohibited from accessing finance attachments.');
      }
    }

    if (classification === 'HR_CONFIDENTIAL' || classification === 'RESTRICTED_HR') {
      if (isStaff) {
        throw new ApiError(403, 'HR_CONFIDENTIAL_DENIED', 'Staff are prohibited from accessing confidential HR documents.');
      }
    }

    if (classification === 'HR_SELF') {
      if (isStaff) {
        const isOwn =
          (doc.employeeId && doc.employeeId === auth.userId) ||
          (doc.relatedRecordId && doc.relatedRecordId === auth.userId) ||
          (doc.entityId && doc.entityId === auth.userId) ||
          (doc.uploadedByUserId && doc.uploadedByUserId === auth.userId) ||
          (doc.uploadedBy && doc.uploadedBy === auth.userId);
        if (!isOwn) {
          throw new ApiError(403, 'UNRELATED_STAFF_RESOURCE_DENIED', 'Staff cannot access another employee HR records in the same café.');
        }
      }
    }

    // Procurement entity isolation: Staff have no procurement document access
    if (doc.entityType === 'PURCHASE_ORDER' || doc.relatedModule === 'PROCUREMENT') {
      if (isStaff) {
        throw new ApiError(403, 'PROCUREMENT_RESOURCE_DENIED', 'Staff are prohibited from accessing procurement documents.');
      }
    }

    // 6. Action-specific Authorization Matrix
    if (['REPLACE_VERSION', 'TAG_UPDATE', 'LINK_ENTITY', 'EXPIRY_UPDATE'].includes(act)) {
      if (isStaff) {
        throw new ApiError(403, 'ACTION_DENIED_STAFF', `Action ${act} is not permitted for STAFF.`);
      }
    }

    if (['VERIFY', 'REJECT'].includes(act)) {
      if (isStaff) {
        throw new ApiError(403, 'VERIFICATION_DENIED', 'Staff cannot verify or reject documents.');
      }
    }

    if (act === 'SOFT_DELETE' || act === 'ARCHIVE') {
      if (isStaff) {
        throw new ApiError(403, 'DELETE_DENIED', 'Staff cannot delete documents.');
      }
    }

    if (act === 'RESTORE') {
      if (!isMaster && !isOwner) {
        throw new ApiError(403, 'RESTORE_DENIED', 'Only Master and Owner can restore deleted documents.');
      }
    }

    // 7. Content Download & Preview Availability Checks (Strict Fail-Closed on Non-Clean States)
    if (['PREVIEW', 'DOWNLOAD'].includes(act)) {
      if (
        doc.uploadStatus === 'MALWARE_REJECTED' ||
        doc.scanStatus === 'INFECTED' ||
        doc.securityScanStatus === 'REJECTED'
      ) {
        throw new ApiError(403, 'MALWARE_DETECTED', 'Document access blocked: file was rejected by security scanner.');
      }

      if (
        doc.uploadStatus === 'SCAN_FAILED' ||
        doc.scanStatus === 'SCAN_ERROR' ||
        doc.securityScanStatus === 'SCAN_FAILED'
      ) {
        throw new ApiError(423, 'SCAN_FAILED', 'Document is unavailable due to malware scanner failure or outage.');
      }

      if (
        doc.uploadStatus === 'MANUAL_REVIEW_REQUIRED' ||
        doc.scanStatus === 'MANUAL_REVIEW_REQUIRED'
      ) {
        throw new ApiError(423, 'MANUAL_REVIEW_REQUIRED', 'Document is undergoing manual security review and is not downloadable.');
      }

      if (
        doc.uploadStatus === 'QUARANTINED' ||
        doc.uploadStatus === 'SCANNING' ||
        doc.uploadStatus === 'PENDING_SCAN' ||
        doc.scanStatus === 'PENDING' ||
        doc.scanStatus === 'PENDING_SCAN' ||
        (doc.quarantineObjectKey && !doc.storageObjectKey)
      ) {
        // Only allow if document was previously certified CLEAN
        if (doc.securityScanStatus !== 'CLEAN' && doc.scanStatus !== 'CLEAN') {
          throw new ApiError(423, 'SCAN_IN_PROGRESS', 'Document is undergoing quarantine and scanning. Content is not yet available.');
        }
      }

      if (
        doc.uploadStatus === 'UPLOAD_FAILED' ||
        (doc.uploadStatus === 'INITIATED' && doc.quarantineObjectKey && !doc.storageObjectKey)
      ) {
        throw new ApiError(404, 'DOCUMENT_NOT_AVAILABLE', 'Document upload is incomplete or failed.');
      }

      const isAvailable = doc.uploadStatus === 'AVAILABLE' || doc.documentStatus === 'AVAILABLE';
      if (!isAvailable && doc.status !== 'UPLOADED' && doc.status !== 'VERIFIED' && !doc.isDeleted) {
        throw new ApiError(423, 'DOCUMENT_NOT_AVAILABLE', 'Document is not in AVAILABLE state.');
      }
    }

    return true;
  }

  /**
   * Phase 1 of Direct-to-Object-Storage Upload:
   * Authorizes upload intent, validates metadata, generates quarantine key and short-lived upload grant.
   */
  static async initiateUploadIntent({
    organisationId,
    cafeId = null,
    entityType,
    entityId,
    documentType,
    originalFilename,
    declaredMimeType,
    expectedSizeBytes,
    classification = 'PROCUREMENT',
    visibilityScope = 'CAFE_SCOPED',
    documentNumber = '',
    entityName = '',
    invoiceDate = null,
    amountPaisa = null,
    gstin = '',
    notes = '',
    auth,
  }) {
    if (!organisationId || !entityType || !entityId || !documentType || !originalFilename) {
      throw new ApiError(400, 'MISSING_FIELDS', 'Mandatory upload parameters missing.');
    }

    // Validate actor and scopes
    const normFilenameInfo = this.sanitizeFilename(originalFilename);
    const normMime = String(declaredMimeType || '').trim().toLowerCase();
    this.validateFileMime(normMime, normFilenameInfo.sanitizedName);
    this.validateFileSize(expectedSizeBytes);

    // Generate canonical document ID: DOC-<MODULE>-<SEQ>
    const documentId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: 'BUSINESS_DOC',
      prefix: 'DOC',
      minimumDigits: 6,
    });

    const quarantineKey = documentStorageAdapter.generateQuarantineKey({
      organisationId,
      cafeId: cafeId || 'GLOBAL',
      documentId,
      mimeType: normMime,
    });

    // Create short-lived upload grant (e.g. 5-minute presigned PUT)
    const uploadGrant = await documentStorageAdapter.createUploadGrant({
      storageKey: quarantineKey,
      mimeType: normMime,
      sizeBytes: expectedSizeBytes,
      expiresInSeconds: 300,
    });

    const doc = await BusinessDocument.create({
      documentId,
      organisationId,
      cafeId: cafeId || null,
      entityType: entityType.trim().toUpperCase(),
      entityId: entityId.trim().toUpperCase(),
      relatedModule: entityType.trim().toUpperCase(),
      relatedRecordId: entityId.trim().toUpperCase(),
      documentType: documentType.trim(),
      classification,
      visibilityScope,
      documentNumber: documentNumber ? documentNumber.trim() : '',
      entityName: entityName ? entityName.trim() : '',
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      amountPaisa: amountPaisa !== null ? Math.round(amountPaisa) : null,
      gstin: gstin ? gstin.trim().toUpperCase() : '',
      originalFilename: normFilenameInfo.sanitizedName,
      originalFileName: normFilenameInfo.sanitizedName,
      safeDisplayFileName: normFilenameInfo.safeDisplayFileName,
      extension: normFilenameInfo.extension,
      declaredMimeType: normMime,
      mimeType: normMime,
      sizeBytes: expectedSizeBytes,
      fileSizeBytes: expectedSizeBytes,
      quarantineObjectKey: quarantineKey,
      uploadStatus: 'INITIATED',
      scanStatus: 'PENDING',
      securityScanStatus: 'PENDING_SCAN',
      documentStatus: 'UPLOADED',
      status: 'UPLOADED',
      notes,
      uploadedBy: auth.name || auth.userId || 'Operator',
      uploadedByUserId: auth.userId || null,
      uploadedByRole: auth.role || null,
      uploadedAt: new Date(),
    });

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_UPLOAD_INITIATED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: documentId,
      reason: `Initiated upload intent for ${documentType} on ${entityType}:${entityId}`,
      result: 'SUCCESS',
      metadata: {
        documentId,
        quarantineObjectKey: quarantineKey,
        expectedSizeBytes,
        declaredMimeType: normMime,
      },
    }).catch(() => {});

    return {
      documentId,
      uploadGrant,
      quarantineObjectKey: quarantineKey,
      expiresAt: uploadGrant.expiresAt,
    };
  }

  /**
   * Phase 2 of Direct-to-Object-Storage Upload:
   * Validates physical object existence in quarantine, verifies signature, SHA-256,
   * performs malware scan, and promotes to permanent durable storage.
   */
  static async finalizeUpload({ documentId, organisationId, auth, uploadedBytes = null }) {
    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Upload intent document record not found.');
    }

    if (doc.uploadStatus === 'AVAILABLE') {
      return doc; // Already finalized idempotently
    }

    const quarantineKey = doc.quarantineObjectKey;
    if (!quarantineKey) {
      throw new ApiError(400, 'INVALID_UPLOAD_STATE', 'Document lacks active quarantine reference.');
    }

    // 1. Verify object exists in storage
    const exists = await documentStorageAdapter.exists({ storageKey: quarantineKey });
    if (!exists && !uploadedBytes) {
      doc.uploadStatus = 'UPLOAD_FAILED';
      await doc.save();
      throw new ApiError(400, 'STORAGE_OBJECT_MISSING', 'Uploaded binary not found in quarantine storage.');
    }

    // 2. Read object bytes/stream from quarantine for validation & scan
    let binaryBuffer = uploadedBytes;
    if (!binaryBuffer) {
      const stream = await documentStorageAdapter.getStream({ storageKey: quarantineKey });
      const chunks = [];
      binaryBuffer = await new Promise((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    }

    // Check size & zero bytes
    this.validateFileSize(binaryBuffer.length);

    // 3. File signature / Magic-byte verification
    this.validateMagicBytes(binaryBuffer, doc.declaredMimeType || doc.mimeType);

    // 4. Compute cryptographic SHA-256 Checksum
    const sha256 = crypto.createHash('sha256').update(binaryBuffer).digest('hex');

    // 5. Static File Security Validation (Layer 1 Defense-in-depth)
    const staticResult = await StaticFileSecurityValidator.validate({
      buffer: binaryBuffer,
      mimeType: doc.declaredMimeType || doc.mimeType,
      filename: doc.originalFilename,
    });

    if (!staticResult.valid) {
      doc.uploadStatus = 'MALWARE_REJECTED';
      doc.scanStatus = 'INFECTED';
      doc.securityScanStatus = 'REJECTED';
      doc.documentStatus = 'REJECTED';
      doc.status = 'REJECTED';
      doc.securityScanDetails = staticResult.details;
      doc.rejectedAt = new Date();
      await doc.save();

      await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth.userId,
        actorRole: auth.role,
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_MALWARE_REJECTED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `Static security validation failed: ${staticResult.threatName || staticResult.details}`,
        result: 'REJECTED',
        metadata: {
          documentId: doc.documentId,
          threatName: staticResult.threatName,
          classification: 'STATIC_FILE_SECURITY_VALIDATION',
          sha256,
        },
      }).catch(() => {});

      throw new ApiError(400, 'MALWARE_DETECTED', `File rejected by static security validator: ${staticResult.details}`);
    }

    // 6. Production Malware Scanner Dispatch (Layer 2)
    doc.uploadStatus = 'SCANNING';
    await doc.save();

    const scanner = this.getMalwareScanner();
    const scanResult = await scanner.scanObject({
      buffer: binaryBuffer,
      mimeType: doc.declaredMimeType || doc.mimeType,
      filename: doc.originalFilename,
      objectKey: quarantineKey,
    });

    if (scanResult.status === 'INFECTED') {
      doc.uploadStatus = 'MALWARE_REJECTED';
      doc.scanStatus = 'INFECTED';
      doc.securityScanStatus = 'REJECTED';
      doc.documentStatus = 'REJECTED';
      doc.status = 'REJECTED';
      doc.securityScanDetails = scanResult.details;
      doc.rejectedAt = new Date();
      await doc.save();

      // Clean up infected object from quarantine
      await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth.userId,
        actorRole: auth.role,
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_MALWARE_REJECTED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `Malware detected by scanner: ${scanResult.threatName || scanResult.details}`,
        result: 'REJECTED',
        metadata: {
          documentId: doc.documentId,
          threatName: scanResult.threatName,
          sha256,
        },
      }).catch(() => {});

      throw new ApiError(400, 'MALWARE_DETECTED', `File rejected by malware scanner: ${scanResult.details}`);
    }

    if (scanResult.status === 'SCAN_ERROR') {
      // FAIL CLOSED: Never mark clean if scanner fails
      doc.uploadStatus = 'SCAN_FAILED';
      doc.scanStatus = 'SCAN_ERROR';
      doc.securityScanStatus = 'SCAN_FAILED';
      doc.securityScanDetails = scanResult.details;
      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth.userId,
        actorRole: auth.role,
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_SCAN_FAILED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `Malware scanner unavailable or error: ${scanResult.details}`,
        result: 'SCAN_FAILED',
        metadata: {
          documentId: doc.documentId,
          error: scanResult.details,
        },
      }).catch(() => {});

      throw new ApiError(503, 'SCANNER_UNAVAILABLE', 'Malware scanning service unavailable. Document cannot be promoted to AVAILABLE.');
    }

    // 6. Promotion to Permanent Durable Document Storage
    const canonicalKey = documentStorageAdapter.generateStorageKey({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      classification: doc.classification || 'PROCUREMENT',
      documentId: doc.documentId,
      mimeType: doc.declaredMimeType || doc.mimeType,
    });

    // Copy or Put into canonical location
    const putResult = await documentStorageAdapter.put({
      buffer: binaryBuffer,
      storageKey: canonicalKey,
      mimeType: doc.declaredMimeType || doc.mimeType,
      sizeBytes: binaryBuffer.length,
      organisationId,
      metadata: {
        documentId: doc.documentId,
        originalFilename: doc.originalFilename,
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
      },
    });

    // Clean up temporary quarantine object
    if (quarantineKey && quarantineKey !== canonicalKey) {
      await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});
    }

    const internalFilename = `${doc.documentId}.${doc.extension || 'bin'}`;

    doc.uploadStatus = 'AVAILABLE';
    doc.scanStatus = 'CLEAN';
    doc.securityScanStatus = 'CLEAN';
    doc.securityScanDetails = scanResult.details;
    doc.storageKey = canonicalKey;
    doc.storageObjectKey = canonicalKey;
    doc.gridFsFileId = putResult?.gridFsFileId || null;
    doc.bucketName = putResult?.storageContainer || process.env.DOCUMENT_GRIDFS_BUCKET || 'zamorinDocuments';
    doc.storageDriver = putResult?.storageDriver || 'GRIDFS';
    doc.storageProvider = putResult?.storageProvider || 'GRIDFS';
    doc.internalFilename = internalFilename;
    doc.sizeBytes = binaryBuffer.length;
    doc.fileSizeBytes = binaryBuffer.length;
    doc.checksum = sha256;
    doc.sha256 = sha256;
    doc.availableAt = new Date();
    doc.currentVersion = 1;
    doc.versions = [
      {
        version: 1,
        originalFilename: doc.originalFilename,
        internalFilename,
        mimeType: doc.mimeType,
        sizeBytes: binaryBuffer.length,
        checksum: sha256,
        sha256,
        storageKey: canonicalKey,
        storageObjectKey: canonicalKey,
        gridFsFileId: putResult?.gridFsFileId || null,
        bucketName: putResult?.storageContainer || process.env.DOCUMENT_GRIDFS_BUCKET || 'zamorinDocuments',
        storageDriver: putResult?.storageDriver || 'GRIDFS',
        storageProvider: putResult?.storageProvider || 'GRIDFS',
        securityScanStatus: 'CLEAN',
        scanStatus: 'CLEAN',
        securityScanDetails: scanResult.details,
        changeReason: 'Initial upload',
        uploadedBy: auth.name || auth.userId || 'Operator',
        uploadedByUserId: auth.userId || null,
        uploadedByRole: auth.role || null,
        uploadedAt: new Date(),
      },
    ];

    await doc.save();

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_UPLOAD_COMPLETED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: `Uploaded and verified ${doc.documentType} to ${doc.entityType}:${doc.entityId}`,
      result: 'SUCCESS',
      metadata: {
        documentId: doc.documentId,
        storageObjectKey: canonicalKey,
        sha256,
        sizeBytes: binaryBuffer.length,
      },
    }).catch(() => {});

    return doc;
  }

  /**
   * Direct Attach (combines intent, staging, scanning, and persistence for multipart forms)
   */
  static async attachDocument({
    organisationId,
    cafeId = null,
    entityType = null,
    entityId = null,
    relatedModule = null,
    relatedRecordId = null,
    documentType,
    documentNumber = '',
    entityName = '',
    invoiceDate = null,
    amountPaisa = null,
    gstin = '',
    metadata = {},
    originalFilename,
    mimeType,
    sizeBytes,
    tempFilePath = null,
    fileBuffer = null,
    fileBase64 = null,
    classification = 'PROCUREMENT',
    visibilityScope = 'CAFE_SCOPED',
    notes = '',
    auth = {},
  }) {
    const finalEntityType = (entityType || relatedModule || '').trim().toUpperCase();
    const finalEntityId = (entityId || relatedRecordId || '').trim().toUpperCase();

    if (!organisationId || !finalEntityType || !finalEntityId || !documentType || !originalFilename) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      throw new ApiError(400, 'MISSING_FIELDS', 'Mandatory document parameters missing.');
    }

    const normFilenameInfo = this.sanitizeFilename(originalFilename);
    const normMime = String(mimeType || '').trim().toLowerCase();
    this.validateFileMime(normMime, normFilenameInfo.sanitizedName);

    let effectiveSize = sizeBytes;
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      const stat = await fs.promises.stat(tempFilePath);
      effectiveSize = stat.size;
    } else if (fileBuffer) {
      effectiveSize = fileBuffer.length;
    } else if (fileBase64) {
      effectiveSize = Buffer.from(fileBase64, 'base64').length;
    }

    this.validateFileSize(effectiveSize);

    try {
      // 1. Magic bytes validation
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        const fd = await fs.promises.open(tempFilePath, 'r');
        const header = Buffer.alloc(8);
        await fd.read(header, 0, 8, 0);
        await fd.close();
        this.validateMagicBytes(header, normMime);
      } else if (fileBuffer) {
        this.validateMagicBytes(fileBuffer, normMime);
      } else if (fileBase64) {
        const decoded = Buffer.from(fileBase64, 'base64');
        this.validateMagicBytes(decoded, normMime);
      }

      // 2. SHA-256 Checksum Calculation
      let checksum = null;
      let binaryBuffer = fileBuffer;
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        checksum = await this.computeStreamChecksum(tempFilePath);
        binaryBuffer = await fs.promises.readFile(tempFilePath);
      } else if (fileBuffer) {
        checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      } else if (fileBase64) {
        binaryBuffer = Buffer.from(fileBase64, 'base64');
        checksum = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
      }

      // 3a. Static File Security Validation (Layer 1 Defense-in-depth)
      const staticResult = await StaticFileSecurityValidator.validate({
        filePath: tempFilePath,
        buffer: binaryBuffer,
        mimeType: normMime,
        filename: normFilenameInfo.sanitizedName,
      });

      if (!staticResult.valid) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(400, 'MALWARE_DETECTED', `File upload rejected by static security validator: ${staticResult.details}`);
      }

      // 3b. Production Malware Scan (Layer 2)
      const scanResult = await this.getMalwareScanner().scanObject({
        filePath: tempFilePath,
        buffer: binaryBuffer,
        mimeType: normMime,
        filename: normFilenameInfo.sanitizedName,
      });

      if (scanResult.status === 'INFECTED') {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(400, 'MALWARE_DETECTED', `File upload rejected by security scanner: ${scanResult.details}`);
      }

      if (scanResult.status === 'SCAN_ERROR') {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(503, 'SCANNER_UNAVAILABLE', `Scanner unavailable: ${scanResult.details}`);
      }

      // 3c. Procurement Metadata Validations & Duplicate Checks
      const warnings = Array.isArray(metadata.warnings) ? [...metadata.warnings] : [];
      let effectiveGstin = (gstin || metadata.supplierGSTIN || metadata.gstin || '').trim().toUpperCase();

      if (finalEntityType === 'PURCHASE_ORDER' || relatedModule === 'PURCHASE_ORDER') {
        // GSTIN Format Check
        if (effectiveGstin) {
          const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
          if (!GSTIN_REGEX.test(effectiveGstin)) {
            warnings.push('INVALID_GSTIN_FORMAT: Entered GSTIN does not follow standard 15-character statutory format.');
          }
        }

        // Supplier GSTIN Match against Vendor Master
        let poQuery = null;
        try {
          const poFind = PurchaseOrder.findOne({
            purchaseOrderId: finalEntityId,
            organisationId,
          });
          if (poFind && typeof poFind.select === 'function') {
            poQuery = await poFind.select('vendorId orderDate totalPaisa').lean();
          } else {
            poQuery = await poFind;
          }
        } catch (_err) {
          poQuery = null;
        }

        const vendorId = metadata.vendorId || metadata.supplierId || (poQuery ? poQuery.vendorId : null);
        if (vendorId) {
          try {
            if (Vendor && typeof Vendor.findOne === 'function' && Vendor.db?.readyState === 1) {
              const vendor = await Vendor.findOne({ vendorId: String(vendorId).trim().toUpperCase(), organisationId }).lean();
              const vendorGstin = vendor ? (vendor.gstNumber || vendor.gstin || '') : '';
              if (vendorGstin && effectiveGstin) {
                if (vendorGstin.trim().toUpperCase() !== effectiveGstin) {
                  warnings.push(`SUPPLIER_GSTIN_MISMATCH: Invoice GSTIN (${effectiveGstin}) does not match vendor master GSTIN (${vendorGstin}).`);
                }
              }
            }
          } catch (_err) {
            // Non-blocking warning check
          }
        }

        // Duplicate Invoice Check (across organisation or cafe)
        const effectiveInvNum = (documentNumber || metadata.invoiceNumber || '').trim();
        if (effectiveInvNum) {
          try {
            const existingInvDoc = await BusinessDocument.findOne({
              organisationId,
              documentNumber: new RegExp(`^${effectiveInvNum}$`, 'i'),
              isDeleted: false,
              entityId: { $ne: finalEntityId },
            }).select('documentId entityId cafeId').lean();

            if (existingInvDoc) {
              warnings.push(`POSSIBLE_DUPLICATE_SUPPLIER_INVOICE: Invoice ${effectiveInvNum} already linked to ${existingInvDoc.entityId || existingInvDoc.documentId}.`);
            } else if (BusinessDocument.db?.readyState === 1 || PurchaseOrder.db?.readyState === 1) {
              const dupInvoiceResult = await DuplicateDetectionService.checkSupplierInvoiceDuplicates({
                payload: {
                  invoiceNumber: effectiveInvNum,
                  vendorId,
                  amountPaisa,
                },
                organisationId,
                cafeId: null,
              });
              if (dupInvoiceResult && dupInvoiceResult.hasDuplicates) {
                const otherPoMatch = dupInvoiceResult.candidates?.find((c) => c.id && c.id !== finalEntityId);
                if (otherPoMatch) {
                  warnings.push(`POSSIBLE_DUPLICATE_SUPPLIER_INVOICE: Invoice ${effectiveInvNum} already linked to ${otherPoMatch.id || otherPoMatch.type}.`);
                }
              }
            }
          } catch (_err) {
            // Non-blocking duplicate check
          }
        }

        // Duplicate Binary Content Check (within tenant scope)
        if (checksum) {
          try {
            const existingBinaryDoc = await BusinessDocument.findOne({
              organisationId,
              checksum,
              isDeleted: false,
            }).select('documentId entityId relatedRecordId').lean();

            if (existingBinaryDoc) {
              warnings.push(`POSSIBLE_DUPLICATE_BINARY_CONTENT: Document with identical SHA-256 hash already exists (${existingBinaryDoc.documentId}).`);
            } else if (BusinessDocument.db?.readyState === 1) {
              const dupBinaryResult = await DuplicateDetectionService.checkAttachmentDuplicates({
                payload: { checksum },
                organisationId,
              });
              if (dupBinaryResult && dupBinaryResult.hasDuplicates) {
                const otherDocMatch = dupBinaryResult.candidates?.find((c) => c.relatedRecordId !== finalEntityId);
                if (otherDocMatch) {
                  warnings.push(`POSSIBLE_DUPLICATE_BINARY_CONTENT: Document with identical SHA-256 hash already linked to ${otherDocMatch.relatedRecordId || otherDocMatch.documentId}.`);
                }
              }
            }
          } catch (_err) {
            // Non-blocking duplicate check
          }
        }

        // Document Date Plausibility Checks
        const effectiveDocDate = invoiceDate || metadata.documentDate || metadata.invoiceDate || metadata.challanDate;
        if (effectiveDocDate) {
          const docDateObj = new Date(effectiveDocDate);
          const now = new Date();
          now.setHours(now.getHours() + 24); // 24h grace for timezones
          if (docDateObj > now) {
            warnings.push(`FUTURE_DATED_DOCUMENT: Document date (${effectiveDocDate}) is in the future.`);
          }
          if (poQuery && poQuery.orderDate) {
            const poOrderDate = new Date(poQuery.orderDate);
            const diffDays = (poOrderDate - docDateObj) / (1000 * 60 * 60 * 24);
            if (diffDays > 90) {
              warnings.push(`INVOICE_PREDATES_PO: Document date (${effectiveDocDate}) predates PO date (${poQuery.orderDate}) by ${Math.round(diffDays)} days.`);
            }
          }
        }
      }

      const combinedMetadata = {
        ...metadata,
        warnings,
      };

      // 4. Generate Document ID & Canonical Key
      const documentId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'BUSINESS_DOC',
        prefix: 'DOC',
        minimumDigits: 6,
      });

      const internalFilename = `${documentId}.${normFilenameInfo.extension}`;
      const canonicalKey = documentStorageAdapter.generateStorageKey({
        organisationId,
        cafeId: cafeId || 'GLOBAL',
        classification,
        documentId,
        mimeType: normMime,
      });

      // 5. Durable Storage Persistence
      let storedResult = null;
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        storedResult = await documentStorageAdapter.put({
          filePath: tempFilePath,
          storageKey: canonicalKey,
          mimeType: normMime,
          sizeBytes: effectiveSize,
          organisationId,
        });
        await fs.promises.unlink(tempFilePath).catch(() => {});
      } else if (binaryBuffer) {
        storedResult = await documentStorageAdapter.put({
          buffer: binaryBuffer,
          storageKey: canonicalKey,
          mimeType: normMime,
          sizeBytes: effectiveSize,
          organisationId,
        });
      }

      const doc = await BusinessDocument.create({
        documentId,
        organisationId,
        cafeId,
        entityType: finalEntityType,
        entityId: finalEntityId,
        relatedModule: finalEntityType,
        relatedRecordId: finalEntityId,
        documentType: documentType.trim(),
        documentNumber: documentNumber ? documentNumber.trim() : '',
        entityName: entityName ? entityName.trim() : '',
        invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
        amountPaisa: amountPaisa !== null ? Math.round(amountPaisa) : null,
        gstin: effectiveGstin,
        metadata: combinedMetadata,
        originalFilename: normFilenameInfo.sanitizedName,
        originalFileName: normFilenameInfo.sanitizedName,
        safeDisplayFileName: normFilenameInfo.safeDisplayFileName,
        extension: normFilenameInfo.extension,
        internalFilename,
        declaredMimeType: normMime,
        mimeType: normMime,
        sizeBytes: effectiveSize,
        fileSizeBytes: effectiveSize,
        checksum,
        sha256: checksum,
        classification,
        visibilityScope,
        storageKey: storedResult?.storageKey || canonicalKey,
        storageObjectKey: storedResult?.storageKey || canonicalKey,
        gridFsFileId: storedResult?.gridFsFileId || null,
        bucketName: storedResult?.storageContainer || process.env.DOCUMENT_GRIDFS_BUCKET || 'zamorinDocuments',
        storagePath: storedResult?.storagePath || null,
        storageDriver: storedResult?.storageDriver || 'GRIDFS',
        storageProvider: storedResult?.storageProvider || 'GRIDFS',
        uploadStatus: 'AVAILABLE',
        scanStatus: 'CLEAN',
        securityScanStatus: 'CLEAN',
        securityScanDetails: scanResult.details,
        documentStatus: 'UPLOADED',
        status: 'UPLOADED',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            originalFilename: normFilenameInfo.sanitizedName,
            internalFilename,
            mimeType: normMime,
            sizeBytes: effectiveSize,
            checksum,
            sha256: checksum,
            storageKey: storedResult?.storageKey || canonicalKey,
            storageObjectKey: storedResult?.storageKey || canonicalKey,
            gridFsFileId: storedResult?.gridFsFileId || null,
            bucketName: storedResult?.storageContainer || process.env.DOCUMENT_GRIDFS_BUCKET || 'zamorinDocuments',
            storagePath: storedResult?.storagePath || null,
            storageDriver: storedResult?.storageDriver || 'GRIDFS',
            storageProvider: storedResult?.storageProvider || 'GRIDFS',
            securityScanStatus: 'CLEAN',
            scanStatus: 'CLEAN',
            securityScanDetails: scanResult.details,
            changeReason: 'Initial upload',
            uploadedBy: auth.name || auth.userId || 'Operator',
            uploadedByUserId: auth.userId || null,
            uploadedByRole: auth.role || null,
            uploadedAt: new Date(),
          },
        ],
        notes,
        uploadedBy: auth.name || auth.userId || 'Operator',
        uploadedByUserId: auth.userId || null,
        uploadedByRole: auth.role || null,
        uploadedAt: new Date(),
        availableAt: new Date(),
      });

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: cafeId || 'GLOBAL',
        actorUserId: auth.userId,
        actorRole: auth.role,
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_ATTACHED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: documentId,
        reason: `Attached ${documentType} to ${finalEntityType}:${finalEntityId}`,
        result: 'SUCCESS',
        metadata: {
          documentId,
          originalFilename: normFilenameInfo.sanitizedName,
          sizeBytes: effectiveSize,
          mimeType: normMime,
          storageObjectKey: storedResult?.storageKey || canonicalKey,
          sha256: checksum,
        },
      }).catch(() => {});

      return doc;
    } catch (error) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Generates a short-lived download grant for an authorized caller.
   */
  static async createAuthorizedDownloadGrant({ documentId, organisationId, auth, expiresInSeconds = 180 }) {
    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    // Re-authorizes actor against current state
    this.assertDocumentAuthorization(doc, auth, 'DOWNLOAD');

    const key = doc.storageObjectKey || doc.storageKey;
    if (!key) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', 'Document binary key is missing.');
    }

    const grant = await documentStorageAdapter.createDownloadGrant({
      storageKey: key,
      expiresInSeconds,
      safeFilename: doc.safeDisplayFileName || doc.originalFilename,
    });

    // Audit download access (zero secrets or signed URLs in audit!)
    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: `Authorized download grant issued for ${doc.documentId}`,
      result: 'SUCCESS',
      metadata: {
        documentId: doc.documentId,
        entityType: doc.entityType,
        entityId: doc.entityId,
        classification: doc.classification,
        grantType: grant.grantType,
        expiresAt: grant.expiresAt,
      },
    }).catch(() => {});

    return {
      downloadUrl: grant.downloadUrl,
      expiresAt: grant.expiresAt,
      safeFilename: doc.safeDisplayFileName || doc.originalFilename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    };
  }

  /**
   * Replaces document version with an immutable new binary.
   */
  static async replaceVersion({
    documentId,
    organisationId,
    originalFilename,
    mimeType,
    sizeBytes,
    tempFilePath = null,
    fileBuffer = null,
    fileBase64 = null,
    changeReason,
    auth = {},
  }) {
    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    this.assertDocumentAuthorization(doc, auth, 'REPLACE_VERSION');

    if (!changeReason || changeReason.trim().length < 5) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      throw new ApiError(400, 'REASON_REQUIRED', 'A detailed reason (min 5 chars) is mandatory when replacing a document version.');
    }

    const normFilenameInfo = this.sanitizeFilename(originalFilename);
    const normMime = String(mimeType || '').trim().toLowerCase();
    this.validateFileMime(normMime, normFilenameInfo.sanitizedName);

    let effectiveSize = sizeBytes;
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      const stat = await fs.promises.stat(tempFilePath);
      effectiveSize = stat.size;
    } else if (fileBuffer) {
      effectiveSize = fileBuffer.length;
    } else if (fileBase64) {
      effectiveSize = Buffer.from(fileBase64, 'base64').length;
    }
    this.validateFileSize(effectiveSize);

    try {
      // Magic bytes check
      let binaryBuffer = fileBuffer;
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        const fd = await fs.promises.open(tempFilePath, 'r');
        const header = Buffer.alloc(8);
        await fd.read(header, 0, 8, 0);
        await fd.close();
        this.validateMagicBytes(header, normMime);
        binaryBuffer = await fs.promises.readFile(tempFilePath);
      } else if (fileBuffer) {
        this.validateMagicBytes(fileBuffer, normMime);
      } else if (fileBase64) {
        binaryBuffer = Buffer.from(fileBase64, 'base64');
        this.validateMagicBytes(binaryBuffer, normMime);
      }

      const sha256 = crypto.createHash('sha256').update(binaryBuffer).digest('hex');

      // Static File Security Validation (Layer 1)
      const staticResult = await StaticFileSecurityValidator.validate({
        filePath: tempFilePath,
        buffer: binaryBuffer,
        mimeType: normMime,
        filename: normFilenameInfo.sanitizedName,
      });

      if (!staticResult.valid) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(400, 'MALWARE_DETECTED', `Replacement version rejected by static security validator: ${staticResult.details}`);
      }

      // Malware scan (Layer 2)
      const scanResult = await this.getMalwareScanner().scanObject({
        filePath: tempFilePath,
        buffer: binaryBuffer,
        mimeType: normMime,
        filename: normFilenameInfo.sanitizedName,
      });

      if (scanResult.status === 'INFECTED') {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(400, 'MALWARE_DETECTED', `Replacement version rejected by security scanner: ${scanResult.details}`);
      }

      if (scanResult.status === 'SCAN_ERROR') {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath).catch(() => {});
        }
        throw new ApiError(503, 'SCANNER_UNAVAILABLE', `Scanner unavailable: ${scanResult.details}`);
      }

      const nextVersion = doc.currentVersion + 1;
      const canonicalKey = documentStorageAdapter.generateStorageKey({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        classification: doc.classification || 'PROCUREMENT',
        documentId: `${doc.documentId}_v${nextVersion}`,
        mimeType: normMime,
      });

      const putResult = await documentStorageAdapter.put({
        buffer: binaryBuffer,
        storageKey: canonicalKey,
        mimeType: normMime,
        sizeBytes: effectiveSize,
        organisationId,
        metadata: {
          documentId: doc.documentId,
          version: nextVersion,
          originalFilename: normFilenameInfo.sanitizedName,
          organisationId,
          cafeId: doc.cafeId || 'GLOBAL',
        },
      });

      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }

      // Preserve previous version record (immutable historical reference)
      const previousInternalFilename = doc.internalFilename || `${doc.documentId}.${doc.extension || normFilenameInfo.extension || 'bin'}`;
      const previousVersionRecord = {
        version: doc.currentVersion,
        originalFilename: doc.originalFilename,
        internalFilename: previousInternalFilename,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        checksum: doc.sha256 || doc.checksum,
        sha256: doc.sha256 || doc.checksum,
        storageKey: doc.storageKey,
        storageObjectKey: doc.storageObjectKey || doc.storageKey,
        gridFsFileId: doc.gridFsFileId || null,
        bucketName: doc.bucketName || 'zamorinDocuments',
        storagePath: doc.storagePath,
        storageDriver: doc.storageDriver,
        storageProvider: doc.storageProvider,
        securityScanStatus: doc.securityScanStatus,
        scanStatus: doc.scanStatus,
        securityScanDetails: doc.securityScanDetails,
        changeReason: changeReason.trim(),
        uploadedBy: doc.uploadedBy,
        uploadedByUserId: doc.uploadedByUserId,
        uploadedByRole: doc.uploadedByRole,
        uploadedAt: doc.uploadedAt || new Date(),
      };

      if (!Array.isArray(doc.versions)) {
        doc.versions = [];
      }
      const existingIdx = doc.versions.findIndex(v => (v.versionNumber || v.version) === doc.currentVersion);
      if (existingIdx >= 0) {
        doc.versions[existingIdx] = previousVersionRecord;
      } else {
        doc.versions.push(previousVersionRecord);
      }

      doc.currentVersion = nextVersion;
      doc.originalFilename = normFilenameInfo.sanitizedName;
      doc.originalFileName = normFilenameInfo.sanitizedName;
      doc.safeDisplayFileName = normFilenameInfo.safeDisplayFileName;
      doc.extension = normFilenameInfo.extension;
      doc.internalFilename = `${doc.documentId}_v${nextVersion}.${normFilenameInfo.extension}`;
      doc.mimeType = normMime;
      doc.declaredMimeType = normMime;
      doc.sizeBytes = effectiveSize;
      doc.fileSizeBytes = effectiveSize;
      doc.checksum = sha256;
      doc.sha256 = sha256;
      doc.storageKey = canonicalKey;
      doc.storageObjectKey = canonicalKey;
      doc.gridFsFileId = putResult?.gridFsFileId || null;
      doc.bucketName = putResult?.storageContainer || 'zamorinDocuments';
      doc.storageDriver = putResult?.storageDriver || 'GRIDFS';
      doc.storageProvider = putResult?.storageProvider || 'GRIDFS';
      doc.uploadStatus = 'AVAILABLE';
      doc.scanStatus = 'CLEAN';
      doc.securityScanStatus = 'CLEAN';
      doc.securityScanDetails = scanResult.details;
      doc.documentStatus = 'UPLOADED';
      doc.status = 'UPLOADED';
      doc.verifiedBy = null;
      doc.verifiedAt = null;

      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth.userId,
        actorRole: auth.role,
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_VERSION_REPLACED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: changeReason.trim(),
        result: 'SUCCESS',
        metadata: {
          documentId: doc.documentId,
          newVersion: nextVersion,
          originalFilename: normFilenameInfo.sanitizedName,
          sha256,
        },
      }).catch(() => {});

      return doc;
    } catch (error) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Verify or reject a business document.
   */
  static async verifyDocument({ documentId, organisationId, decision, reason = '', auth }) {
    if (auth.role !== 'MASTER' && auth.role !== 'OWNER') {
      throw new ApiError(403, 'VERIFICATION_DENIED', 'Only Master and Owner can verify business documents.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    if (
      doc.uploadStatus === 'MALWARE_REJECTED' ||
      doc.scanStatus === 'INFECTED' ||
      doc.securityScanStatus === 'REJECTED' ||
      doc.status === 'REJECTED' ||
      doc.uploadStatus === 'QUARANTINED'
    ) {
      throw new ApiError(400, 'CANNOT_VERIFY_QUARANTINED', 'Cannot verify a quarantined or rejected document.');
    }

    doc.documentStatus = decision === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';
    doc.status = doc.documentStatus;
    doc.verifiedBy = auth.name || auth.userId || 'Master';
    doc.verifiedAt = new Date();
    doc.verificationReason = reason;

    await doc.save();

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: decision === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason,
      result: 'SUCCESS',
    }).catch(() => {});

    return doc;
  }

  /**
   * Soft delete a document with mandatory reason.
   */
  static async deleteDocument({ documentId, organisationId, reason, auth }) {
    if (auth.role !== 'MASTER' && auth.role !== 'OWNER') {
      throw new ApiError(403, 'DELETE_DENIED', 'Only Master and Owner can remove business documents.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A detailed reason (min 5 chars) is mandatory to remove a document.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = auth.name || auth.userId || 'Master';
    doc.deletionReason = reason.trim();
    doc.documentStatus = 'ARCHIVED';
    doc.status = 'ARCHIVED';
    doc.uploadStatus = 'DELETED';

    await doc.save();

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_SOFT_DELETED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason,
      result: 'SUCCESS',
    }).catch(() => {});

    return { success: true, message: 'Document soft-deleted and archived.' };
  }

  /**
   * Permanent deletion of a business document enforcing statutory retention & legal hold.
   */
  static async permanentDeleteDocument({ documentId, organisationId, reason, auth }) {
    if (!reason || reason.trim().length < 5) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A detailed reason (min 5 chars) is mandatory for permanent deletion.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    // Authorize role and verify statutory retention / legal hold policies
    this.assertDocumentAuthorization(doc, auth, 'PERMANENT_DELETE');

    // Physical cleanup from storage provider
    const key = doc.storageObjectKey || doc.storageKey;
    if (key) {
      await documentStorageAdapter.delete({ storageKey: key }).catch(() => {});
    }
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      await fs.promises.unlink(doc.storagePath).catch(() => {});
    }
    if (Array.isArray(doc.versions)) {
      for (const v of doc.versions) {
        const vKey = v.storageObjectKey || v.storageKey;
        if (vKey) {
          await documentStorageAdapter.delete({ storageKey: vKey }).catch(() => {});
        }
      }
    }

    // Immutable audit tombstone recording (zero secret content retained)
    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_PERMANENTLY_DISPOSED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: reason.trim(),
      result: 'SUCCESS',
      metadata: {
        documentId: doc.documentId,
        classification: doc.classification,
        documentType: doc.documentType,
        sha256: doc.sha256,
        checksum: doc.checksum || doc.sha256,
        originalFilename: doc.originalFilename,
        sizeBytes: doc.sizeBytes,
        disposedAt: new Date().toISOString(),
        disposedBy: auth.userId,
        dispositionReason: reason.trim(),
      },
    }).catch(() => {});

    // Update BusinessDocument to permanent DISPOSED tombstone state
    doc.documentStatus = 'DISPOSED';
    doc.status = 'DISPOSED';
    doc.isDeleted = true;
    doc.fileBuffer = null;
    doc.fileData = null;
    doc.storageKey = null;
    doc.storageObjectKey = null;
    doc.storagePath = null;
    doc.versions = [];
    doc.disposedAt = new Date();
    doc.disposedBy = auth.name || auth.userId || 'Master';
    doc.dispositionReason = reason.trim();
    await doc.save();

    return {
      success: true,
      message: 'Document permanently disposed and scrubbed under retention policy.',
      documentId: doc.documentId,
      disposedAt: doc.disposedAt,
    };
  }

  /**
   * Modifies retention policy or legal hold with privileged auditing.
   */
  static async updateRetentionPolicy({
    documentId,
    organisationId,
    newRetentionUntil = null,
    legalHold = undefined,
    legalHoldReason = null,
    reason,
    auth,
  }) {
    if (!auth || auth.role !== 'MASTER') {
      throw new ApiError(403, 'UNAUTHORIZED_RETENTION_CHANGE', 'Only MASTER can update statutory retention policies or legal holds.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A detailed audit reason (min 5 chars) is mandatory to modify retention policy.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
    });
    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    if (newRetentionUntil) {
      const newDate = new Date(newRetentionUntil);
      if (doc.statutoryRecord && doc.retentionUntil && newDate < new Date(doc.retentionUntil)) {
        throw new ApiError(400, 'CANNOT_SHORTEN_STATUTORY_RETENTION', 'Changing document metadata cannot fraudulently shorten an already-established statutory retention period without privileged audited policy change.');
      }
      doc.retentionUntil = newDate;
      doc.dispositionEligibleAt = newDate;
      doc.effectiveRetentionUntil = newDate;
    }

    if (legalHold !== undefined) {
      doc.legalHold = Boolean(legalHold);
      if (doc.legalHold) {
        doc.legalHoldReason = (legalHoldReason || reason).trim();
        doc.legalHoldPlacedAt = new Date();
        doc.legalHoldPlacedBy = auth.userId || 'MASTER';
      } else {
        doc.legalHoldReason = null;
      }
    }

    await doc.save();

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'RETENTION_POLICY_UPDATED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: reason.trim(),
      result: 'SUCCESS',
      metadata: {
        legalHold: doc.legalHold,
        retentionUntil: doc.retentionUntil,
      },
    }).catch(() => {});

    return doc;
  }

  /**
   * Rescans a quarantined or scan-failed document idempotently.
   * Does NOT create duplicate document records, object keys, or versions.
   */
  static async rescanDocument({ documentId, organisationId, auth }) {
    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    this.assertDocumentAuthorization(doc, auth, 'VERIFY');

    const quarantineKey = doc.quarantineObjectKey;
    if (!quarantineKey) {
      throw new ApiError(400, 'NO_QUARANTINE_OBJECT', 'Document does not have a quarantined binary available for rescan.');
    }

    const stream = await documentStorageAdapter.getStream({ storageKey: quarantineKey });
    const chunks = [];
    const binaryBuffer = await new Promise((resolve, reject) => {
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    // 1. Static Validation
    const staticResult = await StaticFileSecurityValidator.validate({
      buffer: binaryBuffer,
      mimeType: doc.declaredMimeType || doc.mimeType,
      filename: doc.originalFilename,
    });

    if (!staticResult.valid) {
      doc.uploadStatus = 'MALWARE_REJECTED';
      doc.scanStatus = 'INFECTED';
      doc.securityScanStatus = 'REJECTED';
      doc.documentStatus = 'REJECTED';
      doc.status = 'REJECTED';
      doc.securityScanDetails = staticResult.details;
      doc.rejectedAt = new Date();
      await doc.save();

      await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});
      return doc;
    }

    // 2. Production Scanner
    doc.uploadStatus = 'SCANNING';
    await doc.save();

    const scanner = this.getMalwareScanner();
    const scanResult = await scanner.scanObject({
      buffer: binaryBuffer,
      mimeType: doc.declaredMimeType || doc.mimeType,
      filename: doc.originalFilename,
      objectKey: quarantineKey,
    });

    if (scanResult.status === 'INFECTED') {
      doc.uploadStatus = 'MALWARE_REJECTED';
      doc.scanStatus = 'INFECTED';
      doc.securityScanStatus = 'REJECTED';
      doc.documentStatus = 'REJECTED';
      doc.status = 'REJECTED';
      doc.securityScanDetails = scanResult.details;
      doc.rejectedAt = new Date();
      await doc.save();

      await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});
      return doc;
    }

    if (scanResult.status === 'SCAN_ERROR') {
      doc.uploadStatus = 'SCAN_FAILED';
      doc.scanStatus = 'SCAN_ERROR';
      doc.securityScanStatus = 'SCAN_FAILED';
      doc.securityScanDetails = scanResult.details;
      await doc.save();
      return doc;
    }

    // CLEAN: promote to durable storage (idempotent, single record & object)
    const canonicalKey = documentStorageAdapter.generateStorageKey({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      classification: doc.classification,
      documentId: doc.documentId,
      mimeType: doc.declaredMimeType || doc.mimeType,
    });

    await documentStorageAdapter.copy({
      sourceKey: quarantineKey,
      destinationKey: canonicalKey,
    });

    await documentStorageAdapter.delete({ storageKey: quarantineKey }).catch(() => {});

    doc.storageObjectKey = canonicalKey;
    doc.storageKey = canonicalKey;
    doc.quarantineObjectKey = null;
    doc.uploadStatus = 'AVAILABLE';
    doc.scanStatus = 'CLEAN';
    doc.securityScanStatus = 'CLEAN';
    doc.securityScanDetails = scanResult.details;
    doc.availableAt = new Date();
    await doc.save();

    return doc;
  }

  /**
   * Returns authoritative runtime capability vs configuration status.
   */
  static async getRuntimeStatus() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isS3Configured = Boolean(
      process.env.DOCUMENT_STORAGE_BUCKET &&
      (process.env.DOCUMENT_STORAGE_ENDPOINT || process.env.AWS_REGION) &&
      process.env.DOCUMENT_STORAGE_ACCESS_KEY_ID &&
      process.env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY
    );
    const isScannerConfigured = Boolean(process.env.MALWARE_SCANNER_URL);

    return {
      PRODUCTION_STORAGE_ADAPTER_IMPLEMENTED: true,
      LIVE_PRODUCTION_OBJECT_STORAGE_CONFIGURED: isS3Configured ? true : 'EXTERNAL_PENDING',
      PRODUCTION_SCANNER_ADAPTER_IMPLEMENTED: true,
      LIVE_PRODUCTION_MALWARE_SCANNER_CONFIGURED: isScannerConfigured ? true : 'EXTERNAL_PENDING',
      LOCAL_MOCK_ADAPTERS_ALLOWED_IN_PRODUCTION: false,
      RENDER_FILESYSTEM_PRODUCTION_FALLBACK: false,
      ENVIRONMENT: process.env.NODE_ENV || 'development',
    };
  }

  static async createDownloadGrant(params) {
    const grant = await this.createAuthorizedDownloadGrant(params);
    return {
      ...grant,
      expiresInSeconds: params.expiresInSeconds || 180,
    };
  }

  static async archiveDocument(params) {
    await this.deleteDocument(params);
    const doc = await BusinessDocument.findOne({
      documentId: params.documentId.trim().toUpperCase(),
      organisationId: params.organisationId,
    });
    return doc;
  }

  /**
   * Restores a historical document revision without mutating the historical GridFS binary.
   */
  static async restoreVersion({ documentId, organisationId, versionNumber, reason, auth }) {
    if (auth.role !== 'MASTER' && auth.role !== 'OWNER') {
      throw new ApiError(403, 'RESTORE_DENIED', 'Only Master and Owner can restore document revisions.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A detailed reason (min 5 chars) is mandatory to restore a version.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    const verNum = parseInt(versionNumber, 10);
    const targetVer = (doc.versions || []).find((v) => (v.versionNumber || v.version) === verNum);

    if (!targetVer) {
      throw new ApiError(404, 'VERSION_NOT_FOUND', `Version ${verNum} not found in revision history.`);
    }

    const nextVersion = (doc.currentVersion || 1) + 1;
    const restoredRecord = {
      version: nextVersion,
      originalFilename: targetVer.originalFilename || doc.originalFilename,
      internalFilename: `${doc.documentId}_v${nextVersion}_restored_from_v${verNum}`,
      mimeType: targetVer.mimeType || doc.mimeType,
      sizeBytes: targetVer.sizeBytes || doc.sizeBytes,
      checksum: targetVer.sha256 || targetVer.checksum || doc.sha256,
      sha256: targetVer.sha256 || targetVer.checksum || doc.sha256,
      storageKey: targetVer.storageKey,
      storageObjectKey: targetVer.storageObjectKey || targetVer.storageKey,
      gridFsFileId: targetVer.gridFsFileId || null,
      bucketName: targetVer.bucketName || 'zamorinDocuments',
      storageDriver: targetVer.storageDriver || 'GRIDFS',
      storageProvider: targetVer.storageProvider || 'GRIDFS',
      securityScanStatus: 'CLEAN',
      scanStatus: 'CLEAN',
      securityScanDetails: `Restored from historical Version ${verNum}`,
      changeReason: `Restored from Version ${verNum}: ${reason.trim()}`,
      uploadedBy: auth.name || auth.userId || 'Operator',
      uploadedByUserId: auth.userId || null,
      uploadedByRole: auth.role || null,
      uploadedAt: new Date(),
    };

    if (!Array.isArray(doc.versions)) {
      doc.versions = [];
    }
    doc.versions.push(restoredRecord);
    doc.currentVersion = nextVersion;
    doc.storageKey = targetVer.storageKey;
    doc.storageObjectKey = targetVer.storageObjectKey || targetVer.storageKey;
    doc.gridFsFileId = targetVer.gridFsFileId || null;
    doc.bucketName = targetVer.bucketName || 'zamorinDocuments';
    doc.sha256 = targetVer.sha256 || targetVer.checksum || doc.sha256;
    doc.checksum = doc.sha256;
    doc.sizeBytes = targetVer.sizeBytes || doc.sizeBytes;
    doc.isDeleted = false;
    doc.documentStatus = 'UPLOADED';
    doc.status = 'UPLOADED';

    await doc.save();

    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth.userId,
      actorRole: auth.role,
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_RESTORED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: `Restored version ${verNum} to version ${nextVersion}: ${reason.trim()}`,
      result: 'SUCCESS',
      metadata: {
        documentId: doc.documentId,
        restoredFromVersion: verNum,
        newVersion: nextVersion,
        gridFsFileId: targetVer.gridFsFileId,
      },
    }).catch(() => {});

    return doc;
  }

  /**
   * Scans a GridFS document revision directly from GridFS stream to ClamAV INSTREAM (EXT-02).
   */
  static async scanGridFsRevision({
    documentId,
    organisationId,
    versionNumber = null,
    gridFsFileId = null,
    sha256 = null,
    auth = null,
  }) {
    const doc = await BusinessDocument.findOne({
      documentId: documentId.trim().toUpperCase(),
      organisationId,
      isDeleted: false,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    // Determine target version
    let targetVer = null;
    let targetFileId = doc.gridFsFileId;
    let targetSha = doc.sha256 || doc.checksum;
    let targetKey = doc.storageKey || doc.storageObjectKey;

    const vNum = (versionNumber !== null && versionNumber !== undefined) ? parseInt(versionNumber, 10) : doc.currentVersion;
    targetVer = (doc.versions || []).find((v) => (v.versionNumber || v.version) === vNum);

    if (vNum === doc.currentVersion) {
      targetFileId = doc.gridFsFileId || targetVer?.gridFsFileId;
      targetSha = doc.sha256 || doc.checksum || targetVer?.sha256;
      targetKey = doc.storageKey || doc.storageObjectKey || targetVer?.storageKey;
    } else {
      if (!targetVer) {
        throw new ApiError(404, 'VERSION_NOT_FOUND', `Version ${vNum} not found.`);
      }
      targetFileId = targetVer.gridFsFileId;
      targetSha = targetVer.sha256 || targetVer.checksum;
      targetKey = targetVer.storageKey || targetVer.storageObjectKey;
    }

    if (gridFsFileId && String(gridFsFileId) !== String(targetFileId)) {
      throw new ApiError(400, 'GRIDFS_FILE_ID_MISMATCH', 'Specified gridFsFileId does not match document version.');
    }

    if (sha256 && targetSha && sha256.toLowerCase() !== targetSha.toLowerCase()) {
      throw new ApiError(400, 'CHECKSUM_MISMATCH', 'Supplied SHA-256 checksum does not match document record.');
    }

    // Record scan started audit
    await auditService.recordAuditEvent({
      organisationId,
      cafeId: doc.cafeId || 'GLOBAL',
      actorUserId: auth?.userId || 'SYSTEM_SCANNER',
      actorRole: auth?.role || 'SYSTEM',
      module: 'DOCUMENT_ATTACHMENT',
      action: 'DOCUMENT_SCAN_STARTED',
      entityType: 'BUSINESS_DOCUMENT',
      entityId: doc.documentId,
      reason: 'Malware scan started via ClamAV INSTREAM',
      result: 'IN_PROGRESS',
      metadata: {
        documentId: doc.documentId,
        gridFsFileId: targetFileId,
        version: versionNumber || doc.currentVersion,
      },
    }).catch(() => {});

    // Open stream directly from GridFS
    const stream = await documentStorageAdapter.getStream({
      storageKey: targetKey,
      fileId: targetFileId,
    });

    const { malwareScannerService } = require('./malwareScannerService');
    const scanResult = await malwareScannerService.scanStream(stream, {
      documentId: doc.documentId,
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
    });

    // Process scan verdict
    const scannedAt = scanResult.scannedAt || new Date();

    if (scanResult.status === 'CLEAN') {
      if (targetVer) {
        targetVer.scanStatus = 'CLEAN';
        targetVer.securityScanStatus = 'CLEAN';
      }
      if (!versionNumber || parseInt(versionNumber, 10) === doc.currentVersion) {
        doc.scanStatus = 'CLEAN';
        doc.securityScanStatus = 'CLEAN';
        doc.uploadStatus = 'AVAILABLE';
      }
      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth?.userId || 'SYSTEM_SCANNER',
        actorRole: auth?.role || 'SYSTEM',
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_SCAN_CLEAN',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: 'Document verified clean by ClamAV INSTREAM',
        result: 'CLEAN',
        metadata: {
          documentId: doc.documentId,
          version: versionNumber || doc.currentVersion,
          engineVersion: scanResult.engineVersion,
          signatureVersion: scanResult.signatureVersion,
        },
      }).catch(() => {});
    } else if (scanResult.status === 'INFECTED') {
      if (targetVer) {
        targetVer.scanStatus = 'INFECTED';
        targetVer.securityScanStatus = 'REJECTED';
      }
      if (!versionNumber || parseInt(versionNumber, 10) === doc.currentVersion) {
        doc.scanStatus = 'INFECTED';
        doc.securityScanStatus = 'REJECTED';
        doc.uploadStatus = 'MALWARE_REJECTED';
        doc.securityScanDetails = scanResult.details;
      }
      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth?.userId || 'SYSTEM_SCANNER',
        actorRole: auth?.role || 'SYSTEM',
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_SCAN_INFECTED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `Malware detected by ClamAV: ${scanResult.threatName || scanResult.details}`,
        result: 'INFECTED',
        metadata: {
          documentId: doc.documentId,
          threatName: scanResult.threatName,
          version: versionNumber || doc.currentVersion,
        },
      }).catch(() => {});
    } else if (scanResult.status === 'SCANNER_UNAVAILABLE' || scanResult.status === 'UNAVAILABLE') {
      if (targetVer) {
        targetVer.scanStatus = 'SCANNER_UNAVAILABLE';
        targetVer.securityScanStatus = 'SCAN_FAILED';
      }
      if (!versionNumber || parseInt(versionNumber, 10) === doc.currentVersion) {
        doc.scanStatus = 'SCANNER_UNAVAILABLE';
        doc.securityScanStatus = 'SCAN_FAILED';
        doc.uploadStatus = 'SCAN_FAILED';
      }
      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth?.userId || 'SYSTEM_SCANNER',
        actorRole: auth?.role || 'SYSTEM',
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_SCANNER_UNAVAILABLE',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `ClamAV daemon unreachable: ${scanResult.details}`,
        result: 'SCANNER_UNAVAILABLE',
        metadata: {
          documentId: doc.documentId,
          version: versionNumber || doc.currentVersion,
        },
      }).catch(() => {});
    } else {
      // SCAN_FAILED / error
      if (targetVer) {
        targetVer.scanStatus = 'SCAN_FAILED';
        targetVer.securityScanStatus = 'SCAN_FAILED';
      }
      if (!versionNumber || parseInt(versionNumber, 10) === doc.currentVersion) {
        doc.scanStatus = 'SCAN_FAILED';
        doc.securityScanStatus = 'SCAN_FAILED';
        doc.uploadStatus = 'SCAN_FAILED';
        doc.securityScanDetails = scanResult.details;
      }
      await doc.save();

      await auditService.recordAuditEvent({
        organisationId,
        cafeId: doc.cafeId || 'GLOBAL',
        actorUserId: auth?.userId || 'SYSTEM_SCANNER',
        actorRole: auth?.role || 'SYSTEM',
        module: 'DOCUMENT_ATTACHMENT',
        action: 'DOCUMENT_SCAN_FAILED',
        entityType: 'BUSINESS_DOCUMENT',
        entityId: doc.documentId,
        reason: `ClamAV scan error: ${scanResult.details}`,
        result: 'SCAN_FAILED',
        metadata: {
          documentId: doc.documentId,
          version: versionNumber || doc.currentVersion,
        },
      }).catch(() => {});
    }

    return {
      documentId: doc.documentId,
      version: versionNumber || doc.currentVersion,
      scanStatus: doc.scanStatus,
      securityScanStatus: doc.securityScanStatus,
      uploadStatus: doc.uploadStatus,
      threatName: scanResult.threatName || null,
      details: scanResult.details,
      scannedAt,
    };
  }
}

DocumentAttachmentService.CANONICAL_PROCUREMENT_DOCUMENT_TYPES = CANONICAL_PROCUREMENT_DOCUMENT_TYPES;

module.exports = {
  DocumentAttachmentService,
  DEFAULT_DOCUMENT_MAX_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  CANONICAL_PROCUREMENT_DOCUMENT_TYPES,
};
