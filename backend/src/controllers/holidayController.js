'use strict';

/**
 * HOLIDAY CONTROLLER (P1)
 * CRUD for HolidayCalendar. MASTER/OWNER manage org-wide holidays.
 */

const { HolidayCalendar } = require('../models/HolidayCalendar');
const { SequenceCounter } = require('../models/SequenceCounter');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('../services/auditService');
const { assertCanonicalMasterState } = require('../utils/cafeScope');

function normalizeIdentifier(v) {
  return typeof v === 'string' ? v.trim().toUpperCase() : '';
}

function requireHolidayAccess(request) {
  assertCanonicalMasterState(request.auth);
  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Master or Owner can manage holidays.');
  }
  if (request.auth.role === 'MASTER' && request.auth.isPrimaryMaster !== true) {
    throw new ApiError(403, 'PRIMARY_MASTER_REQUIRED', 'Only Primary Master can manage holidays.');
  }
}

// GET /api/v1/holidays
const listHolidays = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId } = request.auth;
  const filter = { organisationId, isActive: true };

  if (request.query.cafeId) {
    const cafeId = normalizeIdentifier(request.query.cafeId);
    filter.$or = [{ cafeId: null }, { cafeId }];
  }

  if (request.query.month) {
    filter.date = { $regex: `^${request.query.month}` };
  } else if (request.query.year) {
    filter.date = { $regex: `^${request.query.year}` };
  }

  const holidays = await HolidayCalendar.find(filter).sort({ date: 1 }).lean();

  return response.status(200).json({
    success: true,
    data: { holidays },
    correlationId: request.correlationId || null,
  });
});

// GET /api/v1/holidays/:holidayId
const getHoliday = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const holidayId = normalizeIdentifier(request.params.holidayId);
  const holiday = await HolidayCalendar.findOne({
    organisationId: request.auth.organisationId,
    holidayId,
  }).lean();
  if (!holiday) throw new ApiError(404, 'HOLIDAY_NOT_FOUND', 'Holiday not found.');
  return response.status(200).json({ success: true, data: { holiday }, correlationId: request.correlationId || null });
});

// POST /api/v1/holidays
const createHoliday = asyncHandler(async (request, response) => {
  requireHolidayAccess(request);

  const {
    date,
    name,
    type = 'NATIONAL',
    cafeId: rawCafeId = null,
  } = request.body || {};

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'INVALID_DATE', 'A valid YYYY-MM-DD date is required.');
  }
  if (!name || !String(name).trim()) {
    throw new ApiError(400, 'NAME_REQUIRED', 'Holiday name is required.');
  }

  const cafeId = rawCafeId ? normalizeIdentifier(rawCafeId) : null;

  const holidayId = await SequenceCounter.generateId({
    organisationId: request.auth.organisationId,
    sequenceKey: 'HOLIDAY',
    prefix: 'HOL',
    minimumDigits: 4,
  });

  const holiday = new HolidayCalendar({
    holidayId,
    organisationId: request.auth.organisationId,
    cafeId,
    date,
    name: String(name).trim(),
    type,
    isActive: true,
    createdByUserId: request.auth.userId,
  });

  await holiday.save();

  await recordRequestAudit({
    request, module: 'ATTENDANCE', action: 'HOLIDAY_CREATED',
    entityType: 'HolidayCalendar', entityId: holidayId,
    metadata: { date, name: holiday.name, type, cafeId },
  });

  return response.status(201).json({
    success: true,
    message: 'Holiday created successfully.',
    data: { holiday },
    correlationId: request.correlationId || null,
  });
});

// PATCH /api/v1/holidays/:holidayId
const updateHoliday = asyncHandler(async (request, response) => {
  requireHolidayAccess(request);

  const holidayId = normalizeIdentifier(request.params.holidayId);
  const holiday = await HolidayCalendar.findOne({ organisationId: request.auth.organisationId, holidayId });
  if (!holiday) throw new ApiError(404, 'HOLIDAY_NOT_FOUND', 'Holiday not found.');

  const { name, type, date } = request.body || {};
  if (name !== undefined) holiday.name = String(name).trim();
  if (type !== undefined) holiday.type = type;
  if (date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date)) holiday.date = date;
  holiday.updatedByUserId = request.auth.userId;

  await holiday.save();

  await recordRequestAudit({
    request, module: 'ATTENDANCE', action: 'HOLIDAY_UPDATED',
    entityType: 'HolidayCalendar', entityId: holidayId,
    metadata: { holidayId, name: holiday.name },
  });

  return response.status(200).json({ success: true, message: 'Holiday updated.', data: { holiday }, correlationId: request.correlationId || null });
});

// DELETE /api/v1/holidays/:holidayId  (soft-delete: isActive=false)
const deleteHoliday = asyncHandler(async (request, response) => {
  requireHolidayAccess(request);

  const holidayId = normalizeIdentifier(request.params.holidayId);
  const holiday = await HolidayCalendar.findOne({ organisationId: request.auth.organisationId, holidayId });
  if (!holiday) throw new ApiError(404, 'HOLIDAY_NOT_FOUND', 'Holiday not found.');

  holiday.isActive = false;
  holiday.updatedByUserId = request.auth.userId;
  await holiday.save();

  await recordRequestAudit({
    request, module: 'ATTENDANCE', action: 'HOLIDAY_DEACTIVATED',
    entityType: 'HolidayCalendar', entityId: holidayId,
    metadata: { holidayId, name: holiday.name },
  });

  return response.status(200).json({ success: true, message: 'Holiday deactivated.', correlationId: request.correlationId || null });
});

module.exports = { listHolidays, getHoliday, createHoliday, updateHoliday, deleteHoliday };
