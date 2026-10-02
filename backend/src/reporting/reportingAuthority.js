'use strict';

/**
 * Canonical reporting authority checks.
 *
 * MASTER is a database role used only by the single Primary Master.
 * Any authenticated MASTER record without isPrimaryMaster === true is a retired/invalid
 * account state and must fail closed before report scope or permission evaluation.
 */

function buildAuthorityError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function isPrimaryMasterAuth(auth) {
  return Boolean(
    auth &&
    String(auth.role || '').toUpperCase() === 'MASTER' &&
    auth.isPrimaryMaster === true
  );
}

function assertCanonicalReportingActor(auth) {
  if (!auth || !auth.userId) {
    throw buildAuthorityError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication required for report access.'
    );
  }

  const role = String(auth.role || '').toUpperCase();
  const isPrimaryMaster = isPrimaryMasterAuth(auth);

  if (role === 'MASTER' && !isPrimaryMaster) {
    throw buildAuthorityError(
      403,
      'RETIRED_MASTER_ACCOUNT_DENIED',
      'Non-primary MASTER accounts are retired and cannot access reporting.'
    );
  }

  return { role, isPrimaryMaster };
}

module.exports = {
  isPrimaryMasterAuth,
  assertCanonicalReportingActor,
};
