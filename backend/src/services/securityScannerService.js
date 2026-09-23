'use strict';

const { DocumentMalwareScanner, defaultMalwareScanner, EICAR_SIGNATURE } = require('./security/DocumentMalwareScanner');

/**
 * ZAMORIN CAFÉ ERP — UPLOAD SECURITY & SCANNING SERVICE FACADE
 * 
 * Bridges legacy SecurityScannerService calls to the canonical REC-06 DocumentMalwareScanner.
 */

class SecurityScannerService {
  static async scanFile({ filePath, fileBuffer, mimeType, filename, options = {} }) {
    const res = await defaultMalwareScanner.scanObject({
      filePath,
      buffer: fileBuffer,
      mimeType,
      filename,
      options,
    });

    let status = 'CLEAN';
    if (res.status === 'INFECTED') {
      status = 'REJECTED';
    } else if (res.status === 'SCAN_ERROR') {
      status = 'SCAN_FAILED';
    } else if (res.status === 'PENDING') {
      status = 'PENDING_SCAN';
    }

    let threatName = res.threatName || null;
    let details = res.details;
    if (status === 'REJECTED' && threatName === 'EICAR-Test-Signature') {
      details = 'EICAR standard antivirus test signature detected in document payload.';
    } else if (status === 'CLEAN' && (!process.env.MALWARE_SCANNER_URL || defaultMalwareScanner.provider === 'PENDING_PRODUCTION_PROVIDER')) {
      details = 'scanner integration ready — production provider pending';
    }

    const provider = (!process.env.MALWARE_SCANNER_URL || defaultMalwareScanner.provider === 'PENDING_PRODUCTION_PROVIDER')
      ? 'PENDING_PRODUCTION_PROVIDER'
      : res.scannerProvider;

    return {
      status,
      scanStatus: res.status,
      threatName,
      details,
      provider,
      scannedAt: res.scannedAt,
    };
  }
}

module.exports = {
  SecurityScannerService,
  DocumentMalwareScanner,
  defaultMalwareScanner,
  EICAR_SIGNATURE,
};
