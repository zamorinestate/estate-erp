'use strict';

const { ownerAcademyService } = require('../services/ownerAcademyService');

function getAuth(req) {
  return req.auth || req.user || req.authenticatedUser || {};
}

async function getAcademySummary(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const summary = await ownerAcademyService.getAcademySummary(organisationId);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── SOPs ────────────────────────────────────────────────────────────────────

async function createSop(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const sop = await ownerAcademyService.createSop(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: sop });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function listSops(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const sops = await ownerAcademyService.getSops(organisationId, req.query);
    return res.status(200).json({ success: true, data: sops });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function transitionSopStatus(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { sopId } = req.params;
    const { status } = req.body;
    const sop = await ownerAcademyService.transitionSopStatus(organisationId, sopId, status, auth);
    return res.status(200).json({ success: true, data: sop });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function amendSop(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { sopId } = req.params;
    const result = await ownerAcademyService.amendSop(organisationId, sopId, req.body, auth);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Acknowledgements ────────────────────────────────────────────────────────

async function assignSopAcknowledgements(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { sopId } = req.params;
    const { version, targetUsers, dueDate } = req.body;
    const created = await ownerAcademyService.assignSopAcknowledgements(
      organisationId,
      sopId,
      version,
      targetUsers,
      dueDate
    );
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function recordAcknowledgement(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { sopId } = req.params;
    const { version, userId } = req.body;
    const targetUserId = userId || auth.userId;
    const ack = await ownerAcademyService.recordAcknowledgement(organisationId, sopId, version, targetUserId);
    return res.status(200).json({ success: true, data: ack });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

// ── Training & Competency ───────────────────────────────────────────────────

async function createCourse(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const course = await ownerAcademyService.createCourse(organisationId, req.body, auth);
    return res.status(201).json({ success: true, data: course });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function listCourses(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const courses = await ownerAcademyService.getCourses(organisationId);
    return res.status(200).json({ success: true, data: courses });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function recordTrainingAttendance(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { userId, competencyId } = req.params;
    const comp = await ownerAcademyService.recordTrainingAttendance(organisationId, userId, competencyId, req.body);
    return res.status(200).json({ success: true, data: comp });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

async function assessCompetency(req, res) {
  try {
    const auth = getAuth(req);
    const organisationId = auth.organisationId;
    const { userId, competencyId } = req.params;
    const comp = await ownerAcademyService.assessCompetency(organisationId, userId, competencyId, req.body, auth);
    return res.status(200).json({ success: true, data: comp });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAcademySummary,
  createSop,
  listSops,
  transitionSopStatus,
  amendSop,
  assignSopAcknowledgements,
  recordAcknowledgement,
  createCourse,
  listCourses,
  recordTrainingAttendance,
  assessCompetency,
};
