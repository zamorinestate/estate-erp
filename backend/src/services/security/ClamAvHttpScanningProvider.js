'use strict';

const http = require('http');
const https = require('https');
const { MalwareScanningProvider } = require('./MalwareScanningProvider');

/**
 * ZAMORIN CAFÉ ERP — PRODUCTION-GRADE HTTP / CLAMAV MALWARE SCANNING PROVIDER
 * 
 * Interacts with an external malware scanning daemon (e.g. ClamAV REST, ICAP microservice).
 * In production, requires active MALWARE_SCANNER_URL. If unconfigured, fails closed.
 */

class ClamAvHttpScanningProvider extends MalwareScanningProvider {
  constructor(options = {}) {
    super('ClamAvHttpScanningProvider');
    this.scannerUrl = options.scannerUrl || process.env.MALWARE_SCANNER_URL || null;
    this.timeoutMs = options.timeoutMs || Number(process.env.MALWARE_SCANNER_TIMEOUT_MS) || 5000;
    this.authToken = options.authToken || process.env.MALWARE_SCANNER_API_KEY || null;
  }

  isProductionProvider() {
    return true;
  }

  validateConfiguration() {
    if (!this.scannerUrl) {
      const error = new Error('DOCUMENT_MALWARE_SCANNER_NOT_CONFIGURED: Production malware scanning endpoint is missing. Configure MALWARE_SCANNER_URL.');
      error.code = 'DOCUMENT_MALWARE_SCANNER_NOT_CONFIGURED';
      throw error;
    }
    return true;
  }

  async healthCheck() {
    if (!this.scannerUrl) {
      return {
        healthy: false,
        configured: false,
        provider: this.name,
        details: 'DOCUMENT_MALWARE_SCANNER_NOT_CONFIGURED: MALWARE_SCANNER_URL is not set.',
        isProduction: true,
      };
    }

    return new Promise((resolve) => {
      try {
        const u = new URL(this.scannerUrl);
        const client = u.protocol === 'https:' ? https : http;
        const req = client.request(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: '/health',
            method: 'GET',
            timeout: Math.min(this.timeoutMs, 3000),
          },
          (res) => {
            resolve({
              healthy: res.statusCode >= 200 && res.statusCode < 300,
              configured: true,
              provider: this.name,
              details: `External scanner responded with HTTP ${res.statusCode}`,
              isProduction: true,
            });
          }
        );
        req.on('error', (err) => {
          resolve({
            healthy: false,
            configured: true,
            provider: this.name,
            details: `Scanner probe unreachable: ${err.message}`,
            isProduction: true,
          });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({
            healthy: false,
            configured: true,
            provider: this.name,
            details: 'Scanner health check timed out.',
            isProduction: true,
          });
        });
        req.end();
      } catch (err) {
        resolve({
          healthy: false,
          configured: false,
          provider: this.name,
          details: err.message,
          isProduction: true,
        });
      }
    });
  }

  async scanStream(stream, metadata = {}) {
    const chunks = [];
    return new Promise((resolve) => {
      stream.on('data', c => chunks.push(c));
      stream.on('end', async () => {
        const buf = Buffer.concat(chunks);
        resolve(await this.scanObject({ buffer: buf, filename: metadata.filename, mimeType: metadata.mimeType }));
      });
      stream.on('error', (err) => {
        resolve({
          status: 'SCAN_ERROR',
          details: `Stream read error before scan: ${err.message}`,
          scannerProvider: this.name,
          scannedAt: new Date(),
        });
      });
    });
  }

  async scanObject(params = {}) {
    const scannedAt = new Date();

    if (!this.scannerUrl) {
      if (process.env.NODE_ENV === 'production') {
        return {
          status: 'UNAVAILABLE',
          details: 'DOCUMENT_MALWARE_SCANNER_NOT_CONFIGURED: Production scanning endpoint is not configured.',
          scannerProvider: this.name,
          scannedAt,
        };
      }
      return {
        status: 'UNAVAILABLE',
        details: 'Malware scanner endpoint is not configured.',
        scannerProvider: this.name,
        scannedAt,
      };
    }

    const buffer = params.buffer;
    if (!buffer) {
      return {
        status: 'SCAN_ERROR',
        details: 'Missing binary payload for scan.',
        scannerProvider: this.name,
        scannedAt,
      };
    }

    return new Promise((resolve) => {
      try {
        const u = new URL(this.scannerUrl);
        const client = u.protocol === 'https:' ? https : http;
        const req = client.request(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: '/scan',
            method: 'POST',
            timeout: this.timeoutMs,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': buffer.length,
              ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
              'X-Filename': encodeURIComponent(params.filename || 'unnamed'),
            },
          },
          (res) => {
            const resChunks = [];
            res.on('data', c => resChunks.push(c));
            res.on('end', () => {
              const bodyStr = Buffer.concat(resChunks).toString('utf-8');
              try {
                const parsed = JSON.parse(bodyStr);
                if (parsed.infected || parsed.status === 'INFECTED') {
                  resolve({
                    status: 'INFECTED',
                    threatName: parsed.threatName || parsed.virus || 'External.Threat.Identified',
                    details: parsed.details || `Malware detected by ${this.name}`,
                    scannerProvider: this.name,
                    scannedAt,
                  });
                } else if (parsed.status === 'CLEAN' || res.statusCode === 200) {
                  resolve({
                    status: 'CLEAN',
                    details: 'Production malware scanning engine verified document clean.',
                    scannerProvider: this.name,
                    scannedAt,
                  });
                } else {
                  resolve({
                    status: 'SCAN_ERROR',
                    details: `Unexpected response from scanner: ${bodyStr}`,
                    scannerProvider: this.name,
                    scannedAt,
                  });
                }
              } catch {
                if (res.statusCode === 200) {
                  resolve({
                    status: 'CLEAN',
                    details: 'Production malware scanning engine verified document clean.',
                    scannerProvider: this.name,
                    scannedAt,
                  });
                } else {
                  resolve({
                    status: 'SCAN_ERROR',
                    details: `Scanner responded with status ${res.statusCode}: ${bodyStr}`,
                    scannerProvider: this.name,
                    scannedAt,
                  });
                }
              }
            });
          }
        );

        req.on('error', (err) => {
          resolve({
            status: 'UNAVAILABLE',
            details: `Scanner service connection failure: ${err.message}`,
            scannerProvider: this.name,
            scannedAt,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            status: 'UNAVAILABLE',
            details: 'Scanner service timeout exceeded.',
            scannerProvider: this.name,
            scannedAt,
          });
        });

        req.write(buffer);
        req.end();
      } catch (err) {
        resolve({
          status: 'SCAN_ERROR',
          details: `Error dispatching scan request: ${err.message}`,
          scannerProvider: this.name,
          scannedAt,
        });
      }
    });
  }
}

module.exports = {
  ClamAvHttpScanningProvider,
};
