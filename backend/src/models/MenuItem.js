'use strict';

/**
 * MENU ITEM — MONGOOSE MODEL (SCR-013)
 *
 * Authoritative Global Menu Item Master for Zamorin Cafe ERP.
 * Supports multi-concept offerings (Café, Restaurant, Shared), PLU indexing,
 * course classification, tax profile references, dietary & allergen metadata,
 * packaging requirement references, and pricing history.
 */

const mongoose = require('mongoose');

const MENU_CATEGORIES = [
  'COFFEE',
  'TEA',
  'BEVERAGES_OTHER',
  'BAKERY',
  'SNACKS',
  'STARTERS',
  'SOUPS',
  'SALADS',
  'MAIN_COURSE',
  'SIDES',
  'DESSERTS',
  'MERCHANDISE',
  'OTHER',
];

const CONCEPT_ELIGIBILITY = ['CAFE', 'RESTAURANT', 'SHARED'];

const COURSE_TYPES = [
  'STARTER',
  'SOUP',
  'SALAD',
  'MAIN',
  'SIDE',
  'DESSERT',
  'BEVERAGE',
  null,
];

const LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'TEMPORARILY_UNAVAILABLE',
  'INACTIVE',
  'RETIRED',
  'SUPERSEDED',
];

const priceHistorySchema = new mongoose.Schema(
  {
    pricePaisa: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'pricePaisa must be an integer.',
      },
    },

    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },

    changedByUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  { _id: true }
);

const menuItemVariantSchema = new mongoose.Schema(
  {
    variantId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    plu: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    pricePaisa: {
      type: Number,
      required: true,
      min: 0,
    },
    recipeQuantityMultiplier: {
      type: Number,
      default: 1,
      min: 0.1,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const menuItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^MENU-\d{2,}$/,
      index: true,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
      default: 'ZAMORIN',
    },

    itemCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    plu: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },

    nameLower: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    customerName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    posShortName: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },

    receiptName: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },

    category: {
      type: String,
      required: true,
      enum: MENU_CATEGORIES,
      index: true,
    },

    subcategory: {
      type: String,
      trim: true,
      default: null,
    },

    conceptEligibility: {
      type: String,
      enum: CONCEPT_ELIGIBILITY,
      default: 'CAFE',
      index: true,
    },

    courseType: {
      type: String,
      enum: COURSE_TYPES,
      default: null,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    currentPricePaisa: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'currentPricePaisa must be an integer.',
      },
    },

    sellingPrice: {
      type: Number,
      default: null,
    },

    pricing: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    taxRatePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 5,
    },

    isTaxInclusive: {
      type: Boolean,
      default: true,
    },

    taxCategoryRef: {
      type: String,
      trim: true,
      default: 'GST_5_FOOD_BEVERAGE',
    },

    primaryRecipeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    // Optional legacy link to raw inventory item
    inventoryItemId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    recipeDeductionBaseQuantity: {
      type: Number,
      min: 0,
      default: 1,
    },

    variants: {
      type: [menuItemVariantSchema],
      default: [],
    },

    modifierGroupIds: {
      type: [String],
      default: [],
    },

    comboDefinitionId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    dietaryTags: {
      type: [String],
      default: ['VEG'], // 'VEG', 'NON_VEG', 'VEGAN', 'CONTAINS_EGG', 'JAIN_COMPATIBLE'
    },

    allergenTags: {
      type: [String],
      default: [], // 'MILK', 'DAIRY', 'NUTS', 'GLUTEN', 'SOY', 'EGG', 'FISH', 'SHELLFISH'
    },

    nutritionProfile: {
      calories: { type: Number, default: null },
      servingSizeGrams: { type: Number, default: null },
      proteinGrams: { type: Number, default: null },
      carbsGrams: { type: Number, default: null },
      fatGrams: { type: Number, default: null },
      source: { type: String, default: 'CALCULATED' },
      isVerified: { type: Boolean, default: false },
    },

    prepStation: {
      type: String,
      enum: ['HOT_KITCHEN', 'BEVERAGE_BAR', 'BAKERY_COLD', 'DESSERT', 'EXPEDITER', 'ALL'],
      default: 'HOT_KITCHEN',
      index: true,
    },

    foodSafetyNotes: {
      type: String,
      trim: true,
      default: '',
    },

    fssaiCategoryNumber: {
      type: String,
      trim: true,
      default: '',
    },

    targetPrepTimeMinutes: {
      type: Number,
      min: 1,
      default: 15,
    },

    availableCafeIds: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      required: true,
      enum: LIFECYCLE_STATUSES,
      default: 'ACTIVE',
      index: true,
    },

    priceHistory: {
      type: [priceHistorySchema],
      default: [],
    },

    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },

    isSignature: {
      type: Boolean,
      default: false,
    },

    isSeasonal: {
      type: Boolean,
      default: false,
    },

    advanceOrder: {
      isRequired: { type: Boolean, default: false },
      leadTimeHours: { type: Number, default: 0 },
      cutoffTime: { type: String, default: null },
    },

    createdByUserId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    lastModifiedByUserId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
    optimisticConcurrency: true,
    collection: 'menu_items',
    strict: false,
  }
);

menuItemSchema.index(
  { organisationId: 1, nameLower: 1 },
  { unique: true, name: 'org_menu_name_unique' }
);

menuItemSchema.index(
  { organisationId: 1, status: 1, category: 1 },
  { name: 'org_status_category' }
);

menuItemSchema.index({ organisationId: 1, conceptEligibility: 1 });

const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);

module.exports = {
  MenuItem,
  MENU_CATEGORIES,
  CONCEPT_ELIGIBILITY,
  COURSE_TYPES,
  LIFECYCLE_STATUSES,
};
