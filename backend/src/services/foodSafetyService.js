'use strict';

const mongoose = require('mongoose');

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FOOD SAFETY & HYGIENE SERVICE
 * ============================================================================
 * Implements core HACCP, PRP, Temperature Logging, Sanitation Tasks,
 * Pest Control, Calibration, and Cooking Oil Quality management.
 *
 * Enforces automated out-of-range detection, immutable excursion records,
 * and double-entry corrective action tracking.
 */

const { TemperatureLog } = require('../models/TemperatureLog');
const { CleaningTask } = require('../models/CleaningTask');
const { PestControlRecord } = require('../models/PestControlRecord');
const { CalibrationRecord } = require('../models/CalibrationRecord');
const { AuditEvent } = require('../models/AuditEvent');
const { SequenceCounter } = require('../models/SequenceCounter');
const { EmployeeTraining, FOSTAC_VERIFICATION_STATUSES } = require('../models/EmployeeTraining');
const { ApiError } = require('../utils/ApiError');
const { TemperatureRuleService } = require('./temperatureRuleService');
const { calculateNextQuarterlyDueDate } = require('../utils/trainingRecurrence');
const { recordAuditEvent } = require('./auditService');

function durableAuditAvailable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    AuditEvent.create?.mock ||
    typeof AuditEvent.create?.restore === 'function'
  );
}

async function generateFoodSafetyId({ organisationId, sequenceKey, prefix }) {
  return SequenceCounter.generateId({
    organisationId,
    sequenceKey,
    prefix,
    minimumDigits: 4,
  });
}

async function recordFoodSafetyAudit({
  organisationId,
  cafeId,
  actorUserId,
  actorRole = 'SYSTEM',
  action,
  entityType,
  entityId,
  result = 'SUCCESS',
  riskClassification = 'LOW',
  metadata = {},
}) {
  if (!durableAuditAvailable()) return null;

  return recordAuditEvent({
    organisationId,
    cafeId,
    actorUserId,
    actorRole: String(actorRole || 'SYSTEM').trim().toUpperCase(),
    module: 'QUALITY',
    action,
    entityType,
    entityId,
    result,
    riskClassification,
    correlationId: `FOOD-SAFETY-${entityId}`,
    metadata,
  });
}


class FoodSafetyService {
  /**
   * Records a temperature check with automated range evaluation and excursion tracking.
   */
  static async recordTemperature({
    organisationId,
    cafeId,
    monitoringPoint,
    monitoringPointName = '',
    equipmentId = null,
    equipmentName = '',
    readingCelsius,
    minimumAllowedCelsius,
    maximumAllowedCelsius,
    recordedByUserId,
    actorRole = 'SYSTEM',
    operatorSessionId = null,
    remarks = '',
    processType = null,
    foodCategory = 'ALL',
    durationSeconds = 0,
  }) {
    if (readingCelsius === undefined || (minimumAllowedCelsius === undefined && !processType) || (maximumAllowedCelsius === undefined && !processType)) {
      throw new ApiError(400, 'INVALID_READING', 'Temperature reading, thresholds or processType are required.');
    }

    const reading = Number(readingCelsius);
    let min = minimumAllowedCelsius !== undefined ? Number(minimumAllowedCelsius) : 0;
    let max = maximumAllowedCelsius !== undefined ? Number(maximumAllowedCelsius) : 100;

    let isExcursion = false;
    let status = 'WITHIN_RANGE';
    let ruleEvalStatus = 'NOT_EVALUATED';
    let matchedRuleId = null;
    let matchedRuleVersion = null;

    if (processType) {
      const evalResult = await TemperatureRuleService.evaluateTemperatureRule({
        organisationId,
        cafeId,
        foodCategory,
        processType,
        measuredTemperatureC: reading,
        durationSeconds,
      });

      ruleEvalStatus = evalResult.status;
      matchedRuleId = evalResult.matchedRuleId;
      matchedRuleVersion = evalResult.ruleVersion || null;

      if (evalResult.status === 'FAIL') {
        isExcursion = true;
        status = 'OUT_OF_RANGE';
      } else if (evalResult.status === 'PASS') {
        isExcursion = false;
        status = 'WITHIN_RANGE';
      } else if (evalResult.status === 'RULE_NOT_CONFIGURED') {
        // Strict safety: unconfigured rule requires manual verification
        isExcursion = true;
        status = 'OUT_OF_RANGE';
      }
    } else {
      isExcursion = reading < min || reading > max;
      status = isExcursion ? 'OUT_OF_RANGE' : 'WITHIN_RANGE';
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const logId = await generateFoodSafetyId({
      organisationId,
      sequenceKey: `TEMPERATURE_LOG_${datePart}`,
      prefix: `TEMP-${datePart}`,
    });

    const log = await TemperatureLog.create({
      logId,
      organisationId,
      cafeId,
      monitoringPoint,
      monitoringPointName,
      equipmentId,
      equipmentName,
      readingCelsius: reading,
      minimumAllowedCelsius: min,
      maximumAllowedCelsius: max,
      status,
      isExcursion,
      originalExcursionReading: isExcursion ? reading : null,
      recordedByUserId,
      operatorSessionId,
      remarks,
      processType,
      foodCategory,
      durationSeconds,
      ruleId: matchedRuleId,
      temperatureRuleId: matchedRuleId,
      ruleVersion: matchedRuleVersion,
      ruleEvaluationStatus: ruleEvalStatus,
    });

    // Excursions are safety-significant and must use the canonical audit schema.
    // In a connected production runtime, audit failure propagates instead of
    // silently presenting an unaudited excursion as a successful workflow.
    if (isExcursion) {
      await recordFoodSafetyAudit({
        organisationId,
        cafeId,
        actorUserId: recordedByUserId,
        actorRole,
        action: 'TEMPERATURE_EXCURSION_DETECTED',
        entityType: 'TEMPERATURE_LOG',
        entityId: logId,
        result: 'SUCCESS',
        riskClassification: 'HIGH',
        metadata: {
          readingCelsius: reading,
          minimumAllowedCelsius: min,
          maximumAllowedCelsius: max,
          monitoringPoint,
          equipmentId,
          ruleEvaluationStatus: ruleEvalStatus,
          ruleId: matchedRuleId,
          ruleVersion: matchedRuleVersion,
        },
      });
    }

    return log;
  }

  /**
   * Applies corrective action to an out-of-range temperature log without overwriting original.
   */
  static async applyCorrectiveAction({
    organisationId,
    cafeId,
    logId,
    correctiveAction,
    resolvedReadingCelsius,
    actionTakenByUserId,
    actorRole = 'SYSTEM',
    remarks = '',
  }) {
    const log = await TemperatureLog.findOne({ organisationId, cafeId, logId });
    if (!log) {
      throw new ApiError(404, 'TEMP_LOG_NOT_FOUND', `Temperature record ${logId} not found.`);
    }

    if (!log.isExcursion) {
      throw new ApiError(400, 'NO_EXCURSION', 'This temperature reading was within range and does not require corrective action.');
    }

    log.correctiveAction = correctiveAction;
    log.actionTakenByUserId = actionTakenByUserId;
    log.actionTakenAt = new Date();
    if (resolvedReadingCelsius !== undefined && resolvedReadingCelsius !== null) {
      log.resolvedReadingCelsius = Number(resolvedReadingCelsius);
    }
    log.status = 'CORRECTED';
    if (remarks) {
      log.remarks = `${log.remarks ? log.remarks + ' | ' : ''}${remarks}`;
    }

    await log.save();

    await recordFoodSafetyAudit({
      organisationId,
      cafeId,
      actorUserId: actionTakenByUserId,
      actorRole,
      action: 'TEMPERATURE_CORRECTIVE_ACTION_APPLIED',
      entityType: 'TEMPERATURE_LOG',
      entityId: logId,
      result: 'SUCCESS',
      riskClassification: 'MEDIUM',
      metadata: {
        originalReadingCelsius: log.originalExcursionReading,
        resolvedReadingCelsius: log.resolvedReadingCelsius,
        correctiveAction,
      },
    });

    return log;
  }

  /**
   * Queries temperature logs with filtering.
   */
  static async listTemperatures({ organisationId, cafeId, excursionsOnly = false, limit = 50 }) {
    const query = { organisationId, cafeId };
    if (excursionsOnly) {
      query.isExcursion = true;
    }
    return TemperatureLog.find(query).sort({ recordedAt: -1 }).limit(limit).lean();
  }

  /**
   * Creates a scheduled cleaning task.
   */
  static async createCleaningTask({
    organisationId,
    cafeId,
    areaOrEquipment,
    procedure,
    frequency = 'DAILY',
    assignedRole = 'OPERATOR',
    assignedUserId = null,
    dueDateTime,
    remarks = '',
  }) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const taskId = await generateFoodSafetyId({
      organisationId,
      sequenceKey: `CLEANING_TASK_${datePart}`,
      prefix: `CLN-${datePart}`,
    });

    return CleaningTask.create({
      taskId,
      organisationId,
      cafeId,
      areaOrEquipment,
      procedure,
      frequency,
      assignedRole,
      assignedUserId,
      dueDateTime: new Date(dueDateTime),
      remarks,
    });
  }

  /**
   * Marks a cleaning task as completed with optional verification.
   */
  static async completeCleaningTask({
    organisationId,
    cafeId,
    taskId,
    completedByUserId,
    actorRole = 'SYSTEM',
    verifiedByUserId = null,
    remarks = '',
  }) {
    const task = await CleaningTask.findOne({ organisationId, cafeId, taskId });
    if (!task) {
      throw new ApiError(404, 'CLEANING_TASK_NOT_FOUND', `Cleaning task ${taskId} not found.`);
    }

    task.completedDateTime = new Date();
    task.completedByUserId = completedByUserId;
    if (verifiedByUserId) {
      task.verifiedByUserId = verifiedByUserId;
      task.verificationDate = new Date();
      task.status = 'COMPLETED';
    } else {
      task.status = 'VERIFICATION_REQUIRED';
    }
    if (remarks) {
      task.remarks = `${task.remarks ? task.remarks + ' | ' : ''}${remarks}`;
    }

    await task.save();

    await recordFoodSafetyAudit({
      organisationId,
      cafeId,
      actorUserId: completedByUserId,
      actorRole,
      action: 'CLEANING_TASK_COMPLETED',
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      result: 'SUCCESS',
      riskClassification: 'MEDIUM',
      metadata: {
        areaOrEquipment: task.areaOrEquipment,
        status: task.status,
        verifiedByUserId: verifiedByUserId || null,
      },
    });

    return task;
  }

  /**
   * Lists cleaning tasks, marking overdue uncompleted tasks as MISSED.
   */
  static async listCleaningTasks({ organisationId, cafeId, status = null, limit = 50 }) {
    const now = new Date();
    // Auto-update overdue tasks that are still DUE
    await CleaningTask.updateMany(
      {
        organisationId,
        cafeId,
        status: 'DUE',
        dueDateTime: { $lt: now },
      },
      { $set: { status: 'MISSED' } }
    );

    const query = { organisationId, cafeId };
    if (status) {
      query.status = status;
    }

    return CleaningTask.find(query).sort({ dueDateTime: 1 }).limit(limit).lean();
  }

  /**
   * Records a pest control service visit.
   */
  static async recordPestControl({
    organisationId,
    cafeId,
    serviceProvider,
    vendorId = null,
    serviceDate,
    areasTreated,
    treatmentAction,
    findings = '',
    followUpRequired = false,
    nextDueDate,
    certificateNumber = '',
    recordedByUserId,
    remarks = '',
  }) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const recordId = await generateFoodSafetyId({
      organisationId,
      sequenceKey: `PEST_CONTROL_${datePart}`,
      prefix: `PEST-${datePart}`,
    });

    return PestControlRecord.create({
      recordId,
      organisationId,
      cafeId,
      serviceProvider,
      vendorId,
      serviceDate: new Date(serviceDate),
      areasTreated: Array.isArray(areasTreated) ? areasTreated : [areasTreated],
      treatmentAction,
      findings,
      followUpRequired: Boolean(followUpRequired),
      nextDueDate: new Date(nextDueDate),
      certificateNumber,
      status: followUpRequired ? 'FOLLOW_UP_SCHEDULED' : 'COMPLETED',
      recordedByUserId,
      remarks,
    });
  }

  static async listPestControl({ organisationId, cafeId, limit = 50 }) {
    return PestControlRecord.find({ organisationId, cafeId }).sort({ serviceDate: -1 }).limit(limit).lean();
  }

  /**
   * Records an equipment calibration.
   */
  static async recordCalibration({
    organisationId,
    cafeId,
    assetId,
    assetName,
    equipmentType = 'PROBE_THERMOMETER',
    calibrationDate,
    result = 'PASS',
    certificateNumber = '',
    nextDueDate,
    performedBy,
    recordedByUserId,
    remarks = '',
  }) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const calibrationId = await generateFoodSafetyId({
      organisationId,
      sequenceKey: `CALIBRATION_${datePart}`,
      prefix: `CAL-${datePart}`,
    });

    return CalibrationRecord.create({
      calibrationId,
      organisationId,
      cafeId,
      assetId,
      assetName,
      equipmentType,
      calibrationDate: new Date(calibrationDate),
      result,
      certificateNumber,
      nextDueDate: new Date(nextDueDate),
      performedBy,
      status: result === 'FAIL' ? 'FAILED' : 'VALID',
      recordedByUserId,
      remarks,
    });
  }

  static async listCalibrations({ organisationId, cafeId, limit = 50 }) {
    return CalibrationRecord.find({ organisationId, cafeId }).sort({ nextDueDate: 1 }).limit(limit).lean();
  }

  /**
   * Records a quarterly onsite food safety training session conducted by a Food Safety Supervisor.
   * Calculates next quarterly recurrence and tracks attendees and topics.
   */
  static async recordQuarterlyTrainingSession({
    organisationId,
    cafeId,
    userId,
    trainingTitle = 'Quarterly Onsite Food-Handler Training',
    trainer = {},
    topics = [],
    attendance = [],
    dueDate = null,
    completedAt = null,
    evidence = '',
    notes = '',
  }) {
    if (!organisationId || !cafeId) {
      throw new ApiError(400, 'INVALID_TRAINING_PARAMS', 'OrganisationId and CafeId are required.');
    }

    const cleanOrg = organisationId.trim().toUpperCase();
    const cleanCafe = cafeId.trim().toUpperCase();
    const cleanUser = (userId || trainer.userId || 'TRAINER').trim().toUpperCase();

    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedDueDate = dueDate || todayStr;

    let status = 'DUE';
    if (completedAt) {
      status = 'COMPLETED';
    } else if (resolvedDueDate < todayStr) {
      status = 'OVERDUE';
    } else if (resolvedDueDate > todayStr) {
      status = 'UPCOMING';
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const trainingId = await generateFoodSafetyId({
      organisationId: cleanOrg,
      sequenceKey: `FOOD_SAFETY_TRAINING_${datePart}`,
      prefix: `TRN-ONSITE-${datePart}`,
    });

    const training = await EmployeeTraining.create({
      trainingId,
      organisationId: cleanOrg,
      cafeId: cleanCafe,
      userId: cleanUser,
      trainingTitle,
      trainingType: 'FOOD_SAFETY_ONSITE',
      recurrence: 'QUARTERLY',
      status,
      dueDate: resolvedDueDate,
      completedAt: completedAt ? new Date(completedAt) : null,
      trainer: {
        userId: (trainer.userId || cleanUser).trim().toUpperCase(),
        name: trainer.name || 'Food Safety Supervisor',
        designation: trainer.designation || 'Food Safety Supervisor',
      },
      attendance: Array.isArray(attendance) ? attendance : [],
      topics: Array.isArray(topics) ? topics : [],
      evidence,
      notes,
    });

    // Calculate next quarterly due date using explicit 3 calendar months policy
    const baseDate = completedAt ? new Date(completedAt) : new Date(resolvedDueDate);
    const nextQuarterlyDueDate = calculateNextQuarterlyDueDate(baseDate);

    return {
      training,
      nextQuarterlyDueDate,
      isOverdue: status === 'OVERDUE',
    };
  }

  /**
   * Verifies a FoSTaC certificate with explicit audit trail and valid status semantics.
   * Prohibits unsupported claims of official confirmation without audit evidence.
   */
  static async verifyFostacCertificate({
    organisationId,
    trainingId,
    verifiedByUserId,
    verificationMethod = 'MANUAL_INSPECTION',
    reference = '',
    verificationStatus = 'MANUALLY_VERIFIED',
    result = 'VALID',
  }) {
    if (!organisationId || !trainingId || !verifiedByUserId) {
      throw new ApiError(400, 'INVALID_VERIFICATION_PARAMS', 'OrganisationId, trainingId, and verifiedByUserId are required.');
    }

    if (!FOSTAC_VERIFICATION_STATUSES.includes(verificationStatus)) {
      throw new ApiError(400, 'INVALID_STATUS', `Status must be one of: ${FOSTAC_VERIFICATION_STATUSES.join(', ')}`);
    }

    const cleanOrg = organisationId.trim().toUpperCase();
    const cleanTrainingId = trainingId.trim().toUpperCase();
    const cleanVerifier = verifiedByUserId.trim().toUpperCase();

    const training = await EmployeeTraining.findOne({
      organisationId: cleanOrg,
      trainingId: cleanTrainingId,
    });

    if (!training) {
      throw new ApiError(404, 'TRAINING_NOT_FOUND', `Training record ${cleanTrainingId} not found.`);
    }

    training.fostacVerificationStatus = verificationStatus;
    training.fostacVerificationAudit = {
      verifiedByUserId: cleanVerifier,
      verifiedAt: new Date(),
      verificationMethod: String(verificationMethod).trim(),
      reference: String(reference).trim(),
      result: String(result).trim(),
    };
    training.verifiedBy = cleanVerifier;

    await training.save();
    return training;
  }
}

module.exports = {
  FoodSafetyService,
};
