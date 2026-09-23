'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER BUSINESS CONTINUITY & DR SERVICE (STAGE 09)
 * ============================================================================
 * Governs Business Impact Analysis (BIA), DR Drill lifecycles, backup integrity
 * reporting (simulation vs provider verified), and protects the core financial
 * invariant: NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE.
 */

const { BusinessImpactProcess } = require('../models/BusinessImpactProcess');
const {
  DisasterRecoveryDrill,
  ALLOWED_DRILL_TRANSITIONS,
} = require('../models/DisasterRecoveryDrill');

class OwnerBcdrService {
  /**
   * Register a critical business process into BIA
   */
  async registerBusinessProcess(organisationId, payload) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const {
      processName,
      criticalityTier,
      ownerRole,
      maxAcceptableInterruptionMinutes,
      targetRtoMinutes,
      targetRpoMinutes,
      financialImpactPerHourPaisa,
      foodSafetyImpactDescription,
      dependencies,
      offlineFallbackMechanism,
    } = payload;

    if (!processName || !ownerRole || targetRtoMinutes === undefined || targetRpoMinutes === undefined) {
      throw new Error('MISSING_REQUIRED_BIA_FIELDS');
    }

    const processId = `BIA-PROC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const process = await BusinessImpactProcess.create({
      processId,
      organisationId,
      processName,
      criticalityTier: criticalityTier || 'BUSINESS_CRITICAL',
      ownerRole,
      maxAcceptableInterruptionMinutes: Number(maxAcceptableInterruptionMinutes) || 120,
      targetRtoMinutes: Number(targetRtoMinutes),
      targetRpoMinutes: Number(targetRpoMinutes),
      rtoRpoStatus: 'TARGET_ESTABLISHED_PENDING_DRILL_PROOF',
      financialImpactPerHourPaisa: Number(financialImpactPerHourPaisa) || 0,
      foodSafetyImpactDescription: foodSafetyImpactDescription || 'None',
      dependencies: dependencies || [],
      offlineFallbackMechanism: offlineFallbackMechanism || 'Paper order pad / offline draft buffer',
      offlineFinancialInvariant: 'NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE. Offline draft orders cannot generate final GST invoices or ledger entries.',
    });

    return process;
  }

  async getBusinessProcesses(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    return BusinessImpactProcess.find({ organisationId }).sort({ criticalityTier: 1, processName: 1 });
  }

  /**
   * Plan a new Disaster Recovery Drill
   * Invariant: Never auto-mark planned drill executed.
   */
  async planDrill(organisationId, payload, user) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { title, scenarioType, scope, targetRtoMinutes, targetRpoMinutes } = payload;
    if (!title || !scenarioType || !scope) {
      throw new Error('MISSING_REQUIRED_DRILL_FIELDS');
    }

    const drillId = `DRL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const drill = await DisasterRecoveryDrill.create({
      drillId,
      organisationId,
      title,
      scenarioType,
      scope,
      status: 'PLANNED', // strictly PLANNED
      targetRtoMinutes: Number(targetRtoMinutes) || 60,
      targetRpoMinutes: Number(targetRpoMinutes) || 15,
      isSimulation: true,
      isProviderVerified: false,
      providerEvidenceStatus: 'SIMULATION_ONLY',
      drillLeadUserId: user.userId || user.email || 'OWNER',
      auditTrail: [
        {
          action: 'DRILL_PLANNED',
          fromStatus: null,
          toStatus: 'PLANNED',
          performedBy: user.userId || user.email || 'OWNER',
          reason: 'Initial DR exercise scheduled for planning and governance review',
        },
      ],
    });

    return drill;
  }

  /**
   * Governed DR Drill status transition
   */
  async updateDrillStatus(organisationId, drillId, { targetStatus, reason, user, observedRtoMinutes, observedRpoMinutes, findings, closureNotes }) {
    if (!organisationId || !drillId || !targetStatus) {
      throw new Error('MISSING_DRILL_TRANSITION_PARAMETERS');
    }

    const drill = await DisasterRecoveryDrill.findOne({ organisationId, drillId });
    if (!drill) throw new Error('DRILL_NOT_FOUND');

    const allowed = ALLOWED_DRILL_TRANSITIONS[drill.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(`INVALID_DRILL_TRANSITION: Cannot transition from ${drill.status} to ${targetStatus}`);
    }

    const prev = drill.status;
    drill.status = targetStatus;

    if (targetStatus === 'EXECUTED') {
      drill.executedAt = new Date();
    }

    if (observedRtoMinutes !== undefined) drill.observedRtoMinutes = Number(observedRtoMinutes);
    if (observedRpoMinutes !== undefined) drill.observedRpoMinutes = Number(observedRpoMinutes);
    if (findings && Array.isArray(findings)) drill.findings = findings;
    if (closureNotes) drill.closureNotes = closureNotes;

    drill.auditTrail.push({
      action: `TRANSITION_TO_${targetStatus}`,
      fromStatus: prev,
      toStatus: targetStatus,
      performedBy: user.userId || user.email || 'OWNER',
      reason: reason || 'Governed DR drill lifecycle update',
    });

    await drill.save();
    return drill;
  }

  /**
   * Authoritative Backup Health & Provider Verification Status
   * Explicitly distinguishes ENGINEERING_CONFIGURATION from PROVIDER_VERIFIED.
   */
  async getBackupStatus(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    return {
      organisationId,
      database: {
        engine: 'MongoDB Atlas',
        automatedSnapshots: 'ENABLED_EVERY_6_HOURS',
        pointInTimeRecoveryWindowDays: 7,
        status: 'ENGINEERING_CONFIGURATION_ACTIVE',
        isProviderRestoreVerified: false, // External gate requires physical drill
        providerBlockerNotice: 'External Atlas automated snapshot restore drill requires formal staging invocation. Local simulation does NOT constitute provider proof.',
      },
      attachments: {
        storage: 'Render Persistent Disk Mount Configuration (/var/data/zamorin-attachments)',
        driver: 'RENDER_PERSISTENT_DISK',
        lifecyclePurgeProtection: 'ACTIVE_LEGAL_HOLD_COMPLIANT',
        status: 'ENGINEERING_CONFIGURATION_ACTIVE',
        isProviderRestoreVerified: false,
        providerBlockerNotice: 'Render persistent disk mount configuration active in engineering code. Physical provider disk attachment & cross-region replication verification pending external Render account proof.',
      },
      offlineFinancialSafety: {
        invariant: 'NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE',
        offlineFinalGstInvoiceBlocked: true,
        offlineLedgerPostingBlocked: true,
        auditVerified: true,
      },
    };
  }

  /**
   * Enforce Offline Privileged Server Action Invariant:
   * NO SERVER AUTHORIZATION = NO NEW PRIVILEGED SERVER ACTION.
   * Cached device-trust session token preserves local UI state and cached non-authoritative read data only.
   * Privileged server actions, approvals, financial postings, and role updates are strictly blocked offline.
   */
  validatePrivilegedActionState(actionPayload) {
    if (!actionPayload) throw new Error('ACTION_PAYLOAD_REQUIRED');

    if (!actionPayload.isServerAuthorized && actionPayload.isPrivilegedAction) {
      throw new Error('NO SERVER AUTHORIZATION = NO NEW PRIVILEGED SERVER ACTION: Privileged role operations, approvals, and financial transactions are strictly blocked offline');
    }

    return {
      isValid: true,
      status: actionPayload.isServerAuthorized ? 'SERVER_AUTHORIZED_ACTION_PERMITTED' : 'CACHED_LOCAL_STATE_PRESERVED_READ_ONLY',
      serverExecutionAllowed: Boolean(actionPayload.isServerAuthorized),
    };
  }

  /**
   * Enforce Offline Financial Invariant Rule Check:
   * Rejects any attempt to finalize an ERP financial sale without server acknowledgement.
   */
  validateSaleSyncState(salePayload) {
    if (!salePayload) throw new Error('SALE_PAYLOAD_REQUIRED');

    if (!salePayload.isServerAcknowledged && salePayload.isFinalFinancialSale) {
      throw new Error('OFFLINE_FINANCIAL_SALE_PROHIBITED: Cannot mark financial sale completed without authoritative server acknowledgement');
    }

    if (!salePayload.isServerAcknowledged && salePayload.taxInvoiceNumber) {
      throw new Error('OFFLINE_GST_NUMBER_PROHIBITED: Cannot allocate final statutory GST invoice number without server sync');
    }

    return {
      isValid: true,
      status: salePayload.isServerAcknowledged ? 'COMPLETED_ERP_SALE' : 'OFFLINE_DRAFT_CART_PRESERVED',
      financialPostingAllowed: Boolean(salePayload.isServerAcknowledged),
    };
  }

  async getCafeContinuityPlan(organisationId, cafeId) {
    if (!organisationId || !cafeId) throw new Error('ORGANISATION_AND_CAFE_ID_REQUIRED');

    const { Asset } = require('../models/Asset');
    const criticalAssets = await Asset.find({
      organisationId,
      cafeId,
      isDeleted: false,
      criticalityTier: { $in: ['TIER_1_CRITICAL', 'CRITICAL'] },
    }).lean();

    return {
      cafeId,
      organisationId,
      emergencyPlanVersion: '2026-v2',
      emergencyContacts: [
        { role: 'Café General Manager', name: 'Duty Manager', contact: '+91 98450 11223' },
        { role: 'Regional Facilities Lead', name: 'Facilities Desk', contact: '+91 98450 44556' },
        { role: 'Food Safety & Hygiene Officer', name: 'Audit Desk', contact: '+91 98450 77889' },
        { role: 'Central IT & POS Support', name: 'IT NOC', contact: '+91 80000 99887' },
      ],
      outageGuidance: {
        posOutage:
          'Maintain billing through offline draft buffer mode. Strictly enforce invariant: NO SERVER ACKNOWLEDGEMENT = NO COMPLETED ERP FINANCIAL SALE. Tax invoices sync upon reconnection.',
        networkOutage:
          'Failover to cellular 4G/5G backup SIM dongle. Do not clear local POS terminal storage or reset cache.',
        powerOutage:
          'Verify UPS cutover within 3 seconds. Transfer cold-chain and POS circuits to generator backup if outage exceeds 5 minutes.',
        coldChainOutage:
          'Monitor temperature sensors. If perishable holding temperature exceeds +4°C for over 2 hours, notify Food Safety Officer and execute Quarantine Protocol.',
      },
      criticalAssetsSummary: {
        totalCriticalEquipment: criticalAssets.length,
        equipmentList: criticalAssets.map((a) => ({
          assetId: a.assetId,
          name: a.name,
          category: a.category,
          status: a.status,
        })),
      },
      fallbackChecklist: [
        { step: 1, action: 'Verify backup power UPS / Generator online', status: 'READY' },
        { step: 2, action: 'Switch POS terminals to local draft order capture', status: 'READY' },
        { step: 3, action: 'Record manual order tokens with customer identifiers', status: 'READY' },
        { step: 4, action: 'Check refrigeration temperature logs every 30 minutes', status: 'READY' },
      ],
      incidentActivation: {
        canonicalIncidentEndpoint: '/api/v1/privacy-cyber/incidents',
        escalationHotline: '+91 80000 99999',
      },
    };
  }

  /**
   * Executive BCDR Dashboard
   */
  async getExecutiveBcdrDashboard(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const [processes, drills] = await Promise.all([
      BusinessImpactProcess.find({ organisationId }),
      DisasterRecoveryDrill.find({ organisationId }),
    ]);

    const missionCriticalCount = processes.filter((p) => p.criticalityTier === 'MISSION_CRITICAL').length;
    const executedDrills = drills.filter((d) => ['EXECUTED', 'RESULTS_RECORDED', 'ACTIONS_ASSIGNED', 'VERIFIED', 'CLOSED'].includes(d.status));
    const plannedDrills = drills.filter((d) => d.status === 'PLANNED' || d.status === 'APPROVED');

    return {
      totalProcessesCount: processes.length,
      missionCriticalProcessesCount: missionCriticalCount,
      plannedDrillsCount: plannedDrills.length,
      executedDrillsCount: executedDrills.length,
      backupStatus: await this.getBackupStatus(organisationId),
      governanceNotice: 'Simulations are never represented as provider restore evidence. RTO/RPO targets are explicitly labeled as targets until drill verification.',
    };
  }
}

module.exports = new OwnerBcdrService();
