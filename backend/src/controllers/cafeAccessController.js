'use strict';

const cafeService = require('../services/cafeService');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

function requireGovernance(req, cafeId = null) {
  if (!req.auth || !req.auth.role) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }
  const role = req.auth.role.toUpperCase();
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(
      403,
      'GOVERNANCE_ACCESS_REQUIRED',
      'Only Master and Owner roles may manage Café Operations access.'
    );
  }

  if (role === 'OWNER' && cafeId) {
    const rawCafes = [
      ...(Array.isArray(req.auth.assignedCafeIds) ? req.auth.assignedCafeIds : (req.auth.assignedCafeIds ? [req.auth.assignedCafeIds] : [])),
      ...(req.auth.primaryCafeId ? [req.auth.primaryCafeId] : []),
      ...(req.auth.cafeId ? [req.auth.cafeId] : []),
    ];
    const authorizedCafes = new Set(rawCafes.filter(Boolean).map((c) => String(c).trim().toUpperCase()));
    if (!authorizedCafes.has(String(cafeId).trim().toUpperCase())) {
      throw new ApiError(
        403,
        'CROSS_CAFE_RESOURCE_DENIED',
        'Owner is not authorized for this café access management.'
      );
    }
  }
}

const getPublicQrContext = asyncHandler(async (req, res) => {
  const token = (req.params.token || req.query.token || '').trim();
  if (!token) {
    throw new ApiError(400, 'TOKEN_REQUIRED', 'Access QR token is required.');
  }

  const result = await cafeService.resolvePublicQrToken(token, {
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId || req.headers['x-correlation-id'],
  });

  // If HTML requested from browser navigation, safe internal redirect
  if (req.accepts && req.accepts('html') && !req.xhr && !req.path.startsWith('/api/')) {
    return res.redirect(`/#cafe-access/qr/${encodeURIComponent(token)}`);
  }

  return res.status(200).json({
    success: true,
    message: 'Café Operations gateway resolved successfully.',
    data: result,
  });
});

const resolveGateway = asyncHandler(async (req, res) => {
  const { method, credential } = req.body || {};

  const result = await cafeService.resolveGatewayCredential({
    method,
    credential,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId || req.headers['x-correlation-id'],
  });

  return res.status(200).json({
    success: true,
    message: 'Café Operations gateway resolved successfully.',
    data: result,
  });
});

const getAccessSummary = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);

  const summary = await cafeService.getCafeAccessSummary(
    req.auth.organisationId,
    cafeId
  );

  return res.status(200).json({
    success: true,
    data: summary,
  });
});

const revealPermanentPin = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { currentPassword } = req.body || {};

  const result = await cafeService.revealPermanentPin({
    organisationId: req.auth.organisationId,
    cafeId,
    auth: req.auth,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'Permanent Café PIN revealed successfully.',
    data: result,
  });
});

const rotateQr = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { currentPassword } = req.body || {};

  const result = await cafeService.rotateQrCredential({
    organisationId: req.auth.organisationId,
    cafeId,
    auth: req.auth,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'QR access credential rotated successfully.',
    data: result,
  });
});

const revokeQr = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { reason, currentPassword } = req.body || {};

  const result = await cafeService.revokeQrCredential({
    organisationId: req.auth.organisationId,
    cafeId,
    auth: req.auth,
    reason,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'QR access credential revoked successfully.',
    data: result,
  });
});

const rotateLink = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { currentPassword } = req.body || {};

  const result = await cafeService.rotateLinkCredential({
    organisationId: req.auth.organisationId,
    cafeId,
    auth: req.auth,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'Login link credential rotated successfully.',
    data: result,
  });
});

const emergencyLock = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { reason, currentPassword } = req.body || {};

  const result = await cafeService.setEmergencyLock({
    organisationId: req.auth.organisationId,
    cafeId,
    lock: true,
    reason,
    auth: req.auth,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'Café Operations Emergency Lock engaged.',
    data: result,
  });
});

const emergencyUnlock = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);
  const { reason, currentPassword } = req.body || {};

  const result = await cafeService.setEmergencyLock({
    organisationId: req.auth.organisationId,
    cafeId,
    lock: false,
    reason,
    auth: req.auth,
    currentPassword,
    clientIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json({
    success: true,
    message: 'Café Operations Emergency Lock released.',
    data: result,
  });
});

const runAccessTest = asyncHandler(async (req, res) => {
  const cafeId = (req.params.cafeId || '').trim().toUpperCase();
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }
  requireGovernance(req, cafeId);

  const results = await cafeService.runAccessHealthCheck({
    organisationId: req.auth.organisationId,
    cafeId,
    auth: req.auth,
  });

  return res.status(200).json({
    success: true,
    data: results,
  });
});

const verifyCafeBinding = asyncHandler(async (req, res) => {
  const { cafeId } = req.body || {};
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'Café ID is required.');
  }

  const binding = await cafeService.verifyCafeAccessBinding({
    userId: req.auth.userId,
    role: req.auth.role,
    organisationId: req.auth.organisationId,
    assignedCafeIds: req.auth.assignedCafeIds,
    primaryCafeId: req.auth.primaryCafeId,
    targetCafeId: cafeId,
    isPrimaryMaster: Boolean(req.auth.isPrimaryMaster),
  });

  return res.status(200).json({
    success: true,
    message: 'Café authorization binding verified.',
    data: binding,
  });
});

module.exports = {
  getPublicQrContext,
  resolveGateway,
  getAccessSummary,
  revealPermanentPin,
  rotateQr,
  revokeQr,
  rotateLink,
  emergencyLock,
  emergencyUnlock,
  runAccessTest,
  verifyCafeBinding,
};
