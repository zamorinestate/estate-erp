'use strict';

const mongoose = require('mongoose');

const packagingRuleSchema = new mongoose.Schema(
  {
    serviceMode: {
      type: String,
      enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'COUNTER_SALE'],
      required: true,
      default: 'TAKEAWAY',
    },
    packagingItemId: {
      type: String,
      trim: true,
      default: '',
    },
    packagingItemName: {
      type: String,
      trim: true,
      default: '',
    },
    defaultQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

const cafeTemplateSchema = new mongoose.Schema(
  {
    templateId: {
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    establishmentCategory: {
      type: String,
      trim: true,
      default: 'Café',
    },
    businessDayCutoffHour: {
      type: Number,
      default: 4,
      min: 0,
      max: 12,
    },
    defaultOpeningTime: {
      type: String,
      default: '07:00',
    },
    defaultClosingTime: {
      type: String,
      default: '23:00',
    },
    receiptConfig: {
      footerText: {
        type: String,
        default: 'Thank you for visiting Zamorin Café! Please visit again.',
      },
      printLogo: {
        type: Boolean,
        default: true,
      },
      showGstBreakup: {
        type: Boolean,
        default: true,
      },
    },
    approvalLimits: {
      poApprovalThresholdPaisa: {
        type: Number,
        default: 500000, // ₹5,000
      },
      expenseApprovalThresholdPaisa: {
        type: Number,
        default: 250000, // ₹2,500
      },
    },
    packagingRules: [packagingRuleSchema],
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdByUserId: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'cafe_templates',
  }
);

cafeTemplateSchema.index({ organisationId: 1, name: 1 });

module.exports = mongoose.model('CafeTemplate', cafeTemplateSchema);
