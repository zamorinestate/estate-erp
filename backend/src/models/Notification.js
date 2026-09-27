'use strict';

const mongoose = require('mongoose');

const NOTIFICATION_CHANNELS = [
  'IN_APP',
  'TOAST',
  'POPUP',
  'BROWSER',
  'PUSH',
  'EMAIL',
  'SMS',
  'WHATSAPP',
];

const NOTIFICATION_PRIORITIES = [
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL',
];

const NOTIFICATION_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
];

const DELIVERY_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'SKIPPED',
];

const RECIPIENT_ROLES = [
  'MASTER',
  'OWNER',
  'CAFE_ADMIN',
  'STAFF',
  'VENDOR',
];

const deliveryAttemptSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      required: true,
      enum: NOTIFICATION_CHANNELS,
    },

    status: {
      type: String,
      required: true,
      enum: DELIVERY_STATUSES,
      default: 'PENDING',
    },

    attemptNumber: {
      type: Number,
      min: 1,
      default: 1,
    },

    providerMessageId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

    attemptedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    nextRetryAt: {
      type: Date,
      default: null,
    },

    errorCode: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    _id: true,
    timestamps: true,
  }
);

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^NT-\d{8}-\d{4,}$/,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 150,
      index: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },

    recipientUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    recipientRole: {
      type: String,
      required: true,
      immutable: true,
      enum: RECIPIENT_ROLES,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    sensitivePreview: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

    containsSensitiveData: {
      type: Boolean,
      default: false,
    },

    priority: {
      type: String,
      required: true,
      enum: NOTIFICATION_PRIORITIES,
      default: 'NORMAL',
      index: true,
    },

    channels: [
      {
        type: String,
        enum: NOTIFICATION_CHANNELS,
      },
    ],

    popupRequired: {
      type: Boolean,
      default: false,
    },

    acknowledgementRequired: {
      type: Boolean,
      default: false,
    },

    mandatory: {
      type: Boolean,
      default: false,
    },

    deepLink: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    sourceModule: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },

    sourceEntityType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    sourceEntityId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 150,
      index: true,
    },

    deduplicationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 300,
    },

    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 150,
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: NOTIFICATION_STATUSES,
      default: 'PENDING',
      index: true,
    },

    deliveryAttempts: {
      type: [deliveryAttemptSchema],
      default: [],
    },

    queuedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    firstViewedAt: {
      type: Date,
      default: null,
    },

    readAt: {
      type: Date,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    actionedAt: {
      type: Date,
      default: null,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },

    actionMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    createdBy: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
    collection: 'notifications',
  }
);

notificationSchema.index(
  {
    organisationId: 1,
    recipientUserId: 1,
    readAt: 1,
    createdAt: -1,
  },
  {
    name: 'recipient_unread_created',
  }
);

notificationSchema.index(
  {
    organisationId: 1,
    recipientUserId: 1,
    priority: 1,
    createdAt: -1,
  },
  {
    name: 'recipient_priority_created',
  }
);

notificationSchema.index(
  {
    organisationId: 1,
    recipientRole: 1,
    cafeId: 1,
    createdAt: -1,
  },
  {
    name: 'role_cafe_created',
  }
);

notificationSchema.index(
  {
    organisationId: 1,
    recipientUserId: 1,
    deduplicationKey: 1,
  },
  {
    unique: true,
    name: 'recipient_deduplication_unique',
  }
);

notificationSchema.index(
  {
    status: 1,
    scheduledFor: 1,
    createdAt: 1,
  },
  {
    name: 'dispatch_queue',
  }
);

notificationSchema.pre(
  'validate',
  function normalizeNotificationFields() {
    if (this.notificationId) {
      this.notificationId =
        this.notificationId.trim().toUpperCase();
    }

    if (this.organisationId) {
      this.organisationId =
        this.organisationId.trim().toUpperCase();
    }

    if (this.cafeId) {
      this.cafeId = this.cafeId.trim().toUpperCase();
    }

    if (this.recipientUserId) {
      this.recipientUserId =
        this.recipientUserId.trim().toUpperCase();
    }

    if (this.eventType) {
      this.eventType =
        this.eventType.trim().toUpperCase();
    }

    if (this.category) {
      this.category =
        this.category.trim().toUpperCase();
    }

    if (this.sourceModule) {
      this.sourceModule =
        this.sourceModule.trim().toUpperCase();
    }

    if (this.sourceEntityType) {
      this.sourceEntityType =
        this.sourceEntityType.trim().toUpperCase();
    }

    if (this.sourceEntityId) {
      this.sourceEntityId =
        this.sourceEntityId.trim().toUpperCase();
    }

    if (Array.isArray(this.channels)) {
      this.channels = [...new Set(this.channels)];
    }

    if (
      this.priority === 'CRITICAL' &&
      !this.popupRequired
    ) {
      this.popupRequired = true;
    }
  }
);

notificationSchema.methods.markViewed =
  async function markViewed() {
    if (!this.firstViewedAt) {
      this.firstViewedAt = new Date();
    }

    return this.save();
  };

notificationSchema.methods.markRead =
  async function markRead() {
    if (!this.firstViewedAt) {
      this.firstViewedAt = new Date();
    }

    if (!this.readAt) {
      this.readAt = new Date();
    }

    return this.save();
  };

notificationSchema.methods.markUnread =
  async function markUnread() {
    this.readAt = null;
    return this.save();
  };

notificationSchema.methods.acknowledge =
  async function acknowledge() {
    if (!this.acknowledgementRequired) {
      throw new Error(
        'This notification does not require acknowledgement.'
      );
    }

    if (!this.readAt) {
      this.readAt = new Date();
    }

    this.acknowledgedAt = new Date();

    return this.save();
  };

notificationSchema.methods.markActioned =
  async function markActioned() {
    if (!this.readAt) {
      this.readAt = new Date();
    }

    this.actionedAt = new Date();

    return this.save();
  };

notificationSchema.methods.archive =
  async function archive() {
    this.archivedAt = new Date();
    return this.save();
  };

notificationSchema.pre('validate', function preValidateNotification() {
  if (!this.correlationId) {
    this.correlationId = this.notificationId;
  }
  if (!this.sourceModule) {
    this.sourceModule = 'SYSTEM';
  }
  if (!this.sourceEntityType) {
    this.sourceEntityType = 'SYSTEM_NOTIFICATION';
  }
  if (!this.sourceEntityId) {
    this.sourceEntityId = this.notificationId;
  }
  if (!this.deduplicationKey) {
    this.deduplicationKey = `${this.recipientUserId || 'USER'}:${this.eventType || 'EVENT'}:${this.sourceEntityId}`;
  }
});

const Notification =
  mongoose.models.Notification ||
  mongoose.model(
    'Notification',
    notificationSchema
  );

module.exports = {
  Notification,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  DELIVERY_STATUSES,
  RECIPIENT_ROLES,
};