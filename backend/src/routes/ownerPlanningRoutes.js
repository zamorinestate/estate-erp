'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER PLANNING ROUTES (STAGE 03)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const OwnerPlanningController = require('../controllers/ownerPlanningController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// Enforce authentication on all routes
router.use(authenticate);

// Dashboard / Overview aliases
router.get(
  '/overview',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.getDashboard
);
router.get(
  '/dashboard',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.getDashboard
);

// Export Multi-Dimensional Planning Report (Requirement 31)
router.get(
  '/export',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.exportPlanning
);

// Budgets
router.get(
  '/budgets',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.listBudgets
);
router.post(
  '/budgets',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.createBudget
);
router.put(
  '/budgets/:budgetId',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.updateBudgetDraft
);
router.post(
  '/budgets/:budgetId/approve',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.approveBudget
);
router.patch(
  '/budgets/:budgetId/approve',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.approveBudget
);
router.get(
  '/budgets/compare-actual',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.compareBudgetVsActual
);
router.get(
  '/variance',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.compareBudgetVsActual
);

// Forecasts
router.get(
  '/forecasts',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.listForecasts
);
router.post(
  '/forecasts/generate',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.generateForecast
);
router.get(
  '/forecasts/:forecastId',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.getForecastById
);

// Scenarios
router.get(
  '/scenarios',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.listScenarios
);
router.post(
  '/scenarios',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.runScenario
);
router.post(
  '/scenarios/run',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.runScenario
);

// CAPEX
router.get(
  '/capex',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.listCapexRequests
);
router.post(
  '/capex',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.createCapexRequest
);
router.post(
  '/capex/:requestId/business-case',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.submitCapexBusinessCase
);
router.post(
  '/capex/:requestId/review',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.submitCapexReview
);
router.post(
  '/capex/:requestId/approve',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.approveCapexRequest
);
router.patch(
  '/capex/:requestId/approve',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.approveCapexRequest
);
router.post(
  '/capex/:requestId/status',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.updateCapexStatus
);
router.patch(
  '/capex/:requestId/status',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.updateCapexStatus
);

// Feasibility
router.get(
  '/feasibility',
  authorize('FINANCE_READ', { allowedRoles: ['MASTER', 'OWNER', 'CAFE_ADMIN'] }),
  OwnerPlanningController.listFeasibilityStudies
);
router.post(
  '/feasibility',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.calculateFeasibility
);
router.post(
  '/feasibility/:feasibilityId/actuals',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.recordActualComparison
);
router.patch(
  '/feasibility/:feasibilityId/actuals',
  authorize('FINANCE_WRITE', { allowedRoles: ['MASTER', 'OWNER'] }),
  OwnerPlanningController.recordActualComparison
);

module.exports = router;
