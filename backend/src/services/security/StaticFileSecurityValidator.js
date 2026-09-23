'use strict';

/**
 * ZAMORIN CAFÉ ERP — STATIC FILE SECURITY VALIDATOR
 * 
 * Classification: STATIC_FILE_SECURITY_VALIDATION (Defense-in-depth pre-scanner)
 * 
 * Performs deterministic static content-security inspection:
 * - Standard EICAR test signature
 * - Windows PE / MZ executable binary headers (0x4D 0x5A)
 * - Linux ELF binary headers (0x7F 'E' 'L' 'F')
 * - Prohibited active script / launch / embedded streams in PDFs
 * - Image polyglot / webshell script injection in image formats
 * 
 * IMPORTANT:
 * This static validator is a defense-in-depth filter that runs BEFORE
 * placing documents into quarantine or invoking external antivirus engines.
 * It is NOT a substitute for a production malware scanning engine.
 */

const fs = require('fs');

// EICAR Standard Antivirus Test Signature (68 ASCII chars)
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

class StaticFileSecurityValidator {
  /**
   * Performs static content security validation on buffer or file path.
   * 
   * @param {Object} params
   * @param {Buffer} [params.buffer]
   * @param {string} [params.filePath]
   * @param {string} params.mimeType
   * @param {string} [params.filename]
   * @returns {Promise<{ valid: boolean, classification: string, threatName?: string, details: string }>}
   */
  static async validate({ buffer = null, filePath = null, mimeType = '', filename = '' }) {
    let sampleBuffer = buffer;
    if (!sampleBuffer && filePath && fs.existsSync(filePath)) {
      const fd = await fs.promises.open(filePath, 'r');
      const stat = await fd.stat();
      const readSize = Math.min(stat.size, 131072); // inspect first 128KB
      sampleBuffer = Buffer.alloc(readSize);
      await fd.read(sampleBuffer, 0, readSize, 0);
      await fd.close();
    }

    if (!sampleBuffer || sampleBuffer.length === 0) {
      return {
        valid: true,
        classification: 'STATIC_FILE_SECURITY_VALIDATION',
        details: 'Empty payload evaluated.',
      };
    }

    const latin1 = sampleBuffer.toString('latin1');

    // 1. Standard EICAR Antivirus Test String
    if (latin1.includes(EICAR_SIGNATURE)) {
      return {
        valid: false,
        classification: 'STATIC_FILE_SECURITY_VALIDATION',
        threatName: 'EICAR-Test-Signature',
        details: 'EICAR standard antivirus test signature detected in document payload.',
      };
    }

    // 2. Windows PE / MZ Executable Binary Header (0x4D 0x5A)
    if (sampleBuffer.length >= 2 && sampleBuffer[0] === 0x4D && sampleBuffer[1] === 0x5A) {
      return {
        valid: false,
        classification: 'STATIC_FILE_SECURITY_VALIDATION',
        threatName: 'Disallowed-Executable-Header (MZ/PE)',
        details: 'Windows executable binary header detected in document.',
      };
    }

    // 3. Linux ELF Executable Header (0x7F 'E' 'L' 'F')
    if (
      sampleBuffer.length >= 4 &&
      sampleBuffer[0] === 0x7F &&
      sampleBuffer[1] === 0x45 &&
      sampleBuffer[2] === 0x4C &&
      sampleBuffer[3] === 0x46
    ) {
      return {
        valid: false,
        classification: 'STATIC_FILE_SECURITY_VALIDATION',
        threatName: 'Disallowed-Executable-Header (ELF)',
        details: 'Linux executable binary header detected in document.',
      };
    }

    // 4. PDF Active Script / Launch Action Inspection
    const normMime = String(mimeType || '').toLowerCase();
    if (normMime === 'application/pdf') {
      if (
        latin1.includes('/JavaScript') ||
        latin1.includes('/JS ') ||
        latin1.includes('/Launch') ||
        latin1.includes('/EmbeddedFile')
      ) {
        return {
          valid: false,
          classification: 'STATIC_FILE_SECURITY_VALIDATION',
          threatName: 'Embedded-Executable-Script-PDF',
          details: 'PDF contains prohibited active JavaScript or executable launch action.',
        };
      }
    }

    // 5. Image Polyglot / Web Shell Injection Inspection
    if (normMime.startsWith('image/')) {
      if (
        latin1.includes('<?php') ||
        latin1.includes('<script') ||
        latin1.includes('<svg') ||
        latin1.includes('eval(')
      ) {
        return {
          valid: false,
          classification: 'STATIC_FILE_SECURITY_VALIDATION',
          threatName: 'Polyglot-WebShell-Image-Payload',
          details: 'Image file contains embedded active code or script tags.',
        };
      }
    }

    return {
      valid: true,
      classification: 'STATIC_FILE_SECURITY_VALIDATION',
      details: 'Static heuristic file-security validation passed.',
    };
  }
}

module.exports = {
  StaticFileSecurityValidator,
  EICAR_SIGNATURE,
};
