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

const EARNING_FIELDS = [
  'basicPayPaise',
  'houseRentAllowancePaise',
  'otherAllowancePaise',
  'overtimePayPaise',
  'incentivePaise',
  'otherEarningPaise',
];

const DEDUCTION_FIELDS = [
  'providentFundPaise',
  'employeeStateInsurancePaise',
  'professionalTaxPaise',
  'incomeTaxPaise',
  'loanAdvanceDeductionPaise',
  'unpaidLeaveDeductionPaise',
  'otherDeductionPaise',
];

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function requirePayrollManagementAccess(
  request
) {
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

function rejectRequestBody(body) {
  if (
    body === undefined ||
    body === null
  ) {
    return;
  }

  if (
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  ) {
    return;
  }

  throw new ApiError(
    400,
    'PROTECTED_PAYSLIP_ISSUANCE_FIELD',
    'Payslip issuance lifecycle fields are controlled by the backend.'
  );
}

function readSafeNonNegativeInteger(
  value,
  fieldName
) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new ApiError(
      409,
      'PAYSLIP_TOTALS_INVALID',
      `${fieldName} must be a safe non-negative integer.`
    );
  }

  return value;
}

function addSafeInteger(
  currentTotal,
  value,
  fieldName
) {
  const nextTotal =
    currentTotal + value;

  if (!Number.isSafeInteger(nextTotal)) {
    throw new ApiError(
      409,
      'PAYROLL_TOTAL_TOO_LARGE',
      `${fieldName} exceeds the supported amount.`
    );
  }

  return nextTotal;
}

function calculatePayslipTotals(payslip) {
  let grossPayPaise = 0;

  for (const field of EARNING_FIELDS) {
    grossPayPaise =
      addSafeInteger(
        grossPayPaise,
        readSafeNonNegativeInteger(
          payslip.earnings?.[field],
          `earnings.${field}`
        ),
        'grossPayPaise'
      );
  }

  const storedGrossPayPaise =
    readSafeNonNegativeInteger(
      payslip.earnings
        ?.grossPayPaise,
      'earnings.grossPayPaise'
    );

  let totalDeductionPaise = 0;

  for (const field of DEDUCTION_FIELDS) {
    totalDeductionPaise =
      addSafeInteger(
        totalDeductionPaise,
        readSafeNonNegativeInteger(
          payslip.deductions?.[field],
          `deductions.${field}`
        ),
        'totalDeductionPaise'
      );
  }

  const storedTotalDeductionPaise =
    readSafeNonNegativeInteger(
      payslip.deductions
        ?.totalDeductionPaise,
      'deductions.totalDeductionPaise'
    );

  if (
    totalDeductionPaise >
    grossPayPaise
  ) {
    throw new ApiError(
      409,
      'PAYSLIP_TOTALS_INVALID',
      'Payslip deductions cannot exceed gross pay.'
    );
  }

  const netPayPaise =
    grossPayPaise -
    totalDeductionPaise;

  const storedNetPayPaise =
    readSafeNonNegativeInteger(
      payslip.netPayPaise,
      'netPayPaise'
    );

  if (
    storedGrossPayPaise !==
      grossPayPaise ||
    storedTotalDeductionPaise !==
      totalDeductionPaise ||
    storedNetPayPaise !==
      netPayPaise
  ) {
    throw new ApiError(
      409,
      'PAYSLIP_TOTALS_INVALID',
      'A payslip contains inconsistent backend totals.'
    );
  }

  return {
    grossPayPaise,
    totalDeductionPaise,
    netPayPaise,
  };
}

function verifyApprovedPayrollRun(
  payrollRun
) {
  if (payrollRun.status !== 'APPROVED') {
    throw new ApiError(
      409,
      'PAYROLL_RUN_NOT_ISSUABLE',
      'Only an APPROVED payroll run may issue payslips.'
    );
  }

  if (
    !payrollRun.calculatedAt ||
    !payrollRun.calculatedBy ||
    !payrollRun.submittedAt ||
    !payrollRun.submittedBy ||
    !payrollRun.approvedAt ||
    !payrollRun.approvedBy
  ) {
    throw new ApiError(
      409,
      'PAYROLL_RUN_APPROVAL_METADATA_MISSING',
      'Approved payroll requires complete backend lifecycle metadata.'
    );
  }

  const employeeCount =
    readSafeNonNegativeInteger(
      payrollRun.employeeCount,
      'employeeCount'
    );

  if (employeeCount < 1) {
    throw new ApiError(
      409,
      'PAYROLL_RUN_EMPTY',
      'An approved payroll run must contain at least one employee.'
    );
  }

  const totalGrossPaise =
    readSafeNonNegativeInteger(
      payrollRun.totalGrossPaise,
      'totalGrossPaise'
    );

  const totalDeductionPaise =
    readSafeNonNegativeInteger(
      payrollRun.totalDeductionPaise,
      'totalDeductionPaise'
    );

  const totalNetPayPaise =
    readSafeNonNegativeInteger(
      payrollRun.totalNetPayPaise,
      'totalNetPayPaise'
    );

  if (
    totalDeductionPaise >
    totalGrossPaise ||
    totalNetPayPaise !==
      totalGrossPaise -
        totalDeductionPaise
  ) {
    throw new ApiError(
      409,
      'PAYROLL_RUN_TOTALS_INVALID',
      'Approved payroll contains inconsistent backend totals.'
    );
  }

  return {
    employeeCount,
    totalGrossPaise,
    totalDeductionPaise,
    totalNetPayPaise,
  };
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

const issuePayrollRunPayslips =
  asyncHandler(
    async (request, response) => {
      requirePayrollManagementAccess(
        request
      );

      rejectRequestBody(
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

      const runTotals =
        verifyApprovedPayrollRun(
          payrollRun
        );

      const payslipFilter = {
        organisationId:
          request.auth.organisationId,
        payrollRunId,
        cafeId: payrollRun.cafeId,
      };

      const payslips =
        await Payslip.find(
          payslipFilter
        );

      if (payslips.length === 0) {
        throw new ApiError(
          409,
          'PAYROLL_RUN_EMPTY',
          'At least one payslip is required before issuance.'
        );
      }

      if (
        payslips.length !==
        runTotals.employeeCount
      ) {
        throw new ApiError(
          409,
          'PAYROLL_EMPLOYEE_COUNT_MISMATCH',
          'Payroll employee count does not match the payslip count.'
        );
      }

      const draftPayslips = [];
      const existingIssuedPayslips = [];

      for (const payslip of payslips) {
        if (payslip.status === 'DRAFT') {
          draftPayslips.push(payslip);
        } else if (payslip.status === 'ISSUED') {
          if (
            !payslip.issuedAt ||
            !payslip.issuedBy
          ) {
            throw new ApiError(
              409,
              'PAYSLIP_STATUS_BLOCKS_ISSUANCE',
              'Already issued payslip is missing required issuance metadata.'
            );
          }
          existingIssuedPayslips.push(
            payslip
          );
        } else {
          throw new ApiError(
            409,
            'PAYSLIP_STATUS_BLOCKS_ISSUANCE',
            `Payslip in ${payslip.status} status blocks issuance.`
          );
        }
      }

      let totalGrossPaise = 0;
      let totalDeductionPaise = 0;
      let totalNetPayPaise = 0;

      for (const payslip of payslips) {
        const totals =
          calculatePayslipTotals(
            payslip
          );

        totalGrossPaise =
          addSafeInteger(
            totalGrossPaise,
            totals.grossPayPaise,
            'totalGrossPaise'
          );

        totalDeductionPaise =
          addSafeInteger(
            totalDeductionPaise,
            totals.totalDeductionPaise,
            'totalDeductionPaise'
          );

        totalNetPayPaise =
          addSafeInteger(
            totalNetPayPaise,
            totals.netPayPaise,
            'totalNetPayPaise'
          );
      }

      if (
        totalGrossPaise !==
          runTotals.totalGrossPaise ||
        totalDeductionPaise !==
          runTotals.totalDeductionPaise ||
        totalNetPayPaise !==
          runTotals.totalNetPayPaise
      ) {
        throw new ApiError(
          409,
          'PAYROLL_RUN_TOTALS_MISMATCH',
          'Approved payroll totals do not match its payslips.'
        );
      }

      let newlyIssuedCount = 0;
      let actionIssuedAt = null;
      let actionIssuedBy = null;

      if (draftPayslips.length > 0) {
        actionIssuedAt = new Date();
        actionIssuedBy =
          request.auth.userId;

        const issueResult =
          await Payslip.updateMany(
            {
              ...payslipFilter,
              status: 'DRAFT',
            },
            {
              $set: {
                status: 'ISSUED',
                issuedAt: actionIssuedAt,
                issuedBy: actionIssuedBy,
                updatedBy:
                  request.auth.userId,
              },
            }
          );

        if (
          issueResult.matchedCount !==
            draftPayslips.length ||
          issueResult.modifiedCount !==
            draftPayslips.length
        ) {
          throw new ApiError(
            409,
            'PAYSLIP_ISSUANCE_CONFLICT',
            'Payslip issuance count conflict.'
          );
        }

        newlyIssuedCount =
          issueResult.modifiedCount;
      } else if (
        existingIssuedPayslips.length > 0
      ) {
        actionIssuedAt =
          existingIssuedPayslips[0].issuedAt;
        actionIssuedBy =
          existingIssuedPayslips[0].issuedBy;
      }

      const finalPayslips =
        await Payslip.find(
          payslipFilter
        );

      if (
        finalPayslips.length !==
        runTotals.employeeCount
      ) {
        throw new ApiError(
          409,
          'PAYSLIP_ISSUANCE_CONFLICT',
          'Final payslip count mismatch.'
        );
      }

      const incompletePayslip =
        finalPayslips.find(
          (p) =>
            p.status !== 'ISSUED' ||
            !p.issuedAt ||
            !p.issuedBy
        );

      if (incompletePayslip) {
        throw new ApiError(
          409,
          'PAYSLIP_ISSUANCE_CONFLICT',
          'Final payslip issuance state is incomplete.'
        );
      }

      await recordRequestAudit({
        request,
        module: 'PAYROLL',
        action:
          'ISSUE_PAYROLL_RUN_PAYSLIPS',
        entityType: 'PAYROLL_RUN',
        entityId: payrollRunId,
        cafeId: payrollRun.cafeId,
        before: {
          totalPayslipCount:
            payslips.length,
          draftPayslipCount:
            draftPayslips.length,
          previouslyIssuedCount:
            existingIssuedPayslips.length,
          priorStatus:
            payrollRun.status,
        },
        after: {
          finalIssuedCount:
            finalPayslips.length,
          newlyIssuedCount,
          issuedAt: actionIssuedAt,
          issuedBy: actionIssuedBy,
        },
        riskClassification: 'HIGH',
        metadata: {
          periodKey:
            payrollRun.periodKey,
          totalGrossPaise,
          totalDeductionPaise,
          totalNetPayPaise,
        },
      });

      return response.status(200).json({
        success: true,
        message:
          'Payroll-run payslips issued successfully.',
        data: {
          payrollRunId,
          cafeId: payrollRun.cafeId,
          issuedCount:
            finalPayslips.length,
          newlyIssuedCount,
          issuedAt: actionIssuedAt,
          issuedBy: actionIssuedBy,
        },
        correlationId:
          request.correlationId || null,
      });
    }
  );

module.exports = {
  issuePayrollRunPayslips,
};
