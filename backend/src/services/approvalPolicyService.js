'use strict';

const { ApprovalPolicy } = require('../models/ApprovalPolicy');
const { ApiError } = require('../utils/ApiError');

// Canonical default limits in paisa
const DEFAULT_LIMITS = {
  STAFF: 0,
  CAFE_ADMIN: 5000000, // ₹50,000
  REGIONAL_MANAGER: 20000000, // ₹2,00,000
  OWNER: 50000000, // ₹5,00,000
  MASTER: null, // Unlimited
};

class ApprovalPolicyService {
  /**
   * Resolves the active approval policy threshold.
   */
  static async getEffectiveLimit({
    organisationId,
    cafeId = null,
    workflowType = 'GENERAL',
    role,
    asOfDate = new Date(),
  }) {
    const normRole = String(role || '').trim().toUpperCase();
    if (normRole === 'MASTER') return null; // Unlimited

    // 1. Check for cafe-specific policy first
    let policy = null;
    if (cafeId) {
      policy = await ApprovalPolicy.findOne({
        organisationId,
        cafeId,
        workflowType: { $in: [workflowType, 'GENERAL'] },
        role: normRole,
        effectiveFrom: { $lte: asOfDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOfDate } }],
      })
        .sort({ effectiveFrom: -1 })
        .lean();
    }

    // 2. Check for organisation-wide policy
    if (!policy) {
      policy = await ApprovalPolicy.findOne({
        organisationId,
        cafeId: null,
        workflowType: { $in: [workflowType, 'GENERAL'] },
        role: normRole,
        effectiveFrom: { $lte: asOfDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOfDate } }],
      })
        .sort({ effectiveFrom: -1 })
        .lean();
    }

    if (policy && policy.maxAmountPaisa !== undefined) {
      return policy.maxAmountPaisa;
    }

    // 3. Fallback to canonical default
    return Object.prototype.hasOwnProperty.call(DEFAULT_LIMITS, normRole)
      ? DEFAULT_LIMITS[normRole]
      : 0;
  }

  /**
   * Verifies whether an approval amount is authorized for the given role.
   */
  static async assertAuthorizedAmount({
    organisationId,
    cafeId = null,
    workflowType = 'GENERAL',
    role,
    amountPaisa,
    asOfDate = new Date(),
  }) {
    const normRole = String(role || '').trim().toUpperCase();
    if (normRole === 'MASTER') return true;

    const limit = await this.getEffectiveLimit({
      organisationId,
      cafeId,
      workflowType,
      role: normRole,
      asOfDate,
    });

    if (limit !== null && amountPaisa > limit) {
      const limitRupees = (limit / 100).toLocaleString('en-IN');
      throw new ApiError(
        403,
        'APPROVAL_THRESHOLD_EXCEEDED',
        `Amount ₹${(amountPaisa / 100).toLocaleString('en-IN')} exceeds ${normRole} financial authority threshold (₹${limitRupees}).`
      );
    }

    return true;
  }

  /**
   * Updates or registers an approval policy. Restricted to MASTER and OWNER.
   */
  static async setPolicy({
    organisationId,
    cafeId = null,
    workflowType = 'GENERAL',
    role,
    maxAmountPaisa,
    minAmountPaisa = 0,
    approvalLevel = 1,
    reason = '',
    auth,
  }) {
    const isOwner = auth?.role === 'OWNER';
    const isPrimaryMaster =
      auth?.role === 'MASTER' &&
      auth?.isPrimaryMaster === true;

    if (!isOwner && !isPrimaryMaster) {
      throw new ApiError(
        403,
        auth?.role === 'MASTER'
          ? 'PRIMARY_MASTER_AUTHORITY_REQUIRED'
          : 'POLICY_UPDATE_DENIED',
        'Only Primary Master and Owner can configure approval policies.'
      );
    }

    const normRole = String(role || '').trim().toUpperCase();
    const policyId = `POL-${organisationId}-${cafeId || 'ALL'}-${workflowType}-${normRole}`;

    let policy = await ApprovalPolicy.findOne({ policyId });
    const prevMax = policy ? policy.maxAmountPaisa : (DEFAULT_LIMITS[normRole] || null);

    if (!policy) {
      policy = new ApprovalPolicy({
        policyId,
        organisationId,
        cafeId: cafeId || null,
        workflowType,
        role: normRole,
        minAmountPaisa,
        maxAmountPaisa,
        approvalLevel,
        effectiveFrom: new Date(),
        createdBy: auth.userId || auth.name || 'Admin',
        auditHistory: [
          {
            modifiedBy: auth.userId || auth.name || 'Admin',
            modifiedAt: new Date(),
            previousMaxAmountPaisa: prevMax,
            newMaxAmountPaisa: maxAmountPaisa,
            reason: reason || 'Initial policy setup',
          },
        ],
      });
    } else {
      policy.maxAmountPaisa = maxAmountPaisa;
      policy.minAmountPaisa = minAmountPaisa;
      policy.approvalLevel = approvalLevel;
      policy.updatedBy = auth.userId || auth.name || 'Admin';
      policy.auditHistory.push({
        modifiedBy: auth.userId || auth.name || 'Admin',
        modifiedAt: new Date(),
        previousMaxAmountPaisa: prevMax,
        newMaxAmountPaisa: maxAmountPaisa,
        reason: reason || 'Policy updated',
      });
    }

    await policy.save();
    return policy;
  }
}

module.exports = {
  ApprovalPolicyService,
  DEFAULT_LIMITS,
};
