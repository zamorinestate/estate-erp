'use strict';
// Pure authorization decision for the Master path. Deliberately NOT the same
// shape as operatorAuthorizationService: there is no cafe-assignment grant
// to look up here, because Master's authority is already organisation-wide.
// The cafe boundary for Master is a WORKSPACE constraint applied after this
// check passes (effectiveCafeId := device.cafeId at session creation), not
// a permission lookup that can itself say "wrong cafe" — see
// ARCHITECTURE_DECISIONS.md section 3 for the reasoning.
const { DEVICE_STATUS, DENIAL_REASON } = require('../utils/constants');

function evaluateMasterCafeOperationsAccess({ device, master, now = new Date() }) {
  if (!device) return deny(DENIAL_REASON.DEVICE_NOT_FOUND);
  if (device.lifecycleStatus !== DEVICE_STATUS.ACTIVE) return deny(DENIAL_REASON.DEVICE_NOT_ACTIVE);

  if (!master) return deny(DENIAL_REASON.MASTER_AUTH_FAILED);
  if (master.role !== 'MASTER_PRIMARY') return deny(DENIAL_REASON.MASTER_AUTH_FAILED);
  if (master.isActive === false) return deny(DENIAL_REASON.MASTER_INACTIVE);

  // Master spec Section 106: the designated Primary Master from Organisation A must be
  // denied on an Organisation B device, regardless of how broad their
  // authority is within their own organisation.
  if (String(master.organisationId) !== String(device.organisationId)) return deny(DENIAL_REASON.ORG_MISMATCH);

  return { granted: true, reason: null };
}

function deny(reason) { return { granted: false, reason }; }

module.exports = { evaluateMasterCafeOperationsAccess };
