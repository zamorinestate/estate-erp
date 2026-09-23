'use strict';

/**
 * COMPANY / ORGANISATION IDENTITY CONTROLLER
 * Standard compliance: Sections 381–385 (EXPORT_ENGINE_COMPANY_IDENTITY_MASTER_STANDARD.md)
 * Gated administrative endpoints for viewing, unlocking, and versioning company identity.
 */

const { CompanyIdentityService } = require('../services/companyIdentityService');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

// ─── 1. GET /api/v1/settings/company-identity ────────────────────────────────
const getCompanyIdentity = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Only Master and Owner have authority to access Organisation Identity.');
  }

  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN-01';
  const identity = await CompanyIdentityService.getCurrentIdentity(organisationId);

  return response.status(200).json({
    success: true,
    data: identity,
    correlationId: request.correlationId || null,
  });
});

// ─── 2. POST /api/v1/settings/company-identity/unlock ────────────────────────
const unlockCompanyIdentity = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  const isPrimary = Boolean(request.auth?.isPrimaryMaster || request.auth?.isPrimary);
  const isOwner = role === 'OWNER';

  if (!isPrimary && !isOwner) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master and Owner have authority to unlock Organisation Identity.');
  }

  return response.status(200).json({
    success: true,
    data: {
      unlocked: true,
      unlockedBy: request.auth?.name || (isOwner ? 'Owner' : 'Primary Master'),
      role,
      isPrimary,
      expiresInSeconds: 900, // 15 minutes session token
      message: 'Organisation Identity unlocked for authoritative modification.',
    },
    correlationId: request.correlationId || null,
  });
});

// ─── 3. PUT /api/v1/settings/company-identity ─────────────────────────────────
const updateCompanyIdentity = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  const isPrimary = Boolean(request.auth?.isPrimaryMaster || request.auth?.isPrimary);
  const isOwner = role === 'OWNER';

  if (!isPrimary && !isOwner) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master and Owner can save modifications to Organisation Identity.');
  }

  const { updates, changeReason } = request.body;
  if (!updates || typeof updates !== 'object') {
    throw new ApiError(400, 'INVALID_PAYLOAD', 'Updates payload is required.');
  }

  if (!changeReason || typeof changeReason !== 'string' || changeReason.trim().length < 5) {
    throw new ApiError(400, 'CHANGE_REASON_REQUIRED', 'A detailed change reason (min 5 chars) is mandatory for statutory identity audit.');
  }

  const userId = request.auth?.userId || 'MASTER-01';
  const userName = request.auth?.name || 'Primary Master';

  const newVersion = await CompanyIdentityService.createNewVersion({
    updates,
    userId,
    userName,
    changeReason: changeReason.trim(),
  });

  return response.status(200).json({
    success: true,
    data: newVersion,
    message: `Organisation Identity successfully updated to Version ${newVersion.version}.`,
    correlationId: request.correlationId || null,
  });
});

// ─── 4. GET /api/v1/settings/company-identity/history ────────────────────────
const getCompanyIdentityHistory = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Only Master and Owner have authority to access Organisation Identity history.');
  }

  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN-01';
  const history = await CompanyIdentityService.getVersionHistory(organisationId);

  return response.status(200).json({
    success: true,
    data: history,
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  getCompanyIdentity,
  unlockCompanyIdentity,
  updateCompanyIdentity,
  getCompanyIdentityHistory,
};
