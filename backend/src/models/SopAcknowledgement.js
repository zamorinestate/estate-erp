'use strict';

const mongoose = require('mongoose');

const sopAcknowledgementSchema = new mongoose.Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    sopId: {
      type: String,
      required: true,
      index: true,
    },
    sopVersion: {
      type: Number,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      required: true,
    },
    cafeId: {
      type: String,
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    readAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['ASSIGNED', 'READ', 'ACKNOWLEDGED', 'OVERDUE'],
      default: 'ASSIGNED',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

sopAcknowledgementSchema.index(
  { organisationId: 1, sopId: 1, sopVersion: 1, userId: 1 },
  { unique: true }
);

const SopAcknowledgement = mongoose.model('SopAcknowledgement', sopAcknowledgementSchema);

module.exports = { SopAcknowledgement };
