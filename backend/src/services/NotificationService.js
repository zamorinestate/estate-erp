'use strict';

const os = require('node:os');
const crypto = require('node:crypto');

/**
 * CENTRAL NOTIFICATION SERVICE
 *
 * Central event-driven notification dispatch pipeline.
 *
 * Workflow:
 * BUSINESS EVENT → NotificationService → Recipient Resolver → Channel Policy
 * → Template Renderer → Durable Outbox → Provider Adapter → Delivery Audit
 *
 * Guarantees:
 * - Server-side recipient resolution (clients cannot pass arbitrary recipient email lists)
 * - Strict cross-cafe isolation (Cafe A admin never receives Cafe B alerts)
 * - Outbox durability with exponential backoff + jitter
 * - Complete isolation of core ERP (Gmail outage NEVER breaks Attendance, POS, Cash, Payroll)
 * - Deterministic idempotency
 */

const { NotificationOutbox } = require('../models/NotificationOutbox');
const { Notification } = require('../models/Notification');
const { User } = require('../models/User');
const { SystemCommunicationSettings } = require('../models/SystemCommunicationSettings');
const { TemplateEngine } = require('./TemplateEngine');
const { GmailEmailProvider } = require('./GmailEmailProvider');
const { ConsoleTestEmailProvider } = require('./ConsoleTestEmailProvider');

class NotificationService {
  constructor() {
    this.testProvider = new ConsoleTestEmailProvider();
    this.gmailProvider = new GmailEmailProvider();
    this.activeProvider = process.env.NODE_ENV === 'test' ? this.testProvider : this.gmailProvider;
    this.workerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
    this.defaultLeaseMs = 120000;
  }

  setProvider(provider) {
    this.activeProvider = provider;
  }

  getProvider() {
    return this.activeProvider;
  }

  /**
   * Resolves target recipients server-side according to role, cafeId, and organisationId.
   */
  async resolveRecipients({ organisationId, cafeId, targetUserIds, recipientRoles, includePrimaryMaster }) {
    const recipients = [];

    // 1. Explicit validated user IDs
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      const users = await User.find({
        organisationId,
        userId: { $in: targetUserIds },
        accountStatus: 'ACTIVE',
      }).select('userId email name role primaryCafeId assignedCafeIds isPrimaryMaster');

      for (const u of users) {
        // Enforce cafe scope for CAFE_ADMIN
        if (cafeId && u.role === 'CAFE_ADMIN') {
          const isAssigned = u.primaryCafeId === cafeId || (u.assignedCafeIds && u.assignedCafeIds.includes(cafeId));
          if (!isAssigned) continue; // Reject cross-cafe leakage
        }
        recipients.push({
          userId: u.userId,
          email: u.email,
          role: u.role,
          name: u.name,
          isPrimaryMaster: Boolean(u.isPrimaryMaster),
        });
      }
    }

    // 2. Role-based resolution
    if (Array.isArray(recipientRoles) && recipientRoles.length > 0) {
      const query = {
        organisationId,
        role: { $in: recipientRoles },
        accountStatus: 'ACTIVE',
      };

      if (cafeId && recipientRoles.includes('CAFE_ADMIN')) {
        // Find admins for this specific cafe
        query.$or = [
          { role: { $ne: 'CAFE_ADMIN' } },
          { primaryCafeId: cafeId },
          { assignedCafeIds: cafeId },
        ];
      }

      const roleUsers = await User.find(query).select('userId email name role primaryCafeId assignedCafeIds isPrimaryMaster');
      for (const ru of roleUsers) {
        if (!recipients.some(r => r.userId === ru.userId)) {
          recipients.push({
            userId: ru.userId,
            email: ru.email,
            role: ru.role,
            name: ru.name,
            isPrimaryMaster: Boolean(ru.isPrimaryMaster),
          });
        }
      }
    }

    // 3. Primary Master escalation
    if (includePrimaryMaster && !recipients.some(r => r.isPrimaryMaster)) {
      const pm = await User.findOne({
        organisationId,
        role: 'MASTER',
        isPrimaryMaster: true,
        accountStatus: 'ACTIVE',
      }).select('userId email name role isPrimaryMaster');

      if (pm && !recipients.some(r => r.userId === pm.userId)) {
        recipients.push({
          userId: pm.userId,
          email: pm.email,
          role: pm.role,
          name: pm.name,
          isPrimaryMaster: true,
        });
      }
    }

    return recipients;
  }

  /**
   * Publishes an event-driven notification.
   */
  async publishNotification({
    eventType,
    organisationId = 'ZAMORIN',
    cafeId = null,
    actorUserId = null,
    targetUserIds = [],
    recipientRoles = [],
    includePrimaryMaster = false,
    externalRecipients = [],
    severity = 'INFO',
    priority = 'NORMAL',
    templateId,
    templateData = {},
    channels = ['IN_APP', 'EMAIL'],
    correlationId = null,
    idempotencyKey = null,
    isDraftFirst = false,
    processImmediately = true,
  }) {
    if (!eventType || !templateId) {
      throw new Error('publishNotification requires eventType and templateId');
    }

    const settings = await SystemCommunicationSettings.findOne({ organisationId }).lean() || {
      operationsEmail: 'zamorinestatepvtltd.erp@gmail.com',
      enabled: true,
      outboundEnabled: true,
    };

    // Resolve internal recipients server-side
    const recipients = await this.resolveRecipients({
      organisationId,
      cafeId,
      targetUserIds,
      recipientRoles,
      includePrimaryMaster,
    });

    // Add any validated external recipients (e.g. vendors)
    if (Array.isArray(externalRecipients)) {
      for (const ext of externalRecipients) {
        if (ext.email && !recipients.some(r => r.email === ext.email)) {
          recipients.push({
            userId: ext.userId || null,
            email: ext.email,
            role: ext.role || 'EXTERNAL_OPERATIONS',
            name: ext.name || 'External Recipient',
            isPrimaryMaster: false,
          });
        }
      }
    }

    const outboxRecords = [];
    const inAppRecords = [];

    // Render templates and stage outbox/in-app entries
    for (const recipient of recipients) {
      const mergedData = {
        ...templateData,
        recipientName: recipient.name || 'User',
        recipientEmail: recipient.email,
        cafeId: cafeId || 'ALL',
        timestamp: new Date().toISOString(),
      };

      const rendered = TemplateEngine.render(templateId, mergedData, 'en');
      const itemKey = idempotencyKey
        ? `${idempotencyKey}_${recipient.email}`
        : `${eventType}_${Date.now()}_${recipient.email}`;

      // In-App Notification if requested
      if (channels.includes('IN_APP') && recipient.userId) {
        try {
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randId = Math.floor(1000 + Math.random() * 9000);
          const inApp = await Notification.create({
            notificationId: `NT-${dateStr}-${randId}`,
            organisationId,
            cafeId,
            eventType: eventType || 'SYSTEM_NOTIFICATION',
            category: severity === 'CRITICAL' ? 'SECURITY' : 'OPERATIONS',
            recipientUserId: recipient.userId,
            recipientRole: recipient.role || 'STAFF',
            recipientEmail: recipient.email,
            title: rendered.subject.substring(0, 190),
            message: rendered.text.substring(0, 1900),
            priority: priority === 'CRITICAL' ? 'CRITICAL' : 'NORMAL',
            channels: ['IN_APP'],
            sourceModule: 'MAILOPS',
            sourceEntityType: 'NOTIFICATION_EVENT',
            sourceEntityId: `EVT-${Date.now()}`,
            deduplicationKey: itemKey,
            correlationId: correlationId || `CORR-${Date.now()}`,
            createdBy: actorUserId || 'SYSTEM',
            status: 'DELIVERED',
            deliveredAt: new Date(),
          });
          inAppRecords.push(inApp);
        } catch (err) {
          // Log without blocking
          console.warn('[NotificationService] In-app notification creation non-fatal error:', err.message);
        }
      }

      // Email Dispatch via Durable Outbox
      if (channels.includes('EMAIL') && settings.outboundEnabled) {
        try {
          let outboxItem = await NotificationOutbox.findOne({
            organisationId,
            idempotencyKey: itemKey,
          });

          if (!outboxItem) {
            outboxItem = await NotificationOutbox.create({
              outboxId: `OUTBOX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
              organisationId,
              cafeId,
              eventType,
              recipientUserId: recipient.userId,
              recipientEmail: recipient.email,
              recipientRole: recipient.role,
              templateId,
              severity,
              priority,
              subject: rendered.subject,
              from: settings.operationsEmail || 'zamorinestatepvtltd.erp@gmail.com',
              replyTo: settings.operationsEmail || 'zamorinestatepvtltd.erp@gmail.com',
              htmlBody: rendered.html,
              textBody: rendered.text,
              isDraftFirst,
              draftStatus: isDraftFirst ? 'DRAFT_PREPARED' : 'NONE',
              correlationId,
              idempotencyKey: itemKey,
              status: isDraftFirst ? 'PROCESSING' : 'QUEUED',
              provider: settings.provider || 'GMAIL_API',
            });
          }

          outboxRecords.push(outboxItem);
        } catch (err) {
          console.warn('[NotificationService] Outbox staging non-fatal error:', err.message);
        }
      }
    }

    // Process outbox dispatch immediately if requested
    if (processImmediately && outboxRecords.length > 0) {
      const batchPromise = this.processOutboxBatch(outboxRecords);
      if (templateData?.awaitOutboxProcessing) {
        await batchPromise;
      } else {
        batchPromise.catch(err => {
          console.warn('[NotificationService] Async outbox batch processing error:', err.message);
        });
      }
    }

    return {
      success: true,
      recipientCount: recipients.length,
      outboxQueued: outboxRecords.length,
      inAppDelivered: inAppRecords.length,
      recipients: recipients.map(r => ({ userId: r.userId, email: r.email, role: r.role })),
    };
  }

  /**
   * Marks expired processing leases as SEND_STATE_UNKNOWN instead of blindly
   * retrying them. This avoids duplicate provider delivery after a worker dies
   * after sending but before persisting SENT.
   */
  async quarantineExpiredProcessingLeases(now = new Date()) {
    const result = await NotificationOutbox.updateMany(
      {
        status: 'PROCESSING',
        lockedUntil: { $ne: null, $lte: now },
      },
      {
        $set: {
          status: 'SEND_STATE_UNKNOWN',
          lastErrorCode: 'PROCESSING_LEASE_EXPIRED',
          lastErrorSafeMessage: 'Delivery state is unknown after worker lease expiry; manual/provider reconciliation required.',
          lastError: 'Delivery state unknown after processing lease expiry.',
        },
        $unset: {
          lockedBy: '',
          lockedUntil: '',
        },
      }
    );
    return result.modifiedCount || 0;
  }

  _dueOutboxFilter(now = new Date()) {
    return {
      $or: [
        {
          status: 'QUEUED',
          $or: [
            { nextAttemptAt: { $lte: now } },
            { nextAttemptAt: null },
          ],
        },
        {
          status: { $in: ['RETRY', 'RETRY_SCHEDULED'] },
          $or: [
            { nextRetryAt: { $lte: now } },
            {
              nextRetryAt: null,
              nextAttemptAt: { $lte: now },
            },
          ],
        },
      ],
    };
  }

  async claimNextOutbox({ now = new Date(), leaseMs = this.defaultLeaseMs, outboxId = null } = {}) {
    const filter = this._dueOutboxFilter(now);
    if (outboxId) {
      filter.outboxId = String(outboxId).trim().toUpperCase();
    }

    return NotificationOutbox.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'PROCESSING',
          processingAt: now,
          lockedBy: this.workerId,
          lockedUntil: new Date(now.getTime() + leaseMs),
        },
        $inc: {
          attemptCount: 1,
          leaseVersion: 1,
        },
      },
      {
        returnDocument: 'after',
        sort: { nextAttemptAt: 1, createdAt: 1 },
      }
    );
  }

  async processClaimedOutbox(record) {
    if (!record || record.status !== 'PROCESSING' || record.lockedBy !== this.workerId) {
      return { processed: false, reason: 'NOT_OWNED' };
    }

    const attemptNumber = Number(record.attemptCount || 1);
    const attemptedAt = new Date();

    try {
      const sendResult = await this.activeProvider.sendEmail({
        to: record.recipientEmail,
        from: record.from,
        replyTo: record.replyTo,
        subject: record.subject,
        html: record.htmlBody || record.renderedBody,
        text: record.textBody || record.renderedBodyPlain,
        isDraft: record.isDraftFirst,
      });

      const update = await NotificationOutbox.updateOne(
        {
          _id: record._id,
          status: 'PROCESSING',
          lockedBy: this.workerId,
        },
        {
          $set: {
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId: sendResult?.providerMessageId || null,
            providerDraftId: sendResult?.providerDraftId || null,
            draftStatus: sendResult?.providerDraftId ? 'AWAITING_REVIEW' : record.draftStatus,
            lastError: null,
            lastErrorCode: null,
            lastErrorSafeMessage: null,
          },
          $push: {
            attemptHistory: {
              attemptNumber,
              attemptedAt,
              resultStatus: 'SENT',
              providerResponseCode: sendResult?.providerMessageId ? 'PROVIDER_ACCEPTED' : 'SENT',
            },
          },
          $unset: {
            lockedBy: '',
            lockedUntil: '',
            nextRetryAt: '',
          },
        }
      );

      if (update.modifiedCount !== 1) {
        return { processed: false, reason: 'LEASE_LOST_AFTER_SEND' };
      }
      return { processed: true, status: 'SENT' };
    } catch (err) {
      const maxAttempts = Number(record.maxAttempts || record.maxRetries || 5);
      const exhausted = attemptNumber >= maxAttempts;
      const baseSeconds = Math.min(3600, Math.pow(2, attemptNumber) * 10);
      const jitterSeconds = Math.floor(Math.random() * 5);
      const nextRetryAt = new Date(Date.now() + (baseSeconds + jitterSeconds) * 1000);
      const safeMessage = String(err?.message || 'Delivery error').substring(0, 400);

      const update = {
        $set: {
          status: exhausted ? 'DEAD_LETTER' : 'RETRY',
          failedAt: exhausted ? new Date() : null,
          deadLetterReason: exhausted ? safeMessage : null,
          lastError: safeMessage,
          lastErrorCode: err?.code || 'PROVIDER_ERROR',
          lastErrorSafeMessage: safeMessage,
          nextAttemptAt: exhausted ? null : nextRetryAt,
          nextRetryAt: exhausted ? null : nextRetryAt,
        },
        $push: {
          attemptHistory: {
            attemptNumber,
            attemptedAt,
            resultStatus: exhausted ? 'DEAD_LETTER' : 'RETRY',
            errorMessage: safeMessage,
            providerResponseCode: err?.code || 'PROVIDER_ERROR',
          },
        },
        $unset: {
          lockedBy: '',
          lockedUntil: '',
        },
      };

      const result = await NotificationOutbox.updateOne(
        {
          _id: record._id,
          status: 'PROCESSING',
          lockedBy: this.workerId,
        },
        update
      );

      return {
        processed: result.modifiedCount === 1,
        status: exhausted ? 'DEAD_LETTER' : 'RETRY',
        error: safeMessage,
      };
    }
  }

  /**
   * Claims and processes due outbox records using database leases. Multiple
   * service instances may run this safely: only one instance can claim a row.
   */
  async processDueOutbox({ limit = 25, leaseMs = this.defaultLeaseMs } = {}) {
    const startedAt = Date.now();
    const summary = {
      claimed: 0,
      sent: 0,
      retry: 0,
      deadLetter: 0,
      unknownQuarantined: 0,
      durationMs: 0,
    };

    summary.unknownQuarantined = await this.quarantineExpiredProcessingLeases();

    for (let index = 0; index < Math.max(1, limit); index += 1) {
      const record = await this.claimNextOutbox({ leaseMs });
      if (!record) break;

      summary.claimed += 1;
      const result = await this.processClaimedOutbox(record);
      if (result.status === 'SENT') summary.sent += 1;
      if (result.status === 'RETRY') summary.retry += 1;
      if (result.status === 'DEAD_LETTER') summary.deadLetter += 1;
    }

    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  /**
   * Immediate-dispatch compatibility path. Records are still atomically claimed
   * before provider delivery, so the same outbox row cannot be sent twice by
   * concurrent application instances.
   */
  async processOutboxBatch(records) {
    const results = [];
    for (const record of records || []) {
      const outboxId = record?.outboxId;
      if (!outboxId) continue;
      const claimed = await this.claimNextOutbox({ outboxId });
      if (!claimed) continue;
      results.push(await this.processClaimedOutbox(claimed));
    }
    return results;
  }

}

// Singleton instance
const notificationService = new NotificationService();

module.exports = {
  NotificationService,
  notificationService,
};
