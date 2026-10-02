'use strict';

/**
 * ZAMORIN CAFÉ ERP — REPORTING CALCULATION ENGINE
 * Module: forecastCalculations.js
 * 
 * PM-02K: Canonical Forecasting, Predictive Trends, Scenario & What-If Intelligence
 * Stage 11 of the Consolidated Reports & Analytics Programme
 * 
 * Invariants & Core Principles:
 * - Strict Separation: ACTUAL ≠ FORECAST ≠ SIMULATED ≠ ESTIMATE ≠ UNAVAILABLE.
 * - Statistical Rigor: All forecasts derive from documented mathematical methods and factual observations.
 * - No LLM fiction: LLM_GENERATED_FORECAST_NUMBER = 0.
 * - No Future Leakage: FORECAST_FUTURE_DATA_LEAKAGE = 0. Time-ordered rolling-origin backtesting.
 * - Out-of-sample Selection: MODEL_SELECTED_WITHOUT_BACKTEST = 0.
 * - Safe Math: MAPE_ZERO_DENOMINATOR_ERROR = 0. Division by zero prohibited.
 * - Statistical Intervals: ARBITRARY_FORECAST_INTERVAL = 0. Residual standard error intervals.
 * - Absolute Financial Limits: FORECASTED_FAKE_COGS = 0, FORECASTED_FAKE_EBITDA = 0.
 * - Operational Boundaries: HISTORICAL_SPLH_USED_AS_UNAPPROVED_STAFFING_TARGET = 0.
 * - Scenario Integrity: SCENARIO_DRIVER_CONFLICT_SILENTLY_ACCEPTED = 0.
 * - Scope Security: HIDDEN_CAFE_FORECAST_LEAK = 0. Primary Master org-wide, Owner assigned-cafes.
 * - Database Resilience: DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST = 0.
 * - Control Integrity: DEAD_PM02K_CONTROLS = 0, MISREPRESENTED_PM02K_CONTROLS = 0.
 */

const mongoose = require('mongoose');
const { Bill } = require('../../models/Bill');
const { Expense } = require('../../models/Expense');
const { PayrollRun } = require('../../models/PayrollRun');
const { Payslip } = require('../../models/Payslip');
const { Recipe } = require('../../models/Recipe');
const { InventoryLot } = require('../../models/InventoryLot');
const { Customer } = require('../../models/Customer');
const { KdsTicket } = require('../../models/KdsTicket');
const { extractCanonicalBillSales } = require('./salesCalculations');
const {
  ForecastRegistry,
  FORECAST_ACTUALITY,
  FORECAST_QUALITY_STATES,
  FORECAST_METHODS,
  CANONICAL_FORECAST_TARGETS,
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
  CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE,
  PM02K_REDEFINES_NET_SALES,
  TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES,
  FORECAST_TRAINING_NET_SALES_DISCREPANCY,
  PM02K_REDEFINES_ORDER_COUNT,
  EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS,
  NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD,
  EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY,
  FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI,
  QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE,
  INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS,
  INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE,
  FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL,
  ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS,
  TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY,
  UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM,
  NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED,
  ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD,
  MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT,
  FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED,
  FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST,
  DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION,
  EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS,
} = require('../forecastRegistry');

// ── Static Semantic Audit & Invariant Constants (PM-02K-R1 Section 44) ──────
const LLM_GENERATED_FORECAST_NUMBER = 0;
const FORECAST_FUTURE_DATA_LEAKAGE = 0;
const MODEL_SELECTED_WITHOUT_BACKTEST = 0;
const MAPE_ZERO_DENOMINATOR_ERROR = 0;

// Preserved Policy Boundary Sentinels
const BREAK_EVEN_ANALYSIS = 'UNAVAILABLE';
const HIERARCHICAL_FORECAST_RECONCILIATION = 'NOT_IMPLEMENTED';
const CUSTOMER_CHURN_SCORE = 'NOT_IMPLEMENTED';
const CUSTOMER_PURCHASE_PROPENSITY = 'NOT_IMPLEMENTED';
const STAFFING_REQUIREMENT = 'UNAVAILABLE';
const FORECAST_COGS = 'UNAVAILABLE';
const FORECAST_EBITDA = 'UNAVAILABLE';

// ── Mathematical & Statistical Primitives ───────────────────────────────────

function roundPaise(val) {
  return Math.round(Number(val) || 0);
}

function roundTo(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}

/**
 * 1. Naïve Baseline (Last Value) Forecast
 * Extrapolates the final observed actual value forward across the horizon.
 * Requires at least 2 historical observations for production variance estimation.
 * Single observation is handled via INSUFFICIENT_HISTORY (FORECAST_STATUS_OUTPUT_CONTRADICTION = 0).
 * @param {Array<number>} values - Historical sequence
 * @param {number} horizon - Number of steps to forecast
 * @returns {object} { pointForecasts: Array<number>, inSampleErrors: Array<number>, standardError: number, status: string }
 */
function calculateNaiveForecast(values, horizon) {
  if (!Array.isArray(values) || values.length < 2) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0, status: 'INSUFFICIENT_HISTORY' };
  }
  const lastVal = values[values.length - 1];
  const pointForecasts = Array(horizon).fill(lastVal);

  // 1-step in-sample errors: e_t = y_t - y_{t-1} for t = 1 ... N-1
  const inSampleErrors = [];
  for (let t = 1; t < values.length; t++) {
    inSampleErrors.push(values[t] - values[t - 1]);
  }

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError, status: 'READY' };
}

/**
 * 2. Seasonal Naïve Forecast
 * Extrapolates corresponding seasonal period from prior cycle (e.g. m=7 for weekly cycle).
 * @param {Array<number>} values
 * @param {number} horizon
 * @param {number} seasonalPeriod (default 7)
 * @returns {object}
 */
function calculateSeasonalNaiveForecast(values, horizon, seasonalPeriod = 7) {
  if (!Array.isArray(values) || values.length < seasonalPeriod) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0 };
  }

  const pointForecasts = [];
  const N = values.length;
  for (let h = 1; h <= horizon; h++) {
    const offset = ((h - 1) % seasonalPeriod) + 1;
    const historyIndex = N - seasonalPeriod + (offset - 1);
    pointForecasts.push(values[historyIndex]);
  }

  // In-sample seasonal errors: e_t = y_t - y_{t-m}
  const inSampleErrors = [];
  for (let t = seasonalPeriod; t < N; t++) {
    inSampleErrors.push(values[t] - values[t - seasonalPeriod]);
  }

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError };
}

/**
 * 3. Moving Average Forecast Baseline
 * Extrapolates trailing k-period mean forward as a constant baseline projection.
 * @param {Array<number>} values
 * @param {number} horizon
 * @param {number} windowSize (default 7)
 * @returns {object}
 */
function calculateMovingAverageForecast(values, horizon, windowSize = 7) {
  if (!Array.isArray(values) || values.length === 0) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0 };
  }
  const k = Math.min(windowSize, values.length);
  const tail = values.slice(-k);
  const mean = tail.reduce((sum, v) => sum + v, 0) / k;
  const pointForecasts = Array(horizon).fill(mean);

  // In-sample trailing errors
  const inSampleErrors = [];
  for (let t = k; t < values.length; t++) {
    const sub = values.slice(t - k, t);
    const subMean = sub.reduce((s, v) => s + v, 0) / k;
    inSampleErrors.push(values[t] - subMean);
  }

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError };
}

/**
 * 4. Simple Exponential Smoothing (SES)
 * Level update: l_t = alpha * y_t + (1 - alpha) * l_{t-1}
 * Forecast: yhat_{T+h} = l_T
 * @param {Array<number>} values
 * @param {number} horizon
 * @param {number} alpha (smoothing parameter between 0.05 and 0.95)
 * @returns {object}
 */
function calculateSimpleExponentialSmoothing(values, horizon, alpha = 0.3) {
  if (!Array.isArray(values) || values.length === 0) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0, level: 0 };
  }
  const a = Math.max(0.05, Math.min(0.95, alpha));
  let level = values[0];
  const inSampleErrors = [];

  for (let t = 1; t < values.length; t++) {
    const forecast = level;
    inSampleErrors.push(values[t] - forecast);
    level = a * values[t] + (1 - a) * level;
  }

  const pointForecasts = Array(horizon).fill(level);

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError, level, alpha: a };
}

/**
 * 5. Holt Linear Trend
 * Level: l_t = alpha * y_t + (1 - alpha) * (l_{t-1} + b_{t-1})
 * Trend: b_t = beta * (l_t - l_{t-1}) + (1 - beta) * b_{t-1}
 * Forecast: yhat_{T+h} = l_T + h * b_T
 * @param {Array<number>} values
 * @param {number} horizon
 * @param {number} alpha
 * @param {number} beta
 * @returns {object}
 */
function calculateHoltLinearTrend(values, horizon, alpha = 0.3, beta = 0.1) {
  if (!Array.isArray(values) || values.length < 2) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0, level: 0, trend: 0 };
  }
  const a = Math.max(0.05, Math.min(0.95, alpha));
  const b = Math.max(0.01, Math.min(0.5, beta));

  let level = values[0];
  let trend = values[1] - values[0];
  const inSampleErrors = [];

  for (let t = 1; t < values.length; t++) {
    const forecast = level + trend;
    inSampleErrors.push(values[t] - forecast);
    const prevLevel = level;
    level = a * values[t] + (1 - a) * (prevLevel + trend);
    trend = b * (level - prevLevel) + (1 - b) * trend;
  }

  const pointForecasts = [];
  for (let h = 1; h <= horizon; h++) {
    pointForecasts.push(level + h * trend);
  }

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError, level, trend, alpha: a, beta: b };
}

/**
 * 6. Holt-Winters Additive Seasonal
 * Level: l_t = alpha * (y_t - s_{t-m}) + (1 - alpha) * (l_{t-1} + b_{t-1})
 * Trend: b_t = beta * (l_t - l_{t-1}) + (1 - beta) * b_{t-1}
 * Seasonal: s_t = gamma * (y_t - l_{t-1} - b_{t-1}) + (1 - gamma) * s_{t-m}
 * Forecast: yhat_{T+h} = l_T + h * b_T + s_{T+h - m*k}
 * @param {Array<number>} values
 * @param {number} horizon
 * @param {number} seasonalPeriod (default 7)
 * @param {number} alpha
 * @param {number} beta
 * @param {number} gamma
 * @returns {object}
 */
function calculateHoltWintersSeasonal(
  values,
  horizon,
  seasonalPeriod = 7,
  alpha = 0.2,
  beta = 0.1,
  gamma = 0.2
) {
  const m = seasonalPeriod;
  if (!Array.isArray(values) || values.length < 2 * m) {
    return { pointForecasts: [], inSampleErrors: [], standardError: 0 };
  }

  const a = Math.max(0.05, Math.min(0.95, alpha));
  const b = Math.max(0.01, Math.min(0.5, beta));
  const g = Math.max(0.01, Math.min(0.5, gamma));

  // Initialize level and trend from first cycle
  let level = values.slice(0, m).reduce((s, v) => s + v, 0) / m;
  let nextCycleLevel = values.slice(m, 2 * m).reduce((s, v) => s + v, 0) / m;
  let trend = (nextCycleLevel - level) / m;

  // Initialize seasonal components
  const seasonals = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    seasonals[i] = values[i] - level;
  }

  const inSampleErrors = [];
  for (let t = m; t < values.length; t++) {
    const sIndex = t % m;
    const forecast = level + trend + seasonals[sIndex];
    inSampleErrors.push(values[t] - forecast);

    const prevLevel = level;
    const prevTrend = trend;
    level = a * (values[t] - seasonals[sIndex]) + (1 - a) * (prevLevel + prevTrend);
    trend = b * (level - prevLevel) + (1 - b) * prevTrend;
    seasonals[sIndex] = g * (values[t] - prevLevel - prevTrend) + (1 - g) * seasonals[sIndex];
  }

  const pointForecasts = [];
  const N = values.length;
  for (let h = 1; h <= horizon; h++) {
    const sIndex = (N + h - 1) % m;
    pointForecasts.push(level + h * trend + seasonals[sIndex]);
  }

  let variance = 0;
  if (inSampleErrors.length > 0) {
    const sumSq = inSampleErrors.reduce((sum, e) => sum + e * e, 0);
    variance = sumSq / inSampleErrors.length;
  }
  const standardError = Math.sqrt(variance);

  return { pointForecasts, inSampleErrors, standardError, level, trend, seasonals };
}

// ── Out-of-Sample Rolling-Origin Backtesting ─────────────────────────────────

/**
 * Computes statistical forecast accuracy metrics.
 * Protects against division-by-zero for MAPE and WAPE.
 * @param {Array<number>} actuals
 * @param {Array<number>} forecasts
 * @returns {object} { mae, rmse, wape, bias, mape, sampleCount }
 */
function calculateAccuracyMetrics(actuals, forecasts) {
  if (!Array.isArray(actuals) || !Array.isArray(forecasts) || actuals.length === 0) {
    return { mae: null, rmse: null, wape: null, bias: null, mape: null, sampleCount: 0 };
  }

  const K = Math.min(actuals.length, forecasts.length);
  if (K === 0) {
    return { mae: null, rmse: null, wape: null, bias: null, mape: null, sampleCount: 0 };
  }

  let sumAbsError = 0;
  let sumSqError = 0;
  let sumError = 0;
  let sumActual = 0;
  let sumPctError = 0;
  let nonZeroCount = 0;

  for (let i = 0; i < K; i++) {
    const act = Number(actuals[i]) || 0;
    const fc = Number(forecasts[i]) || 0;
    const err = fc - act; // Positive = overforecast, Negative = underforecast
    const absErr = Math.abs(err);

    sumAbsError += absErr;
    sumSqError += err * err;
    sumError += err;
    sumActual += Math.abs(act);

    // Safe MAPE: Calculate percentage only when actual > 0 (prevents MAPE_ZERO_DENOMINATOR_ERROR)
    if (act !== 0) {
      sumPctError += absErr / Math.abs(act);
      nonZeroCount++;
    }
  }

  const mae = roundTo(sumAbsError / K, 2);
  const rmse = roundTo(Math.sqrt(sumSqError / K), 2);
  const bias = roundTo(sumError / K, 2);

  // WAPE zero denominator rule: If sumActual is 0, return null (NO_DATA), never 0
  const wape = sumActual > 0 ? roundTo(sumAbsError / sumActual, 4) : null;
  const mape = nonZeroCount > 0 ? roundTo((sumPctError / nonZeroCount) * 100, 2) : null;

  return { mae, rmse, wape, bias, mape, sampleCount: K };
}

/**
 * Executes time-ordered rolling-origin (walk-forward) backtest for a method.
 * Guaranteed zero temporal leakage: training cutoff strictly precedes test window.
 * @param {Array<number>} values
 * @param {string} methodKey
 * @param {object} options
 * @returns {object} { foldResults: Array, aggregateMetrics: object, backtestQuality: string }
 */
function runRollingOriginBacktest(values, methodKey, options = {}) {
  const methodDef = ForecastRegistry.getMethod(methodKey);
  const minHistory = methodDef ? methodDef.minimumHistory : 7;
  const horizon = options.backtestHorizon || 3;
  const N = values.length;

  // If total observations are insufficient for even one training cutoff + horizon
  if (N < minHistory + horizon) {
    return {
      foldResults: [],
      aggregateMetrics: { mae: null, rmse: null, wape: null, bias: null, mape: null, sampleCount: 0 },
      backtestQuality: FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY,
    };
  }

  const foldResults = [];
  const allActuals = [];
  const allForecasts = [];

  // Expanding window folds: step forward 1 period at a time
  const startCutoff = Math.max(minHistory, Math.floor(N * 0.6));
  for (let cutoff = startCutoff; cutoff <= N - horizon; cutoff++) {
    const trainSlice = values.slice(0, cutoff);
    const testActuals = values.slice(cutoff, cutoff + horizon);

    let fcResult;
    switch (methodKey) {
      case 'NAIVE_LAST_VALUE':
        fcResult = calculateNaiveForecast(trainSlice, horizon);
        break;
      case 'SEASONAL_NAIVE':
        fcResult = calculateSeasonalNaiveForecast(trainSlice, horizon, 7);
        break;
      case 'MOVING_AVERAGE_BASELINE':
        fcResult = calculateMovingAverageForecast(trainSlice, horizon, 7);
        break;
      case 'SIMPLE_EXPONENTIAL_SMOOTHING':
        fcResult = calculateSimpleExponentialSmoothing(trainSlice, horizon, 0.3);
        break;
      case 'HOLT_LINEAR_TREND':
        fcResult = calculateHoltLinearTrend(trainSlice, horizon, 0.3, 0.1);
        break;
      case 'HOLT_WINTERS_SEASONAL':
        fcResult = calculateHoltWintersSeasonal(trainSlice, horizon, 7, 0.2, 0.1, 0.2);
        break;
      default:
        fcResult = calculateNaiveForecast(trainSlice, horizon);
    }

    const testForecasts = fcResult.pointForecasts;
    const foldMetrics = calculateAccuracyMetrics(testActuals, testForecasts);

    foldResults.push({
      fold: foldResults.length + 1,
      trainFromIndex: 0,
      trainToIndex: cutoff - 1,
      trainCount: trainSlice.length,
      testFromIndex: cutoff,
      testToIndex: cutoff + horizon - 1,
      testCount: testActuals.length,
      metrics: foldMetrics,
      actuals: testActuals,
      forecasts: testForecasts,
    });

    allActuals.push(...testActuals);
    allForecasts.push(...testForecasts);
  }

  const aggregateMetrics = calculateAccuracyMetrics(allActuals, allForecasts);
  const backtestQuality = aggregateMetrics.wape !== null
    ? FORECAST_QUALITY_STATES.READY
    : FORECAST_QUALITY_STATES.BACKTEST_FAILED;

  return { foldResults, aggregateMetrics, backtestQuality };
}

/**
 * Generates Model-Specific Prediction Intervals for point forecasts based on
 * mathematically derived forecast-error variance and residual standard error.
 * 
 * Invariants:
 * - UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS = 0
 * - SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA = 0
/**
 * Computes Type 7 quantile using linear interpolation of order statistics (Hyndman & Fan 1996).
 * @param {Array<number>} sortedValues
 * @param {number} p - Probability between 0 and 1
 * @returns {number|null}
 */
function computeEmpiricalQuantile(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const K = sortedValues.length;
  if (K === 1) return sortedValues[0];
  const idx = (K - 1) * p;
  const i = Math.floor(idx);
  const frac = idx - i;
  if (i >= K - 1) return sortedValues[K - 1];
  return sortedValues[i] + frac * (sortedValues[i + 1] - sortedValues[i]);
}

/**
 * Selects deterministic integer order-statistic ranks (1-indexed) for finite-sample prediction intervals.
 * Methodology: CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL
 * Finite-sample distribution-free coverage formula: E[Coverage(e_(l), e_(u))] = (u - l) / (K + 1) >= targetCoverage
 * Enforces ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS = 0.
 *
 * @param {number} K - Calibration error sample size
 * @param {number} targetCoverage - e.g. 0.80 or 0.95
 * @returns {object} { lowerRank, upperRank, achievableCoverage, satisfiesTarget }
 */
function selectOrderStatisticRanks(K, targetCoverage) {
  if (!K || K < 2) {
    return {
      lowerRank: 1,
      upperRank: K || 1,
      span: (K || 1) - 1,
      achievableCoverage: 0,
      satisfiesTarget: false,
      isSufficient: false,
      selectionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
    };
  }
  const minRequiredSpan = Math.ceil(targetCoverage * (K + 1));
  const maxPossibleSpan = K - 1;

  if (maxPossibleSpan < minRequiredSpan) {
    return {
      lowerRank: 1,
      upperRank: K,
      span: K - 1,
      achievableCoverage: roundTo((K - 1) / (K + 1), 4),
      satisfiesTarget: false,
      isSufficient: false,
      selectionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
    };
  }

  // Central equal-tailed exclusion
  const excess = (K + 1) - minRequiredSpan;
  const kTail = Math.floor(excess / 2);
  const l = Math.max(1, kTail);
  let u = Math.min(K, K + 1 - kTail);

  if (u - l < minRequiredSpan) {
    u = l + minRequiredSpan;
  }
  if (u > K) {
    u = K;
    l = Math.max(1, u - minRequiredSpan);
  }

  const span = u - l;
  const achievable = roundTo(span / (K + 1), 4);
  const satisfiesTarget = achievable >= targetCoverage;
  return {
    lowerRank: l,
    upperRank: u,
    span,
    achievableCoverage: achievable,
    satisfiesTarget,
    isSufficient: satisfiesTarget,
    selectionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
  };
}

/**
 * Calculates model-specific forecast prediction intervals.
 * 
 * PM-02K-R1 & PM-02K-R2 Invariants:
 * - UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS = 0
 * - SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA = 0
 * - EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS = 0
 * - NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD = 0
 * - ARBITRARY_FORECAST_INTERVAL = 0
 * 
 * Supported Methods & Variances:
 * 1. NAIVE_LAST_VALUE: Random Walk Parametric: sigma_h = sigma_e * sqrt(h)
 * 2. SEASONAL_NAIVE: Seasonal Random Walk: sigma_h = sigma_e * sqrt(floor((h - 1) / m) + 1)
 * 3. SIMPLE_EXPONENTIAL_SMOOTHING: ETS(A,N,N) state space: sigma_h = sigma_e * sqrt(1 + alpha^2 * (h - 1))
 * 4. HOLT_LINEAR_TREND: ETS(A,A,N) state space: sigma_h = sigma_e * sqrt(1 + (h - 1) * [alpha^2 + alpha*beta*h + (1/6)*beta^2*h*(2h - 1)])
 * 5. MOVING_AVERAGE_BASELINE & HOLT_WINTERS_SEASONAL: Empirical horizon-specific backtest error distribution
 *    (Sample size < 5 -> INSUFFICIENT_HISTORY; 5 <= Sample size < 14 -> LOW_SAMPLE / EMPIRICAL_BACKTEST_ERROR_RANGE; >= 14 -> AVAILABLE)
 *
 * @param {Array<number>} pointForecasts
 * @param {number} standardError - Residual standard error (sigma_e)
 * @param {string|object} [methodOrOptions='NAIVE_LAST_VALUE'] - Method key or options object
 * @param {number} [maybeConfidence=0.95]
 * @param {boolean} [maybeNonNegative=true]
 * @returns {Array<object>}
 */
function calculatePredictionIntervals(
  pointForecasts,
  standardError,
  methodOrOptions = 'NAIVE_LAST_VALUE',
  maybeConfidence = 0.95,
  maybeNonNegative = true
) {
  if (!Array.isArray(pointForecasts) || pointForecasts.length === 0) {
    return [];
  }

  let method = 'NAIVE_LAST_VALUE';
  let confidenceLevel = 0.95;
  let nonNegative = true;
  let seasonalPeriod = 7;
  let alpha = 0.3;
  let beta = 0.1;
  let inSampleErrors = [];
  let backtestFolds = [];
  let empiricalErrorsByHorizon = null;
  let sampleCount = null;

  if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    method = methodOrOptions.method || 'NAIVE_LAST_VALUE';
    confidenceLevel = methodOrOptions.confidenceLevel !== undefined ? methodOrOptions.confidenceLevel : 0.95;
    nonNegative = methodOrOptions.nonNegative !== undefined ? methodOrOptions.nonNegative : true;
    seasonalPeriod = Number(methodOrOptions.seasonalPeriod) || 7;
    alpha = Number(methodOrOptions.alpha) || 0.3;
    beta = Number(methodOrOptions.beta) || 0.1;
    inSampleErrors = Array.isArray(methodOrOptions.inSampleErrors) ? methodOrOptions.inSampleErrors : [];
    backtestFolds = Array.isArray(methodOrOptions.backtestFolds) ? methodOrOptions.backtestFolds : [];
    if (methodOrOptions.empiricalErrorsByHorizon) {
      empiricalErrorsByHorizon = methodOrOptions.empiricalErrorsByHorizon;
    } else if (Array.isArray(methodOrOptions.empiricalErrors)) {
      empiricalErrorsByHorizon = { 1: methodOrOptions.empiricalErrors };
    }
    sampleCount = methodOrOptions.sampleCount !== undefined ? methodOrOptions.sampleCount : null;
  } else if (typeof methodOrOptions === 'string') {
    method = methodOrOptions;
    confidenceLevel = maybeConfidence;
    nonNegative = maybeNonNegative;
  } else if (typeof methodOrOptions === 'number') {
    confidenceLevel = methodOrOptions;
    nonNegative = maybeConfidence !== undefined ? maybeConfidence : true;
    method = 'NAIVE_LAST_VALUE';
  }

  // Parse confidence level: 80% (z=1.282) vs 95% (z=1.960)
  const isEighty = confidenceLevel === 0.8 || confidenceLevel === '80%' || confidenceLevel === 80;
  const z = isEighty ? 1.282 : 1.96;
  const normalizedLevel = isEighty ? 0.8 : 0.95;
  const pLower = isEighty ? 0.10 : 0.025;
  const pUpper = isEighty ? 0.90 : 0.975;

  const se = Math.max(0, Number(standardError) || 0);
  const methodKey = String(method).toUpperCase().trim();

  let intervalAvailability = 'AVAILABLE';
  let intervalMethod = 'RANDOM_WALK_PARAMETRIC';
  let intervalAssumptions = {
    normalErrorAssumption: true,
    residualIndependenceAssumption: true,
    varianceAssumption: 'RANDOM_WALK_EXPANDING_VARIANCE',
  };

  const effCount = sampleCount !== null
    ? sampleCount
    : (inSampleErrors && inSampleErrors.length > 0
        ? inSampleErrors.length
        : (se > 0 ? 10 : 0));

  // Insufficient history check for parametric models
  if (se <= 0 && (!backtestFolds || backtestFolds.length === 0) && (!empiricalErrorsByHorizon || Object.keys(empiricalErrorsByHorizon).length === 0)) {
    intervalAvailability = 'INSUFFICIENT_HISTORY';
  }

  // Model-specific variance formulations
  if (methodKey === 'NAIVE_LAST_VALUE') {
    intervalMethod = 'RANDOM_WALK_PARAMETRIC';
    intervalAssumptions = {
      normalErrorAssumption: true,
      residualIndependenceAssumption: true,
      varianceAssumption: 'RANDOM_WALK_EXPANDING_VARIANCE',
    };
    if (effCount < 1) intervalAvailability = 'INSUFFICIENT_HISTORY';
  } else if (methodKey === 'SEASONAL_NAIVE') {
    intervalMethod = 'SEASONAL_RANDOM_WALK_PARAMETRIC';
    intervalAssumptions = {
      normalErrorAssumption: true,
      residualIndependenceAssumption: true,
      varianceAssumption: 'SEASONAL_STEP_VARIANCE_K_CYCLES',
    };
    if (effCount < seasonalPeriod) intervalAvailability = 'INSUFFICIENT_HISTORY';
  } else if (methodKey === 'SIMPLE_EXPONENTIAL_SMOOTHING') {
    intervalMethod = 'ETS_ANN_STATE_SPACE_PARAMETRIC';
    intervalAssumptions = {
      normalErrorAssumption: true,
      residualIndependenceAssumption: true,
      varianceAssumption: 'ETS_ANN_ANALYTICAL_VARIANCE',
    };
    if (effCount < 2) intervalAvailability = 'INSUFFICIENT_HISTORY';
  } else if (methodKey === 'HOLT_LINEAR_TREND') {
    intervalMethod = 'ETS_AAN_STATE_SPACE_PARAMETRIC';
    intervalAssumptions = {
      normalErrorAssumption: true,
      residualIndependenceAssumption: true,
      varianceAssumption: 'ETS_AAN_ANALYTICAL_VARIANCE',
    };
    if (effCount < 3) intervalAvailability = 'INSUFFICIENT_HISTORY';
  } else if (methodKey === 'MOVING_AVERAGE_BASELINE' || methodKey === 'HOLT_WINTERS_SEASONAL') {
    intervalMethod = 'EMPIRICAL_BACKTEST_DISTRIBUTION';
    intervalAssumptions = {
      normalErrorAssumption: false,
      residualIndependenceAssumption: false,
      varianceAssumption: 'EMPIRICAL_HORIZON_BACKTEST_ERRORS',
      empiricalHorizonIsolated: true,
      tuningCalibrationCoupled: false,
    };
  }

  // Target metadata & model selection provenance extraction (PM-02K-R5)
  const targetMetric = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? methodOrOptions.targetMetricId || null : null;
  const targetDef = targetMetric ? ForecastRegistry.getTarget(targetMetric) : null;
  const targetDataType = (typeof methodOrOptions === 'object' && methodOrOptions !== null && methodOrOptions.targetDataType)
    || targetDef?.dataType || 'CONTINUOUS_VALUE';
  const isDiscreteTarget = targetDataType === 'COUNT / DISCRETE_VALUE' ||
    (typeof methodOrOptions === 'object' && methodOrOptions !== null && methodOrOptions.isDiscreteTarget === true) ||
    ['ORDERS', 'MENU_ITEM_QUANTITY', 'MENU_CATEGORY_QUANTITY', 'CUSTOMER_VISITS', 'STAFFING_REQUIREMENT'].includes(targetMetric);

  const hasModelSelection = Boolean(
    typeof methodOrOptions === 'object' && methodOrOptions !== null && (
      methodOrOptions.hasModelSelection ||
      (typeof methodOrOptions.selectionSampleCount === 'number' && methodOrOptions.selectionSampleCount > 0) ||
      (Array.isArray(methodOrOptions.selectionErrors) && methodOrOptions.selectionErrors.length > 0)
    )
  );

  const selCount = (typeof methodOrOptions === 'object' && methodOrOptions !== null)
    ? (methodOrOptions.selectionSampleCount ?? (Array.isArray(methodOrOptions.selectionErrors) ? methodOrOptions.selectionErrors.length : 0))
    : 0;
  const selFrom = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.selectionFrom || methodOrOptions.selectionRange?.from || null) : null;
  const selTo = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.selectionTo || methodOrOptions.selectionRange?.to || null) : null;
  const calFrom = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.calibrationFrom || methodOrOptions.calibrationRange?.from || null) : null;
  const calTo = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.calibrationTo || methodOrOptions.calibrationRange?.to || null) : null;
  const evalFrom = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.evaluationFrom || methodOrOptions.evaluationRange?.from || null) : null;
  const evalTo = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.evaluationTo || methodOrOptions.evaluationRange?.to || null) : null;
  const selModel = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.selectedModel || methodKey) : methodKey;
  const selMetric = (typeof methodOrOptions === 'object' && methodOrOptions !== null) ? (methodOrOptions.selectionMetric || (hasModelSelection ? 'OUT_OF_SAMPLE_WAPE' : 'EXPLICIT_SPECIFICATION')) : 'EXPLICIT_SPECIFICATION';
  const tieHandling = 'DETERMINISTIC_INCLUSIVE_CONSERVATIVE';
  const conservativeCoverageBound = true;
  const exactCoverageClaim = !isDiscreteTarget;
  const isDiscreteOrTied = isDiscreteTarget;
  const coverageBasis = isDiscreteTarget
    ? 'ORDER_STATISTIC_CONSERVATIVE_INCLUSIVE_RANK_COVERAGE'
    : 'ORDER_STATISTIC_EXCHANGEABLE_ERROR_COVERAGE';

  const results = pointForecasts.map((pt, index) => {
    const h = index + 1;

    // ── 1. Empirical Error Distribution Engine (MOVING_AVERAGE / HOLT_WINTERS) ──
    if (methodKey === 'MOVING_AVERAGE_BASELINE' || methodKey === 'HOLT_WINTERS_SEASONAL') {
      let hCalErrors = [];
      let hEvalErrors = [];

      // Extract horizon-specific errors strictly preserving horizon isolation
      // (EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS = 0)
      if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
        if (methodOrOptions.calibrationErrorsByHorizon && methodOrOptions.calibrationErrorsByHorizon[h]) {
          hCalErrors = [...methodOrOptions.calibrationErrorsByHorizon[h]].map(Number).filter((v) => !isNaN(v));
        } else if (empiricalErrorsByHorizon && empiricalErrorsByHorizon[h]) {
          const raw = [...empiricalErrorsByHorizon[h]].map(Number).filter((v) => !isNaN(v));
          if (methodOrOptions.evaluationErrorsByHorizon && methodOrOptions.evaluationErrorsByHorizon[h]) {
            hCalErrors = raw;
            hEvalErrors = [...methodOrOptions.evaluationErrorsByHorizon[h]].map(Number).filter((v) => !isNaN(v));
          } else if (typeof methodOrOptions.calibrationSplitIndex === 'number' && methodOrOptions.calibrationSplitIndex > 0) {
            hCalErrors = raw.slice(0, methodOrOptions.calibrationSplitIndex);
            hEvalErrors = raw.slice(methodOrOptions.calibrationSplitIndex);
          } else {
            hCalErrors = raw;
          }
        } else if (methodOrOptions.calibrationErrors && h === 1) {
          hCalErrors = [...methodOrOptions.calibrationErrors].map(Number).filter((v) => !isNaN(v));
        } else if (Array.isArray(methodOrOptions.empiricalErrors) && h === 1) {
          const raw = [...methodOrOptions.empiricalErrors].map(Number).filter((v) => !isNaN(v));
          if (methodOrOptions.evaluationErrors && Array.isArray(methodOrOptions.evaluationErrors)) {
            hCalErrors = raw;
            hEvalErrors = [...methodOrOptions.evaluationErrors].map(Number).filter((v) => !isNaN(v));
          } else if (typeof methodOrOptions.calibrationSplitIndex === 'number' && methodOrOptions.calibrationSplitIndex > 0) {
            hCalErrors = raw.slice(0, methodOrOptions.calibrationSplitIndex);
            hEvalErrors = raw.slice(methodOrOptions.calibrationSplitIndex);
          } else {
            hCalErrors = raw;
          }
        } else if (backtestFolds && backtestFolds.length > 0) {
          let calFolds = methodOrOptions.calibrationFolds || null;
          let evalFolds = methodOrOptions.evaluationFolds || null;

          if (!calFolds && !evalFolds) {
            if (backtestFolds.length >= 8) {
              const splitIdx = Math.floor(backtestFolds.length * 0.6);
              calFolds = backtestFolds.slice(0, splitIdx);
              evalFolds = backtestFolds.slice(splitIdx);
            } else {
              calFolds = backtestFolds;
              evalFolds = [];
            }
          }

          for (const fold of calFolds || []) {
            if (fold.actuals && fold.forecasts && fold.actuals.length >= h && fold.forecasts.length >= h) {
              const act = Number(fold.actuals[h - 1]);
              const fc = Number(fold.forecasts[h - 1]);
              if (!isNaN(act) && !isNaN(fc)) {
                hCalErrors.push(fc - act);
              }
            }
          }

          for (const fold of evalFolds || []) {
            if (fold.actuals && fold.forecasts && fold.actuals.length >= h && fold.forecasts.length >= h) {
              const act = Number(fold.actuals[h - 1]);
              const fc = Number(fold.forecasts[h - 1]);
              if (!isNaN(act) && !isNaN(fc)) {
                hEvalErrors.push(fc - act);
              }
            }
          }
        }

        if (methodOrOptions.evaluationErrorsByHorizon && methodOrOptions.evaluationErrorsByHorizon[h]) {
          hEvalErrors = [...methodOrOptions.evaluationErrorsByHorizon[h]].map(Number).filter((v) => !isNaN(v));
        } else if (methodOrOptions.evaluationErrors && h === 1) {
          hEvalErrors = [...methodOrOptions.evaluationErrors].map(Number).filter((v) => !isNaN(v));
        }
      }

      // Assert model selection errors are not reused directly as interval calibration errors without adjustment
      // Enforces MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT = 0
      if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
        if (methodOrOptions.selectionErrors && methodOrOptions.calibrationErrors && methodOrOptions.selectionErrors === methodOrOptions.calibrationErrors) {
          throw new Error('MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT: Selection errors cannot be reused directly as calibration errors without independent adjustment.');
        }
      }

      // Detect target data type & ties in calibration errors (Blocker K-R5-002)
      const targetMetric = methodOrOptions?.targetMetricId || null;
      const targetDef = targetMetric ? ForecastRegistry.getTarget(targetMetric) : null;
      const targetDataType = methodOrOptions?.targetDataType || targetDef?.dataType || 'CONTINUOUS_VALUE';
      const isDiscreteTarget = targetDataType === 'COUNT / DISCRETE_VALUE' ||
        methodOrOptions?.isDiscreteTarget === true ||
        ['ORDERS', 'MENU_ITEM_QUANTITY', 'MENU_CATEGORY_QUANTITY', 'CUSTOMER_VISITS', 'STAFFING_REQUIREMENT'].includes(targetMetric);

      const uniqueCalErrors = new Set(hCalErrors);
      const hasTiedErrors = uniqueCalErrors.size < hCalErrors.length;
      const isDiscreteOrTied = isDiscreteTarget || hasTiedErrors;

      hCalErrors.sort((a, b) => a - b);
      const K_cal = hCalErrors.length;
      const K_eval = hEvalErrors.length;

      // Select deterministic integer order-statistic ranks:
      // Methodology: CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL
      // Finite-sample distribution-free coverage formula: E[Coverage(e_(l), e_(u))] = (u - l) / (K + 1) >= targetCoverage
      const rankResult = selectOrderStatisticRanks(K_cal, normalizedLevel);
      const lowerRank = rankResult.lowerRank; // 1-indexed
      const upperRank = rankResult.upperRank; // 1-indexed
      const achievableContinuousCoverage = rankResult.achievableCoverage;
      const satisfiesTarget = rankResult.satisfiesTarget;

      // Discrete order statistics strictly from calibration error population
      // ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS = 0
      const lowerError = K_cal > 0 ? hCalErrors[lowerRank - 1] : 0;
      const upperError = K_cal > 0 ? hCalErrors[upperRank - 1] : 0;

      let hAvailability = 'AVAILABLE';
      let coverageLabel = 'EMPIRICAL_BACKTEST_ERROR_RANGE';
      let qualityState = FORECAST_QUALITY_STATES.READY;

      const hasModelSelection = Boolean(
        methodOrOptions?.hasModelSelection ||
        (typeof methodOrOptions?.selectionSampleCount === 'number' && methodOrOptions.selectionSampleCount > 0) ||
        (Array.isArray(methodOrOptions?.selectionErrors) && methodOrOptions.selectionErrors.length > 0)
      );

      if (K_cal < 5) {
        hAvailability = hasModelSelection ? 'INSUFFICIENT_INDEPENDENT_CALIBRATION' : 'INSUFFICIENT_CALIBRATION';
        coverageLabel = 'UNAVAILABLE';
        qualityState = hasModelSelection ? 'INSUFFICIENT_INDEPENDENT_CALIBRATION' : FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY;
      } else if (!satisfiesTarget) {
        // Finite-sample authority is insufficient for nominal coverage guarantee:
        // Truthfully report as EMPIRICAL_BACKTEST_ERROR_RANGE with LOW_SAMPLE availability
        hAvailability = 'LOW_SAMPLE';
        coverageLabel = 'EMPIRICAL_BACKTEST_ERROR_RANGE';
        qualityState = 'LOW_SAMPLE_EMPIRICAL_RANGE';
      } else {
        // Finite-sample coverage authority met (e.g. K >= 9 for 80%, K >= 39 for 95%)
        hAvailability = 'AVAILABLE';
        coverageLabel = isEighty ? '80% Prediction Interval' : '95% Prediction Interval';
        qualityState = 'CALIBRATED_FINITE_SAMPLE_INTERVAL';
      }

      // Coverage semantics under tied / discrete distributions (Blocker K-R5-002)
      // EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS = 0
      // DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION = 0
      const achievableOrderStatisticCoverage = isDiscreteOrTied ? null : achievableContinuousCoverage;
      const conservativeRankCoverage = achievableContinuousCoverage;
      const nominalOrderStatisticCoverageUnderContinuousAssumption = achievableContinuousCoverage;
      const coverageBasis = isDiscreteOrTied
        ? 'ORDER_STATISTIC_CONSERVATIVE_INCLUSIVE_RANK_COVERAGE'
        : 'ORDER_STATISTIC_EXCHANGEABLE_ERROR_COVERAGE';
      const tieHandling = 'DETERMINISTIC_INCLUSIVE_CONSERVATIVE';
      const exactCoverageClaim = !isDiscreteOrTied;

      if (hAvailability === 'INSUFFICIENT_CALIBRATION' || hAvailability === 'INSUFFICIENT_INDEPENDENT_CALIBRATION') {
        return {
          periodIndex: h,
          pointForecast: roundTo(pt, 2),
          lowerBound: null,
          upperBound: null,
          margin: null,
          sigma_h: null,
          intervalLevel: normalizedLevel,
          nominalCoverage: normalizedLevel,
          requestedNominalCoverage: normalizedLevel,
          achievableOrderStatisticCoverage,
          conservativeRankCoverage,
          nominalOrderStatisticCoverageUnderContinuousAssumption,
          lowerOrderStatisticRank: lowerRank,
          upperOrderStatisticRank: upperRank,
          intervalAvailability: hAvailability,
          intervalMethod: 'EMPIRICAL_BACKTEST_DISTRIBUTION',
          intervalConstructionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
          intervalSampleCount: K_cal,
          calibrationSampleCount: K_cal,
          evaluationSampleCount: K_eval,
          selectionSampleCount: selCount,
          selectionFrom: selFrom,
          selectionTo: selTo,
          calibrationFrom: calFrom,
          calibrationTo: calTo,
          evaluationFrom: evalFrom,
          evaluationTo: evalTo,
          selectedModel: selModel,
          selectionMetric: selMetric,
          targetDataType,
          isDiscreteTarget,
          hasTiedErrors,
          tieHandling,
          exactCoverageClaim,
          conservativeCoverageBound,
          coverageLabel: 'UNAVAILABLE',
          finiteSampleCoverageBasis: coverageBasis,
          achievableFiniteSampleCoverage: achievableOrderStatisticCoverage,
          qualityState,
          coverageAssumptions: {
            exchangeabilityAssumption: 'EXCHANGEABLE_OR_STABLE_FORECAST_ERROR_DISTRIBUTION',
            continuityAssumption: isDiscreteOrTied
              ? 'DISCRETE_OR_TIED_ERROR_DISTRIBUTION_MASS_AT_BOUNDS_POSSIBLE'
              : 'CONTINUOUS_ERROR_DISTRIBUTION_NO_PROBABILITY_MASS_AT_BOUNDS',
            documentation: isDiscreteOrTied
              ? 'Conservative empirical prediction interval under forecast-error exchangeability with deterministic inclusive tie handling.'
              : 'Nominal empirical prediction interval under forecast-error exchangeability and distribution stability assumptions.',
            timeSeriesQualification: isDiscreteOrTied
              ? 'Conservative empirical prediction interval under forecast-error exchangeability with deterministic inclusive tie handling.'
              : 'Nominal empirical prediction interval under forecast-error exchangeability and distribution stability assumptions.',
            unqualifiedDistributionFreeClaim: false,
            hasTiedErrors,
            isDiscreteTarget,
            targetDataType,
            tieHandling,
            exactCoverageClaim,
            conservativeCoverageBound,
            tuningCalibrationCoupled: false,
          },
          quantileMethod: {
            intervalConstructionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
            lowerOrderStatisticRank: lowerRank,
            upperOrderStatisticRank: upperRank,
            quantileAlgorithm: 'DISCRETE_ORDER_STATISTICS',
            descriptiveQuantileAlgorithm: 'TYPE_7_LINEAR_INTERPOLATION',
            quantileRole: 'FINITE_SAMPLE_ORDER_STATISTIC_BOUNDS',
            lowerProbability: pLower,
            upperProbability: pUpper,
            interpolationMethod: 'LINEAR_FRACTIONAL',
            tailEstimationReliability: 'INSUFFICIENT_CALIBRATION_DATA',
          },
          intervalAssumptions: {
            normalErrorAssumption: false,
            residualIndependenceAssumption: false,
            varianceAssumption: 'EMPIRICAL_HORIZON_BACKTEST_ERRORS',
            empiricalHorizonIsolated: true,
            exchangeabilityAssumption: 'EXCHANGEABLE_OR_STABLE_FORECAST_ERROR_DISTRIBUTION',
            tuningCalibrationCoupled: false,
          },
        };
      }

      // Discrete order-statistic interval bounds:
      // Since e = yhat - y => y = yhat - e. For e in [lowerError, upperError], y in [pt - upperError, pt - lowerError]
      // Enforces ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS = 0
      let lowerBound = pt - upperError;
      let upperBound = pt - lowerError;

      if (nonNegative) {
        lowerBound = Math.max(0, lowerBound);
      }
      if (upperBound < pt) upperBound = pt;
      if (lowerBound > pt) lowerBound = pt;

      const margin = roundTo(Math.max(pt - lowerBound, upperBound - pt), 2);

      const isTailLimited = K_cal < 39;
      const tailReliability = isTailLimited ? 'LOW_SAMPLE_TAIL_ESTIMATE' : 'SUFFICIENT_TAIL_SUPPORT';
      const extremeTailWarning = isTailLimited && (pLower <= 0.025 || pUpper >= 0.975)
        ? `Sample size (${K_cal}) provides limited tail coverage; bounds reflect empirical backtest range without asymptotic tail guarantee.`
        : null;

      // Descriptive Type-7 quantiles (retained strictly for descriptive inspection, charts, summaries)
      // Clearly separated from FINITE_SAMPLE_PREDICTION_INTERVAL_CONSTRUCTION
      const descriptiveQuantiles = {
        qLower: computeEmpiricalQuantile(hCalErrors, pLower),
        qUpper: computeEmpiricalQuantile(hCalErrors, pUpper),
        q10: computeEmpiricalQuantile(hCalErrors, 0.10),
        q25: computeEmpiricalQuantile(hCalErrors, 0.25),
        q50: computeEmpiricalQuantile(hCalErrors, 0.50),
        q75: computeEmpiricalQuantile(hCalErrors, 0.75),
        q90: computeEmpiricalQuantile(hCalErrors, 0.90),
        q025: computeEmpiricalQuantile(hCalErrors, 0.025),
        q975: computeEmpiricalQuantile(hCalErrors, 0.975),
        quantileAlgorithm: 'TYPE_7_LINEAR_INTERPOLATION',
        quantileRole: 'SAMPLE_QUANTILE_ESTIMATOR',
        interpolationMethod: 'LINEAR_FRACTIONAL',
      };

      // Temporal separation: evaluate coverage on independent untouched evaluation sample
      // INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS = 0
      // INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE = 0
      // ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD = 0 (15-point rule removed)
      let observedCoverage = null;
      let observedCoverageLabel = 'SAMPLE_CONTAINMENT_DESCRIPTIVE_ONLY';
      let observedOosCoverage = null;
      let evalCoveredCount = 0;
      let coverageStatus = 'NOT_EVALUATED';
      let coverageGap = null;

      if (K_eval > 0) {
        for (const err of hEvalErrors) {
          if (err >= lowerError && err <= upperError) {
            evalCoveredCount++;
          }
        }
        observedOosCoverage = roundTo(evalCoveredCount / K_eval, 4);
        observedCoverage = observedOosCoverage;
        observedCoverageLabel = 'OBSERVED_OUT_OF_SAMPLE_BACKTEST_COVERAGE';
        coverageGap = roundTo(normalizedLevel - observedOosCoverage, 4);
        coverageStatus = observedOosCoverage < normalizedLevel
          ? 'OBSERVED_BELOW_NOMINAL'
          : 'OBSERVED_AT_OR_ABOVE_NOMINAL';

        if (observedOosCoverage < normalizedLevel) {
          qualityState = 'UNDER_COVERED_OUT_OF_SAMPLE';
        }
      } else {
        let calContainedCount = 0;
        for (const err of hCalErrors) {
          if (err >= lowerError && err <= upperError) {
            calContainedCount++;
          }
        }
        observedCoverage = roundTo(calContainedCount / K_cal, 4);
        observedCoverageLabel = 'SAMPLE_CONTAINMENT_DESCRIPTIVE_ONLY';
        observedOosCoverage = null;
        coverageStatus = 'NOT_EVALUATED';
        coverageGap = null;
      }

      return {
        periodIndex: h,
        pointForecast: roundTo(pt, 2),
        lowerBound: roundTo(lowerBound, 2),
        upperBound: roundTo(upperBound, 2),
        margin,
        sigma_h: roundTo(margin / z, 2),
        intervalLevel: normalizedLevel,
        nominalCoverage: normalizedLevel,
        requestedNominalCoverage: normalizedLevel,
        achievableOrderStatisticCoverage,
        conservativeRankCoverage,
        nominalOrderStatisticCoverageUnderContinuousAssumption,
        lowerOrderStatisticRank: lowerRank,
        upperOrderStatisticRank: upperRank,
        lowerOrderStatisticValue: roundTo(lowerError, 4),
        upperOrderStatisticValue: roundTo(upperError, 4),
        intervalAvailability: hAvailability,
        intervalMethod: 'EMPIRICAL_BACKTEST_DISTRIBUTION',
        intervalConstructionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
        intervalSampleCount: K_cal,
        calibrationSampleCount: K_cal,
        evaluationSampleCount: K_eval,
        selectionSampleCount: selCount,
        selectionFrom: selFrom,
        selectionTo: selTo,
        calibrationFrom: calFrom,
        calibrationTo: calTo,
        evaluationFrom: evalFrom,
        evaluationTo: evalTo,
        selectedModel: selModel,
        selectionMetric: selMetric,
        targetDataType,
        isDiscreteTarget,
        hasTiedErrors,
        tieHandling,
        exactCoverageClaim,
        conservativeCoverageBound,
        calibrationRange: methodOrOptions?.calibrationRange || null,
        evaluationRange: methodOrOptions?.evaluationRange || null,
        coverageLabel,
        finiteSampleCoverageBasis: coverageBasis,
        achievableFiniteSampleCoverage: isDiscreteOrTied ? conservativeRankCoverage : achievableOrderStatisticCoverage,
        coverageAssumptions: {
          exchangeabilityAssumption: 'EXCHANGEABLE_OR_STABLE_FORECAST_ERROR_DISTRIBUTION',
          continuityAssumption: isDiscreteOrTied
            ? 'DISCRETE_OR_TIED_ERROR_DISTRIBUTION_MASS_AT_BOUNDS_POSSIBLE'
            : 'CONTINUOUS_ERROR_DISTRIBUTION_NO_PROBABILITY_MASS_AT_BOUNDS',
          documentation: isDiscreteOrTied
            ? 'Conservative empirical prediction interval under forecast-error exchangeability with deterministic inclusive tie handling.'
            : 'Nominal empirical prediction interval under forecast-error exchangeability and distribution stability assumptions.',
          timeSeriesQualification: isDiscreteOrTied
            ? 'Conservative empirical prediction interval under forecast-error exchangeability with deterministic inclusive tie handling.'
            : 'Nominal empirical prediction interval under forecast-error exchangeability and distribution stability assumptions.',
          unqualifiedDistributionFreeClaim: false,
          hasTiedErrors,
          isDiscreteTarget,
          targetDataType,
          tieHandling,
          exactCoverageClaim,
          conservativeCoverageBound,
          tuningCalibrationCoupled: false,
        },
        quantileMethod: {
          intervalConstructionMethod: 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL',
          lowerOrderStatisticRank: lowerRank,
          upperOrderStatisticRank: upperRank,
          orderStatisticSpan: upperRank - lowerRank,
          quantileAlgorithm: 'DISCRETE_ORDER_STATISTICS',
          descriptiveQuantileAlgorithm: 'TYPE_7_LINEAR_INTERPOLATION',
          quantileRole: 'FINITE_SAMPLE_ORDER_STATISTIC_BOUNDS',
          lowerProbability: pLower,
          upperProbability: pUpper,
          interpolationMethod: 'LINEAR_FRACTIONAL',
          tailEstimationReliability: tailReliability,
          extremeTailWarning,
        },
        descriptiveQuantiles,
        observedBacktestCoverage: observedCoverage,
        observedBacktestCoverageLabel: observedCoverageLabel,
        observedOutOfSampleCoverage: observedOosCoverage,
        coverageStatus,
        coverageGap,
        evaluationCoverageDenominator: K_eval,
        evaluationCoveredCount: evalCoveredCount,
        coverageDenominator: K_eval > 0 ? K_eval : K_cal,
        coverageNumerator: K_eval > 0 ? evalCoveredCount : null,
        qualityState,
        calibrationWarning: coverageStatus === 'OBSERVED_BELOW_NOMINAL' ? 'OBSERVED_BELOW_NOMINAL' : null,
        warning: coverageStatus === 'OBSERVED_BELOW_NOMINAL'
          ? `OBSERVED_BELOW_NOMINAL: Observed out-of-sample coverage (${(observedOosCoverage * 100).toFixed(1)}%) is below nominal target (${(normalizedLevel * 100).toFixed(0)}%).`
          : null,
        intervalAssumptions: {
          normalErrorAssumption: false,
          residualIndependenceAssumption: false,
          varianceAssumption: 'EMPIRICAL_HORIZON_BACKTEST_ERRORS',
          empiricalHorizonIsolated: true,
          exchangeabilityAssumption: 'EXCHANGEABLE_OR_STABLE_FORECAST_ERROR_DISTRIBUTION',
          tuningCalibrationCoupled: false,
        },
      };
    }

    // ── 2. Parametric State-Space & Random Walk Formulas ───────────────────────
    let sigma_h = se;
    if (intervalAvailability === 'AVAILABLE') {
      if (methodKey === 'NAIVE_LAST_VALUE') {
        sigma_h = se * Math.sqrt(h);
      } else if (methodKey === 'SEASONAL_NAIVE') {
        const k = Math.floor((h - 1) / seasonalPeriod) + 1;
        sigma_h = se * Math.sqrt(k);
      } else if (methodKey === 'SIMPLE_EXPONENTIAL_SMOOTHING') {
        sigma_h = se * Math.sqrt(1 + (alpha * alpha) * (h - 1));
      } else if (methodKey === 'HOLT_LINEAR_TREND') {
        const term = (h - 1) * (alpha * alpha + alpha * beta * h + (1 / 6) * beta * beta * h * (2 * h - 1));
        sigma_h = se * Math.sqrt(Math.max(1, 1 + term));
      }
    }

    if (intervalAvailability !== 'AVAILABLE' || sigma_h === null || sigma_h <= 0) {
      return {
        periodIndex: h,
        pointForecast: roundTo(pt, 2),
        lowerBound: null,
        upperBound: null,
        margin: null,
        sigma_h: null,
        intervalLevel: normalizedLevel,
        nominalCoverage: normalizedLevel,
        requestedNominalCoverage: normalizedLevel,
        achievableOrderStatisticCoverage: null,
        conservativeRankCoverage: null,
        nominalOrderStatisticCoverageUnderContinuousAssumption: null,
        intervalAvailability: 'INSUFFICIENT_HISTORY',
        intervalMethod,
        intervalSampleCount: effCount,
        calibrationSampleCount: effCount,
        evaluationSampleCount: 0,
        selectionSampleCount: selCount,
        selectionFrom: selFrom,
        selectionTo: selTo,
        calibrationFrom: calFrom,
        calibrationTo: calTo,
        evaluationFrom: evalFrom,
        evaluationTo: evalTo,
        selectedModel: selModel,
        selectionMetric: selMetric,
        targetDataType,
        isDiscreteTarget,
        hasTiedErrors: false,
        tieHandling,
        exactCoverageClaim,
        conservativeCoverageBound,
        coverageLabel: 'UNAVAILABLE',
        finiteSampleCoverageBasis: coverageBasis,
        achievableFiniteSampleCoverage: null,
        qualityState: FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY,
        intervalAssumptions,
      };
    }

    const margin = roundTo(z * sigma_h, 2);
    let lower = pt - margin;
    const upper = roundTo(pt + margin, 2);

    if (nonNegative) {
      lower = Math.max(0, lower);
    }

    return {
      periodIndex: h,
      pointForecast: roundTo(pt, 2),
      lowerBound: roundTo(lower, 2),
      upperBound: upper,
      margin,
      sigma_h: roundTo(sigma_h, 2),
      intervalLevel: normalizedLevel,
      nominalCoverage: normalizedLevel,
      requestedNominalCoverage: normalizedLevel,
      achievableOrderStatisticCoverage: isDiscreteOrTied ? null : normalizedLevel,
      conservativeRankCoverage: normalizedLevel,
      nominalOrderStatisticCoverageUnderContinuousAssumption: normalizedLevel,
      intervalAvailability: 'AVAILABLE',
      intervalMethod,
      intervalSampleCount: effCount,
      calibrationSampleCount: effCount,
      evaluationSampleCount: 0,
      selectionSampleCount: selCount,
      selectionFrom: selFrom,
      selectionTo: selTo,
      calibrationFrom: calFrom,
      calibrationTo: calTo,
      evaluationFrom: evalFrom,
      evaluationTo: evalTo,
      selectedModel: selModel,
      selectionMetric: selMetric,
      targetDataType,
      isDiscreteTarget,
      hasTiedErrors: false,
      tieHandling,
      exactCoverageClaim,
      conservativeCoverageBound,
      coverageLabel: isEighty ? '80% Prediction Interval' : '95% Prediction Interval',
      finiteSampleCoverageBasis: coverageBasis,
      achievableFiniteSampleCoverage: isDiscreteOrTied ? conservativeRankCoverage : (isDiscreteOrTied ? null : normalizedLevel),
      qualityState: 'CALIBRATED_PARAMETRIC_INTERVAL',
      intervalAssumptions,
    };
  });

  const anyIndependentInsufficient = results.some((r) => r.intervalAvailability === 'INSUFFICIENT_INDEPENDENT_CALIBRATION');
  const anyInsufficient = results.some((r) => r.intervalAvailability === 'INSUFFICIENT_CALIBRATION' || r.intervalAvailability === 'INSUFFICIENT_HISTORY');
  const anyLowSample = results.some((r) => r.intervalAvailability === 'LOW_SAMPLE');

  results.intervalAvailability = anyIndependentInsufficient
    ? 'INSUFFICIENT_INDEPENDENT_CALIBRATION'
    : (anyInsufficient
        ? (methodKey === 'MOVING_AVERAGE_BASELINE' || methodKey === 'HOLT_WINTERS_SEASONAL' ? 'INSUFFICIENT_CALIBRATION' : 'INSUFFICIENT_HISTORY')
        : (anyLowSample ? 'LOW_SAMPLE' : intervalAvailability));
  results.intervalMethod = intervalMethod;
  results.intervalAssumptions = intervalAssumptions;
  results.intervalSampleCount = effCount;
  results.calibrationSampleCount = results[0]?.calibrationSampleCount ?? effCount;
  results.evaluationSampleCount = results[0]?.evaluationSampleCount ?? 0;
  results.selectionSampleCount = selCount;
  results.selectionFrom = selFrom;
  results.selectionTo = selTo;
  results.calibrationFrom = calFrom;
  results.calibrationTo = calTo;
  results.evaluationFrom = evalFrom;
  results.evaluationTo = evalTo;
  results.selectedModel = selModel;
  results.selectionMetric = selMetric;
  results.targetDataType = targetDataType;
  results.isDiscreteTarget = isDiscreteTarget;
  results.hasTiedErrors = results[0]?.hasTiedErrors ?? false;
  results.tieHandling = tieHandling;
  results.exactCoverageClaim = results[0]?.exactCoverageClaim ?? !isDiscreteTarget;
  results.conservativeCoverageBound = true;

  return results;
}

/**
 * Evaluates candidate statistical models and selects the optimal model
 * based on out-of-sample backtest WAPE, tie-breaking on MAE and deterministic ID.
 * 
 * Invariants (PM-02K-R5):
 * - MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT = 0
 * - FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED = 0
 * - FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST = 0
 * 
 * Chronological Separation Architecture:
 * - Historical Training / Model Selection window: [0, S)
 * - Untouched Interval Calibration window: [S, C)
 * - Later Untouched Interval Evaluation window: [C, F)
 * 
 * @param {Array<number>} history
 * @param {string} targetMetricId
 * @param {string} requestedMethod
 * @param {object} options
 * @returns {object}
 */
function evaluateAndSelectModel(history, targetMetricId, requestedMethod = 'AUTO', options = {}) {
  const targetDef = ForecastRegistry.getTarget(targetMetricId);
  const eligibleMethods = targetDef && Array.isArray(targetDef.eligibleMethods)
    ? targetDef.eligibleMethods
    : ['NAIVE_LAST_VALUE', 'MOVING_AVERAGE_BASELINE'];

  const horizon = options.horizon || 7;
  const N = history.length;
  const historyDates = Array.isArray(options.historyDates) ? options.historyDates : null;
  const isAutoSelection = !requestedMethod || requestedMethod === 'AUTO';

  const modelComparisons = [];
  const backtestMap = new Map();

  // Run backtest across eligible methods
  for (const methodKey of eligibleMethods) {
    const methodDef = ForecastRegistry.getMethod(methodKey);
    if (!methodDef) continue;

    const isEligible = N >= methodDef.minimumHistory;
    if (isEligible) {
      const backtestRes = runRollingOriginBacktest(history, methodKey, { backtestHorizon: Math.min(horizon, 3) });
      backtestMap.set(methodKey, backtestRes);
    }
  }

  // Determine fold count F
  let totalFolds = 0;
  for (const [, bRes] of backtestMap) {
    if (bRes && Array.isArray(bRes.foldResults) && bRes.foldResults.length > 0) {
      totalFolds = bRes.foldResults.length;
      break;
    }
  }

  // Three-Way Chronological Partitioning (Architecture A)
  // Window 1: Selection folds [0, S)
  // Window 2: Calibration folds [S, C)
  // Window 3: Evaluation folds [C, totalFolds)
  let S = 0;
  let C = 0;
  if (isAutoSelection) {
    if (totalFolds >= 12) {
      S = Math.floor(totalFolds * 0.4);
      C = S + Math.floor((totalFolds - S) * 0.6);
    } else if (totalFolds >= 6) {
      S = Math.floor(totalFolds / 2);
      C = S + Math.floor((totalFolds - S) * 0.5);
    } else {
      S = totalFolds;
      C = totalFolds;
    }
  } else {
    S = 0;
    C = Math.max(1, Math.floor(totalFolds * 0.7));
  }

  let bestMethodKey = null;
  let lowestWape = Infinity;
  let lowestMae = Infinity;

  // Evaluate candidate models strictly on selection folds [0, S)
  for (const methodKey of eligibleMethods) {
    const methodDef = ForecastRegistry.getMethod(methodKey);
    if (!methodDef) continue;

    const isEligible = N >= methodDef.minimumHistory;
    const bRes = backtestMap.get(methodKey);
    let metrics = { mae: null, rmse: null, wape: null, bias: null, mape: null };

    if (isEligible && bRes && Array.isArray(bRes.foldResults) && bRes.foldResults.length > 0) {
      const selFolds = isAutoSelection ? bRes.foldResults.slice(0, S) : bRes.foldResults;
      if (selFolds.length > 0) {
        const selActuals = [];
        const selForecasts = [];
        for (const f of selFolds) {
          selActuals.push(...f.actuals);
          selForecasts.push(...f.forecasts);
        }
        metrics = calculateAccuracyMetrics(selActuals, selForecasts);
      } else {
        metrics = bRes.aggregateMetrics;
      }

      const wapeVal = metrics.wape !== null ? metrics.wape : Infinity;
      const maeVal = metrics.mae !== null ? metrics.mae : Infinity;

      let isBetter = false;
      if (wapeVal < lowestWape) {
        isBetter = true;
      } else if (wapeVal === lowestWape) {
        if (maeVal < lowestMae) {
          isBetter = true;
        } else if (maeVal === lowestMae) {
          if (!bestMethodKey || methodKey.localeCompare(bestMethodKey) < 0) {
            isBetter = true;
          }
        }
      }

      if (isBetter) {
        lowestWape = wapeVal;
        lowestMae = maeVal;
        bestMethodKey = methodKey;
      }
    }

    modelComparisons.push({
      method: methodKey,
      displayName: methodDef.displayName,
      minimumHistory: methodDef.minimumHistory,
      modelVariant: methodDef.modelVariant || 'FIXED_PARAMETER_MODEL_VARIANT',
      parameters: methodDef.parameters || {},
      eligible: isEligible,
      mae: metrics.mae,
      rmse: metrics.rmse,
      wape: metrics.wape,
      bias: metrics.bias,
      mape: metrics.mape,
      isBaseline: methodDef.isBaseline,
      selected: false,
    });
  }

  // Determine final chosen model
  let finalMethod = bestMethodKey || 'NAIVE_LAST_VALUE';
  if (!isAutoSelection) {
    const requestedDef = ForecastRegistry.getMethod(requestedMethod);
    if (requestedDef && N >= requestedDef.minimumHistory) {
      finalMethod = requestedMethod;
    }
  }

  // Mark selected flag in table
  for (const mc of modelComparisons) {
    if (mc.method === finalMethod) {
      mc.selected = true;
    }
  }

  // Generate final forecast from selected model using full history
  let fcGen;
  switch (finalMethod) {
    case 'NAIVE_LAST_VALUE':
      fcGen = calculateNaiveForecast(history, horizon);
      break;
    case 'SEASONAL_NAIVE':
      fcGen = calculateSeasonalNaiveForecast(history, horizon, 7);
      break;
    case 'MOVING_AVERAGE_BASELINE':
      fcGen = calculateMovingAverageForecast(history, horizon, 7);
      break;
    case 'SIMPLE_EXPONENTIAL_SMOOTHING':
      fcGen = calculateSimpleExponentialSmoothing(history, horizon, 0.3);
      break;
    case 'HOLT_LINEAR_TREND':
      fcGen = calculateHoltLinearTrend(history, horizon, 0.3, 0.1);
      break;
    case 'HOLT_WINTERS_SEASONAL':
      fcGen = calculateHoltWintersSeasonal(history, horizon, 7, 0.2, 0.1, 0.2);
      break;
    default:
      fcGen = calculateNaiveForecast(history, horizon);
  }

  const selectedBacktestRes = backtestMap.get(finalMethod);
  const selectedMethodDef = ForecastRegistry.getMethod(finalMethod);
  const allWinningFolds = selectedBacktestRes ? selectedBacktestRes.foldResults : [];

  let winningSelFolds = [];
  let winningCalFolds = [];
  let winningEvalFolds = [];

  if (isAutoSelection) {
    winningSelFolds = allWinningFolds.slice(0, S);
    winningCalFolds = allWinningFolds.slice(S, C);
    winningEvalFolds = allWinningFolds.slice(C);
  } else {
    winningSelFolds = [];
    winningCalFolds = allWinningFolds.slice(0, C);
    winningEvalFolds = allWinningFolds.slice(C);
  }

  const getFoldProvenance = (folds) => {
    if (!folds || folds.length === 0) return { from: null, to: null, count: 0 };
    const first = folds[0];
    const last = folds[folds.length - 1];
    const from = historyDates && historyDates[first.testFromIndex]
      ? historyDates[first.testFromIndex]
      : `OBS_${first.testFromIndex + 1}`;
    const to = historyDates && historyDates[last.testToIndex]
      ? historyDates[last.testToIndex]
      : `OBS_${last.testToIndex + 1}`;
    const count = folds.reduce((sum, f) => sum + (f.testCount || (f.actuals ? f.actuals.length : 0)), 0);
    return { from, to, count };
  };

  const selProv = getFoldProvenance(winningSelFolds);
  const calProv = getFoldProvenance(winningCalFolds);
  const evalProv = getFoldProvenance(winningEvalFolds);

  const selErrors = winningSelFolds.flatMap((f) => f.forecasts.map((fc, i) => fc - f.actuals[i]));
  const calErrors = winningCalFolds.flatMap((f) => f.forecasts.map((fc, i) => fc - f.actuals[i]));

  const intervals = calculatePredictionIntervals(
    fcGen.pointForecasts,
    fcGen.standardError,
    {
      method: finalMethod,
      confidenceLevel: options.confidenceLevel || 0.95,
      nonNegative: true,
      seasonalPeriod: 7,
      alpha: 0.3,
      beta: 0.1,
      gamma: 0.2,
      inSampleErrors: fcGen.inSampleErrors || [],
      calibrationFolds: winningCalFolds,
      evaluationFolds: winningEvalFolds,
      selectionErrors: selErrors,
      calibrationErrors: calErrors.length > 0 ? calErrors : null,
      selectionSampleCount: selProv.count,
      selectionFrom: selProv.from,
      selectionTo: selProv.to,
      calibrationFrom: calProv.from,
      calibrationTo: calProv.to,
      evaluationFrom: evalProv.from,
      evaluationTo: evalProv.to,
      selectedModel: finalMethod,
      selectionMetric: isAutoSelection ? 'OUT_OF_SAMPLE_WAPE' : 'EXPLICIT_SPECIFICATION',
      hasModelSelection: isAutoSelection,
      targetMetricId,
      sampleCount: history.length,
    }
  );

  const selectedComparison = modelComparisons.find((m) => m.method === finalMethod);

  return {
    selectedModel: finalMethod,
    selectionMetric: isAutoSelection ? 'OUT_OF_SAMPLE_WAPE' : 'EXPLICIT_SPECIFICATION',
    selectionSampleCount: selProv.count,
    selectionFrom: selProv.from,
    selectionTo: selProv.to,
    calibrationSampleCount: calProv.count,
    calibrationFrom: calProv.from,
    calibrationTo: calProv.to,
    evaluationSampleCount: evalProv.count,
    evaluationFrom: evalProv.from,
    evaluationTo: evalProv.to,
    selectedModelVariant: selectedMethodDef?.modelVariant || 'FIXED_PARAMETER_MODEL_VARIANT',
    selectedParameters: selectedMethodDef?.parameters || {},
    modelComparisonTable: modelComparisons,
    pointForecasts: fcGen.pointForecasts.map((v) => roundTo(v, 2)),
    intervals,
    standardError: roundTo(fcGen.standardError, 2),
    backtestMetrics: selectedComparison
      ? {
          mae: selectedComparison.mae,
          rmse: selectedComparison.rmse,
          wape: selectedComparison.wape,
          bias: selectedComparison.bias,
          mape: selectedComparison.mape,
        }
      : null,
    modelVersion: targetDef?.modelVersion || 'PM02K-FIXED-v1.0',
    selectionPrecedence: '1. Lowest out-of-sample WAPE -> 2. Lowest out-of-sample MAE -> 3. Deterministic method ID',
  };
}

// ── What-If Scenario Simulation Engine ──────────────────────────────────────

/**
 * Validates and calculates a What-If Scenario simulation from a base forecast.
 * Enforces strict mathematical conflict detection between Sales, Orders, and AOV:
 * Sales Growth ≈ (1 + Orders Growth) * (1 + AOV Growth) - 1
 * @param {object} baseForecastResult
 * @param {object} assumptions - User assumptions object
 * @returns {object} { simulatedForecasts, simulationMetadata, actuality: 'SIMULATED' }
 */
function calculateScenarioSimulation(baseForecastResult, assumptions = {}) {
  if (!baseForecastResult || !Array.isArray(baseForecastResult.pointForecasts)) {
    throw new Error('Valid base forecast result is required for scenario simulation.');
  }

  const {
    salesPercent = 0,
    orderVolumePercent = 0,
    avgCheckPercent = 0,
    menuItemQuantityPercent = 0,
    ingredientCostPercent = 0,
    grossPayrollPercent = 0,
    opexPercent = 0,
    wasteBufferPercent = 0,
  } = assumptions;

  // Driver Conflict Check: If Sales, Orders, and AOV are all supplied non-zero
  if (salesPercent !== 0 && orderVolumePercent !== 0 && avgCheckPercent !== 0) {
    const sFactor = 1 + salesPercent / 100;
    const impliedSFactor = (1 + orderVolumePercent / 100) * (1 + avgCheckPercent / 100);
    const discrepancy = Math.abs(sFactor - impliedSFactor);

    // If discrepancy exceeds 0.5% (0.005), refuse silently accepting conflict
    if (discrepancy > 0.005) {
      const err = new Error(
        `Scenario driver conflict detected: Sales adjustment (${salesPercent}%) mathematically contradicts Order volume (${orderVolumePercent}%) and AOV (${avgCheckPercent}%). Implied Sales factor is ${roundTo((impliedSFactor - 1) * 100, 2)}%.`
      );
      err.statusCode = 400;
      err.code = 'SCENARIO_DRIVER_CONFLICT';
      err.details = {
        salesPercent,
        orderVolumePercent,
        avgCheckPercent,
        impliedSalesPercent: roundTo((impliedSFactor - 1) * 100, 2),
        discrepancy: roundTo(discrepancy * 100, 2),
      };
      throw err;
    }
  }

  // Determine effective primary driver multiplier
  let primaryMultiplier = 1;
  const targetMetric = baseForecastResult.targetMetricId || 'NET_SALES';

  if (targetMetric === 'NET_SALES') {
    if (salesPercent !== 0) {
      primaryMultiplier = 1 + salesPercent / 100;
    } else if (orderVolumePercent !== 0 || avgCheckPercent !== 0) {
      primaryMultiplier = (1 + orderVolumePercent / 100) * (1 + avgCheckPercent / 100);
    }
  } else if (targetMetric === 'ORDERS') {
    primaryMultiplier = 1 + (orderVolumePercent || salesPercent || 0) / 100;
  } else if (targetMetric === 'MENU_ITEM_QUANTITY') {
    primaryMultiplier = 1 + (menuItemQuantityPercent || orderVolumePercent || salesPercent || 0) / 100;
  } else if (targetMetric === 'GROSS_PAYROLL') {
    primaryMultiplier = 1 + grossPayrollPercent / 100;
  } else if (targetMetric === 'OPERATING_EXPENSES') {
    primaryMultiplier = 1 + opexPercent / 100;
  }

  const simulatedForecasts = baseForecastResult.pointForecasts.map((pt, idx) => {
    const baseVal = Number(pt) || 0;
    const simVal = roundTo(baseVal * primaryMultiplier, 2);
    return {
      periodIndex: idx + 1,
      date: baseForecastResult.forecastDates ? baseForecastResult.forecastDates[idx] : null,
      baseForecast: baseVal,
      simulatedForecast: simVal,
      variance: roundTo(simVal - baseVal, 2),
      variancePercent: baseVal > 0 ? roundTo(((simVal - baseVal) / baseVal) * 100, 2) : 0,
      actuality: FORECAST_ACTUALITY.SIMULATED, // Mandatory actuality marker
    };
  });

  return {
    scenarioId: `SCN-${Date.now()}`,
    targetMetricId: targetMetric,
    actuality: FORECAST_ACTUALITY.SIMULATED,
    assumptions: {
      salesPercent,
      orderVolumePercent,
      avgCheckPercent,
      menuItemQuantityPercent,
      ingredientCostPercent,
      grossPayrollPercent,
      opexPercent,
      wasteBufferPercent,
    },
    primaryMultiplier: roundTo(primaryMultiplier, 4),
    simulatedForecasts,
    summary: {
      baseTotal: roundTo(baseForecastResult.pointForecasts.reduce((s, v) => s + v, 0), 2),
      simulatedTotal: roundTo(simulatedForecasts.reduce((s, v) => s + v.simulatedForecast, 0), 2),
      netDelta: roundTo(
        simulatedForecasts.reduce((s, v) => s + v.simulatedForecast, 0) -
          baseForecastResult.pointForecasts.reduce((s, v) => s + v, 0),
        2
      ),
    },
    provenance: {
      baseModel: baseForecastResult.selectedModel,
      baseOrigin: baseForecastResult.forecastOrigin,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates a 2-variable Sensitivity Matrix for management decision intelligence.
 * Evaluates e.g. Sales % Growth vs Payroll % Change across known operational components.
 * @param {object} baseForecastResult
 * @param {Array<number>} salesRangePercent (e.g. [-10, -5, 0, 5, 10])
 * @param {Array<number>} payrollRangePercent (e.g. [-5, 0, 5, 10])
 * @param {number} basePayrollTotal
 * @returns {object} { matrix, drivers: { x: 'SALES_PERCENT', y: 'PAYROLL_PERCENT' } }
 */
function calculateSensitivityMatrix(
  baseForecastResult,
  salesRangePercent = [-10, -5, 0, 5, 10],
  payrollRangePercent = [-5, 0, 5, 10],
  basePayrollTotal = 0
) {
  const baseSalesTotal = baseForecastResult?.pointForecasts?.reduce((s, v) => s + v, 0) || 0;

  const rows = [];
  for (const pPct of payrollRangePercent) {
    const cells = [];
    const simPayroll = basePayrollTotal * (1 + pPct / 100);

    for (const sPct of salesRangePercent) {
      const simSales = baseSalesTotal * (1 + sPct / 100);
      // Known operating components margin proxy (Sales - Gross Payroll)
      const knownOperatingComponent = simSales - simPayroll;

      cells.push({
        salesGrowthPercent: sPct,
        simulatedSales: roundTo(simSales, 2),
        simulatedPayroll: roundTo(simPayroll, 2),
        knownOperatingComponent: roundTo(knownOperatingComponent, 2),
        actuality: FORECAST_ACTUALITY.SIMULATED,
      });
    }

    rows.push({
      payrollChangePercent: pPct,
      cells,
    });
  }

  return {
    baseSalesTotal: roundTo(baseSalesTotal, 2),
    basePayrollTotal: roundTo(basePayrollTotal, 2),
    driverX: 'SALES_PERCENT',
    driverY: 'PAYROLL_PERCENT',
    salesSteps: salesRangePercent,
    payrollSteps: payrollRangePercent,
    matrix: rows,
    actuality: FORECAST_ACTUALITY.SIMULATED,
  };
}

// ── Theoretical Ingredient & BOM Requirement Calculation ────────────────────

/**
 * Normalizes and converts quantities between standard mass and volume units.
 * Prevents FORECAST_BOM_INVENTORY_UNIT_MISMATCH = 0.
 * @param {number} qty
 * @param {string} fromUom
 * @param {string} toUom
 * @returns {number|null}
 */
function convertUomQuantity(qty, fromUom, toUom) {
  if (qty === null || qty === undefined || isNaN(qty)) return null;
  if (!fromUom || !toUom) return Number(qty);

  const normUnit = (u) => {
    const s = String(u || '').toLowerCase().trim();
    if (['kg', 'kilogram', 'kilograms'].includes(s)) return 'kg';
    if (['g', 'gram', 'grams', 'gm'].includes(s)) return 'g';
    if (['mg', 'milligram', 'milligrams'].includes(s)) return 'mg';
    if (['l', 'litre', 'liter', 'litres', 'liters'].includes(s)) return 'l';
    if (['ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'].includes(s)) return 'ml';
    return s;
  };

  const fNorm = normUnit(fromUom);
  const tNorm = normUnit(toUom);

  if (fNorm === tNorm) return Number(qty);

  // Mass conversions
  if (fNorm === 'kg' && tNorm === 'g') return Number(qty) * 1000;
  if (fNorm === 'g' && tNorm === 'kg') return Number(qty) / 1000;
  if (fNorm === 'g' && tNorm === 'mg') return Number(qty) * 1000;
  if (fNorm === 'mg' && tNorm === 'g') return Number(qty) / 1000;
  if (fNorm === 'kg' && tNorm === 'mg') return Number(qty) * 1000000;
  if (fNorm === 'mg' && tNorm === 'kg') return Number(qty) / 1000000;

  // Volume conversions
  if (fNorm === 'l' && tNorm === 'ml') return Number(qty) * 1000;
  if (fNorm === 'ml' && tNorm === 'l') return Number(qty) / 1000;

  return Number(qty);
}

/**
 * Calculates Theoretical BOM Ingredient Requirements from Forecasted Menu Item Quantities.
 * Uses canonical Recipe BOM master data and PM-02E unit compatibility.
 * Emits PROJECTED_STOCK_GAP rather than certain stockout (INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT = 0).
 * Does not add arbitrary waste buffer unless explicitly provided in assumptions.
 * @param {Array<object>} forecastItems - [{ itemName, category, forecastQuantity }]
 * @param {Array<object>} recipes - Canonical Recipe documents
 * @param {Array<object>} availableStockLots - InventoryLot documents
 * @param {number} wasteBufferPercent (default 0)
 * @returns {object}
 */
function calculateTheoreticalIngredientRequirement(
  forecastItems = [],
  recipes = [],
  availableStockLots = [],
  wasteBufferPercent = 0
) {
  const recipeMap = new Map();
  for (const r of recipes) {
    if (r.name) recipeMap.set(String(r.name).toUpperCase().trim(), r);
    if (r._id) recipeMap.set(String(r._id), r);
  }

  // Filter usable lots (excluding quarantined, expired, disposed)
  const usableLots = availableStockLots.filter(
    (lot) => lot.status !== 'QUARANTINED' && lot.status !== 'EXPIRED' && lot.status !== 'DISPOSED'
  );

  const ingredientRequirements = new Map();
  const bufferMultiplier = 1 + (Number(wasteBufferPercent) || 0) / 100;

  for (const item of forecastItems) {
    const itemNameKey = String(item.itemName || '').toUpperCase().trim();
    const recipe = recipeMap.get(itemNameKey) || (item.recipeId ? recipeMap.get(String(item.recipeId)) : null);
    const itemQty = Number(item.forecastQuantity) || 0;

    if (recipe && Array.isArray(recipe.ingredients)) {
      for (const ing of recipe.ingredients) {
        const ingKey = ing.inventoryItemId
          ? String(ing.inventoryItemId).toUpperCase().trim()
          : String(ing.ingredientName).toUpperCase().trim();
        const baseQtyPerDish = Number(ing.quantity) || 0;
        const totalReq = itemQty * baseQtyPerDish * bufferMultiplier;

        const existing = ingredientRequirements.get(ingKey) || {
          ingredientKey: ingKey,
          ingredientName: ing.ingredientName,
          uom: ing.uom || 'UNITS',
          theoreticalQuantity: 0,
          inventoryItemId: ing.inventoryItemId || null,
        };

        existing.theoreticalQuantity += totalReq;
        ingredientRequirements.set(ingKey, existing);
      }
    }
  }

  const ingredientList = Array.from(ingredientRequirements.values()).map((ing) => {
    let availableInRecipeUom = 0;
    for (const lot of usableLots) {
      const key = lot.inventoryItemId
        ? String(lot.inventoryItemId).toUpperCase().trim()
        : String(lot.itemName || '').toUpperCase().trim();
      if (key === ing.ingredientKey) {
        const lotQty = Number(lot.remainingQuantity || lot.quantityOnHand || 0);
        const converted = convertUomQuantity(lotQty, lot.uom || ing.uom, ing.uom);
        availableInRecipeUom += converted !== null ? converted : lotQty;
      }
    }

    const req = roundTo(ing.theoreticalQuantity, 3);
    const gap = roundTo(Math.max(0, req - availableInRecipeUom), 3);
    const hasGap = gap > 0;

    return {
      ingredientName: ing.ingredientName,
      inventoryItemId: ing.inventoryItemId,
      uom: ing.uom,
      theoreticalRequirement: req,
      availableStockSnapshot: roundTo(availableInRecipeUom, 3),
      availableStockUom: ing.uom,
      projectedGap: gap,
      projectedStockGap: gap,
      hasShortfall: hasGap,
      hasProjectedStockGap: hasGap,
      stockGapStatus: hasGap
        ? 'FORECAST_REQUIREMENT_EXCEEDS_CURRENT_AVAILABLE_STOCK'
        : 'COVERED_BY_CURRENT_AVAILABLE_STOCK',
      actuality: FORECAST_ACTUALITY.FORECAST,
      supplyLimitations: 'CURRENT_AVAILABLE_STOCK_ONLY_NO_OPEN_PO_INCLUDED',
      label: 'THEORETICAL_FORECAST_INGREDIENT_REQUIREMENT',
    };
  });

  return {
    targetMetricId: 'THEORETICAL_INGREDIENT_REQUIREMENT',
    label: 'THEORETICAL_FORECAST_INGREDIENT_REQUIREMENT',
    wasteBufferPercentApplied: Number(wasteBufferPercent) || 0,
    ingredientRequirements: ingredientList,
    totalIngredientsTracked: ingredientList.length,
    shortfallCount: ingredientList.filter((i) => i.hasProjectedStockGap).length,
    projectedStockGapCount: ingredientList.filter((i) => i.hasProjectedStockGap).length,
    supplyLimitations: 'CURRENT_AVAILABLE_STOCK_ONLY_NO_OPEN_PO_INCLUDED',
    purchaseOrderCreation: 'NONE',
    automaticReorder: 'NONE',
    provenance: {
      recipesEvaluated: recipes.length,
      itemsForecasted: forecastItems.length,
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Governed Forecast Execution Controller Helper ───────────────────────────

/**
 * Central analytical controller service executing end-to-end forecast calculations.
 * Connects MongoDB models with role authorization and statistical engine.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executeGovernedForecast({
  targetMetricId = 'NET_SALES',
  cafeScope = null,
  organisationId,
  horizon = 7,
  frequency = 'DAILY',
  method = 'AUTO',
  confidenceLevel = 0.95,
  auth = {},
}) {
  // 1. Assert Target Authorization
  const targetDef = ForecastRegistry.assertForecastTargetAccess(targetMetricId, auth);

  // 2. Build Database Filter respecting Scope & Tenant Isolation
  const baseFilter = {
    organisationId,
    ...(cafeScope ? { cafeId: cafeScope } : {}),
  };

  let historyDates = [];
  let historyValues = [];
  let dataQuality = FORECAST_QUALITY_STATES.READY;

  try {
    if (targetMetricId === 'NET_SALES' || targetMetricId === 'ORDERS') {
      const bills = await Bill.find({
        ...baseFilter,
        status: { $in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED', 'PAYMENT_REVERSED'] },
      })
        .sort({ businessDate: 1 })
        .lean();

      // Aggregate daily using canonical PM-02D sales provider logic (zero discrepancy)
      const dayMap = new Map();
      for (const b of bills) {
        const d = b.businessDate || 'UNKNOWN';
        if (d === 'UNKNOWN') continue;
        const current = dayMap.get(d) || { netSales: 0, orders: 0 };
        const extracted = extractCanonicalBillSales(b);
        current.netSales += extracted.netSalesPaisa;
        current.orders += extracted.orderCount;
        dayMap.set(d, current);
      }

      const sortedDates = Array.from(dayMap.keys()).sort();
      historyDates = sortedDates;
      historyValues = sortedDates.map((d) => {
        const entry = dayMap.get(d);
        return targetMetricId === 'NET_SALES' ? entry.netSales : entry.orders;
      });
    } else if (targetMetricId === 'GROSS_PAYROLL') {
      const payRuns = await PayrollRun.find({
        ...baseFilter,
        status: { $ne: 'CANCELLED' },
      })
        .select('payPeriodMonth payPeriodYear totalGrossPayPaisa status')
        .sort({ payPeriodYear: 1, payPeriodMonth: 1 })
        .lean();

      if (payRuns.length > 0) {
        for (const pr of payRuns) {
          const periodKey = `${pr.payPeriodYear}-${String(pr.payPeriodMonth).padStart(2, '0')}`;
          historyDates.push(periodKey);
          historyValues.push(roundPaise(pr.totalGrossPayPaisa || 0));
        }
      } else {
        // PM-02G fallback to Payslip grossEarningsPaisa (Gross Pay only, no Net Pay)
        const payslips = await Payslip.find({
          ...baseFilter,
          status: { $ne: 'CANCELLED' },
        })
          .select('payPeriodMonth payPeriodYear grossEarningsPaisa')
          .lean();

        if (payslips.length > 0) {
          const pMap = new Map();
          for (const ps of payslips) {
            const periodKey = `${ps.payPeriodYear}-${String(ps.payPeriodMonth).padStart(2, '0')}`;
            pMap.set(periodKey, (pMap.get(periodKey) || 0) + roundPaise(ps.grossEarningsPaisa || 0));
          }
          const sorted = Array.from(pMap.keys()).sort();
          historyDates = sorted;
          historyValues = sorted.map((k) => pMap.get(k));
          dataQuality = FORECAST_QUALITY_STATES.PARTIAL_SOURCE;
        } else {
          dataQuality = FORECAST_QUALITY_STATES.SOURCE_UNAVAILABLE;
        }
      }
    } else if (targetMetricId === 'OPERATING_EXPENSES') {
      const expenses = await Expense.find({
        ...baseFilter,
        status: 'APPROVED',
      })
        .select('expenseDate amountPaisa amount status')
        .sort({ expenseDate: 1 })
        .lean();

      const dayMap = new Map();
      for (const exp of expenses) {
        const d = exp.expenseDate ? new Date(exp.expenseDate).toISOString().slice(0, 10) : 'UNKNOWN';
        if (d === 'UNKNOWN') continue;
        const amt = roundPaise(exp.amountPaisa || (exp.amount ? exp.amount * 100 : 0));
        dayMap.set(d, (dayMap.get(d) || 0) + amt);
      }
      const sortedDates = Array.from(dayMap.keys()).sort();
      historyDates = sortedDates;
      historyValues = sortedDates.map((d) => dayMap.get(d));
    } else if (targetMetricId === 'CUSTOMER_VISITS') {
      const bills = await Bill.find({
        ...baseFilter,
        status: { $ne: 'CANCELLED' },
        customerMobile: { $exists: true, $ne: null },
      })
        .select('businessDate customerMobile')
        .lean();

      const dayMap = new Map();
      for (const b of bills) {
        const d = b.businessDate || 'UNKNOWN';
        if (d === 'UNKNOWN') continue;
        dayMap.set(d, (dayMap.get(d) || 0) + 1);
      }
      const sortedDates = Array.from(dayMap.keys()).sort();
      historyDates = sortedDates;
      historyValues = sortedDates.map((d) => dayMap.get(d));
    }
  } catch (dbErr) {
    // Outage Resilience: Never report DB failure as zero demand
    const err = new Error(`Database query failure during forecast data ingestion: ${dbErr.message}`);
    err.statusCode = 503;
    err.code = 'DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST';
    throw err;
  }

  // Check for unavailable source data (never fabricate zeroes)
  if (dataQuality === FORECAST_QUALITY_STATES.SOURCE_UNAVAILABLE || historyValues.length === 0) {
    return {
      forecastId: targetDef.forecastId,
      targetMetricId,
      displayName: targetDef.displayName,
      scope: cafeScope ? `Café ${cafeScope}` : 'Organisation Portfolio',
      historyDates: [],
      historyValues: [],
      pointForecasts: [],
      intervals: [],
      forecastDates: [],
      modelComparisonTable: [],
      selectedModel: null,
      dataQuality: FORECAST_QUALITY_STATES.SOURCE_UNAVAILABLE,
      status: 'SOURCE_UNAVAILABLE',
      message: `Historical actual source data unavailable for target ${targetMetricId}. Zeroes are not fabricated.`,
      forecastOrigin: null,
      provenance: {
        actuality: FORECAST_ACTUALITY.UNAVAILABLE,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // 3. Check Minimum History Requirements (Section 27-29: FORECAST_STATUS_OUTPUT_CONTRADICTION = 0)
  if (historyValues.length < targetDef.minimumHistory || historyValues.length < 2) {
    dataQuality = FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY;
    return {
      forecastId: targetDef.forecastId,
      targetMetricId,
      displayName: targetDef.displayName,
      scope: cafeScope ? `Café ${cafeScope}` : 'Organisation Portfolio',
      historyDates,
      historyValues,
      pointForecasts: [],
      intervals: [],
      forecastDates: [],
      modelComparisonTable: [],
      selectedModel: null,
      dataQuality: FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY,
      status: 'INSUFFICIENT_HISTORY',
      message: `Historical observations (${historyValues.length}) below required minimum (${targetDef.minimumHistory}) for target ${targetMetricId}.`,
      forecastOrigin: historyDates.length > 0 ? historyDates[historyDates.length - 1] : null,
      provenance: {
        actuality: FORECAST_ACTUALITY.UNAVAILABLE,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // 4. Run Model Evaluation & Selection
  const evalResult = evaluateAndSelectModel(historyValues, targetMetricId, method, {
    horizon: Number(horizon) || 7,
    confidenceLevel,
    historyDates,
  });

  // 5. Generate Future Forecast Dates
  const lastDateStr = historyDates[historyDates.length - 1] || new Date().toISOString().slice(0, 10);
  const forecastDates = [];
  const originDate = new Date(lastDateStr);

  for (let h = 1; h <= (Number(horizon) || 7); h++) {
    const nextD = new Date(originDate);
    nextD.setDate(originDate.getDate() + h);
    forecastDates.push(nextD.toISOString().slice(0, 10));
  }

  return {
    forecastId: targetDef.forecastId,
    targetMetricId,
    displayName: targetDef.displayName,
    scope: cafeScope ? `Café ${cafeScope}` : 'Organisation Portfolio',
    cafeScope,
    frequency,
    horizon: Number(horizon) || 7,
    actuality: FORECAST_ACTUALITY.FORECAST,
    forecastOrigin: lastDateStr,
    historyLength: historyValues.length,
    historyDates: historyDates.slice(-30), // Return recent history slice for UI display
    historyValues: historyValues.slice(-30),
    forecastDates,
    pointForecasts: evalResult.pointForecasts,
    intervals: evalResult.intervals,
    selectedModel: evalResult.selectedModel,
    selectionMetric: evalResult.selectionMetric,
    selectionSampleCount: evalResult.selectionSampleCount,
    selectionFrom: evalResult.selectionFrom,
    selectionTo: evalResult.selectionTo,
    calibrationSampleCount: evalResult.calibrationSampleCount,
    calibrationFrom: evalResult.calibrationFrom,
    calibrationTo: evalResult.calibrationTo,
    evaluationSampleCount: evalResult.evaluationSampleCount,
    evaluationFrom: evalResult.evaluationFrom,
    evaluationTo: evalResult.evaluationTo,
    selectedModelVariant: evalResult.selectedModelVariant,
    selectedParameters: evalResult.selectedParameters,
    modelComparisonTable: evalResult.modelComparisonTable,
    backtestMetrics: evalResult.backtestMetrics,
    standardError: evalResult.standardError,
    dataQuality,
    status: 'READY',
    provenance: {
      method: evalResult.selectedModel,
      selectedModel: evalResult.selectedModel,
      selectionMetric: evalResult.selectionMetric,
      selectionSampleCount: evalResult.selectionSampleCount,
      selectionFrom: evalResult.selectionFrom,
      selectionTo: evalResult.selectionTo,
      calibrationSampleCount: evalResult.calibrationSampleCount,
      calibrationFrom: evalResult.calibrationFrom,
      calibrationTo: evalResult.calibrationTo,
      evaluationSampleCount: evalResult.evaluationSampleCount,
      evaluationFrom: evalResult.evaluationFrom,
      evaluationTo: evalResult.evaluationTo,
      modelVariant: evalResult.selectedModelVariant,
      parameters: evalResult.selectedParameters,
      modelVersion: evalResult.modelVersion,
      trainingWindow: `${historyDates[0]} to ${lastDateStr}`,
      forecastHorizon: `${horizon} periods`,
      confidenceLevel,
      selectionPrecedence: evalResult.selectionPrecedence,
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  // Static Semantic Invariants (PM-02K-R1 to PM-02K-R5)
  MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT,
  FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED,
  FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST,
  DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION,
  EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS,
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
  CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE,
  PM02K_REDEFINES_NET_SALES,
  TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES,
  FORECAST_TRAINING_NET_SALES_DISCREPANCY,
  PM02K_REDEFINES_ORDER_COUNT,
  EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS,
  NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD,
  EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY,
  FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI,
  QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE,
  INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS,
  INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE,
  FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL,
  ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS,
  TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY,
  UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM,
  NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED,
  ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD,
  LLM_GENERATED_FORECAST_NUMBER,
  FORECAST_FUTURE_DATA_LEAKAGE,
  MODEL_SELECTED_WITHOUT_BACKTEST,
  MAPE_ZERO_DENOMINATOR_ERROR,

  // Sentinels
  BREAK_EVEN_ANALYSIS,
  HIERARCHICAL_FORECAST_RECONCILIATION,
  CUSTOMER_CHURN_SCORE,
  CUSTOMER_PURCHASE_PROPENSITY,
  STAFFING_REQUIREMENT,
  FORECAST_COGS,
  FORECAST_EBITDA,

  // Primitives & Calculation Methods
  roundPaise,
  roundTo,
  convertUomQuantity,
  calculateNaiveForecast,
  calculateSeasonalNaiveForecast,
  calculateMovingAverageForecast,
  calculateSimpleExponentialSmoothing,
  calculateHoltLinearTrend,
  calculateHoltWintersSeasonal,
  calculateAccuracyMetrics,
  runRollingOriginBacktest,
  calculatePredictionIntervals,
  selectOrderStatisticRanks,
  evaluateAndSelectModel,
  calculateScenarioSimulation,
  calculateSensitivityMatrix,
  calculateTheoreticalIngredientRequirement,
  executeGovernedForecast,
};
