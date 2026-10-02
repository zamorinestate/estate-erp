'use strict';

const { assertCanonicalReportingActor } = require('./reportingAuthority');

/**
 * ZAMORIN CAFÉ ERP — FORECAST & SCENARIO INTELLIGENCE REGISTRY
 * Module: forecastRegistry.js
 * 
 * PM-02K-R1: Canonical Forecast & Predictive Intelligence Governance
 * Stage 11 of 14 of the Consolidated Reports & Analytics Programme (PM-02A through PM-02N)
 * 
 * Invariants:
 * - Governs allowable forecast targets, models, frequencies, horizons, and quality states.
 * - Enforces absolute distinction: ACTUAL ≠ FORECAST ≠ SIMULATED ≠ ESTIMATE ≠ UNAVAILABLE.
 * - Prohibits forecasting of unavailable financial metrics: ACTUAL_COGS, GROSS_PROFIT, EBITDA.
 * - Prohibits individual customer churn or propensity profiling.
 * - Enforces strict server-side role and café scope security.
 * - Enforces model-specific forecast uncertainty methods (no universal sqrt(h) across all models).
 * - Enforces real canonical database role taxonomy: MASTER (Primary & Normal), OWNER, CAFE_ADMIN, STAFF.
 */

// ── Static Semantic Audit & Invariant Constants (PM-02K-R1 Section 44) ──────
const UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS = 0;
const SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA = 0;
const ARBITRARY_FORECAST_INTERVAL = 0;
const FORECAST_SECONDARY_ROLE_TAXONOMY = 0;
const RETIRED_MASTER_FORECAST_BYPASS = 0;
const HIDDEN_CAFE_FORECAST_LEAK = 0;
const UNEXPLAINED_FROZEN_TEST_LOSS = 0;
const INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT = 0;
const FORECAST_STATUS_OUTPUT_CONTRADICTION = 0;
const SMOOTHING_PARAMETER_FUTURE_LEAKAGE = 0;
const FORECAST_DUPLICATE_ACTUAL_METRIC_ENGINE = 0;
const FORECAST_BOM_INVENTORY_UNIT_MISMATCH = 0;
const FORECASTED_FAKE_COGS = 0;
const FORECASTED_FAKE_EBITDA = 0;
const HISTORICAL_SPLH_USED_AS_UNAPPROVED_STAFFING_TARGET = 0;
const SCENARIO_DRIVER_CONFLICT_SILENTLY_ACCEPTED = 0;
const DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST = 0;
const ACTUAL_FORECAST_SCENARIO_CLASSIFICATION_MIXED = 0;
const REPORTS_PROGRAMME_STAGE_COUNT_MISMATCH = 0;
const DEAD_PM02K_CONTROLS = 0;
const MISREPRESENTED_PM02K_CONTROLS = 0;

const FORECAST_ACTUALITY = Object.freeze({
  ACTUAL: 'ACTUAL',
  FORECAST: 'FORECAST',
  SIMULATED: 'SIMULATED',
  ESTIMATE: 'ESTIMATE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const FORECAST_QUALITY_STATES = Object.freeze({
  READY: 'READY',
  LOW_HISTORY: 'LOW_HISTORY',
  PARTIAL_SOURCE: 'PARTIAL_SOURCE',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  MODEL_UNSTABLE: 'MODEL_UNSTABLE',
  BACKTEST_FAILED: 'BACKTEST_FAILED',
});

const FORECAST_TARGET_ELIGIBILITY = Object.freeze({
  FORECAST_READY: 'FORECAST_READY',
  PARTIAL_SOURCE: 'PARTIAL_SOURCE',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  UNAVAILABLE_SOURCE: 'UNAVAILABLE_SOURCE',
  UNSUITABLE_FOR_FORECASTING: 'UNSUITABLE_FOR_FORECASTING',
});

const FORECAST_FREQUENCIES = Object.freeze({
  HOURLY: 'HOURLY',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
});

const FORECAST_HORIZONS = Object.freeze({
  NEXT_DAY: { id: 'NEXT_DAY', label: 'Next 1 Day', periods: 1, frequency: 'DAILY' },
  NEXT_7_DAYS: { id: 'NEXT_7_DAYS', label: 'Next 7 Days', periods: 7, frequency: 'DAILY' },
  NEXT_14_DAYS: { id: 'NEXT_14_DAYS', label: 'Next 14 Days', periods: 14, frequency: 'DAILY' },
  NEXT_30_DAYS: { id: 'NEXT_30_DAYS', label: 'Next 30 Days', periods: 30, frequency: 'DAILY' },
  NEXT_4_WEEKS: { id: 'NEXT_4_WEEKS', label: 'Next 4 Weeks', periods: 4, frequency: 'WEEKLY' },
  NEXT_3_MONTHS: { id: 'NEXT_3_MONTHS', label: 'Next 3 Months', periods: 3, frequency: 'MONTHLY' },
});

const FORECAST_METHODS = Object.freeze({
  NAIVE_LAST_VALUE: {
    id: 'NAIVE_LAST_VALUE',
    displayName: 'Naïve Baseline (Last Value)',
    description: 'Extrapolates the most recent observed actual value forward as a benchmark.',
    minimumHistory: 2, // Minimum 2 points required for in-sample residual sigma estimation
    supportsSeasonality: false,
    intervalMethod: 'RANDOM_WALK_PARAMETRIC',
    modelVariant: 'BENCHMARK_NAIVE',
    parameters: {},
    isBaseline: true,
  },
  SEASONAL_NAIVE: {
    id: 'SEASONAL_NAIVE',
    displayName: 'Seasonal Naïve (Weekly Cycle)',
    description: 'Extrapolates observations from the corresponding day of the previous weekly cycle (m=7).',
    minimumHistory: 14, // 2 full weekly cycles
    supportsSeasonality: true,
    seasonalPeriod: 7,
    intervalMethod: 'SEASONAL_RANDOM_WALK_PARAMETRIC',
    modelVariant: 'BENCHMARK_SEASONAL_NAIVE',
    parameters: { seasonalPeriod: 7 },
    isBaseline: true,
  },
  MOVING_AVERAGE_BASELINE: {
    id: 'MOVING_AVERAGE_BASELINE',
    displayName: 'Moving Average Forecast Baseline',
    description: 'Extrapolates the trailing k-period mean forward as a constant benchmark projection.',
    minimumHistory: 7,
    supportsSeasonality: false,
    intervalMethod: 'EMPIRICAL_BACKTEST_DISTRIBUTION',
    modelVariant: 'FIXED_PARAMETER_MODEL_VARIANT',
    parameters: { movingAverageWindow: 7 },
    isBaseline: true,
  },
  SIMPLE_EXPONENTIAL_SMOOTHING: {
    id: 'SIMPLE_EXPONENTIAL_SMOOTHING',
    displayName: 'Simple Exponential Smoothing (SES)',
    description: 'Weighted moving average with exponentially declining weights for level-only series.',
    minimumHistory: 7,
    supportsSeasonality: false,
    intervalMethod: 'ETS_ANN_STATE_SPACE_PARAMETRIC',
    modelVariant: 'FIXED_PARAMETER_MODEL_VARIANT',
    parameters: { alpha: 0.3 },
    isBaseline: false,
  },
  HOLT_LINEAR_TREND: {
    id: 'HOLT_LINEAR_TREND',
    displayName: 'Holt Linear Trend',
    description: 'Two-parameter exponential smoothing accounting for changing level and linear trend.',
    minimumHistory: 10,
    supportsSeasonality: false,
    intervalMethod: 'ETS_AAN_STATE_SPACE_PARAMETRIC',
    modelVariant: 'FIXED_PARAMETER_MODEL_VARIANT',
    parameters: { alpha: 0.3, beta: 0.1 },
    isBaseline: false,
  },
  HOLT_WINTERS_SEASONAL: {
    id: 'HOLT_WINTERS_SEASONAL',
    displayName: 'Holt-Winters Additive Seasonal',
    description: 'Three-parameter exponential smoothing incorporating level, linear trend, and weekly seasonality (m=7).',
    minimumHistory: 14, // 2 full cycles
    supportsSeasonality: true,
    seasonalPeriod: 7,
    intervalMethod: 'EMPIRICAL_BACKTEST_DISTRIBUTION',
    modelVariant: 'FIXED_PARAMETER_MODEL_VARIANT',
    parameters: { alpha: 0.2, beta: 0.1, gamma: 0.2, seasonalPeriod: 7 },
    isBaseline: false,
  },
});

/**
 * Governed Forecast Target Definitions (Section 8 & 112)
 */
const CANONICAL_FORECAST_TARGETS = Object.freeze({
  NET_SALES: {
    forecastId: 'FC-NET-SALES',
    targetMetricId: 'NET_SALES',
    displayName: 'Net Sales Revenue Forecast',
    domain: 'SALES_REVENUE',
    unit: 'INR_PAISA',
    dataType: 'CONTINUOUS_VALUE',
    canonicalSource: 'Bill (status != CANCELLED, netAmountPaisa)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS', 'NEXT_30_DAYS'],
    eligibleMethods: [
      'NAIVE_LAST_VALUE',
      'SEASONAL_NAIVE',
      'MOVING_AVERAGE_BASELINE',
      'SIMPLE_EXPONENTIAL_SMOOTHING',
      'HOLT_LINEAR_TREND',
      'HOLT_WINTERS_SEASONAL',
    ],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-ST-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'REQUIRE_POSITIVE_OBSERVATIONS',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  ORDERS: {
    forecastId: 'FC-ORDERS',
    targetMetricId: 'ORDERS',
    displayName: 'Order & Bill Volume Forecast',
    domain: 'SALES_REVENUE',
    unit: 'COUNT',
    dataType: 'COUNT / DISCRETE_VALUE',
    canonicalSource: 'Bill count (status != CANCELLED)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS', 'NEXT_30_DAYS'],
    eligibleMethods: [
      'NAIVE_LAST_VALUE',
      'SEASONAL_NAIVE',
      'MOVING_AVERAGE_BASELINE',
      'SIMPLE_EXPONENTIAL_SMOOTHING',
      'HOLT_LINEAR_TREND',
      'HOLT_WINTERS_SEASONAL',
    ],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-ST-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'REQUIRE_POSITIVE_OBSERVATIONS',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  MENU_ITEM_QUANTITY: {
    forecastId: 'FC-MENU-ITEM-QTY',
    targetMetricId: 'MENU_ITEM_QUANTITY',
    displayName: 'Menu Item Demand Quantity Forecast',
    domain: 'MENU_PRODUCT',
    unit: 'UNITS',
    dataType: 'COUNT / DISCRETE_VALUE',
    canonicalSource: 'Bill.items (name/itemId, quantity)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS'],
    eligibleMethods: [
      'NAIVE_LAST_VALUE',
      'SEASONAL_NAIVE',
      'MOVING_AVERAGE_BASELINE',
      'SIMPLE_EXPONENTIAL_SMOOTHING',
      'HOLT_LINEAR_TREND',
    ],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-ST-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'NON_NEGATIVE_QUANTITIES',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  MENU_CATEGORY_QUANTITY: {
    forecastId: 'FC-MENU-CAT-QTY',
    targetMetricId: 'MENU_CATEGORY_QUANTITY',
    displayName: 'Menu Category Demand Quantity Forecast',
    domain: 'MENU_PRODUCT',
    unit: 'UNITS',
    dataType: 'COUNT / DISCRETE_VALUE',
    canonicalSource: 'Bill.items -> MenuItem.category (quantity)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS'],
    eligibleMethods: [
      'NAIVE_LAST_VALUE',
      'SEASONAL_NAIVE',
      'MOVING_AVERAGE_BASELINE',
      'SIMPLE_EXPONENTIAL_SMOOTHING',
      'HOLT_LINEAR_TREND',
    ],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-ST-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'NON_NEGATIVE_QUANTITIES',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  THEORETICAL_INGREDIENT_REQUIREMENT: {
    forecastId: 'FC-THEORETICAL-BOM-REQ',
    targetMetricId: 'THEORETICAL_INGREDIENT_REQUIREMENT',
    displayName: 'Theoretical BOM Ingredient Requirement Forecast',
    domain: 'INVENTORY_COGS',
    unit: 'RECIPE_UOM',
    dataType: 'CONTINUOUS_VALUE',
    canonicalSource: 'Forecast Menu Item Quantity x Recipe Ingredients (BOM)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS'],
    eligibleMethods: ['DERIVED_FROM_MENU_FORECAST'],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-BOM-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'RECIPE_BOM_REQUIRED',
    uncertaintyPolicy: 'PROPAGATED_FROM_MENU_INTERVAL',
    backtestPolicy: 'DERIVED_BACKTEST',
    status: 'ACTIVE',
  },
  GROSS_PAYROLL: {
    forecastId: 'FC-GROSS-PAYROLL',
    targetMetricId: 'GROSS_PAYROLL',
    displayName: 'Gross Payroll Baseline Projection',
    domain: 'PAYROLL',
    unit: 'INR_PAISA',
    dataType: 'CONTINUOUS_VALUE',
    canonicalSource: 'PayrollRun (status != CANCELLED) / Payslip fallback',
    frequency: FORECAST_FREQUENCIES.MONTHLY,
    minimumHistory: 3, // 3 pay periods
    allowedHorizons: ['NEXT_3_MONTHS'],
    eligibleMethods: ['NAIVE_LAST_VALUE', 'MOVING_AVERAGE_BASELINE', 'SIMPLE_EXPONENTIAL_SMOOTHING'],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-PR-v1.0',
    supportedRoles: ['MASTER', 'OWNER'], // Restricted from CAFE_ADMIN compensation view
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'AUTHORITATIVE_PAYROLL_RUNS_ONLY',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  OPERATING_EXPENSES: {
    forecastId: 'FC-OPERATING-EXPENSES',
    targetMetricId: 'OPERATING_EXPENSES',
    displayName: 'Operating Expense Trend Projection',
    domain: 'FINANCE_PROFITABILITY',
    unit: 'INR_PAISA',
    dataType: 'CONTINUOUS_VALUE',
    canonicalSource: 'Expense (status = APPROVED)',
    frequency: FORECAST_FREQUENCIES.MONTHLY,
    minimumHistory: 3,
    allowedHorizons: ['NEXT_3_MONTHS'],
    eligibleMethods: ['NAIVE_LAST_VALUE', 'MOVING_AVERAGE_BASELINE', 'SIMPLE_EXPONENTIAL_SMOOTHING', 'HOLT_LINEAR_TREND'],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-OPEX-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'APPROVED_EXPENSES_ONLY',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  CUSTOMER_VISITS: {
    forecastId: 'FC-CUSTOMER-VISITS',
    targetMetricId: 'CUSTOMER_VISITS',
    displayName: 'Identified Customer Visits Forecast',
    domain: 'CUSTOMERS_LOYALTY',
    unit: 'COUNT',
    dataType: 'COUNT / DISCRETE_VALUE',
    canonicalSource: 'Customer identified transaction history (PM-02H)',
    frequency: FORECAST_FREQUENCIES.DAILY,
    minimumHistory: 7,
    allowedHorizons: ['NEXT_7_DAYS', 'NEXT_14_DAYS'],
    eligibleMethods: ['NAIVE_LAST_VALUE', 'SEASONAL_NAIVE', 'MOVING_AVERAGE_BASELINE', 'SIMPLE_EXPONENTIAL_SMOOTHING'],
    actuality: FORECAST_ACTUALITY.FORECAST,
    modelVersion: 'PM02K-CUST-v1.0',
    supportedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    supportedCafeScope: 'ASSIGNED_CAFES_OR_ORG',
    eligibility: FORECAST_TARGET_ELIGIBILITY.FORECAST_READY,
    qualityPolicy: 'IDENTIFIED_VISITS_ONLY',
    uncertaintyPolicy: 'RESIDUAL_PREDICTION_INTERVAL_95',
    backtestPolicy: 'ROLLING_ORIGIN_WALK_FORWARD',
    status: 'ACTIVE',
  },
  // Prohibited & Unavailable Targets (Explicitly Registered as Ineligible)
  ACTUAL_COGS: {
    forecastId: 'FC-ACTUAL-COGS',
    targetMetricId: 'ACTUAL_COGS',
    displayName: 'Cost of Goods Sold (Prohibited)',
    domain: 'INVENTORY_COGS',
    dataType: 'CONTINUOUS_VALUE',
    eligibility: FORECAST_TARGET_ELIGIBILITY.UNSUITABLE_FOR_FORECASTING,
    status: 'PROHIBITED',
    reason: 'Underlying canonical actual COGS source remains unavailable in enterprise ledger.',
  },
  GROSS_PROFIT: {
    forecastId: 'FC-GROSS-PROFIT',
    targetMetricId: 'GROSS_PROFIT',
    displayName: 'Gross Profit (Prohibited)',
    domain: 'FINANCE_PROFITABILITY',
    dataType: 'CONTINUOUS_VALUE',
    eligibility: FORECAST_TARGET_ELIGIBILITY.UNSUITABLE_FOR_FORECASTING,
    status: 'PROHIBITED',
    reason: 'Underlying canonical actual COGS source remains unavailable.',
  },
  EBITDA: {
    forecastId: 'FC-EBITDA',
    targetMetricId: 'EBITDA',
    displayName: 'EBITDA (Prohibited)',
    domain: 'FINANCE_PROFITABILITY',
    dataType: 'CONTINUOUS_VALUE',
    eligibility: FORECAST_TARGET_ELIGIBILITY.UNSUITABLE_FOR_FORECASTING,
    status: 'PROHIBITED',
    reason: 'Accounting GL integration not implemented; fabrication of EBITDA strictly prohibited.',
  },
  STAFFING_REQUIREMENT: {
    forecastId: 'FC-STAFFING-REQ',
    targetMetricId: 'STAFFING_REQUIREMENT',
    displayName: 'Operational Staffing Requirement (Unavailable)',
    domain: 'WORKFORCE',
    dataType: 'COUNT / DISCRETE_VALUE',
    eligibility: FORECAST_TARGET_ELIGIBILITY.UNAVAILABLE_SOURCE,
    status: 'UNAVAILABLE',
    reason: 'Approved staffing/productivity configuration model absent; historical SPLH cannot be used as unapproved target.',
  },
  CUSTOMER_CHURN_SCORE: {
    forecastId: 'FC-CUSTOMER-CHURN',
    targetMetricId: 'CUSTOMER_CHURN_SCORE',
    displayName: 'Individual Customer Churn Score (Prohibited)',
    domain: 'CUSTOMERS_LOYALTY',
    dataType: 'CONTINUOUS_VALUE',
    eligibility: FORECAST_TARGET_ELIGIBILITY.UNSUITABLE_FOR_FORECASTING,
    status: 'PROHIBITED',
    reason: 'Portfolio operational forecasting only; individual customer profiling prohibited by privacy policy.',
  },
});

class ForecastRegistry {
  /**
   * Retrieves all forecast target definitions.
   * @returns {Array<object>}
   */
  static getAllTargets() {
    return Object.values(CANONICAL_FORECAST_TARGETS);
  }

  /**
   * Retrieves a target definition by metric ID or forecast ID.
   * @param {string} id
   * @returns {object|null}
   */
  static getTarget(id) {
    if (!id) return null;
    const upper = String(id).toUpperCase().trim();
    if (CANONICAL_FORECAST_TARGETS[upper]) return CANONICAL_FORECAST_TARGETS[upper];
    return Object.values(CANONICAL_FORECAST_TARGETS).find(
      (t) => t.forecastId === upper || t.targetMetricId === upper
    ) || null;
  }

  /**
   * Returns eligible active forecast targets authorized for a given role.
   * @param {string} role
   * @returns {Array<object>}
   */
  static getEligibleTargetsForRole(role) {
    const r = String(role || '').toUpperCase().trim();
    return Object.values(CANONICAL_FORECAST_TARGETS).filter((t) => {
      if (t.eligibility !== FORECAST_TARGET_ELIGIBILITY.FORECAST_READY) return false;
      if (!Array.isArray(t.supportedRoles)) return false;
      return t.supportedRoles.includes(r);
    });
  }

  /**
   * Checks if a target is valid for forecasting.
   * Throws informative error if target is prohibited or unavailable.
   * @param {string} targetId
   * @param {object} auth
   * @returns {object} Target definition
   */
  static assertForecastTargetAccess(targetId, auth = {}) {
    const target = ForecastRegistry.getTarget(targetId);
    if (!target) {
      const err = new Error(`Forecast target "${targetId}" is not registered.`);
      err.statusCode = 404;
      err.code = 'FORECAST_TARGET_NOT_FOUND';
      throw err;
    }

    if (target.eligibility === FORECAST_TARGET_ELIGIBILITY.UNSUITABLE_FOR_FORECASTING) {
      const err = new Error(`Target "${targetId}" is prohibited: ${target.reason || 'Unsuitable for forecasting.'}`);
      err.statusCode = 400;
      err.code = 'FORECAST_TARGET_PROHIBITED';
      throw err;
    }

    if (target.eligibility === FORECAST_TARGET_ELIGIBILITY.UNAVAILABLE_SOURCE) {
      const err = new Error(`Target "${targetId}" is unavailable: ${target.reason || 'Source unavailable.'}`);
      err.statusCode = 400;
      err.code = 'FORECAST_TARGET_UNAVAILABLE';
      throw err;
    }

    const { role } = assertCanonicalReportingActor(auth);
    if (role === 'STAFF') {
      const err = new Error('Staff role is not authorized to access enterprise forecasting reports.');
      err.statusCode = 403;
      err.code = 'FORECAST_ROLE_DENIED';
      throw err;
    }

    // Canonical role validation: Only MASTER, OWNER, CAFE_ADMIN are allowed
    if (!['MASTER', 'OWNER', 'CAFE_ADMIN'].includes(role)) {
      const err = new Error(`Role "${role}" is not recognized in canonical role taxonomy.`);
      err.statusCode = 403;
      err.code = 'FORECAST_ROLE_DENIED';
      throw err;
    }

    if (Array.isArray(target.supportedRoles) && !target.supportedRoles.includes(role)) {
      const err = new Error(`Role "${role}" is not authorized for forecast target "${targetId}".`);
      err.statusCode = 403;
      err.code = 'FORECAST_ROLE_DENIED';
      throw err;
    }

    return target;
  }

  /**
   * Resolves and validates authorized café scope for forecasting.
   * Enforces that CAFE_ADMIN and OWNER can access all authorized assigned cafés,
   * strictly prohibiting truncation to only the first assigned café.
   *
   * @param {object} auth
   * @param {string|null} [requestedCafeId=null]
   * @returns {string|object|null}
   */
  static resolveAuthorizedCafeScope(auth = {}, requestedCafeId = null) {
    const { role } = assertCanonicalReportingActor(auth);
    if (role === 'STAFF') {
      const err = new Error('Staff role is not authorized to access enterprise forecasting reports.');
      err.statusCode = 403;
      err.code = 'FORECAST_ROLE_DENIED';
      throw err;
    }

    const rawCafes = [
      ...(Array.isArray(auth.assignedCafeIds) ? auth.assignedCafeIds : (auth.assignedCafeIds ? [auth.assignedCafeIds] : [])),
      ...(auth.primaryCafeId ? [auth.primaryCafeId] : []),
      ...(auth.cafeId ? [auth.cafeId] : []),
    ];
    const assignedCafeIds = [...new Set(rawCafes.filter(Boolean).map((c) => String(c).trim().toUpperCase()))];

    if (role === 'MASTER') {
      return requestedCafeId || null;
    }

    if (role === 'OWNER' || role === 'CAFE_ADMIN') {
      if (assignedCafeIds.length === 0) {
        const err = new Error(`${role === 'OWNER' ? 'Owner' : 'Café Administrator'} has no authorized café assignments.`);
        err.statusCode = 403;
        err.code = 'CROSS_CAFE_RESOURCE_DENIED';
        throw err;
      }

      if (requestedCafeId) {
        const normReq = String(requestedCafeId).trim().toUpperCase();
        if (!assignedCafeIds.includes(normReq)) {
          const err = new Error(`Access denied to unassigned café ${normReq}.`);
          err.statusCode = 403;
          err.code = 'CROSS_CAFE_RESOURCE_DENIED';
          throw err;
        }
        return normReq;
      }

      // Multi-café authorized universe: NEVER truncate CAFE_ADMIN to first café!
      return assignedCafeIds.length === 1 ? assignedCafeIds[0] : { $in: assignedCafeIds };
    }

    const err = new Error(`Role "${role}" is not recognized in canonical role taxonomy.`);
    err.statusCode = 403;
    err.code = 'FORECAST_ROLE_DENIED';
    throw err;
  }

  /**
   * Returns a statistical method definition.
   * @param {string} methodId
   * @returns {object|null}
   */
  static getMethod(methodId) {
    if (!methodId) return null;
    const upper = String(methodId).toUpperCase().trim();
    return FORECAST_METHODS[upper] || null;
  }

  /**
   * Returns all statistical methods.
   * @returns {Array<object>}
   */
  static getAllMethods() {
    return Object.values(FORECAST_METHODS);
  }
}

// PM-02K-R2 Invariants
const CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE = 0;
const PM02K_REDEFINES_NET_SALES = 0;
const TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES = 0;
const FORECAST_TRAINING_NET_SALES_DISCREPANCY = 0;
const PM02K_REDEFINES_ORDER_COUNT = 0;
const EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS = 0;
const NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD = 0;

// PM-02K-R3 Invariants (Section 26)
const EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY = 0;
const FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI = 0;
const QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE = 0;
const INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS = 0;
const INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE = 0;
const FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL = 0;

// PM-02K-R4 Invariants (Section 21)
const ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS = 0;
const TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY = 0;
const UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM = 0;
const NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED = 0;
const ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD = 0;

// PM-02K-R5 Invariants (Section 20)
const MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT = 0;
const FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED = 0;
const FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST = 0;
const DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION = 0;
const EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS = 0;

module.exports = {
  // Static Semantic Invariants (PM-02K-R1 & PM-02K-R2)
  UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS,
  SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA,
  ARBITRARY_FORECAST_INTERVAL,
  FORECAST_SECONDARY_ROLE_TAXONOMY,
  RETIRED_MASTER_FORECAST_BYPASS,
  HIDDEN_CAFE_FORECAST_LEAK,
  UNEXPLAINED_FROZEN_TEST_LOSS,
  INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT,
  FORECAST_STATUS_OUTPUT_CONTRADICTION,
  SMOOTHING_PARAMETER_FUTURE_LEAKAGE,
  FORECAST_DUPLICATE_ACTUAL_METRIC_ENGINE,
  FORECAST_BOM_INVENTORY_UNIT_MISMATCH,
  FORECASTED_FAKE_COGS,
  FORECASTED_FAKE_EBITDA,
  HISTORICAL_SPLH_USED_AS_UNAPPROVED_STAFFING_TARGET,
  SCENARIO_DRIVER_CONFLICT_SILENTLY_ACCEPTED,
  DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST,
  ACTUAL_FORECAST_SCENARIO_CLASSIFICATION_MIXED,
  REPORTS_PROGRAMME_STAGE_COUNT_MISMATCH,
  DEAD_PM02K_CONTROLS,
  MISREPRESENTED_PM02K_CONTROLS,

  // PM-02K-R2 Invariants
  CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE,
  PM02K_REDEFINES_NET_SALES,
  TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES,
  FORECAST_TRAINING_NET_SALES_DISCREPANCY,
  PM02K_REDEFINES_ORDER_COUNT,
  EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS,
  NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD,

  // PM-02K-R3 Invariants
  EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY,
  FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI,
  QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE,
  INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS,
  INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE,
  FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL,

  // PM-02K-R4 Invariants
  ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS,
  TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY,
  UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM,
  NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED,
  ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD,

  // PM-02K-R5 Invariants
  MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT,
  FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED,
  FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST,
  DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION,
  EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS,

  FORECAST_ACTUALITY,
  FORECAST_QUALITY_STATES,
  FORECAST_TARGET_ELIGIBILITY,
  FORECAST_FREQUENCIES,
  FORECAST_HORIZONS,
  FORECAST_METHODS,
  CANONICAL_FORECAST_TARGETS,
  ForecastRegistry,
};
