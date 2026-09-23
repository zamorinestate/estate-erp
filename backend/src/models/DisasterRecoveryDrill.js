'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — DISASTER RECOVERY DRILL MODEL (STAGE 09)
 * ============================================================================
 * Governed DR drill lifecycle:
 * PLANNED -> APPROVED -> EXECUTED -> RESULTS_RECORDED -> ACTIONS_ASSIGNED -> VERIFIED -> CLOSED
 *
 * CRITICAL INVARIANTS:
 * - A planned drill is never auto-marked executed.
 * - Simulation != Real Provider Restore. Provider verification requires actual proof.
 * - RTO/RPO targets are targets until proven by executed drill evidence.
 */

const mongoose = require('mongoose');

const DRILL_STATUSES = [
  'PLANNED',
  'APPROVED',
  'EXECUTED',
  'RESULTS_RECORDED',
  'ACTIONS_ASSIGNED',
  'VERIFIED',
  'CLOSED',
];

const ALLOWED_DRILL_TRANSITIONS = {
  PLANNED: ['APPROVED'],
  APPROVED: ['EXECUTED'],
  EXECUTED: ['RESULTS_RECORDED'],
  RESULTS_RECORDED: ['ACTIONS_ASSIGNED', 'VERIFIED'],
  ACTIONS_ASSIGNED: ['VERIFIED'],
  VERIFIED: ['CLOSED'],
  CLOSED: [],
};

const SCENARIO_TYPES = [
  'INTERNET_OUTAGE',
  'DATABASE_OUTAGE',
  'REDIS_OUTAGE',
  'DOCUMENT_STORAGE_OUTAGE',
  'CAFE_POWER_OUTAGE',
  'TERMINAL_FAILURE',
  'RANSOMWARE_ISOLATION',
];

const disasterRecoveryDrillSchema = new mongoose.Schema(
  {
    drillId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    scenarioType: {
      type: String,
      enum: SCENARIO_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: DRILL_STATUSES,
      default: 'PLANNED',
      index: true,
    },
    scope: {
      type: String,
      required: true,
      trim: true,
    },
    targetRtoMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    observedRtoMinutes: {
      type: Number,
      default: null,
    },
    targetRpoMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    observedRpoMinutes: {
      type: Number,
      default: null,
    },
    isSimulation: {
      type: Boolean,
      default: true,
    },
    isProviderVerified: {
      type: Boolean,
      default: false,
    },
    providerEvidenceStatus: {
      type: String,
      enum: ['SIMULATION_ONLY', 'PENDING_PROVIDER_PROOF', 'PROVIDER_VERIFIED'],
      default: 'SIMULATION_ONLY',
    },
    drillLeadUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    findings: [
      {
        issueDescription: { type: String, trim: true },
        severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
        correctiveAction: { type: String, trim: true },
        remediationOwner: { type: String, trim: true },
      },
    ],
    closureNotes: {
      type: String,
      trim: true,
      default: '',
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        fromStatus: { type: String, default: null },
        toStatus: { type: String, default: null },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'disaster_recovery_drills',
  }
);

disasterRecoveryDrillSchema.index({ organisationId: 1, status: 1 });

const DisasterRecoveryDrill =
  mongoose.models.DisasterRecoveryDrill ||
  mongoose.model('DisasterRecoveryDrill', disasterRecoveryDrillSchema);

module.exports = {
  DisasterRecoveryDrill,
  DRILL_STATUSES,
  ALLOWED_DRILL_TRANSITIONS,
  SCENARIO_TYPES,
};
