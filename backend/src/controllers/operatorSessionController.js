'use strict';

const operatorSessionService = require('../services/operatorSessionService');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

class OperatorSessionController {
  getDirectory = asyncHandler(async (req, res) => {
    const organisationId = req.query.organisationId || req.auth?.organisationId || 'ZAMORIN';
    const result = await operatorSessionService.getCafeOperationsDirectory({ organisationId });
    return res.status(200).json(result);
  });

  signIn = asyncHandler(async (req, res) => {
    const { deviceId, cafeId, operatorUserId, pin, gatewayContextToken, cafePin, rememberAccess } = req.body || {};
    const organisationId = req.body?.organisationId || req.auth?.organisationId || 'ZAMORIN';
    const token = gatewayContextToken || req.headers['x-gateway-context-token'];

    const result = await operatorSessionService.signInOperator({
      organisationId,
      deviceId: deviceId || req.headers['x-device-id'],
      cafeId,
      operatorUserId,
      pin,
      gatewayContextToken: token,
      rememberAccess: Boolean(rememberAccess),
      clientIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    });

    return res.status(200).json(result);
  });

  signInMaster = asyncHandler(async (req, res) => {
    const { deviceId, masterUserId, password, mfaCode } = req.body;
    const organisationId = req.body.organisationId || req.auth?.organisationId || 'ZAMORIN';

    const result = await operatorSessionService.signInMasterOperator({
      organisationId,
      deviceId: deviceId || req.headers['x-device-id'],
      masterUserId,
      password,
      mfaCode,
      clientIp: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'],
    });

    return res.status(200).json(result);
  });

  lock = asyncHandler(async (req, res) => {
    const { operatorSessionId } = req.body;
    const sessionId = operatorSessionId || req.headers['x-operator-session-id'];

    if (!sessionId) {
      throw new ApiError(400, 'SESSION_ID_REQUIRED', 'Operator session ID is required.');
    }

    const result = await operatorSessionService.lockOperatorSession({
      operatorSessionId: sessionId,
      deviceId: req.headers['x-device-id'],
      operatorUserId: req.auth?.userId,
    });

    return res.status(200).json(result);
  });

  unlock = asyncHandler(async (req, res) => {
    const { operatorSessionId, pin } = req.body;
    const sessionId = operatorSessionId || req.headers['x-operator-session-id'];

    if (!sessionId || !pin) {
      throw new ApiError(400, 'PIN_REQUIRED', 'Operator session ID and PIN are required.');
    }

    const result = await operatorSessionService.unlockOperatorSession({
      operatorSessionId: sessionId,
      pin,
      clientIp: req.ip,
    });

    return res.status(200).json(result);
  });

  switchOperator = asyncHandler(async (req, res) => {
    const { operatorSessionId, handoverNote, newOperatorUserId, newPin, deviceId } = req.body;
    const organisationId = req.body.organisationId || req.auth?.organisationId || 'ZAMORIN';

    const result = await operatorSessionService.switchOperator({
      operatorSessionId: operatorSessionId || req.headers['x-operator-session-id'],
      handoverNote,
      newOperatorUserId,
      newPin,
      deviceId: deviceId || req.headers['x-device-id'],
      organisationId,
    });

    return res.status(200).json(result);
  });

  endSession = asyncHandler(async (req, res) => {
    const { operatorSessionId, endReason } = req.body;
    const sessionId = operatorSessionId || req.headers['x-operator-session-id'];

    if (!sessionId) {
      throw new ApiError(400, 'SESSION_ID_REQUIRED', 'Operator session ID is required.');
    }

    const result = await operatorSessionService.endOperatorSession({
      operatorSessionId: sessionId,
      endReason: endReason || 'MANUAL_END',
    });

    return res.status(200).json(result);
  });

  getCurrentSession = asyncHandler(async (req, res) => {
    const deviceId = req.query.deviceId || req.headers['x-device-id'];
    const organisationId = req.query.organisationId || req.auth?.organisationId || 'ZAMORIN';

    if (!deviceId) {
      return res.status(200).json({ success: true, operatorSession: null });
    }

    const session = await operatorSessionService.getCurrentOperatorSession({
      deviceId,
      organisationId,
    });

    return res.status(200).json({
      success: true,
      operatorSession: session,
    });
  });

  listSessions = asyncHandler(async (req, res) => {
    const organisationId = req.auth?.organisationId || 'ZAMORIN';
    const { cafeId, operatorUserId, deviceId, status, dateFrom, dateTo, page, limit } = req.query;

    const result = await operatorSessionService.listOperatorSessions({
      organisationId,
      cafeId,
      operatorUserId,
      deviceId,
      status,
      dateFrom,
      dateTo,
      page,
      limit,
    });

    return res.status(200).json({ success: true, data: result });
  });

  setPin = asyncHandler(async (req, res) => {
    const { targetUserId, newPin } = req.body;
    const organisationId = req.auth?.organisationId || 'ZAMORIN';

    const result = await operatorSessionService.setOperatorPin({
      organisationId,
      targetUserId: targetUserId || req.auth.userId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorIsPrimaryMaster: req.auth.isPrimaryMaster === true,
      newPin,
    });

    return res.status(200).json(result);
  });

  setCafePin = asyncHandler(async (req, res) => {
    const { cafeId, newPin } = req.body;
    const organisationId = req.auth?.organisationId || 'ZAMORIN';

    const result = await operatorSessionService.setCafePin({
      organisationId,
      cafeId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      actorIsPrimaryMaster: req.auth.isPrimaryMaster === true,
      newPin,
    });

    return res.status(200).json(result);
  });

  acknowledgeHandover = asyncHandler(async (req, res) => {
    const { operatorSessionId } = req.params;
    const acknowledgingOperatorId = req.auth.userId;

    const result = await operatorSessionService.acknowledgeHandover({
      operatorSessionId,
      acknowledgingOperatorId,
    });

    return res.status(200).json(result);
  });
}

module.exports = new OperatorSessionController();
