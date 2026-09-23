'use strict';

/**
 * ZAMORIN CAFÉ ERP — CLAMAV INSTREAM TCP SCANNER CLIENT
 *
 * Implements native ClamAV daemon (clamd) protocol over private TCP socket.
 * Communicates directly with ClamAV running as a Render Private Service on TCP port 3310.
 *
 * Invariants:
 * - Uses native ClamAV INSTREAM protocol for direct streaming from MongoDB GridFS.
 * - Zero temporary files on disk: Binary stream is chunked and written directly to TCP socket.
 * - Enforces chunk-length big-endian framing and zero-length terminator.
 * - Private Network Only: clamd is never exposed to the public internet.
 * - Never fails open: Scanner errors/timeouts fail closed to SCAN_FAILED or SCANNER_UNAVAILABLE.
 * - Tracks signature database freshness and engine version.
 */

const net = require('net');
const { Readable } = require('stream');
const { ApiError } = require('../../utils/ApiError');

class ClamAVScanner {
  constructor(options = {}) {
    this.name = 'ClamAVScanner';
    this.host = options.host || process.env.CLAMAV_HOST || 'localhost';
    this.port = Number(options.port || process.env.CLAMAV_PORT || 3310);
    this.timeoutMs = Number(options.timeoutMs || process.env.CLAMAV_TIMEOUT_MS || 30000);
    this.connectTimeoutMs = Number(options.connectTimeoutMs || process.env.CLAMAV_CONNECT_TIMEOUT_MS || 5000);
    this.maxSignatureAgeDays = Number(options.maxSignatureAgeDays || process.env.CLAMAV_MAX_SIGNATURE_AGE_DAYS || 7);
    this.maxRetries = Number(options.maxRetries || 2);
    this.chunkSize = Number(options.chunkSize || 64 * 1024); // 64 KiB socket chunking
  }

  isProductionProvider() {
    return true;
  }

  /**
   * Sends a simple command string and returns raw socket response.
   * @private
   */
  async _sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = net.createConnection({
        host: this.host,
        port: this.port,
        timeout: this.connectTimeoutMs,
      });

      let responseBuffer = Buffer.alloc(0);

      const cleanup = (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
      };

      socket.on('timeout', () => {
        const err = new Error(`Connection to ClamAV at ${this.host}:${this.port} timed out after ${this.connectTimeoutMs}ms`);
        err.code = 'ETIMEDOUT';
        cleanup(err);
      });

      socket.on('error', (err) => {
        cleanup(err);
      });

      socket.on('connect', () => {
        socket.setTimeout(this.timeoutMs);
        const payload = cmd.endsWith('\0') ? Buffer.from(cmd, 'binary') : Buffer.from(`${cmd}\0`, 'binary');
        socket.write(payload);
      });

      socket.on('data', (chunk) => {
        responseBuffer = Buffer.concat([responseBuffer, chunk]);
      });

      socket.on('end', () => {
        if (!settled) {
          settled = true;
          resolve(responseBuffer.toString('utf8').trim());
        }
      });
    });
  }

  /**
   * Sends PING command to verify clamd responsiveness.
   * @returns {Promise<boolean>}
   */
  async ping() {
    try {
      const res = await this._sendCommand('zPING');
      return res.includes('PONG');
    } catch {
      return false;
    }
  }

  /**
   * Retrieves ClamAV engine version and signature database metadata.
   * Format: ClamAV <engineVersion>/<sigVersion>/<date>
   * @returns {Promise<{ engineVersion: string, signatureVersion: string, signatureDate: Date|null, isStale: boolean, raw: string }>}
   */
  async getVersion() {
    const raw = await this._sendCommand('zVERSION');
    // Example: "ClamAV 1.4.1/27500/Thu Sep 17 12:00:00 2026"
    const match = raw.match(/ClamAV\s+([^\/\s]+)(?:\/(\d+)\/(.+))?/i);
    const engineVersion = match ? match[1] : 'unknown';
    const signatureVersion = match && match[2] ? match[2] : 'unknown';
    let signatureDate = null;
    let isStale = false;

    if (match && match[3]) {
      const parsedDate = new Date(match[3]);
      if (!isNaN(parsedDate.getTime())) {
        signatureDate = parsedDate;
        const ageMs = Date.now() - parsedDate.getTime();
        const maxAgeMs = this.maxSignatureAgeDays * 24 * 60 * 60 * 1000;
        if (ageMs > maxAgeMs) {
          isStale = true;
        }
      }
    }

    return {
      engineVersion,
      signatureVersion,
      signatureDate,
      isStale,
      raw,
    };
  }

  /**
   * Returns signature metadata and status.
   */
  async getSignatureVersion() {
    return this.getVersion();
  }

  /**
   * Comprehensive health check verifying ping, engine version, and signature freshness.
   */
  async healthCheck() {
    try {
      const isAlive = await this.ping();
      if (!isAlive) {
        return {
          healthy: false,
          configured: true,
          provider: this.name,
          details: `ClamAV daemon at ${this.host}:${this.port} is unreachable or did not respond to PING.`,
          isProduction: true,
        };
      }

      const versionInfo = await this.getVersion();
      if (versionInfo.isStale) {
        return {
          healthy: false,
          configured: true,
          provider: this.name,
          engineVersion: versionInfo.engineVersion,
          signatureVersion: versionInfo.signatureVersion,
          signatureDate: versionInfo.signatureDate,
          isStale: true,
          details: `ClamAV signature database is older than ${this.maxSignatureAgeDays} days threshold. FreshClam update required.`,
          isProduction: true,
        };
      }

      return {
        healthy: true,
        configured: true,
        provider: this.name,
        engineVersion: versionInfo.engineVersion,
        signatureVersion: versionInfo.signatureVersion,
        signatureDate: versionInfo.signatureDate,
        isStale: false,
        details: `ClamAV engine ${versionInfo.engineVersion} operational with signature database ${versionInfo.signatureVersion}.`,
        isProduction: true,
      };
    } catch (err) {
      return {
        healthy: false,
        configured: true,
        provider: this.name,
        details: `Health check probe failed: ${err.message}`,
        isProduction: true,
      };
    }
  }

  /**
   * Scans a binary stream directly using ClamAV INSTREAM protocol over TCP.
   *
   * INSTREAM protocol specification:
   * 1. Send 'zINSTREAM\0' command.
   * 2. Send chunks: [4 bytes big-endian length][chunk bytes].
   * 3. Terminate stream: [4 bytes 0x00000000].
   * 4. Receive verdict: 'stream: OK' or 'stream: <threat> FOUND' or 'stream: <error> ERROR'.
   *
   * @param {Readable} readableStream - Node.js readable stream (e.g. from GridFS openDownloadStream).
   * @param {Object} metadata - Optional document metadata (filename, mimeType, documentId).
   * @returns {Promise<{ status: 'CLEAN'|'INFECTED'|'SCAN_FAILED'|'SCANNER_UNAVAILABLE', threatName?: string, details: string, scannerProvider: string, scannedAt: Date }>}
   */
  async scanStream(readableStream, metadata = {}) {
    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        return await this._executeInStream(readableStream, metadata);
      } catch (err) {
        lastError = err;
        const isNetworkErr = ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE'].includes(err.code);
        if (!isNetworkErr || attempt > this.maxRetries) {
          break;
        }
        // Exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 200));
      }
    }

    const isConnErr = lastError && ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(lastError.code);
    return {
      status: isConnErr ? 'SCANNER_UNAVAILABLE' : 'SCAN_FAILED',
      details: `ClamAV scan failed after ${attempt} attempt(s): ${lastError?.message || 'Unknown socket error'}`,
      scannerProvider: this.name,
      scannedAt: new Date(),
    };
  }

  /**
   * Internal execution of a single INSTREAM session.
   * @private
   */
  async _executeInStream(readableStream, metadata) {
    const scannedAt = new Date();

    return new Promise((resolve, reject) => {
      let settled = false;
      let socketEnded = false;

      const socket = net.createConnection({
        host: this.host,
        port: this.port,
        timeout: this.connectTimeoutMs,
      });

      let responseBuffer = Buffer.alloc(0);

      const cleanup = (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
      };

      socket.on('timeout', () => {
        const err = new Error(`ClamAV INSTREAM session timed out after ${this.timeoutMs}ms`);
        err.code = 'ETIMEDOUT';
        cleanup(err);
      });

      socket.on('error', (err) => {
        cleanup(err);
      });

      socket.on('connect', async () => {
        socket.setTimeout(this.timeoutMs);
        try {
          // 1. Send INSTREAM command
          const commandHeader = Buffer.from('zINSTREAM\0', 'binary');
          if (!socket.write(commandHeader)) {
            await new Promise(res => socket.once('drain', res));
          }

          // 2. Stream chunks with 4-byte big-endian framing
          for await (const chunk of readableStream) {
            if (!chunk || chunk.length === 0) continue;
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32BE(chunk.length, 0);

            if (!socket.write(lenBuf)) {
              await new Promise(res => socket.once('drain', res));
            }
            if (!socket.write(chunk)) {
              await new Promise(res => socket.once('drain', res));
            }
          }

          // 3. Send zero-length EOF chunk
          const zeroBuf = Buffer.alloc(4);
          zeroBuf.writeUInt32BE(0, 0);
          socket.write(zeroBuf);
          socketEnded = true;
        } catch (streamErr) {
          cleanup(streamErr);
        }
      });

      socket.on('data', (chunk) => {
        responseBuffer = Buffer.concat([responseBuffer, chunk]);
      });

      socket.on('end', () => {
        if (settled) return;
        settled = true;

        const reply = responseBuffer.toString('utf8').trim();
        // Parse ClamAV replies:
        // "stream: OK"
        // "stream: Eicar-Test-Signature FOUND"
        // "stream: Size limit exceeded. ERROR"
        if (reply.includes('FOUND')) {
          const match = reply.match(/stream:\s+(.+?)\s+FOUND/i);
          const threatName = match ? match[1].trim() : 'Generic.Malware.Threat';
          return resolve({
            status: 'INFECTED',
            threatName,
            details: `Malware detected by ClamAV: ${threatName}`,
            scannerProvider: this.name,
            scannedAt,
          });
        }

        if (reply.includes('OK')) {
          return resolve({
            status: 'CLEAN',
            details: 'ClamAV INSTREAM verified document clean.',
            scannerProvider: this.name,
            scannedAt,
          });
        }

        if (reply.includes('ERROR')) {
          return resolve({
            status: 'SCAN_FAILED',
            details: `ClamAV reported error: ${reply}`,
            scannerProvider: this.name,
            scannedAt,
          });
        }

        // Unknown or unexpected response format
        return resolve({
          status: 'SCAN_FAILED',
          details: `Unexpected response from ClamAV daemon: ${reply || '<empty>'}`,
          scannerProvider: this.name,
          scannedAt,
        });
      });
    });
  }

  /**
   * Adapter for scanObject interface (supports buffer or stream).
   */
  async scanObject(params = {}) {
    if (params.stream) {
      return this.scanStream(params.stream, params);
    }
    if (params.buffer) {
      const stream = Readable.from([params.buffer]);
      return this.scanStream(stream, params);
    }
    if (params.filePath) {
      const fs = require('fs');
      const stream = fs.createReadStream(params.filePath);
      return this.scanStream(stream, params);
    }

    return {
      status: 'SCAN_FAILED',
      details: 'Missing binary stream or buffer for scan.',
      scannerProvider: this.name,
      scannedAt: new Date(),
    };
  }
}

module.exports = {
  ClamAVScanner,
};
