'use strict';

/**
 * VENDOR AUTHORIZATION & SECURITY BOUNDARY MIDDLEWARE
 *
 * Enforces:
 * 1. Role validation: VENDOR role only
 * 2. Strict read-only enforcement: Rejection of POST/PUT/PATCH/DELETE
 * 3. Identity binding: Derived exclusively from authenticated session (req.auth.vendorId)
 * 4. Zero cross-vendor leakage: Rejects client-supplied parameter tampering (IDOR/BOLA)
 * 5. Café isolation: Enforces intersection with Vendor.approvedCafeIds
 * 6. Account status verification: Ensures vendor master record is ACTIVE
 */

const { Vendor } = require('../models/Vendor');
const { logSecurityEvent, SECURITY_ACTIONS } = require('../services/securityLogger');

function sendVendorSecurityError(res, req, status, code, message, severity = 'WARN') {
  try {
    logSecurityEvent({
      correlationId: req?.correlationId || null,
      organisationId: req?.auth?.organisationId || null,
      cafeId: req?.params?.cafeId || req?.query?.cafeId || req?.headers?.['x-cafe-id'] || null,
      actorId: req?.auth?.userId || null,
      action: SECURITY_ACTIONS.AUTHORIZATION_DENIED || 'AUTHORIZATION_DENIED',
      targetType: 'VENDOR_ENDPOINT',
      targetId: req?.originalUrl || req?.url || null,
      outcome: 'DENIED',
      severity,
      metadata: {
        code,
        message,
        method: req?.method,
        clientIp: req?.ip,
        authenticatedVendorId: req?.auth?.vendorId || null,
      },
    });
  } catch (_) {}

  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

/**
 * 1. Enforces that the authenticated user possesses the VENDOR role.
 */
function enforceVendorRole(req, res, next) {
  if (!req.auth) {
    return sendVendorSecurityError(
      res,
      req,
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required to access the Vendor Workspace.',
      'WARN'
    );
  }

  const role = String(req.auth.role || '').toUpperCase();
  if (role !== 'VENDOR') {
    return sendVendorSecurityError(
      res,
      req,
      403,
      'FORBIDDEN_VENDOR_ACCESS',
      'This workspace is restricted to authorized external vendor accounts.',
      'WARN'
    );
  }

  return next();
}

/**
 * 2. Enforces strict read-only access server-side.
 * Rejects any business mutation attempts (POST, PUT, PATCH, DELETE).
 */
function enforceVendorReadOnly(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  const prohibitedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (prohibitedMethods.includes(method)) {
    return sendVendorSecurityError(
      res,
      req,
      403,
      'FORBIDDEN_VENDOR_WRITE',
      'Vendor accounts operate under strict read-only access. Write operations are prohibited.',
      'WARN'
    );
  }

  return next();
}

/**
 * 3. Enforces that the session is bound to an active canonical Vendor document.
 * Detects and rejects any IDOR tampering where client-supplied vendorId conflicts with req.auth.vendorId.
 */
async function enforceVendorIdentity(req, res, next) {
  try {
    const authVendorId = req.auth?.vendorId ? String(req.auth.vendorId).trim().toUpperCase() : null;

    if (!authVendorId) {
      return sendVendorSecurityError(
        res,
        req,
        403,
        'VENDOR_IDENTITY_UNBOUND',
        'Your user account is not associated with an authoritative vendor identity. Please contact administration.',
        'ERROR'
      );
    }

    // IDOR / BOLA Prevention: Verify client did not attempt to tamper with vendorId parameter
    const clientProvidedIds = [
      req.params?.vendorId,
      req.query?.vendorId,
      req.headers?.['x-vendor-id'],
      req.body?.vendorId,
    ].filter(Boolean).map((id) => String(id).trim().toUpperCase());

    for (const clientId of clientProvidedIds) {
      if (clientId && clientId !== authVendorId) {
        return sendVendorSecurityError(
          res,
          req,
          403,
          'CROSS_VENDOR_ACCESS_DENIED',
          'Access to records belonging to another vendor is strictly prohibited.',
          'ERROR'
        );
      }
    }

    // Resolve authoritative Vendor master record
    const orgId = String(req.auth.organisationId || 'ZAMORIN').trim().toUpperCase();
    const vendor = await Vendor.findOne({
      organisationId: orgId,
      vendorId: authVendorId,
    });

    if (!vendor) {
      return sendVendorSecurityError(
        res,
        req,
        404,
        'VENDOR_NOT_FOUND',
        'The associated vendor record could not be found.',
        'ERROR'
      );
    }

    const inactiveStatuses = ['ARCHIVED', 'BLACKLISTED', 'SUSPENDED'];
    if (inactiveStatuses.includes(vendor.status)) {
      return sendVendorSecurityError(
        res,
        req,
        403,
        'VENDOR_INACTIVE',
        `Vendor account status is ${vendor.status}. Access is restricted.`,
        'WARN'
      );
    }

    // Attach authoritative vendor document to request context
    req.vendor = vendor;
    req.auth.approvedCafeIds = (vendor.approvedCafeIds || []).map((c) => String(c).trim().toUpperCase());

    return next();
  } catch (err) {
    return sendVendorSecurityError(
      res,
      req,
      500,
      'VENDOR_SECURITY_ERROR',
      'An unexpected error occurred while verifying vendor security context.',
      'ERROR'
    );
  }
}

/**
 * 4. Enforces café boundary isolation.
 * If a café is targeted in query or header, verifies it belongs to Vendor.approvedCafeIds.
 */
function enforceVendorCafeScope(req, res, next) {
  const requestedCafeId = String(
    req.params?.cafeId ||
    req.query?.cafeId ||
    req.headers?.['x-cafe-id'] ||
    ''
  ).trim().toUpperCase();

  if (requestedCafeId && requestedCafeId !== 'ALL' && requestedCafeId !== 'GLOBAL') {
    const approvedCafes = req.auth?.approvedCafeIds || (req.vendor?.approvedCafeIds || []).map((c) => String(c).trim().toUpperCase());

    if (!approvedCafes.includes(requestedCafeId)) {
      return sendVendorSecurityError(
        res,
        req,
        403,
        'CROSS_CAFE_ACCESS_DENIED',
        'Your vendor account is not authorized to access transactions for the requested café.',
        'WARN'
      );
    }
  }

  return next();
}

module.exports = {
  enforceVendorRole,
  enforceVendorReadOnly,
  enforceVendorIdentity,
  enforceVendorCafeScope,
};
