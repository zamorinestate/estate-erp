'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OPERATIONAL ALERT SERVICE
 * ============================================================================
 * Centralized alert processing, smart deduplication, cooldown management,
 * and escalation routing for production operations.
 */

const { OperationalAlert } = require('../models/OperationalAlert');
const { ApiError } = require('../middleware/errorHandler');
const { SequenceCounter } = require('../models/SequenceCounter');

class OperationalAlertService {
  /**
   * Raises or aggregates an operational alert.
   */
  async raiseAlert({
    category,
    severity = 'SEV-3',
    source,
    title,
    description,
    deduplicationKey,
    organisationId = 'ZAMORIN',
    cafeId = null,
    requestId = null,
    relatedRelease = process.env.RELEASE_VERSION || 'v1.0.0-freeze',
    cooldownMinutes = 15,
  }) {
    if (!deduplicationKey) {
      deduplicationKey = `${category}_${source}_${title}`.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
    }

    const now = new Date();

    // Check for existing open or acknowledged alert
    const existing = await OperationalAlert.findOne({
      organisationId,
      deduplicationKey,
      status: { $in: ['OPEN', 'ACKNOWLEDGED'] },
    });

    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastDetected = now;
      if (requestId && !existing.relatedRequestIds.includes(requestId)) {
        existing.relatedRequestIds.push(requestId);
      }

      // Check if cooldown allows re-escalation
      const inCooldown = existing.cooldownUntil && new Date(existing.cooldownUntil) > now;
      if (!inCooldown) {
        existing.cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60000);
      }

      await existing.save();
      return { alert: existing, isNew: false, inCooldown };
    }

    // Generate unique alert ID
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const alertId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `OPERATIONAL_ALERT_${dateStr}`,
      prefix: `ALT-${dateStr}`,
      minimumDigits: 5,
    });

    const newAlert = await OperationalAlert.create({
      alertId,
      category,
      severity,
      source,
      title,
      description,
      deduplicationKey,
      organisationId,
      cafeId,
      firstDetected: now,
      lastDetected: now,
      occurrenceCount: 1,
      status: 'OPEN',
      relatedRequestIds: requestId ? [requestId] : [],
      relatedRelease,
      cooldownUntil: new Date(now.getTime() + cooldownMinutes * 60000),
    });

    return { alert: newAlert, isNew: true, inCooldown: false };
  }

  /**
   * Acknowledges an active alert.
   */
  async acknowledgeAlert({ alertId, userId, organisationId = 'ZAMORIN' }) {
    const alert = await OperationalAlert.findOne({ alertId, organisationId });
    if (!alert) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', `Alert ${alertId} was not found.`);
    }

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    await alert.save();

    return alert;
  }

  /**
   * Resolves an alert manually or automatically.
   */
  async resolveAlert({ alertId, userId = 'SYSTEM', resolution = 'Condition cleared', organisationId = 'ZAMORIN' }) {
    const alert = await OperationalAlert.findOne({ alertId, organisationId });
    if (!alert) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', `Alert ${alertId} was not found.`);
    }

    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date();
    alert.resolution = resolution;
    await alert.save();

    return alert;
  }

  /**
   * Automatically resolves alerts matching a deduplication key when the underlying condition recovers.
   */
  async autoResolveByDeduplicationKey({ deduplicationKey, resolution = 'Auto-recovered via health check' }) {
    const result = await OperationalAlert.updateMany(
      { deduplicationKey, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } },
      {
        $set: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolution,
        },
      }
    );

    return result;
  }

  /**
   * Lists active alerts.
   */
  async listActiveAlerts({ organisationId = 'ZAMORIN', cafeId = null, severity = null, limit = 50 } = {}) {
    const query = {
      organisationId,
      status: { $in: ['OPEN', 'ACKNOWLEDGED'] },
    };

    if (cafeId) {
      query.$or = [{ cafeId }, { cafeId: null }];
    }

    if (severity) {
      query.severity = severity;
    }

    return OperationalAlert.find(query).sort({ severity: 1, lastDetected: -1 }).limit(limit).lean();
  }
}

const operationalAlertService = new OperationalAlertService();

module.exports = {
  OperationalAlertService,
  operationalAlertService,
};
