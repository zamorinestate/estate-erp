'use strict';

const DailyClosePack = require('../models/DailyClosePack');
const { Cafe } = require('../models/Cafe');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function assertCafeAccess(request, cafeId) {
  const normCafeId = normalizeId(cafeId);
  if (!normCafeId) return;
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role === 'MASTER') return;

  const assigned = Array.isArray(request.auth?.assignedCafeIds)
    ? request.auth.assignedCafeIds.map(normalizeId)
    : request.auth?.primaryCafeId ? [normalizeId(request.auth.primaryCafeId)] : [];

  if (!assigned.includes(normCafeId)) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
}

const submitDailyClosePack = asyncHandler(async (request, response) => {
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const {
    cafeId,
    businessDate,
    shiftId,
    grossSalesPaisa,
    netSalesPaisa,
    cashCollectedPaisa,
    cashCountedPaisa,
    varianceExplanation,
    depositChallanNumber,
    bankName,
    depositAmountPaisa,
    depositSlipAttached,
  } = request.body;

  if (!cafeId || !businessDate) {
    throw new ApiError(400, 'REQUIRED_FIELDS_MISSING', 'cafeId and businessDate are required.');
  }

  assertCafeAccess(request, cafeId);

  const collected = Number(cashCollectedPaisa) || 0;
  const counted = Number(cashCountedPaisa) || 0;
  const variance = counted - collected;

  if (variance !== 0 && (!varianceExplanation || !varianceExplanation.trim())) {
    throw new ApiError(400, 'VARIANCE_EXPLANATION_REQUIRED', 'Variance explanation is mandatory when cash variance is non-zero.');
  }

  const datePart = businessDate.replace(/-/g, '');
  const count = await DailyClosePack.countDocuments({ organisationId, businessDate });
  const packId = `DCP-${datePart}-${String(count + 1).padStart(4, '0')}`;

  const existing = await DailyClosePack.findOne({ organisationId, cafeId, businessDate });
  if (existing) {
    existing.grossSalesPaisa = Number(grossSalesPaisa) || existing.grossSalesPaisa;
    existing.netSalesPaisa = Number(netSalesPaisa) || existing.netSalesPaisa;
    existing.cashCollectedPaisa = collected;
    existing.cashCountedPaisa = counted;
    existing.variancePaisa = variance;
    existing.varianceExplanation = varianceExplanation || existing.varianceExplanation;
    existing.depositChallanNumber = depositChallanNumber || existing.depositChallanNumber;
    existing.bankName = bankName || existing.bankName;
    existing.depositAmountPaisa = Number(depositAmountPaisa) || existing.depositAmountPaisa;
    existing.depositSlipAttached = Boolean(depositSlipAttached);
    existing.status = 'PENDING_REVIEW';
    existing.submittedByUserId = request.auth?.userId || 'CASHIER';
    existing.submittedByRole = request.auth?.role || 'CAFE_ADMIN';
    await existing.save();

    return response.status(200).json({
      success: true,
      message: 'Daily close pack updated and resubmitted for Owner review.',
      data: existing,
    });
  }

  const newPack = await DailyClosePack.create({
    packId,
    organisationId,
    cafeId: normalizeId(cafeId),
    businessDate,
    shiftId: shiftId || '',
    submittedByUserId: request.auth?.userId || 'CASHIER',
    submittedByRole: request.auth?.role || 'CAFE_ADMIN',
    grossSalesPaisa: Number(grossSalesPaisa) || 0,
    netSalesPaisa: Number(netSalesPaisa) || 0,
    cashCollectedPaisa: collected,
    cashCountedPaisa: counted,
    variancePaisa: variance,
    varianceExplanation: varianceExplanation || '',
    depositChallanNumber: depositChallanNumber || '',
    bankName: bankName || '',
    depositAmountPaisa: Number(depositAmountPaisa) || 0,
    depositSlipAttached: Boolean(depositSlipAttached),
    status: 'PENDING_REVIEW',
  });

  return response.status(201).json({
    success: true,
    message: 'Daily close pack submitted successfully for Owner review.',
    data: newPack,
  });
});

const listDailyClosePacks = asyncHandler(async (request, response) => {
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';

  const filter = { organisationId };

  if (request.query.cafeId) {
    assertCafeAccess(request, request.query.cafeId);
    filter.cafeId = normalizeId(request.query.cafeId);
  } else if (role === 'OWNER') {
    const assigned = request.auth?.assignedCafeIds || [];
    filter.cafeId = { $in: assigned.map(normalizeId) };
  } else if (role === 'CAFE_ADMIN') {
    const assigned = request.auth?.assignedCafeIds || [];
    filter.cafeId = { $in: assigned.map(normalizeId) };
  }

  if (request.query.businessDate) {
    filter.businessDate = request.query.businessDate;
  }
  if (request.query.status) {
    filter.status = request.query.status;
  }

  const packs = await DailyClosePack.find(filter).sort({ businessDate: -1, createdAt: -1 }).lean();

  return response.status(200).json({
    success: true,
    data: packs,
  });
});

const getDailyClosePack = asyncHandler(async (request, response) => {
  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const { packId } = request.params;

  const pack = await DailyClosePack.findOne({ organisationId, packId }).lean();
  if (!pack) {
    throw new ApiError(404, 'CLOSE_PACK_NOT_FOUND', `Close pack ${packId} not found.`);
  }

  assertCafeAccess(request, pack.cafeId);

  return response.status(200).json({
    success: true,
    data: pack,
  });
});

const reviewDailyClosePack = asyncHandler(async (request, response) => {
  const role = request.auth?.role ? request.auth.role.toUpperCase() : '';
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'GOVERNANCE_ROLE_REQUIRED', 'Only Master and Owner roles can review daily close packs.');
  }

  const organisationId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const { packId } = request.params;
  const { action, reviewNotes } = request.body; // action: 'ACKNOWLEDGE' | 'RETURN'

  if (!['ACKNOWLEDGE', 'RETURN'].includes(action)) {
    throw new ApiError(400, 'INVALID_ACTION', 'Action must be ACKNOWLEDGE or RETURN.');
  }

  const pack = await DailyClosePack.findOne({ organisationId, packId });
  if (!pack) {
    throw new ApiError(404, 'CLOSE_PACK_NOT_FOUND', `Close pack ${packId} not found.`);
  }

  assertCafeAccess(request, pack.cafeId);

  pack.status = action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'RETURNED';
  pack.reviewedByUserId = request.auth?.userId || 'OWNER';
  pack.reviewedAt = new Date();
  pack.reviewNotes = reviewNotes || (action === 'ACKNOWLEDGE' ? 'Daily close reviewed and acknowledged.' : 'Returned for explanation/correction.');
  await pack.save();

  return response.status(200).json({
    success: true,
    message: `Close pack ${packId} ${pack.status.toLowerCase()} successfully.`,
    data: pack,
  });
});

module.exports = {
  submitDailyClosePack,
  listDailyClosePacks,
  getDailyClosePack,
  reviewDailyClosePack,
};
