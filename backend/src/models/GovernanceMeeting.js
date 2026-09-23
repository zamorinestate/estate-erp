'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — STAGE 15: GOVERNANCE MEETING MODEL
 * ============================================================================
 * Governs Board, Committee, Management, and Shareholder meetings with notice,
 * attendance, quorum checks, and cryptographically sealed minutes immutability.
 */

const GovernanceMeetingSchema = new mongoose.Schema(
  {
    meetingId: {
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
    meetingType: {
      type: String,
      enum: ['BOARD', 'COMMITTEE', 'MANAGEMENT', 'SHAREHOLDERS', 'INTERNAL_GOVERNANCE'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    noticeDate: {
      type: Date,
      required: true,
    },
    meetingDate: {
      type: Date,
      required: true,
      index: true,
    },
    venueOrPlatform: {
      type: String,
      default: 'REGISTERED_OFFICE / VIDEO_CONFERENCE',
    },
    quorumRequired: {
      type: Number,
      required: true,
      min: 1,
    },
    quorumMet: {
      type: Boolean,
      default: false,
    },
    attendees: [
      {
        personName: {
          type: String,
          required: true,
        },
        roleOrDesignation: {
          type: String,
          required: true,
        },
        attendanceStatus: {
          type: String,
          enum: ['PRESENT', 'VIDEO_CONFERENCE', 'LEAVE_OF_ABSENCE', 'ABSENT'],
          default: 'PRESENT',
        },
        isInterestedParty: {
          type: Boolean,
          default: false,
        },
      },
    ],
    agendaItems: [
      {
        itemNumber: Number,
        topic: String,
        presentedBy: String,
      },
    ],
    minutesText: {
      type: String,
      default: '',
    },
    minutesFinalized: {
      type: Boolean,
      default: false,
    },
    minutesFinalizedAt: {
      type: Date,
      default: null,
    },
    finalizedByUserId: {
      type: String,
      default: null,
    },
    immutableMinutesHash: {
      type: String,
      default: null, // SHA-256 seal once approved/signed
    },
    supportingAttachmentIds: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ['SCHEDULED', 'NOTICE_ISSUED', 'CONVENED', 'MINUTES_DRAFTED', 'MINUTES_APPROVED', 'CLOSED'],
      default: 'SCHEDULED',
      index: true,
    },
    createdByUserId: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

GovernanceMeetingSchema.index({ organisationId: 1, meetingId: 1 }, { unique: true });
GovernanceMeetingSchema.index({ organisationId: 1, meetingDate: -1 });

const GovernanceMeeting = mongoose.models.GovernanceMeeting || mongoose.model('GovernanceMeeting', GovernanceMeetingSchema);
GovernanceMeeting.GovernanceMeeting = GovernanceMeeting;
GovernanceMeeting.GovernanceMeetingSchema = GovernanceMeetingSchema;

module.exports = GovernanceMeeting;
