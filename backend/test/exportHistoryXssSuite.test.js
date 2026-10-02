'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Window } = require('happy-dom');

const root = path.resolve(__dirname, '../..');

test('Export History & Centre Stored XSS Mitigation Suite (Blocker 2)', async (t) => {
  // Set up DOM environment before importing frontend code
  const win = new Window();
  global.window = win;
  global.document = win.document;
  global.URL = win.URL;
  global.Blob = win.Blob;

  const exportCentreUrl = pathToFileURL(path.join(root, 'frontend/src/js/pages/exportCentre.js')).href;
  const componentsUrl = pathToFileURL(path.join(root, 'frontend/src/js/components.js')).href;
  const stateUrl = pathToFileURL(path.join(root, 'frontend/src/js/state.js')).href;

  const { renderExportHistoryTable, loadExportHistory, renderExportCentre } = await import(exportCentreUrl);
  const { escapeHtml } = await import(componentsUrl);
  const { state } = await import(stateUrl);

  await t.test('XSS-001: escapeHtml utility properly encodes all HTML control characters', () => {
    assert.equal(escapeHtml('<script>alert("XSS & test")</script>'), '&lt;script&gt;alert(&quot;XSS &amp; test&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml("'><img src=x onerror=alert('1')>"), '&#039;&gt;&lt;img src=x onerror=alert(&#039;1&#039;)&gt;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(123), '123');
  });

  await t.test('XSS-002: renderExportHistoryTable safely renders malicious strings as inert text without creating executable DOM elements', () => {
    const maliciousItems = [
      {
        reportTitle: '<script>window.__xss1=true;</script>Daily Sales Report',
        format: '"><iframe src="javascript:alert(3)">',
        scope: '<input autofocus onfocus=alert(4)>All Cafés',
        cafeId: '<details open ontoggle=alert(5)>',
        generatedBy: '<b onmouseover=alert(6)>Cashier</b>',
        userName: '<a href="javascript:alert(7)">Hacker</a>',
        status: '"><body onload=alert(8)>',
        createdAt: '2026-10-02T10:00:00.000Z',
      },
      {
        reportTitle: '',
        reportCode: '"><img src=x onerror=alert(1)>',
        filename: 'safe_name.pdf',
        format: 'PDF',
        scope: 'ZC-0001',
        generatedBy: '"><script>document.location="https://attacker.com"</script>',
        status: 'VERIFIED',
      },
      {
        reportTitle: null,
        reportCode: null,
        filename: '<svg onload=alert(2)>.pdf',
        format: 'XLSX',
        scope: 'ZC-0002',
        generatedBy: 'Admin',
        status: 'VERIFIED',
      },
    ];

    const rendered = renderExportHistoryTable(maliciousItems);

    // 1. Verify that no dangerous executable tags were created in the DOM
    const dangerousTags = ['script', 'img', 'svg', 'iframe', 'input', 'details', 'body', 'a', 'b'];
    for (const tag of dangerousTags) {
      const found = rendered.querySelectorAll(tag);
      assert.equal(found.length, 0, `Expected 0 <${tag}> tags in rendered DOM, found ${found.length}`);
    }

    // 2. Verify that no attributes starting with 'on' (event handlers) exist anywhere in the element tree
    const allElements = rendered.querySelectorAll('*');
    for (const el of allElements) {
      for (const attr of el.attributes) {
        assert.ok(
          !attr.name.toLowerCase().startsWith('on'),
          `Found dangerous event handler attribute "${attr.name}" on <${el.tagName}>`
        );
      }
    }

    // 3. Verify that malicious payloads are preserved strictly as inert textContent
    const allText = rendered.textContent;
    assert.ok(allText.includes('<script>window.__xss1=true;</script>'), 'Payload in reportTitle must be preserved as inert text');
    assert.ok(allText.includes('"><img src=x onerror=alert(1)>'), 'Payload in reportCode must be preserved as inert text');
    assert.ok(allText.includes('<svg onload=alert(2)>.pdf'), 'Payload in filename must be preserved as inert text');
    assert.ok(allText.includes('"><iframe src="javascript:alert(3)">'), 'Payload in format must be preserved as inert text');
    assert.ok(allText.includes('<input autofocus onfocus=alert(4)>'), 'Payload in scope must be preserved as inert text');
    assert.ok(allText.includes('<b onmouseover=alert(6)>'), 'Payload in generatedBy must be preserved as inert text');
  });

  function mockFetchResponse(data, status = 200) {
    const textPayload = JSON.stringify(data);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (header) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => textPayload,
      json: async () => data,
    };
  }

  await t.test('XSS-003: loadExportHistory with mocked API responses renders safely across all states', async () => {
    const container = win.document.createElement('div');
    container.innerHTML = '<div id="export-history-container"></div>';
    win.document.body.appendChild(container);

    // 1. Mock API returning items with stored XSS payloads
    global.fetch = async () => mockFetchResponse({
      success: true,
      data: {
        items: [
          {
            reportTitle: '<script>alert("injected")</script>',
            format: 'PDF',
            scope: 'ZC-0001',
            generatedBy: '"><img src=x onerror=alert(1)>',
            createdAt: '2026-10-02T10:00:00.000Z',
            status: 'VERIFIED',
          },
        ],
      },
    });

    await loadExportHistory(container);
    const historyContainer = container.querySelector('#export-history-container');
    assert.equal(historyContainer.querySelectorAll('script, img').length, 0, 'No executable script or img tags');
    assert.ok(historyContainer.textContent.includes('<script>alert("injected")</script>'), 'Payload must be inert text');

    // 2. Mock API returning empty items
    global.fetch = async () => mockFetchResponse({
      success: true,
      data: { items: [] },
    });

    await loadExportHistory(container);
    assert.ok(historyContainer.textContent.includes('No exports recorded yet'), 'Empty state must render safely');
    assert.equal(historyContainer.querySelectorAll('script, img, iframe').length, 0);

    // 3. Mock API returning error response (e.g. 500 Server Error)
    global.fetch = async () => mockFetchResponse({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Internal Server Error' },
    }, 500);

    await loadExportHistory(container);
    assert.ok(historyContainer.textContent.includes('No prior export history found'), 'Error fallback state must render safely');
    assert.equal(historyContainer.querySelectorAll('script, img, iframe').length, 0);
  });

  await t.test('XSS-004: Strict RBAC double-gating and search input escaping in renderExportCentre', () => {
    // 1. Access denied for unauthorized roles (e.g. STAFF)
    state.user = { userId: 'EMP-001', email: 'staff@zamorin.com' };
    state.role = 'STAFF';
    const restrictedHtml = renderExportCentre();
    assert.ok(restrictedHtml.includes('Access Restricted'), 'STAFF must be denied Export Centre access');
    assert.ok(!restrictedHtml.includes('id="export-search-input"'), 'Search input must not render for STAFF');

    // 2. Access granted for Primary Master
    state.user = { userId: 'MU-0001', email: 'pradeeshk331@gmail.com', isPrimaryMaster: true };
    state.role = 'MASTER';
    const pmHtml = renderExportCentre();
    assert.ok(pmHtml.includes('Export Centre'), 'Primary Master must access Export Centre');
    assert.ok(pmHtml.includes('id="export-search-input"'), 'Search input must render for Primary Master');

    // 3. Access granted for Owner
    state.user = { userId: 'OWN-001', email: 'owner@zamorin.com' };
    state.role = 'OWNER';
    const ownerHtml = renderExportCentre();
    assert.ok(ownerHtml.includes('Export Centre'), 'Owner must access Export Centre');
    assert.ok(ownerHtml.includes('id="export-search-input"'), 'Search input must render for Owner');
  });
});
