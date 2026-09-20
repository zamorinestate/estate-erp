'use strict';

const passkeyService = require('../services/passkeyService');
const { asyncHandler } = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/v1/auth/passkeys/register/options
 * POST /api/v1/auth/passkeys/register/options
 * Generates registration challenge for authenticated user.
 */
const getRegistrationOptions = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    throw ApiError.unauthorized('Authentication required to register a passkey.');
  }

  const result = await passkeyService.generatePasskeyRegistrationOptions({
    user: req.authenticatedUser || req.user,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/v1/auth/passkeys/register/verify
 * Verifies authenticator response and saves credential.
 */
const verifyRegistration = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    throw ApiError.unauthorized('Authentication required to register a passkey.');
  }

  const { response, challengeId, friendlyName } = req.body || {};

  if (!response || !challengeId) {
    throw ApiError.badRequest('response payload and challengeId are required.');
  }

  const result = await passkeyService.verifyPasskeyRegistration({
    user: req.authenticatedUser || req.user,
    response,
    challengeId,
    friendlyName,
  });

  return res.status(201).json({
    success: true,
    message: 'Passkey registered successfully.',
    data: result,
  });
});

/**
 * POST /api/v1/auth/passkeys/authenticate/options
 * Generates authentication options for user / tenant.
 */
const getAuthenticationOptions = asyncHandler(async (req, res) => {
  const { organisationId, email } = req.body || {};

  const result = await passkeyService.generatePasskeyAuthenticationOptions({
    organisationId: organisationId || req.organisationId || 'ZAMORIN',
    email,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/v1/auth/passkeys/authenticate/verify
 * Verifies assertion, issues authoritative session, returns user and token.
 */
const verifyAuthentication = asyncHandler(async (req, res) => {
  const { organisationId, response, challengeId, device } = req.body || {};

  if (!response || !challengeId) {
    throw ApiError.badRequest('response payload and challengeId are required.');
  }

  const result = await passkeyService.verifyPasskeyAuthentication({
    organisationId: organisationId || req.organisationId || 'ZAMORIN',
    response,
    challengeId,
    device: device || {
      deviceId: req.headers['x-device-id'] || 'DEV-WEB-PASSKEY',
      deviceType: 'DESKTOP',
    },
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || req.socket.remoteAddress || '',
  });

  return res.status(200).json({
    success: true,
    message: 'Passkey authentication successful.',
    data: result,
  });
});

/**
 * GET /api/v1/auth/passkeys
 * Lists all active passkeys for authenticated user.
 */
const listUserPasskeys = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    throw ApiError.unauthorized('Authentication required to view passkeys.');
  }

  const passkeys = await passkeyService.listUserPasskeys({
    organisationId: req.user.organisationId,
    userId: req.user.userId,
  });

  return res.status(200).json({
    success: true,
    data: passkeys.map((p) => p.toJSON()),
  });
});

/**
 * DELETE /api/v1/auth/passkeys/:credentialId
 * Revokes a passkey credential for authenticated user.
 */
const revokeUserPasskey = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    throw ApiError.unauthorized('Authentication required to revoke a passkey.');
  }

  const { credentialId } = req.params;

  if (!credentialId) {
    throw ApiError.badRequest('credentialId is required.');
  }

  const result = await passkeyService.revokeUserPasskey({
    organisationId: req.user.organisationId,
    userId: req.user.userId,
    credentialId,
    revokedBy: req.user.userId,
  });

  return res.status(200).json({
    success: true,
    message: 'Passkey revoked successfully.',
    data: result,
  });
});

/**
 * PATCH /api/v1/auth/passkeys/:credentialId
 * Renames a passkey credential for authenticated user.
 */
const renameUserPasskey = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    throw ApiError.unauthorized('Authentication required to rename a passkey.');
  }

  const { credentialId } = req.params;
  const { friendlyName } = req.body || {};

  if (!credentialId) {
    throw ApiError.badRequest('credentialId is required.');
  }

  const result = await passkeyService.renameUserPasskey({
    organisationId: req.user.organisationId,
    userId: req.user.userId,
    credentialId,
    friendlyName,
  });

  return res.status(200).json({
    success: true,
    message: 'Passkey renamed successfully.',
    data: result,
  });
});

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listUserPasskeys,
  revokeUserPasskey,
  renameUserPasskey,
};
