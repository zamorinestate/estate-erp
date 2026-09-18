'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { DocumentAttachmentService } = require('../src/services/documentAttachmentService');
const { ApiError } = require('../src/utils/ApiError');

test('STAGE 11.35 — Dedicated Non-Production Attachment Upload Concurrency & Load Suite', async (t) => {

  // Helper to generate valid file buffers
  function createPdfBuffer(sizeBytes = 1024) {
    const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
    const footer = Buffer.from('\n%%EOF\n');
    const padding = Buffer.alloc(Math.max(0, sizeBytes - header.length - footer.length), 0x20);
    return Buffer.concat([header, padding, footer]);
  }

  function createPngBuffer(sizeBytes = 1024) {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const padding = Buffer.alloc(Math.max(0, sizeBytes - header.length), 0x00);
    return Buffer.concat([header, padding]);
  }

  function createJpegBuffer(sizeBytes = 1024) {
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const footer = Buffer.from([0xff, 0xd9]);
    const padding = Buffer.alloc(Math.max(0, sizeBytes - header.length - footer.length), 0x7f);
    return Buffer.concat([header, padding, footer]);
  }

  // 1. Validate File Size & Magic Bytes Standards
  await t.test('Canonical 15MB Size Limit & Magic-Byte Validation', () => {
    // 15 MB boundary
    const limitBytes = 15 * 1024 * 1024;
    assert.doesNotThrow(() => DocumentAttachmentService.validateFileSize(limitBytes));
    assert.throws(
      () => DocumentAttachmentService.validateFileSize(limitBytes + 1),
      (err) => err.code === 'ATTACHMENT_SIZE_EXCEEDED'
    );

    // Magic bytes
    const validPdf = createPdfBuffer(128);
    assert.doesNotThrow(() => DocumentAttachmentService.validateMagicBytes(validPdf, 'application/pdf'));

    const spoofedPdf = Buffer.from('MZ90000000000000000000000000000'); // DOS executable
    assert.throws(
      () => DocumentAttachmentService.validateMagicBytes(spoofedPdf, 'application/pdf'),
      (err) => err.code === 'INVALID_FILE_SIGNATURE'
    );
  });

  // 2. High-Concurrency Attachment Ingestion Benchmark
  await t.test('Concurrent Upload Benchmark with Mixed Valid, Spoofed, Oversize & Unauthorized Payloads', async () => {
    const heapBefore = process.memoryUsage().heapUsed;

    const testJobs = [
      // Valid workloads
      { id: 'JOB-1', name: 'receipt_small.jpg', mime: 'image/jpeg', buffer: createJpegBuffer(10 * 1024), auth: { role: 'STAFF', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
      { id: 'JOB-2', name: 'tax_doc.png', mime: 'image/png', buffer: createPngBuffer(25 * 1024), auth: { role: 'MANAGER', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
      { id: 'JOB-3', name: 'vendor_invoice.pdf', mime: 'application/pdf', buffer: createPdfBuffer(50 * 1024), auth: { role: 'MANAGER', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
      { id: 'JOB-4', name: 'large_catalog.pdf', mime: 'application/pdf', buffer: createPdfBuffer(2 * 1024 * 1024), auth: { role: 'OWNER', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
      { id: 'JOB-5', name: 'near_limit_scan.pdf', mime: 'application/pdf', buffer: createPdfBuffer(14.5 * 1024 * 1024), auth: { role: 'MASTER', organisationId: 'ORG-ZAMORIN', assignedCafeIds: [] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
      { id: 'JOB-6', name: 'menu_highres.jpg', mime: 'image/jpeg', buffer: createJpegBuffer(500 * 1024), auth: { role: 'CAFE_ADMIN', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },

      // Invalid workloads (Security & Quotas)
      { id: 'JOB-7', name: 'script.sh', mime: 'application/x-sh', buffer: Buffer.from('#!/bin/bash\nrm -rf /'), auth: { role: 'STAFF', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: false, expectedError: 'UNSUPPORTED_ATTACHMENT_TYPE' },
      { id: 'JOB-8', name: 'fake_invoice.pdf', mime: 'application/pdf', buffer: Buffer.from('MZ-FAKE-WINDOWS-PE-BINARY'), auth: { role: 'STAFF', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: false, expectedError: 'INVALID_FILE_SIGNATURE' },
      { id: 'JOB-9', name: 'oversize_dump.pdf', mime: 'application/pdf', buffer: Buffer.alloc(15.5 * 1024 * 1024, 0x25), auth: { role: 'MANAGER', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: false, expectedError: 'ATTACHMENT_SIZE_EXCEEDED' },

      // Unauthorized tenant/branch workloads
      { id: 'JOB-10', name: 'cross_org_leak.pdf', mime: 'application/pdf', buffer: createPdfBuffer(1024), auth: { role: 'MANAGER', organisationId: 'ROGUE-ORG', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: false, expectedError: 'CROSS_ORG_ACCESS_DENIED' },
      { id: 'JOB-11', name: 'cross_cafe_staff.pdf', mime: 'application/pdf', buffer: createPdfBuffer(1024), auth: { role: 'STAFF', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-99'], primaryCafeId: 'CAFE-99' }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: false, expectedError: 'CROSS_CAFE_ACCESS_DENIED' },
      { id: 'JOB-12', name: 'store_audit.png', mime: 'image/png', buffer: createPngBuffer(100 * 1024), auth: { role: 'STAFF', organisationId: 'ORG-ZAMORIN', assignedCafeIds: ['CAFE-01'] }, cafeId: 'CAFE-01', orgId: 'ORG-ZAMORIN', expectSuccess: true },
    ];

    const latencies = [];
    let successCount = 0;
    let rejectedCount = 0;

    const startTime = Date.now();

    const results = await Promise.all(
      testJobs.map(async (job) => {
        const jobStart = Date.now();
        try {
          // 1. Authorize access
          DocumentAttachmentService.assertDocumentAuthorization(
            { organisationId: job.orgId, cafeId: job.cafeId, classification: 'PROCUREMENT' },
            job.auth,
            'VIEW'
          );

          // 2. Validate MIME type
          DocumentAttachmentService.validateFileMime(job.mime, job.name);

          // 3. Validate file size
          DocumentAttachmentService.validateFileSize(job.buffer.length);

          // 4. Validate magic bytes
          DocumentAttachmentService.validateMagicBytes(job.buffer, job.mime);

          // 5. Compute SHA-256 checksum
          const checksum = DocumentAttachmentService.computeChecksum(job.buffer);
          assert.strictEqual(checksum.length, 64);

          const latency = Date.now() - jobStart;
          latencies.push(latency);
          successCount++;
          return { id: job.id, success: true, latency, checksum };
        } catch (err) {
          const latency = Date.now() - jobStart;
          latencies.push(latency);
          rejectedCount++;
          return { id: job.id, success: false, error: err.code || err.message, latency };
        }
      })
    );

    const totalDuration = Date.now() - startTime;
    const heapAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = ((heapAfter - heapBefore) / (1024 * 1024)).toFixed(2);

    // Verify expectations
    for (const job of testJobs) {
      const outcome = results.find((r) => r.id === job.id);
      assert.strictEqual(outcome.success, job.expectSuccess, `Job ${job.id} outcome mismatch`);
      if (!job.expectSuccess && job.expectedError) {
        assert.strictEqual(outcome.error, job.expectedError, `Job ${job.id} expected ${job.expectedError} but got ${outcome.error}`);
      }
    }

    assert.strictEqual(successCount, 7, 'Expected exactly 7 valid uploads to succeed');
    assert.strictEqual(rejectedCount, 5, 'Expected exactly 5 invalid/unauthorized uploads to be safely rejected');
    assert.ok(totalDuration < 3000, `Concurrent execution duration (${totalDuration}ms) must remain fast`);
  });

  // 3. Quarantine & Tamper-Detection Invariant
  await t.test('Tampered Signature Triggers Immediate Quarantine Rejection', () => {
    // Buffer claiming to be PNG but starts with invalid bytes
    const tamperedPng = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4e, 0x47]);
    assert.throws(
      () => DocumentAttachmentService.validateMagicBytes(tamperedPng, 'image/png'),
      (err) => err.code === 'INVALID_FILE_SIGNATURE'
    );
  });
});
