'use strict';

/**
 * Enterprise Scalable Device Presence & Write Coalescing Engine
 * 
 * Features:
 * - Ephemeral distributed presence tracking (in-memory + Redis store support)
 * - Heartbeat write coalescing (prevents 1,667 DB writes/sec for 50,000 devices)
 * - Durable Mongo checkpointing with batch window (default: 5 minutes)
 * - Immediate durable checkpoint on critical lifecycle transitions (REVOKE, LOST, RETIRED, REASSIGN, FIRST_SEEN)
 * - Dynamic heartbeat jitter calculation to eliminate clock synchronization storms
 */

class DevicePresenceService {
  constructor(options = {}) {
    this.redisClient = options.redisClient || null;
    this.ephemeralPresence = new Map(); // key: organisationId:cafeId:deviceId
    this.pendingCheckpoints = new Map(); // same tenant-scoped key -> timestamp
    this.checkpointWindowMs = options.checkpointWindowMs !== undefined ? options.checkpointWindowMs : 5 * 60 * 1000; // 5 minutes durable coalesce window
    this.baseHeartbeatIntervalSec = options.heartbeatIntervalSec || 30;
    this.jitterRatio = options.jitterRatio || 0.20; // +/- 20% jitter
    this.flushTimer = null;
    this.metrics = {
      totalHeartbeats: 0,
      coalescedHeartbeats: 0,
      durableWrites: 0,
      stateChanges: 0,
    };
  }

  setRedisClient(client) {
    this.redisClient = client || null;
  }

  buildPresenceKey({ organisationId, cafeId, deviceId }) {
    const org = String(organisationId || '').trim().toUpperCase();
    const cafe = String(cafeId || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
    const device = String(deviceId || '').trim().toUpperCase();
    if (!org || !device) {
      const error = new Error('PRESENCE_SCOPE_REQUIRED: organisationId and deviceId are required.');
      error.code = 'PRESENCE_SCOPE_REQUIRED';
      throw error;
    }
    return {
      org,
      cafe,
      device,
      scopeKey: `${org}:${cafe}:${device}`,
    };
  }

  /**
   * Calculates heartbeat interval with jitter for a device to distribute connection arrivals.
   */
  calculateNextHeartbeatSec(baseSec = this.baseHeartbeatIntervalSec) {
    const jitterMagnitude = baseSec * this.jitterRatio;
    const offset = (Math.random() * 2 - 1) * jitterMagnitude;
    return Math.max(5, Math.round(baseSec + offset));
  }

  /**
   * Records a device heartbeat with ephemeral caching and write coalescing.
   */
  async recordHeartbeat({
    deviceId,
    organisationId = null,
    cafeId = null,
    status = 'ACTIVE',
    ip = null,
    appVersion = null,
    now = new Date(),
    forceDurable = false,
  }) {
    this.metrics.totalHeartbeats++;
    const scope = this.buildPresenceKey({ organisationId, cafeId, deviceId });
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const existing = this.ephemeralPresence.get(scope.scopeKey);
    const stateChanged = !existing || existing.status !== status;

    const presenceEntry = {
      deviceId: scope.device,
      organisationId: scope.org,
      cafeId: scope.cafe,
      status,
      ip,
      appVersion,
      lastHeartbeat: nowMs,
      online: status === 'ACTIVE' || status === 'PENDING',
    };

    this.ephemeralPresence.set(scope.scopeKey, presenceEntry);

    if (this.redisClient) {
      try {
        const ttl = Math.ceil(this.baseHeartbeatIntervalSec * 3);
        await this.redisClient.set(`zamorin:presence:${scope.scopeKey}`, JSON.stringify(presenceEntry), { EX: ttl });
      } catch (_) {}
    }

    // Determine if durable Mongo checkpoint is needed
    const lastCheckpoint = this.pendingCheckpoints.get(scope.scopeKey) || 0;
    const elapsedSinceLastCheckpoint = nowMs - lastCheckpoint;

    if (forceDurable || stateChanged || elapsedSinceLastCheckpoint >= this.checkpointWindowMs) {
      this.pendingCheckpoints.set(scope.scopeKey, nowMs);
      this.metrics.durableWrites++;
      if (stateChanged) this.metrics.stateChanges++;

      // Asynchronously perform durable checkpoint
      await this.persistCheckpoint({
        deviceId: scope.device,
        organisationId: scope.org,
        cafeId: scope.cafe,
        status,
        lastSeenAt: now,
      });

      return {
        coalesced: false,
        nextHeartbeatSec: this.calculateNextHeartbeatSec(),
        durableCheckpoint: true,
      };
    }

    this.metrics.coalescedHeartbeats++;
    return {
      coalesced: true,
      nextHeartbeatSec: this.calculateNextHeartbeatSec(),
      durableCheckpoint: false,
    };
  }

  /**
   * Persists checkpoint to durable MongoDB registration if models are available.
   */
  async persistCheckpoint({ deviceId, organisationId, cafeId, status, lastSeenAt }) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const { DeviceRegistration } = require('../models/DeviceRegistration');
        if (DeviceRegistration && typeof DeviceRegistration.updateOne === 'function') {
          await DeviceRegistration.updateOne(
            {
              deviceId: String(deviceId || '').trim().toUpperCase(),
              organisationId: String(organisationId || '').trim().toUpperCase(),
              ...(cafeId && cafeId !== 'GLOBAL'
                ? { assignedCafeId: String(cafeId).trim().toUpperCase() }
                : {}),
            },
            {
              $set: {
                lastSeenAt,
                updatedAt: lastSeenAt,
              },
            }
          ).catch(() => {});
        }
      }
    } catch (_) {}
  }

  /**
   * Retrieves active live presence count.
   */
  getLiveConnectedCount(maxAgeMs = 90000) {
    const now = Date.now();
    let count = 0;
    for (const entry of this.ephemeralPresence.values()) {
      if (now - entry.lastHeartbeat <= maxAgeMs && entry.online) {
        count++;
      }
    }
    return count;
  }

  /**
   * Queries presence of a specific device.
   */
  async getDevicePresence(deviceId, organisationId, cafeId = null) {
    const scope = this.buildPresenceKey({ deviceId, organisationId, cafeId });
    const local = this.ephemeralPresence.get(scope.scopeKey);
    if (local) {
      return local;
    }

    if (!this.redisClient) {
      return null;
    }

    try {
      const raw = await this.redisClient.get(`zamorin:presence:${scope.scopeKey}`);
      if (!raw) return null;

      const distributed = JSON.parse(raw);
      const normalized = {
        ...distributed,
        deviceId: scope.device,
        organisationId: scope.org,
        cafeId: scope.cafe,
      };

      this.ephemeralPresence.set(scope.scopeKey, normalized);
      return normalized;
    } catch (_) {
      return null;
    }
  }

  /**
   * Retrieves summary metrics of presence engine.
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTrackedDevices: this.ephemeralPresence.size,
      liveConnectedCount: this.getLiveConnectedCount(),
      coalescingRatioPct: this.metrics.totalHeartbeats > 0
        ? ((this.metrics.coalescedHeartbeats / this.metrics.totalHeartbeats) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Clear in-memory presence state (testing utility).
   */
  reset() {
    this.ephemeralPresence.clear();
    this.pendingCheckpoints.clear();
    this.metrics = {
      totalHeartbeats: 0,
      coalescedHeartbeats: 0,
      durableWrites: 0,
      stateChanges: 0,
    };
  }
}

const defaultPresenceService = new DevicePresenceService();

module.exports = {
  DevicePresenceService,
  defaultPresenceService,
};
