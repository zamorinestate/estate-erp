'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateStartupConfiguration } = require('../src/config/startupValidator');
const { requestContext } = require('../src/middleware/requestContext');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createMaintenanceMiddleware, maintenanceManager } = require('../src/middleware/maintenanceMode');
const { errorTrackingAdapter } = require('../src/services/errorTrackingAdapter');
const { operationalAlertService } = require('../src/services/operationalAlertService');
const { featureFlagService } = require('../src/services/featureFlagService');
const { scheduledJobRegistry } = require('../src/services/scheduledJobRegistry');
const { backupVerificationService } = require('../src/services/backupVerificationService');
const { documentReconciliationService } = require('../src/services/documentReconciliationService');
const { releaseService } = require('../src/services/releaseService');

test('Stage 10 — Explicit Safe Post-Release Systems Test Suite', async (t) => {

  // 1. STARTUP CONFIGURATION VALIDATOR
  await t.test('1. Universal Startup Configuration Validator', async (st) => {
    await st.test('passes in development with isSafe true', () => {
      // Pass env directly as first arg, options as second
      const report = validateStartupConfiguration({ ...process.env, NODE_ENV: 'development' }, { failClosed: false });
      assert.strictEqual(report.isProduction, false);
      assert.ok(Array.isArray(report.report));
    });

    await st.test('fails closed in production if critical MONGODB_URI or JWT_SECRET is missing', () => {
      let threw = false;
      try {
        // Pass a minimal prod env with missing required secrets
        validateStartupConfiguration(
          { NODE_ENV: 'production', PORT: '5000' },
          { failClosed: true }
        );
      } catch (e) {
        threw = true;
        // ApiError throws with code 'STARTUP_CONFIGURATION_FAILED' and message contains details
        assert.ok(
          e.code === 'STARTUP_CONFIGURATION_FAILED' || e.message.includes('MONGODB_URI'),
          `Expected STARTUP_CONFIGURATION_FAILED error, got: ${e.message}`
        );
      }
      assert.strictEqual(threw, true, 'Should throw for missing production secrets');
    });

    await st.test('masks secrets completely in startup validation report', () => {
      const report = validateStartupConfiguration(
        {
          NODE_ENV: 'production',
          PORT: '5000',
          MONGODB_URI: 'mongodb+srv://admin:mock_test_password@cluster.example.mongodb.net/prod',
          JWT_SECRET: 'super-secret-jwt-key-minimum-64-characters-long-for-testing-security-purpose',
          DOCUMENT_STORAGE_ROOT: '/var/data/zamorin_documents',
          DOCUMENT_STORAGE_DRIVER: 'RENDER_PERSISTENT_DISK'
        },
        { failClosed: false }
      );
      const reportStr = JSON.stringify(report);
      assert.strictEqual(reportStr.includes('SuperSecretPassword123'), false);
      assert.strictEqual(reportStr.includes('super-secret-jwt-key'), false);
      // Secrets should appear as 'Configured (Value Redacted)'
      const secretEntry = report.report.find(r => r.key === 'MONGODB_URI');
      assert.ok(secretEntry, 'MONGODB_URI entry must exist in report');
      assert.ok(
        secretEntry.detail === 'Configured (Value Redacted)',
        `Expected 'Configured (Value Redacted)', got: ${secretEntry.detail}`
      );
    });
  });

  // 2. REQUEST CONTEXT & ERROR CONCEALMENT
  await t.test('2. Request Context & Safe Reference Error Handling', async (st) => {
    await st.test('assigns and returns X-Request-ID and X-Correlation-ID', () => {
      // requestContext uses req.get() - simulate Express-style request
      const req = {
        headers: {},
        get(name) { return this.headers[name.toLowerCase()] || null; }
      };
      const res = {
        _headers: {},
        setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
        end(...args) {}
      };
      let calledNext = false;
      requestContext(req, res, () => { calledNext = true; });

      assert.strictEqual(calledNext, true);
      assert.ok(req.requestId.startsWith('REQ-'));
      assert.ok(req.correlationId);
      assert.strictEqual(res._headers['x-request-id'], req.requestId);
      assert.strictEqual(res._headers['x-correlation-id'], req.correlationId);
    });

    await st.test('masks 500 error messages with safe reference ID in production', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const req = { requestId: 'REQ-12345-TEST' };
        let statusCode = null;
        let responseBody = null;
        const res = {
          status(code) { statusCode = code; return this; },
          json(body) { responseBody = body; return this; }
        };
        const error = new Error('Sensitive database connection failed: secret_db_key_123');

        errorHandler(error, req, res, () => {});

        assert.strictEqual(statusCode, 500);
        assert.ok(responseBody.error);
        assert.strictEqual(responseBody.error.message, 'Something went wrong. Reference: REQ-12345-TEST');
        assert.strictEqual(JSON.stringify(responseBody).includes('secret_db_key_123'), false);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // 3. ERROR TRACKING ADAPTER
  await t.test('3. Provider-Neutral Error Tracking Adapter', async (st) => {
    await st.test('truthfully reports provider pending status', () => {
      const status = errorTrackingAdapter.getStatus();
      assert.strictEqual(status.status, 'ERROR_TRACKING_PROVIDER_PENDING');
      assert.strictEqual(status.externalProviderConfigured, false);
    });

    await st.test('safely records exception without crashing when provider is pending', () => {
      const res = errorTrackingAdapter.captureException(new Error('Sample error'), {
        requestId: 'REQ-TEST-123'
      });
      assert.ok(res.eventId);
      assert.strictEqual(res.providerStatus, 'ERROR_TRACKING_PROVIDER_PENDING');
    });
  });

  // 4. OPERATIONAL ALERT FRAMEWORK
  await t.test('4. Operational Alerting Framework', async (st) => {
    await st.test('creates alert service with expected interface', () => {
      assert.strictEqual(typeof operationalAlertService.raiseAlert, 'function');
      assert.strictEqual(typeof operationalAlertService.autoResolveByDeduplicationKey, 'function');
      assert.strictEqual(typeof operationalAlertService.listActiveAlerts, 'function');
    });
  });

  // 5. DOCUMENT STORAGE & CAPACITY SERVICE
  await t.test('5. Persistent Document Storage & Capacity Assessment', async (st) => {
    await st.test('assesses storage capacity accurately', async () => {
      const status = await documentReconciliationService.assessStorageCapacity();
      assert.ok(status.status);
      assert.ok(typeof status.freeBytes === 'number');
      assert.ok(typeof status.utilizationPercent === 'number');
      assert.ok(['HEALTHY', 'WARNING', 'HIGH', 'CRITICAL', 'UNAVAILABLE'].includes(status.status));
    });
  });

  // 6. FEATURE FLAGS & EMERGENCY KILL SWITCHES
  await t.test('6. Feature Flags & Emergency Kill Switches', async (st) => {
    await st.test('evaluates and modifies emergency kill switches with audit trail', () => {
      assert.strictEqual(featureFlagService.isKillSwitchTripped('KILL_SWITCH_DOCUMENT_UPLOADS'), false);

      featureFlagService.setFlag('KILL_SWITCH_DOCUMENT_UPLOADS', true, {
        actorId: 'MU-0001',
        actorRole: 'PRIMARY_MASTER',
        reason: 'Disk space emergency',
      });
      assert.strictEqual(featureFlagService.isKillSwitchTripped('KILL_SWITCH_DOCUMENT_UPLOADS'), true);

      // Reset
      featureFlagService.setFlag('KILL_SWITCH_DOCUMENT_UPLOADS', false, {
        actorId: 'MU-0001',
        actorRole: 'PRIMARY_MASTER',
        reason: 'Disk space expanded',
      });
      assert.strictEqual(featureFlagService.isKillSwitchTripped('KILL_SWITCH_DOCUMENT_UPLOADS'), false);
    });
  });


  // 7. MAINTENANCE & READ-ONLY MODES — Permission-Based Bypass
  await t.test('7. Maintenance Mode & Read-Only Protection — Permission-Based Bypass', async (st) => {
    const middleware = createMaintenanceMiddleware(maintenanceManager);

    function executeMiddleware(req) {
      let statusCode = 200;
      let body = null;
      let nextCalled = false;
      const res = {
        _headers: {},
        setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
        status(code) { statusCode = code; return this; },
        json(b) { body = b; return this; }
      };
      middleware(req, res, () => { nextCalled = true; });
      return { statusCode, body, nextCalled, headers: res._headers };
    }

    // Ensure clean state before tests
    maintenanceManager.setMaintenanceMode({ enabled: false });
    maintenanceManager.setReadOnlyMode({ enabled: false });

    await st.test('blocks unauthenticated requests with 503 during maintenance mode', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true, reason: 'Emergency DB maintenance' });
      const req = { path: '/api/v1/orders', method: 'GET' };
      const { statusCode, body, nextCalled } = executeMiddleware(req);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(body.error.code, 'SERVICE_MAINTENANCE_MODE');
      assert.strictEqual(nextCalled, false);
    });

    await st.test('allows health probes unconditionally during maintenance mode', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true });
      const req = { path: '/health/live', method: 'GET' };
      const { nextCalled } = executeMiddleware(req);
      assert.strictEqual(nextCalled, true);
    });

    await st.test('allows PRIMARY_MASTER unconditionally (no permission check needed)', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true });
      const req = { path: '/api/v1/orders', method: 'GET', user: { role: 'PRIMARY_MASTER' } };
      const { nextCalled } = executeMiddleware(req);
      assert.strictEqual(nextCalled, true);
    });

    await st.test('allows OWNER with explicit SYSTEM_OPERATIONS_BYPASS permission', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true });
      const req = {
        path: '/api/v1/orders',
        method: 'GET',
        user: { role: 'OWNER', permissions: ['SYSTEM_OPERATIONS_BYPASS'] }
      };
      const { nextCalled, headers } = executeMiddleware(req);
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(headers['x-maintenance-bypass'], 'true');
      assert.strictEqual(headers['x-bypass-reason'], 'SYSTEM_OPERATIONS_BYPASS_AUTHORISED');
    });

    await st.test('denies plain OWNER without SYSTEM_OPERATIONS_BYPASS (emergency containment)', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true });
      // OWNER without the explicit permission — denied during emergency
      const req = { path: '/api/v1/orders', method: 'GET', user: { role: 'OWNER', permissions: [] } };
      const { statusCode, body, nextCalled } = executeMiddleware(req);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(body.error.code, 'SERVICE_MAINTENANCE_MODE');
      assert.strictEqual(nextCalled, false, 'Plain OWNER must NOT bypass without explicit SYSTEM_OPERATIONS_BYPASS');
    });

    await st.test('denies STAFF during maintenance mode', () => {
      maintenanceManager.setMaintenanceMode({ enabled: true });
      const req = { path: '/api/v1/orders', method: 'GET', user: { role: 'STAFF', permissions: [] } };
      const { statusCode, nextCalled } = executeMiddleware(req);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(nextCalled, false);
    });

    await st.test('blocks mutations with 503 during Read-Only mode while allowing GET', () => {
      maintenanceManager.setMaintenanceMode({ enabled: false });
      maintenanceManager.setReadOnlyMode({ enabled: true, reason: 'Storage full - writes suspended' });

      const getReq = { path: '/api/v1/orders', method: 'GET' };
      const getRes = executeMiddleware(getReq);
      assert.strictEqual(getRes.nextCalled, true);

      const postReq = { path: '/api/v1/orders', method: 'POST' };
      const postRes = executeMiddleware(postReq);
      assert.strictEqual(postRes.statusCode, 503);
      assert.strictEqual(postRes.body.error.code, 'SERVICE_READ_ONLY');
      assert.strictEqual(postRes.nextCalled, false);

      maintenanceManager.setReadOnlyMode({ enabled: false });
    });
  });


  // 8. SCHEDULED JOB REGISTRY & IDEMPOTENCY
  await t.test('8. Scheduled Job Registry & Execution Idempotency', async (st) => {
    await st.test('registers background jobs and tracks executions', () => {
      const jobs = scheduledJobRegistry.listJobs();
      assert.ok(jobs.length >= 5, `Expected >= 5 registered jobs, got ${jobs.length}`);
      assert.ok(jobs.some(j => j.jobId === 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION'));

      const execution = scheduledJobRegistry.recordJobExecution('JOB-DOCUMENT-INTEGRITY-RECONCILIATION', {
        success: true,
        durationMs: 120,
      });
      assert.strictEqual(execution.jobId, 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION');
      assert.strictEqual(execution.consecutiveFailures, 0);
    });

    await st.test('reports registered-but-unwired cron jobs as unhealthy instead of silently healthy', () => {
      const health = scheduledJobRegistry.auditJobHealth();

      assert.ok(Array.isArray(health.unwiredJobs));
      assert.ok(
        health.unwiredJobs.some((job) => job.jobId === 'JOB-DOCUMENT-INTEGRITY-RECONCILIATION')
      );
      assert.ok(
        health.unwiredJobs.some((job) => job.jobId === 'JOB-ATTENDANCE-AUTO-CHECKOUT')
      );
      assert.ok(
        health.unwiredJobs.some((job) => job.jobId === 'JOB-BACKUP-PRECONDITION-AUDIT')
      );
      assert.ok(
        health.unwiredJobs.some((job) => job.jobId === 'JOB-ASSET-MAINTENANCE-SCHEDULER')
      );
      assert.equal(health.wiredJobs, 1);
      assert.equal(health.isAllHealthy, false);
    });

    await st.test('enforces idempotency key checks', () => {
      const key = `INVOICE_JOB_${Date.now()}_BATCH_UNIQUE`;
      // First attempt succeeds
      const first = scheduledJobRegistry.assertIdempotency(key);
      assert.strictEqual(first, true);

      // Second attempt throws (409)
      assert.throws(() => {
        scheduledJobRegistry.assertIdempotency(key);
      }, /Duplicate execution blocked/);
    });
  });

  // 9. NON-DESTRUCTIVE BACKUP DRILL & RPO/RTO
  await t.test('9. Backup Readiness & Non-Destructive Restore Drill', async (st) => {
    await st.test('assesses backup readiness and RPO/RTO targets', async () => {
      const readiness = await backupVerificationService.assessBackupReadiness();
      assert.ok(readiness.timestamp);
      assert.ok(typeof readiness.databaseConnected === 'boolean');
      assert.ok(readiness.rpoRtoPolicy);
      assert.strictEqual(readiness.rpoRtoPolicy.MONGODB_ATLAS.targetRpoMinutes, 5);
      assert.strictEqual(readiness.rpoRtoPolicy.MONGODB_ATLAS.targetRtoMinutes, 30);
    });

    await st.test('executes non-destructive simulated restore drill', async () => {
      const drill = await backupVerificationService.executeNonDestructiveRestoreDrill();
      assert.ok(drill.drillId);
      assert.ok(['PASSED', 'SKIPPED_DB_OFFLINE'].includes(drill.status),
        `Unexpected drill status: ${drill.status}`);
    });
  });

  // 10. RELEASE MANIFEST GOVERNANCE
  await t.test('10. Release Governance Service', async (st) => {
    await st.test('retrieves active release fallback baseline when DB is offline', async () => {
      const active = await releaseService.getActiveRelease();
      assert.ok(active.releaseId);
      assert.ok(active.gitCommit);
      assert.strictEqual(active.releaseStatus, 'ACTIVE');
    });
  });

});
