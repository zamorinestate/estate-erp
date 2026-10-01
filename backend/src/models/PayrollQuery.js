'use strict';

const mongoose = require('mongoose');

const PAYROLL_QUERY_CATEGORIES = [
  'OVERTIME_DISCREPANCY',
  'ATTENDANCE_MISMATCH',
  'TAX_DEDUCTION',
  'LOAN_RECOVERY',
  'GENERAL_SALARY',
  'OTHER',
];

const PAYROLL_QUERY_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED',
  'CLOSED',
];

const payrollQuerySchema = new mongoose.Schema(
  {
    queryId: {
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
      trim: true,
      uppercase: true,
      index: true,
    },
    employeeUserId: {
      type: String,
      required: true,
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
    employeeName: {
      type: String,
      trim: true,
      default: '',
    },
    payslipId: {
      type: String,
      trim: true,
      default: null,
    },
    periodKey: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      enum: PAYROLL_QUERY_CATEGORIES,
      default: 'GENERAL_SALARY',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: PAYROLL_QUERY_STATUSES,
      default: 'SUBMITTED',
      index: true,
    },
    assignedToUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    reviewerUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    resolution: {
      type: String,
      trim: true,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'payroll_queries',
  }
);

payrollQuerySchema.index({ organisationId: 1, employeeUserId: 1, createdAt: -1 });
payrollQuerySchema.index({ organisationId: 1, cafeId: 1, status: 1, createdAt: -1 });
payrollQuerySchema.index({ organisationId: 1, status: 1 });

const PayrollQuery =
  mongoose.models.PayrollQuery ||
  mongoose.model('PayrollQuery', payrollQuerySchema);

module.exports = {
  PayrollQuery,
  PAYROLL_QUERY_CATEGORIES,
  PAYROLL_QUERY_STATUSES,
};
