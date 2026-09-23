'use strict';

const {
  Cafe,
  CAFE_STATUSES,
  CAFE_TYPES,
} = require('../models/Cafe');

const {
  SequenceCounter,
} = require('../models/SequenceCounter');

const { BusinessLicence } = require('../models/BusinessLicence');
const { ComplianceObligation } = require('../models/ComplianceObligation');
const { MasterDuplicateCandidate } = require('../models/MasterDuplicateCandidate');
const { MasterChangeRequest } = require('../models/MasterChangeRequest');
const CafeTemplate = require('../models/CafeTemplate');

const cafeService = require('../services/cafeService');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function requireGovernanceRole(request) {
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(
      403,
      'GOVERNANCE_ACCESS_REQUIRED',
      'Only Master and Owner roles may perform this action.'
    );
  }
}

function requireMaster(request) {
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role !== 'MASTER') {
    throw new ApiError(
      403,
      'MASTER_ACCESS_REQUIRED',
      'Only Master role may perform this operational café mutation.'
    );
  }
}

function assertCafeAccess(request, cafeId) {
  if (request.auth.role === 'MASTER') return;
  const rawCafes = [
    ...(Array.isArray(request.auth.assignedCafeIds) ? request.auth.assignedCafeIds : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : [])),
    ...(request.auth.primaryCafeId ? [request.auth.primaryCafeId] : []),
    ...(request.auth.cafeId ? [request.auth.cafeId] : []),
  ];
  const authorized = new Set(rawCafes.filter(Boolean).map((c) => String(c).trim().toUpperCase()));
  if (!authorized.has(String(cafeId).trim().toUpperCase())) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to this café.'
    );
  }
}

function buildCafeFilter(request) {
  const filter = {
    organisationId:
      request.auth.organisationId,
  };

  if (request.auth.role !== 'MASTER') {
    const rawCafes = [
      ...(Array.isArray(request.auth.assignedCafeIds) ? request.auth.assignedCafeIds : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : [])),
      ...(request.auth.primaryCafeId ? [request.auth.primaryCafeId] : []),
      ...(request.auth.cafeId ? [request.auth.cafeId] : []),
    ];
    const authorized = [...new Set(rawCafes.filter(Boolean).map((c) => String(c).trim().toUpperCase()))];
    filter.cafeId = {
      $in: authorized,
    };
  }

  const status =
    normalizeIdentifier(
      request.query.status
    );

  if (status) {
    if (!CAFE_STATUSES.includes(status)) {
      throw new ApiError(
        400,
        'INVALID_CAFE_STATUS',
        'The requested café status is invalid.'
      );
    }

    filter.status = status;
  }

  if (
    typeof request.query.search ===
      'string' &&
    request.query.search.trim()
  ) {
    filter.$or = [
      {
        name: {
          $regex:
            request.query.search.trim(),
          $options: 'i',
        },
      },
      {
        displayName: {
          $regex:
            request.query.search.trim(),
          $options: 'i',
        },
      },
      {
        cafeId: {
          $regex:
            request.query.search.trim(),
          $options: 'i',
        },
      },
    ];
  }

  return filter;
}

const listCafes = asyncHandler(
  async (request, response) => {
    const cafes = await Cafe.find(
      buildCafeFilter(request)
    ).sort({
      name: 1,
      cafeId: 1,
    });

    return response.status(200).json({
      success: true,
      data: {
        cafes,
        count: cafes.length,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const getCafe = asyncHandler(
  async (request, response) => {
    const cafeId =
      normalizeIdentifier(
        request.params.cafeId
      );

    assertCafeAccess(request, cafeId);

    const filter = {
      organisationId:
        request.auth.organisationId,
      cafeId,
    };

    const cafe = await Cafe.findOne(filter);

    if (!cafe) {
      throw new ApiError(
        404,
        'CAFE_NOT_FOUND',
        'The café was not found.'
      );
    }

    const cafeObj = cafe.toObject ? cafe.toObject() : JSON.parse(JSON.stringify(cafe));
    const unmaskAllowed = request.auth.role === 'MASTER' && request.query.unmaskSensitive === 'true';
    if (!unmaskAllowed && cafeObj.finance?.banking?.accountNumber) {
      const rawAcc = cafeObj.finance.banking.accountNumber;
      cafeObj.finance.banking.accountNumber = '••••••••' + String(rawAcc).slice(-4);
    }

    return response.status(200).json({
      success: true,
      data: {
        cafe: cafeObj,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const createCafe = asyncHandler(
  async (request, response) => {
    requireMaster(request);

    const result = await cafeService.createCafeWithAccess({
      auth: request.auth,
      cafeData: request.body || {},
      clientIp: request.ip,
      userAgent: request.headers ? request.headers['user-agent'] : '',
      correlationId:
        request.correlationId ||
        request.headers?.['x-correlation-id'] ||
        null,
    });

    return response.status(201).json({
      success: true,
      message:
        'Café created successfully and access credentials provisioned.',
      data: {
        cafe: result.cafe,
        access: result.access,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const updateCafe = asyncHandler(
  async (request, response) => {
    requireMaster(request);

    const cafeId =
      normalizeIdentifier(
        request.params.cafeId
      );

    assertCafeAccess(request, cafeId);

    const protectedFields = [
      'cafeId',
      'organisationId',
      'currency',
      'timezone',
      'createdBy',
      'archivedAt',
      'archivedBy',
      'archiveReason',
      'closure',
    ];

    const updates = {
      ...(request.body || {}),
    };

    protectedFields.forEach(
      (field) => delete updates[field]
    );

    updates.updatedBy =
      request.auth.userId;

    const cafe = await Cafe.findOneAndUpdate(
      {
        organisationId:
          request.auth.organisationId,
        cafeId,
        status: {
          $ne: 'ARCHIVED',
        },
      },
      {
        $set: updates,
      },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    );

    if (!cafe) {
      throw new ApiError(
        404,
        'CAFE_NOT_FOUND',
        'The café was not found.'
      );
    }

    return response.status(200).json({
      success: true,
      message:
        'Café updated successfully.',
      data: {
        cafe,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const changeCafeStatus = asyncHandler(
  async (request, response) => {
    requireMaster(request);

    const cafeId =
      normalizeIdentifier(
        request.params.cafeId
      );

    assertCafeAccess(request, cafeId);

    const status =
      normalizeIdentifier(
        request.body?.status
      );

    if (
      !CAFE_STATUSES.includes(status) ||
      status === 'ARCHIVED'
    ) {
      throw new ApiError(
        400,
        'INVALID_CAFE_STATUS',
        'The requested café status is invalid.'
      );
    }

    const cafe = await Cafe.findOneAndUpdate(
      {
        organisationId:
          request.auth.organisationId,
        cafeId,
        status: {
          $ne: 'ARCHIVED',
        },
      },
      {
        $set: {
          status,
          updatedBy:
            request.auth.userId,
        },
      },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    );

    if (!cafe) {
      throw new ApiError(
        404,
        'CAFE_NOT_FOUND',
        'The café was not found.'
      );
    }

    try {
      const { CafeAccess } = require('../models/CafeAccess');
      if (status === 'TEMPORARILY_CLOSED' || status === 'CLOSED') {
        await CafeAccess.updateOne(
          { organisationId: request.auth.organisationId, cafeId },
          { $set: { accessStatus: 'DISABLED', updatedBy: request.auth.userId } }
        ).catch(() => {});
      } else if (status === 'ACTIVE') {
        await CafeAccess.updateOne(
          { organisationId: request.auth.organisationId, cafeId, accessStatus: 'DISABLED' },
          { $set: { accessStatus: 'ACTIVE', updatedBy: request.auth.userId } }
        ).catch(() => {});
      }
    } catch (_) {}

    return response.status(200).json({
      success: true,
      message:
        'Café status updated successfully.',
      data: {
        cafe,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const archiveCafe = asyncHandler(
  async (request, response) => {
    requireMaster(request);

    const cafeId =
      normalizeIdentifier(
        request.params.cafeId
      );

    assertCafeAccess(request, cafeId);

    const reason =
      typeof request.body?.reason ===
        'string'
        ? request.body.reason.trim()
        : '';

    if (!reason) {
      throw new ApiError(
        400,
        'ARCHIVE_REASON_REQUIRED',
        'An archive reason is required.'
      );
    }

    const cafe = await Cafe.findOne({
      organisationId:
        request.auth.organisationId,
      cafeId,
      status: {
        $ne: 'ARCHIVED',
      },
    });

    if (!cafe) {
      throw new ApiError(
        404,
        'CAFE_NOT_FOUND',
        'The café was not found.'
      );
    }

    await cafe.archive({
      userId:
        request.auth.userId,
      reason,
    });

    try {
      const { CafeAccess } = require('../models/CafeAccess');
      await CafeAccess.updateOne(
        {
          organisationId: request.auth.organisationId,
          cafeId,
        },
        {
          $set: {
            accessStatus: 'SUSPENDED',
            provisioningStatus: 'ARCHIVED',
            updatedBy: request.auth.userId,
          },
        }
      ).catch(() => {});
    } catch (_) {}

    return response.status(200).json({
      success: true,
      message:
        'Café archived successfully.',
      data: {
        cafe,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const getCafeReadiness = asyncHandler(
  async (request, response) => {
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const data = await cafeService.getCafeReadiness({
      organisationId: request.auth.organisationId,
      cafeId,
    });
    return response.status(200).json({
      success: true,
      data,
      correlationId: request.correlationId || null,
    });
  }
);

const updateReadinessChecklist = asyncHandler(
  async (request, response) => {
    requireGovernanceRole(request);
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const data = await cafeService.updateReadinessChecklist({
      organisationId: request.auth.organisationId,
      cafeId,
      checklistUpdates: request.body?.readinessChecklist || request.body || {},
      auth: request.auth,
    });
    return response.status(200).json({
      success: true,
      message: 'Readiness checklist updated successfully.',
      data,
      correlationId: request.correlationId || null,
    });
  }
);

const transitionLifecycleState = asyncHandler(
  async (request, response) => {
    requireGovernanceRole(request);
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const targetStatus = request.body?.targetStatus || request.body?.status;
    const reason = request.body?.reason || '';
    const data = await cafeService.transitionLifecycleState({
      organisationId: request.auth.organisationId,
      cafeId,
      targetStatus,
      reason,
      auth: request.auth,
    });
    return response.status(200).json({
      success: true,
      message: `Lifecycle state updated to ${data.status}.`,
      data,
      correlationId: request.correlationId || null,
    });
  }
);

const getComplianceAlerts = asyncHandler(
  async (request, response) => {
    const cafeId = request.params.cafeId ? normalizeIdentifier(request.params.cafeId) : null;
    if (cafeId) {
      assertCafeAccess(request, cafeId);
    }
    const data = await cafeService.getComplianceAlerts({
      organisationId: request.auth.organisationId,
      cafeId,
    });
    return response.status(200).json({
      success: true,
      data,
      correlationId: request.correlationId || null,
    });
  }
);

const regenerateCafeLoginQr = asyncHandler(
  async (request, response) => {
    requireGovernanceRole(request);
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const data = await cafeService.regenerateCafeLoginQr({
      organisationId: request.auth.organisationId,
      cafeId,
      auth: request.auth,
    });
    return response.status(200).json({
      success: true,
      message: 'Café login QR regenerated successfully.',
      data,
      correlationId: request.correlationId || null,
    });
  }
);

const downloadPrintableQrCardPdf = asyncHandler(
  async (request, response) => {
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const { pdfBuffer, filename } = await cafeService.generatePrintableQrCardPdf({
      organisationId: request.auth.organisationId,
      cafeId,
    });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return response.status(200).send(pdfBuffer);
  }
);

const getCafeComplianceAndLicences = asyncHandler(
  async (request, response) => {
    const cafeId = normalizeIdentifier(request.params.cafeId);
    assertCafeAccess(request, cafeId);
    const organisationId = request.auth.organisationId;

    const [licences, obligations, duplicateCandidates, pendingChangeRequests] = await Promise.all([
      BusinessLicence.find({ organisationId, cafeId, isDeleted: false }).lean(),
      ComplianceObligation.find({ organisationId, cafeId, isDeleted: false }).lean(),
      MasterDuplicateCandidate.find({
        organisationId,
        domainCode: 'CAFE',
        $or: [{ recordAId: cafeId }, { recordBId: cafeId }],
        status: { $in: ['DETECTED', 'REVIEW', 'SURVIVOR_SELECTION', 'IMPACT_ANALYSIS'] },
      }).lean(),
      MasterChangeRequest.find({
        organisationId,
        domainCode: 'CAFE',
        recordId: cafeId,
        status: 'PENDING',
      }).lean(),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        cafeId,
        licences,
        obligations,
        dataGovernance: {
          duplicateCandidates,
          pendingChangeRequests,
        },
      },
      correlationId: request.correlationId || null,
    });
  }
);

// ---------------------------------------------------------------------------
// REC-02: CANONICAL ONBOARDING LIFECYCLE CONTROLLERS
// ---------------------------------------------------------------------------
const validateCafe = asyncHandler(async (request, response) => {
  requireMaster(request);
  const result = await cafeService.validateCafeCreationPayload({
    cafeData: request.body || {},
    isDraft: false,
    organisationId: request.auth.organisationId,
  });

  return response.status(result.valid ? 200 : 400).json({
    success: result.valid,
    message: result.valid ? 'Café validation passed.' : 'Validation errors occurred.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const previewCafe = asyncHandler(async (request, response) => {
  requireMaster(request);
  const preview = await cafeService.previewCafeCreation({
    auth: request.auth,
    cafeData: request.body || {},
  });

  return response.status(200).json({
    success: true,
    message: 'Café creation preview generated successfully.',
    data: preview,
    correlationId: request.correlationId || null,
  });
});

const createDraft = asyncHandler(async (request, response) => {
  requireMaster(request);
  const result = await cafeService.createCafeDraft({
    auth: request.auth,
    cafeData: request.body || {},
    clientIp: request.ip,
    userAgent: request.headers ? request.headers['user-agent'] : '',
    correlationId: request.correlationId || null,
  });

  return response.status(201).json({
    success: true,
    message: 'Café draft created successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const updateDraft = asyncHandler(async (request, response) => {
  requireMaster(request);
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const result = await cafeService.updateCafeDraft({
    organisationId: request.auth.organisationId,
    cafeId,
    auth: request.auth,
    cafeData: request.body || {},
    clientIp: request.ip,
    userAgent: request.headers ? request.headers['user-agent'] : '',
    correlationId: request.correlationId || null,
  });

  return response.status(200).json({
    success: true,
    message: 'Café draft updated successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const provisionCafe = asyncHandler(async (request, response) => {
  requireMaster(request);
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const result = await cafeService.provisionCafeSubsystems({
    organisationId: request.auth.organisationId,
    cafeId,
    auth: request.auth,
    options: request.body || {},
    clientIp: request.ip,
    userAgent: request.headers ? request.headers['user-agent'] : '',
    correlationId: request.correlationId || null,
  });

  return response.status(200).json({
    success: true,
    message: 'Café subsystems provisioned successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const verifyCafe = asyncHandler(async (request, response) => {
  requireMaster(request);
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const result = await cafeService.verifyCafeProvisioning({
    organisationId: request.auth.organisationId,
    cafeId,
    auth: request.auth,
  });

  return response.status(result.verified ? 200 : 400).json({
    success: result.verified,
    message: result.verified ? 'Café provisioning verification succeeded.' : 'Café provisioning verification failed.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const activateCafe = asyncHandler(async (request, response) => {
  requireMaster(request);
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const result = await cafeService.activateCafeLifecycle({
    organisationId: request.auth.organisationId,
    cafeId,
    reason: request.body?.reason || 'Operational activation authorized by governance.',
    auth: request.auth,
    clientIp: request.ip,
    userAgent: request.headers ? request.headers['user-agent'] : '',
    correlationId: request.correlationId || null,
  });

  return response.status(200).json({
    success: true,
    message: 'Café operational lifecycle activated successfully.',
    data: result,
    correlationId: request.correlationId || null,
  });
});

const listCafeTemplates = asyncHandler(async (request, response) => {
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const templates = await CafeTemplate.find({ organisationId, isActive: true }).lean();
  return response.status(200).json({
    success: true,
    data: templates,
  });
});

const createCafeTemplate = asyncHandler(async (request, response) => {
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role !== 'MASTER') {
    throw new ApiError(403, 'MASTER_ROLE_REQUIRED', 'Only Master can create café configuration templates.');
  }
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const {
    name,
    description,
    establishmentCategory,
    businessDayCutoffHour,
    defaultOpeningTime,
    defaultClosingTime,
    receiptConfig,
    approvalLimits,
    packagingRules,
    isDefault,
  } = request.body;

  if (!name || typeof name !== 'string') {
    throw new ApiError(400, 'TEMPLATE_NAME_REQUIRED', 'A valid template name is required.');
  }

  const count = await CafeTemplate.countDocuments({ organisationId });
  const templateId = `CTPL-${String(count + 1).padStart(3, '0')}`;

  if (isDefault) {
    await CafeTemplate.updateMany({ organisationId }, { isDefault: false });
  }

  const template = await CafeTemplate.create({
    templateId,
    organisationId,
    name: name.trim(),
    description: description || '',
    establishmentCategory: establishmentCategory || 'Café',
    businessDayCutoffHour: typeof businessDayCutoffHour === 'number' ? businessDayCutoffHour : 4,
    defaultOpeningTime: defaultOpeningTime || '07:00',
    defaultClosingTime: defaultClosingTime || '23:00',
    receiptConfig: receiptConfig || {},
    approvalLimits: approvalLimits || {},
    packagingRules: Array.isArray(packagingRules) ? packagingRules : [],
    isDefault: Boolean(isDefault),
    createdByUserId: request.auth?.userId || 'MASTER',
  });

  return response.status(201).json({
    success: true,
    data: template,
  });
});

const previewTemplateOverrides = asyncHandler(async (request, response) => {
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  assertCafeAccess(request, cafeId);

  const cafe = await Cafe.findOne({ organisationId, cafeId }).lean();
  if (!cafe) {
    throw new ApiError(404, 'CAFE_NOT_FOUND', `Café ${cafeId} not found.`);
  }

  const templateId = request.query.templateId || cafe.templateId;
  let template = null;
  if (templateId) {
    template = await CafeTemplate.findOne({ organisationId, templateId }).lean();
  }

  const comparison = {
    cafeId,
    templateId: template?.templateId || null,
    templateName: template?.name || 'No Template Assigned',
    inheritedValues: {
      businessDayCutoffHour: template?.businessDayCutoffHour ?? 4,
      defaultOpeningTime: template?.defaultOpeningTime ?? '07:00',
      defaultClosingTime: template?.defaultClosingTime ?? '23:00',
      receiptFooter: template?.receiptConfig?.footerText ?? '',
      poApprovalLimitPaisa: template?.approvalLimits?.poApprovalThresholdPaisa ?? 500000,
    },
    cafeOverrides: {
      businessDayCutoffHour: cafe.businessDayCutoffHour,
      templateOverrides: cafe.templateOverrides || {},
    },
    effectiveValues: {
      businessDayCutoffHour: cafe.businessDayCutoffHour ?? template?.businessDayCutoffHour ?? 4,
      defaultOpeningTime: cafe.templateOverrides?.defaultOpeningTime ?? template?.defaultOpeningTime ?? '07:00',
      defaultClosingTime: cafe.templateOverrides?.defaultClosingTime ?? template?.defaultClosingTime ?? '23:00',
      receiptFooter: cafe.templateOverrides?.receiptFooter ?? template?.receiptConfig?.footerText ?? '',
      poApprovalLimitPaisa: cafe.templateOverrides?.poApprovalLimitPaisa ?? template?.approvalLimits?.poApprovalThresholdPaisa ?? 500000,
    },
  };

  return response.status(200).json({
    success: true,
    data: comparison,
  });
});

const applyTemplateToCafe = asyncHandler(async (request, response) => {
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'GOVERNANCE_ROLE_REQUIRED', 'Only Master and Owner can apply templates to cafés.');
  }
  const cafeId = normalizeIdentifier(request.params.cafeId);
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  assertCafeAccess(request, cafeId);

  const { templateId, overrides } = request.body;
  const template = await CafeTemplate.findOne({ organisationId, templateId }).lean();
  if (!template) {
    throw new ApiError(404, 'TEMPLATE_NOT_FOUND', `Template ${templateId} not found.`);
  }

  const cafe = await Cafe.findOne({ organisationId, cafeId });
  if (!cafe) {
    throw new ApiError(404, 'CAFE_NOT_FOUND', `Café ${cafeId} not found.`);
  }

  cafe.templateId = template.templateId;
  cafe.businessDayCutoffHour = overrides?.businessDayCutoffHour ?? template.businessDayCutoffHour;
  if (overrides) {
    cafe.templateOverrides = {
      ...(cafe.templateOverrides || {}),
      ...overrides,
    };
  }
  await cafe.save();

  return response.status(200).json({
    success: true,
    message: `Template ${template.name} applied to café ${cafeId} successfully.`,
    data: {
      cafeId,
      templateId: cafe.templateId,
      businessDayCutoffHour: cafe.businessDayCutoffHour,
      templateOverrides: cafe.templateOverrides,
    },
  });
});

module.exports = {
  listCafes,
  getCafe,
  createCafe,
  updateCafe,
  changeCafeStatus,
  archiveCafe,
  getCafeReadiness,
  updateReadinessChecklist,
  transitionLifecycleState,
  getComplianceAlerts,
  regenerateCafeLoginQr,
  downloadPrintableQrCardPdf,
  getCafeComplianceAndLicences,
  validateCafe,
  previewCafe,
  createDraft,
  updateDraft,
  provisionCafe,
  verifyCafe,
  activateCafe,
  listCafeTemplates,
  createCafeTemplate,
  previewTemplateOverrides,
  applyTemplateToCafe,
};