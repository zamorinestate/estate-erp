'use strict';

const { MockMalwareScanningProvider } = require('./MockMalwareScanningProvider');
const { ClamAvHttpScanningProvider } = require('./ClamAvHttpScanningProvider');
const { ClamAVScanner } = require('../scanners/ClamAVScanner');

/**
 * ZAMORIN CAFÉ ERP — MALWARE SCANNER PROVIDER FACTORY
 * 
 * Enforces production invariants:
 * - In NODE_ENV === 'production':
 *   - Local mock scanner is strictly disallowed (PROD_MOCK_SCANNER_DISALLOWED).
 *   - External production scanner engine is required. If not configured, fails closed.
 * - In development / test:
 *   - Deterministic mock scanner adapter is permitted.
 */

function createMalwareScanningProvider(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const providerName = (
    options.provider ||
    process.env.DOCUMENT_MALWARE_SCANNER_PROVIDER ||
    (isProduction ? 'clamav' : 'mock')
  ).toLowerCase();

  if (isProduction) {
    if (providerName === 'mock') {
      const err = new Error('PROD_MOCK_SCANNER_DISALLOWED: Mock malware scanner cannot be utilized in production environment.');
      err.code = 'PROD_MOCK_SCANNER_DISALLOWED';
      throw err;
    }

    if (providerName === 'clamav_tcp' || providerName === 'clamav_instream' || (!options.scannerUrl && !process.env.MALWARE_SCANNER_URL && (options.host || process.env.CLAMAV_HOST))) {
      return new ClamAVScanner({
        host: options.host || process.env.CLAMAV_HOST,
        port: options.port || process.env.CLAMAV_PORT,
        timeoutMs: options.timeoutMs || process.env.CLAMAV_TIMEOUT_MS,
      });
    }

    const scanner = new ClamAvHttpScanningProvider({
      scannerUrl: options.scannerUrl || process.env.MALWARE_SCANNER_URL,
      timeoutMs: options.timeoutMs || process.env.MALWARE_SCANNER_TIMEOUT_MS,
      authToken: options.authToken || process.env.MALWARE_SCANNER_API_KEY,
    });

    return scanner;
  }

  // Development / Test environments
  if (providerName === 'mock') {
    return new MockMalwareScanningProvider(options);
  }

  if (providerName === 'clamav_tcp' || providerName === 'clamav_instream' || options.host) {
    return new ClamAVScanner(options);
  }

  return new ClamAvHttpScanningProvider(options);
}

/**
 * Returns runtime configuration and health status of malware scanning layer.
 */
async function getScannerRuntimeStatus() {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasUrl = Boolean(process.env.MALWARE_SCANNER_URL);

  return {
    PRODUCTION_SCANNER_ADAPTER_IMPLEMENTED: true,
    LIVE_PRODUCTION_MALWARE_SCANNER_CONFIGURED: isProduction ? hasUrl : (hasUrl ? true : 'EXTERNAL_PENDING'),
    MOCK_SCANNER_ALLOWED_IN_PRODUCTION: false,
    ACTIVE_PROVIDER_TYPE: isProduction ? 'PRODUCTION_HTTP_ENGINE' : 'TEST_MOCK_ENGINE',
  };
}

module.exports = {
  createMalwareScanningProvider,
  getScannerRuntimeStatus,
};
