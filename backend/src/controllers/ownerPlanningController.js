'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER PLANNING CONTROLLER (STAGE 03)
 * ============================================================================
 */

const OwnerPlanningService = require('../services/ownerPlanningService');

class OwnerPlanningController {
  static getTenantContext(req) {
    const user = req.auth || req.user || req.authenticatedUser;
    const organisationId = user?.organisationId || req.headers?.['x-organisation-id'];
    const cafeId = req.query?.cafeId || req.body?.cafeId || user?.cafeId || user?.primaryCafeId || null;
    const actorId = user?.userId || user?.email || 'UNKNOWN_ACTOR';
    const actorRole = user?.role || 'OWNER';

    if (!organisationId) {
      const err = new Error('Tenant identification missing: organisationId is required');
      err.statusCode = 401;
      throw err;
    }

    return { organisationId, cafeId, actorId, actorRole };
  }

  // Dashboard
  static async getDashboard(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { fiscalYear } = req.query;
      const data = await OwnerPlanningService.getPlanningDashboard({
        organisationId,
        cafeId,
        fiscalYear: fiscalYear || 'FY2026-27',
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  // Budgets
  static async createBudget(req, res, next) {
    try {
      const { organisationId, cafeId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const budget = await OwnerPlanningService.createBudget({
        organisationId,
        cafeId,
        ...req.body,
        actorId,
        actorRole,
      });
      return res.status(201).json({ success: true, data: budget });
    } catch (err) {
      return next(err);
    }
  }

  static async approveBudget(req, res, next) {
    try {
      const { organisationId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const { budgetId } = req.params;
      const budget = await OwnerPlanningService.approveBudget({
        budgetId,
        organisationId,
        notes: req.body.notes,
        actorId,
        actorRole,
      });
      return res.status(200).json({ success: true, data: budget });
    } catch (err) {
      return next(err);
    }
  }

  static async listBudgets(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { fiscalYear, status } = req.query;
      const data = await OwnerPlanningService.listBudgets({
        organisationId,
        cafeId,
        fiscalYear,
        status,
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return next(err);
    }
  }

  static async compareBudgetVsActual(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { fiscalYear } = req.query;
      const data = await OwnerPlanningService.compareBudgetVsActual({
        organisationId,
        cafeId,
        fiscalYear: fiscalYear || 'FY2026-27',
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  // Forecasts
  static async generateForecast(req, res, next) {
    try {
      const { organisationId, cafeId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const forecast = await OwnerPlanningService.generateForecast({
        organisationId,
        cafeId,
        ...req.body,
        actorId,
        actorRole,
      });
      return res.status(201).json({ success: true, data: forecast });
    } catch (err) {
      return next(err);
    }
  }

  static async getForecastById(req, res, next) {
    try {
      const { organisationId } = OwnerPlanningController.getTenantContext(req);
      const { forecastId } = req.params;
      const data = await OwnerPlanningService.getForecastById({ forecastId, organisationId });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  static async listForecasts(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { fiscalYear } = req.query;
      const data = await OwnerPlanningService.listForecasts({
        organisationId,
        cafeId,
        fiscalYear,
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return next(err);
    }
  }

  // Scenarios
  static async runScenario(req, res, next) {
    try {
      const { organisationId, cafeId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const scenario = await OwnerPlanningService.runScenario({
        organisationId,
        cafeId,
        ...req.body,
        actorId,
        actorRole,
      });
      return res.status(201).json({ success: true, data: scenario });
    } catch (err) {
      return next(err);
    }
  }

  static async listScenarios(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const data = await OwnerPlanningService.listScenarios({ organisationId, cafeId });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return next(err);
    }
  }

  // CAPEX
  static async createCapexRequest(req, res, next) {
    try {
      const { organisationId, cafeId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const capex = await OwnerPlanningService.createCapexRequest({
        organisationId,
        cafeId: req.body.cafeId || cafeId,
        ...req.body,
        actorId,
        actorRole,
      });
      return res.status(201).json({ success: true, data: capex });
    } catch (err) {
      return next(err);
    }
  }

  static async approveCapexRequest(req, res, next) {
    try {
      const { organisationId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const requestId = req.params.requestId || req.params.capexId;
      const capex = await OwnerPlanningService.approveCapexRequest({
        requestId,
        organisationId,
        selectedQuotationId: req.body.selectedQuotationId,
        selectedVendorName: req.body.selectedVendorName,
        approvedAmountPaisa: req.body.approvedAmountPaisa,
        notes: req.body.notes,
        approvalNotes: req.body.approvalNotes,
        actorId,
        actorRole,
      });
      return res.status(200).json({ success: true, data: capex });
    } catch (err) {
      return next(err);
    }
  }

  static async updateCapexStatus(req, res, next) {
    try {
      const { organisationId, actorId } = OwnerPlanningController.getTenantContext(req);
      const requestId = req.params.requestId || req.params.capexId;
      const capex = await OwnerPlanningService.updateCapexStatus({
        requestId,
        organisationId,
        toState: req.body.toState,
        poNumber: req.body.poNumber,
        capitalizedAssetId: req.body.capitalizedAssetId,
        actualCostPaisa: req.body.actualCostPaisa,
        varianceReason: req.body.varianceReason,
        benefitsRealized: req.body.benefitsRealized,
        notes: req.body.notes,
        actorId,
      });
      return res.status(200).json({ success: true, data: capex });
    } catch (err) {
      return next(err);
    }
  }

  static async listCapexRequests(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { status } = req.query;
      const data = await OwnerPlanningService.listCapexRequests({
        organisationId,
        cafeId,
        status,
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return next(err);
    }
  }

  // Feasibility
  static async calculateFeasibility(req, res, next) {
    try {
      const { organisationId, actorId, actorRole } =
        OwnerPlanningController.getTenantContext(req);
      const feasibility = await OwnerPlanningService.calculateFeasibility({
        organisationId,
        ...req.body,
        actorId,
        actorRole,
      });
      return res.status(201).json({ success: true, data: feasibility });
    } catch (err) {
      return next(err);
    }
  }

  static async recordActualComparison(req, res, next) {
    try {
      const { organisationId, actorId } =
        OwnerPlanningController.getTenantContext(req);
      const feasibilityId = req.params.feasibilityId || req.params.studyId;
      const result = await OwnerPlanningService.recordActualComparison({
        feasibilityId,
        organisationId,
        benchmark: req.body.benchmark,
        period: req.body.period,
        actualAverageBillsPerDay: req.body.actualAverageBillsPerDay,
        actualABVPaisa: req.body.actualABVPaisa,
        actualMonthlyRevenuePaisa: req.body.actualMonthlyRevenuePaisa,
        actualFoodCostPercentage: req.body.actualFoodCostPercentage,
        actualNetProfitPaisa: req.body.actualNetProfitPaisa,
        varianceNotes: req.body.varianceNotes,
        actorId,
      });
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return next(err);
    }
  }

  static async listFeasibilityStudies(req, res, next) {
    try {
      const { organisationId } = OwnerPlanningController.getTenantContext(req);
      const data = await OwnerPlanningService.listFeasibilityStudies({ organisationId });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return next(err);
    }
  }

  // Budget Concurrency Update
  static async updateBudgetDraft(req, res, next) {
    try {
      const { organisationId, actorId } = OwnerPlanningController.getTenantContext(req);
      const { budgetId } = req.params;
      const budget = await OwnerPlanningService.updateBudgetDraft({
        budgetId,
        organisationId,
        expectedVersion: req.body.expectedVersion,
        lines: req.body.lines,
        categoryBreakdown: req.body.categoryBreakdown,
        assumptions: req.body.assumptions,
        actorId,
      });
      return res.status(200).json({ success: true, data: budget });
    } catch (err) {
      return next(err);
    }
  }

  // Governed CAPEX Business Case and Review Stages
  static async submitCapexBusinessCase(req, res, next) {
    try {
      const { organisationId, actorId } = OwnerPlanningController.getTenantContext(req);
      const { requestId } = req.params;
      const capex = await OwnerPlanningService.submitBusinessCase({
        requestId,
        organisationId,
        ...req.body,
        actorId,
      });
      return res.status(200).json({ success: true, data: capex });
    } catch (err) {
      return next(err);
    }
  }

  static async submitCapexReview(req, res, next) {
    try {
      const { organisationId, actorId } = OwnerPlanningController.getTenantContext(req);
      const { requestId } = req.params;
      const capex = await OwnerPlanningService.submitCapexReview({
        requestId,
        organisationId,
        ...req.body,
        actorId,
      });
      return res.status(200).json({ success: true, data: capex });
    } catch (err) {
      return next(err);
    }
  }

  // Planning Multi-Dimensional Export
  static async exportPlanning(req, res, next) {
    try {
      const { organisationId, cafeId } = OwnerPlanningController.getTenantContext(req);
      const { fiscalYear, format } = req.query;
      const exportDoc = await OwnerPlanningService.generatePlanningExport({
        organisationId,
        cafeId,
        fiscalYear: fiscalYear || 'FY2026-27',
        format: format || 'PDF',
      });
      return res.status(200).json(exportDoc);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = OwnerPlanningController;
