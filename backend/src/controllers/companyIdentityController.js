'use strict';

/**
 * COMPANY / ORGANISATION IDENTITY CONTROLLER
 * Standard compliance: Sections 381–385 (EXPORT_ENGINE_COMPANY_IDENTITY_MASTER_STANDARD.md)
 * Gated administrative endpoints for viewing, unlocking, and versioning company identity.
 */

const { CompanyIdentityService } = require('../services/companyIdentityService');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

function requireOrganisationId(request) {
  const organisationId = String(request.auth?.organisationId || '').trim().toUpperCase();
  if (!organisationId) {
    throw new ApiError(
      403,
      'AUTHENTICATED_ORGANISATION_REQUIRED',
      'Authenticated organisation context is required.'
    );
  }
  return organisationId;
}

// ─── 1. GET /api/v1/settings/company-identity ────────────────────────────────
const getCompanyIdentity = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  const isPrimaryMaster =
    role === 'MASTER' &&
    request.auth?.isPrimaryMaster === true;
  const isOwner = role === 'OWNER';

  if (!isPrimaryMaster && !isOwner) {
    throw new ApiError(
      403,
      role === 'MASTER'
        ? 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
        : 'AUTHORIZATION_DENIED',
      'Only Primary Master and Owner have authority to access Organisation Identity.'
    );
  }

  const organisationId = requireOrganisationId(request);
  try {
    const identity = await CompanyIdentityService.getCurrentIdentity(
      organisationId,
      { allowLegacyUnverified: true }
    );
    return response.status(200).json({
      success: true,
      configured: true,
      verificationRequired: identity.verificationRequired === true,
      identityVerificationStatus:
        identity.identityVerificationStatus || 'VERIFIED_CONFIGURED',
      data: identity,
      message: identity.verificationRequired === true
        ? 'Organisation Identity was created by a retired sample-data provisioner. Review every statutory field and save a verified replacement version before using exports.'
        : 'Organisation Identity loaded.',
      correlationId: request.correlationId || null,
    });
  } catch (error) {
    if (error?.code === 'COMPANY_IDENTITY_NOT_CONFIGURED') {
      return response.status(200).json({
        success: true,
        configured: false,
        data: null,
        message: 'Organisation Identity is not configured yet. Primary Master or Owner may create the initial version.',
        correlationId: request.correlationId || null,
      });
    }
    throw error;
  }
});

// ─── 2. POST /api/v1/settings/company-identity/unlock ────────────────────────
const unlockCompanyIdentity = asyncHandler(async (request, response) => {
  const role = request.auth?.role;
  const isPrimary =
    role === 'MASTER' &&
    request.auth?.isPrimaryMaster === true;
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
  const isPrimary =
    role === 'MASTER' &&
    request.auth?.isPrimaryMaster === true;
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

  const organisationId = requireOrganisationId(request);
  const requestedOrganisationId = String(updates.organisationId || '').trim().toUpperCase();
  if (requestedOrganisationId && requestedOrganisationId !== organisationId) {
    throw new ApiError(
      403,
      'CROSS_ORGANISATION_IDENTITY_DENIED',
      'Organisation Identity cannot be changed outside the authenticated organisation.'
    );
  }

  const userId = String(request.auth?.userId || '').trim().toUpperCase();
  if (!userId) {
    throw new ApiError(403, 'AUTHENTICATED_USER_REQUIRED', 'Authenticated user identity is required.');
  }

  const userName = request.auth?.name || request.auth?.email || userId;

  const newVersion = await CompanyIdentityService.createNewVersion({
    organisationId,
    updates: {
      ...updates,
      organisationId,
    },
    userId,
    actorRole: role,
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
  const isPrimaryMaster =
    role === 'MASTER' &&
    request.auth?.isPrimaryMaster === true;
  const isOwner = role === 'OWNER';

  if (!isPrimaryMaster && !isOwner) {
    throw new ApiError(
      403,
      role === 'MASTER'
        ? 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
        : 'AUTHORIZATION_DENIED',
      'Only Primary Master and Owner have authority to access Organisation Identity history.'
    );
  }

  const organisationId = requireOrganisationId(request);
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
