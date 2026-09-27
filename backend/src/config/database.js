'use strict';

const dns = require('dns');
const mongoose = require('mongoose');

// Force IPv4-first DNS resolution order (required for MongoDB Atlas SRV on some
// platforms where IPv6-first ordering causes ECONNREFUSED on the SRV query).
dns.setDefaultResultOrder('ipv4first');

// Optional: allow the operator to override DNS servers via environment variable
// e.g. DNS_SERVERS=8.8.8.8,1.1.1.1
const customDnsServers = (process.env.DNS_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (customDnsServers.length > 0) {
  dns.setServers(customDnsServers);
}

const DATABASE_STATES = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
});

function getDatabaseState() {
  const readyState = mongoose.connection.readyState;

  return {
    readyState,
    status:
      DATABASE_STATES[readyState] ||
      'unknown',
    pool: {
      maxPoolSize: mongoose.connection.client?.options?.maxPoolSize || 100,
      minPoolSize: mongoose.connection.client?.options?.minPoolSize || 10,
      waitQueueTimeoutMS: mongoose.connection.client?.options?.waitQueueTimeoutMS || 10000,
    },
  };
}

async function connectDatabase({
  uri,
  serverSelectionTimeoutMs = 10000,
  maxPoolSize = 100,
  minPoolSize = 10,
} = {}) {
  if (
    typeof uri !== 'string' ||
    !uri.trim()
  ) {
    throw new Error(
      'MONGODB_URI is required.'
    );
  }

  const appMode = String(process.env.APP_MODE || '').trim().toUpperCase();
  const isRealDataOrUatMode = ['UAT', 'REAL_USER_TEST', 'STAGING', 'PRODUCTION'].includes(appMode) ||
                              process.env.NODE_ENV === 'production' ||
                              process.env.REQUIRE_PERSISTENT_DB === 'true';

  const uriLower = String(uri || '').toLowerCase();
  if (isRealDataOrUatMode && (uriLower.includes('memory') || uriLower.includes('mongomemoryserver') || global.__MONGODB_MEMORY_SERVER__)) {
    throw new Error('PERSISTENT_DATABASE_REQUIRED: Ephemeral in-memory database is strictly forbidden for real-user testing or production.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS:
        serverSelectionTimeoutMs,
      maxPoolSize,
      minPoolSize,
    });
  } catch (err) {
    if (isRealDataOrUatMode) {
      const safeUri = uri.replace(/:([^:@]+)@/, ':***@');
      throw new Error(`PERSISTENT_DATABASE_REQUIRED: Failed to connect to persistent database at ${safeUri}: ${err.message}`);
    }
    throw err;
  }

  return mongoose.connection;
}

async function disconnectDatabase() {
  if (
    mongoose.connection.readyState === 0
  ) {
    return;
  }

  await mongoose.disconnect();
}

async function getDatabaseTopology() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return {
      connected: false,
      topologyType: 'UNKNOWN',
      setNamePresent: false,
      isWritablePrimary: false,
      logicalSessionTimeoutMinutes: null,
      transactionCapable: false,
    };
  }

  try {
    const adminDb = mongoose.connection.db.admin();
    let hello;
    try {
      hello = await adminDb.command({ hello: 1 });
    } catch (_) {
      hello = await adminDb.command({ isMaster: 1 });
    }

    const client = typeof mongoose.connection.getClient === 'function'
      ? mongoose.connection.getClient()
      : mongoose.connection.client;
    const topologyDesc = client?.topology?.description;

    const topologyType = topologyDesc?.type || (hello.setName ? 'ReplicaSetWithPrimary' : (hello.msg === 'isdbgrid' ? 'Sharded' : 'Single'));
    const setNamePresent = !!(hello.setName || topologyDesc?.setName);
    const isWritablePrimary = !!(hello.isWritablePrimary || hello.ismaster);
    const logicalSessionTimeoutMinutes = hello.logicalSessionTimeoutMinutes !== undefined ? hello.logicalSessionTimeoutMinutes : null;
    const transactionCapable = !!(
      (setNamePresent || String(topologyType).includes('ReplicaSet') || topologyType === 'Sharded') &&
      logicalSessionTimeoutMinutes !== null
    );

    return {
      connected: true,
      topologyType,
      setNamePresent,
      isWritablePrimary,
      logicalSessionTimeoutMinutes,
      transactionCapable,
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      transactionCapable: false,
    };
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getDatabaseState,
  getDatabaseTopology,
};

