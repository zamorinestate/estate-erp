'use strict';
/**
 * CANONICAL GOVERNANCE AUTHORIZATION WRAPPER
 *
 * Delegates to canonical Zamorin authorization engine
 * (backend/src/middleware/authorize.js). Only the designated Primary Master
 * may exercise MASTER governance authority.
 */
const { fail } = require('../utils/responses');
let canAccessCafe;
try {
  ({ canAccessCafe } = require('../../middleware/authorize'));
} catch (e) {
  canAccessCafe = (auth, cafeId) => {
    if (!auth) return false;
    if (auth.role === 'MASTER' || auth.role === 'OWNER') return true;
    if (auth.role === 'CAFE_ADMIN') {
      return String(auth.assignedCafeId || auth.cafeId) === String(cafeId);
    }
    return false;
  };
}

function normalizeRole(rawRole, isPrimaryMaster) {
  if (rawRole === 'MASTER_PRIMARY') return 'MASTER_PRIMARY';
  if (rawRole === 'MASTER') {
    return isPrimaryMaster === true ? 'MASTER_PRIMARY' : 'MASTER';
  }
  return rawRole;
}

function canonicalRole(rawRole) {
  return rawRole === 'MASTER_PRIMARY' || rawRole === 'MASTER'
    ? 'MASTER'
    : rawRole;
}

function buildCaller({
  rawRole,
  isPrimaryMaster,
  userId,
  organisationId,
  assignedCafeId,
  cafeIds,
  status,
  rawAuth,
}) {
  const role = normalizeRole(rawRole, isPrimaryMaster);
  return {
    employeeId: userId,
    userId,
    role,
    canonicalRole: canonicalRole(role),
    organisationId,
    isPrimaryMaster: isPrimaryMaster === true,
    assignedCafeId: assignedCafeId || null,
    cafeIds: cafeIds || [],
    status: status || 'ACTIVE',
    rawAuth,
  };
}

function resolveCallerFromRequest(req) {
  if (req.cafeOpsCaller) return req.cafeOpsCaller;

  if (
    process.env.NODE_ENV !== 'production' &&
    req.headers &&
    req.headers['x-mock-user-role']
  ) {
    const rawRole = req.headers['x-mock-user-role'];
    const isPrimaryMaster =
      req.headers['x-mock-user-is-primary'] === 'true' ||
      rawRole === 'MASTER_PRIMARY';
    const userId =
      req.headers['x-mock-user-id'] ||
      'MOCK_GOVERNANCE_CALLER';
    const canonical = canonicalRole(
      normalizeRole(rawRole, isPrimaryMaster)
    );

    return buildCaller({
      rawRole,
      isPrimaryMaster,
      userId,
      organisationId:
        req.headers['x-mock-org-id'] || 'ORG_ZAMORIN',
      assignedCafeId:
        req.headers['x-mock-cafe-id'] || null,
      cafeIds: req.headers['x-mock-cafe-ids']
        ? req.headers['x-mock-cafe-ids'].split(',')
        : [],
      status:
        req.headers['x-mock-user-status'] || 'ACTIVE',
      rawAuth: {
        userId,
        role: canonical,
        isPrimaryMaster,
        organisationId:
          req.headers['x-mock-org-id'] || 'ORG_ZAMORIN',
        status:
          req.headers['x-mock-user-status'] || 'ACTIVE',
      },
    });
  }

  if (req.auth) {
    const isPrimaryMaster =
      req.auth.isPrimaryMaster === true ||
      req.auth.isPrimary === true;
    return buildCaller({
      rawRole: req.auth.role,
      isPrimaryMaster,
      userId:
        req.auth.userId || req.auth.id || req.auth._id,
      organisationId: req.auth.organisationId,
      assignedCafeId:
        req.auth.assignedCafeId || req.auth.cafeId,
      cafeIds: req.auth.cafeIds || [],
      status: req.auth.status || 'ACTIVE',
      rawAuth: req.auth,
    });
  }

  if (req.authenticatedUser) {
    const isPrimaryMaster =
      req.authenticatedUser.isPrimaryMaster === true;
    return buildCaller({
      rawRole: req.authenticatedUser.role,
      isPrimaryMaster,
      userId:
        req.authenticatedUser.userId ||
        req.authenticatedUser._id,
      organisationId:
        req.authenticatedUser.organisationId,
      assignedCafeId:
        req.authenticatedUser.assignedCafeId ||
        req.authenticatedUser.cafeId,
      cafeIds:
        req.authenticatedUser.cafeIds || [],
      status:
        req.authenticatedUser.accountStatus ||
        req.authenticatedUser.status ||
        'ACTIVE',
      rawAuth: req.authenticatedUser,
    });
  }

  if (req.user) {
    const isPrimaryMaster =
      req.user.isPrimaryMaster === true ||
      req.user.role === 'MASTER_PRIMARY';
    return buildCaller({
      rawRole: req.user.role,
      isPrimaryMaster,
      userId:
        req.user.employeeId ||
        req.user.userId ||
        req.user.id ||
        req.user._id,
      organisationId: req.user.organisationId,
      assignedCafeId:
        req.user.assignedCafeId || req.user.cafeId,
      cafeIds: req.user.cafeIds || [],
      status: req.user.status || 'ACTIVE',
      rawAuth: req.user,
    });
  }

  return null;
}

const KNOWN_GOVERNANCE_ROLES = new Set([
  'MASTER_PRIMARY',
  'MASTER',
  'OWNER',
  'CAFE_ADMIN',
]);

function requireGovernanceRole(...allowedRoles) {
  return function (req, res, next) {
    const caller = resolveCallerFromRequest(req);

    if (!caller) {
      return fail(
        res,
        401,
        'UNAUTHORIZED',
        'Authentication required for governance operations.'
      );
    }

    if (
      caller.status &&
      caller.status !== 'ACTIVE'
    ) {
      return fail(
        res,
        403,
        'ACCOUNT_INACTIVE',
        'User account is disabled or suspended.'
      );
    }

    if (
      caller.canonicalRole === 'MASTER' &&
      caller.isPrimaryMaster !== true
    ) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Only the designated Primary Master may perform Master governance operations.'
      );
    }

    if (
      !KNOWN_GOVERNANCE_ROLES.has(caller.role) &&
      !KNOWN_GOVERNANCE_ROLES.has(caller.canonicalRole)
    ) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Role is not authorized for governance operations.'
      );
    }

    const matchesRole = allowedRoles.some((allowed) => {
      if (allowed === caller.role) return true;
      if (
        allowed === caller.canonicalRole &&
        caller.canonicalRole !== 'MASTER'
      ) {
        return true;
      }
      if (
        allowed === 'MASTER' &&
        caller.role === 'MASTER_PRIMARY'
      ) {
        return true;
      }
      return false;
    });

    if (!matchesRole) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'You do not have access to this area.'
      );
    }

    const targetCafeId =
      (req.query && req.query.cafeId) ||
      (req.body && req.body.cafeId);

    if (
      targetCafeId &&
      typeof canAccessCafe === 'function'
    ) {
      const authPayload = {
        ...(caller.rawAuth || {}),
        role: caller.canonicalRole,
        isPrimaryMaster: caller.isPrimaryMaster,
        assignedCafeId: caller.assignedCafeId,
        cafeIds: caller.cafeIds,
      };

      if (!canAccessCafe(authPayload, targetCafeId)) {
        return fail(
          res,
          403,
          'CAFE_ACCESS_DENIED',
          'You do not have access to this café.'
        );
      }
    }

    req.cafeOpsCaller = caller;
    next();
  };
}

module.exports = {
  requireGovernanceRole,
  resolveCallerFromRequest,
};
