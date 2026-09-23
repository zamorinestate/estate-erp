'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 11: CUSTOMER COMPLAINT MODEL
 * ============================================================================
 * Governs structured customer complaint intake, triage, investigation, service recovery,
 * canonical refund reference, CAPA, food-safety escalation, and lifecycle tracking.
 */

const CustomerComplaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cafeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ['CAFE_IN_PERSON', 'PHONE', 'EMAIL', 'WEB', 'DELIVERY_PLATFORM', 'OTHER'],
      default: 'CAFE_IN_PERSON',
    },
    sourceReference: {
      type: String,
      trim: true,
      default: null,
    },
    complaintDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'FOOD_QUALITY',
        'HYGIENE',
        'SERVICE',
        'BILLING',
        'REFUND',
        'STAFF_CONDUCT',
        'DELIVERY',
        'ALLERGEN_SAFETY',
        'OTHER',
      ],
      default: 'FOOD_QUALITY',
      index: true,
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    customerId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: 'Guest',
    },
    customerContact: {
      type: String,
      trim: true,
      default: null,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: null,
    },
    customerEmail: {
      type: String,
      trim: true,
      default: null,
    },
    billId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    orderId: {
      type: String,
      trim: true,
      default: null,
    },
    menuItemId: {
      type: String,
      trim: true,
      default: null,
    },
    employeeId: {
      type: String,
      trim: true,
      default: null,
    },
    serviceArea: {
      type: String,
      trim: true,
      default: null,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    evidenceAttachmentIds: [
      {
        type: String,
        trim: true,
      },
    ],
    assignedOwnerId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'RECEIVED',
        'TRIAGED',
        'ASSIGNED',
        'INVESTIGATING',
        'ACTIONED',
        'CUSTOMER_RESPONSE',
        'RESOLVED',
        'CLOSED',
        'REOPENED',
      ],
      default: 'RECEIVED',
      index: true,
    },
    slaTargetDate: {
      type: Date,
      default: null,
    },
    investigationNotes: {
      type: String,
      default: '',
    },
    rootCause: {
      type: String,
      default: '',
    },
    rootCauseConfirmed: {
      type: Boolean,
      default: false,
    },
    serviceRecovery: {
      remedyType: {
        type: String,
        enum: ['NONE', 'APOLOGY_ONLY', 'REPLACEMENT', 'AUTHORISED_REFUND', 'VOUCHER_CREDIT', 'OTHER'],
        default: 'NONE',
      },
      remedyNotes: {
        type: String,
        default: '',
      },
      refundReference: {
        type: String,
        default: null,
      },
      refundAmount: {
        type: Number,
        default: 0,
      },
      actionDate: {
        type: Date,
        default: null,
      },
      actionByUserId: {
        type: String,
        default: null,
      },
    },
    foodSafetyEscalation: {
      isEscalated: {
        type: Boolean,
        default: false,
      },
      foodSafetyIncidentId: {
        type: String,
        default: null,
      },
      escalatedAt: {
        type: Date,
        default: null,
      },
      escalationReason: {
        type: String,
        default: '',
      },
    },
    capaId: {
      type: String,
      trim: true,
      default: null,
    },
    communicationLog: [
      {
        direction: {
          type: String,
          enum: ['INBOUND', 'OUTBOUND'],
          default: 'OUTBOUND',
        },
        channel: {
          type: String,
          default: 'PHONE',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        senderRecipientRole: {
          type: String,
          default: 'STAFF',
        },
        messageSummary: {
          type: String,
          default: '',
        },
        status: {
          type: String,
          default: 'LOGGED',
        },
      },
    ],
    deliveryPlatformDetails: {
      platformName: {
        type: String,
        default: null,
      },
      platformOrderId: {
        type: String,
        default: null,
      },
      platformComplaintRef: {
        type: String,
        default: null,
      },
      platformResolutionStatus: {
        type: String,
        default: null,
      },
    },
    reopenHistory: [
      {
        reopenedAt: {
          type: Date,
          default: Date.now,
        },
        reopenedByUserId: {
          type: String,
          default: null,
        },
        reason: {
          type: String,
          default: '',
        },
      },
    ],
    resolutionDate: {
      type: Date,
      default: null,
    },
    closureReason: {
      type: String,
      default: '',
    },
    privacyClassification: {
      type: String,
      default: 'CONFIDENTIAL',
    },
    createdByUserId: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
  }
);

CustomerComplaintSchema.index({ organisationId: 1, complaintId: 1 }, { unique: true });
CustomerComplaintSchema.index({ organisationId: 1, cafeId: 1, status: 1 });
CustomerComplaintSchema.index({ organisationId: 1, category: 1, complaintDate: -1 });

const CustomerComplaint = mongoose.model('CustomerComplaint', CustomerComplaintSchema);

module.exports = CustomerComplaint;
module.exports.CustomerComplaint = CustomerComplaint;
module.exports.CustomerComplaintSchema = CustomerComplaintSchema;
