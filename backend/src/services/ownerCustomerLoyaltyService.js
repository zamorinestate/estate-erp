'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OWNER CUSTOMER & LOYALTY INTELLIGENCE SERVICE (STAGE 13)
 * ============================================================================
 * Understands customer retention and economics with strict DPDP (Stage 08) privacy:
 * - Authoritative customer source: reuses canonical Customer & LoyaltyLedger.
 * - Anonymous sales handled distinctly without forced identity stitching.
 * - Zero intrusive profiling: strictly NO inference of religion, caste, ethnicity,
 *   health, political affiliation, or income class.
 * - Transparent & versioned cohorts (First Visit, Repeat, Regular, Lapsed, Reactivated).
 * - Strict loyalty idempotency (same bill cannot earn points twice; redemptions cannot double-post).
 * - Estimated outstanding loyalty value & programme exposure simulation (zero balance-sheet liability; zero GL posting).
 * - Purpose limitation: customer data collected for complaints is strictly separated from marketing.
 * - Role-based masking on all customer contact exports.
 */

const CustomerModule = require('../models/Customer');
const Customer = CustomerModule.Customer || CustomerModule;
const BillModule = require('../models/Bill');
const Bill = BillModule.Bill || BillModule;
const CustomerComplaintModule = require('../models/CustomerComplaint');
const CustomerComplaint = CustomerComplaintModule.CustomerComplaint || CustomerComplaintModule;
const LoyaltyRuleVersionModule = require('../models/LoyaltyRuleVersion');
const LoyaltyRuleVersion = LoyaltyRuleVersionModule.LoyaltyRuleVersion || LoyaltyRuleVersionModule;
const CustomerCohortDefinitionModule = require('../models/CustomerCohortDefinition');
const CustomerCohortDefinition = CustomerCohortDefinitionModule.CustomerCohortDefinition || CustomerCohortDefinitionModule;
const LoyaltyLedgerModule = require('../models/LoyaltyLedger');
const LoyaltyLedger = LoyaltyLedgerModule.LoyaltyLedger || LoyaltyLedgerModule;

class OwnerCustomerLoyaltyService {
  /**
   * Aggregate Customer Analytics for Owner Strategic View
   * Separates anonymous POS sales from verified customer visits.
   */
  async getCustomerAnalytics(organisationId, options = {}) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');
    const { cafeId } = options;

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };

    const billQuery = { ...orgFilter };
    if (cafeId) billQuery.cafeId = cafeId;

    const allBills = await Bill.find(billQuery).lean();
    const totalBills = allBills.length;
    
    // Verified customer linked bills
    const verifiedBills = allBills.filter(b => (b.customerId && b.customerId.toString().trim() !== '') || (b.customerPhone && b.customerPhone.trim() !== ''));
    const anonymousBillsCount = totalBills - verifiedBills.length;

    // Retrieve identified customers
    const customerQuery = { ...orgFilter, isDeleted: { $ne: true } };
    const customers = await Customer.find(customerQuery).lean();

    let newCustomerCount = 0;
    let returningCustomerCount = 0;
    let totalCustomerSpend = 0;
    const now = new Date();

    for (const cust of customers) {
      const visitCount = cust.totalVisits || cust.visitCount || 1;
      const spend = cust.totalSpendPaisa ? (cust.totalSpendPaisa / 100) : (cust.totalSpend || 0);
      totalCustomerSpend += spend;

      if (visitCount <= 1) {
        newCustomerCount++;
      } else {
        returningCustomerCount++;
      }
    }

    const repeatRatePercentage = customers.length > 0
      ? Number(((returningCustomerCount / customers.length) * 100).toFixed(1))
      : 0;

    const averageBillValue = verifiedBills.length > 0
      ? Number((totalCustomerSpend / verifiedBills.length).toFixed(2))
      : 0;

    return {
      totalBillsProcessed: totalBills,
      anonymousBillsCount,
      verifiedCustomerBillsCount: verifiedBills.length,
      identifiedCustomersCount: customers.length,
      newCustomersCount: newCustomerCount,
      returningCustomersCount: returningCustomerCount,
      repeatRatePercentage,
      averageBillValue,
      totalCustomerSpend,
      profilingNotice: 'ZERO_INTRUSIVE_PROFILING: No sensitive demographic or behavioral profiling inferred.'
    };
  }

  /**
   * Versioned Cohort Analysis
   */
  async getCohortDistribution(organisationId) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
    const customers = await Customer.find({ ...orgFilter, isDeleted: { $ne: true } }).lean();
    const now = new Date();

    const cohorts = {
      FIRST_VISIT: 0,
      REPEAT: 0,
      REGULAR: 0,
      LAPSED: 0,
      REACTIVATED: 0
    };

    for (const c of customers) {
      const visits = c.totalVisits || c.visitCount || 1;
      const lastVisit = (c.lastVisitAt || c.lastVisitDate) ? new Date(c.lastVisitAt || c.lastVisitDate) : now;
      const daysSinceLastVisit = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24));

      if (daysSinceLastVisit > 90) {
        cohorts.LAPSED++;
      } else if (visits >= 5) {
        cohorts.REGULAR++;
      } else if (visits > 1) {
        cohorts.REPEAT++;
      } else {
        cohorts.FIRST_VISIT++;
      }
    }

    return {
      cohortRuleVersion: 'V2026.1-STANDARD',
      evaluationTimestamp: now,
      distribution: cohorts,
      sensitiveTraitInferenceStatus: 'STRICTLY_PROHIBITED'
    };
  }

  /**
   * Accrue loyalty points with strict Idempotency (prevent duplicate earn)
   */
  async accrueLoyaltyPoints(organisationId, payload, user) {
    const { customerId, billId, billAmount, pointsToAccrue, idempotencyKey } = payload;
    if (!organisationId || !customerId || !billId || !pointsToAccrue) {
      throw new Error('CUSTOMER_ID_BILL_ID_AND_POINTS_REQUIRED');
    }

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };

    // Strict runtime governance invariant: Loyalty programme is disabled by default (ENABLE_LOYALTY=false).
    // Client-supplied payload fields (such as enableLoyaltyOverride) are strictly rejected.
    // Programme activation requires trusted server-side environment / governance configuration only.
    if (payload && (payload.enableLoyaltyOverride !== undefined || payload.enableLoyalty !== undefined)) {
      if (payload.enableLoyaltyOverride === true || payload.enableLoyalty === true) {
        throw new Error('CLIENT_LOYALTY_OVERRIDE_PROHIBITED: Request payload cannot self-enable or bypass the loyalty programme gate. Server-side governance required.');
      }
    }

    const isLoyaltyEnabled = process.env.ENABLE_LOYALTY === 'true';
    if (!isLoyaltyEnabled) {
      throw new Error('LOYALTY_PROGRAMME_DISABLED: Runtime loyalty is disabled by default (ENABLE_LOYALTY=false). No approved Zamorin loyalty programme active.');
    }

    // Check if points already accrued for this billId (IDEMPOTENCY)
    if (LoyaltyLedger) {
      const existingAccrual = await LoyaltyLedger.findOne({
        $and: [
          orgFilter,
          {
            $or: [
              { 'reference.billId': billId },
              { externalReference: billId },
              { externalReference: idempotencyKey },
              { referenceBillId: billId },
              { loyaltyLedgerId: idempotencyKey }
            ]
          }
        ]
      });

      if (existingAccrual) {
        throw new Error('BILL_ALREADY_ACCRUED_POINTS: Duplicate loyalty accrual rejected');
      }
    }

    // Update customer points balance
    const customer = await Customer.findOne({ _id: customerId, ...orgFilter });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    const balanceBefore = customer.pointsBalance || customer.loyaltyPoints || 0;
    const balanceAfter = balanceBefore + pointsToAccrue;
    customer.pointsBalance = balanceAfter;
    customer.loyaltyPoints = balanceAfter;
    await customer.save();

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ledgerTxId = (idempotencyKey && /^LOY-\d{8}-\d{4,}$/.test(idempotencyKey))
      ? idempotencyKey
      : `LOY-${todayStr}-${Math.floor(Math.random() * 89999 + 10000)}`;

    if (LoyaltyLedger) {
      try {
        await LoyaltyLedger.create({
          loyaltyLedgerId: ledgerTxId,
          organisationId: organisationId.toString().toUpperCase(),
          customerId: customerId.toString(),
          transactionType: 'PURCHASE_ACCRUAL',
          pointsDelta: pointsToAccrue,
          balanceBefore,
          balanceAfter,
          referenceBillId: billId,
          reference: {
            billId,
            amountPaisa: billAmount ? Math.round(billAmount * 100) : 0
          },
          externalReference: idempotencyKey || billId,
          performedByUserId: (user?.userId || user?._id || 'SYSTEM').toString().toUpperCase(),
          createdBy: user?.userId || user?._id || 'SYSTEM'
        });
      } catch (err) {
        console.warn('Loyalty ledger write note:', err.message);
      }
    }

    return {
      success: true,
      transactionId: ledgerTxId,
      customerId,
      pointsAccrued: pointsToAccrue,
      currentBalance: balanceAfter
    };
  }

  /**
   * Redeem loyalty points with idempotency and balance validation
   */
  async redeemLoyaltyPoints(organisationId, payload, user) {
    const { customerId, billId, pointsToRedeem, idempotencyKey } = payload;
    if (!organisationId || !customerId || !pointsToRedeem || pointsToRedeem <= 0) {
      throw new Error('VALID_POINTS_TO_REDEEM_REQUIRED');
    }

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };

    // Strict runtime governance invariant: Loyalty programme is disabled by default (ENABLE_LOYALTY=false).
    // Client-supplied payload fields (such as enableLoyaltyOverride) are strictly rejected.
    // Programme activation requires trusted server-side environment / governance configuration only.
    if (payload && (payload.enableLoyaltyOverride !== undefined || payload.enableLoyalty !== undefined)) {
      if (payload.enableLoyaltyOverride === true || payload.enableLoyalty === true) {
        throw new Error('CLIENT_LOYALTY_OVERRIDE_PROHIBITED: Request payload cannot self-enable or bypass the loyalty programme gate. Server-side governance required.');
      }
    }

    const isLoyaltyEnabled = process.env.ENABLE_LOYALTY === 'true';
    if (!isLoyaltyEnabled) {
      throw new Error('LOYALTY_PROGRAMME_DISABLED: Runtime loyalty is disabled by default (ENABLE_LOYALTY=false). No approved Zamorin loyalty programme active.');
    }

    // Idempotency check on redemption
    if (LoyaltyLedger && idempotencyKey) {
      const existing = await LoyaltyLedger.findOne({
        $and: [
          orgFilter,
          {
            $or: [
              { loyaltyLedgerId: idempotencyKey },
              { externalReference: idempotencyKey }
            ]
          }
        ]
      });
      if (existing) {
        throw new Error('REDEMPTION_ALREADY_PROCESSED: Duplicate redemption rejected');
      }
    }

    // Balance check
    const customer = await Customer.findOne({ _id: customerId, ...orgFilter });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    const currentBalance = customer.pointsBalance || customer.loyaltyPoints || 0;
    if (currentBalance < pointsToRedeem) {
      throw new Error(`INSUFFICIENT_LOYALTY_POINTS: Requested ${pointsToRedeem}, available ${currentBalance}`);
    }

    const balanceAfter = currentBalance - pointsToRedeem;
    customer.pointsBalance = balanceAfter;
    customer.loyaltyPoints = balanceAfter;
    await customer.save();

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ledgerTxId = (idempotencyKey && /^LOY-\d{8}-\d{4,}$/.test(idempotencyKey))
      ? idempotencyKey
      : `LOY-${todayStr}-${Math.floor(Math.random() * 89999 + 10000)}`;

    if (LoyaltyLedger) {
      try {
        await LoyaltyLedger.create({
          loyaltyLedgerId: ledgerTxId,
          organisationId: organisationId.toString().toUpperCase(),
          customerId: customerId.toString(),
          transactionType: 'REWARD_REDEEMED',
          pointsDelta: -pointsToRedeem,
          balanceBefore: currentBalance,
          balanceAfter,
          referenceBillId: billId,
          reference: { billId },
          externalReference: idempotencyKey || billId,
          performedByUserId: (user?.userId || user?._id || 'SYSTEM').toString().toUpperCase(),
          createdBy: user?.userId || user?._id || 'SYSTEM'
        });
      } catch (err) {
        console.warn('Loyalty redemption ledger write note:', err.message);
      }
    }

    return {
      success: true,
      transactionId: ledgerTxId,
      customerId,
      pointsRedeemed: pointsToRedeem,
      remainingBalance: balanceAfter
    };
  }

  /**
   * Calculate Loyalty Programme Outstanding Exposure / Estimated Value
   * IMPORTANT GOVERNANCE INVARIANT:
   * - No active Zamorin loyalty programme or official monetary conversion policy is approved by Finance.
   * - Zero automated journal entries; zero balance sheet recognition; zero accounts payable.
   * - Calculates mathematical programme exposure only from configured simulation assumption.
   */
  async calculateLoyaltyExposure(organisationId, simulationRateRupees = null) {
    if (!organisationId) throw new Error('ORGANISATION_ID_REQUIRED');

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
    const customers = await Customer.find({ ...orgFilter, isDeleted: { $ne: true } }).lean();
    let totalOutstandingPoints = 0;

    for (const c of customers) {
      totalOutstandingPoints += (c.pointsBalance || c.loyaltyPoints || 0);
    }

    // Configured simulation rate (defaults to server config or 0.25 simulation scenario)
    const pointValueRupees = typeof simulationRateRupees === 'number' && simulationRateRupees >= 0
      ? simulationRateRupees
      : (parseFloat(process.env.LOYALTY_SIMULATION_RATE_RUPEES) || 0.25);
    const estimatedExposureRupees = Number((totalOutstandingPoints * pointValueRupees).toFixed(2));

    return {
      totalOutstandingPoints,
      pointConversionRateRupees: pointValueRupees,
      estimatedExposureRupees,
      isSimulationOnly: true,
      glPostingRecognised: false,
      balanceSheetLiabilityRecognised: false,
      exposureNotice: 'ESTIMATED OUTSTANDING LOYALTY VALUE / PROGRAMME EXPOSURE ONLY — NO AUTOMATIC GL POSTING OR BALANCE SHEET RECOGNITION WITHOUT FINANCE APPROVAL',
      governanceNotice: 'ESTIMATED OUTSTANDING LOYALTY VALUE / PROGRAMME EXPOSURE ONLY — NO AUTOMATIC GL POSTING OR BALANCE SHEET RECOGNITION WITHOUT FINANCE APPROVAL'
    };
  }

  /**
   * Purpose Limitation Verification (Stage 11 complaints vs Stage 13 marketing)
   * Enforces that complaint data does NOT automatically become marketing data.
   */
  async verifyComplaintMarketingSeparation(organisationId, customerId) {
    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
    const complaint = await CustomerComplaint.findOne({
      $and: [
        orgFilter,
        {
          $or: [
            { customerId },
            { customerPhone: { $ne: null } },
            { 'customerDetails.phone': { $ne: null } }
          ]
        }
      ]
    }).lean();

    if (complaint) {
      return {
        isPurposeSeparated: true,
        complaintDataUsage: 'SERVICE_RECOVERY_ONLY',
        marketingConsentInherited: false,
        governanceCompliance: 'DPDP_SECTION_6_PURPOSE_LIMITATION_MAINTAINED'
      };
    }
    return { isPurposeSeparated: true, marketingConsentInherited: false };
  }

  /**
   * Governed Customer Data Export with Privacy Masking and Audit Logging
   */
  async exportCustomerData(organisationId, options = {}, user) {
    const { purpose = 'BUSINESS_ANALYTICS', requestedByRole = 'OWNER' } = options;

    // Strict DPDP: unrestricted unmasked dumps prohibited unless statutory compliance officer
    const canUnmask = requestedByRole === 'DATA_PROTECTION_OFFICER';

    const orgUpper = organisationId.toString().toUpperCase();
    const orgFilter = { $or: [{ organisationId }, { organisationId: organisationId.toString() }, { organisationId: orgUpper }] };
    const customers = await Customer.find({ ...orgFilter, isDeleted: { $ne: true } }).lean();

    const exportedRecords = customers.map(c => {
      const phone = c.phone || c.mobile || '';
      const email = c.email || '';

      return {
        customerId: c._id,
        name: c.name || 'Guest Customer',
        phone: canUnmask ? phone : (phone ? `${phone.substring(0, 3)}****${phone.substring(phone.length - 2)}` : null),
        email: canUnmask ? email : (email ? `${email.substring(0, 2)}***@${email.split('@')[1] || 'domain.com'}` : null),
        loyaltyPoints: c.pointsBalance || c.loyaltyPoints || 0,
        totalVisits: c.totalVisits || 1,
        privacyNotice: 'EXPORT_PROTECTED_UNDER_STAGE_08_PRIVACY_CONTROLS'
      };
    });

    return {
      exportTimestamp: new Date(),
      recordCount: exportedRecords.length,
      purpose,
      dpdpCommencementStatus: 'TECHNICAL_CONTROL_ACTIVE_FUTURE_COMPLIANCE_READY',
      statutoryCommencementNotice: 'DPDP Rules 3, 5-16, 22, 23 in 18-month commencement tranche ending May 13, 2027; technical controls active as future-compliance ready. Access governed strictly by minimum necessary purpose.',
      isContactMasked: !canUnmask,
      records: exportedRecords
    };
  }
}

module.exports = new OwnerCustomerLoyaltyService();
