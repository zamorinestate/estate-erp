'use strict';

const mongoose = require('mongoose');

const CASH_TRANSACTION_TYPES = [
  'OPENING_BALANCE',
  'CASH_IN',
  'CASH_OUT',
  'PAID_IN',
  'PAID_OUT',
  'BANK_DEPOSIT',
  'CASH_TRANSFER_IN',
  'CASH_TRANSFER_OUT',
  'CLOSING_ADJUSTMENT',
];

const CASH_TRANSACTION_STATUSES = [
  'DRAFT',
  'POSTED',
  'REVERSED',
];

const cashTransactionSchema =
  new mongoose.Schema(
    {
      cashTransactionId: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
        uppercase: true,
        match: /^CT-\d{8}-\d{4,}$/,
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
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      businessDate: {
        type: String,
        required: true,
        immutable: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
        index: true,
      },

      transactionType: {
        type: String,
        required: true,
        enum: CASH_TRANSACTION_TYPES,
        index: true,
      },

      direction: {
        type: String,
        required: true,
        enum: ['IN', 'OUT'],
        index: true,
      },

      category: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        maxlength: 120,
        index: true,
      },

      amount: {
        type: Number,
        required: true,
        min: 0.01,
      },

      amountPaisa: {
        type: Number,
        default: function () {
          return this.amount ? Math.round(this.amount * 100) : 0;
        },
      },

      currency: {
        type: String,
        immutable: true,
        enum: ['INR'],
        default: 'INR',
      },

      paymentMethod: {
        type: String,
        enum: [
          'CASH',
          'CARD',
          'UPI',
          'BANK_TRANSFER',
          'WALLET',
          'CREDIT',
        ],
        default: 'CASH',
      },

      referenceType: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 100,
        default: null,
      },

      referenceId: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 150,
        default: null,
      },

      referenceNumber: {
        type: String,
        trim: true,
        maxlength: 150,
        default: null,
        index: true,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: '',
      },

      notes: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: '',
      },

      status: {
        type: String,
        required: true,
        enum: CASH_TRANSACTION_STATUSES,
        default: 'POSTED',
        index: true,
      },

      recordedAt: {
        type: Date,
        required: true,
        immutable: true,
        default: Date.now,
        index: true,
      },

      recordedBy: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
      },

      approvedAt: {
        type: Date,
        default: null,
      },

      approvedBy: {
        type: String,
        trim: true,
        uppercase: true,
        default: null,
      },

      reversedAt: {
        type: Date,
        default: null,
      },

      reversedBy: {
        type: String,
        trim: true,
        uppercase: true,
        default: null,
      },

      reversalReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: '',
      },

      reversalTransactionId: {
        type: String,
        trim: true,
        uppercase: true,
        default: null,
      },

      timezone: {
        type: String,
        immutable: true,
        default: 'Asia/Kolkata',
      },

      createdBy: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
      },

      updatedBy: {
        type: String,
        trim: true,
        uppercase: true,
        default: null,
      },
    },
    {
      timestamps: true,
      optimisticConcurrency: true,
      versionKey: 'version',
      collection: 'cash_transactions',
    }
  );

cashTransactionSchema.index(
  {
    organisationId: 1,
    cafeId: 1,
    businessDate: 1,
    status: 1,
  },
  {
    name: 'cafe_business_date_status',
  }
);

cashTransactionSchema.index(
  {
    organisationId: 1,
    cafeId: 1,
    transactionType: 1,
    recordedAt: -1,
  },
  {
    name: 'cafe_type_recorded',
  }
);

cashTransactionSchema.index(
  {
    organisationId: 1,
    referenceType: 1,
    referenceId: 1,
  },
  {
    name: 'cash_reference_lookup',
  }
);

cashTransactionSchema.pre(
  'validate',
  function normalizeCashTransactionFields() {
    const identifierFields = [
      'cashTransactionId',
      'organisationId',
      'cafeId',
      'category',
      'referenceType',
      'referenceId',
      'recordedBy',
      'approvedBy',
      'reversedBy',
      'reversalTransactionId',
      'createdBy',
      'updatedBy',
    ];

    identifierFields.forEach((field) => {
      if (this[field]) {
        this[field] = this[field]
          .trim()
          .toUpperCase();
      }
    });

    const inwardTypes = [
      'OPENING_BALANCE',
      'CASH_IN',
      'PAID_IN',
      'CASH_TRANSFER_IN',
    ];

    const outwardTypes = [
      'CASH_OUT',
      'PAID_OUT',
      'BANK_DEPOSIT',
      'CASH_TRANSFER_OUT',
    ];

    if (
      inwardTypes.includes(
        this.transactionType
      )
    ) {
      this.direction = 'IN';
    }

    if (
      outwardTypes.includes(
        this.transactionType
      )
    ) {
      this.direction = 'OUT';
    }
  }
);

cashTransactionSchema.methods.reverse =
  async function reverse({
    userId,
    reason,
    reversalTransactionId = null,
  }) {
    if (this.status === 'REVERSED') {
      return this;
    }

    if (!userId || !reason) {
      throw new Error(
        'Reversal requires a user ID and reason.'
      );
    }

    this.status = 'REVERSED';
    this.reversedAt = new Date();
    this.reversedBy = userId
      .trim()
      .toUpperCase();
    this.reversalReason = reason.trim();

    if (reversalTransactionId) {
      this.reversalTransactionId =
        reversalTransactionId
          .trim()
          .toUpperCase();
    }

    this.updatedBy = userId
      .trim()
      .toUpperCase();

    return this.save();
  };

const CashTransaction =
  mongoose.models.CashTransaction ||
  mongoose.model(
    'CashTransaction',
    cashTransactionSchema
  );

module.exports = {
  CashTransaction,
  CASH_TRANSACTION_TYPES,
  CASH_TRANSACTION_STATUSES,
};