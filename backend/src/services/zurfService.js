'use strict';

/**
 * ZURF v1 — ZAMORIN UNIVERSAL REPORT & EXPORT FORMAT
 * Central corporate report rendering & export engine.
 * Enforces universal branding, mandatory logo watermark on every PDF page,
 * corporate headers with GSTIN and legal name, Run IDs, and classification.
 */

const crypto = require('crypto');
const { CompanyIdentityService } = require('./companyIdentityService');

/**
 * Backward-compatibility shim. Returns resolved branding via CompanyIdentityService.
 * Callers that used the static COMPANY_CONFIG must await this function.
 */
async function getCompanyConfig({ organisationId, cafeId = null, sensitivityLevel = 'INTERNAL' } = {}) {
  return CompanyIdentityService.resolveExportBranding({
    organisationId,
    cafeId,
    sensitivityLevel,
  });
}

// Kept for legacy synchronous callers that have not yet migrated to async
const COMPANY_CONFIG = {
  legalName: 'Zamorin Estate Pvt. Ltd.',
  tradingName: 'Zamorin Café',
  gstin: '29AABCZ1234M1Z5',
  cin: 'U55101KA2024PTC189201',
  regAddress: 'Koramangala, Bengaluru, Karnataka — 560095',
  contact: '+91 80 4123 9876 · corporate@zamorin.cafe',
  logoSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="180" height="180" rx="48" fill="#16223F"/><path d="M58 68 L142 68 L58 132 L142 132" fill="none" stroke="#C6A567" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const exportJobs = new Map();
const exportArtifacts = new Map();

function sanitizeCsvCell(val, isNum = false) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If explicitly numeric or looks strictly like a formatted number/percentage, do not neutralize
  const isNumericStr = isNum || /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(str.trim());
  if (!isNumericStr && str.length > 0) {
    const firstChar = str.charAt(0);
    if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
      return `"'${str.replace(/"/g, '""')}"`;
    }
  }
  return `"${str.replace(/"/g, '""')}"`;
}

class ZurfService {
  /**
   * Generates a unique immutable Report Run ID.
   */
  static generateRunId() {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `RPT-RUN-${d}-${rand}`;
  }

  /**
   * Builds an HTML-based printable ZURF v1 document with mandatory header,
   * background watermark on every page, and footer metadata.
   */
  static async renderZurfHtml({
    reportTitle,
    scope = 'All Cafés — Global Portfolio',
    period = 'Current Month (Aug 2026)',
    classification = 'INTERNAL',
    generatedBy = 'Primary Master',
    runId = null,
    kpiCards = [],
    columns = [],
    rows = [],
    notes = '',
    organisationId,
    cafeId = null,
    sensitivityLevel = 'INTERNAL',
  }) {
    const branding = await getCompanyConfig({ organisationId, cafeId, sensitivityLevel });
    const finalRunId = runId || this.generateRunId();
    const generatedAt = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${reportTitle} — ${branding.brandName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 20mm 15mm;
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.4;
      position: relative;
    }
    /* MANDATORY ZURF WATERMARK ON EVERY PAGE */
    .zurf-page-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      height: 420px;
      opacity: 0.055;
      z-index: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .zurf-page-watermark svg {
      width: 100%;
      height: 100%;
    }
    .zurf-content {
      position: relative;
      z-index: 1;
    }
    /* TOP-CENTRED MANDATORY CORPORATE HEADER */
    .zurf-header {
      text-align: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .zurf-logo-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 6px;
    }
    .zurf-legal-name {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #0f172a;
    }
    .zurf-gstin-bar {
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
      font-family: ui-monospace, monospace;
    }
    .zurf-scope-bar {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 10px;
      background: #f1f5f9;
      border-radius: 12px;
      font-size: 10.5px;
      font-weight: 700;
      color: #334155;
    }
    .zurf-report-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 10px;
      letter-spacing: -0.3px;
    }
    .zurf-period-bar {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-top: 2px;
    }
    /* METADATA STRIP */
    .zurf-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 14px;
      font-size: 10px;
    }
    .zurf-meta-item strong { color: #0f172a; }
    .zurf-meta-item span { color: #64748b; }
    /* KPI CARDS */
    .zurf-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }
    .zurf-kpi-card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      padding: 8px 10px;
      border-radius: 4px;
    }
    .zurf-kpi-title { font-size: 9.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .zurf-kpi-value { font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px; }
    /* DATA TABLE */
    table.zurf-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 10.5px;
    }
    table.zurf-table th, table.zurf-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
    }
    table.zurf-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
    }
    table.zurf-table tr:nth-child(even) td {
      background: #fafafa;
    }
    table.zurf-table td.num {
      text-align: right;
      font-family: ui-monospace, monospace;
    }
    /* MANDATORY FOOTER */
    .zurf-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 8px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #64748b;
    }
    .zurf-classification-badge {
      display: inline-block;
      padding: 1px 6px;
      background: #e2e8f0;
      border-radius: 3px;
      font-weight: 700;
      color: #0f172a;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <!-- MANDATORY BACKGROUND LOGO WATERMARK -->
  <div class="zurf-page-watermark">
    ${branding.logoSvg}
  </div>

  <div class="zurf-content">
    <!-- TOP-CENTRED MANDATORY HEADER -->
    <div class="zurf-header">
      <div class="zurf-logo-wrap">${branding.logoSvg}</div>
      <div class="zurf-legal-name">${branding.legalName}</div>
      <div class="zurf-gstin-bar">GSTIN: ${branding.gstin} · CIN: ${branding.cin}</div>
      <div class="zurf-scope-bar">${scope}</div>
      <div class="zurf-report-title">${reportTitle}</div>
      <div class="zurf-period-bar">Reporting Window: ${period}</div>
    </div>

    <!-- METADATA STRIP -->
    <div class="zurf-meta-grid">
      <div class="zurf-meta-item"><span>Run ID:</span> <strong>${finalRunId}</strong></div>
      <div class="zurf-meta-item"><span>Generated:</span> <strong>${generatedAt}</strong></div>
      <div class="zurf-meta-item"><span>Actor:</span> <strong>${generatedBy}</strong></div>
      <div class="zurf-meta-item"><span>Classification:</span> <span class="zurf-classification-badge">${classification}</span></div>
    </div>

    <!-- KPI CARDS (IF PROVIDED) -->
    ${kpiCards.length > 0 ? `
      <div class="zurf-kpi-grid">
        ${kpiCards.map((k) => `
          <div class="zurf-kpi-card">
            <div class="zurf-kpi-title">${k.label}</div>
            <div class="zurf-kpi-value">${k.value}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- DETAIL TABLE -->
    <table class="zurf-table">
      <thead>
        <tr>
          ${columns.map((c) => `<th style="${c.isNum ? 'text-align:right;' : ''}">${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            ${columns.map((c) => `<td class="${c.isNum ? 'num' : ''}">${r[c.key] ?? '—'}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${notes ? `<div style="font-size:10px;color:#64748b;margin-top:8px;font-style:italic;">* ${notes}</div>` : ''}

    <!-- MANDATORY FOOTER -->
    <div class="zurf-footer">
      <div>${branding.legalName} · ${classification}</div>
      <div>Run ID: ${finalRunId}</div>
      <div>ZURF v1 Verified</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates clean machine-readable CSV with separate metadata manifest
   * and strict formula injection sanitization.
   */
  static async renderCsv({ reportTitle, scope, period, columns = [], rows = [], organisationId, cafeId = null, sensitivityLevel = 'INTERNAL', runId = null }) {
    const branding = await getCompanyConfig({ organisationId, cafeId, sensitivityLevel });
    const headerRow = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const dataRows = rows.map((r) =>
      columns.map((c) => sanitizeCsvCell(r[c.key], c.isNum)).join(',')
    );

    const csvContent = [headerRow, ...dataRows].join('\n');
    const finalRunId = runId || this.generateRunId();

    const manifest = {
      reportTitle,
      scope,
      period,
      runId: finalRunId,
      company: branding.legalName,
      gstin: branding.gstin,
      companyDetailsVersionId: branding.companyDetailsVersionId,
      rowCount: rows.length,
      generatedAt: new Date().toISOString(),
      zurfVersion: 'v1.0',
    };

    return {
      csv: csvContent,
      manifest,
      runId: finalRunId,
    };
  }

  /**
   * Generates a standard binary PDF Buffer conforming to %PDF-1.4
   */
  static async renderBinaryPdf({ reportTitle, reportCode, qrCodeData, scope, period, columns = [], rows = [], kpiCards = [], organisationId, cafeId = null, sensitivityLevel = 'INTERNAL', runId = null }) {
    const branding = await getCompanyConfig({ organisationId, cafeId, sensitivityLevel });
    const { generatePdf } = require('../utils/exportGenerators');
    return generatePdf({
      reportTitle,
      reportCode,
      qrCodeData,
      scope,
      period,
      columns,
      rows,
      kpiCards,
      branding,
      runId
    });
  }

  /**
   * Generates a standard binary Microsoft Excel OpenXML package (.xlsx)
   */
  static async renderXlsx({ sheetName = 'Report', reportTitle = 'Export', columns = [], rows = [], sheets = null, organisationId, cafeId = null, sensitivityLevel = 'INTERNAL', runId = null }) {
    const branding = await getCompanyConfig({ organisationId, cafeId, sensitivityLevel });
    const { generateXlsx } = require('../utils/exportGenerators');
    return generateXlsx({
      sheetName,
      reportTitle,
      columns,
      rows,
      sheets,
      branding,
      runId
    });
  }

  /**
   * Asynchronously schedules an export job in the queue and caches artifact data.
   */
  static enqueueExportJob({ reportId, format = 'PDF', scope, period, userId, organisationId = null, artifact = null }) {
    const jobId = `EXP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const job = {
      jobId,
      reportId,
      format,
      scope,
      period,
      userId,
      organisationId,
      status: 'READY',
      progress: 100,
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/v1/reports/export/${jobId}/download`,
    };
    exportJobs.set(jobId, job);
    if (artifact) {
      exportArtifacts.set(jobId, {
        ...artifact,
        jobId,
        userId,
        organisationId,
      });
    }
    return job;
  }

  /**
   * Stores a generated export artifact by runId or jobId and records in ExportHistory.
   */
  static storeExportArtifact(id, artifact) {
    if (!id || !artifact) return;
    exportArtifacts.set(id, {
      ...artifact,
      id,
      storedAt: Date.now(),
    });

    try {
      const { ExportHistory } = require('../models/ExportHistory');
      const crypto = require('crypto');
      const checksum = artifact.buffer ? crypto.createHash('sha256').update(artifact.buffer).digest('hex') : null;
      ExportHistory.create({
        exportId: id,
        documentType: artifact.documentType || 'REPORT',
        relatedRecordId: artifact.relatedRecordId || null,
        format: (artifact.format || 'PDF').toUpperCase(),
        filename: artifact.filename || `${id}.${(artifact.format || 'pdf').toLowerCase()}`,
        fileSize: artifact.buffer ? artifact.buffer.length : 0,
        checksum,
        organisationId: artifact.organisationId || 'ORG-DEFAULT',
        cafeId: artifact.cafeId || 'ALL',
        generatedByUserId: artifact.userId || 'SYSTEM',
        destinationType: artifact.destinationType || 'BROWSER_DOWNLOAD',
        status: 'COMPLETED',
        templateVersion: 'Zamorin Universal Corporate Standard v1.0',
        metadata: {
          mimeType: artifact.mimeType,
          runId: id
        }
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Retrieves a generated export artifact safely by runId or jobId.
   */
  static getExportArtifact(id, auth = {}) {
    if (!id || typeof id !== 'string') {
      const { ApiError } = require('../utils/ApiError');
      throw new ApiError(400, 'INVALID_ARTIFACT_ID', 'Invalid artifact identifier.');
    }

    // Path traversal defense
    if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
      const { ApiError } = require('../utils/ApiError');
      throw new ApiError(400, 'INVALID_ARTIFACT_ID', 'Path traversal characters are strictly forbidden in artifact identifier.');
    }

    const cleanId = id.replace(/\.(?:pdf|csv|xlsx)$/i, '').trim();
    const artifact = exportArtifacts.get(cleanId) || exportArtifacts.get(id);

    if (!artifact) {
      const { ApiError } = require('../utils/ApiError');
      throw new ApiError(404, 'ARTIFACT_NOT_FOUND', 'Export artifact not found or expired.');
    }

    // Tenant isolation
    if (artifact.organisationId && auth.organisationId && artifact.organisationId !== auth.organisationId) {
      const { ApiError } = require('../utils/ApiError');
      throw new ApiError(403, 'TENANT_MISMATCH', 'Unauthorized access to foreign organisation artifact.');
    }

    // Role / user scoping: non-master cannot access another user's artifact unless from same authorised scope
    if (auth.role !== 'MASTER' && artifact.userId && auth.userId && artifact.userId !== auth.userId) {
      const { ApiError } = require('../utils/ApiError');
      throw new ApiError(403, 'ACCESS_DENIED', 'You are not authorized to download this artifact.');
    }

    return artifact;
  }

  /**
   * Retrieves active export jobs for a user.
   */
  static listUserJobs(userId) {
    return Array.from(exportJobs.values())
      .filter((j) => !userId || j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

module.exports = {
  ZurfService,
  COMPANY_CONFIG,
  getCompanyConfig,
};
