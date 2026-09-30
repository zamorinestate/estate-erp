'use strict';

const mongoose = require('mongoose');

const AUDIT_RESULTS = [
  'SUCCESS',
  'FAILURE',
  'DENIED',
  'PARTIAL',
];

const RISK_CLASSIFICATIONS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

const AUDIT_ACTOR_ROLES = [
  'MASTER',
  'OWNER',
  'CAFE_ADMIN',
  'CAFE_OPS',
  'STAFF',
  'VENDOR',
  'DEVICE',
  'SYSTEM',
];

const auditEventSchema = new mongoose.Schema(
  {
    auditEventId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^AE-\d{8}-\d{4,}$/,
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
      immutable: true,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    actorUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    actorRole: {
      type: String,
      required: true,
      immutable: true,
      enum: AUDIT_ACTOR_ROLES,
      index: true,
    },

    module: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },

    action: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },

    entityId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 150,
      index: true,
    },

    before: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
      default: null,
    },

    after: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
      default: null,
    },

    reason: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    result: {
      type: String,
      required: true,
      immutable: true,
      enum: AUDIT_RESULTS,
      default: 'SUCCESS',
      index: true,
    },

    riskClassification: {
      type: String,
      required: true,
      immutable: true,
      enum: RISK_CLASSIFICATIONS,
      default: 'LOW',
      index: true,
    },

    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 150,
      index: true,
    },

    sessionId: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 200,
      default: null,
    },

    requestMethod: {
      type: String,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
      default: null,
    },

    requestPath: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 500,
      default: null,
    },

    device: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 300,
      default: null,
    },

    ipAddressMasked: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 100,
      default: null,
    },

    userAgent: {
      type: String,
      immutable: true,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    serverTimestamp: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
      default: {},
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    versionKey: false,
    collection: 'audit_events',
  }
);

auditEventSchema.index(
  {
    organisationId: 1,
    serverTimestamp: -1,
  },
  {
    name: 'organisation_timestamp',
  }
);

auditEventSchema.index(
  {
    organisationId: 1,
    cafeId: 1,
    serverTimestamp: -1,
  },
  {
    name: 'organisation_cafe_timestamp',
  }
);

auditEventSchema.index(
  {
    organisationId: 1,
    actorUserId: 1,
    serverTimestamp: -1,
  },
  {
    name: 'organisation_actor_timestamp',
  }
);

auditEventSchema.index(
  {
    organisationId: 1,
    module: 1,
    action: 1,
    serverTimestamp: -1,
  },
  {
    name: 'organisation_module_action_timestamp',
  }
);

auditEventSchema.index(
  {
    organisationId: 1,
    entityType: 1,
    entityId: 1,
    serverTimestamp: -1,
  },
  {
    name: 'organisation_entity_history',
  }
);

auditEventSchema.pre('validate', function normalizeAuditFields() {
  if (this.auditEventId) {
    this.auditEventId =
      this.auditEventId.trim().toUpperCase();
  }

  if (this.organisationId) {
    this.organisationId =
      this.organisationId.trim().toUpperCase();
  }

  if (this.cafeId) {
    this.cafeId = this.cafeId.trim().toUpperCase();
  }

  if (this.actorUserId) {
    this.actorUserId =
      this.actorUserId.trim().toUpperCase();
  }

  if (this.module) {
    this.module = this.module.trim().toUpperCase();
  }

  if (this.action) {
    this.action = this.action.trim().toUpperCase();
  }

  if (this.entityType) {
    this.entityType =
      this.entityType.trim().toUpperCase();
  }

  if (this.entityId) {
    this.entityId =
      this.entityId.trim().toUpperCase();
  }
});

const blockedOperations = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

blockedOperations.forEach((operation) => {
  auditEventSchema.pre(operation, function blockAuditMutation() {
    throw new Error(
      'Audit events are immutable and cannot be changed or deleted.'
    );
  });
});

// Block document-instance deleteOne (doc.deleteOne())
auditEventSchema.pre('deleteOne', { document: true, query: false }, function blockDocDeleteOne() {
  throw new Error(
    'Audit events are immutable and cannot be deleted via document instance.'
  );
});

// Block save() on modified (existing) documents — insert-only guard
auditEventSchema.pre('save', function blockAuditUpdate() {
  if (!this.isNew) {
    throw new Error(
      'Audit events are immutable. save() is only allowed for new insertions.'
    );
  }
});

// Block bulkWrite mutations — iterate ops and reject any update/delete/replace
auditEventSchema.pre('bulkWrite', function blockBulkWriteMutation(next) {
  const ops = this.getOptions?.()?.ops || [];
  for (const op of ops) {
    const opKey = Object.keys(op)[0];
    if (['updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne'].includes(opKey)) {
      throw new Error(
        'Audit events are immutable. bulkWrite mutation operations are not permitted.'
      );
    }
  }
  if (typeof next === 'function') next();
});

const AuditEvent =
  mongoose.models.AuditEvent ||
  mongoose.model('AuditEvent', auditEventSchema);

module.exports = {
  AuditEvent,
  AUDIT_RESULTS,
  RISK_CLASSIFICATIONS,
  AUDIT_ACTOR_ROLES,
};