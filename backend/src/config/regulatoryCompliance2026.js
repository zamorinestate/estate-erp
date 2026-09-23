'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — REGULATORY COMPLIANCE 2026 CONFIGURATION & VALIDATORS
 * ============================================================================
 * Centralized, testable regulatory rules for FSSAI 2026 Perpetual Regime,
 * Indian GSTIN & State Code Jurisdictions, and Financial Year Sequencing.
 */

// ---------------------------------------------------------------------------
// 1. CANONICAL INDIAN STATE CODES (GST State Codes)
// ---------------------------------------------------------------------------
const INDIAN_STATE_CODES = Object.freeze({
  '01': { code: '01', name: 'Jammu and Kashmir', type: 'UT' },
  '02': { code: '02', name: 'Himachal Pradesh', type: 'STATE' },
  '03': { code: '03', name: 'Punjab', type: 'STATE' },
  '04': { code: '04', name: 'Chandigarh', type: 'UT' },
  '05': { code: '05', name: 'Uttarakhand', type: 'STATE' },
  '06': { code: '06', name: 'Haryana', type: 'STATE' },
  '07': { code: '07', name: 'Delhi', type: 'UT' },
  '08': { code: '08', name: 'Rajasthan', type: 'STATE' },
  '09': { code: '09', name: 'Uttar Pradesh', type: 'STATE' },
  '10': { code: '10', name: 'Bihar', type: 'STATE' },
  '11': { code: '11', name: 'Sikkim', type: 'STATE' },
  '12': { code: '12', name: 'Arunachal Pradesh', type: 'STATE' },
  '13': { code: '13', name: 'Nagaland', type: 'STATE' },
  '14': { code: '14', name: 'Manipur', type: 'STATE' },
  '15': { code: '15', name: 'Mizoram', type: 'STATE' },
  '16': { code: '16', name: 'Tripura', type: 'STATE' },
  '17': { code: '17', name: 'Meghalaya', type: 'STATE' },
  '18': { code: '18', name: 'Assam', type: 'STATE' },
  '19': { code: '19', name: 'West Bengal', type: 'STATE' },
  '20': { code: '20', name: 'Jharkhand', type: 'STATE' },
  '21': { code: '21', name: 'Odisha', type: 'STATE' },
  '22': { code: '22', name: 'Chhattisgarh', type: 'STATE' },
  '23': { code: '23', name: 'Madhya Pradesh', type: 'STATE' },
  '24': { code: '24', name: 'Gujarat', type: 'STATE' },
  '25': { code: '25', name: 'Daman and Diu', type: 'UT' },
  '26': { code: '26', name: 'Dadra and Nagar Haveli', type: 'UT' },
  '27': { code: '27', name: 'Maharashtra', type: 'STATE' },
  '28': { code: '28', name: 'Andhra Pradesh (Old)', type: 'STATE' },
  '29': { code: '29', name: 'Karnataka', type: 'STATE' },
  '30': { code: '30', name: 'Goa', type: 'STATE' },
  '31': { code: '31', name: 'Lakshadweep', type: 'UT' },
  '32': { code: '32', name: 'Kerala', type: 'STATE' },
  '33': { code: '33', name: 'Tamil Nadu', type: 'STATE' },
  '34': { code: '34', name: 'Puducherry', type: 'UT' },
  '35': { code: '35', name: 'Andaman and Nicobar Islands', type: 'UT' },
  '36': { code: '36', name: 'Telangana', type: 'STATE' },
  '37': { code: '37', name: 'Andhra Pradesh', type: 'STATE' },
  '38': { code: '38', name: 'Ladakh', type: 'UT' },
});

function resolveStateByCode(code) {
  if (!code) return null;
  const clean = String(code).trim().padStart(2, '0');
  return INDIAN_STATE_CODES[clean] || null;
}

function resolveStateByName(name) {
  if (!name || typeof name !== 'string') return null;
  const target = name.trim().toLowerCase();
  for (const entry of Object.values(INDIAN_STATE_CODES)) {
    if (entry.name.toLowerCase() === target) {
      return entry;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. GSTIN VALIDATION & STATUS SPECIFICATION
// ---------------------------------------------------------------------------
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const GST_VERIFICATION_STATUSES = Object.freeze([
  'FORMAT_VALIDATED',
  'DOCUMENT_PROVIDED',
  'EXTERNALLY_VERIFIED',
]);

function validateGstinFormat(gstin, expectedStateCode = null) {
  const clean = String(gstin || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, reason: 'GSTIN is required.' };
  }
  if (clean.length !== 15) {
    return { valid: false, reason: 'GSTIN must be exactly 15 characters.' };
  }
  if (!GSTIN_REGEX.test(clean)) {
    return { valid: false, reason: 'Invalid GSTIN format structure.' };
  }

  const gstinStateCode = clean.substring(0, 2);
  const stateRecord = resolveStateByCode(gstinStateCode);
  if (!stateRecord) {
    return { valid: false, reason: `Unknown State code '${gstinStateCode}' in GSTIN.` };
  }

  if (expectedStateCode) {
    const expected = String(expectedStateCode).trim().padStart(2, '0');
    if (gstinStateCode !== expected) {
      return {
        valid: false,
        reason: `GSTIN State code '${gstinStateCode}' does not match location State code '${expected}'.`,
      };
    }
  }

  return {
    valid: true,
    cleanGstin: clean,
    stateCode: gstinStateCode,
    stateName: stateRecord.name,
    pan: clean.substring(2, 12),
  };
}

// ---------------------------------------------------------------------------
// 3. FSSAI 2026 REGULATORY FRAMEWORK (KIND OF BUSINESS, VERSIONING & FEES)
// ---------------------------------------------------------------------------

/**
 * Versioned FSSAI Regulatory Rule Sets.
 * Ensures historical onboarding records maintain immutable regulatory baselines
 * while supporting the current 1 April 2026 turnover & perpetual fee schedules.
 */
const FSSAI_RULE_SETS = Object.freeze({
  FSSAI_RULES_2026_V1: {
    ruleVersion: 'FSSAI_RULES_2026_V1',
    effectiveFrom: '2026-04-01T00:00:00.000Z',
    effectiveTo: null,
    sourceVersion: 'FSSAI FoSCoS Regulatory Revision (Effective 1 April 2026)',
    isPerpetualRegime: true,
    turnoverThresholds: {
      registrationMaxInr: 15000000,   // ₹1.5 crore
      stateLicenceMaxInr: 500000000, // ₹50 crore
    },
    kindsOfBusiness: {
      RESTAURANT: {
        key: 'RESTAURANT',
        displayName: 'Food Services — Restaurants & Cafés',
        description: 'Stand-alone restaurants, dining spaces, bistros, and sit-down cafés',
        tiers: [
          {
            tierKey: 'REGISTRATION',
            licenceCategory: 'REGISTRATION',
            licensingAuthority: 'Designated Registering Authority (Local Municipal / District)',
            eligibilityCriteria: 'Annual turnover up to ₹1.5 crore (Petty Food Business)',
            turnoverMinInr: 0,
            turnoverMaxInr: 15000000,
            feePerAnnum: 100,
            isPerpetual: true,
          },
          {
            tierKey: 'STATE_LICENCE',
            licenceCategory: 'STATE_LICENCE',
            licensingAuthority: 'State Food Safety Authority (FoSCoS State Directorate)',
            eligibilityCriteria: 'Annual turnover above ₹1.5 crore and up to ₹50 crore',
            turnoverMinInr: 15000001,
            turnoverMaxInr: 500000000,
            feePerAnnum: 5000, // Statutory Restaurant State Licence rate: ₹5,000
            isPerpetual: true,
          },
          {
            tierKey: 'CENTRAL_LICENCE',
            licenceCategory: 'CENTRAL_LICENCE',
            licensingAuthority: 'Central Food Safety Authority (FSSAI HQ / Regional Directorate)',
            eligibilityCriteria: 'Annual turnover above ₹50 crore or central agency jurisdiction',
            turnoverMinInr: 50000001,
            turnoverMaxInr: Infinity,
            feePerAnnum: 7500, // Statutory Central Licence rate: ₹7,500
            isPerpetual: true,
          },
        ],
      },
      FOOD_VENDING_ESTABLISHMENT: {
        key: 'FOOD_VENDING_ESTABLISHMENT',
        displayName: 'Food Vending / Kiosks / Quick Service Stalls',
        description: 'Takeaway stalls, kiosks, express counters, and mobile food vending',
        tiers: [
          {
            tierKey: 'REGISTRATION',
            licenceCategory: 'REGISTRATION',
            licensingAuthority: 'Designated Registering Authority (Local)',
            eligibilityCriteria: 'Annual turnover up to ₹1.5 crore',
            turnoverMinInr: 0,
            turnoverMaxInr: 15000000,
            feePerAnnum: 100,
            isPerpetual: true,
          },
          {
            tierKey: 'STATE_LICENCE',
            licenceCategory: 'STATE_LICENCE',
            licensingAuthority: 'State Food Safety Authority',
            eligibilityCriteria: 'Annual turnover above ₹1.5 crore and up to ₹50 crore',
            turnoverMinInr: 15000001,
            turnoverMaxInr: 500000000,
            feePerAnnum: 2000, // Other Food Service State Licence rate: ₹2,000
            isPerpetual: true,
          },
          {
            tierKey: 'CENTRAL_LICENCE',
            licenceCategory: 'CENTRAL_LICENCE',
            licensingAuthority: 'Central Food Safety Authority',
            eligibilityCriteria: 'Annual turnover above ₹50 crore',
            turnoverMinInr: 50000001,
            turnoverMaxInr: Infinity,
            feePerAnnum: 7500,
            isPerpetual: true,
          },
        ],
      },
      CLUB_CANTEEN_CATERER: {
        key: 'CLUB_CANTEEN_CATERER',
        displayName: 'Club / Canteen / Catering Services',
        description: 'Institutional catering, mess services, clubs, and event canteens',
        tiers: [
          {
            tierKey: 'REGISTRATION',
            licenceCategory: 'REGISTRATION',
            licensingAuthority: 'Designated Registering Authority (Local)',
            eligibilityCriteria: 'Annual turnover up to ₹1.5 crore',
            turnoverMinInr: 0,
            turnoverMaxInr: 15000000,
            feePerAnnum: 100,
            isPerpetual: true,
          },
          {
            tierKey: 'STATE_LICENCE',
            licenceCategory: 'STATE_LICENCE',
            licensingAuthority: 'State Food Safety Authority',
            eligibilityCriteria: 'Annual turnover above ₹1.5 crore and up to ₹50 crore',
            turnoverMinInr: 15000001,
            turnoverMaxInr: 500000000,
            feePerAnnum: 2000, // Canteen / Caterer State rate: ₹2,000
            isPerpetual: true,
          },
          {
            tierKey: 'CENTRAL_LICENCE',
            licenceCategory: 'CENTRAL_LICENCE',
            licensingAuthority: 'Central Food Safety Authority',
            eligibilityCriteria: 'Annual turnover above ₹50 crore or transport hub operations',
            turnoverMinInr: 50000001,
            turnoverMaxInr: Infinity,
            feePerAnnum: 7500,
            isPerpetual: true,
          },
        ],
      },
    },
  },

  FSSAI_RULES_HISTORICAL_2021: {
    ruleVersion: 'FSSAI_RULES_HISTORICAL_2021',
    effectiveFrom: '2021-01-01T00:00:00.000Z',
    effectiveTo: '2026-03-31T23:59:59.999Z',
    sourceVersion: 'FSSAI Licensing Regulations 2011/2021 (Pre-2026 ₹12-Lakh Regime)',
    isPerpetualRegime: false,
    turnoverThresholds: {
      registrationMaxInr: 1200000,   // ₹12 lakh
      stateLicenceMaxInr: 200000000, // ₹20 crore
    },
    kindsOfBusiness: {
      RESTAURANT: {
        key: 'RESTAURANT',
        displayName: 'Restaurants (Historical Pre-2026)',
        tiers: [
          {
            tierKey: 'REGISTRATION',
            licenceCategory: 'REGISTRATION',
            licensingAuthority: 'Registering Authority (Local)',
            eligibilityCriteria: 'Turnover up to ₹12 lakh per annum',
            turnoverMinInr: 0,
            turnoverMaxInr: 1200000,
            feePerAnnum: 100,
            isPerpetual: false,
          },
          {
            tierKey: 'STATE_LICENCE',
            licenceCategory: 'STATE_LICENCE',
            licensingAuthority: 'State Food Safety Authority',
            eligibilityCriteria: 'Turnover between ₹12 lakh and ₹20 crore per annum',
            turnoverMinInr: 1200001,
            turnoverMaxInr: 200000000,
            feePerAnnum: 2000,
            isPerpetual: false,
          },
          {
            tierKey: 'CENTRAL_LICENCE',
            licenceCategory: 'CENTRAL_LICENCE',
            licensingAuthority: 'Central Licensing Authority',
            eligibilityCriteria: 'Turnover above ₹20 crore per annum',
            turnoverMinInr: 200000001,
            turnoverMaxInr: Infinity,
            feePerAnnum: 7500,
            isPerpetual: false,
          },
        ],
      },
    },
  },
});

const ACTIVE_FSSAI_RULE_VERSION = 'FSSAI_RULES_2026_V1';

const FSSAI_STATUSES = Object.freeze([
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'SURRENDERED',
  'UNDER_REVIEW',
]);

/**
 * Retrieve the applicable FSSAI rule set by explicit version key or effective date.
 * Deterministic for both historical audit lookups and active 2026 governance.
 */
function getFssaiRuleSet(versionOrDate = null) {
  if (typeof versionOrDate === 'string' && FSSAI_RULE_SETS[versionOrDate]) {
    return FSSAI_RULE_SETS[versionOrDate];
  }

  if (versionOrDate instanceof Date || (typeof versionOrDate === 'string' && !isNaN(Date.parse(versionOrDate)))) {
    const targetDate = new Date(versionOrDate);
    const splitDate = new Date('2026-04-01T00:00:00.000Z');
    if (targetDate < splitDate) {
      return FSSAI_RULE_SETS.FSSAI_RULES_HISTORICAL_2021;
    }
    return FSSAI_RULE_SETS.FSSAI_RULES_2026_V1;
  }

  return FSSAI_RULE_SETS[ACTIVE_FSSAI_RULE_VERSION];
}

/**
 * Resolve official FSSAI eligibility, licence tier, licensing authority, and applicable
 * annual fee based on:
 * Kind of Business + turnover / eligibility criteria + licence category
 *
 * Never invents amounts for unknown kinds of business.
 */
function resolveFssaiEligibilityAndFee({
  kindOfBusiness = 'RESTAURANT',
  annualTurnoverInr = 0,
  ruleVersion = null,
  asOfDate = null,
} = {}) {
  const ruleSet = getFssaiRuleSet(ruleVersion || asOfDate);
  const cleanKob = String(kindOfBusiness || '').trim().toUpperCase();

  const kobConfig = ruleSet.kindsOfBusiness[cleanKob];
  if (!kobConfig) {
    return {
      matched: false,
      ruleVersion: ruleSet.ruleVersion,
      kindOfBusiness: cleanKob,
      category: null,
      feePerAnnum: null,
      licensingAuthority: null,
      eligibilityCriteria: null,
      isPerpetual: ruleSet.isPerpetualRegime,
      reason: `Unknown or unconfigured FSSAI Kind of Business '${cleanKob}'. No fee invented.`,
    };
  }

  const amount = Number(annualTurnoverInr);
  const validAmount = !isNaN(amount) && amount >= 0 ? amount : 0;

  const matchedTier = kobConfig.tiers.find((tier) => {
    return validAmount >= tier.turnoverMinInr && validAmount <= tier.turnoverMaxInr;
  }) || kobConfig.tiers[kobConfig.tiers.length - 1];

  return {
    matched: true,
    ruleVersion: ruleSet.ruleVersion,
    effectiveFrom: ruleSet.effectiveFrom,
    sourceVersion: ruleSet.sourceVersion,
    isPerpetualRegime: ruleSet.isPerpetualRegime,
    kindOfBusiness: kobConfig.key,
    kindOfBusinessDisplayName: kobConfig.displayName,
    category: matchedTier.licenceCategory,
    licensingAuthority: matchedTier.licensingAuthority,
    eligibilityCriteria: matchedTier.eligibilityCriteria,
    turnoverMinInr: matchedTier.turnoverMinInr,
    turnoverMaxInr: matchedTier.turnoverMaxInr,
    annualTurnoverInr: validAmount,
    feePerAnnum: matchedTier.feePerAnnum,
    isPerpetual: matchedTier.isPerpetual,
  };
}

/**
 * Backward-compatible helper for existing callers.
 * Evaluates FSSAI Category and Fee using the Kind of Business architecture.
 */
function determineFssaiCategoryByTurnover(annualTurnoverInr, kindOfBusiness = 'RESTAURANT') {
  const resolution = resolveFssaiEligibilityAndFee({
    kindOfBusiness,
    annualTurnoverInr,
  });

  return {
    key: resolution.category,
    category: resolution.category,
    displayName: resolution.matched ? `${resolution.kindOfBusinessDisplayName} (${resolution.category})` : 'FSSAI Classification',
    annualTurnoverInr: resolution.annualTurnoverInr,
    feePerAnnum: resolution.feePerAnnum,
    annualFeeInr: resolution.feePerAnnum,
    isPerpetual: resolution.isPerpetual,
    licensingAuthority: resolution.licensingAuthority,
    eligibilityCriteria: resolution.eligibilityCriteria,
    ruleVersion: resolution.ruleVersion,
    matched: resolution.matched,
  };
}

function validateFssaiNumber(number) {
  const clean = String(number || '').trim();
  if (!clean) {
    return { valid: false, reason: 'FSSAI number is required.' };
  }
  if (!/^\d{14}$/.test(clean)) {
    return { valid: false, reason: 'FSSAI number must be exactly 14 digits.' };
  }
  return { valid: true, fssaiNumber: clean };
}

// ---------------------------------------------------------------------------
// 4. FINANCIAL YEAR & SEQUENCE IDENTITY HELPER
// ---------------------------------------------------------------------------
function resolveFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const shortEnd = String(endYear).slice(-2);
  return {
    financialYear: `${startYear}-${endYear}`, // e.g. '2026-2027'
    fyShort: `${startYear}-${shortEnd}`,     // e.g. '2026-27'
    startYear,
    endYear,
  };
}

module.exports = {
  INDIAN_STATE_CODES,
  resolveStateByCode,
  resolveStateByName,
  GSTIN_REGEX,
  GST_VERIFICATION_STATUSES,
  validateGstinFormat,
  FSSAI_RULE_SETS,
  ACTIVE_FSSAI_RULE_VERSION,
  FSSAI_STATUSES,
  getFssaiRuleSet,
  resolveFssaiEligibilityAndFee,
  determineFssaiCategoryByTurnover,
  validateFssaiNumber,
  resolveFinancialYear,
};
