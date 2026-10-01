'use strict';

/**
 * SUPPORT CASE — MONGOOSE MODEL
 *
 * Tracks support, UAT feedback, and issue reports received via:
 * 1. Inbound operations email (zamorinestatepvtltd.erp@gmail.com)
 * 2. In-app 'Report a Problem' workflow
 *
 * Keeps email thread IDs linked so follow-up replies update the same case.
 */

const mongoose = require('mongoose');

const SUPPORT_CATEGORIES = [
  'UAT_FEEDBACK',
  'BUG_REPORT',
  'POS_ISSUE',
  'ATTENDANCE_ISSUE',
  'INVENTORY_ISSUE',
  'DEVICE_ISSUE',
  'BILLING_QUERY',
  'USER_ACCESS',
  'GENERAL_INQUIRY',
];

const SUPPORT_SEVERITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const SUPPORT_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'WAITING_INTERNAL',
  'WAITING_EXTERNAL',
  'WAITING_FOR_EMPLOYEE',
  'RESOLVED',
  'CLOSED',
];

const supportCaseSchema = new mongoose.Schema(
  {
    caseId: {
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
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null,
    },

    category: {
      type: String,
      enum: SUPPORT_CATEGORIES,
      default: 'GENERAL_INQUIRY',
    },

    severity: {
      type: String,
      enum: SUPPORT_SEVERITIES,
      default: 'NORMAL',
    },

    status: {
      type: String,
      enum: SUPPORT_STATUSES,
      default: 'OPEN',
    },

    source: {
      type: String,
      enum: ['EMAIL', 'IN_APP', 'MANUAL'],
      default: 'EMAIL',
    },

    reportedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null,
    },

    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },

    gmailThreadId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    gmailMessageId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    correlationId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    assignedToUserId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null,
    },

    appVersion: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },

    deviceClass: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    resolutionSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    responses: [
      {
        responseId: {
          type: String,
          required: true,
        },
        authorUserId: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
        },
        authorRole: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
          maxlength: 5000,
        },
        visibility: {
          type: String,
          enum: ['PUBLIC', 'INTERNAL'],
          default: 'PUBLIC',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'support_cases',
  }
);

supportCaseSchema.index({ organisationId: 1, caseId: 1 }, { unique: true });
supportCaseSchema.index({ organisationId: 1, status: 1 });
supportCaseSchema.index({ organisationId: 1, cafeId: 1, status: 1 });
supportCaseSchema.index({ organisationId: 1, gmailThreadId: 1 });
supportCaseSchema.index({ senderEmail: 1, createdAt: -1 });

const SupportCase = mongoose.model('SupportCase', supportCaseSchema);

module.exports = {
  SupportCase,
  SUPPORT_CATEGORIES,
  SUPPORT_SEVERITIES,
  SUPPORT_STATUSES,
};
