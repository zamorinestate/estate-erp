'use strict';

const { documentStorageAdapter } = require('./documentStorageAdapter');

function normalizeId(value, fallback = 'GLOBAL') {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

class AttendanceEvidenceStorageService {
  async storeSelfie({
    organisationId,
    cafeId,
    fileId,
    punchType,
    mimeType,
    buffer,
  }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new TypeError('Attendance selfie buffer is required.');
    }

    const storageKey = documentStorageAdapter.generateStorageKey({
      organisationId: normalizeId(organisationId, 'ZAMORIN'),
      cafeId: normalizeId(cafeId),
      classification: 'ATTENDANCE_EVIDENCE',
      documentId: String(fileId || '').trim().toUpperCase(),
      mimeType,
    });

    const result = await documentStorageAdapter.put({
      buffer,
      storageKey,
      mimeType,
      sizeBytes: buffer.length,
      organisationId: normalizeId(organisationId, 'ZAMORIN'),
      metadata: {
        domain: 'ATTENDANCE',
        evidenceType: 'SELFIE',
        punchType: String(punchType || '').trim().toUpperCase(),
        fileId: String(fileId || '').trim().toUpperCase(),
        cafeId: normalizeId(cafeId),
      },
    });

    return {
      fileKey: result.storageKey || storageKey,
      storageKey: result.storageKey || storageKey,
      storageProvider: result.storageProvider || result.storageDriver || null,
      sizeBytes: result.sizeBytes || buffer.length,
      sha256: result.sha256 || null,
      storedAt: result.storedAt || new Date(),
    };
  }

  async readObjectBuffer({ fileKey }) {
    const storageKey = String(fileKey || '').trim();
    if (!storageKey) return null;

    const isMissingStorageError = (err) =>
      err?.statusCode === 404 ||
      err?.status === 404 ||
      ['STORAGE_OBJECT_NOT_FOUND', 'DOCUMENT_NOT_FOUND'].includes(err?.code) ||
      /FileNotFound|not found/i.test(String(err?.message || ''));

    try {
      const exists = await documentStorageAdapter.exists({ storageKey });
      if (!exists) return null;

      const stream = await documentStorageAdapter.getStream({ storageKey });
      if (!stream) return null;

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      return buffer.length ? buffer : null;
    } catch (err) {
      if (isMissingStorageError(err)) {
        return null;
      }
      throw err;
    }
  }

  async deleteObject({ fileKey }) {
    const storageKey = String(fileKey || '').trim();
    if (!storageKey) return false;
    return documentStorageAdapter.delete({ storageKey });
  }

  getRuntimeStatus() {
    return {
      driver: documentStorageAdapter.driver,
      ...documentStorageAdapter.constructor.getStorageRuntimeStatus(),
    };
  }
}

const attendanceEvidenceStorageService = new AttendanceEvidenceStorageService();

module.exports = {
  AttendanceEvidenceStorageService,
  attendanceEvidenceStorageService,
};
