'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ExportHistory } = require('../models/ExportHistory');
const { CompanyIdentityService } = require('../services/companyIdentityService');
const { generatePdf, generateXlsx } = require('../utils/exportGenerators');
const auditService = require('../services/auditService');
const { sanitizeRecordByRole } = require('../utils/dataClassifier');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

const router = express.Router();
router.use(authenticate);

// ── GET /api/v1/exports/history ─────────────────────────────────────────────
router.get(
  '/history',
  authorize('REPORTS_EXPORT', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const orgId = req.auth.organisationId;
    const filter = { organisationId: orgId };
    
    if (req.auth.role === 'CAFE_ADMIN' && req.auth.primaryCafeId) {
      filter.cafeId = req.auth.primaryCafeId;
    } else if (req.query.cafeId && req.query.cafeId !== 'ALL') {
      filter.cafeId = req.query.cafeId.trim().toUpperCase();
    }

    if (req.query.format) {
      filter.format = req.query.format.trim().toUpperCase();
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ExportHistory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ExportHistory.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
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

// ── POST /api/v1/exports/generate (Direct Binary Stream with Audit & History) ──
router.post(
  '/generate',
  authorize('REPORTS_EXPORT', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const {
      format = 'PDF',
      reportTitle = 'Report',
      reportCode = 'ZURF-RPT-01',
      columns = [],
      rows = [],
      kpiCards = [],
      period = 'Current Period',
      scope = 'All Cafés',
      cafeId = null,
      customFilename = null,
      destinationType = 'BROWSER_DOWNLOAD',
      templateVersion = 'Zamorin Universal Report Template v1.0',
    } = req.body || {};

    const fmt = format.trim().toUpperCase();
    if (fmt !== 'PDF' && fmt !== 'XLSX') {
      throw new ApiError(400, 'INVALID_EXPORT_FORMAT', 'Only PDF and XLSX formats are supported.');
    }

    const orgId = req.auth.organisationId;
    const targetCafeId = cafeId || req.auth.primaryCafeId || null;

    const branding = await CompanyIdentityService.resolveExportBranding({
      cafeId: targetCafeId,
      organisationId: orgId,
    });

    const sanitizedRows = Array.isArray(rows)
      ? rows.map((r) => sanitizeRecordByRole(r, req.auth.role))
      : rows;

    let exportResult;
    if (fmt === 'PDF') {
      exportResult = generatePdf({
        reportTitle,
        reportCode,
        columns,
        rows: sanitizedRows,
        kpiCards,
        period,
        scope,
        branding,
      });
    } else {
      exportResult = generateXlsx({
        reportTitle,
        columns,
        rows: sanitizedRows,
        period,
        scope,
        branding,
      });
    }

    const finalFilename = customFilename || exportResult.filename;

    // Record Export History
    const historyDoc = await ExportHistory.create({
      exportId: exportResult.runId,
      documentType: 'REPORT',
      reportTitle,
      format: fmt,
      organisationId: orgId,
      cafeId: targetCafeId,
      generatedBy: req.auth.name || req.auth.userId || 'Operator',
      actorRole: req.auth.role,
      filename: finalFilename,
      destinationType,
      status: 'GENERATED',
      templateVersion,
      recordCount: rows.length,
      metadata: {
        reportCode,
        scope,
        period,
      },
    });

    // Record Audit Trail
    await auditService.recordAuditEvent({
      organisationId: orgId,
      cafeId: targetCafeId || 'GLOBAL',
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      module: 'UNIVERSAL_EXPORT',
      action: 'EXPORT_GENERATED',
      entityType: 'EXPORT_HISTORY',
      entityId: exportResult.runId,
      reason: `Generated ${fmt} export: ${finalFilename}`,
      result: 'SUCCESS',
      metadata: {
        exportId: exportResult.runId,
        format: fmt,
        filename: finalFilename,
        recordCount: rows.length,
      },
    }).catch(() => {});

    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
    res.setHeader('X-Export-Id', exportResult.runId);
    res.setHeader('X-Template-Version', templateVersion);
    return res.status(200).send(exportResult.buffer);
  })
);

// ── POST /api/v1/exports/preview (Metadata and Layout Preview before Save) ──
router.post(
  '/preview',
  authorize('REPORTS_EXPORT', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const {
      format = 'PDF',
      reportTitle = 'Report',
      reportCode = 'ZURF-RPT-01',
      columns = [],
      rows = [],
      kpiCards = [],
      period = 'Current Period',
      scope = 'All Cafés',
      cafeId = null,
    } = req.body || {};

    const fmt = format.trim().toUpperCase();
    if (fmt !== 'PDF' && fmt !== 'XLSX') {
      throw new ApiError(400, 'INVALID_EXPORT_FORMAT', 'Only PDF and XLSX formats are supported.');
    }

    const orgId = req.auth.organisationId;
    const targetCafeId = cafeId || req.auth.primaryCafeId || null;

    const branding = await CompanyIdentityService.resolveExportBranding({
      cafeId: targetCafeId,
      organisationId: orgId,
    });

    // Verify Universal Sl. No. rule
    const hasSl = columns.some((c) => {
      const l = (c.label || c.key || '').toLowerCase();
      return l.includes('sl.') || l.includes('sl no') || l.includes('serial');
    });
    const finalCols = hasSl ? columns : [{ key: '__slNo', label: 'Sl. No.' }, ...columns];

    // Estimated page count and layout metadata
    const estimatedPages = Math.max(1, Math.ceil((rows.length + (kpiCards.length > 0 ? 3 : 0)) / 25));

    return res.status(200).json({
      success: true,
      data: {
        format: fmt,
        reportTitle,
        reportCode,
        period,
        scope,
        columnCount: finalCols.length,
        columns: finalCols,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 5),
        kpiCards,
        estimatedPages,
        watermarkApplied: true,
        serialNumberColumnPresent: true,
        branding: {
          brandName: branding.brandName,
          legalName: branding.legalName,
          gstin: branding.gstin,
          isOutletScoped: branding.isOutletScoped,
        },
        templateVersion: 'Zamorin Universal Report Template v1.0',
        classification: 'OFFICIAL_INTERNAL',
      },
    });
  })
);

// ── POST /api/v1/exports/record ────────────────────────────────────────────
router.post(
  '/record',
  authorize('REPORTS_EXPORT', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  asyncHandler(async (req, res) => {
    const {
      exportId,
      documentType = 'REPORT',
      reportTitle,
      relatedRecordId = null,
      format,
      filename,
      destinationType = 'BROWSER_DOWNLOAD',
      templateVersion = 'Zamorin Universal Report Template v1.0',
      recordCount = 0,
      filterCriteria = {},
      metadata = {},
      checksum = null,
    } = req.body || {};

    if (!exportId || !reportTitle || !format || !filename) {
      throw new ApiError(400, 'EXPORT_FIELDS_REQUIRED', 'exportId, reportTitle, format, and filename are required.');
    }

    const fmt = format.trim().toUpperCase();
    if (fmt !== 'PDF' && fmt !== 'XLSX') {
      throw new ApiError(400, 'INVALID_EXPORT_FORMAT', 'Only PDF and XLSX formats are supported.');
    }

    const orgId = req.auth.organisationId;
    const cafeId = req.body.cafeId || req.auth.primaryCafeId || null;

    const historyDoc = await ExportHistory.create({
      exportId,
      documentType,
      reportTitle,
      relatedRecordId,
      format: fmt,
      organisationId: orgId,
      cafeId,
      generatedBy: req.auth.name || req.auth.userId || 'Operator',
      actorRole: req.auth.role,
      filename,
      destinationType,
      status: 'GENERATED',
      templateVersion,
      checksum,
      recordCount,
      filterCriteria,
      metadata,
    });

    await auditService.recordAuditEvent({
      organisationId: orgId,
      cafeId: cafeId || 'GLOBAL',
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      module: 'UNIVERSAL_EXPORT',
      action: 'EXPORT_RECORDED',
      entityType: 'EXPORT_HISTORY',
      entityId: exportId,
      reason: `User generated ${fmt} export: ${filename}`,
      result: 'SUCCESS',
      metadata: {
        exportId,
        format: fmt,
        filename,
        recordCount,
        templateVersion,
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Export history recorded successfully.',
      data: historyDoc,
    });
  })
);

module.exports = router;
