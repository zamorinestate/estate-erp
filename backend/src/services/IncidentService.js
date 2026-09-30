'use strict';

/**
 * INCIDENT MANAGEMENT & SMART ALERT GROUPING SERVICE
 *
 * Prevents alert flooding by aggregating high-frequency operational errors
 * into a single Incident record with occurrence counts, deduplication windows,
 * P0/P1 SLA escalation to Primary Master (MU-0001), and recovery notifications.
 */

const { Incident } = require('../models/Incident');
const { notificationService } = require('./NotificationService');
const { SequenceCounter } = require('../models/SequenceCounter');

class IncidentService {
  /**
   * Records or groups an incident event.
   * @param {Object} params
   * @param {string} params.category
   * @param {string} params.severity ('P0', 'P1', 'P2', 'P3')
   * @param {string} params.summary
   * @param {string} params.deduplicationKey
   * @param {string} [params.organisationId='ZAMORIN']
   * @param {string} [params.affectedService]
   * @param {string} [params.cafeId]
   * @param {string} [params.correlationId]
   */
  static async recordIncidentEvent({
    category,
    severity = 'P2',
    summary,
    deduplicationKey,
    organisationId = 'ZAMORIN',
    affectedService = 'BACKEND_API',
    cafeId = null,
    correlationId = null,
  }) {
    const activeIncident = await Incident.findOne({
      organisationId,
      deduplicationKey,
      status: { $in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MONITORING'] },
    });

    if (activeIncident) {
      // Increment event count and update timestamp
      activeIncident.eventCount += 1;
      activeIncident.lastEventAt = new Date();
      if (affectedService && !activeIncident.affectedServices.includes(affectedService)) {
        activeIncident.affectedServices.push(affectedService);
      }
      if (cafeId && !activeIncident.affectedCafes.includes(cafeId)) {
        activeIncident.affectedCafes.push(cafeId);
      }
      if (correlationId && !activeIncident.rootCorrelationIds.includes(correlationId)) {
        activeIncident.rootCorrelationIds.push(correlationId);
      }

      await activeIncident.save();
      return { incident: activeIncident, isNew: false };
    }

    // Create new incident
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const incidentId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `INCIDENT_${dateStr}`,
      prefix: `INC-${dateStr}`,
      minimumDigits: 5,
    });

    const newIncident = await Incident.create({
      incidentId,
      organisationId,
      severity,
      category,
      summary,
      deduplicationKey,
      eventCount: 1,
      affectedServices: affectedService ? [affectedService] : [],
      affectedCafes: cafeId ? [cafeId] : [],
      rootCorrelationIds: correlationId ? [correlationId] : [],
      startedAt: new Date(),
      detectedAt: new Date(),
      lastEventAt: new Date(),
      status: 'OPEN',
    });

    // Notify operations and Primary Master for P0/P1
    const isCritical = severity === 'P0' || severity === 'P1';
    await notificationService.publishNotification({
      eventType: 'INCIDENT_OPENED',
      organisationId,
      cafeId,
      recipientRoles: ['MASTER'],
      includePrimaryMaster: isCritical,
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      priority: isCritical ? 'CRITICAL' : 'HIGH',
      templateId: 'INCIDENT_OPEN',
      templateData: {
        incidentId: newIncident.incidentId,
        severity: newIncident.severity,
        category: newIncident.category,
        summary: newIncident.summary,
        eventCount: '1',
        startedAt: newIncident.startedAt.toISOString(),
      },
      idempotencyKey: `INCIDENT_OPEN_${newIncident.incidentId}`,
    });

    return { incident: newIncident, isNew: true };
  }

  /**
   * Resolves an incident, generates a postmortem draft, and sends a recovery email.
   */
  static async resolveIncident({
    incidentId,
    resolvedByUserId = 'MU-0001',
    rootCause = '',
    correctiveAction = '',
    preventiveAction = '',
    organisationId = 'ZAMORIN',
  }) {
    const incident = await Incident.findOne({ incidentId, organisationId });
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    incident.status = 'RECOVERED';
    incident.resolvedAt = new Date();
    incident.resolvedBy = resolvedByUserId;
    incident.rootCause = rootCause;
    incident.correctiveAction = correctiveAction;
    incident.preventiveAction = preventiveAction;

    // Generate postmortem draft
    const durationMs = incident.resolvedAt.getTime() - incident.startedAt.getTime();
    const durationMin = Math.round(durationMs / 60000);

    incident.postmortemDraft = `
# DRAFT POSTMORTEM: ${incident.incidentId}
- **Severity**: ${incident.severity}
- **Category**: ${incident.category}
- **Duration**: ${durationMin} minutes (${incident.startedAt.toISOString()} to ${incident.resolvedAt.toISOString()})
- **Grouped Events**: ${incident.eventCount}
- **Affected Services**: ${incident.affectedServices.join(', ') || 'N/A'}
- **Affected Cafes**: ${incident.affectedCafes.join(', ') || 'ALL'}
- **Root Cause**: ${rootCause || 'Investigated and stabilized.'}
- **Corrective Action**: ${correctiveAction || 'System recovered cleanly.'}
- **Preventive Action**: ${preventiveAction || 'Monitoring alert thresholds active.'}
    `.trim();

    await incident.save();

    // Send recovery notification
    if (!incident.recoveryEmailSent) {
      await notificationService.publishNotification({
        eventType: 'INCIDENT_RECOVERED',
        organisationId,
        recipientRoles: ['MASTER'],
        includePrimaryMaster: incident.severity === 'P0' || incident.severity === 'P1',
        severity: 'INFO',
        priority: 'NORMAL',
        templateId: 'INCIDENT_RECOVERED',
        templateData: {
          incidentId: incident.incidentId,
          duration: `${durationMin} minutes`,
          affectedCafes: incident.affectedCafes.join(', ') || 'ALL',
          awaitOutboxProcessing: true,
        },
        idempotencyKey: `INCIDENT_RECOVERED_${incident.incidentId}`,
      });

      incident.recoveryEmailSent = true;
      await incident.save();
    }

    return incident;
  }
}

module.exports = { IncidentService };
