'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — MASTER DATA DOMAIN CATALOGUE (STAGE 10)
 * ============================================================================
 * Declares the 14 authoritative master data domains and their canonical models of record.
 * Strict Invariant: Zero duplicate operational master database.
 */

const mongoose = require('mongoose');

const MASTER_DOMAINS = [
  'ORGANISATION',
  'CAFE',
  'EMPLOYEE',
  'SUPPLIER',
  'INGREDIENT',
  'INVENTORY_ITEM',
  'SKU',
  'RECIPE',
  'MENU_ITEM',
  'UNIT_OF_MEASURE',
  'TAX_CODE',
  'EXPENSE_CATEGORY',
  'ASSET',
  'CONTRACT_COUNTERPARTY',
];

const masterDataDomainCatalogueSchema = new mongoose.Schema(
  {
    domainCode: {
      type: String,
      enum: MASTER_DOMAINS,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    domainName: {
      type: String,
      required: true,
      trim: true,
    },
    canonicalModel: {
      type: String,
      required: true,
      trim: true, // e.g. 'Vendor', 'Employee', 'Asset', 'GlobalInventoryItem'
    },
    businessOwnerRole: {
      type: String,
      required: true,
      trim: true,
    },
    dataStewardRole: {
      type: String,
      required: true,
      trim: true,
    },
    uniquenessField: {
      type: String,
      required: true,
      trim: true,
    },
    sensitiveFields: [
      {
        type: String,
        trim: true,
      },
    ],
    qualityRuleSummary: {
      type: String,
      trim: true,
      default: 'Completeness (mandatory fields present), Uniqueness (primary key unique), Validity (regex check).',
    },
  },
  {
    timestamps: true,
    collection: 'master_data_domain_catalogues',
  }
);

const MasterDataDomainCatalogue =
  mongoose.models.MasterDataDomainCatalogue ||
  mongoose.model('MasterDataDomainCatalogue', masterDataDomainCatalogueSchema);

module.exports = {
  MasterDataDomainCatalogue,
  MASTER_DOMAINS,
};
