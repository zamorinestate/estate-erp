'use strict';

const mongoose = require('mongoose');

const SCHEDULED_JOB_EXECUTION_STATUSES = [
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
];

const scheduledJobExecutionSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    bucketKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: SCHEDULED_JOB_EXECUTION_STATUSES,
      default: 'RUNNING',
      index: true,
    },
    workerId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    attemptCount: {
      type: Number,
      min: 1,
      default: 1,
    },
    claimedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    leaseExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      min: 0,
      default: null,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastErrorCode: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    lastErrorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'scheduled_job_executions',
  }
);

scheduledJobExecutionSchema.index(
  { jobId: 1, bucketKey: 1 },
  { unique: true, name: 'scheduled_job_bucket_unique' }
);

scheduledJobExecutionSchema.index(
  { status: 1, leaseExpiresAt: 1 },
  { name: 'scheduled_job_lease_recovery' }
);

const ScheduledJobExecution =
  mongoose.models.ScheduledJobExecution ||
  mongoose.model('ScheduledJobExecution', scheduledJobExecutionSchema);

module.exports = {
  ScheduledJobExecution,
  SCHEDULED_JOB_EXECUTION_STATUSES,
};
