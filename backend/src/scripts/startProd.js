'use strict';

/**
 * PRODUCTION SERVER STARTUP SCRIPT — ZAMORIN CAFE ERP
 *
 * Connects to the production MongoDB database cluster, verifies/seeds initial
 * Primary Master user and permission rules (idempotent), and starts the Express API server.
 */

const { startServer, registerShutdownHandlers } = require('../server');
const { runSeed } = require('./seedInitialData');

async function startProductionServer() {
  console.log('================================================================');
  console.log(' ZAMORIN CAFE ERP — PRODUCTION SERVER BOOTSTRAP (v1.1.0)');
  console.log('================================================================');

  // Seed only the production-safe bootstrap data & permissions.
  // Any failure is fatal: starting with incomplete permission/bootstrap state
  // makes UI actions appear broken or authorization-inconsistent.
  console.log('[INIT] Verifying production bootstrap data and permission rules...');
  try {
    await runSeed();
    console.log('[INIT] Production bootstrap and permission rules verified.');
  } catch (seedErr) {
    console.error('[FATAL] Production bootstrap verification failed:', seedErr.message);
    throw seedErr;
  }

  process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '10000';
  process.env.MONGODB_MAX_POOL_SIZE = process.env.MONGODB_MAX_POOL_SIZE || '100';
  process.env.MONGODB_MIN_POOL_SIZE = process.env.MONGODB_MIN_POOL_SIZE || '20';

  // Start HTTP Express Server using canonical server.js bootstrap
  const { server, environment } = await startServer();
  registerShutdownHandlers(server);

  console.log(`================================================================`);
  console.log(`🚀 Zamorin Cafe ERP Production API running at http://${environment.host}:${environment.port}`);
  console.log(`   Health Check: http://${environment.host}:${environment.port}/api/v1/health`);
  console.log(`================================================================`);

  return { server, environment };
}

if (require.main === module) {
  startProductionServer().catch((error) => {
    console.error('[FATAL] Production server startup failed:', error);
    process.exit(1);
  });
}

module.exports = { startProductionServer };
