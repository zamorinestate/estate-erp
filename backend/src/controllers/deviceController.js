'use strict';

const deviceTrustService = require('../services/deviceTrustService');
const attendanceQrService = require('../services/attendanceQrService');
const { resolveEffectiveCafeScope } = require('../utils/cafeScope');

class DeviceController {
  async startEnrollment(req, res, next) {
    try {
      const { deviceId, deviceName, publicSigningKey, requestedCafeId } = req.body;
      if (!deviceId || !deviceName) {
        return res.status(400).json({ error: 'DEVICE_ID_AND_NAME_REQUIRED' });
      }

      const result = await deviceTrustService.startEnrollment({
        organisationId: req.body.organisationId || 'ZAMORIN',
        deviceId,
        deviceName,
        publicSigningKey,
        requestedCafeId,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async approveEnrollment(req, res, next) {
    try {
      const { deviceId } = req.params;
      const { assignedCafeId } = req.body;

      if (!assignedCafeId) {
        return res.status(400).json({ error: 'ASSIGNED_CAFE_ID_REQUIRED' });
      }

      const device = await deviceTrustService.approveEnrollment({
        deviceId,
        masterUserId: req.auth.userId,
        assignedCafeId,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json({
        message: 'DEVICE_APPROVED_SUCCESSFULLY',
        device: {
          deviceId: device.deviceId,
          status: device.status,
          assignedCafeId: device.assignedCafeId,
          deviceClass: device.deviceClass,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const { reason } = req.body;

      const device = await deviceTrustService.revokeDevice({
        deviceId,
        masterUserId: req.auth.userId,
        reason,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json({
        message: 'DEVICE_REVOKED_SUCCESSFULLY',
        device: {
          deviceId: device.deviceId,
          status: device.status,
          revokedAt: device.revokedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async issueChallenge(req, res, next) {
    try {
      const { cafeId } = req.body;
      const deviceId = req.headers['x-device-id'] || req.body.deviceId;

      if (!deviceId || !cafeId) {
        return res.status(400).json({ error: 'DEVICE_ID_AND_CAFE_ID_REQUIRED' });
      }

      const challenge = await attendanceQrService.issueChallenge({
        organisationId: req.auth.organisationId || 'ZAMORIN',
        deviceId,
        cafeId,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json(challenge);
    } catch (err) {
      next(err);
    }
  }

  async issueOfflineLease(req, res, next) {
    try {
      const { cafeId, durationMinutes } = req.body;
      const deviceId = req.headers['x-device-id'] || req.body.deviceId;

      if (!deviceId || !cafeId) {
        return res.status(400).json({ error: 'DEVICE_ID_AND_CAFE_ID_REQUIRED' });
      }

      const lease = await attendanceQrService.issueOfflineLease({
        organisationId: req.auth.organisationId || 'ZAMORIN',
        deviceId,
        cafeId,
        durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : 480,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json(lease);
    } catch (err) {
      next(err);
    }
  }

  async listDevices(req, res, next) {
    try {
      const organisationId = req.auth?.organisationId || 'ZAMORIN';
      const effectiveCafe = req.auth ? resolveEffectiveCafeScope(req) : null;
      const { status, search, page, limit } = req.query;

      const devices = await deviceTrustService.listDevices({
        organisationId,
        cafeId: effectiveCafe || req.query.cafeId,
        status,
        search,
        page,
        limit,
      });

      const pagination = devices.pagination || {
        total: devices.length,
        page: 1,
        limit: devices.length,
        totalPages: 1,
      };

      res.status(200).json({ success: true, data: { devices, pagination } });
    } catch (err) {
      next(err);
    }
  }

  async reportDeviceLost(req, res, next) {
    try {
      const { deviceId } = req.params;
      const { reason } = req.body;

      const device = await deviceTrustService.reportDeviceLost({
        deviceId,
        masterUserId: req.auth.userId,
        reason,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json({
        message: 'DEVICE_MARKED_LOST',
        device: { deviceId: device.deviceId, status: device.status },
      });
    } catch (err) {
      next(err);
    }
  }

  async retireDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const { reason } = req.body;

      const device = await deviceTrustService.retireDevice({
        deviceId,
        masterUserId: req.auth.userId,
        reason,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json({
        message: 'DEVICE_RETIRED',
        device: { deviceId: device.deviceId, status: device.status },
      });
    } catch (err) {
      next(err);
    }
  }

  async replaceDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const { newDeviceId, newDeviceName, reason } = req.body;

      if (!newDeviceId) {
        return res.status(400).json({ error: 'NEW_DEVICE_ID_REQUIRED' });
      }

      const result = await deviceTrustService.replaceDevice({
        oldDeviceId: deviceId,
        newDeviceId,
        newDeviceName,
        masterUserId: req.auth.userId,
        reason,
        correlationId: req.headers['x-correlation-id'],
      });

      res.status(200).json({
        message: 'DEVICE_REPLACED_SUCCESSFULLY',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeviceController();
