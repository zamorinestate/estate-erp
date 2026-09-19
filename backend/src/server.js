'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const {
  connectDatabase,
  disconnectDatabase,
  getDatabaseState,
} = require('./config/database');

const {
  loadEnvironment,
} = require('./config/environment');

const {
  requestContext,
} = require('./middleware/requestContext');

const {
  notFound,
} = require('./middleware/notFound');

const {
  errorHandler,
} = require('./middleware/errorHandler');

const apiRouter = require('./routes');
const { documentStorageAdapter } = require('./services/documentStorageAdapter');
const { getTrustedClientIp, getTrustedProxies } = require('./utils/clientIp');

const SERVICE_NAME =
  'zamorin-cafe-erp-api';

function createCorsOptions(environment) {
  const allowedOrigins =
    new Set(environment.allowedOrigins || []);

  return {
    credentials: true,

    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has('*') ||
        allowedOrigins.has(origin) ||
        (!environment.production && !environment.staging && (
          origin === 'http://localhost:3000' ||
          origin === 'http://127.0.0.1:3000' ||
          origin === 'http://localhost:4000' ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ))
      ) {
        callback(null, true);
        return;
      }

      const error = new Error(
        'The request origin is not allowed.'
      );

      error.statusCode = 403;
      error.code = 'CORS_ORIGIN_DENIED';

      callback(error);
    },

    optionsSuccessStatus: 204,
  };
}

const CSRF_SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

const AUTHENTICATION_COOKIE_NAMES = [
  'zamorin_access_token',
  'zamorin_refresh_token',
  'zamorin_session_id',
];

function sendCsrfOriginError(response, request, code, message) {
  return response.status(403).json({
    success: false,
    error: {
      code,
      message,
    },
    correlationId:
      request.correlationId || null,
  });
}

function createCsrfOriginProtection(environment) {
  const allowedOrigins = new Set(
    environment.allowedOrigins || []
  );

  return function csrfOriginProtection(request, response, next) {
    if (CSRF_SAFE_METHODS.has(request.method)) {
      return next();
    }

    const hasAuthenticationCookie =
      AUTHENTICATION_COOKIE_NAMES.some(function hasCookie(name) {
        return Boolean(
          request.cookies && request.cookies[name]
        );
      });

    if (!hasAuthenticationCookie) {
      return next();
    }

    const origin = request.get('origin');

    if (!origin) {
      return sendCsrfOriginError(
        response,
        request,
        'CSRF_ORIGIN_REQUIRED',
        'An allowed request origin is required for cookie-authenticated state changes.'
      );
    }

    let normalizedOrigin;

    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      return sendCsrfOriginError(
        response,
        request,
        'CSRF_ORIGIN_DENIED',
        'The request origin is not allowed.'
      );
    }

    if (
      !allowedOrigins.has('*') &&
      !allowedOrigins.has(normalizedOrigin) &&
      !(
        !environment.production && !environment.staging && (
          normalizedOrigin === 'http://localhost:3000' ||
          normalizedOrigin === 'http://127.0.0.1:3000' ||
          normalizedOrigin === 'http://localhost:4000' ||
          normalizedOrigin.startsWith('http://localhost:') ||
          normalizedOrigin.startsWith('http://127.0.0.1:')
        )
      )
    ) {
      return sendCsrfOriginError(
        response,
        request,
        'CSRF_ORIGIN_DENIED',
        'The request origin is not allowed.'
      );
    }

    return next();
  };
}

function createApp(environment) {
  const app = express();

  app.disable('x-powered-by');

  // Topology-aware trusted proxy configuration (loopback, linklocal, uniquelocal, plus TRUSTED_PROXY_CIDRS)
  const trustedProxies = getTrustedProxies(process.env.TRUSTED_PROXY_CIDRS);
  app.set('trust proxy', trustedProxies);

  app.use(requestContext);
  app.use(cookieParser());
  app.use(
    helmet({
      referrerPolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
          connectSrc: ["'self'", "https://zamorin-cafe-erp.vercel.app", "http://localhost:3000", "http://localhost:4000", "http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
        },
      },
      frameguard: { action: 'deny' },
    })
  );

  // Allow camera and geolocation for attendance verification on origin; deny unused microphone
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.use(
    express.json({
      limit: '1mb',
    })
  );
  app.use(
    cors(
      createCorsOptions(environment)
    )
  );
  app.use(
    createCsrfOriginProtection(environment)
  );

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 50000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getTrustedClientIp(req)),
  });

  const livenessHandler = (request, response) =>
    response.status(200).json({
      success: true,
      status: 'live',
      service: SERVICE_NAME,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      requestId: request.requestId || request.correlationId || null,
      correlationId: request.correlationId || null,
    });

  app.get('/health/live', livenessHandler);
  app.get('/api/health/live', livenessHandler);
  app.get('/api/v1/health/live', livenessHandler);

  const healthHandler = (request, response) =>
    response.status(200).json({
      success: true,
      status: 'ok',
      service: SERVICE_NAME,
      timestamp:
        new Date().toISOString(),
      requestId:
        request.requestId || request.correlationId || null,
      correlationId:
        request.correlationId || null,
    });

  app.get('/api/v1/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  const readinessHandler = async (request, response) => {
    const database = getDatabaseState();
    let storageStatus = 'OK';
    try {
      const storageState = await documentStorageAdapter.healthCheck();
      storageStatus = storageState.status;
    } catch {
      storageStatus = 'UNAVAILABLE';
    }

    const isStorageReady = storageStatus === 'OK' || storageStatus === 'HEALTHY';
    const isDbReady = database.readyState === 1;
    const isProd = process.env.NODE_ENV === 'production';
    const ready = isProd ? (isDbReady && isStorageReady) : isDbReady;

    const { malwareScannerService } = require('./services/malwareScannerService');
    let scannerReport = { CORE_APP_READY: true, DOCUMENT_SCANNER_READY: false };
    try {
      scannerReport = await malwareScannerService.getStatus();
    } catch {
      scannerReport = { CORE_APP_READY: true, DOCUMENT_SCANNER_READY: false, details: 'Probe failed' };
    }

    return response
      .status(ready ? 200 : 503)
      .json({
        success: ready,
        status: ready ? 'ready' : 'not_ready',
        service: SERVICE_NAME,
        database: database.status,
        storage: storageStatus,
        scanner: {
          coreAppReady: scannerReport.CORE_APP_READY,
          documentScannerReady: scannerReport.DOCUMENT_SCANNER_READY,
          provider: scannerReport.scannerProvider,
          engineVersion: scannerReport.engineVersion,
          signatureVersion: scannerReport.signatureVersion,
          isPrivateNetwork: scannerReport.isPrivateNetwork,
        },
        timestamp: new Date().toISOString(),
        requestId: request.requestId || request.correlationId || null,
        correlationId: request.correlationId || null,
      });
  };

  app.get('/health/ready', readinessHandler);
  app.get('/api/health/ready', readinessHandler);
  app.get('/api/v1/health/ready', readinessHandler);
  app.get('/api/v1/readiness', readinessHandler);
  app.get('/api/readiness', readinessHandler);
  app.get('/readiness', readinessHandler);

  const stagingDiagnosticHandler = (request, response) => {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      return response.status(403).json({
        success: false,
        error: {
          code: 'STAGING_DIAGNOSTIC_DISABLED',
          message: 'Staging diagnostic endpoint is disabled in production.',
        },
      });
    }

    let dbName = '';
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection && mongoose.connection.name) {
        dbName = mongoose.connection.name;
      } else if (process.env.MONGODB_URI) {
        const parsed = new URL(process.env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
        dbName = parsed.pathname.replace(/^\//, '');
      }
    } catch (_) {}

    const isProductionDatabase = /prod(uction)?/i.test(dbName) || dbName === 'zamorin_erp_production';
    const syntheticDataMarker =
      process.env.STAGING_SYNTHETIC_DATA_MARKER ||
      (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'test' ? 'SYNTHETIC_STAGING_FIXTURE_ACTIVE' : null);

    const allowActiveScan = Boolean(
      (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'test') &&
      !isProductionDatabase &&
      syntheticDataMarker
    );

    return response.status(isProductionDatabase ? 403 : 200).json({
      success: !isProductionDatabase,
      environment: process.env.NODE_ENV || 'staging',
      isProduction: isProd,
      database: dbName || 'zamorin_erp_staging',
      isProductionDatabase,
      syntheticDataMarker,
      allowActiveScan,
      timestamp: new Date().toISOString(),
      requestId: request.requestId || request.correlationId || null,
    });
  };

  app.get('/health/staging', stagingDiagnosticHandler);
  app.get('/api/health/staging', stagingDiagnosticHandler);
  app.get('/api/v1/health/staging', stagingDiagnosticHandler);
  app.get('/api/v1/staging/diagnostic', stagingDiagnosticHandler);
  app.get('/api/staging/diagnostic', stagingDiagnosticHandler);
  app.get('/staging/diagnostic', stagingDiagnosticHandler);

  const { createMaintenanceMiddleware } = require('./middleware/maintenanceMode');
  app.use(createMaintenanceMiddleware());

  app.use('/api/', apiLimiter);
  app.use('/api/v1', apiRouter);

  // REC-03: Top-level canonical QR route & safe short alias
  const { getPublicQrContext } = require('./controllers/cafeAccessController');
  app.get('/cafe-access/qr/:token', getPublicQrContext);
  app.get('/c/:token', getPublicQrContext);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function listen(
  app,
  {
    host,
    port,
  }
) {
  return new Promise(
    (resolve, reject) => {
      const server = app.listen(
        {
          port,
          host,
          backlog: 2048,
        },
        () => resolve(server)
      );

      server.once('error', reject);
    }
  );
}

async function startServer() {
  const environment =
    loadEnvironment();

  await connectDatabase({
    uri: environment.mongodbUri,
    serverSelectionTimeoutMs:
      environment
        .mongodbServerSelectionTimeoutMs,
    maxPoolSize:
      environment.mongodbMaxPoolSize,
    minPoolSize:
      environment.mongodbMinPoolSize,
  });

  try {
    const { initRepositories } = require('./cafe-operations/repositories');
    initRepositories('mongo');
  } catch (err) {
    if (environment.nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
      console.error('[FATAL] Failed to initialize CafeOps Mongo repositories in production mode:', err.message);
      process.exit(1);
    }
  }

  // Validate durable document storage configuration before accepting traffic (Fails safe if unconfigured in production)
  documentStorageAdapter.validateStartupConfiguration(environment);

  // Universal production configuration & secrets validator (Fails safe: reports PRESENT/MISSING/INVALID/UNSAFE without revealing secrets)
  const { validateStartupConfiguration: validateConfig } = require('./config/startupValidator');
  validateConfig(environment, { failClosed: true });

  const app =
    createApp(environment);

  const server =
    await listen(app, {
      host: environment.host,
      port: environment.port,
    });

  console.log(
    `Zamorin Cafe ERP API running on ${environment.host}:${environment.port} in ${environment.nodeEnvironment} mode.`
  );

  return {
    app,
    server,
    environment,
  };
}

function closeHttpServer(
  server,
  timeoutMs = 10000
) {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise(
    (resolve, reject) => {
      const forceCloseTimer =
        setTimeout(() => {
          if (
            typeof server
              .closeAllConnections ===
            'function'
          ) {
            server
              .closeAllConnections();
          }
        }, timeoutMs);

      forceCloseTimer.unref();

      server.close((error) => {
        clearTimeout(
          forceCloseTimer
        );

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }
  );
}

function registerShutdownHandlers(
  server
) {
  let shutdownPromise = null;

  const shutdown = (signal) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      console.log(
        `${signal} received; shutting down safely.`
      );

      await closeHttpServer(server);
      await disconnectDatabase();

      console.log(
        'Zamorin Cafe ERP API stopped.'
      );
    })();

    return shutdownPromise;
  };

  for (const signal of [
    'SIGTERM',
    'SIGINT',
  ]) {
    process.once(signal, () => {
      shutdown(signal)
        .then(() => {
          process.exitCode = 0;
        })
        .catch((error) => {
          console.error(
            'Backend shutdown failed:',
            error.message
          );

          process.exitCode = 1;
        });
    });
  }

  process.on('uncaughtException', (error) => {
    try {
      const { logStructuredError } = require('./services/securityLogger');
      logStructuredError(error, null, { fatal: true, event: 'uncaughtException' });
    } catch {
      console.error('[FATAL] Uncaught exception:', error.message);
    }
    shutdown('uncaughtException')
      .finally(() => {
        process.exit(1);
      });
  });

  process.on('unhandledRejection', (reason) => {
    try {
      const { logStructuredError } = require('./services/securityLogger');
      const err = reason instanceof Error ? reason : new Error(String(reason));
      logStructuredError(err, null, { fatal: true, event: 'unhandledRejection' });
    } catch {
      console.error('[FATAL] Unhandled rejection:', reason);
    }
    shutdown('unhandledRejection')
      .finally(() => {
        process.exit(1);
      });
  });

  return shutdown;
}

async function runMain() {
  try {
    const {
      server,
    } = await startServer();

    registerShutdownHandlers(
      server
    );
  } catch (error) {
    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      console.error(
        'Database cleanup failed:',
        disconnectError.message
      );
    }

    console.error(
      'Backend startup failed:',
      error.message
    );

    process.exitCode = 1;
  }
}

if (require.main === module) {
  runMain();
}

module.exports = {
  createApp,
  createCorsOptions,
  closeHttpServer,
  registerShutdownHandlers,
  startServer,
};
