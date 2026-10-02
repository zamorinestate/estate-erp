'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  generateZurfExport,
  SUPPORTED_ZURF_REPORT_IDS,
} = require('../src/controllers/reportController');

const reportRoutes = require('../src/routes/reportRoutes');
const personalLedgerRoutes = require('../src/routes/personalLedgerRoutes');
const passbookRoutes = require('../src/routes/passbookRoutes');
const exportRoutes = require('../src/routes/exportRoutes');

const root = path.resolve(__dirname, '../..');

test('Export Data Integrity & Canonical Mapping Suite (Blocker 1)', async (t) => {
  // Dynamically import EXPORT_CATALOGUE from frontend
  const exportCentreUrl = pathToFileURL(path.join(root, 'frontend/src/js/pages/exportCentre.js')).href;
  const { EXPORT_CATALOGUE } = await import(exportCentreUrl);

  // ── 1. CATALOGUE STRUCTURE & ZERO-UNBACKED AUDIT ───────────────────────────
  await t.test('EXP-001: Export Catalogue contains exactly 18 backed canonical entries across all 7 categories', () => {
    assert.equal(EXPORT_CATALOGUE.length, 18, 'Catalogue must have exactly 18 entries');

    const categories = {};
    for (const item of EXPORT_CATALOGUE) {
      categories[item.category] = (categories[item.category] || 0) + 1;
    }

    assert.equal(categories.SALES, 3, 'SALES category must have 3 entries');
    assert.equal(categories.FINANCE, 3, 'FINANCE category must have 3 entries');
    assert.equal(categories.INVENTORY, 1, 'INVENTORY category must have 1 entry');
    assert.equal(categories.PROCUREMENT, 1, 'PROCUREMENT category must have 1 entry');
    assert.equal(categories.VENDORS, 1, 'VENDORS category must have 1 entry');
    assert.equal(categories.WORKFORCE, 3, 'WORKFORCE category must have 3 entries');
    assert.equal(categories.COMMERCIAL, 6, 'COMMERCIAL category must have 6 entries');
  });

  await t.test('EXP-002: Removed unbacked report IDs are completely eliminated from catalogue', () => {
    const unbackedIds = [
      'sales-register',
      'gst-sales-summary',
      'expense-register',
      'revenue-share-statement',
      'stock-movement-ledger',
      'inventory-wastage',
      'stock-count-variance',
      'purchase-orders-register',
      'grn-register',
      'three-way-matching',
      'vendor-ageing',
      'employee-register',
    ];

    const catalogueIds = new Set(EXPORT_CATALOGUE.map(item => item.id));
    const catalogueReportIds = new Set(EXPORT_CATALOGUE.map(item => item.reportId));

    for (const badId of unbackedIds) {
      assert.ok(!catalogueIds.has(badId), `Catalogue must NOT contain unbacked ID: ${badId}`);
      assert.ok(!catalogueReportIds.has(badId), `Catalogue reportId must NOT contain unbacked ID: ${badId}`);
    }
  });

  await t.test('EXP-003: Every catalogue entry contains all required schema properties', () => {
    const requiredKeys = [
      'id',
      'name',
      'description',
      'category',
      'categoryLabel',
      'formats',
      'scopeType',
      'sourceModule',
      'endpoint',
      'reportId',
      'reportCode',
      'requiresDates',
    ];

    for (const item of EXPORT_CATALOGUE) {
      for (const key of requiredKeys) {
        assert.ok(key in item, `Item "${item.id}" missing required property "${key}"`);
      }
      assert.ok(Array.isArray(item.formats) && item.formats.length > 0, `Item "${item.id}" must have non-empty formats array`);
      assert.ok(typeof item.endpoint === 'string' && item.endpoint.startsWith('/api/v1/'), `Item "${item.id}" must have valid /api/v1/ endpoint`);
    }
  });

  // ── 2. BACKEND ROUTE REGISTRATION & ENDPOINT AUDIT ─────────────────────────
  await t.test('EXP-004: All advertised backend routes are mounted and accessible in express routers', () => {
    // Helper to inspect express router stack
    function routerHasRoute(router, method, pathPattern) {
      return router.stack.some(layer => {
        if (!layer.route) return false;
        const matchesPath = layer.route.path === pathPattern;
        const matchesMethod = layer.route.methods && layer.route.methods[method.toLowerCase()];
        return matchesPath && matchesMethod;
      });
    }

    assert.ok(routerHasRoute(reportRoutes, 'POST', '/export'), 'reportRoutes must have POST /export');
    assert.ok(routerHasRoute(personalLedgerRoutes, 'GET', '/export'), 'personalLedgerRoutes must have GET /export');
    assert.ok(routerHasRoute(passbookRoutes, 'GET', '/export/pdf'), 'passbookRoutes must have GET /export/pdf');
    assert.ok(routerHasRoute(exportRoutes, 'GET', '/history'), 'exportRoutes must have GET /history');
  });

  // ── 3. FAIL-CLOSED CONTROLLER VALIDATION (NO GENERIC FALLTHROUGH) ──────────
  await t.test('EXP-005: generateZurfExport fails closed on unknown/unsupported report IDs with 400 UNSUPPORTED_REPORT_ID', async () => {
    const unknownReportIds = [
      'unsupported-custom-report',
      'arbitrary-fake-title',
      'sales-register',
      'gst-sales-summary',
      'expense-register',
      'revenue-share-statement',
      'stock-movement-ledger',
      'inventory-wastage',
      'stock-count-variance',
      'purchase-orders-register',
      'grn-register',
      'three-way-matching',
      'vendor-ageing',
      'employee-register',
    ];

    for (const badId of unknownReportIds) {
      const req = {
        auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
        body: { reportId: badId, format: 'PDF' },
      };
      const res = { status() { return this; }, json() { return this; } };

      await assert.rejects(
        async () => {
          await generateZurfExport(req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 400, `Unknown report ID "${badId}" must reject with 400`);
          assert.equal(err.code, 'UNSUPPORTED_REPORT_ID', `Error code must be UNSUPPORTED_REPORT_ID for "${badId}"`);
          assert.match(err.message, /Unsupported export report ID/i);
          return true;
        }
      );
    }
  });

  await t.test('EXP-006: All 16 report-export catalogue entries are members of SUPPORTED_ZURF_REPORT_IDS', () => {
    assert.ok(SUPPORTED_ZURF_REPORT_IDS instanceof Set, 'SUPPORTED_ZURF_REPORT_IDS must be a Set');

    const reportExportItems = EXPORT_CATALOGUE.filter(item => item.endpoint === '/api/v1/reports/export');
    assert.equal(reportExportItems.length, 16, 'Exactly 16 catalogue items must route to /api/v1/reports/export');

    for (const item of reportExportItems) {
      assert.ok(
        SUPPORTED_ZURF_REPORT_IDS.has(item.reportId),
        `Catalogue reportId "${item.reportId}" for item "${item.id}" must be in SUPPORTED_ZURF_REPORT_IDS`
      );
    }
  });

  // ── 4. FORMAT SUPPORT INTEGRITY ────────────────────────────────────────────
  await t.test('EXP-007: Advertised formats strictly align with backend generation capabilities', () => {
    for (const item of EXPORT_CATALOGUE) {
      if (item.endpoint === '/api/v1/reports/export') {
        assert.deepEqual(
          item.formats.slice().sort(),
          ['PDF', 'XLSX'].sort(),
          `Report export item "${item.id}" must only advertise PDF and XLSX`
        );
      } else if (item.id === 'personal-ledger') {
        assert.deepEqual(item.formats, ['CSV'], 'personal-ledger must only advertise CSV');
      } else if (item.id === 'passbook-pdf') {
        assert.ok(item.formats.includes('PDF'), 'passbook must support PDF');
        assert.ok(!item.formats.includes('XLSX'), 'passbook does not support XLSX');
      }
    }
  });

  await t.test('EXP-008: Reports export rejects CSV format request with 400 UNSUPPORTED_EXPORT_FORMAT', async () => {
    const req = {
      auth: { userId: 'MU-0001', organisationId: 'ORG-ZAMORIN', role: 'MASTER', isPrimaryMaster: true },
      body: { reportId: 'daily-sales', format: 'CSV' },
    };
    const res = { status() { return this; }, json() { return this; } };

    await assert.rejects(
      async () => {
        await generateZurfExport(req, res);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'UNSUPPORTED_EXPORT_FORMAT');
        return true;
      }
    );
  });
});
