'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — EXPORT ENGINE & COMPANY IDENTITY COMPLIANCE TESTS
 * ============================================================================
 * Replaces EXPORT_ENGINE_COMPANY_IDENTITY_MASTER_STANDARD.md with automated
 * code-first verification of:
 * 1. Company / Organisation Identity Master resolution (Sections 364–370).
 * 2. Two-tier resolution (Head Office vs Outlet scoped identity, Section 368).
 * 3. CSV formula injection neutralization (RFC 4180 / CWE-1236, Sections 65-66).
 * 4. Authoritative binary PDF 1.4 generation compliance (Sections 40-42).
 * 5. Excel OpenXML (.xlsx) package integrity (Section 51).
 * 6. Audit trail & Run ID determinism.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { CompanyIdentityService } = require('../src/services/companyIdentityService');
const { Cafe } = require('../src/models/Cafe');
const {
  sanitizeCsvValue,
  generateCsv,
  generatePdf,
  generateXlsx
} = require('../src/utils/exportGenerators');

describe('Universal Export Engine & Company Identity Master Compliance', () => {

  test('SEC-366: Resolves mandatory company identity fields from configured master only', async (t) => {
    t.mock.method(CompanyIdentityService, 'getCurrentIdentity', async (organisationId) => ({
      _id: 'IDENTITY-EXPORT-TEST-V1',
      organisationId,
      legalName: 'Export Test Foods Private Limited',
      brandName: 'Export Test Cafe',
      tagline: 'Configured Test Identity',
      registeredAddress: {
        line1: '1 Test Road',
        city: 'Kozhikode',
        state: 'Kerala',
        pincode: '673001',
        country: 'India',
      },
      gstin: [
        {
          state: 'Kerala',
          stateCode: '32',
          number: '32AAACZ1234K1Z5',
          isPrimary: true,
        },
      ],
      licences: [
        {
          type: 'FSSAI Test Licence',
          number: '12345678901234',
        },
      ],
      contact: {
        phone: '+91 99999 99999',
        email: 'exports@example.invalid',
        website: 'https://example.invalid',
      },
      logo: {
        primarySvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        monochromeSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      },
      version: 1,
    }));

    const branding = await CompanyIdentityService.resolveExportBranding({
      organisationId: 'ORG-EXPORT-TEST',
      cafeId: null,
      sensitivityLevel: 'TAX_INVOICE',
    });

    assert.equal(branding.organisationId, 'ORG-EXPORT-TEST');
    assert.equal(branding.legalName, 'Export Test Foods Private Limited');
    assert.equal(branding.brandName, 'Export Test Cafe');
    assert.equal(branding.gstin, '32AAACZ1234K1Z5');
    assert.equal(branding.fssai, '12345678901234');
    assert.match(branding.address, /1 Test Road/);
    assert.equal(branding.identityStatus, 'CONFIGURED');
  });

  test('SEC-368: Two-tier resolution uses exact tenant cafe data without statutory fallback', async (t) => {
    t.mock.method(CompanyIdentityService, 'getCurrentIdentity', async (organisationId) => ({
      _id: 'IDENTITY-EXPORT-TEST-V1',
      organisationId,
      legalName: 'Export Test Foods Private Limited',
      brandName: 'Export Test Cafe',
      registeredAddress: {
        line1: '1 Head Office Road',
        city: 'Kozhikode',
        state: 'Kerala',
        pincode: '673001',
        country: 'India',
      },
      gstin: [
        {
          state: 'Kerala',
          stateCode: '32',
          number: '32AAACZ1234K1Z5',
          isPrimary: true,
        },
      ],
      licences: [{ type: 'FSSAI Test Licence', number: '12345678901234' }],
      contact: {},
      logo: {},
      version: 1,
    }));

    t.mock.method(Cafe, 'findOne', (filter) => ({
      lean: async () => {
        assert.equal(filter.organisationId, 'ORG-EXPORT-TEST');
        assert.equal(filter.cafeId, 'ZC-EXPORT-0001');
        return {
          cafeId: 'ZC-EXPORT-0001',
          name: 'Outlet Test',
          displayName: 'Outlet Test',
          address: {
            building: '9',
            street: 'Outlet Road',
            city: 'Kochi',
            state: 'Kerala',
            pinCode: '682001',
          },
          registrations: {
            gstDetails: {
              isRegistered: true,
              gstin: '32AAACZ1234K1Z5',
              legalName: 'Export Test Foods Private Limited',
            },
            fssai: {
              isApplicable: true,
              number: '98765432109876',
            },
          },
        };
      },
    }));

    const globalBranding = await CompanyIdentityService.resolveExportBranding({
      organisationId: 'ORG-EXPORT-TEST',
      cafeId: null,
    });
    assert.equal(globalBranding.isOutletScoped, false);

    const outletBranding = await CompanyIdentityService.resolveExportBranding({
      organisationId: 'ORG-EXPORT-TEST',
      cafeId: 'ZC-EXPORT-0001',
      sensitivityLevel: 'TAX_INVOICE',
    });
    assert.equal(outletBranding.isOutletScoped, true);
    assert.equal(outletBranding.cafeId, 'ZC-EXPORT-0001');
    assert.equal(outletBranding.fssai, '98765432109876');
    assert.match(outletBranding.address, /Outlet Road/);
  });

  test('SEC-197 / CWE-1236: CSV Formula Injection Neutralization', () => {
    // Dangerous spreadsheet prefixes with quotes
    assert.strictEqual(sanitizeCsvValue('=CMD|"/C calc"!A0'), `"'=CMD|""/C calc""!A0"`);
    // Dangerous numeric / mathematical formula prefix
    assert.strictEqual(sanitizeCsvValue('+12345'), '\'+12345');
    assert.strictEqual(sanitizeCsvValue('-1000'), '\'-1000');
    assert.strictEqual(sanitizeCsvValue('@SUM(A1:A10)'), '\'@SUM(A1:A10)');
    assert.strictEqual(sanitizeCsvValue('\tTAB_PREFIX'), '\'\tTAB_PREFIX');

    // Full-width Unicode formula prefixes
    assert.strictEqual(sanitizeCsvValue('\uFF1D1+1'), '\'＝1+1');
    assert.strictEqual(sanitizeCsvValue('\uFF0B50'), '\'＋50');

    // Safe regular strings
    assert.strictEqual(sanitizeCsvValue('Cappuccino Grande'), 'Cappuccino Grande');
    assert.strictEqual(sanitizeCsvValue('Normal text, with comma'), '"Normal text, with comma"');
    assert.strictEqual(sanitizeCsvValue(null), '');
    assert.strictEqual(sanitizeCsvValue(undefined), '');
  });

  test('SEC-65: CSV generation includes compliant header, sanitized data, and Run ID', () => {
    const columns = [
      { key: 'item', label: 'Item Name' },
      { key: 'price', label: 'Price' },
      { key: 'formulaField', label: 'Formula' }
    ];
    const rows = [
      { item: 'Cold Brew', price: '220.00', formulaField: '=HYPERLINK("http://evil.com")' },
      { item: 'Espresso', price: '150.00', formulaField: 'Safe Value' }
    ];

    const result = generateCsv({
      columns,
      rows,
      reportTitle: 'Daily Sales Test'
    });

    assert.ok(result.csv, 'CSV output must be non-empty');
    assert.ok(result.csv.includes('Item Name,Price,Formula'), 'Header row must be rendered');
    assert.ok(result.csv.includes('\'=HYPERLINK'), 'Formula injection must be neutralized');
    assert.ok(result.csv.includes('Espresso,150.00,Safe Value'), 'Safe row must be intact');
    assert.ok(/^RPT-RUN-\d{8}-\d{4}$/.test(result.runId), 'Run ID must match RPT-RUN-YYYYMMDD-XXXX format');
  });

  test('SEC-40-42: Authoritative binary PDF 1.4 generation compliance', () => {
    const pdfResult = generatePdf({
      reportTitle: 'Executive Financial Summary',
      subtitle: 'Audit Test Run',
      columns: [
        { key: 'metric', label: 'Metric', width: 200 },
        { key: 'val', label: 'Value', width: 100 }
      ],
      rows: [
        { metric: 'Total Gross Sales', val: 'INR 1,25,000' },
        { metric: 'Tax Collected', val: 'INR 6,250' }
      ],
      summaryMetrics: [
        { label: 'Settled Bills', value: '142' }
      ]
    });

    assert.ok(pdfResult && Buffer.isBuffer(pdfResult.buffer), 'PDF output must contain buffer');
    const pdfString = pdfResult.buffer.toString('binary');
    assert.ok(pdfString.startsWith('%PDF-1.4'), 'PDF must start with %PDF-1.4 magic header');
    assert.ok(pdfString.includes('%%EOF'), 'PDF must terminate with %%EOF trailer');
    assert.ok(pdfResult.filename.endsWith('.pdf'), 'PDF filename must end with .pdf');
  });

  test('SEC-51: Excel OpenXML (.xlsx) binary package integrity', () => {
    const xlsxResult = generateXlsx({
      reportTitle: 'Inventory Stock Level',
      sheets: [
        {
          name: 'Current Stock',
          columns: [{ key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Quantity' }],
          rows: [{ sku: 'BEAN-ARABICA-01', qty: 50 }]
        }
      ]
    });

    assert.ok(xlsxResult && Buffer.isBuffer(xlsxResult.buffer), 'XLSX output must contain buffer');
    const xlsxBuffer = xlsxResult.buffer;
    // OpenXML (.xlsx) files are standard ZIP archives starting with PK\x03\x04
    assert.strictEqual(xlsxBuffer[0], 0x50, 'Byte 0 must be P (0x50)');
    assert.strictEqual(xlsxBuffer[1], 0x4b, 'Byte 1 must be K (0x4B)');
    assert.strictEqual(xlsxBuffer[2], 0x03, 'Byte 2 must be 0x03');
    assert.strictEqual(xlsxBuffer[3], 0x04, 'Byte 3 must be 0x04');
    assert.ok(xlsxResult.filename.endsWith('.xlsx'), 'XLSX filename must end with .xlsx');
  });
});
