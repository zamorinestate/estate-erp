'use strict';

/**
 * startDev.js
 *
 * Development-only startup script.
 * Spins up mongodb-memory-server, seeds the MASTER account,
 * then starts the Zamorin Cafe ERP backend on PORT 4000.
 *
 * Usage: node src/scripts/startDev.js
 */

require('dotenv').config();

const { MongoMemoryServer } = require('mongodb-memory-server');

const {
  connectDatabase,
  disconnectDatabase,
} = require('../config/database');

const {
  seedMasterUser,
  seedPermissionRules,
  seedSystemCommunicationSettings,
  seedCafeOperationsData,
  seedInventoryData,
  seedVendorsData,
} = require('./seedInitialData');

async function main() {
  const appMode = String(process.env.APP_MODE || '').trim().toUpperCase();
  const isRealDataOrUatMode = ['UAT', 'REAL_USER_TEST', 'STAGING', 'PRODUCTION'].includes(appMode) ||
                              process.env.NODE_ENV === 'production' ||
                              process.env.REQUIRE_PERSISTENT_DB === 'true';
  const allowMemoryDb = process.env.ALLOW_MEMORY_DB === 'true' || process.env.ALLOW_IN_MEMORY_DB === 'true';

  let uri = process.env.MONGODB_URI;
  let mongod = null;

  async function startInMemoryMongo() {
    if (isRealDataOrUatMode) {
      throw new Error('[FATAL] PERSISTENT_DATABASE_REQUIRED: In-memory MongoDB is strictly forbidden in real-data/UAT mode.');
    }
    console.log('[dev] Starting in-memory MongoDB (explicit opt-in)...');
    mongod = await MongoMemoryServer.create({
      instance: { dbName: 'zamorin_cafe_erp' },
    });
    const memoryUri = mongod.getUri();
    console.log(`[dev] In-memory MongoDB ready at ${memoryUri}`);
    return memoryUri;
  }

  if (!uri) {
    const net = require('net');
    const isLocalMongo = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { resolve(false); });
      socket.connect(27017, '127.0.0.1');
    });

    if (isLocalMongo) {
      uri = 'mongodb://127.0.0.1:27017/zamorin_cafe_erp';
      console.log(`[dev] Persistent local MongoDB detected at ${uri}`);
    } else if (isRealDataOrUatMode) {
      console.error(`[FATAL] PERSISTENT_DATABASE_REQUIRED: No persistent MongoDB found at port 27017 or in MONGODB_URI for mode '${appMode || 'REAL_USER_TEST'}'.`);
      process.exit(1);
    } else if (allowMemoryDb) {
      uri = await startInMemoryMongo();
    } else {
      console.error('[FATAL] PERSISTENT_DATABASE_REQUIRED: Local persistent MongoDB (127.0.0.1:27017) is not reachable and MONGODB_URI is not set. Silent in-memory database fallback is disabled. To allow ephemeral memory DB in dev, explicitly set ALLOW_MEMORY_DB=true.');
      process.exit(1);
    }
  }

  // Override MONGODB_URI so the environment validator accepts it
  process.env.MONGODB_URI = uri;

  // Connect once for seeding (never silently fall back in real-data mode)
  try {
    await connectDatabase({ uri, serverSelectionTimeoutMS: 4000 });
  } catch (err) {
    if (isRealDataOrUatMode) {
      console.error(`[FATAL] PERSISTENT_DATABASE_REQUIRED: Persistent MongoDB connection failed (${err.message}) in mode '${appMode || 'REAL_USER_TEST'}'. Silent fallback is forbidden.`);
      process.exit(1);
    } else if (allowMemoryDb) {
      console.warn(`[dev] Primary MongoDB connection failed (${err.message}). Explicit opt-in ALLOW_MEMORY_DB=true active: falling back to in-memory MongoDB...`);
      uri = await startInMemoryMongo();
      process.env.MONGODB_URI = uri;
      await connectDatabase({ uri });
    } else {
      console.error(`[FATAL] PERSISTENT_DATABASE_REQUIRED: Primary MongoDB connection failed (${err.message}). Silent in-memory fallback is disabled. Set ALLOW_MEMORY_DB=true to allow ephemeral DB.`);
      process.exit(1);
    }
  }

  const organisationId =
    process.env.INITIAL_ORGANISATION_ID || 'ZAMORIN';
  const masterName =
    process.env.INITIAL_MASTER_NAME || 'Zamorin Primary Master';
  const masterEmail =
    process.env.INITIAL_MASTER_EMAIL || 'pradeeshk331@gmail.com';
  const masterPassword =
    process.env.INITIAL_MASTER_PASSWORD ||
    'PRADEESHK@94309';

  console.log('[dev] Seeding MASTER account and canonical role users...');

  const masterUser = await seedMasterUser({
    organisationId,
    masterName,
    masterEmail,
    masterPassword,
  });

  await seedPermissionRules({
    organisationId,
    masterUserId: masterUser.userId,
  });

  await seedSystemCommunicationSettings({
    organisationId,
    masterEmail,
  });

  const masterId = masterUser?.userId || 'MU-0001';
  console.log('[dev] Seeding cafes, operational inventory, and active suppliers with masterId:', masterId);
  await seedCafeOperationsData(organisationId, masterId);
  await seedInventoryData({ organisationId, masterUserId: masterId });
  await seedVendorsData({ organisationId, masterUserId: masterId });

  console.log(
    `[dev] Seed complete — login: ${masterEmail} / ${masterPassword}`
  );

  await disconnectDatabase();

  // Now start the full Express server
  const { startServer, registerShutdownHandlers } =
    require('../server');

  const { server } = await startServer();

  registerShutdownHandlers(server);

  // Keep mongod alive for the server lifetime
  process.on('exit', async () => {
    if (mongod) await mongod.stop();
  });
}

main().catch((error) => {
  console.error('[dev] Startup failed:', error.message);
  process.exitCode = 1;
});
