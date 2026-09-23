'use strict';

const crypto = require('crypto');
const { StandardOperatingProcedure } = require('../models/StandardOperatingProcedure');
const { SopAcknowledgement } = require('../models/SopAcknowledgement');
const { TrainingCourse } = require('../models/TrainingCourse');
const { EmployeeCompetency } = require('../models/EmployeeCompetency');
const { EmployeeTraining } = require('../models/EmployeeTraining');
const { auditService } = require('./auditService');

class OwnerAcademyService {
  static get SOP_VALID_TRANSITIONS() {
    return {
      DRAFT: ['REVIEW'],
      REVIEW: ['APPROVED', 'DRAFT'],
      APPROVED: ['EFFECTIVE', 'REVIEW'],
      EFFECTIVE: ['SUPERSEDED', 'RETIRED'],
      SUPERSEDED: [],
      RETIRED: [],
    };
  }

  // ── 1. SOP MANAGEMENT & IMMUTABLE VERSIONING ─────────────────────────────

  async createSop(organisationId, data, auth) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.sopId || !data.title || !data.content) {
      throw new Error('Missing mandatory SOP fields (sopId, title, content)');
    }

    const checksum = crypto.createHash('sha256').update(data.content).digest('hex');

    const sop = new StandardOperatingProcedure({
      ...data,
      organisationId,
      version: 1,
      status: 'DRAFT',
      ownerUserId: auth?.userId || 'OWNER',
      versionLineage: [
        {
          version: 1,
          status: 'DRAFT',
          approvedByUserId: null,
          effectiveDate: null,
          changeSummary: data.changeSummary || 'Initial Draft Creation',
          contentSnapshot: data.content,
          checksum,
        },
      ],
    });

    await sop.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: auth?.userId || 'SYSTEM',
        action: 'SOP_DRAFT_CREATED',
        organisationId,
        details: { sopId: sop.sopId, title: sop.title, domain: sop.domain },
      }).catch(() => {});
    }

    return sop;
  }

  async getSops(organisationId, filters = {}) {
    const query = { organisationId, isDeleted: false };
    if (filters.domain) query.domain = filters.domain;
    if (filters.status) query.status = filters.status;
    if (filters.role) query.applicableRoles = filters.role;

    return StandardOperatingProcedure.find(query).sort({ updatedAt: -1 });
  }

  async transitionSopStatus(organisationId, sopId, newStatus, auth) {
    const sop = await StandardOperatingProcedure.findOne({ organisationId, sopId, isDeleted: false });
    if (!sop) throw new Error('SOP not found');

    const allowed = OwnerAcademyService.SOP_VALID_TRANSITIONS[sop.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Illegal SOP status transition from ${sop.status} to ${newStatus}`);
    }

    const prevStatus = sop.status;
    sop.status = newStatus;

    if (newStatus === 'APPROVED') {
      sop.approverUserId = auth?.userId || 'OWNER';
    } else if (newStatus === 'EFFECTIVE') {
      sop.effectiveDate = new Date();
      // Update lineage for current version
      const currentLineage = sop.versionLineage.find((l) => l.version === sop.version);
      if (currentLineage) {
        currentLineage.status = 'EFFECTIVE';
        currentLineage.effectiveDate = sop.effectiveDate;
        currentLineage.approvedByUserId = sop.approverUserId;
      }
    }

    await sop.save();

    if (auditService && auditService.recordEvent) {
      await auditService.recordEvent({
        actorId: auth?.userId || 'SYSTEM',
        action: 'SOP_STATUS_TRANSITIONED',
        organisationId,
        details: { sopId, prevStatus, newStatus, version: sop.version },
      }).catch(() => {});
    }

    return sop;
  }

  /**
   * Amends an effective SOP by creating a new version (e.g. v1 -> v2)
   * Preserves historical version in versionLineage without overwriting.
   */
  async amendSop(organisationId, sopId, updateData, auth) {
    const sop = await StandardOperatingProcedure.findOne({ organisationId, sopId, isDeleted: false });
    if (!sop) throw new Error('SOP not found');

    if (sop.status !== 'EFFECTIVE') {
      throw new Error('Only currently EFFECTIVE SOPs can be amended into a new version');
    }

    const previousVersion = sop.version;
    const newVersion = previousVersion + 1;
    const newContent = updateData.content || sop.content;
    const checksum = crypto.createHash('sha256').update(newContent).digest('hex');

    // Archive current effective version into lineage
    sop.supersededDate = new Date();
    sop.version = newVersion;
    sop.status = 'DRAFT'; // New version starts as DRAFT for review
    sop.title = updateData.title || sop.title;
    sop.content = newContent;
    sop.changeSummary = updateData.changeSummary || `Amended to version ${newVersion}`;
    sop.effectiveDate = null;
    sop.approverUserId = null;

    sop.versionLineage.push({
      version: newVersion,
      status: 'DRAFT',
      changeSummary: sop.changeSummary,
      contentSnapshot: newContent,
      checksum,
    });

    await sop.save();

    return {
      sop,
      previousVersion,
      newVersion,
      reacknowledgementRequired: sop.isAcknowledgementRequired,
      affectedRoles: sop.applicableRoles,
    };
  }

  // ── 2. SOP ACKNOWLEDGEMENTS (VERSION SPECIFIC) ───────────────────────────

  async assignSopAcknowledgements(organisationId, sopId, version, targetUsers = [], dueDate = null) {
    const sop = await StandardOperatingProcedure.findOne({ organisationId, sopId, isDeleted: false });
    if (!sop) throw new Error('SOP not found');

    const due = dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 86400000);
    const created = [];

    for (const u of targetUsers) {
      try {
        const ack = await SopAcknowledgement.findOneAndUpdate(
          { organisationId, sopId, sopVersion: version, userId: u.userId },
          {
            $setOnInsert: {
              userName: u.name || '',
              role: u.role || 'STAFF',
              cafeId: u.cafeId || null,
              assignedAt: new Date(),
              dueDate: due,
              status: 'ASSIGNED',
            },
          },
          { upsert: true, new: true }
        );
        created.push(ack);
      } catch (err) {
        // Skip duplicate
      }
    }

    return created;
  }

  async recordAcknowledgement(organisationId, sopId, sopVersion, userId) {
    const ack = await SopAcknowledgement.findOne({
      organisationId,
      sopId,
      sopVersion: Number(sopVersion),
      userId,
    });

    if (!ack) {
      throw new Error(`Acknowledgement record not found for SOP ${sopId} version ${sopVersion}`);
    }

    ack.readAt = ack.readAt || new Date();
    ack.acknowledgedAt = new Date();
    ack.status = 'ACKNOWLEDGED';
    await ack.save();

    return ack;
  }

  // ── 3. TRAINING & COMPETENCY (ATTENDANCE != COMPETENCY) ───────────────────

  async createCourse(organisationId, data, auth) {
    if (!organisationId) throw new Error('organisationId is required');
    if (!data.courseId || !data.title) {
      throw new Error('courseId and title are required');
    }

    const course = new TrainingCourse({
      ...data,
      organisationId,
      fostacProcedureDate: data.isFostacLinked ? '2026-08-05' : null,
    });

    await course.save();
    return course;
  }

  async getCourses(organisationId) {
    return TrainingCourse.find({ organisationId, isActive: true }).sort({ title: 1 });
  }

  /**
   * Recording attendance only marks ATTENDED.
   * Defensively enforces: isCompetent = false. Attendance != Competency.
   */
  async recordTrainingAttendance(organisationId, userId, competencyId, data = {}) {
    let comp = await EmployeeCompetency.findOne({ organisationId, userId, competencyId });
    if (!comp) {
      comp = new EmployeeCompetency({
        organisationId,
        userId,
        competencyId,
        skillName: data.skillName || competencyId,
        domain: data.domain || 'OPERATIONS',
      });
    }

    comp.status = 'ATTENDED';
    comp.isCompetent = false; // Strictly false on attendance alone
    await comp.save();

    return comp;
  }

  /**
   * Formal competency assessment: Requires assessment score and formal evidence.
   */
  async assessCompetency(organisationId, userId, competencyId, assessmentData, assessor) {
    let comp = await EmployeeCompetency.findOne({ organisationId, userId, competencyId });
    if (!comp) {
      comp = new EmployeeCompetency({
        organisationId,
        userId,
        competencyId,
        skillName: assessmentData.skillName || competencyId,
      });
    }

    const score = Number(assessmentData.score);
    const passThreshold = assessmentData.passThreshold || comp.passThreshold || 80;
    const isPass = score >= passThreshold;

    comp.score = score;
    comp.passThreshold = passThreshold;
    comp.assessedByUserId = assessor?.userId || 'EXAMINER';
    comp.assessedAt = new Date();
    comp.evidenceType = assessmentData.evidenceType || 'ASSESSMENT_PASSED';
    comp.assessmentNotes = assessmentData.assessmentNotes || '';

    if (isPass) {
      comp.status = 'COMPETENT';
      comp.isCompetent = true;
      comp.validUntil = new Date(Date.now() + 365 * 86400000);
    } else {
      comp.status = 'NEEDS_RETRAINING';
      comp.isCompetent = false;
    }

    await comp.save();
    return comp;
  }

  // ── 4. EXECUTIVE ACADEMY SUMMARY ──────────────────────────────────────────

  async getAcademySummary(organisationId) {
    const sops = await StandardOperatingProcedure.find({ organisationId, isDeleted: false });
    const effectiveSopsCount = sops.filter((s) => s.status === 'EFFECTIVE').length;

    const allAcks = await SopAcknowledgement.find({ organisationId });
    const acknowledgedCount = allAcks.filter((a) => a.status === 'ACKNOWLEDGED').length;
    const acknowledgementRate =
      allAcks.length > 0 ? Math.round((acknowledgedCount / allAcks.length) * 100) : 100;

    // Reuse FoSTaC records from Stage 01 (EmployeeTraining where trainingType === 'FOSTAC')
    const fostacRecords = await EmployeeTraining.find({
      organisationId,
      trainingType: 'FOSTAC',
      trainingStatus: 'COMPLETED',
    });

    const competencies = await EmployeeCompetency.find({ organisationId });
    const competentCount = competencies.filter((c) => c.isCompetent).length;
    const needsRetrainingCount = competencies.filter((c) => c.status === 'NEEDS_RETRAINING').length;

    return {
      totalSopsCount: sops.length,
      effectiveSopsCount,
      totalAcknowledgementsTracked: allAcks.length,
      acknowledgementRatePercent: acknowledgementRate,
      fostacCertifiedCount: fostacRecords.length,
      fostacGoverningProcedureDate: '2026-08-05',
      competentPersonnelCount: competentCount,
      needsRetrainingCount,
    };
  }
}

const ownerAcademyService = new OwnerAcademyService();

module.exports = {
  OwnerAcademyService,
  ownerAcademyService,
};
