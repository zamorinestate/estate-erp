'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { BusinessDocument } = require('../models/BusinessDocument');
const { DocumentAttachmentService, DEFAULT_DOCUMENT_MAX_BYTES } = require('../services/documentAttachmentService');
const { documentStorageAdapter } = require('../services/documentStorageAdapter');
const { documentReconciliationJob } = require('../services/documentReconciliationJob');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

const UPLOAD_STAGING_DIR = path.join(os.tmpdir(), 'zamorin_document_staging');

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      fs.mkdirSync(UPLOAD_STAGING_DIR, { recursive: true });
      cb(null, UPLOAD_STAGING_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `stg-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.tmp`;
    cb(null, uniqueSuffix);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: DEFAULT_DOCUMENT_MAX_BYTES,
    files: 1,
  },
});

const router = express.Router();
router.use(authenticate);

// ── GET /api/v1/documents (Filtered Search & Hub) ───────────────────────────
router.get(
  '/',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const filter = { organisationId: orgId, isDeleted: false };

    if (req.auth.role === 'CAFE_ADMIN' && req.auth.primaryCafeId) {
      filter.cafeId = req.auth.primaryCafeId;
    } else if (req.query.cafeId && req.query.cafeId !== 'ALL') {
      filter.cafeId = req.query.cafeId.trim().toUpperCase();
    }

    if (req.query.module || req.query.entityType) {
      filter.entityType = (req.query.module || req.query.entityType).trim().toUpperCase();
    }

    if (req.query.recordId || req.query.entityId) {
      filter.entityId = (req.query.recordId || req.query.entityId).trim().toUpperCase();
    }

    if (req.query.type || req.query.documentType) {
      filter.documentType = (req.query.type || req.query.documentType).trim();
    }

    if (req.query.status || req.query.documentStatus) {
      filter.documentStatus = (req.query.status || req.query.documentStatus).trim().toUpperCase();
    }

    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { documentId: { $regex: q, $options: 'i' } },
        { originalFilename: { $regex: q, $options: 'i' } },
        { safeDisplayFileName: { $regex: q, $options: 'i' } },
        { documentNumber: { $regex: q, $options: 'i' } },
        { entityName: { $regex: q, $options: 'i' } },
        { entityId: { $regex: q, $options: 'i' } },
      ];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      BusinessDocument.find(filter)
        .select('-fileData -versions.fileData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BusinessDocument.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        documents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

// Alias /hub to / for backward compatibility with frontend document hub queries
router.get(
  '/hub',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res, next) => {
    // Forward to '/' handler logic
    const orgId = req.auth.organisationId;
    const filter = { organisationId: orgId, isDeleted: false };

    if (req.auth.role === 'CAFE_ADMIN' && req.auth.primaryCafeId) {
      filter.cafeId = req.auth.primaryCafeId;
    } else if (req.query.cafeId && req.query.cafeId !== 'ALL') {
      filter.cafeId = req.query.cafeId.trim().toUpperCase();
    }

    if (req.query.module || req.query.entityType) {
      filter.entityType = (req.query.module || req.query.entityType).trim().toUpperCase();
    }

    if (req.query.recordId || req.query.entityId) {
      filter.entityId = (req.query.recordId || req.query.entityId).trim().toUpperCase();
    }

    if (req.query.type || req.query.documentType) {
      filter.documentType = (req.query.type || req.query.documentType).trim();
    }

    if (req.query.status || req.query.documentStatus) {
      filter.documentStatus = (req.query.status || req.query.documentStatus).trim().toUpperCase();
    }

    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { documentId: { $regex: q, $options: 'i' } },
        { originalFilename: { $regex: q, $options: 'i' } },
        { safeDisplayFileName: { $regex: q, $options: 'i' } },
        { documentNumber: { $regex: q, $options: 'i' } },
        { entityName: { $regex: q, $options: 'i' } },
        { entityId: { $regex: q, $options: 'i' } },
      ];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      BusinessDocument.find(filter)
        .select('-fileData -versions.fileData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BusinessDocument.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        documents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

// ── POST /api/v1/documents/upload-intent (Direct Upload Phase 1) ─────────────
router.post(
  '/upload-intent',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const intent = await DocumentAttachmentService.initiateUploadIntent({
      ...req.body,
      organisationId: req.auth.organisationId,
      auth: req.auth,
    });

    return res.status(201).json({
      success: true,
      message: 'Upload intent registered. Proceed with direct upload using uploadGrant.',
      data: intent,
    });
  })
);

// ── POST /api/v1/documents/finalize (Direct Upload Phase 2) ──────────────────
router.post(
  '/finalize',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const { documentId } = req.body || {};
    if (!documentId) throw new ApiError(400, 'MISSING_FIELDS', 'documentId is required.');

    const doc = await DocumentAttachmentService.finalizeUpload({
      documentId,
      organisationId: req.auth.organisationId,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: 'Document finalized and verified clean.',
      data: doc,
    });
  })
);

// ── POST /api/v1/documents/attach (Multipart Staged Upload) ───────────────────
router.post(
  '/attach',
  upload.single('file'),
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const file = req.file;
    const body = req.body || {};
    try {
      const doc = await DocumentAttachmentService.attachDocument({
        ...body,
        originalFilename: file ? file.originalname : body.originalFilename,
        mimeType: file ? file.mimetype : body.mimeType,
        sizeBytes: file ? file.size : body.sizeBytes,
        tempFilePath: file ? file.path : null,
        fileBuffer: null,
        fileBase64: body.fileBase64 || null,
        organisationId: req.auth.organisationId,
        auth: req.auth,
      });

      return res.status(201).json({
        success: true,
        message: 'Document attached successfully.',
        data: doc,
      });
    } catch (err) {
      if (file && file.path && fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
      throw err;
    }
  })
);

// ── GET /api/v1/documents/:documentId/download-grant (Short-lived Download Grant) ──
router.get(
  '/:documentId/download-grant',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  asyncHandler(async (req, res) => {
    const grant = await DocumentAttachmentService.createAuthorizedDownloadGrant({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      auth: req.auth,
      expiresInSeconds: 180,
    });

    return res.status(200).json({
      success: true,
      data: grant,
    });
  })
);

// ── POST /api/v1/documents/upload-stream (Direct HTTP to GridFS Stream) ──────
router.post(
  '/upload-stream',
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const cafeId = req.query.cafeId || req.headers['x-cafe-id'] || req.auth.primaryCafeId || 'GLOBAL';
    const declaredMime = req.headers['content-type'] || 'application/octet-stream';
    const originalFilename = req.query.filename || req.headers['x-filename'] || 'document.pdf';
    const documentId = (req.query.documentId || req.headers['x-document-id'] || '').trim().toUpperCase();
    const key = req.query.key || (documentId ? `quarantine/${orgId}/${cafeId}/${documentId}.bin` : null);

    if (!key) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'key or documentId parameter is required for stream upload.');
    }

    const putResult = await documentStorageAdapter.put({
      stream: req,
      storageKey: key,
      mimeType: declaredMime,
      organisationId: orgId,
      metadata: {
        documentId: documentId || null,
        originalFilename,
        organisationId: orgId,
        cafeId,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Binary successfully streamed to GridFS.',
      data: {
        storageObjectKey: putResult.storageObjectKey,
        gridFsFileId: putResult.gridFsFileId,
        sha256: putResult.sha256,
        sizeBytes: putResult.sizeBytes,
        storedAt: putResult.storedAt,
      },
    });
  })
);

// ── GET /api/v1/documents/:documentId/download (Authorized Binary Stream) ─────
router.get(
  '/:documentId/download',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const docId = req.params.documentId.trim().toUpperCase();

    const doc = await BusinessDocument.findOne({
      documentId: docId,
      organisationId: orgId,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    // Authoritative execution-time re-authorization
    DocumentAttachmentService.assertDocumentAuthorization(doc, req.auth, 'DOWNLOAD');

    const key = doc.storageObjectKey || doc.storageKey;
    if (!key) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', 'Storage reference missing.');
    }

    const safeFilename = doc.safeDisplayFileName || doc.originalFilename;
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-File-Checksum', doc.sha256 || doc.checksum || '');
    res.setHeader('Accept-Ranges', 'bytes');

    // Byte-range handling
    const rangeHeader = req.headers.range;
    if (rangeHeader && doc.sizeBytes) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : doc.sizeBytes - 1;
      if (!isNaN(start) && start <= doc.sizeBytes - 1) {
        const chunksize = (end - start) + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${doc.sizeBytes}`);
        res.setHeader('Content-Length', chunksize);
        const provider = documentStorageAdapter.getProvider();
        const stream = await provider.openReadStream({
          objectKey: key,
          fileId: doc.gridFsFileId,
          start,
          end: end + 1,
        });
        return stream.pipe(res);
      }
    }

    const stream = await documentStorageAdapter.getStream({ storageKey: key });
    if (doc.sizeBytes) {
      res.setHeader('Content-Length', doc.sizeBytes);
    }
    return stream.pipe(res);
  })
);

// ── GET /api/v1/documents/:documentId/preview (Authorized Preview Stream) ────
router.get(
  '/:documentId/preview',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const docId = req.params.documentId.trim().toUpperCase();

    const doc = await BusinessDocument.findOne({
      documentId: docId,
      organisationId: orgId,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    DocumentAttachmentService.assertDocumentAuthorization(doc, req.auth, 'PREVIEW');

    const key = doc.storageObjectKey || doc.storageKey;
    if (!key) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', 'Storage reference missing.');
    }

    const safeFilename = doc.safeDisplayFileName || doc.originalFilename;
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    // Byte-range handling for preview (PDF/media range requests)
    const rangeHeader = req.headers.range;
    if (rangeHeader && doc.sizeBytes) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : doc.sizeBytes - 1;
      if (!isNaN(start) && start <= doc.sizeBytes - 1) {
        const chunksize = (end - start) + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${doc.sizeBytes}`);
        res.setHeader('Content-Length', chunksize);
        const provider = documentStorageAdapter.getProvider();
        const stream = await provider.openReadStream({
          objectKey: key,
          fileId: doc.gridFsFileId,
          start,
          end: end + 1,
        });
        return stream.pipe(res);
      }
    }

    const stream = await documentStorageAdapter.getStream({ storageKey: key });
    if (doc.sizeBytes) {
      res.setHeader('Content-Length', doc.sizeBytes);
    }
    return stream.pipe(res);
  })
);

// ── GET /api/v1/documents/:documentId (Metadata Detail) ───────────────────────
router.get(
  '/:documentId',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const docId = req.params.documentId.trim().toUpperCase();

    const doc = await BusinessDocument.findOne({
      documentId: docId,
      organisationId: orgId,
      isDeleted: false,
    }).lean();

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    DocumentAttachmentService.assertDocumentAuthorization(doc, req.auth, 'VIEW');

    return res.status(200).json({
      success: true,
      data: doc,
    });
  })
);

// ── POST /api/v1/documents/:documentId/replace-version ──────────────────────
router.post(
  '/:documentId/replace-version',
  upload.single('file'),
  authorize('PROCUREMENT_WRITE', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const file = req.file;
    const body = req.body || {};
    try {
      const doc = await DocumentAttachmentService.replaceVersion({
        documentId: req.params.documentId,
        organisationId: req.auth.organisationId,
        originalFilename: file ? file.originalname : body.originalFilename,
        mimeType: file ? file.mimetype : body.mimeType,
        sizeBytes: file ? file.size : body.sizeBytes,
        tempFilePath: file ? file.path : null,
        fileBuffer: null,
        fileBase64: body.fileBase64 || null,
        changeReason: body.changeReason,
        auth: req.auth,
      });

      return res.status(200).json({
        success: true,
        message: 'Document version replaced successfully.',
        data: doc,
      });
    } catch (err) {
      if (file && file.path && fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
      throw err;
    }
  })
);

// ── POST /api/v1/documents/:documentId/verify ───────────────────────────────
router.post(
  '/:documentId/verify',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const { decision, reason } = req.body || {};
    const doc = await DocumentAttachmentService.verifyDocument({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      decision,
      reason,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: `Document status updated to ${doc.documentStatus || doc.status}.`,
      data: doc,
    });
  })
);

// ── DELETE /api/v1/documents/:documentId (Soft Delete) ──────────────────────
router.delete(
  '/:documentId',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const result = await DocumentAttachmentService.deleteDocument({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      reason,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  })
);

// ── DELETE /api/v1/documents/:documentId/permanent (Statutory Purge) ────────
router.delete(
  '/:documentId/permanent',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER'] }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const result = await DocumentAttachmentService.permanentDeleteDocument({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      reason,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  })
);

// ── POST /api/v1/documents/:documentId/retention-policy ─────────────────────
router.post(
  '/:documentId/retention-policy',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER'] }),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const doc = await DocumentAttachmentService.updateRetentionPolicy({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      newRetentionUntil: body.newRetentionUntil,
      legalHold: body.legalHold,
      legalHoldReason: body.legalHoldReason,
      reason: body.reason,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: 'Retention policy updated successfully.',
      data: doc,
    });
  })
);

// ── GET /api/v1/documents/:documentId/versions/:versionNumber/download ─────
router.get(
  '/:documentId/versions/:versionNumber/download',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const docId = req.params.documentId.trim().toUpperCase();
    const verNum = parseInt(req.params.versionNumber, 10);

    const doc = await BusinessDocument.findOne({
      documentId: docId,
      organisationId: orgId,
    }).lean();

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Business document not found.');
    }

    DocumentAttachmentService.assertDocumentAuthorization(doc, req.auth, 'DOWNLOAD');

    let targetVer;
    if (doc.version === verNum) {
      targetVer = doc;
    } else {
      targetVer = (doc.versions || []).find((v) => (v.versionNumber || v.version) === verNum);
    }

    if (!targetVer) {
      throw new ApiError(404, 'VERSION_NOT_FOUND', `Version ${verNum} of document not found.`);
    }

    const key = targetVer.storageObjectKey || targetVer.storageKey;
    if (!key) {
      throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', 'Version binary key is missing.');
    }

    res.setHeader('Content-Type', targetVer.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(targetVer.originalFilename || doc.originalFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = await documentStorageAdapter.getStream({ storageKey: key });
    if (targetVer.sizeBytes) res.setHeader('Content-Length', targetVer.sizeBytes);
    return stream.pipe(res);
  })
);

// ── POST /api/v1/documents/:documentId/restore ──────────────────────────────
router.post(
  '/:documentId/restore',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'REASON_REQUIRED', 'Mandatory restoration reason must be provided.');
    }

    const doc = await BusinessDocument.findOne({
      documentId: req.params.documentId.trim().toUpperCase(),
      organisationId: req.auth.organisationId,
      isDeleted: true,
    });

    if (!doc) {
      throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Deleted business document not found.');
    }

    doc.isDeleted = false;
    doc.deletedAt = null;
    doc.deletedBy = null;
    doc.deletionReason = null;
    doc.documentStatus = 'UPLOADED';
    doc.status = 'UPLOADED';
    doc.uploadStatus = 'AVAILABLE';
    await doc.save();

    return res.status(200).json({
      success: true,
      message: 'Document successfully restored.',
      data: doc,
    });
  })
);

// ── POST /api/v1/documents/:documentId/restore-version/:versionNumber ───────
router.post(
  '/:documentId/restore-version/:versionNumber',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const doc = await DocumentAttachmentService.restoreVersion({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      versionNumber: req.params.versionNumber,
      reason,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: `Document revision successfully restored to Version ${doc.currentVersion}.`,
      data: doc,
    });
  })
);

// ── POST /api/v1/documents/reconcile ────────────────────────────────────────
router.post(
  '/reconcile',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER'] }),
  asyncHandler(async (req, res) => {
    const report = await documentReconciliationJob.reconcileDocuments({
      organisationId: req.auth.organisationId,
    });

    return res.status(200).json({
      success: true,
      data: report,
    });
  })
);

// ── GET /api/v1/documents/runtime-status (Capability vs Configuration) ──────
router.get(
  '/runtime-status',
  authorize('REPORTS_READ', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const status = await DocumentAttachmentService.getRuntimeStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  })
);

// ── POST /api/v1/documents/:documentId/rescan (Idempotent Rescan) ───────────
router.post(
  '/:documentId/rescan',
  authorize('PROCUREMENT_APPROVE', { allowedRoles: ['MASTER', 'OWNER'] }),
  asyncHandler(async (req, res) => {
    const doc = await DocumentAttachmentService.rescanDocument({
      documentId: req.params.documentId,
      organisationId: req.auth.organisationId,
      auth: req.auth,
    });

    return res.status(200).json({
      success: true,
      message: 'Document rescan executed.',
      data: doc,
    });
  })
);

module.exports = router;
