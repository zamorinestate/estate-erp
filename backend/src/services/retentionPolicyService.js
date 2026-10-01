'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — RETENTION POLICY & TEMPORARY STAGING CLEANUP SERVICE
 * ============================================================================
 * Enforces statutory record retention periods and safely purges abandoned
 * temporary staging uploads without deleting active files or business audit trails.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATUTORY_RETENTION_CATEGORIES = {
  FINANCIAL_TRANSACTIONS: {
    category: 'FINANCIAL_TRANSACTIONS',
    retentionFormula: 'Section 128 Companies Act 2013 / Section 36 CGST Act: 72 months from GSTR-9 annual return due date or 8 years',
    description: 'General ledger, bills, day close books, and financial vouchers.',
    autoPurgeAllowed: false,
  },
  TAX_RECORDS: {
    category: 'TAX_RECORDS',
    retentionFormula: 'Section 36 CGST Act: 72 calendar months from due date of furnishing annual return (GSTR-9) for the relevant financial year',
    description: 'GST filings, books of accounts, tax invoices, and registers.',
    autoPurgeAllowed: false,
  },
  EMPLOYEE_STATUTORY: {
    category: 'EMPLOYEE_STATUTORY',
    retentionDays: 1825, // 5 years
    description: 'Wages registers, PF/ESI submissions, and attendance logs.',
    autoPurgeAllowed: false,
  },
  SECURITY_AND_AUDIT_LOGS: {
    category: 'SECURITY_AND_AUDIT_LOGS',
    retentionDays: 1095, // 3 years
    description: 'Append-only audit trail and critical security events.',
    autoPurgeAllowed: false,
  },
  ORGANISATION_RETENTION_POLICY: {
    category: 'ORGANISATION_RETENTION_POLICY',
    description: 'Voluntary organisation-mandated retention policy extending beyond statutory minimum.',
    autoPurgeAllowed: false,
  },
  EXPIRED_EXPORT_ARTIFACTS: {
    category: 'EXPIRED_EXPORT_ARTIFACTS',
    retentionDays: 7, // 7 days ephemeral download window
    description: 'Generated PDF/Excel export binaries in temporary caches.',
    autoPurgeAllowed: true,
  },
  ABANDONED_DOCUMENT_STAGING: {
    category: 'ABANDONED_DOCUMENT_STAGING',
    retentionHours: 2, // 2 hours threshold for abandoned temporary uploads
    description: 'Uncommitted multipart upload files in os.tmpdir()/zamorin_document_staging.',
    autoPurgeAllowed: true,
  },
};

class RetentionPolicyService {
  /**
   * Returns statutory retention policy dictionary.
   */
  getRetentionPolicies() {
    return STATUTORY_RETENTION_CATEGORIES;
  }

  /**
   * Resolves the Indian Financial Year for any given date.
   * Runs 1st April to 31st March.
   * e.g., 2026-05-15 -> '2026-27'; 2026-02-10 -> '2025-26'
   */
  resolveFinancialYear(dateInput) {
    const d = new Date(dateInput || Date.now());
    const month = d.getUTCMonth(); // 0 = Jan, 3 = Apr
    const year = d.getUTCFullYear();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    return `${startYear}-${String(endYear).slice(-2)}`;
  }

  /**
   * Resolves the statutory due date of the GSTR-9 annual return under Section 44(1) CGST Act.
   * Statutory baseline: 31st December following the end of the financial year.
   * e.g., FY 2025-26 (ended 31 Mar 2026) -> 31 Dec 2026
   */
  resolveAnnualReturnDueDate(financialYear) {
    const startYear = parseInt(financialYear.split('-')[0], 10);
    const endYear = startYear + 1;
    // 31st December of the year in which the financial year ended
    return new Date(Date.UTC(endYear, 11, 31, 23, 59, 59, 999));
  }

  /**
   * Adds exact calendar months to a date without approximate 365-day multiplication.
   * Correctly handles leap years and variable month lengths.
   */
  addCalendarMonths(dateInput, months) {
    const d = new Date(dateInput);
    const targetMonth = d.getUTCMonth() + months;
    const targetYear = d.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const targetDay = d.getUTCDate();
    const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    const safeDay = Math.min(targetDay, daysInTargetMonth);
    return new Date(Date.UTC(targetYear, normalizedMonth, safeDay, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  }

  /**
   * Calculates statutory GST retention under Section 36 of the CGST Act:
   * 72 calendar months from the annual return due date for the relevant financial year.
   */
  calculateGstStatutoryRetention(dateOrFy) {
    const fy = typeof dateOrFy === 'string' && /^\d{4}-\d{2}$/.test(dateOrFy)
      ? dateOrFy
      : this.resolveFinancialYear(dateOrFy);
    const annualReturnDueDate = this.resolveAnnualReturnDueDate(fy);
    const statutoryRetentionUntil = this.addCalendarMonths(annualReturnDueDate, 72);

    return {
      financialYear: fy,
      annualReturnDueDate,
      statutoryRetentionUntil,
      statutoryBasis: 'Section 36 CGST Act: 72 months from GSTR-9 annual return due date (31st December following financial year)',
    };
  }

  /**
   * Calculates effective retention evaluating statutory baseline, voluntary org policy, and proceeding/investigation holds.
   * Section 36 Proviso:
   * Books and records pertaining to an appeal, revision, proceeding or investigation must be retained
   * for 1 year (12 months) after final disposal, or 72 months from annual return due date, whichever is later.
   */
  calculateEffectiveRetention({
    documentDate = new Date(),
    financialYear = null,
    organisationRetentionUntil = null,
    proceedingHold = false,
    proceedingDisposalDate = null,
    investigationHold = false,
    investigationDisposalDate = null,
    legalHold = false,
  } = {}) {
    const fy = financialYear || this.resolveFinancialYear(documentDate);
    const gstStatutory = this.calculateGstStatutoryRetention(fy);
    let effectiveUntil = new Date(gstStatutory.statutoryRetentionUntil);

    // Voluntary Organisation policy extends retention, but cannot shorten statutory minimum
    let effectiveOrgPolicy = null;
    if (organisationRetentionUntil) {
      const orgDate = new Date(organisationRetentionUntil);
      if (orgDate > effectiveUntil) {
        effectiveUntil = orgDate;
        effectiveOrgPolicy = orgDate;
      }
    }

    // Section 36 Proviso: Appeal / Revision / Proceedings extension
    // 1 year (12 calendar months) after final disposal date, or 72 months, whichever is later
    let proceedingExtendedUntil = null;
    if (proceedingDisposalDate) {
      proceedingExtendedUntil = this.addCalendarMonths(proceedingDisposalDate, 12);
      if (proceedingExtendedUntil > effectiveUntil) {
        effectiveUntil = proceedingExtendedUntil;
      }
    }

    // Investigation extension (12 months after final disposal)
    let investigationExtendedUntil = null;
    if (investigationDisposalDate) {
      investigationExtendedUntil = this.addCalendarMonths(investigationDisposalDate, 12);
      if (investigationExtendedUntil > effectiveUntil) {
        effectiveUntil = investigationExtendedUntil;
      }
    }

    const hasActiveHold = Boolean(legalHold || proceedingHold || investigationHold);

    return {
      financialYear: fy,
      annualReturnDueDate: gstStatutory.annualReturnDueDate,
      statutoryRetentionUntil: gstStatutory.statutoryRetentionUntil,
      organisationRetentionUntil: effectiveOrgPolicy,
      proceedingHold: Boolean(proceedingHold),
      proceedingExtendedUntil,
      investigationHold: Boolean(investigationHold),
      investigationExtendedUntil,
      legalHold: Boolean(legalHold),
      effectiveRetentionUntil: effectiveUntil,
      hasActiveHold,
    };
  }

  /**
   * Safely purges abandoned staging files older than 2 hours in the OS temporary directory.
   * Invariant: Never deletes actively writing files (< 2 hours old).
   */
  async cleanupAbandonedStaging({ olderThanMinutes = 120 } = {}) {
    const stagingDir = path.join(os.tmpdir(), 'zamorin_document_staging');
    if (!fs.existsSync(stagingDir)) {
      return {
        status: 'CLEAN',
        scanned: 0,
        deleted: 0,
        stagingDir,
      };
    }

    const now = Date.now();
    const cutoff = now - olderThanMinutes * 60 * 1000;
    const entries = await fs.promises.readdir(stagingDir);

    let scanned = 0;
    let deleted = 0;
    const deletedFiles = [];
    const failures = [];

    for (const name of entries) {
      if (!name.endsWith('.tmp') && !name.startsWith('stg-')) {
        continue;
      }

      scanned += 1;
      const fullPath = path.join(stagingDir, name);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.unlink(fullPath);

          // Verify deletion instead of assuming unlink success.
          try {
            await fs.promises.access(fullPath);
            failures.push({
              file: name,
              code: 'STAGING_DELETE_UNVERIFIED',
              message: 'File still exists after unlink returned.',
            });
          } catch (accessError) {
            if (accessError?.code === 'ENOENT') {
              deleted += 1;
              deletedFiles.push(name);
            } else {
              failures.push({
                file: name,
                code: String(accessError?.code || 'STAGING_DELETE_VERIFY_FAILED'),
                message: String(accessError?.message || 'Unable to verify staging deletion').slice(0, 300),
              });
            }
          }
        }
      } catch (error) {
        failures.push({
          file: name,
          code: String(error?.code || 'STAGING_CLEANUP_FAILED'),
          message: String(error?.message || 'Staging cleanup failed').slice(0, 300),
        });
      }
    }

    return {
      status: failures.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE',
      scanned,
      deleted,
      failureCount: failures.length,
      cutoffAgeMinutes: olderThanMinutes,
      deletedFiles,
      failures,
      timestamp: new Date().toISOString(),
    };
  }
}

const retentionPolicyService = new RetentionPolicyService();

module.exports = {
  STATUTORY_RETENTION_CATEGORIES,
  RetentionPolicyService,
  retentionPolicyService,
};
