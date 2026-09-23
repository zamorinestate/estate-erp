'use strict';

const { ApiError } = require('./ApiError');

/**
 * ZAMORIN CAFE ERP — CENTRAL TENANT & CAFE SCOPE RESOLVER
 *
 * Implements OWASP / AWS Tenant Isolation Guidelines:
 * - Deny-by-default authorization
 * - Strict device & operator café binding for CAFE_ADMIN
 * - Multi-café authorized access preserved for MASTER and OWNER
 * - Absolute non-bypassable cross-café boundary enforcement
 */

/**
 * Resolves the authoritative effective café ID for the current request.
 *
 * @param {Object} request Express request object containing req.auth
 * @returns {string|null} Canonical uppercase Cafe ID or null if global Master/Owner view
 * @throws {ApiError} 403 if café context is invalid or cross-café access is attempted
 */
function resolveEffectiveCafeScope(request) {
  if (!request || !request.auth) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  const { role, assignedCafeIds, deviceContext } = request.auth;

  const requestedCafe = (
    request.query?.cafeId ||
    request.body?.cafeId ||
    request.params?.cafeId ||
    request.headers?.['x-cafe-id'] ||
    (typeof request.get === 'function' ? request.get('x-cafe-id') : null) ||
    ''
  ).trim().toUpperCase();

  // Determine explicit workspace mode or derive from active CAFE_OWNED device context
  const isCafeOperationsDevice = deviceContext?.deviceClass === 'CAFE_OWNED' && !!deviceContext?.boundCafeId;
  const isCafeOperationsWorkspace = request.auth.workspaceMode === 'CAFE_OPERATIONS' ||
    request.headers?.['x-workspace-mode'] === 'CAFE_OPERATIONS' ||
    request.headers?.['x-workspace'] === 'CAFE_OPERATIONS' ||
    String(request.headers?.['x-workspace-mode'] || '').toUpperCase() === 'CAFE_OPERATIONS' ||
    String(request.headers?.['x-workspace'] || '').toUpperCase() === 'CAFE_OPERATIONS' ||
    request.query?.workspaceMode === 'CAFE_OPERATIONS' ||
    isCafeOperationsDevice ||
    role === 'CAFE_ADMIN';

  // 1. CAFE_OPERATIONS WORKSPACE MODE:
  // Strictly bound to the trusted device's boundCafeId for ALL roles (including MASTER operating in Cafe Operations)
  if (isCafeOperationsWorkspace) {
    let boundCafe = (
      deviceContext?.boundCafeId ||
      request.auth.operatorSession?.cafeId ||
      request.auth.effectiveCafeId ||
      request.headers?.['x-cafe-id'] ||
      ''
    ).trim().toUpperCase();

    // If no explicit hardware device or operator session binding is active:
    if (!boundCafe) {
      if (requestedCafe && requestedCafe !== 'ALL') {
        const isAuthorizedForRequested =
          role === 'MASTER' ||
          (role === 'OWNER' && (assignedCafeIds?.includes(requestedCafe) || request.auth.primaryCafeId === requestedCafe)) ||
          (Array.isArray(assignedCafeIds) && assignedCafeIds.includes(requestedCafe)) ||
          request.auth.primaryCafeId === requestedCafe;

        if (isAuthorizedForRequested) {
          boundCafe = requestedCafe;
        } else {
          throw new ApiError(
            403,
            'CROSS_CAFE_RESOURCE_DENIED',
            'Cross-café access is denied. You are not authorized for the requested café.'
          );
        }
      } else {
        boundCafe = (
          (role === 'CAFE_ADMIN' ? (request.auth.primaryCafeId || assignedCafeIds?.[0]) : (assignedCafeIds?.[0] || request.auth.primaryCafeId)) ||
          ''
        ).trim().toUpperCase();
      }
    }

    if (!boundCafe) {
      throw new ApiError(
        403,
        'INVALID_DEVICE_CAFE_CONTEXT',
        'Active Cafe Operations device or operator café binding is missing.'
      );
    }

    if (deviceContext?.boundCafeId && requestedCafe && requestedCafe !== 'ALL' && requestedCafe !== deviceContext.boundCafeId) {
      throw new ApiError(
        403,
        'CROSS_CAFE_RESOURCE_DENIED',
        'Cross-café access is denied. This device is not authorized for the requested café.'
      );
    }

    if (requestedCafe && requestedCafe !== 'ALL' && requestedCafe !== boundCafe) {
      throw new ApiError(
        403,
        'CROSS_CAFE_RESOURCE_DENIED',
        'Cross-café access is denied. You are not authorized for the requested café.'
      );
    }

    return boundCafe;
  }

  // 2. MASTER_WORKSPACE GOVERNANCE MODE:
  // MASTER has global portfolio governance access across the organisation
  if (role === 'MASTER') {
    return requestedCafe && requestedCafe !== 'ALL' ? requestedCafe : null;
  }

  // 2b. OWNER GOVERNANCE MODE:
  // Strictly constrained to trusted assignedCafeIds; client-supplied cafeId can never expand authority
  if (role === 'OWNER') {
    const rawCafes = [
      ...(Array.isArray(assignedCafeIds) ? assignedCafeIds : (assignedCafeIds ? [assignedCafeIds] : [])),
      ...(request.auth.primaryCafeId ? [request.auth.primaryCafeId] : []),
      ...(request.auth.cafeId ? [request.auth.cafeId] : []),
    ];
    const authorizedCafes = [
      ...new Set(
        rawCafes
          .filter(Boolean)
          .map((c) => String(c).trim().toUpperCase())
      ),
    ];

    // Missing Owner assignment: fail closed
    if (authorizedCafes.length === 0) {
      throw new ApiError(
        403,
        'CROSS_CAFE_RESOURCE_DENIED',
        'Owner has no authorized café assignments.'
      );
    }

    // Case 1, 2, 3: OWNER requests a specific café
    if (requestedCafe && requestedCafe !== 'ALL') {
      if (!authorizedCafes.includes(requestedCafe)) {
        throw new ApiError(
          403,
          'CROSS_CAFE_RESOURCE_DENIED',
          'Cross-café access is denied. You are not authorized for the requested café.'
        );
      }
      return requestedCafe;
    }

    // Case 4: OWNER requests All Cafés (or no specific cafe passed)
    // If Owner is assigned exactly 1 cafe, return that cafe; if multiple, return null
    // (representing multi-café governance view within their authorized set)
    return authorizedCafes.length === 1 ? authorizedCafes[0] : null;
  }

  // 3. STAFF and personal device contexts
  const staffCafe = (assignedCafeIds?.[0] || '').trim().toUpperCase();
  if (requestedCafe && requestedCafe !== 'ALL' && requestedCafe !== staffCafe) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
  return staffCafe || null;
}

/**
 * Asserts that a retrieved resource belongs to the current effective café.
 * Throws a safe 404 / 403 error without enumerating foreign resource existence.
 *
 * @param {Object} resource The retrieved database document
 * @param {string|Object|null} effectiveCafeOrRequest The resolved effective café ID or Express request
 * @param {string} resourceName Human-readable resource type for error messages
 */
function assertResourceCafeOwnership(resource, effectiveCafeOrRequest, resourceName = 'Resource') {
  if (!resource) {
    throw new ApiError(404, 'NOT_FOUND', `${resourceName} not found.`);
  }

  let effectiveCafe = effectiveCafeOrRequest;
  let auth = null;

  if (effectiveCafeOrRequest && typeof effectiveCafeOrRequest === 'object' && effectiveCafeOrRequest.auth) {
    auth = effectiveCafeOrRequest.auth;
    effectiveCafe = resolveEffectiveCafeScope(effectiveCafeOrRequest);
  }

  const resourceCafe = (resource.cafeId || resource.assignedCafeId || resource.outletId || '').trim().toUpperCase();

  // If request/auth context is provided and role is OWNER, ensure resource belongs to assigned cafés
  if (auth && auth.role === 'OWNER') {
    const rawCafes = [
      ...(Array.isArray(auth.assignedCafeIds) ? auth.assignedCafeIds : (auth.assignedCafeIds ? [auth.assignedCafeIds] : [])),
      ...(auth.primaryCafeId ? [auth.primaryCafeId] : []),
      ...(auth.cafeId ? [auth.cafeId] : []),
    ];
    const authorizedCafes = [
      ...new Set(
        rawCafes
          .filter(Boolean)
          .map((c) => String(c).trim().toUpperCase())
      ),
    ];
    if (resourceCafe && !authorizedCafes.includes(resourceCafe)) {
      throw new ApiError(404, 'NOT_FOUND', `${resourceName} not found.`);
    }
  }

  if (!effectiveCafe) {
    // Global Master or Owner all-authorized-cafes view
    return;
  }

  // Cross-café transactions (e.g. transfers where café is either source or destination)
  if (resource.fromCafeId || resource.toCafeId) {
    const fromCafe = (resource.fromCafeId || '').trim().toUpperCase();
    const toCafe = (resource.toCafeId || '').trim().toUpperCase();
    if (fromCafe === effectiveCafe || toCafe === effectiveCafe) {
      return;
    }
    throw new ApiError(404, 'NOT_FOUND', `${resourceName} not found.`);
  }

  if (resourceCafe && resourceCafe !== effectiveCafe) {
    throw new ApiError(404, 'NOT_FOUND', `${resourceName} not found.`);
  }
}

/**
 * Builds a safe café filter for database queries based on caller authorization.
 *
 * @param {Object} request Express request object containing req.auth
 * @returns {Object} Mongoose filter object (e.g. { cafeId: '...' } or { cafeId: { $in: [...] } } or {})
 */
function buildEffectiveCafeFilter(request) {
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe) {
    return { cafeId: effectiveCafe };
  }
  if (request.auth?.role === 'OWNER' || request.auth?.role === 'CAFE_ADMIN') {
    const rawCafes = [
      ...(Array.isArray(request.auth.assignedCafeIds) ? request.auth.assignedCafeIds : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : [])),
      ...(request.auth.primaryCafeId ? [request.auth.primaryCafeId] : []),
      ...(request.auth.cafeId ? [request.auth.cafeId] : []),
    ];
    const authorizedCafes = [
      ...new Set(rawCafes.filter(Boolean).map((c) => String(c).trim().toUpperCase())),
    ];
    return { cafeId: { $in: authorizedCafes } };
  }
  return {};
}

/**
 * Sanitizes input body against an allow-list of writable fields to prevent mass-assignment.
 *
 * @param {Object} body Request body
 * @param {Array<string>} allowedFields List of permitted field keys
 * @returns {Object} Sanitized object with only allowlisted fields
 */
function allowlistWritableFields(body, allowedFields = []) {
  if (!body || typeof body !== 'object') return {};
  const sanitized = {};
  const allowSet = new Set(allowedFields);

  for (const [key, value] of Object.entries(body)) {
    if (allowSet.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

module.exports = {
  resolveEffectiveCafeScope,
  assertResourceCafeOwnership,
  buildEffectiveCafeFilter,
  allowlistWritableFields,
};
