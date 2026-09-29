'use strict';

const { DeviceRegistration } = require('../models/DeviceRegistration');
const deviceTrustService = require('../services/deviceTrustService');

const DEVICE_CACHE_TTL_MS = 10000;
const activeDeviceCache = new Map();

/**
 * Middleware that inspects incoming request headers/session for device identity,
 * resolves DeviceRegistration from Atlas, and attaches effective privilege profile.
 */
async function attachDeviceContext(req, res, next) {
  try {
    if (!req.auth || !req.auth.userId) {
      return next();
    }

    const deviceId = req.headers['x-device-id'] || (req.session && req.session.deviceId) || null;
    let deviceRegistration = null;

    if (deviceId) {
      const now = Date.now();
      const cacheKey = `${req.auth.organisationId}:${deviceId}`;
      const cached = activeDeviceCache.get(cacheKey);

      if (cached && now - cached.timestamp < DEVICE_CACHE_TTL_MS) {
        deviceRegistration = cached.doc;
      } else {
        deviceRegistration = await DeviceRegistration.findOne({
          deviceId,
          organisationId: req.auth.organisationId,
          status: 'ACTIVE',
        }).lean();

        if (deviceRegistration) {
          activeDeviceCache.set(`${req.auth.organisationId}:${deviceId}`, { doc: deviceRegistration, timestamp: now });
        }
      }
    }

    const effective = deviceTrustService.derivePrivilegeProfile(
      req.auth.role,
      deviceRegistration,
      req.params.cafeId || req.query.cafeId || (req.body && req.body.cafeId)
    );

    const operatorSessionId = req.headers['x-operator-session-id'] || null;
    if (operatorSessionId) {
      req.auth.operatorSessionId = operatorSessionId;
    }

    req.auth.deviceContext = {
      deviceId: deviceId || 'UNKNOWN_PERSONAL_DEVICE',
      deviceClass: deviceRegistration ? deviceRegistration.deviceClass : 'PERSONAL',
      boundCafeId: deviceRegistration ? deviceRegistration.assignedCafeId : null,
      status: deviceRegistration ? deviceRegistration.status : 'UNREGISTERED',
      trustLevel: deviceRegistration ? deviceRegistration.trustLevel : 'UNVERIFIED',
      operatorSessionId,
    };

    req.auth.privilegeProfile = effective.privilegeProfile;
    req.auth.isCafeOperationsAllowed = effective.isCafeOperationsAllowed;
    req.auth.allowedCafeScope = effective.allowedCafeScope;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  attachDeviceContext,
};
