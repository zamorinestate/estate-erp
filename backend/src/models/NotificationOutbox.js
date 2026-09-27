'use strict';

/**
 * NOTIFICATION OUTBOX — MONGOOSE MODEL
 *
 * Durable outbox for email, in-app, and external notification delivery.
 * Ensures non-blocking business transactions (Gmail failure never fails ERP),
 * deterministic idempotency, exponential backoff with jitter, and dead-letter handling.
 */

const mongoose = require('mongoose');

const OUTBOX_STATUSES = [
  'DRAFT',
  'VALIDATION_REQUIRED',
  'APPROVAL_REQUIRED',
  'SCHEDULED',
  'QUEUED',
  'PROCESSING',
  'PROVIDER_ACCEPTED',
  'SENT',
  'RETRY',
  'RETRY_SCHEDULED',
  'SEND_STATE_UNKNOWN',
  'FAILED',
  'BOUNCE_DETECTED',
  'CANCELLED',
  'DEAD_LETTER',
  'SUPPRESSED',
  'QUARANTINED',
];

const SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'HIGH', 'CRITICAL'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', 'MANDATORY_SECURITY'];

const notificationOutboxSchema = new mongoose.Schema(
  {
    outboxId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },

    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: 'ZAMORIN',
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null,
      index: true,
    },

    correlationId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    attemptCount: {
      type: Number,
      default: 0,
    },

    processingAt: {
      type: Date,
      default: null,
      index: true,
    },

    lockedBy: {
      type: String,
      trim: true,
      maxlength: 160,
      default: null,
      index: true,
    },

    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },

    leaseVersion: {
      type: Number,
      default: 0,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    recipientUserId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null,
    },

    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },

    recipientName: {
      type: String,
      trim: true,
      default: '',
    },

    cc: [
      {
        email: { type: String, trim: true, lowercase: true },
        name: { type: String, trim: true, default: '' },
      },
    ],

    bcc: [
      {
        email: { type: String, trim: true, lowercase: true },
        name: { type: String, trim: true, default: '' },
      },
    ],

    recipientRole: {
      type: String,
      enum: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF', 'VENDOR', 'CUSTOMER', 'EXTERNAL_OPERATIONS'],
      default: 'STAFF',
    },

    templateId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    templateVersion: {
      type: Number,
      default: 1,
    },

    language: {
      type: String,
      trim: true,
      maxlength: 10,
      default: 'en',
    },

    subject: {
      type: String,
      trim: true,
      default: '',
    },

    renderedSubject: {
      type: String,
      trim: true,
      default: '',
    },

    renderedBody: {
      type: String,
      default: '',
    },

    renderedBodyPlain: {
      type: String,
      default: '',
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    severity: {
      type: String,
      enum: SEVERITIES,
      default: 'INFO',
    },

    priority: {
      type: String,
      enum: PRIORITIES,
      default: 'NORMAL',
    },

    channels: [
      {
        type: String,
        enum: ['EMAIL', 'IN_APP', 'WEBHOOK'],
        default: ['EMAIL'],
      },
    ],

    status: {
      type: String,
      enum: OUTBOX_STATUSES,
      default: 'QUEUED',
      index: true,
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    maxRetries: {
      type: Number,
      default: 5,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    attemptHistory: [
      {
        attemptNumber: { type: Number },
        attemptedAt: { type: Date, default: Date.now },
        resultStatus: { type: String },
        errorMessage: { type: String },
        providerResponseCode: { type: String },
      },
    ],

    providerMessageId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    providerThreadId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    deadLetterReason: {
      type: String,
      trim: true,
      default: null,
    },

    requiresApproval: {
      type: Boolean,
      default: false,
    },

    approvedByUserId: {
      type: String,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    scheduledFor: {
      type: Date,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },

    lastErrorCode: {
      type: String,
      default: null,
    },

    lastErrorSafeMessage: {
      type: String,
      default: null,
    },

    nextRetryAt: {
      type: Date,
      default: null,
    },

    providerDraftId: {
      type: String,
      default: null,
    },

    draftStatus: {
      type: String,
      default: 'NONE',
    },

    maxAttempts: {
      type: Number,
      default: 5,
    },

    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'notification_outbox',
  }
);

notificationOutboxSchema.index({ outboxId: 1 }, { unique: true });
notificationOutboxSchema.index({ organisationId: 1, status: 1, nextAttemptAt: 1 });
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 }, { name: 'outbox_dispatch_claim' });
notificationOutboxSchema.index({ organisationId: 1, correlationId: 1 });

const NotificationOutbox =
  mongoose.models.NotificationOutbox || mongoose.model('NotificationOutbox', notificationOutboxSchema);

module.exports = {
  NotificationOutbox,
  OUTBOX_STATUSES,
};
