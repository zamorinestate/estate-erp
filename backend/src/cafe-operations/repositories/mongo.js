'use strict';
const models = require('../models');

function toPlain(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject({ virtuals: false }) : doc;
  obj.id = String(obj._id);
  return obj;
}
function toPlainList(docs) { return docs.map(toPlain); }

function create() {
  return {
    devices: {
      async create(data) { return toPlain(await models.Device.create(data)); },
      async findById(id) { return toPlain(await models.Device.findById(id)); },
      async findByTokenHash(hash) { return toPlain(await models.Device.findOne({ deviceTokenHash: hash }).select('+deviceTokenHash')); },
      async findByCafe(cafeId) { return toPlainList(await models.Device.find({ cafeId })); },
      async listAll() { return toPlainList(await models.Device.find({})); },
      async update(id, patch) { return toPlain(await models.Device.findByIdAndUpdate(id, patch, { new: true })); },
      async delete(id) { return toPlain(await models.Device.findByIdAndDelete(id)); },
      async touchLastSeen(id, when) { return toPlain(await models.Device.findByIdAndUpdate(id, { lastSeenAt: when }, { new: true })); },
    },
    enrollmentTokens: {
      async create(data) { return toPlain(await models.DeviceEnrollmentToken.create(data)); },
      async findByHash(hash) {
        return toPlain(await models.DeviceEnrollmentToken.findOne({ tokenHash: hash })
          .select('+tokenHash +hardwareAttestationChallengeHash'));
      },
      async update(id, patch) { return toPlain(await models.DeviceEnrollmentToken.findByIdAndUpdate(id, patch, { new: true })); },
      async issueHardwareAttestationChallenge(id, patch) {
        const now = new Date();
        return toPlain(await models.DeviceEnrollmentToken.findOneAndUpdate(
          {
            _id: id,
            status: 'PENDING',
            expiresAt: { $gt: now },
            $or: [
              { hardwareAttestationChallengeId: null },
              { hardwareAttestationChallengeId: { $exists: false } },
              { hardwareAttestationChallengeConsumedAt: { $ne: null } },
              { hardwareAttestationChallengeExpiresAt: { $lte: now } },
              { hardwareAttestationChallengeExpiresAt: null },
            ],
          },
          { $set: patch },
          { new: true }
        ).select('+hardwareAttestationChallengeHash'));
      },
      async consumeIfPending(id, patch) {
        return toPlain(await models.DeviceEnrollmentToken.findOneAndUpdate(
          { _id: id, status: 'PENDING', expiresAt: { $gt: new Date() } },
          { $set: { ...patch, status: 'USED' } },
          { new: true }
        ));
      },
      async restoreIfUsedByDevice(id, deviceId, patch = {}) {
        return toPlain(await models.DeviceEnrollmentToken.findOneAndUpdate(
          { _id: id, status: 'USED', usedByDeviceId: deviceId },
          { $set: { ...patch, status: 'PENDING', usedAt: null, usedByDeviceId: null } },
          { new: true }
        ));
      },
    },
    operatorCredentials: {
      async upsertForEmployee(employeeId, data) {
        return toPlain(await models.OperatorCredential.findOneAndUpdate(
          { employeeId }, data, { new: true, upsert: true, setDefaultsOnInsert: true }
        ));
      },
      async findByEmployeeId(employeeId) { return toPlain(await models.OperatorCredential.findOne({ employeeId }).select('+pinHash +pinLookupHash')); },
      async findByLookupHash(hash) { return toPlain(await models.OperatorCredential.findOne({ pinLookupHash: hash }).select('+pinHash +pinLookupHash')); },
      async isLookupHashTaken(hash, excludingEmployeeId) {
        const found = await models.OperatorCredential.findOne({ pinLookupHash: hash, employeeId: { $ne: excludingEmployeeId } }).select('_id');
        return !!found;
      },
    },
    operatorAccess: {
      async create(data) { return toPlain(await models.OperatorAccess.create(data)); },
      async findActiveForEmployeeAndCafe(employeeId, cafeId) {
        return toPlain(await models.OperatorAccess.findOne({ employeeId, cafeId, status: 'ACTIVE' }));
      },
      async listByCafe(cafeId) { return toPlainList(await models.OperatorAccess.find({ cafeId })); },
      async update(id, patch) { return toPlain(await models.OperatorAccess.findByIdAndUpdate(id, patch, { new: true })); },
    },
    sessions: {
      async create(data) { return toPlain(await models.Session.create(data)); },
      async findById(id) { return toPlain(await models.Session.findById(id)); },
      async findByTokenHash(hash) { return toPlain(await models.Session.findOne({ sessionTokenHash: hash }).select('+sessionTokenHash')); },
      async findActiveByDevice(deviceId) { return toPlain(await models.Session.findOne({ deviceId, status: { $in: ['ACTIVE', 'LOCKED'] } })); },
      async findAllActiveByEmployee(employeeId) { return toPlainList(await models.Session.find({ actorEmployeeId: employeeId, status: { $in: ['ACTIVE', 'LOCKED'] } })); },
      async findActiveByEmployeeExcludingDevice(employeeId, deviceId) {
        return toPlain(await models.Session.findOne({ actorEmployeeId: employeeId, deviceId: { $ne: deviceId }, status: { $in: ['ACTIVE', 'LOCKED'] } }));
      },
      async listByCafe(cafeId, filters = {}) {
        const q = { effectiveCafeId: cafeId };
        if (filters.status) q.status = filters.status;
        return toPlainList(await models.Session.find(q).sort({ startedAt: -1 }));
      },
      async update(id, patch) { return toPlain(await models.Session.findByIdAndUpdate(id, patch, { new: true })); },
    },
    securityEvents: {
      async record(evt) { return toPlain(await models.SecurityEvent.create(evt)); },
      async list(filters = {}) { return toPlainList(await models.SecurityEvent.find(filters).sort({ createdAt: -1 }).limit(500)); },
    },
    employees: {
      async findById(id) {
        const Model = models.getExternalEmployeeModel();
        if (!Model) return null;
        let doc = null;
        if (require('mongoose').Types.ObjectId.isValid(id)) {
          doc = await Model.findById(id).lean();
        }
        if (!doc) {
          doc = await Model.findOne({ userId: id }).lean();
        }
        if (!doc) return null;
        const isActive = doc.accountStatus ? doc.accountStatus === 'ACTIVE' : (doc.status ? doc.status === 'ACTIVE' : true);
        return {
          id: String(doc.userId || doc._id),
          organisationId: String(doc.organisationId || ''),
          status: isActive ? 'ACTIVE' : 'INACTIVE',
          displayName: doc.fullName || doc.name || doc.displayName || 'Unknown',
        };
      },
    },
    masters: {
      // INTEGRATION SEAM — this module has no real Master account store.
      // A real integration typically won't need this repository at all:
      // masterAuthAdapter.js talks to your existing Master auth endpoints
      // directly rather than reading a local collection. Kept here only so
      // the interface shape matches the memory implementation.
      async findById() { throw new Error('Master account lookup is not backed by a local model — see services/masterAuthAdapter.js'); },
    },
  };
}

module.exports = { create };
