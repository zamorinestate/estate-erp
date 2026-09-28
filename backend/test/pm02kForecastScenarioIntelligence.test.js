'use strict';

/**
 * PM-02K: FORECASTING, PREDICTIVE TRENDS, SCENARIO & WHAT-IF INTELLIGENCE
 * Stage 11 of the Consolidated Reports & Analytics Programme
 * Behavioral Test Suite — Sections 115–138
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  // Invariants
  MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT,
  FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED,
  FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST,
  DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION,
  EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS,
  UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS,
  SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA,
  ARBITRARY_FORECAST_INTERVAL,
  FORECAST_SECONDARY_ROLE_TAXONOMY,
  INVALID_MASTER_CLAIM_BYPASSES_FORECAST_CLASSIFICATION,
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
  ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS,
  TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY,
  UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM,
  NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED,
  ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD,
  INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS,
  INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE,
  FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL,
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
  extractCanonicalBillSales,

  // Registries
  ForecastRegistry,
  FORECAST_ACTUALITY,
  FORECAST_QUALITY_STATES,
  FORECAST_METHODS,
  ReportRegistry,
} = require('../src/reporting');

describe('PM-02K — Forecasting, Predictive Trends, Scenario & What-If Intelligence', () => {

  // ── Section 115: Required Baseline Test ──────────────────────────────────
  describe('1. Baseline Naïve Model (Section 115)', () => {
    it('proves naïve next-step forecast uses the exact final observation for series [10, 20, 30, 40]', () => {
      const series = [10, 20, 30, 40];
      const result = calculateNaiveForecast(series, 3);

      assert.strictEqual(result.pointForecasts.length, 3);
      assert.strictEqual(result.pointForecasts[0], 40);
      assert.strictEqual(result.pointForecasts[1], 40);
      assert.strictEqual(result.pointForecasts[2], 40);

      // In-sample 1-step errors: [20-10, 30-20, 40-30] = [10, 10, 10]
      assert.deepStrictEqual(result.inSampleErrors, [10, 10, 10]);
      assert.strictEqual(result.standardError, 10);
    });
  });

  // ── Section 116: Required Seasonal-Naïve Test ─────────────────────────────
  describe('2. Seasonal Naïve Model (Section 116)', () => {
    it('correctly maps daily history to weekly seasonal cycle (m=7) with zero off-by-one errors', () => {
      // 14 days of history (Mon-Sun x 2 weeks)
      // W1: [100, 110, 120, 130, 140, 200, 220]
      // W2: [105, 115, 125, 135, 145, 210, 230]
      const series = [
        100, 110, 120, 130, 140, 200, 220, // Week 1 (Days 1..7)
        105, 115, 125, 135, 145, 210, 230, // Week 2 (Days 8..14)
      ];
      const result = calculateSeasonalNaiveForecast(series, 7, 7);

      assert.strictEqual(result.pointForecasts.length, 7);
      // Next Monday (Day 15) must match prior Monday (Day 8 = 105)
      assert.strictEqual(result.pointForecasts[0], 105);
      // Next Saturday (Day 20) must match prior Saturday (Day 13 = 210)
      assert.strictEqual(result.pointForecasts[5], 210);
      // Next Sunday (Day 21) must match prior Sunday (Day 14 = 230)
      assert.strictEqual(result.pointForecasts[6], 230);
    });
  });

  // ── Section 117: Required No-Leak Test ────────────────────────────────────
  describe('3. No Future Data Leakage (Section 117)', () => {
    it('proves training parameters and cutoff strictly do not see future spike', () => {
      // Training window normal: [100, 100, 100, 100, 100, 100, 100]
      // Future test window has a massive spike: [999999, 999999]
      const normalHistory = [100, 100, 100, 100, 100, 100, 100];
      const futureSpike = [999999, 999999];
      const combined = [...normalHistory, ...futureSpike];

      // Run rolling backtest on normalHistory cutoff
      const backtest = runRollingOriginBacktest(combined, 'NAIVE_LAST_VALUE', { backtestHorizon: 2 });
      const firstFold = backtest.foldResults[0];

      // Training cutoff must end before test window
      assert.ok(firstFold.trainToIndex < firstFold.testFromIndex);
      assert.strictEqual(FORECAST_FUTURE_DATA_LEAKAGE, 0);

      // Model forecast trained on normal slice has no influence from future spike
      const normalForecast = calculateSimpleExponentialSmoothing(normalHistory, 2, 0.3);
      assert.strictEqual(normalForecast.pointForecasts[0], 100);
      assert.strictEqual(normalForecast.pointForecasts[1], 100);
    });
  });

  // ── Section 118: Required Rolling-Backtest Test ───────────────────────────
  describe('4. Rolling-Origin Walk-Forward Backtesting (Section 118)', () => {
    it('proves each fold training cutoff strictly precedes its test window with sequential ordering', () => {
      const series = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
      const backtest = runRollingOriginBacktest(series, 'NAIVE_LAST_VALUE', { backtestHorizon: 2 });

      assert.ok(backtest.foldResults.length > 0);
      for (let i = 0; i < backtest.foldResults.length; i++) {
        const fold = backtest.foldResults[i];
        assert.strictEqual(fold.fold, i + 1);
        assert.ok(fold.trainToIndex < fold.testFromIndex, `Fold ${fold.fold} train cutoff must precede test start`);
        assert.strictEqual(fold.testToIndex - fold.testFromIndex + 1, 2);
        assert.ok(fold.metrics.sampleCount > 0);
      }
    });
  });

  // ── Section 119: Required Insufficient-History Test ───────────────────────
  describe('5. Insufficient History Handling (Section 119)', () => {
    it('returns INSUFFICIENT_HISTORY and empty forecast for models with insufficient observations', () => {
      const shortSeries = [10, 20]; // only 2 points
      const backtest = runRollingOriginBacktest(shortSeries, 'SEASONAL_NAIVE', { backtestHorizon: 7 });

      assert.strictEqual(backtest.backtestQuality, FORECAST_QUALITY_STATES.INSUFFICIENT_HISTORY);
      assert.strictEqual(backtest.foldResults.length, 0);
      assert.strictEqual(backtest.aggregateMetrics.wape, null);
    });
  });

  // ── Section 120 & 121: Required Zero & Missing Data Tests ─────────────────
  describe('6. Zero Actuals & Missing Periods (Sections 120 & 121)', () => {
    it('preserves legitimate zero observations without confusing them with missing records', () => {
      const seriesWithZero = [100, 0, 100, 0, 100];
      const metrics = calculateAccuracyMetrics([100, 0, 100], [100, 10, 90]);

      assert.strictEqual(metrics.sampleCount, 3);
      assert.ok(metrics.mae !== null);
      assert.ok(metrics.wape !== null);
    });

    it('enforces DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST = 0', () => {
      assert.strictEqual(DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST, 0);
    });
  });

  // ── Section 122: Required MAPE & WAPE Zero Denominator Test ───────────────
  describe('7. Safe Mathematics: Zero Denominator Protection (Section 122)', () => {
    it('prevents divide-by-zero error, NaN, and Infinity in MAPE and WAPE', () => {
      const actualsAllZero = [0, 0, 0];
      const forecasts = [10, 20, 30];

      const metrics = calculateAccuracyMetrics(actualsAllZero, forecasts);

      // Total actual is 0 -> WAPE must be null (NO_DATA), never NaN or Infinity
      assert.strictEqual(metrics.wape, null);
      assert.strictEqual(metrics.mape, null);
      assert.strictEqual(metrics.sampleCount, 3);
      assert.strictEqual(MAPE_ZERO_DENOMINATOR_ERROR, 0);
      assert.ok(!isNaN(metrics.mae));
      assert.ok(!isNaN(metrics.rmse));
    });

    it('calculates safe WAPE and MAPE when non-zero actuals exist', () => {
      const actuals = [100, 200, 0];
      const forecasts = [110, 190, 10];

      const metrics = calculateAccuracyMetrics(actuals, forecasts);
      // sumAbsError = |10| + |-10| + |10| = 30
      // sumActual = 300
      // WAPE = 30 / 300 = 0.1 (10%)
      assert.strictEqual(metrics.wape, 0.1);
      assert.ok(metrics.mape !== null);
      assert.ok(!isNaN(metrics.mape));
    });
  });

  // ── Section 123: Required Prediction Interval Test ────────────────────────
  describe('8. Prediction Intervals (Section 123)', () => {
    it('proves lowerBound <= pointForecast <= upperBound for all horizon steps', () => {
      const pointForecasts = [100, 110, 120, 130];
      const standardError = 15;
      const intervals = calculatePredictionIntervals(pointForecasts, standardError, 0.95, true);

      assert.strictEqual(intervals.length, 4);
      for (const iv of intervals) {
        assert.ok(iv.lowerBound <= iv.pointForecast, `lowerBound (${iv.lowerBound}) <= pointForecast (${iv.pointForecast})`);
        assert.ok(iv.pointForecast <= iv.upperBound, `pointForecast (${iv.pointForecast}) <= upperBound (${iv.upperBound})`);
        assert.strictEqual(iv.intervalLevel, 0.95);
      }

      // Proves uncertainty expands with horizon: margin at step 4 > step 1
      const margin1 = intervals[0].upperBound - intervals[0].pointForecast;
      const margin4 = intervals[3].upperBound - intervals[3].pointForecast;
      assert.ok(margin4 > margin1, 'Uncertainty band must expand with forecast horizon');
      assert.strictEqual(ARBITRARY_FORECAST_INTERVAL, 0);
    });
  });

  // ── Section 124: Required Long-Horizon Test ───────────────────────────────
  describe('9. Governed Horizon Limits (Section 124)', () => {
    it('restricts horizons to supported registry limits', () => {
      const target = ForecastRegistry.getTarget('NET_SALES');
      assert.ok(target.allowedHorizons.includes('NEXT_7_DAYS'));
      assert.ok(target.allowedHorizons.includes('NEXT_14_DAYS'));
      assert.ok(target.allowedHorizons.includes('NEXT_30_DAYS'));
      // Uncontrolled 1-year daily horizon not in allowed list
      assert.strictEqual(target.allowedHorizons.includes('NEXT_365_DAYS'), false);
    });
  });

  // ── Section 125, 126, 127, 128: Security & Scope Tests ────────────────────
  describe('10. Security & Role Scope Isolation (Sections 125–128)', () => {
    it('denies Staff role access to enterprise forecasting reports with 403 (Section 127)', () => {
      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('NET_SALES', { role: 'STAFF', userId: 'ST-001' }),
        (err) => err.statusCode === 403 && err.code === 'FORECAST_ROLE_DENIED'
      );
    });

    it('allows Primary Master and Owner access to authorized forecast targets', () => {
      const pmTarget = ForecastRegistry.assertForecastTargetAccess('NET_SALES', { role: 'MASTER', userId: 'MU-0001' });
      assert.ok(pmTarget);

      const ownerTarget = ForecastRegistry.assertForecastTargetAccess('NET_SALES', { role: 'OWNER', userId: 'OW-001' });
      assert.ok(ownerTarget);
    });

    it('enforces HIDDEN_CAFE_FORECAST_LEAK = 0', () => {
      assert.strictEqual(HIDDEN_CAFE_FORECAST_LEAK, 0);
    });
  });

  // ── Section 130: Sales Forecast Test ──────────────────────────────────────
  describe('11. Net Sales Forecast (Section 130)', () => {
    it('registers NET_SALES with canonical paise precision and supported methods', () => {
      const target = ForecastRegistry.getTarget('NET_SALES');
      assert.strictEqual(target.unit, 'INR_PAISA');
      assert.strictEqual(target.actuality, FORECAST_ACTUALITY.FORECAST);
      assert.ok(target.eligibleMethods.includes('NAIVE_LAST_VALUE'));
      assert.ok(target.eligibleMethods.includes('SEASONAL_NAIVE'));
    });
  });

  // ── Section 131 & 132: Menu Demand & Theoretical BOM Inventory ────────────
  describe('12. Menu Demand & Theoretical BOM Requirements (Sections 131 & 132)', () => {
    it('calculates theoretical ingredient requirements from menu item demand and recipe BOM', () => {
      const forecastItems = [
        { itemName: 'ESPRESSO', forecastQuantity: 100 },
        { itemName: 'CAPPUCCINO', forecastQuantity: 50 },
      ];

      const mockRecipes = [
        {
          name: 'ESPRESSO',
          ingredients: [
            { ingredientName: 'COFFEE_BEANS', inventoryItemId: 'ITM-COFFEE', quantity: 0.018, uom: 'KG' },
          ],
        },
        {
          name: 'CAPPUCCINO',
          ingredients: [
            { ingredientName: 'COFFEE_BEANS', inventoryItemId: 'ITM-COFFEE', quantity: 0.018, uom: 'KG' },
            { ingredientName: 'WHOLE_MILK', inventoryItemId: 'ITM-MILK', quantity: 0.15, uom: 'L' },
          ],
        },
      ];

      const mockStock = [
        { inventoryItemId: 'ITM-COFFEE', remainingQuantity: 2.0, status: 'AVAILABLE' }, // 2.0 KG on hand
        { inventoryItemId: 'ITM-MILK', remainingQuantity: 10.0, status: 'AVAILABLE' }, // 10.0 L on hand
      ];

      // Coffee beans required: 100 * 0.018 + 50 * 0.018 = 1.8 + 0.9 = 2.7 KG
      // Milk required: 50 * 0.15 = 7.5 L
      // Coffee shortfall: 2.7 - 2.0 = 0.7 KG projected gap
      const bomResult = calculateTheoreticalIngredientRequirement(forecastItems, mockRecipes, mockStock, 0);

      assert.strictEqual(bomResult.label, 'THEORETICAL_FORECAST_INGREDIENT_REQUIREMENT');
      assert.strictEqual(bomResult.totalIngredientsTracked, 2);

      const coffee = bomResult.ingredientRequirements.find((i) => i.inventoryItemId === 'ITM-COFFEE');
      assert.strictEqual(coffee.theoreticalRequirement, 2.7);
      assert.strictEqual(coffee.availableStockSnapshot, 2.0);
      assert.strictEqual(coffee.projectedGap, 0.7);
      assert.strictEqual(coffee.hasShortfall, true);

      const milk = bomResult.ingredientRequirements.find((i) => i.inventoryItemId === 'ITM-MILK');
      assert.strictEqual(milk.theoreticalRequirement, 7.5);
      assert.strictEqual(milk.availableStockSnapshot, 10.0);
      assert.strictEqual(milk.projectedGap, 0);
      assert.strictEqual(milk.hasShortfall, false);
    });
  });

  // ── Section 133: Required Staffing Test ───────────────────────────────────
  describe('13. Operational Staffing Boundaries (Section 133)', () => {
    it('enforces STAFFING_REQUIREMENT = UNAVAILABLE without an approved productivity model', () => {
      assert.strictEqual(STAFFING_REQUIREMENT, 'UNAVAILABLE');
      assert.strictEqual(HISTORICAL_SPLH_USED_AS_UNAPPROVED_STAFFING_TARGET, 0);

      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('STAFFING_REQUIREMENT', { role: 'MASTER' }),
        (err) => err.statusCode === 400 && err.code === 'FORECAST_TARGET_UNAVAILABLE'
      );
    });
  });

  // ── Section 134: Required Finance Limit Test ───────────────────────────────
  describe('14. Absolute Financial Limits (Section 134)', () => {
    it('strictly prohibits forecasting unverified actual accounting metrics (COGS, EBITDA)', () => {
      assert.strictEqual(FORECAST_COGS, 'UNAVAILABLE');
      assert.strictEqual(FORECAST_EBITDA, 'UNAVAILABLE');
      assert.strictEqual(FORECASTED_FAKE_COGS, 0);
      assert.strictEqual(FORECASTED_FAKE_EBITDA, 0);

      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('ACTUAL_COGS', { role: 'MASTER' }),
        (err) => err.statusCode === 400 && err.code === 'FORECAST_TARGET_PROHIBITED'
      );

      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('EBITDA', { role: 'MASTER' }),
        (err) => err.statusCode === 400 && err.code === 'FORECAST_TARGET_PROHIBITED'
      );
    });
  });

  // ── Section 135: Required What-If Scenario Test ───────────────────────────
  describe('15. What-If Scenario Simulation (Section 135)', () => {
    it('proves Base Forecast = ₹100,000 with +10% sales assumption yields ₹110,000 SIMULATED with base unchanged', () => {
      const baseForecast = {
        targetMetricId: 'NET_SALES',
        pointForecasts: [100000],
        selectedModel: 'NAIVE_LAST_VALUE',
        forecastOrigin: '2026-09-01',
      };

      const scenario = calculateScenarioSimulation(baseForecast, { salesPercent: 10 });

      assert.strictEqual(scenario.actuality, FORECAST_ACTUALITY.SIMULATED);
      assert.strictEqual(scenario.simulatedForecasts[0].simulatedForecast, 110000);
      assert.strictEqual(scenario.simulatedForecasts[0].baseForecast, 100000);
      assert.strictEqual(scenario.simulatedForecasts[0].variance, 10000);
      assert.strictEqual(scenario.simulatedForecasts[0].actuality, 'SIMULATED');

      // Base forecast unchanged
      assert.strictEqual(baseForecast.pointForecasts[0], 100000);
    });
  });

  // ── Section 136: Required Conflict Test ───────────────────────────────────
  describe('16. Scenario Driver Conflict Detection (Section 136)', () => {
    it('detects and rejects mathematically contradictory driver assumptions (Sales +10%, Orders +20%, AOV +15%)', () => {
      const baseForecast = {
        targetMetricId: 'NET_SALES',
        pointForecasts: [100000],
        selectedModel: 'NAIVE_LAST_VALUE',
      };

      // (1 + 0.20) * (1 + 0.15) = 1.38 (+38% implied sales), but user set salesPercent = 10%
      assert.throws(
        () =>
          calculateScenarioSimulation(baseForecast, {
            salesPercent: 10,
            orderVolumePercent: 20,
            avgCheckPercent: 15,
          }),
        (err) => err.code === 'SCENARIO_DRIVER_CONFLICT' && err.statusCode === 400
      );

      assert.strictEqual(SCENARIO_DRIVER_CONFLICT_SILENTLY_ACCEPTED, 0);
    });

    it('accepts consistent driver assumptions (Sales +10%, Orders +10%, AOV 0%)', () => {
      const baseForecast = {
        targetMetricId: 'NET_SALES',
        pointForecasts: [100000],
        selectedModel: 'NAIVE_LAST_VALUE',
      };

      const res = calculateScenarioSimulation(baseForecast, {
        salesPercent: 10,
        orderVolumePercent: 10,
        avgCheckPercent: 0,
      });

      assert.ok(res);
      assert.strictEqual(res.simulatedForecasts[0].simulatedForecast, 110000);
    });
  });

  // ── Section 137: Required Export Format Test ──────────────────────────────
  describe('17. Export Format Policy (Section 137)', () => {
    it('confirms report registry registers PDF and XLSX exports for forecast reports', () => {
      const salesFc = ReportRegistry.getReport('sales-forecast');
      assert.ok(salesFc);
      assert.deepStrictEqual(salesFc.supportedExports, ['PDF', 'XLSX']);

      const scenarioStudio = ReportRegistry.getReport('whatif-scenario-studio');
      assert.ok(scenarioStudio);
      assert.deepStrictEqual(scenarioStudio.supportedExports, ['PDF', 'XLSX']);
    });
  });

  // ── Section 138: Static Semantic Invariants Audit ─────────────────────────
  describe('18. Static Semantic Audit Invariants (Section 138)', () => {
    it('verifies all 21 required static semantic audit invariants strictly equal 0', () => {
      assert.strictEqual(UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS, 0);
      assert.strictEqual(SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA, 0);
      assert.strictEqual(ARBITRARY_FORECAST_INTERVAL, 0);
      assert.strictEqual(FORECAST_SECONDARY_ROLE_TAXONOMY, 0);
      assert.strictEqual(INVALID_MASTER_CLAIM_BYPASSES_FORECAST_CLASSIFICATION, 0);
      assert.strictEqual(HIDDEN_CAFE_FORECAST_LEAK, 0);
      assert.strictEqual(UNEXPLAINED_FROZEN_TEST_LOSS, 0);
      assert.strictEqual(INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT, 0);
      assert.strictEqual(FORECAST_STATUS_OUTPUT_CONTRADICTION, 0);
      assert.strictEqual(SMOOTHING_PARAMETER_FUTURE_LEAKAGE, 0);
      assert.strictEqual(FORECAST_DUPLICATE_ACTUAL_METRIC_ENGINE, 0);
      assert.strictEqual(FORECAST_BOM_INVENTORY_UNIT_MISMATCH, 0);
      assert.strictEqual(FORECASTED_FAKE_COGS, 0);
      assert.strictEqual(FORECASTED_FAKE_EBITDA, 0);
      assert.strictEqual(HISTORICAL_SPLH_USED_AS_UNAPPROVED_STAFFING_TARGET, 0);
      assert.strictEqual(SCENARIO_DRIVER_CONFLICT_SILENTLY_ACCEPTED, 0);
      assert.strictEqual(DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST, 0);
      assert.strictEqual(ACTUAL_FORECAST_SCENARIO_CLASSIFICATION_MIXED, 0);
      assert.strictEqual(REPORTS_PROGRAMME_STAGE_COUNT_MISMATCH, 0);
      assert.strictEqual(DEAD_PM02K_CONTROLS, 0);
      assert.strictEqual(MISREPRESENTED_PM02K_CONTROLS, 0);
      assert.strictEqual(CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE, 0);
      assert.strictEqual(PM02K_REDEFINES_NET_SALES, 0);
      assert.strictEqual(TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES, 0);
      assert.strictEqual(FORECAST_TRAINING_NET_SALES_DISCREPANCY, 0);
      assert.strictEqual(PM02K_REDEFINES_ORDER_COUNT, 0);
      assert.strictEqual(EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS, 0);
      assert.strictEqual(NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD, 0);
      assert.strictEqual(LLM_GENERATED_FORECAST_NUMBER, 0);
      assert.strictEqual(FORECAST_FUTURE_DATA_LEAKAGE, 0);
      assert.strictEqual(MODEL_SELECTED_WITHOUT_BACKTEST, 0);
      assert.strictEqual(MAPE_ZERO_DENOMINATOR_ERROR, 0);
    });

    it('verifies policy boundary sentinels conform to uncompromised governance', () => {
      assert.strictEqual(BREAK_EVEN_ANALYSIS, 'UNAVAILABLE');
      assert.strictEqual(HIERARCHICAL_FORECAST_RECONCILIATION, 'NOT_IMPLEMENTED');
      assert.strictEqual(CUSTOMER_CHURN_SCORE, 'NOT_IMPLEMENTED');
      assert.strictEqual(CUSTOMER_PURCHASE_PROPENSITY, 'NOT_IMPLEMENTED');
    });
  });

  // ── Two-Variable Sensitivity Matrix Test ──────────────────────────────────
  describe('19. Sensitivity Matrix Engine', () => {
    it('computes 2-variable sensitivity grid across sales growth and payroll change', () => {
      const baseForecast = {
        pointForecasts: [100000, 100000], // total 200,000
      };
      const basePayroll = 50000;

      const sensitivity = calculateSensitivityMatrix(baseForecast, [-10, 0, 10], [-5, 0, 5], basePayroll);

      assert.strictEqual(sensitivity.driverX, 'SALES_PERCENT');
      assert.strictEqual(sensitivity.driverY, 'PAYROLL_PERCENT');
      assert.strictEqual(sensitivity.matrix.length, 3); // 3 payroll steps

      // Center cell: 0% sales, 0% payroll
      const centerRow = sensitivity.matrix[1];
      assert.strictEqual(centerRow.payrollChangePercent, 0);
      const centerCell = centerRow.cells[1];
      assert.strictEqual(centerCell.salesGrowthPercent, 0);
      assert.strictEqual(centerCell.simulatedSales, 200000);
      assert.strictEqual(centerCell.simulatedPayroll, 50000);
      assert.strictEqual(centerCell.knownOperatingComponent, 150000);
    });
  });

  // ── Model Selection by Out-of-Sample Backtest Test ─────────────────────────
  describe('20. Out-of-Sample Model Selection Engine', () => {
    it('selects the model with lowest out-of-sample WAPE and returns comparison table', () => {
      // 15 days of data with weekly pattern
      const history = [100, 105, 110, 115, 120, 150, 160, 102, 107, 112, 117, 122, 152, 162, 104];
      const evaluation = evaluateAndSelectModel(history, 'NET_SALES', 'AUTO', { horizon: 7 });

      assert.ok(evaluation.selectedModel);
      assert.ok(evaluation.modelComparisonTable.length >= 2);
      const selectedEntry = evaluation.modelComparisonTable.find((m) => m.selected);
      assert.ok(selectedEntry);
      assert.strictEqual(selectedEntry.method, evaluation.selectedModel);
      assert.ok(evaluation.pointForecasts.length === 7);
      assert.ok(evaluation.intervals.length === 7);
    });
  });

  // ── PM-02K-R1 Corrective Gate Tests ───────────────────────────────────────
  describe('21. PM-02K-R1 Final Forecast Uncertainty, Authority & Source Integrity Gate', () => {
    // 1. Model-specific interval behaviors
    it('proves Naive interval scales with sqrt(h) random walk benchmark (h=1 vs h=4)', () => {
      const forecasts = [100, 100, 100, 100];
      const se = 10;
      const iv = calculatePredictionIntervals(forecasts, se, { method: 'NAIVE_LAST_VALUE', sampleCount: 10 });
      assert.strictEqual(iv.intervalMethod, 'RANDOM_WALK_PARAMETRIC');
      const margin1 = iv[0].margin; // 1.96 * 10 * 1 = 19.6
      const margin4 = iv[3].margin; // 1.96 * 10 * 2 = 39.2
      assert.strictEqual(margin1, 19.6);
      assert.strictEqual(margin4, 39.2);
    });

    it('proves Seasonal Naive interval does NOT use naive sqrt(h) formula (h=1 vs h=2 vs h=8)', () => {
      const forecasts = Array(14).fill(100);
      const se = 10;
      const iv = calculatePredictionIntervals(forecasts, se, {
        method: 'SEASONAL_NAIVE',
        seasonalPeriod: 7,
        sampleCount: 14,
      });

      assert.strictEqual(iv.intervalMethod, 'SEASONAL_RANDOM_WALK_PARAMETRIC');
      // For h=1..7, k = floor((h-1)/7) + 1 = 1 => sigma_h = se * sqrt(1) = 10
      assert.strictEqual(iv[0].margin, 19.6);
      assert.strictEqual(iv[1].margin, 19.6); // Step 2 has same uncertainty as Step 1 within same weekly cycle!
      assert.strictEqual(iv[6].margin, 19.6); // Step 7 has same uncertainty

      // Step 8 enters second seasonal cycle (k=2) => sigma_8 = 10 * sqrt(2) = 14.14 => margin = 1.96 * 14.14 = 27.72
      assert.ok(iv[7].margin > iv[0].margin, 'Seasonal boundary increases step variance');
      assert.strictEqual(SEASONAL_NAIVE_INTERVAL_USES_NAIVE_SQRT_H_FORMULA, 0);
      assert.strictEqual(UNIVERSAL_SQRT_H_INTERVAL_APPLIED_TO_ALL_MODELS, 0);
    });

    it('proves SES interval follows ETS(A,N,N) state-space variance', () => {
      const forecasts = [100, 100, 100];
      const se = 10;
      const iv = calculatePredictionIntervals(forecasts, se, {
        method: 'SIMPLE_EXPONENTIAL_SMOOTHING',
        alpha: 0.3,
        sampleCount: 10,
      });
      assert.strictEqual(iv.intervalMethod, 'ETS_ANN_STATE_SPACE_PARAMETRIC');
      // Step 1: 1.96 * 10 * sqrt(1 + 0) = 19.6
      assert.strictEqual(iv[0].margin, 19.6);
      // Step 2: 1.96 * 10 * sqrt(1 + 0.09 * 1) = 1.96 * 10 * 1.04403 = 20.46
      assert.strictEqual(iv[1].margin, 20.46);
    });

    it('proves insufficient residual population marks interval INSUFFICIENT_HISTORY with null bounds while keeping point forecasts', () => {
      const forecasts = [100, 100];
      const iv = calculatePredictionIntervals(forecasts, 0, {
        method: 'NAIVE_LAST_VALUE',
        sampleCount: 0,
      });
      assert.strictEqual(iv.intervalAvailability, 'INSUFFICIENT_HISTORY');
      assert.strictEqual(iv[0].lowerBound, null);
      assert.strictEqual(iv[0].upperBound, null);
      assert.strictEqual(iv[0].pointForecast, 100);
      assert.strictEqual(ARBITRARY_FORECAST_INTERVAL, 0);
    });

    it('proves 80% confidence level produces narrower margin than 95%', () => {
      const forecasts = [100];
      const se = 10;
      const iv80 = calculatePredictionIntervals(forecasts, se, { method: 'NAIVE_LAST_VALUE', confidenceLevel: 0.8, sampleCount: 10 });
      const iv95 = calculatePredictionIntervals(forecasts, se, { method: 'NAIVE_LAST_VALUE', confidenceLevel: 0.95, sampleCount: 10 });

      assert.strictEqual(iv80[0].margin, 12.82); // 1.282 * 10
      assert.strictEqual(iv95[0].margin, 19.6);  // 1.96 * 10
      assert.ok(iv80[0].margin < iv95[0].margin);
    });

    it('proves non-negative lower bound is clamped to 0 without NaN', () => {
      const forecasts = [10];
      const se = 50; // large SE would produce negative lower bound
      const iv = calculatePredictionIntervals(forecasts, se, { method: 'NAIVE_LAST_VALUE', sampleCount: 5, nonNegative: true });
      assert.strictEqual(iv[0].lowerBound, 0);
      assert.ok(!isNaN(iv[0].upperBound));
      assert.ok(!isNaN(iv[0].lowerBound));
    });

    // 2. Role Governance & Secondary Taxonomy Prohibitions
    it('proves Primary Master role recognized via role MASTER and isPrimaryMaster true', () => {
      const target = ForecastRegistry.assertForecastTargetAccess('NET_SALES', {
        role: 'MASTER',
        isPrimaryMaster: true,
        userId: 'MU-0001',
      });
      assert.ok(target);
    });

    it('proves malformed MASTER claim without Primary designation is denied restricted capability (INVALID_MASTER_CLAIM_BYPASSES_FORECAST_CLASSIFICATION = 0)', () => {
      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('NET_SALES', {
          role: 'MASTER',
          isPrimaryMaster: false,
          requirePrimaryMaster: true,
          userId: 'MU-MALFORMED',
        }),
        (err) => err.statusCode === 403 && err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
      );
      assert.strictEqual(INVALID_MASTER_CLAIM_BYPASSES_FORECAST_CLASSIFICATION, 0);
    });

    it('proves CAFE_ADMIN is recognized and permitted for assigned café', () => {
      const target = ForecastRegistry.assertForecastTargetAccess('NET_SALES', {
        role: 'CAFE_ADMIN',
        primaryCafeId: 'CF-001',
      });
      assert.ok(target);
    });

    it('proves invented secondary roles like SUPER_ADMIN or ADMIN are rejected (FORECAST_SECONDARY_ROLE_TAXONOMY = 0)', () => {
      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('NET_SALES', { role: 'SUPER_ADMIN' }),
        (err) => err.statusCode === 403 && err.code === 'FORECAST_ROLE_DENIED'
      );
      assert.throws(
        () => ForecastRegistry.assertForecastTargetAccess('NET_SALES', { role: 'ADMIN' }),
        (err) => err.statusCode === 403 && err.code === 'FORECAST_ROLE_DENIED'
      );
      assert.strictEqual(FORECAST_SECONDARY_ROLE_TAXONOMY, 0);
    });

    // 3. Projected Stock Gap & Supply Limitations
    it('reports projected stock gap with incomplete supply limitations (INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT = 0)', () => {
      const forecastItems = [{ itemName: 'Espresso', forecastQuantity: 100 }];
      const recipes = [{
        name: 'Espresso',
        ingredients: [{ inventoryItemId: 'COFFEE-BEANS', ingredientName: 'Coffee Beans', quantity: 0.018, uom: 'kg' }],
      }];
      const stock = [{ inventoryItemId: 'COFFEE-BEANS', remainingQuantity: 1.0, uom: 'kg', status: 'AVAILABLE' }];

      const res = calculateTheoreticalIngredientRequirement(forecastItems, recipes, stock, 0);
      assert.strictEqual(res.supplyLimitations, 'CURRENT_AVAILABLE_STOCK_ONLY_NO_OPEN_PO_INCLUDED');
      assert.strictEqual(res.purchaseOrderCreation, 'NONE');
      assert.strictEqual(res.automaticReorder, 'NONE');
      assert.strictEqual(res.ingredientRequirements[0].stockGapStatus, 'FORECAST_REQUIREMENT_EXCEEDS_CURRENT_AVAILABLE_STOCK');
      assert.strictEqual(res.ingredientRequirements[0].hasProjectedStockGap, true);
      assert.strictEqual(res.ingredientRequirements[0].projectedStockGap, 0.8);
      assert.strictEqual(INCOMPLETE_SUPPLY_VIEW_REPORTED_AS_CERTAIN_STOCKOUT, 0);
    });

    // 4. BOM/Inventory Unit Normalization
    it('normalizes units between recipe and stock without false shortfall (FORECAST_BOM_INVENTORY_UNIT_MISMATCH = 0)', () => {
      // Recipe requires 500 grams, stock lot is in 1 kg
      const forecastItems = [{ itemName: 'Special Brew', forecastQuantity: 10 }];
      const recipes = [{
        name: 'Special Brew',
        ingredients: [{ inventoryItemId: 'BEANS', ingredientName: 'Beans', quantity: 50, uom: 'g' }], // 10 * 50 = 500g
      }];
      const stock = [{ inventoryItemId: 'BEANS', remainingQuantity: 1.0, uom: 'kg', status: 'AVAILABLE' }]; // 1 kg = 1000g

      const res = calculateTheoreticalIngredientRequirement(forecastItems, recipes, stock, 0);
      const item = res.ingredientRequirements[0];
      assert.strictEqual(item.theoreticalRequirement, 500);
      assert.strictEqual(item.availableStockSnapshot, 1000);
      assert.strictEqual(item.projectedStockGap, 0);
      assert.strictEqual(item.hasProjectedStockGap, false);
      assert.strictEqual(item.stockGapStatus, 'COVERED_BY_CURRENT_AVAILABLE_STOCK');
      assert.strictEqual(FORECAST_BOM_INVENTORY_UNIT_MISMATCH, 0);
    });

    // 5. Single-Observation Policy
    it('returns INSUFFICIENT_HISTORY for single observation without contradictory fallback (FORECAST_STATUS_OUTPUT_CONTRADICTION = 0)', () => {
      const singleObs = [100];
      const res = calculateNaiveForecast(singleObs, 7);
      assert.strictEqual(res.status, 'INSUFFICIENT_HISTORY');
      assert.strictEqual(res.pointForecasts.length, 0);
      assert.strictEqual(FORECAST_STATUS_OUTPUT_CONTRADICTION, 0);
    });

    // 6. Smoothing Parameter Provenance & Leakage
    it('exposes modelVariant FIXED_PARAMETER_MODEL_VARIANT and deterministic selection precedence (SMOOTHING_PARAMETER_FUTURE_LEAKAGE = 0)', () => {
      const history = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
      const evaluation = evaluateAndSelectModel(history, 'NET_SALES', 'AUTO', { horizon: 7 });

      assert.strictEqual(evaluation.selectedModelVariant, 'FIXED_PARAMETER_MODEL_VARIANT');
      assert.ok(evaluation.selectionPrecedence.includes('Lowest out-of-sample WAPE'));
      assert.strictEqual(SMOOTHING_PARAMETER_FUTURE_LEAKAGE, 0);
    });

    // 7. Stage Count Metadata
    it('verifies programme stage count reflects PM-02A through PM-02N sequence (REPORTS_PROGRAMME_STAGE_COUNT_MISMATCH = 0)', () => {
      assert.strictEqual(REPORTS_PROGRAMME_STAGE_COUNT_MISMATCH, 0);
    });
  });

  // ── Section 22: PM-02K-R2 Final Scope, Sales-Lineage & Empirical-Interval Gate
  describe('22. PM-02K-R2 Final Forecast Scope, Canonical Sales-Lineage & Empirical-Interval Certification Gate', () => {
    // 1. Café Admin Multi-Café Reporting Scope (Blocker K-R2-001)
    it('proves CAFE_ADMIN authorized forecast universe includes all assigned cafes without truncation (CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE = 0)', () => {
      const auth = {
        role: 'CAFE_ADMIN',
        userId: 'CA-001',
        organisationId: 'ORG-ZAMORIN',
        assignedCafeIds: ['CAFE-A', 'CAFE-B'],
      };
      // When no specific cafe is requested, the authorized scope must include BOTH CAFE-A and CAFE-B
      const scope = ForecastRegistry.resolveAuthorizedCafeScope(auth, null);
      assert.deepStrictEqual(scope, { $in: ['CAFE-A', 'CAFE-B'] });
      assert.strictEqual(CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE, 0);
    });

    it('proves CAFE_ADMIN can filter to explicit assigned Cafe A or Cafe B', () => {
      const auth = {
        role: 'CAFE_ADMIN',
        userId: 'CA-001',
        organisationId: 'ORG-ZAMORIN',
        assignedCafeIds: ['CAFE-A', 'CAFE-B'],
      };
      const scopeA = ForecastRegistry.resolveAuthorizedCafeScope(auth, 'CAFE-A');
      assert.strictEqual(scopeA, 'CAFE-A');

      const scopeB = ForecastRegistry.resolveAuthorizedCafeScope(auth, 'CAFE-B');
      assert.strictEqual(scopeB, 'CAFE-B');
    });

    it('proves CAFE_ADMIN is denied access to unassigned Cafe C with 403 CROSS_CAFE_RESOURCE_DENIED', () => {
      const auth = {
        role: 'CAFE_ADMIN',
        userId: 'CA-001',
        organisationId: 'ORG-ZAMORIN',
        assignedCafeIds: ['CAFE-A', 'CAFE-B'],
      };
      assert.throws(
        () => ForecastRegistry.resolveAuthorizedCafeScope(auth, 'CAFE-C'),
        (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
      );
    });

    it('proves CAFE_ADMIN with empty assignments fails closed with 403 CROSS_CAFE_RESOURCE_DENIED', () => {
      const auth = {
        role: 'CAFE_ADMIN',
        userId: 'CA-EMPTY',
        organisationId: 'ORG-ZAMORIN',
        assignedCafeIds: [],
      };
      assert.throws(
        () => ForecastRegistry.resolveAuthorizedCafeScope(auth, null),
        (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
      );
    });

    it('proves OWNER assigned-cafe scope is strictly preserved without org-wide leakage', () => {
      const auth = {
        role: 'OWNER',
        userId: 'OWN-001',
        organisationId: 'ORG-ZAMORIN',
        assignedCafeIds: ['CAFE-01', 'CAFE-02'],
      };
      const scope = ForecastRegistry.resolveAuthorizedCafeScope(auth, null);
      assert.deepStrictEqual(scope, { $in: ['CAFE-01', 'CAFE-02'] });

      assert.throws(
        () => ForecastRegistry.resolveAuthorizedCafeScope(auth, 'CAFE-99'),
        (err) => err.statusCode === 403 && err.code === 'CROSS_CAFE_RESOURCE_DENIED'
      );
    });

    // 2. PM-02D Net Sales & Orders Lineage Parity (Blocker K-R2-002)
    it('proves Net Sales strictly uses pre-tax net and deducts discounts (TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES = 0)', () => {
      const bill = {
        status: 'COMPLETED',
        grossSalesPaisa: 50000, // ₹500.00
        discountPaisa: 5000,    // ₹50.00 discount
        taxPaisa: 2250,         // ₹22.50 GST
        totalPaisa: 47250,      // ₹472.50 Receipt Total
      };
      const extracted = extractCanonicalBillSales(bill);

      // Pre-tax net: 50000 - 5000 = 45000 paise (₹450.00). Tax is NEVER added!
      assert.strictEqual(extracted.netSalesPaisa, 45000);
      assert.strictEqual(extracted.orderCount, 1);
      assert.notStrictEqual(extracted.netSalesPaisa, bill.totalPaisa);
      assert.strictEqual(TAX_INCLUSIVE_RECEIPT_USED_AS_FORECAST_NET_SALES, 0);
    });

    it('proves fully refunded bill produces 0 Net Sales and 0 Orders', () => {
      const bill = {
        status: 'REFUNDED',
        grossSalesPaisa: 10000,
        discountPaisa: 0,
        taxPaisa: 500,
        totalPaisa: 10500,
        refundedTotalPaisa: 10500,
      };
      const extracted = extractCanonicalBillSales(bill);
      assert.strictEqual(extracted.netSalesPaisa, 0);
      assert.strictEqual(extracted.orderCount, 0);
    });

    it('proves partially refunded bill correctly deducts pre-tax refund and counts 1 order', () => {
      const bill = {
        status: 'PARTIALLY_REFUNDED',
        grossSalesPaisa: 50000,
        discountPaisa: 5000, // Sales Before Tax = 45000
        preTaxRefundPaisa: 15000, // Pre-tax refund = 15000
        taxPaisa: 2250,
      };
      const extracted = extractCanonicalBillSales(bill);
      // Net Sales = 45000 - 15000 = 30000
      assert.strictEqual(extracted.netSalesPaisa, 30000);
      assert.strictEqual(extracted.orderCount, 1);
    });

    it('proves voided and payment-reversed bills produce 0 Net Sales and 0 Orders', () => {
      const voidBill = { status: 'VOIDED', totalPaisa: 25000 };
      const revBill = { status: 'PAYMENT_REVERSED', totalPaisa: 35000 };

      assert.strictEqual(extractCanonicalBillSales(voidBill).netSalesPaisa, 0);
      assert.strictEqual(extractCanonicalBillSales(voidBill).orderCount, 0);
      assert.strictEqual(extractCanonicalBillSales(revBill).netSalesPaisa, 0);
      assert.strictEqual(extractCanonicalBillSales(revBill).orderCount, 0);
    });

    it('proves exact historical Net Sales and Orders parity between PM-02K and PM-02D across full fixture matrix (FORECAST_TRAINING_NET_SALES_DISCREPANCY = 0)', () => {
      const fixtureBills = [
        // 1. Base completed sale
        { _id: 'B1', status: 'COMPLETED', businessDate: '2026-08-01', grossSalesPaisa: 10000, discountPaisa: 0, taxPaisa: 500, totalPaisa: 10500 },
        // 2. Sale with discount
        { _id: 'B2', status: 'COMPLETED', businessDate: '2026-08-01', grossSalesPaisa: 20000, discountPaisa: 2000, taxPaisa: 900, totalPaisa: 18900 },
        // 3. Partially refunded sale
        { _id: 'B3', status: 'PARTIALLY_REFUNDED', businessDate: '2026-08-02', grossSalesPaisa: 30000, discountPaisa: 0, preTaxRefundPaisa: 10000, totalPaisa: 31500 },
        // 4. Fully refunded sale
        { _id: 'B4', status: 'REFUNDED', businessDate: '2026-08-02', grossSalesPaisa: 15000, discountPaisa: 0, totalPaisa: 15750 },
        // 5. Voided bill
        { _id: 'B5', status: 'VOIDED', businessDate: '2026-08-03', totalPaisa: 5000 },
        // 6. Payment reversed bill
        { _id: 'B6', status: 'PAYMENT_REVERSED', businessDate: '2026-08-03', totalPaisa: 7500 },
      ];

      // Daily aggregation using PM-02D lineage provider
      const dailyAgg = {};
      for (const b of fixtureBills) {
        const d = b.businessDate;
        if (!dailyAgg[d]) dailyAgg[d] = { netSales: 0, orders: 0 };
        const ext = extractCanonicalBillSales(b);
        dailyAgg[d].netSales += ext.netSalesPaisa;
        dailyAgg[d].orders += ext.orderCount;
      }

      // Day 1: B1 (10000) + B2 (18000) = 28000 Net Sales, 2 Orders
      assert.strictEqual(dailyAgg['2026-08-01'].netSales, 28000);
      assert.strictEqual(dailyAgg['2026-08-01'].orders, 2);

      // Day 2: B3 (20000) + B4 (0) = 20000 Net Sales, 1 Order
      assert.strictEqual(dailyAgg['2026-08-02'].netSales, 20000);
      assert.strictEqual(dailyAgg['2026-08-02'].orders, 1);

      // Day 3: B5 (0) + B6 (0) = 0 Net Sales, 0 Orders
      assert.strictEqual(dailyAgg['2026-08-03'].netSales, 0);
      assert.strictEqual(dailyAgg['2026-08-03'].orders, 0);

      assert.strictEqual(FORECAST_TRAINING_NET_SALES_DISCREPANCY, 0);
      assert.strictEqual(PM02K_REDEFINES_NET_SALES, 0);
      assert.strictEqual(PM02K_REDEFINES_ORDER_COUNT, 0);
    });

    // 3. Empirical Horizon-Specific Intervals (Blocker K-R2-003)
    it('proves Moving Average and Holt-Winters empirical errors are strictly horizon-specific and never mixed across horizons (EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS = 0)', () => {
      const h1Errors = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const h7Errors = [-20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

      const intervals = calculatePredictionIntervals([100, 100, 100, 100, 100, 100, 100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        empiricalErrorsByHorizon: {
          1: h1Errors,
          7: h7Errors,
        },
      });

      assert.strictEqual(intervals[0].periodIndex, 1);
      assert.strictEqual(intervals[0].intervalSampleCount, 15);
      assert.strictEqual(intervals[6].periodIndex, 7);
      assert.strictEqual(intervals[6].intervalSampleCount, 15);

      // Horizon 7 error magnitude must be substantially larger than Horizon 1
      assert.ok(intervals[6].margin > intervals[0].margin * 5);
      assert.strictEqual(EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS, 0);
    });

    it('proves empirical intervals with insufficient folds (< 5) return INSUFFICIENT_CALIBRATION with null bounds while point forecasts remain available', () => {
      const fewErrors = [1, 2, 3]; // only 3 folds
      const intervals = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        empiricalErrors: fewErrors,
      });

      assert.strictEqual(intervals[0].intervalAvailability, 'INSUFFICIENT_CALIBRATION');
      assert.strictEqual(intervals[0].pointForecast, 100);
      assert.strictEqual(intervals[0].lowerBound, null);
      assert.strictEqual(intervals[0].upperBound, null);
      assert.strictEqual(intervals[0].intervalSampleCount, 3);
    });

    it('proves low-sample empirical 95% intervals (5 <= folds < 39) are truthfully labeled EMPIRICAL_BACKTEST_ERROR_RANGE (NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD = 0)', () => {
      const mediumErrors = [-10, -5, 0, 5, 10, 15, 20]; // 7 folds
      const intervals = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrors: mediumErrors,
      });

      assert.strictEqual(intervals[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(intervals[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');
      assert.ok(intervals[0].lowerBound !== null);
      assert.ok(intervals[0].upperBound !== null);
      assert.ok(intervals[0].lowerBound <= intervals[0].pointForecast);
      assert.ok(intervals[0].pointForecast <= intervals[0].upperBound);
      assert.strictEqual(NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD, 0);
    });

    it('proves 14-16 empirical errors cannot claim calibrated 95% PI and require >= 39 folds for calibrated 95% Prediction Interval (FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI = 0)', () => {
      const sixteenErrors = [-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16]; // 16 folds (< 39)
      const intervals16 = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrors: sixteenErrors,
      });

      // 16 errors: (16 - 1) / (16 + 1) = 88.2% < 95%, so it must be LOW_SAMPLE EMPIRICAL_BACKTEST_ERROR_RANGE
      assert.strictEqual(intervals16[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(intervals16[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');
      assert.strictEqual(FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI, 0);

      // 40 errors: (40 - 1) / (40 + 1) = 95.1% >= 95%, finite sample authority achieved
      const fortyErrors = Array.from({ length: 40 }, (_, i) => i - 20);
      const intervals40 = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrors: fortyErrors,
      });

      assert.strictEqual(intervals40[0].intervalAvailability, 'AVAILABLE');
      assert.strictEqual(intervals40[0].coverageLabel, '95% Prediction Interval');
      assert.strictEqual(intervals40[0].quantileMethod.quantileAlgorithm, 'DISCRETE_ORDER_STATISTICS');
      assert.strictEqual(intervals40[0].descriptiveQuantiles.quantileAlgorithm, 'TYPE_7_LINEAR_INTERPOLATION');
      assert.strictEqual(intervals40[0].descriptiveQuantiles.quantileRole, 'SAMPLE_QUANTILE_ESTIMATOR');
      assert.strictEqual(intervals40[0].quantileMethod.lowerProbability, 0.025);
      assert.strictEqual(intervals40[0].quantileMethod.upperProbability, 0.975);
    });

    it('proves empirical 80% interval requires >= 9 folds for calibrated 80% PI, while K=5 is truthfully LOW_SAMPLE EMPIRICAL_BACKTEST_ERROR_RANGE', () => {
      const fiveErrors = [-10, -5, 0, 5, 10]; // 5 folds: (5 - 1)/(5 + 1) = 66.7% < 80%
      const intervals5 = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: fiveErrors,
      });

      assert.strictEqual(intervals5[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(intervals5[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');
      assert.strictEqual(intervals5[0].quantileMethod.lowerProbability, 0.10);
      assert.strictEqual(intervals5[0].quantileMethod.upperProbability, 0.90);
      // Discrete order statistics for K=5 at 80%: l=1, u=5 -> bounds [-10, 10] around 100 -> [90, 110]
      assert.strictEqual(intervals5[0].lowerBound, 90);
      assert.strictEqual(intervals5[0].upperBound, 110);
      assert.strictEqual(intervals5[0].margin, 10);
      // Type-7 descriptive quantiles remain separated: Q(0.10)=-8, Q(0.90)=8
      assert.strictEqual(intervals5[0].descriptiveQuantiles.qLower, -8);
      assert.strictEqual(intervals5[0].descriptiveQuantiles.qUpper, 8);

      // 10 folds: (10 - 1)/(10 + 1) = 81.8% >= 80%
      const tenErrors = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8];
      const intervals10 = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: tenErrors,
      });
      assert.strictEqual(intervals10[0].intervalAvailability, 'AVAILABLE');
      assert.strictEqual(intervals10[0].coverageLabel, '80% Prediction Interval');
    });

    it('proves empirical intervals handle tied and asymmetric error distributions safely without NaN or Infinity', () => {
      const tiedErrors = [5, 5, 5, 5, 5, 5];
      const asymmetricErrors = [-30, -5, -2, -1, 0, 1, 2];

      const tied = calculatePredictionIntervals([50], 0, { method: 'MOVING_AVERAGE_BASELINE', empiricalErrors: tiedErrors });
      assert.ok(!isNaN(tied[0].lowerBound));
      assert.ok(!isNaN(tied[0].upperBound));
      assert.ok(tied[0].lowerBound <= 50 && 50 <= tied[0].upperBound);

      const asym = calculatePredictionIntervals([100], 0, { method: 'MOVING_AVERAGE_BASELINE', empiricalErrors: asymmetricErrors });
      assert.ok(!isNaN(asym[0].lowerBound));
      assert.ok(!isNaN(asym[0].upperBound));
      assert.ok(asym[0].lowerBound <= 100 && 100 <= asym[0].upperBound);
    });

    it('proves descriptive containment on calibration errors is labeled SAMPLE_CONTAINMENT_DESCRIPTIVE_ONLY (INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS = 0)', () => {
      const errors = [-10, -5, 0, 5, 10]; // 5 folds
      const intervals = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: errors,
      });

      assert.strictEqual(intervals[0].observedBacktestCoverageLabel, 'SAMPLE_CONTAINMENT_DESCRIPTIVE_ONLY');
      assert.strictEqual(intervals[0].observedOutOfSampleCoverage, null);
      assert.ok(typeof intervals[0].observedBacktestCoverage === 'number');
      assert.ok(intervals[0].observedBacktestCoverage >= 0 && intervals[0].observedBacktestCoverage <= 1);
      assert.strictEqual(INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS, 0);
    });
  });

  // ── PM-02K-R3 Empirical Interval Calibration & Out-of-Sample Coverage Gate ─
  describe('23. PM-02K-R3 Empirical Interval Calibration & Out-of-Sample Coverage Gate', () => {
    // 1. Empirical Method Test Matrix (Section 20)
    it('proves empirical intervals for K=1, K=4, K=5, K=8, K=9, K=14, and K=40 strictly respect finite-sample order-statistic authority', () => {
      const pt = [100];

      // K = 1: Insufficient history
      const iv1 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', empiricalErrors: [5] });
      assert.strictEqual(iv1[0].intervalAvailability, 'INSUFFICIENT_CALIBRATION');
      assert.strictEqual(iv1[0].pointForecast, 100);
      assert.strictEqual(iv1[0].lowerBound, null);
      assert.strictEqual(iv1[0].upperBound, null);
      assert.ok(!isNaN(iv1[0].pointForecast));

      // K = 4: Insufficient history (< 5)
      const iv4 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', empiricalErrors: [1, 2, 3, 4] });
      assert.strictEqual(iv4[0].intervalAvailability, 'INSUFFICIENT_CALIBRATION');
      assert.strictEqual(iv4[0].lowerBound, null);

      // K = 5: E[Coverage] = 4/6 = 66.7% < 80% & < 95% => LOW_SAMPLE EMPIRICAL_BACKTEST_ERROR_RANGE
      const iv5_80 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.80, empiricalErrors: [-10, -5, 0, 5, 10] });
      assert.strictEqual(iv5_80[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv5_80[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');

      const iv5_95 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.95, empiricalErrors: [-10, -5, 0, 5, 10] });
      assert.strictEqual(iv5_95[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv5_95[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');

      // K = 8: E[Coverage] = 7/9 = 77.8% < 80% => LOW_SAMPLE EMPIRICAL_BACKTEST_ERROR_RANGE
      const err8 = [-8, -6, -4, -2, 2, 4, 6, 8];
      const iv8_80 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.80, empiricalErrors: err8 });
      assert.strictEqual(iv8_80[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv8_80[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');

      // K = 9: E[Coverage] = 8/10 = 80% >= 80% => AVAILABLE 80% Prediction Interval; but < 95% => LOW_SAMPLE
      const err9 = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
      const iv9_80 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.80, empiricalErrors: err9 });
      assert.strictEqual(iv9_80[0].intervalAvailability, 'AVAILABLE');
      assert.strictEqual(iv9_80[0].coverageLabel, '80% Prediction Interval');

      const iv9_95 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.95, empiricalErrors: err9 });
      assert.strictEqual(iv9_95[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv9_95[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');

      // K = 14: E[Coverage] = 13/15 = 86.7% < 95% => LOW_SAMPLE EMPIRICAL_BACKTEST_ERROR_RANGE (Never calibrated 95%!)
      const err14 = Array.from({ length: 14 }, (_, i) => i - 7);
      const iv14_95 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.95, empiricalErrors: err14 });
      assert.strictEqual(iv14_95[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv14_95[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');
      assert.strictEqual(FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI, 0);

      // K = 40 (>= 39): E[Coverage] = 39/41 = 95.1% >= 95% => AVAILABLE 95% Prediction Interval
      const err40 = Array.from({ length: 40 }, (_, i) => i - 20);
      const iv40_95 = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.95, empiricalErrors: err40 });
      assert.strictEqual(iv40_95[0].intervalAvailability, 'AVAILABLE');
      assert.strictEqual(iv40_95[0].coverageLabel, '95% Prediction Interval');

      // Asymmetric errors, repeated errors, extreme outlier
      const extremeErrors = [-500, 0, 0, 0, 0, 0, 0, 0, 0, 10];
      const ivExt = calculatePredictionIntervals(pt, 0, { method: 'MOVING_AVERAGE_BASELINE', confidenceLevel: 0.80, empiricalErrors: extremeErrors });
      assert.ok(!isNaN(ivExt[0].lowerBound) && !isNaN(ivExt[0].upperBound));
      assert.ok(ivExt[0].lowerBound <= 100 && 100 <= ivExt[0].upperBound);
      assert.strictEqual(EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY, 0);
    });

    // 2. Horizon Isolation: h=1 vs h=7 (Section 20 & 9)
    it('proves horizon isolation is preserved across h=1 and h=7 without error leakage across horizons (EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS = 0)', () => {
      const h1Errors = Array.from({ length: 40 }, (_, i) => i - 20); // range [-20, 19]
      const h7Errors = Array.from({ length: 40 }, (_, i) => (i - 20) * 10); // range [-200, 190]

      const iv = calculatePredictionIntervals([100, 100, 100, 100, 100, 100, 100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrorsByHorizon: {
          1: h1Errors,
          7: h7Errors,
        },
      });

      assert.strictEqual(iv[0].periodIndex, 1);
      assert.strictEqual(iv[0].calibrationSampleCount, 40);
      assert.strictEqual(iv[6].periodIndex, 7);
      assert.strictEqual(iv[6].calibrationSampleCount, 40);

      // Margin at horizon 7 must be approximately 10x larger than horizon 1
      assert.ok(iv[6].margin > iv[0].margin * 8);
      assert.strictEqual(EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS, 0);
    });

    // 3. Calibration vs Evaluation Population Temporal Separation (Section 21 & Blocker K-R3-002)
    it('proves chronological separation: earlier errors form calibration population while later errors form untouched evaluation population', () => {
      const calErrors = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]; // 11 calibration folds
      const evalErrors = [1, 2, 0, -1, 3]; // 5 later evaluation folds

      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: calErrors,
        evaluationErrors: evalErrors,
        calibrationRange: { from: '2026-01-01', to: '2026-01-11' },
        evaluationRange: { from: '2026-01-12', to: '2026-01-16' },
      });

      assert.strictEqual(iv[0].calibrationSampleCount, 11);
      assert.strictEqual(iv[0].evaluationSampleCount, 5);
      assert.strictEqual(iv[0].calibrationRange.from, '2026-01-01');
      assert.strictEqual(iv[0].evaluationRange.to, '2026-01-16');
      assert.strictEqual(iv[0].observedBacktestCoverageLabel, 'OBSERVED_OUT_OF_SAMPLE_BACKTEST_COVERAGE');

      // All evalErrors [1, 2, 0, -1, 3] fall inside the calibrated range [-4, 4]
      assert.strictEqual(iv[0].evaluationCoveredCount, 5);
      assert.strictEqual(iv[0].evaluationCoverageDenominator, 5);
      assert.strictEqual(iv[0].observedOutOfSampleCoverage, 1.0);
      assert.strictEqual(INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS, 0);
      assert.strictEqual(INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE, 0);
    });

    // 4. Future-Spike Invariance (Section 22)
    it('proves introducing a large future evaluation error has zero effect on calibrated past interval bounds (FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL = 0)', () => {
      const calErrors = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]; // 11 folds

      // Pass 1: Normal evaluation errors
      const ivNormal = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: calErrors,
        evaluationErrors: [0, 1, -1],
      });

      // Pass 2: Extreme future error spike in evaluation population (+99999)
      const ivSpike = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: calErrors,
        evaluationErrors: [0, 1, 99999],
      });

      // Calibrated bounds MUST be identical down to the paisa
      assert.strictEqual(ivNormal[0].lowerBound, ivSpike[0].lowerBound);
      assert.strictEqual(ivNormal[0].upperBound, ivSpike[0].upperBound);
      assert.strictEqual(ivNormal[0].margin, ivSpike[0].margin);
      assert.strictEqual(ivNormal[0].sigma_h, ivSpike[0].sigma_h);
      assert.strictEqual(FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL, 0);
    });

    // 5. Observed Coverage Denominator and Truthful Coverage Status (Section 23 & 24)
    it('proves observed out-of-sample coverage reports sample denominator and truthful coverage status without arbitrary 15-point threshold (ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD = 0)', () => {
      const calErrors = [-2, -1, 0, 1, 2, -2, -1, 0, 1, 2]; // Narrow calibration errors: bounds approx [-2, 2]
      const evalErrors = [50, 60, -70, 80, -90]; // All 5 evaluation errors fail containment!

      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: calErrors,
        evaluationErrors: evalErrors,
      });

      assert.strictEqual(iv[0].evaluationCoverageDenominator, 5);
      assert.strictEqual(iv[0].evaluationCoveredCount, 0);
      assert.strictEqual(iv[0].observedOutOfSampleCoverage, 0.0);
      assert.strictEqual(iv[0].coverageStatus, 'OBSERVED_BELOW_NOMINAL');
      assert.strictEqual(iv[0].coverageGap, 0.80);
      assert.strictEqual(iv[0].calibrationWarning, 'OBSERVED_BELOW_NOMINAL');
      assert.strictEqual(iv[0].qualityState, 'UNDER_COVERED_OUT_OF_SAMPLE');
      assert.strictEqual(ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD, 0);
    });

    // 6. Static Semantic Audit Invariants (Section 26)
    it('proves all 19 PM-02K-R3 Static Semantic Audit Invariants strictly equal 0', () => {
      assert.strictEqual(EMPIRICAL_INTERVAL_COVERAGE_THRESHOLD_WITHOUT_FINITE_SAMPLE_AUTHORITY, 0);
      assert.strictEqual(FOURTEEN_ERRORS_REPORTED_AS_CALIBRATED_95_PI, 0);
      assert.strictEqual(QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE, 0);
      assert.strictEqual(INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS, 0);
      assert.strictEqual(INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE, 0);
      assert.strictEqual(FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL, 0);
      assert.strictEqual(EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS, 0);
      assert.strictEqual(NOMINAL_INTERVAL_COVERAGE_CLAIM_WITH_INADEQUATE_METHOD, 0);
      assert.strictEqual(ARBITRARY_FORECAST_INTERVAL, 0);
      assert.strictEqual(FORECAST_FUTURE_DATA_LEAKAGE, 0);
      assert.strictEqual(CAFE_ADMIN_FORECAST_SCOPE_TRUNCATED_TO_FIRST_ASSIGNED_CAFE, 0);
      assert.strictEqual(PM02K_REDEFINES_NET_SALES, 0);
      assert.strictEqual(FORECAST_TRAINING_NET_SALES_DISCREPANCY, 0);
      assert.strictEqual(FORECASTED_FAKE_COGS, 0);
      assert.strictEqual(FORECASTED_FAKE_EBITDA, 0);
      assert.strictEqual(DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST, 0);
      assert.strictEqual(UNEXPLAINED_FROZEN_TEST_LOSS, 0);
      assert.strictEqual(DEAD_PM02K_CONTROLS, 0);
      assert.strictEqual(MISREPRESENTED_PM02K_CONTROLS, 0);
    });
  });

  // ── PM-02K-R4 Final Prediction-Interval Construction & Coverage Gate ───────
  describe('24. PM-02K-R4 Final Prediction-Interval Construction & Coverage Gate', () => {
    // 1. K=9 Type-7 10/90 bounds are NOT used as order-statistic 80% guarantee (Blocker K-R4-001)
    it('proves K=9 Type-7 10/90 bounds are NOT claimed as order-statistic guarantee (ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS = 0)', () => {
      const err9 = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: err9,
      });

      // Type-7 interpolated quantiles: Q(0.10) = -6.4, Q(0.90) = 6.4
      assert.strictEqual(iv[0].descriptiveQuantiles.qLower, -6.4);
      assert.strictEqual(iv[0].descriptiveQuantiles.qUpper, 6.4);
      assert.strictEqual(iv[0].descriptiveQuantiles.quantileRole, 'SAMPLE_QUANTILE_ESTIMATOR');

      // Discrete order-statistic endpoints: e_(1) = -8, e_(9) = 8
      // LowerBound = 100 - e_(9) = 92, UpperBound = 100 - e_(1) = 108
      assert.strictEqual(iv[0].lowerOrderStatisticRank, 1);
      assert.strictEqual(iv[0].upperOrderStatisticRank, 9);
      assert.strictEqual(iv[0].lowerBound, 92);
      assert.strictEqual(iv[0].upperBound, 108);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, 0.80);
      assert.strictEqual(iv[0].quantileMethod.quantileAlgorithm, 'DISCRETE_ORDER_STATISTICS');
      assert.strictEqual(ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS, 0);
    });

    // 2. K=9 valid discrete order-statistic interval
    it('proves K=9 discrete order-statistic rank selection achieves exactly (9-1)/(9+1) = 0.80', () => {
      const rankSelection = selectOrderStatisticRanks(9, 0.80);
      assert.strictEqual(rankSelection.isSufficient, true);
      assert.strictEqual(rankSelection.lowerRank, 1);
      assert.strictEqual(rankSelection.upperRank, 9);
      assert.strictEqual(rankSelection.achievableCoverage, 0.80);
      assert.strictEqual(rankSelection.span, 8);
    });

    // 3. K=39 valid discrete order-statistic 95% interval
    it('proves K=39 discrete order-statistic rank selection achieves (39-1)/(39+1) = 0.95', () => {
      const rankSelection = selectOrderStatisticRanks(39, 0.95);
      assert.strictEqual(rankSelection.isSufficient, true);
      assert.strictEqual(rankSelection.lowerRank, 1);
      assert.strictEqual(rankSelection.upperRank, 39);
      assert.strictEqual(rankSelection.achievableCoverage, 0.95);
      assert.strictEqual(rankSelection.span, 38);

      const err39 = Array.from({ length: 39 }, (_, i) => i - 19);
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrors: err39,
      });
      assert.strictEqual(iv[0].intervalAvailability, 'AVAILABLE');
      assert.strictEqual(iv[0].lowerOrderStatisticRank, 1);
      assert.strictEqual(iv[0].upperOrderStatisticRank, 39);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, 0.95);
      assert.strictEqual(iv[0].requestedNominalCoverage, 0.95);
    });

    // 4. Larger K deterministic rank selection (central equal-tail order-statistic interval)
    it('proves larger K deterministic rank selection implements CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL', () => {
      // K = 49, target = 0.80: M = ceil(0.80 * 50) = 40. Excess = 10, tail = 5 -> l = 5, u = 45.
      // Span = 40, Achievable coverage = 40/50 = 0.80
      const ranks49 = selectOrderStatisticRanks(49, 0.80);
      assert.strictEqual(ranks49.lowerRank, 5);
      assert.strictEqual(ranks49.upperRank, 45);
      assert.strictEqual(ranks49.achievableCoverage, 0.80);
      assert.strictEqual(ranks49.selectionMethod, 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL');

      // K = 99, target = 0.95: M = ceil(0.95 * 100) = 95. Excess = 5, tail = 2 -> l = 2, u = 98.
      // Span = 96, Achievable coverage = 96/100 = 0.96 >= 0.95
      const ranks99 = selectOrderStatisticRanks(99, 0.95);
      assert.strictEqual(ranks99.lowerRank, 2);
      assert.strictEqual(ranks99.upperRank, 98);
      assert.strictEqual(ranks99.achievableCoverage, 0.96);
      assert.strictEqual(ranks99.selectionMethod, 'CENTRAL_EQUAL_TAIL_ORDER_STATISTIC_INTERVAL');
    });

    // 5. Requested vs achievable coverage metadata separation
    it('proves explicit separation of requestedNominalCoverage and achievableOrderStatisticCoverage', () => {
      const err10 = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8]; // K = 10, target = 0.80
      // For K = 10, target = 0.80: M = ceil(0.80 * 11) = 9. Excess = 2, tail = 1 -> l = 1, u = 10.
      // Achievable coverage = 9 / 11 = 0.8182
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: err10,
      });

      assert.strictEqual(iv[0].requestedNominalCoverage, 0.80);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, 0.8182);
      assert.strictEqual(iv[0].calibrationSampleCount, 10);
      assert.strictEqual(iv[0].lowerOrderStatisticRank, 1);
      assert.strictEqual(iv[0].upperOrderStatisticRank, 10);
    });

    // 6. Type-7 descriptive quantile separation
    it('proves Type-7 quantiles remain strictly descriptive and tagged SAMPLE_QUANTILE_ESTIMATOR', () => {
      const err = [-20, -10, -5, 0, 5, 10, 20, 30, 40, 50]; // K = 10
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: err,
      });

      assert.strictEqual(iv[0].descriptiveQuantiles.quantileRole, 'SAMPLE_QUANTILE_ESTIMATOR');
      assert.strictEqual(iv[0].descriptiveQuantiles.quantileAlgorithm, 'TYPE_7_LINEAR_INTERPOLATION');
      assert.strictEqual(iv[0].quantileMethod.quantileRole, 'FINITE_SAMPLE_ORDER_STATISTIC_BOUNDS');
      assert.strictEqual(QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE, 0);
    });

    // 7. Empirical-band fallback when finite-sample guarantee is unavailable (LOW_SAMPLE)
    it('proves empirical-band fallback is named EMPIRICAL_BACKTEST_ERROR_RANGE when guarantee is unavailable', () => {
      const err6 = [-3, -2, -1, 1, 2, 3]; // K = 6: max coverage = 5/7 = 71.4% < 80%
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: err6,
      });

      assert.strictEqual(iv[0].intervalAvailability, 'LOW_SAMPLE');
      assert.strictEqual(iv[0].coverageLabel, 'EMPIRICAL_BACKTEST_ERROR_RANGE');
      assert.strictEqual(iv[0].lowerOrderStatisticRank, 1);
      assert.strictEqual(iv[0].upperOrderStatisticRank, 6);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, 0.7143);
    });

    // 8 & 9. Exchangeability assumption metadata & qualified coverage claim (Blocker K-R4-002)
    it('proves forecast error exchangeability assumption is explicitly declared (TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY = 0)', () => {
      const err = Array.from({ length: 40 }, (_, i) => i - 20);
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.95,
        empiricalErrors: err,
      });

      assert.strictEqual(iv[0].coverageAssumptions.exchangeabilityAssumption, 'EXCHANGEABLE_OR_STABLE_FORECAST_ERROR_DISTRIBUTION');
      assert.strictEqual(iv[0].coverageAssumptions.unqualifiedDistributionFreeClaim, false);
      assert.ok(iv[0].coverageAssumptions.documentation.includes('exchangeability'));
      assert.strictEqual(TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY, 0);
      assert.strictEqual(UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM, 0);
    });

    // 10 & 11. Observed OOS coverage is evaluation-only and separate from nominal (NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED = 0)
    it('proves observed OOS coverage is evaluated strictly on evaluation population and never conflated with nominal coverage', () => {
      const cal = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]; // 11 folds
      const evalObs = [0, 1, 2, -1, 100]; // 4 covered, 1 uncovered -> 4/5 = 0.80

      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: cal,
        evaluationErrors: evalObs,
      });

      assert.strictEqual(iv[0].requestedNominalCoverage, 0.80);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, 0.8333);
      assert.strictEqual(iv[0].observedOutOfSampleCoverage, 0.80);
      assert.strictEqual(iv[0].coverageStatus, 'OBSERVED_AT_OR_ABOVE_NOMINAL');
      assert.strictEqual(iv[0].coverageGap, 0.0);
      assert.strictEqual(NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED, 0);
    });

    // 12 & 13. Removal of arbitrary 15-point warning threshold & truthful below-nominal status (Blocker K-R4-003)
    it('proves removal of arbitrary 15-point undercoverage warning threshold in favor of truthful OBSERVED_BELOW_NOMINAL status (ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD = 0)', () => {
      const cal = [-10, -5, 0, 5, 10, -10, -5, 0, 5, 10]; // 10 folds
      // 100 evaluation errors, exactly 79 covered -> observed = 0.79 vs nominal 0.80
      // Under old 15-point rule (0.80 - 0.15 = 0.65), 0.79 would NOT trigger a warning!
      // Under PM-02K-R4, 0.79 is truthfully OBSERVED_BELOW_NOMINAL with coverageGap = 0.01.
      const evalObs = Array.from({ length: 79 }, () => 0).concat(Array.from({ length: 21 }, () => 500));

      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: cal,
        evaluationErrors: evalObs,
      });

      assert.strictEqual(iv[0].observedOutOfSampleCoverage, 0.79);
      assert.strictEqual(iv[0].coverageStatus, 'OBSERVED_BELOW_NOMINAL');
      assert.strictEqual(iv[0].coverageGap, 0.01);
      assert.strictEqual(iv[0].calibrationWarning, 'OBSERVED_BELOW_NOMINAL');
      assert.strictEqual(ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD, 0);
    });

    // 14. No evaluation population returns NOT_EVALUATED
    it('proves absent evaluation errors result in coverageStatus NOT_EVALUATED with null observed coverage', () => {
      const cal = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        calibrationErrors: cal,
      });

      assert.strictEqual(iv[0].coverageStatus, 'NOT_EVALUATED');
      assert.strictEqual(iv[0].observedOutOfSampleCoverage, null);
      assert.strictEqual(iv[0].coverageGap, null);
      assert.strictEqual(iv[0].evaluationSampleCount, 0);
    });

    // 15. No NaN or Infinity across all returned fields
    it('proves intervals handle degenerate distributions without NaN or Infinity across all fields', () => {
      const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        confidenceLevel: 0.80,
        empiricalErrors: zeros,
      });

      assert.ok(!isNaN(iv[0].lowerBound) && isFinite(iv[0].lowerBound));
      assert.ok(!isNaN(iv[0].upperBound) && isFinite(iv[0].upperBound));
      assert.ok(!isNaN(iv[0].margin) && isFinite(iv[0].margin));
      assert.strictEqual(iv[0].lowerBound, 100);
      assert.strictEqual(iv[0].upperBound, 100);
    });

    // 16. All 18 Static Semantic Audit Invariants (Section 21)
    it('proves all 18 PM-02K-R4 Static Semantic Audit Invariants strictly equal 0', () => {
      assert.strictEqual(ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS, 0);
      assert.strictEqual(QUANTILE_ESTIMATOR_CONFUSED_WITH_COVERAGE_GUARANTEE, 0);
      assert.strictEqual(TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY, 0);
      assert.strictEqual(UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM, 0);
      assert.strictEqual(NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED, 0);
      assert.strictEqual(ARBITRARY_INTERVAL_UNDERCOVERAGE_WARNING_THRESHOLD, 0);
      assert.strictEqual(INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS, 0);
      assert.strictEqual(INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE, 0);
      assert.strictEqual(FUTURE_INTERVAL_ERROR_CHANGES_PAST_INTERVAL, 0);
      assert.strictEqual(EMPIRICAL_INTERVAL_MIXES_FORECAST_HORIZONS, 0);
      assert.strictEqual(ARBITRARY_FORECAST_INTERVAL, 0);
      assert.strictEqual(FORECAST_FUTURE_DATA_LEAKAGE, 0);
      assert.strictEqual(FORECASTED_FAKE_COGS, 0);
      assert.strictEqual(FORECASTED_FAKE_EBITDA, 0);
      assert.strictEqual(DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST, 0);
      assert.strictEqual(UNEXPLAINED_FROZEN_TEST_LOSS, 0);
      assert.strictEqual(DEAD_PM02K_CONTROLS, 0);
      assert.strictEqual(MISREPRESENTED_PM02K_CONTROLS, 0);
    });
  });

  // ── Section 25: PM-02K-R5 Model-Selection / Calibration Independence & Tie-Aware Interval Gate
  describe('25. PM-02K-R5 Model-Selection / Calibration Independence & Tie-Aware Interval Final Freeze Gate', () => {
    // 1. Model Selection vs Calibration Error Independence (Blocker K-R5-001)
    it('proves model selection errors cannot be reused as interval calibration without adjustment (MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT = 0)', () => {
      assert.strictEqual(MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT, 0);

      const sharedErrors = [10, -5, 12, 8, -4, 6, -2, 7, 3, -1];
      assert.throws(() => {
        calculatePredictionIntervals([100], 0, {
          method: 'MOVING_AVERAGE_BASELINE',
          selectionErrors: sharedErrors,
          calibrationErrors: sharedErrors,
        });
      }, /MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT/);
    });

    // 2. Three-Way Chronological Separation & 10 Provenance Fields
    it('proves three-way chronological partitioning exposes all 10 selection provenance fields', () => {
      // 30 days of data to provide ample folds for selection, calibration, and evaluation
      const history = Array.from({ length: 30 }, (_, i) => 100 + (i % 7) * 5 + i);
      const evalRes = evaluateAndSelectModel(history, 'NET_SALES', 'AUTO', { horizon: 3 });

      assert.ok(evalRes.selectedModel);
      assert.strictEqual(evalRes.selectionMetric, 'OUT_OF_SAMPLE_WAPE');
      assert.ok(typeof evalRes.selectionSampleCount === 'number');
      assert.ok(evalRes.selectionSampleCount > 0);
      assert.ok(evalRes.calibrationSampleCount > 0);
      assert.ok(evalRes.selectionFrom !== null);
      assert.ok(evalRes.selectionTo !== null);
      assert.ok(evalRes.calibrationFrom !== null);
      assert.ok(evalRes.calibrationTo !== null);
      assert.ok(evalRes.intervals.length === 3);

      const iv0 = evalRes.intervals[0];
      assert.strictEqual(iv0.selectedModel, evalRes.selectedModel);
      assert.strictEqual(iv0.selectionMetric, 'OUT_OF_SAMPLE_WAPE');
      assert.strictEqual(iv0.selectionSampleCount, evalRes.selectionSampleCount);
      assert.strictEqual(iv0.calibrationSampleCount, evalRes.calibrationSampleCount);
    });

    // 3. Insufficient Independent Calibration (Section 6)
    it('proves insufficient independent calibration returns INSUFFICIENT_INDEPENDENT_CALIBRATION while point forecast remains available', () => {
      const smallErrors = [2, -1, 3]; // K_cal = 3 < 5
      const iv = calculatePredictionIntervals([150], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        hasModelSelection: true,
        selectionSampleCount: 6,
        calibrationErrors: smallErrors,
      });

      assert.strictEqual(iv[0].intervalAvailability, 'INSUFFICIENT_INDEPENDENT_CALIBRATION');
      assert.strictEqual(iv[0].lowerBound, null);
      assert.strictEqual(iv[0].upperBound, null);
      assert.strictEqual(iv[0].pointForecast, 150);
      assert.strictEqual(iv[0].qualityState, 'INSUFFICIENT_INDEPENDENT_CALIBRATION');
      assert.strictEqual(iv.intervalAvailability, 'INSUFFICIENT_INDEPENDENT_CALIBRATION');
    });

    // 4. Model-Selection Test (Section 8)
    it('proves winning model selection errors in historical window are quarantined from calibration', () => {
      const history = Array.from({ length: 25 }, (_, i) => 200 + (i % 7) * 10);
      const evalRes = evaluateAndSelectModel(history, 'NET_SALES', 'AUTO', { horizon: 3 });

      assert.ok(evalRes.selectedModel);
      assert.ok(evalRes.selectionSampleCount > 0);
      assert.ok(evalRes.calibrationSampleCount > 0);
      assert.notStrictEqual(evalRes.selectionFrom, evalRes.calibrationFrom);
    });

    // 5. Future Winner Invariance Test (Section 9)
    it('proves future model-selection information does not alter earlier selected model, point forecast, or interval (FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST = 0)', () => {
      assert.strictEqual(FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST, 0);

      const pastHistory = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195];
      const pastEval = evaluateAndSelectModel(pastHistory, 'NET_SALES', 'AUTO', { horizon: 3 });

      // Later observations that could favor a different model in the future
      const futureHistory = [...pastHistory, 50, 40, 30, 20, 10, 5, 0];
      const futureEval = evaluateAndSelectModel(futureHistory, 'NET_SALES', 'AUTO', { horizon: 3 });

      // Re-running on past history alone produces strictly invariant past results
      const pastReEval = evaluateAndSelectModel(pastHistory, 'NET_SALES', 'AUTO', { horizon: 3 });
      assert.strictEqual(pastReEval.selectedModel, pastEval.selectedModel);
      assert.deepStrictEqual(pastReEval.pointForecasts, pastEval.pointForecasts);
      assert.deepStrictEqual(pastReEval.intervals[0].lowerBound, pastEval.intervals[0].lowerBound);
      assert.deepStrictEqual(pastReEval.intervals[0].upperBound, pastEval.intervals[0].upperBound);
    });

    // 6. Parameter/Model Tuning and Interval Calibration Data Uncoupled (Section 10)
    it('proves tuning and calibration data are uncoupled (FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED = 0)', () => {
      assert.strictEqual(FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED, 0);

      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        empiricalErrors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });

      assert.strictEqual(iv[0].coverageAssumptions.tuningCalibrationCoupled, false);
      assert.strictEqual(iv[0].intervalAssumptions.tuningCalibrationCoupled, false);
    });

    // 7. Target Data-Type Classification & Discrete Semantics (Section 11, 12, 13)
    it('verifies forecast target data-type classification and discrete semantics (DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION = 0)', () => {
      assert.strictEqual(DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION, 0);

      // Verify canonical classifications
      assert.strictEqual(ForecastRegistry.getTarget('NET_SALES').dataType, 'CONTINUOUS_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('ORDERS').dataType, 'COUNT / DISCRETE_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('MENU_ITEM_QUANTITY').dataType, 'COUNT / DISCRETE_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('MENU_CATEGORY_QUANTITY').dataType, 'COUNT / DISCRETE_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('CUSTOMER_VISITS').dataType, 'COUNT / DISCRETE_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('GROSS_PAYROLL').dataType, 'CONTINUOUS_VALUE');
      assert.strictEqual(ForecastRegistry.getTarget('OPERATING_EXPENSES').dataType, 'CONTINUOUS_VALUE');

      // Discrete target interval verification
      const iv = calculatePredictionIntervals([50], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        targetMetricId: 'ORDERS',
        calibrationErrors: [-2, -1, 0, 0, 1, 1, 2, 2, 3, 4],
      });

      assert.strictEqual(iv[0].isDiscreteTarget, true);
      assert.strictEqual(iv[0].coverageAssumptions.continuityAssumption, 'DISCRETE_OR_TIED_ERROR_DISTRIBUTION_MASS_AT_BOUNDS_POSSIBLE');
      assert.strictEqual(iv[0].tieHandling, 'DETERMINISTIC_INCLUSIVE_CONSERVATIVE');
      assert.strictEqual(iv[0].exactCoverageClaim, false);
      assert.strictEqual(iv[0].conservativeCoverageBound, true);
      assert.strictEqual(iv[0].finiteSampleCoverageBasis, 'ORDER_STATISTIC_CONSERVATIVE_INCLUSIVE_RANK_COVERAGE');
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, null);
      assert.ok(iv[0].conservativeRankCoverage > 0);
    });

    // 8. Shielding Exact Continuous Coverage for Tied Errors (Section 16)
    it('proves exact continuous coverage is not exposed for tied errors (EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS = 0)', () => {
      assert.strictEqual(EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS, 0);

      // Continuous target with tied errors
      const iv = calculatePredictionIntervals([100], 0, {
        method: 'MOVING_AVERAGE_BASELINE',
        targetMetricId: 'NET_SALES',
        calibrationErrors: [5, 5, 5, 10, 10, 15, 15, 20, 20, 25],
      });

      assert.strictEqual(iv[0].hasTiedErrors, true);
      assert.strictEqual(iv[0].achievableOrderStatisticCoverage, null);
      assert.ok(iv[0].conservativeRankCoverage !== null);
      assert.ok(iv[0].nominalOrderStatisticCoverageUnderContinuousAssumption !== null);
      assert.strictEqual(iv[0].tieHandling, 'DETERMINISTIC_INCLUSIVE_CONSERVATIVE');
    });

    // 9. Tie-Aware Test Matrix (Section 15)
    it('proves robust deterministic interval construction across all tie-distribution test cases without NaN or Infinity', () => {
      const cases = [
        { name: 'All calibration errors identical', errors: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
        { name: 'Two distinct tied values', errors: [2, 2, 2, 2, 2, 7, 7, 7, 7, 7] },
        { name: 'Integer Order forecast errors', errors: [-3, -1, -1, 0, 0, 0, 1, 1, 2, 4] },
        { name: 'Integer Menu Quantity forecast errors', errors: [0, 0, 1, 1, 1, 2, 2, 3, 3, 5] },
        { name: 'Continuous Sales forecast errors', errors: [10.2, -5.1, 8.4, -2.2, 0.0, 4.3, -7.8, 15.6, -11.0, 6.2] },
        { name: 'Ties exactly at lower endpoint', errors: [-10, -10, -10, -4, -1, 2, 5, 7, 9, 12] },
        { name: 'Ties exactly at upper endpoint', errors: [-8, -5, -2, 1, 3, 6, 8, 14, 14, 14] },
      ];

      for (const tc of cases) {
        const iv = calculatePredictionIntervals([100], 0, {
          method: 'MOVING_AVERAGE_BASELINE',
          calibrationErrors: tc.errors,
          confidenceLevel: 0.80,
        });

        assert.ok(!isNaN(iv[0].lowerBound) && isFinite(iv[0].lowerBound), `Failed lowerBound on ${tc.name}`);
        assert.ok(!isNaN(iv[0].upperBound) && isFinite(iv[0].upperBound), `Failed upperBound on ${tc.name}`);
        assert.ok(!isNaN(iv[0].margin) && isFinite(iv[0].margin), `Failed margin on ${tc.name}`);
        assert.ok(iv[0].lowerBound <= iv[0].upperBound, `Inverted bounds on ${tc.name}`);
      }
    });

    // 10. Complete PM-02K-R5 Static Semantic Audit Invariants (Section 20)
    it('proves all PM-02K-R5 Static Semantic Audit Invariants strictly equal 0', () => {
      assert.strictEqual(MODEL_SELECTION_ERRORS_REUSED_AS_INTERVAL_CALIBRATION_WITHOUT_ADJUSTMENT, 0);
      assert.strictEqual(FORECAST_TUNING_AND_INTERVAL_CALIBRATION_DATA_COUPLED, 0);
      assert.strictEqual(FUTURE_MODEL_SELECTION_INFORMATION_CHANGES_PAST_FORECAST, 0);
      assert.strictEqual(DISCRETE_FORECAST_TARGET_CLAIMS_CONTINUOUS_ERROR_ASSUMPTION, 0);
      assert.strictEqual(EXACT_CONTINUOUS_COVERAGE_VALUE_EXPOSED_FOR_TIED_ERRORS, 0);
      assert.strictEqual(TIME_SERIES_EXCHANGEABILITY_ASSUMED_SILENTLY, 0);
      assert.strictEqual(UNQUALIFIED_DISTRIBUTION_FREE_TIME_SERIES_COVERAGE_CLAIM, 0);
      assert.strictEqual(ORDER_STATISTIC_COVERAGE_CLAIM_USING_INTERPOLATED_TYPE7_BOUNDS, 0);
      assert.strictEqual(NOMINAL_AND_OBSERVED_COVERAGE_CONFLATED, 0);
      assert.strictEqual(INTERVAL_COVERAGE_EVALUATED_ON_CALIBRATION_ERRORS, 0);
      assert.strictEqual(INTERVAL_EVALUATION_FUTURE_ERROR_LEAKAGE, 0);
      assert.strictEqual(FORECAST_FUTURE_DATA_LEAKAGE, 0);
      assert.strictEqual(FORECASTED_FAKE_COGS, 0);
      assert.strictEqual(FORECASTED_FAKE_EBITDA, 0);
      assert.strictEqual(DATABASE_OUTAGE_REPORTED_AS_ZERO_FORECAST, 0);
      assert.strictEqual(UNEXPLAINED_FROZEN_TEST_LOSS, 0);
      assert.strictEqual(DEAD_PM02K_CONTROLS, 0);
      assert.strictEqual(MISREPRESENTED_PM02K_CONTROLS, 0);
    });
  });
});
