'use strict';

const EventEmitter = require('node:events');
const { changeStreamCheckpointService } = require('./changeStreamCheckpointService');

/**
 * Enterprise Distributed Event Bus & Realtime Broker
 * 
 * Supports:
 * - Shared pub/sub across multi-instance cluster (Redis Pub/Sub adapter or internal EventEmitter)
 * - Cross-instance security events (Device revocation, Session termination, Forced logout)
 * - Single-subscription Mongo Change Stream fan-out (prevents per-socket change stream exhaustion)
 * - Durable resume token tracking and reconnect resilience (survives process restarts and worker replacements)
 */

class DistributedEventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redisPublisher = options.redisPublisher || null;
    this.redisSubscriber = options.redisSubscriber || null;
    this.isDistributed = Boolean(this.redisPublisher && this.redisSubscriber);
    this.subscribers = new Map(); // topic -> Set(callbacks)
    this.redisSubscriptions = new Set();
    this.instanceId = process.env.INSTANCE_ID || `inst-${process.pid}`;
    this.checkpointService = options.checkpointService || changeStreamCheckpointService;
    this.metrics = {
      publishedEvents: 0,
      deliveredEvents: 0,
      crossInstanceEvents: 0,
    };
  }

  setRedisBrokers(publisher, subscriber) {
    this.redisPublisher = publisher;
    this.redisSubscriber = subscriber;
    this.isDistributed = Boolean(publisher && subscriber);
    this.redisSubscriptions.clear();

    if (this.isDistributed) {
      for (const topic of this.subscribers.keys()) {
        this.subscribeRedisTopic(topic).catch(() => {});
      }
    }
  }

  async subscribeRedisTopic(topic) {
    if (!this.isDistributed || !this.redisSubscriber || this.redisSubscriptions.has(topic)) return;
    await this.redisSubscriber.subscribe(topic, (messageStr) => {
      try {
        const eventEnvelope = typeof messageStr === 'string' ? JSON.parse(messageStr) : messageStr;
        if (eventEnvelope?.sourceInstanceId === this.instanceId) return;
        this.metrics.crossInstanceEvents++;
        this.emitLocal(topic, eventEnvelope);
      } catch (_) {}
    });
    this.redisSubscriptions.add(topic);
  }

  /**
   * Publishes an event to both local listeners and distributed subscribers.
   */
  async publish(topic, payload) {
    this.metrics.publishedEvents++;
    const eventEnvelope = {
      topic,
      payload,
      timestamp: new Date().toISOString(),
      sourceInstanceId: this.instanceId,
    };

    // Deliver locally
    this.emitLocal(topic, eventEnvelope);

    // Broadcast across cluster if distributed
    if (this.isDistributed && this.redisPublisher) {
      try {
        await this.redisPublisher.publish(topic, JSON.stringify(eventEnvelope));
      } catch (err) {
        console.warn(`[EventBus] Distributed publish failed: ${err.message}`);
      }
    }

    return eventEnvelope;
  }

  /**
   * Subscribes to an event topic.
   */
  subscribe(topic, callback) {
    if (!topic || typeof callback !== 'function') {
      throw new Error('Topic and callback function are required for subscription');
    }

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
      if (this.isDistributed && this.redisSubscriber) {
        this.subscribeRedisTopic(topic).catch(() => {});
      }
    }
    this.subscribers.get(topic).add(callback);

    return () => this.unsubscribe(topic, callback);
  }

  /**
   * Unsubscribes from an event topic.
   */
  unsubscribe(topic, callback) {
    if (this.subscribers.has(topic)) {
      this.subscribers.get(topic).delete(callback);
      if (this.subscribers.get(topic).size === 0) {
        this.subscribers.delete(topic);
        if (this.isDistributed && this.redisSubscriber) {
          this.redisSubscriptions.delete(topic);
          this.redisSubscriber.unsubscribe(topic).catch(() => {});
        }
      }
    }
  }

  emitLocal(topic, eventEnvelope) {
    this.emit(topic, eventEnvelope);
    if (this.subscribers.has(topic)) {
      for (const cb of this.subscribers.get(topic)) {
        try {
          cb(eventEnvelope.payload, eventEnvelope);
          this.metrics.deliveredEvents++;
        } catch (err) {
          console.error(`[EventBus] Callback error on topic "${topic}":`, err.message);
        }
      }
    }
  }

  /**
   * Saves latest resume token for MongoDB change streams into durable checkpoint storage.
   */
  async saveResumeToken(collectionName, token, metadata = {}) {
    const streamId = metadata.streamId || `stream-${collectionName}`;
    return this.checkpointService.saveCheckpoint(streamId, collectionName, token, metadata);
  }

  /**
   * Retrieves durable resume token for a collection/stream.
   */
  async getResumeToken(collectionName, streamId = null) {
    const targetStreamId = streamId || `stream-${collectionName}`;
    const checkpoint = await this.checkpointService.getCheckpoint(targetStreamId);
    return checkpoint ? checkpoint.resumeToken : null;
  }

  /**
   * Builds resume options adhering to MongoDB change stream resume semantics.
   */
  async buildResumeOptions(collectionName, options = {}) {
    const targetStreamId = options.streamId || `stream-${collectionName}`;
    return this.checkpointService.buildResumeOptions(targetStreamId, options);
  }

  /**
   * Handles stream errors with canonical code 286 detection and non-destructive retry for transient errors.
   */
  async handleStreamError(collectionName, err, streamId = null) {
    const targetStreamId = streamId || `stream-${collectionName}`;
    return this.checkpointService.handleStreamError(targetStreamId, err);
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeTopicsCount: this.subscribers.size,
      isDistributed: this.isDistributed,
    };
  }

  reset() {
    this.subscribers.clear();
    this.checkpointService.reset().catch(() => {});
    this.metrics = {
      publishedEvents: 0,
      deliveredEvents: 0,
      crossInstanceEvents: 0,
    };
  }
}

const defaultEventBus = new DistributedEventBus();

module.exports = {
  DistributedEventBus,
  defaultEventBus,
};
