'use strict';

const {
  PayrollRun,
} = require('../models/PayrollRun');

const {
  Payslip,
} = require('../models/Payslip');

const {
  recordRequestAudit,
} = require('../services/auditService');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

const PAYROLL_MANAGEMENT_ROLES = [
  'MASTER',
  'OWNER',
];

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function requirePayrollManagementAccess(request) {
  if (
    !request?.auth ||
    !PAYROLL_MANAGEMENT_ROLES.includes(
      request.auth.role
    )
  ) {
    throw new ApiError(
      403,
      'PAYROLL_MANAGEMENT_FORBIDDEN',
      'Only MASTER and OWNER may manage payroll.'
    );
  }

  // Defensive fail-closed check: a malformed MASTER claim without Primary Master designation cannot manage organisational payroll.
  if (
    request.auth.role === 'MASTER' &&
    !request.auth.isPrimaryMaster
  ) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Managing organisational payroll requires Primary Master authority.'
    );
  }
}

function normalizePayrollRunId(value) {
  const payrollRunId =
    normalizeIdentifier(value);

  if (
    !/^PR-\d{6}-\d{4,}$/.test(
      payrollRunId
    )
  ) {
    throw new ApiError(
      400,
      'INVALID_PAYROLL_RUN_ID',
      'A valid payroll run ID is required.'
    );
  }

  return payrollRunId;
}

function validateVoidRequestBody(body) {
  if (
    body === undefined ||
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new ApiError(
      400,
      'INVALID_PAYROLL_VOID_REASON',
      'A valid void reason is required in the request body.'
    );
  }

  const keys = Object.keys(body);

  if (
    keys.length === 0 ||
    !('voidReason' in body)
  ) {
    throw new ApiError(
      400,
      'INVALID_PAYROLL_VOID_REASON',
      'voidReason is required in the request body.'
    );
  }

  if (
    typeof body.voidReason !== 'string' ||
    body.voidReason.trim().length === 0 ||
    body.voidReason.trim().length > 2000
  ) {
    throw new ApiError(
      400,
      'INVALID_PAYROLL_VOID_REASON',
      'voidReason must be a non-empty string of 2000 characters or less.'
    );
  }

  const forbiddenKeys = keys.filter(
    (key) => key !== 'voidReason'
  );

  if (forbiddenKeys.length > 0) {
    throw new ApiError(
      400,
      'PROTECTED_PAYROLL_VOID_FIELD',
      'Payroll void lifecycle fields are controlled by the backend.'
    );
  }

  return body.voidReason.trim();
}

async function findManagedPayrollRun(
  request,
  payrollRunId
) {
  const filter = {
    organisationId:
      request.auth.organisationId,
    payrollRunId,
  };

  if (request.auth.role === 'OWNER') {
    filter.cafeId = {
      $in:
        request.auth.assignedCafeIds || [],
    };
  }

  const payrollRun =
    await PayrollRun.findOne(filter);

  if (!payrollRun) {
    throw new ApiError(
      404,
      'PAYROLL_RUN_NOT_FOUND',
      'The payroll run was not found.'
    );
  }

  return payrollRun;
}

function verifyExistingVoidState(
  entity,
  voidReason,
  entityLabel
) {
  if (entity.status !== 'VOIDED') {
    return;
  }

  if (
    !entity.voidedAt ||
    !entity.voidedBy ||
    !entity.voidReason
  ) {
    throw new ApiError(
      409,
      'PAYROLL_VOID_METADATA_MISSING',
      `${entityLabel} is voided but its backend void metadata is incomplete.`
    );
  }

  if (entity.voidReason !== voidReason) {
    throw new ApiError(
      409,
      'PAYROLL_VOID_REASON_CONFLICT',
      `${entityLabel} was already voided with a different reason.`
    );
  }
}

function validateUpdateResult(
  result,
  maximumMatchedCount,
  label
) {
  if (
    !Number.isSafeInteger(
      result?.matchedCount
    ) ||
    !Number.isSafeInteger(
      result?.modifiedCount
    ) ||
    result.matchedCount < 0 ||
    result.modifiedCount < 0 ||
    result.modifiedCount >
      result.matchedCount ||
    (
      maximumMatchedCount !== null &&
      result.matchedCount >
        maximumMatchedCount
    )
  ) {
    throw new ApiError(
      409,
      'PAYROLL_VOID_CONFLICT',
      `${label} update produced invalid counts.`
    );
  }
}

const voidPayrollRun = asyncHandler(
  async (request, response) => {
    requirePayrollManagementAccess(
      request
    );

    const voidReason =
      validateVoidRequestBody(
        request.body
      );

    const payrollRunId =
      normalizePayrollRunId(
        request.params.payrollRunId
      );

    const payrollRun =
      await findManagedPayrollRun(
        request,
        payrollRunId
      );

    verifyExistingVoidState(
      payrollRun,
      voidReason,
      'Payroll run'
    );

    const payslipFilter = {
      organisationId:
        request.auth.organisationId,
      payrollRunId,
      cafeId: payrollRun.cafeId,
    };

    const initialPayslips =
      await Payslip.find(payslipFilter);

    const activePayslips = [];
    const existingVoidedPayslips = [];

    for (const payslip of initialPayslips) {
      if (payslip.status === 'VOIDED') {
        verifyExistingVoidState(
          payslip,
          voidReason,
          'Payslip'
        );
        existingVoidedPayslips.push(
          payslip
        );
      } else {
        activePayslips.push(payslip);
      }
    }

    let finalRun = payrollRun;
    let newlyVoidedRunCount = 0;

    if (payrollRun.status !== 'VOIDED') {
      const runFilter = {
        organisationId:
          request.auth.organisationId,
        payrollRunId,
        cafeId: payrollRun.cafeId,
        status: {
          $ne: 'VOIDED',
        },
      };

      if (request.auth.role === 'OWNER') {
        runFilter.cafeId = {
          $in:
            request.auth
              .assignedCafeIds || [],
        };
      }

      const voidedAt = new Date();

      const runUpdateResult =
        await PayrollRun.updateOne(
          runFilter,
          {
            $set: {
              status: 'VOIDED',
              voidedAt,
              voidedBy:
                request.auth.userId,
              voidReason,
              updatedBy:
                request.auth.userId,
            },
          }
        );

      validateUpdateResult(
        runUpdateResult,
        1,
        'Payroll run void'
      );

      newlyVoidedRunCount =
        runUpdateResult.modifiedCount;
    }

    finalRun =
      await findManagedPayrollRun(
        request,
        payrollRunId
      );

    verifyExistingVoidState(
      finalRun,
      voidReason,
      'Payroll run'
    );

    if (finalRun.status !== 'VOIDED') {
      throw new ApiError(
        409,
        'PAYROLL_VOID_CONFLICT',
        'Final payroll run void state is incomplete.'
      );
    }

    let newlyVoidedPayslipCount = 0;

    if (activePayslips.length > 0) {
      const payslipUpdateResult =
        await Payslip.updateMany(
          {
            ...payslipFilter,
            status: {
              $ne: 'VOIDED',
            },
          },
          {
            $set: {
              status: 'VOIDED',
              voidedAt: finalRun.voidedAt,
              voidedBy: finalRun.voidedBy,
              voidReason,
              updatedBy:
                request.auth.userId,
            },
          }
        );

      validateUpdateResult(
        payslipUpdateResult,
        null,
        'Payslip bulk void'
      );

      newlyVoidedPayslipCount =
        payslipUpdateResult.modifiedCount;
    }

    const finalPayslips =
      await Payslip.find(payslipFilter);

    const invalidFinalPayslip =
      finalPayslips.find(
        (payslip) =>
          payslip.status !== 'VOIDED' ||
          !payslip.voidedAt ||
          !payslip.voidedBy ||
          !payslip.voidReason ||
          payslip.voidReason !==
            voidReason ||
          String(payslip.voidedBy) !==
            String(finalRun.voidedBy) ||
          new Date(
            payslip.voidedAt
          ).getTime() !==
            new Date(
              finalRun.voidedAt
            ).getTime()
      );

    if (invalidFinalPayslip) {
      throw new ApiError(
        409,
        'PAYROLL_VOID_CONFLICT',
        'Final payslip void state is incomplete or inconsistent.'
      );
    }

    await recordRequestAudit({
      request,
      module: 'PAYROLL',
      action: 'VOID_PAYROLL_RUN',
      entityType: 'PAYROLL_RUN',
      entityId: payrollRunId,
      cafeId: payrollRun.cafeId,
      before: {
        runStatus: payrollRun.status,
        totalPayslipCount:
          initialPayslips.length,
        activePayslipCount:
          activePayslips.length,
        previouslyVoidedPayslipCount:
          existingVoidedPayslips.length,
        existingRunVoidedAt:
          payrollRun.voidedAt || null,
        existingRunVoidedBy:
          payrollRun.voidedBy || null,
        existingRunVoidReason:
          payrollRun.voidReason || '',
      },
      after: {
        runStatus: 'VOIDED',
        finalVoidedPayslipCount:
          finalPayslips.length,
        newlyVoidedRunCount,
        newlyVoidedPayslipCount,
        voidedAt: finalRun.voidedAt,
        voidedBy: finalRun.voidedBy,
        voidReason,
      },
      reason: voidReason,
      riskClassification: 'HIGH',
      metadata: {
        periodKey: payrollRun.periodKey,
        employeeCount:
          payrollRun.employeeCount,
        previousRunStatus:
          payrollRun.status,
        idempotentRetry:
          payrollRun.status === 'VOIDED' &&
          activePayslips.length === 0,
        recoveryCompletion:
          payrollRun.status === 'VOIDED' &&
          activePayslips.length > 0,
      },
    });

    return response.status(200).json({
      success: true,
      message:
        'Payroll run voided successfully.',
      data: {
        payrollRunId,
        cafeId: payrollRun.cafeId,
        status: 'VOIDED',
        voidedPayslipCount:
          finalPayslips.length,
        newlyVoidedPayslipCount,
        voidedAt: finalRun.voidedAt,
        voidedBy: finalRun.voidedBy,
        voidReason,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

module.exports = {
  voidPayrollRun,
};
