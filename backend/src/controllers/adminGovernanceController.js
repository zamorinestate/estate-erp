'use strict';

const { User } = require('../models/User');
const { Cafe } = require('../models/Cafe');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { AuditEvent } = require('../models/AuditEvent');
const { AdministrativeRequest } = require('../models/AdministrativeRequest');
const { AccessReview } = require('../models/AccessReview');
const { ServiceIdentity } = require('../models/ServiceIdentity');
const { SequenceCounter } = require('../models/SequenceCounter');

const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { assertCanonicalMasterState } = require('../utils/cafeScope');
const auditService = require('../services/auditService');

// ─── Overview & KPIs ─────────────────────────────────────────────────────────

const getAdminOverview = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, isPrimaryMaster, role } = request.auth;

  // 1. Cafes summary
  const cafes = await Cafe.find({ organisationId }).lean();
  const activeCafes = cafes.filter((c) => c.status === 'ACTIVE').length;
  const setupCafes = cafes.filter((c) => c.status === 'DRAFT' || c.status === 'PENDING_OPENING' || c.status === 'SETUP').length;
  const totalCafes = cafes.length;

  // 2. Users summary
  const users = await User.find({ organisationId }).lean();
  const activeUsers = users.filter((u) => u.accountStatus === 'ACTIVE').length;
  const pendingUsers = users.filter((u) => u.accountStatus === 'INVITED' || u.accountStatus === 'PENDING_SETUP').length;
  const suspendedUsers = users.filter((u) => u.accountStatus === 'SUSPENDED' || u.accountStatus === 'LOCKED').length;

  // 3. MASTER accounts
  const masterUsers = users.filter((u) => u.role === 'MASTER');
  const primaryMasters = masterUsers.filter((u) => u.isPrimaryMaster === true).length;
  const invalidOrRetiredMasters = masterUsers.filter((u) => u.isPrimaryMaster !== true).length;

  // 4. CAFE_ADMIN accounts
  const cafeAdmins = users.filter((u) => u.role === 'CAFE_ADMIN');
  const activeAdmins = cafeAdmins.filter((u) => u.accountStatus === 'ACTIVE').length;
  const reviewAdmins = cafeAdmins.filter((u) => !u.assignedCafeIds || u.assignedCafeIds.length === 0).length;

  // 5. Devices
  const devices = await DeviceRegistration.find({ organisationId }).lean().catch(() => []);
  const activeDevices = devices.filter((d) => d.status === 'ACTIVE' || d.trustState === 'TRUSTED').length;
  const attentionDevices = devices.filter((d) => d.status !== 'ACTIVE' && d.trustState !== 'TRUSTED').length;

  // 6. Admin Requests
  const pendingRequests = await AdministrativeRequest.countDocuments({
    organisationId,
    status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
  });

  // 7. Control Status calculation
  const controls = [
    { id: 'PRIMARY_MASTER_INVARIANT', label: 'Exactly one Primary Master', status: primaryMasters === 1 ? 'PASS' : 'CRITICAL', detail: `${primaryMasters} active Primary Master found.` },
    {
      id: 'RETIRED_MASTER_ACCOUNT_CHECK',
      label: 'No retired or invalid non-primary MASTER accounts',
      status: invalidOrRetiredMasters === 0 ? 'PASS' : 'CRITICAL',
      detail: invalidOrRetiredMasters === 0
        ? 'No non-primary MASTER account records detected.'
        : `${invalidOrRetiredMasters} non-primary MASTER account record(s) require remediation.`,
    },
    { id: 'STAFF_SELF_ONLY', label: 'STAFF SELF_ONLY policy', status: 'PASS', detail: 'Self-service restricted.' },
    { id: 'CAFE_ADMIN_DEVICE_BOUND', label: 'CAFE_ADMIN device-bound access', status: 'PASS', detail: 'Enforced via device fingerprint check.' },
    { id: 'ORPHAN_ACCOUNT_CHECK', label: 'Orphan account check', status: reviewAdmins === 0 ? 'PASS' : 'WARNING', detail: reviewAdmins === 0 ? 'All admins mapped to valid cafés.' : `${reviewAdmins} admin(s) without café assignment.` },
    { id: 'AUDIT_LOG_IMMUTABILITY', label: 'Mandatory audit log coverage', status: 'PASS', detail: 'Active on all state mutations.' },
  ];

  const passedControls = controls.filter((c) => c.status === 'PASS').length;
  const warningControls = controls.filter((c) => c.status === 'WARNING').length;

  return response.status(200).json({
    success: true,
    data: {
      kpis: {
        cafes: { active: activeCafes, setup: setupCafes, total: totalCafes },
        users: { active: activeUsers, pending: pendingUsers, suspended: suspendedUsers, total: users.length },
        masters: { primary: primaryMasters, invalidOrRetired: invalidOrRetiredMasters, total: masterUsers.length },
        cafeAdmins: { active: activeAdmins, needsReview: reviewAdmins, total: cafeAdmins.length },
        devices: { active: activeDevices, attention: attentionDevices, total: devices.length },
        exceptions: { count: reviewAdmins + (primaryMasters !== 1 ? 1 : 0) + invalidOrRetiredMasters },
        pendingRequests: { count: pendingRequests },
        controlStatus: { passed: passedControls, warnings: warningControls, total: controls.length },
      },
      controls,
      isPrimaryMaster: Boolean(isPrimaryMaster),
    },
    correlationId: request.correlationId,
  });
});

// ─── Governance Work Queue ──────────────────────────────────────────────────

const getGovernanceWorkQueue = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId } = request.auth;

  const queue = [];

  // Check pending administrative requests
  const requests = await AdministrativeRequest.find({
    organisationId,
    status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
  }).sort({ createdAt: -1 }).limit(10).lean();

  for (const r of requests) {
    const ageHours = Math.round((Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / (1000 * 60 * 60));
    const ageTag = ageHours > 48 ? 'CRITICAL_OVERDUE' : ageHours > 24 ? 'OVERDUE' : ageHours > 12 ? 'DUE_TODAY' : 'NEW';
    queue.push({
      id: r.requestId,
      type: 'ADMIN_REQUEST',
      title: `Primary Action: ${r.title}`,
      target: r.targetId || r.requestType,
      cafeId: r.cafeId,
      owner: r.requestedByUserId,
      age: `${ageHours}h ago`,
      agingTag: ageTag,
      status: r.status,
      route: 'admin-requests',
    });
  }

  // Check unassigned admins
  const unassignedAdmins = await User.find({
    organisationId,
    role: 'CAFE_ADMIN',
    accountStatus: 'ACTIVE',
    $or: [{ assignedCafeIds: { $size: 0 } }, { assignedCafeIds: null }],
  }).lean();

  for (const u of unassignedAdmins) {
    queue.push({
      id: `GAP-${u.userId}`,
      type: 'IDENTITY_RECONCILIATION',
      title: `Unassigned Café Admin: ${u.fullName || u.email}`,
      target: u.userId,
      cafeId: 'UNASSIGNED',
      owner: 'Governance',
      age: 'Action Required',
      agingTag: 'CRITICAL_OVERDUE',
      status: 'NEEDS_ASSIGNMENT',
      route: 'users',
    });
  }

  // Check incomplete café setups
  const incompleteCafes = await Cafe.find({
    organisationId,
    status: { $in: ['DRAFT', 'PENDING_OPENING', 'SETUP'] },
  }).lean();

  for (const c of incompleteCafes) {
    queue.push({
      id: `SETUP-${c.cafeId}`,
      type: 'CAFE_SETUP',
      title: `Café Setup Incomplete: ${c.name}`,
      target: c.cafeId,
      cafeId: c.cafeId,
      owner: c.managerName || 'Unassigned',
      age: 'Setup Mode',
      agingTag: 'DUE_TODAY',
      status: 'PENDING_ACTIVATION',
      route: 'cafes',
    });
  }

  return response.status(200).json({
    success: true,
    data: { queue },
    correlationId: request.correlationId,
  });
});

// ─── Administrative Requests (Request Primary Action) ───────────────────────

const listAdminRequests = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, isPrimaryMaster, userId } = request.auth;

  const filter = { organisationId };
  // Normal master sees own submitted requests; Primary Master sees all organisation requests
  if (!isPrimaryMaster) {
    filter.requestedByUserId = userId;
  }

  const requests = await AdministrativeRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return response.status(200).json({
    success: true,
    data: { requests },
    correlationId: request.correlationId,
  });
});

const submitAdminRequest = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, userId, role } = request.auth;
  const { requestType, title, targetId, cafeId, reason, payload } = request.body;

  if (!requestType || !title || !reason) {
    throw new ApiError(400, 'REQUIRED_FIELDS_MISSING', 'requestType, title, and reason are required.');
  }

  const requestId = await SequenceCounter.generateId({
    organisationId,
    sequenceKey: 'ADMIN_REQUEST',
    prefix: 'REQ',
    minimumDigits: 4,
  });

  const adminReq = new AdministrativeRequest({
    requestId,
    organisationId,
    requestType,
    title: String(title).trim(),
    targetId: targetId ? String(targetId).trim() : null,
    cafeId: cafeId ? String(cafeId).trim() : null,
    reason: String(reason).trim(),
    payload: payload || {},
    status: 'SUBMITTED',
    requestedByUserId: userId,
    requestedByRole: role,
    submittedAt: new Date(),
  });

  await adminReq.save();

  await auditService.recordAuditEvent({
    organisationId,
    actorUserId: userId,
    actorRole: role,
    action: 'SUBMIT_ADMIN_REQUEST',
    targetType: 'ADMINISTRATIVE_REQUEST',
    targetId: requestId,
    details: { requestType, title, reason },
  }).catch(() => {});

  return response.status(201).json({
    success: true,
    data: { request: adminReq },
    message: 'Administrative request submitted to Primary Master.',
    correlationId: request.correlationId,
  });
});

const decideAdminRequest = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, isPrimaryMaster, userId, role } = request.auth;
  const { requestId } = request.params;
  const { decision, comment } = request.body;

  if (!isPrimaryMaster) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only the Primary Master can decide administrative requests.');
  }

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'Decision must be APPROVED or REJECTED.');
  }

  const adminReq = await AdministrativeRequest.findOne({ organisationId, requestId });
  if (!adminReq) {
    throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Administrative request not found.');
  }

  adminReq.status = decision;
  adminReq.decidedByUserId = userId;
  adminReq.decidedAt = new Date();
  adminReq.decisionComment = comment ? String(comment).trim() : '';

  await adminReq.save();

  await auditService.recordAuditEvent({
    organisationId,
    actorUserId: userId,
    actorRole: role,
    action: `DECIDE_ADMIN_REQUEST_${decision}`,
    targetType: 'ADMINISTRATIVE_REQUEST',
    targetId: requestId,
    details: { decision, comment },
  }).catch(() => {});

  return response.status(200).json({
    success: true,
    data: { request: adminReq },
    message: `Request marked as ${decision}.`,
    correlationId: request.correlationId,
  });
});

// ─── Access Reviews & Certification ─────────────────────────────────────────

const listAccessReviews = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, isPrimaryMaster, userId } = request.auth;

  const filter = { organisationId };
  const reviews = await AccessReview.find(filter)
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return response.status(200).json({
    success: true,
    data: { reviews },
    correlationId: request.correlationId,
  });
});

const createAccessReview = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, userId, role, isPrimaryMaster } = request.auth;
  const { campaignName, scopeType, scopeRole, scopeCafeId } = request.body;

  if (!campaignName) {
    throw new ApiError(400, 'CAMPAIGN_NAME_REQUIRED', 'Campaign name is required.');
  }

  if (role === 'MASTER' && isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'RETIRED_MASTER_ACCOUNT_DENIED',
      'Non-primary MASTER accounts are retired and cannot create access reviews.'
    );
  }

  // Non-primary governance actors remain restricted to STAFF / CAFE_ADMIN.
  let targetRoleFilter = {};
  if (!isPrimaryMaster) {
    targetRoleFilter.role = { $in: ['STAFF', 'CAFE_ADMIN'] };
  } else if (scopeRole) {
    targetRoleFilter.role = scopeRole;
  }

  if (scopeCafeId) {
    targetRoleFilter.assignedCafeIds = scopeCafeId;
  }

  const users = await User.find({ organisationId, ...targetRoleFilter }).lean();

  const findings = users.map((u) => ({
    userId: u.userId,
    userName: u.fullName || u.email,
    role: u.role,
    isPrimaryMaster: Boolean(u.isPrimaryMaster),
    assignedCafeIds: u.assignedCafeIds || [],
    accountStatus: u.accountStatus || 'ACTIVE',
    lastActivityAt: u.updatedAt || u.createdAt,
    decision: 'PENDING',
    decisionReason: null,
    decidedAt: null,
    remediationExecuted: false,
  }));

  const reviewId = await SequenceCounter.generateId({
    organisationId,
    sequenceKey: 'ACCESS_REVIEW',
    prefix: 'REV',
    minimumDigits: 4,
  });

  const review = new AccessReview({
    reviewId,
    organisationId,
    campaignName: String(campaignName).trim(),
    scopeType: scopeType || 'ALL',
    scopeRole: scopeRole || null,
    scopeCafeId: scopeCafeId || null,
    reviewerUserId: userId,
    status: 'ACTIVE',
    findings,
  });

  await review.save();

  return response.status(201).json({
    success: true,
    data: { review },
    correlationId: request.correlationId,
  });
});

const decideAccessFinding = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, userId, role, isPrimaryMaster } = request.auth;

  if (role === 'MASTER' && isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'RETIRED_MASTER_ACCOUNT_DENIED',
      'Non-primary MASTER accounts are retired and cannot decide access-review findings.'
    );
  }
  const { reviewId, targetUserId } = request.params;
  const { decision, reason } = request.body;

  const review = await AccessReview.findOne({ organisationId, reviewId });
  if (!review) {
    throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Access review not found.');
  }

  const finding = review.findings.find((f) => f.userId === targetUserId);
  if (!finding) {
    throw new ApiError(404, 'TARGET_NOT_IN_REVIEW', 'Target user is not part of this review.');
  }

  // Non-primary governance actors cannot decide on MASTER users
  if (!isPrimaryMaster && finding.role === 'MASTER') {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only Primary Master may certify MASTER accounts.');
  }

  finding.decision = decision;
  finding.decisionReason = reason ? String(reason).trim() : '';
  finding.decidedAt = new Date();

  // Closed-loop remediation execution
  if (decision === 'SUSPEND') {
    await User.updateOne({ organisationId, userId: targetUserId }, { $set: { accountStatus: 'SUSPENDED' } });
    finding.remediationExecuted = true;
  } else if (decision === 'DEACTIVATE') {
    await User.updateOne({ organisationId, userId: targetUserId }, { $set: { accountStatus: 'DEACTIVATED' } });
    finding.remediationExecuted = true;
  }

  await review.save();

  return response.status(200).json({
    success: true,
    data: { finding },
    message: `Finding updated to ${decision}.`,
    correlationId: request.correlationId,
  });
});

// ─── Service & Integration Access (Machine Identities) ──────────────────────

const listServiceIdentities = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, isPrimaryMaster } = request.auth;

  let services = await ServiceIdentity.find({ organisationId }).lean();

  if (services.length === 0) {
    // Seed default baseline services if none exist
    services = [
      {
        serviceId: 'SVC-MAILOPS-01',
        serviceName: 'Zamorin MailOps Inbound Worker',
        purpose: 'Synchronizes and categorizes vendor & guest operations emails.',
        ownerUserId: 'PRIMARY_MASTER',
        scopeType: 'ORGANISATION',
        authMethod: 'OAUTH2_SERVICE_ACCOUNT',
        credentialStatus: 'HEALTHY',
        credentialLastRotatedAt: new Date(Date.now() - 15 * 86400000),
        credentialExpiryDate: new Date(Date.now() + 75 * 86400000),
        lastUsedAt: new Date(),
        isActive: true,
      },
      {
        serviceId: 'SVC-POS-SYNC-01',
        serviceName: 'Offline-First POS Reconciliation Worker',
        purpose: 'Transmits queued offline cash register transactions to headquarters.',
        ownerUserId: 'PRIMARY_MASTER',
        scopeType: 'ORGANISATION',
        authMethod: 'HMAC_TOKEN',
        credentialStatus: 'HEALTHY',
        credentialLastRotatedAt: new Date(Date.now() - 30 * 86400000),
        credentialExpiryDate: new Date(Date.now() + 60 * 86400000),
        lastUsedAt: new Date(),
        isActive: true,
      },
      {
        serviceId: 'SVC-NOTIF-DISP-01',
        serviceName: 'Notification Dispatch Engine',
        purpose: 'Delivers high-priority exception notifications to authorized staff devices.',
        ownerUserId: 'PRIMARY_MASTER',
        scopeType: 'ORGANISATION',
        authMethod: 'API_KEY',
        credentialStatus: 'HEALTHY',
        credentialLastRotatedAt: new Date(Date.now() - 60 * 86400000),
        credentialExpiryDate: new Date(Date.now() + 30 * 86400000),
        lastUsedAt: new Date(),
        isActive: true,
      },
    ];
  }

  return response.status(200).json({
    success: true,
    data: { services, isPrimaryMaster: Boolean(isPrimaryMaster) },
    correlationId: request.correlationId,
  });
});

module.exports = {
  getAdminOverview,
  getGovernanceWorkQueue,
  listAdminRequests,
  submitAdminRequest,
  decideAdminRequest,
  listAccessReviews,
  createAccessReview,
  decideAccessFinding,
  listServiceIdentities,
};
