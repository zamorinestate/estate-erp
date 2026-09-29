'use strict';
// In-memory implementation of every repository interface this module needs.
// Used for tests and standalone dev/preview. Every ID comparison uses
// String() wrapping so it behaves identically to the Mongo implementation
// (where IDs are ObjectId instances, not plain strings).
let seq = 0;
function nextId(prefix) { seq += 1; return `${prefix}_${seq}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function create() {
  const devices = new Map();
  const enrollmentTokens = new Map();
  const operatorCredentials = new Map(); // keyed by store id, not employeeId, so we can iterate
  const operatorAccess = new Map();
  const sessions = new Map();
  const securityEvents = [];
  const employees = new Map(); // stand-in for the real external Employee/User model
  const masters = new Map();   // stand-in for the real external Master account store

  return {
    devices: {
      async create(data) { const id = nextId('dev'); const rec = { id, ...data }; devices.set(id, rec); return rec; },
      async findById(id) { return devices.get(String(id)) || null; },
      async findByTokenHash(hash) { return [...devices.values()].find(d => d.deviceTokenHash === hash) || null; },
      async findByCafe(cafeId) { return [...devices.values()].filter(d => String(d.cafeId) === String(cafeId)); },
      async listAll() { return [...devices.values()]; },
      async update(id, patch) { const rec = devices.get(String(id)); if (!rec) return null; Object.assign(rec, patch); return rec; },
      async delete(id) { return devices.delete(String(id)); },
      async touchLastSeen(id, when) { const rec = devices.get(String(id)); if (rec) rec.lastSeenAt = when; return rec; },
    },
    enrollmentTokens: {
      async create(data) { const id = nextId('enr'); const rec = { id, ...data }; enrollmentTokens.set(id, rec); return rec; },
      async findByHash(hash) { return [...enrollmentTokens.values()].find(t => t.tokenHash === hash) || null; },
      async update(id, patch) { const rec = enrollmentTokens.get(String(id)); if (!rec) return null; Object.assign(rec, patch); return rec; },
      async issueHardwareAttestationChallenge(id, patch) {
        const rec = enrollmentTokens.get(String(id));
        if (!rec || rec.status !== 'PENDING' || new Date() > new Date(rec.expiresAt)) return null;

        const now = new Date();
        const hasActiveChallenge =
          Boolean(rec.hardwareAttestationChallengeId) &&
          !rec.hardwareAttestationChallengeConsumedAt &&
          rec.hardwareAttestationChallengeExpiresAt &&
          new Date(rec.hardwareAttestationChallengeExpiresAt) > now;

        if (hasActiveChallenge) return null;

        Object.assign(rec, patch);
        return rec;
      },
      async consumeIfPending(id, patch) {
        const rec = enrollmentTokens.get(String(id));
        if (!rec || rec.status !== 'PENDING' || new Date() > new Date(rec.expiresAt)) return null;
        Object.assign(rec, patch, { status: 'USED' });
        return rec;
      },
      async restoreIfUsedByDevice(id, deviceId, patch = {}) {
        const rec = enrollmentTokens.get(String(id));
        if (!rec || rec.status !== 'USED' || String(rec.usedByDeviceId) !== String(deviceId)) return null;
        Object.assign(rec, { status: 'PENDING', usedAt: null, usedByDeviceId: null }, patch);
        return rec;
      },
    },
    operatorCredentials: {
      async upsertForEmployee(employeeId, data) {
        let existing = [...operatorCredentials.values()].find(c => String(c.employeeId) === String(employeeId));
        if (existing) { Object.assign(existing, data); return existing; }
        const rec = { id: nextId('cred'), employeeId, ...data };
        operatorCredentials.set(rec.id, rec);
        return rec;
      },
      async findByEmployeeId(employeeId) { return [...operatorCredentials.values()].find(c => String(c.employeeId) === String(employeeId)) || null; },
      async findByLookupHash(hash) { return [...operatorCredentials.values()].find(c => c.pinLookupHash === hash) || null; },
      async isLookupHashTaken(hash, excludingEmployeeId) {
        return [...operatorCredentials.values()].some(c => c.pinLookupHash === hash && String(c.employeeId) !== String(excludingEmployeeId));
      },
    },
    operatorAccess: {
      async create(data) { const id = nextId('acc'); const rec = { id, ...data }; operatorAccess.set(id, rec); return rec; },
      async findActiveForEmployeeAndCafe(employeeId, cafeId) {
        return [...operatorAccess.values()].find(a => String(a.employeeId) === String(employeeId) && String(a.cafeId) === String(cafeId) && a.status === 'ACTIVE') || null;
      },
      async listByCafe(cafeId) { return [...operatorAccess.values()].filter(a => String(a.cafeId) === String(cafeId)); },
      async update(id, patch) { const rec = operatorAccess.get(String(id)); if (!rec) return null; Object.assign(rec, patch); return rec; },
    },
    sessions: {
      async create(data) { const id = nextId('ses'); const rec = { id, ...data }; sessions.set(id, rec); return rec; },
      async findById(id) { return sessions.get(String(id)) || null; },
      async findByTokenHash(hash) { return [...sessions.values()].find(s => s.sessionTokenHash === hash) || null; },
      async findActiveByDevice(deviceId) {
        return [...sessions.values()].find(s => String(s.deviceId) === String(deviceId) && (s.status === 'ACTIVE' || s.status === 'LOCKED')) || null;
      },
      async findAllActiveByEmployee(employeeId) {
        return [...sessions.values()].filter(s => String(s.actorEmployeeId) === String(employeeId) && (s.status === 'ACTIVE' || s.status === 'LOCKED'));
      },
      async findActiveByEmployeeExcludingDevice(employeeId, deviceId) {
        return [...sessions.values()].find(s => String(s.actorEmployeeId) === String(employeeId) && String(s.deviceId) !== String(deviceId) && (s.status === 'ACTIVE' || s.status === 'LOCKED')) || null;
      },
      async listByCafe(cafeId, filters = {}) {
        return [...sessions.values()]
          .filter(s => String(s.effectiveCafeId) === String(cafeId) && (!filters.status || s.status === filters.status))
          .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
      },
      async update(id, patch) { const rec = sessions.get(String(id)); if (!rec) return null; Object.assign(rec, patch); return rec; },
    },
    securityEvents: {
      async record(evt) { const rec = { id: nextId('evt'), createdAt: new Date(), ...evt }; securityEvents.push(rec); return rec; },
      async list(filters = {}) {
        return securityEvents.filter(e => Object.entries(filters).every(([k, v]) => !v || String(e[k]) === String(v)));
      },
    },
    // Stand-ins for external collections this module doesn't own — see
    // config/integrationRefs.js. Real deployments replace these two with
    // adapters over the actual Employee and Master account stores.
    employees: {
      async seed(emp) { employees.set(String(emp.id), emp); return emp; },
      async findById(id) { return employees.get(String(id)) || null; },
      async setActive(id, isActive) { const e = employees.get(String(id)); if (e) e.isActive = isActive; return e; },
    },
    masters: {
      async seed(m) { masters.set(String(m.id), m); return m; },
      async findById(id) { return masters.get(String(id)) || null; },
      async setActive(id, isActive) { const m = masters.get(String(id)); if (m) m.isActive = isActive; return m; },
    },
  };
}

module.exports = { create };
