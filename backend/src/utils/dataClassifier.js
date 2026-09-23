'use strict';

/**
 * Zamorin Café ERP — Data Classification & Field Minimisation Utility
 *
 * Enforces DPDP Act compliance, role-based field access, and sensitive data masking
 * across all modules according to dataClassification.json definitions.
 */

const dataClassification = require('../config/dataClassification.json');

function maskAadhaar(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.length <= 4) return 'XXXXXXXX' + str;
  return 'XXXXXXXX' + str.slice(-4);
}

function maskPan(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.length <= 4) return 'XXXXX' + str;
  return 'XXXXX' + str.slice(-4);
}

function maskBankAccount(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.length <= 4) return '**** **** **** ' + str;
  return '**** **** **** ' + str.slice(-4);
}

function maskPhone(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.length <= 4) return 'XXXXXX' + str;
  return 'XXXXXX' + str.slice(-4);
}

function maskEmail(val) {
  if (!val) return '';
  const str = String(val).trim();
  const parts = str.split('@');
  if (parts.length !== 2) return '***@***.com';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? name[0] + '***' + name[name.length - 1] : name[0] + '***';
  return `${maskedName}@${domain}`;
}

function getFieldClassification(fieldPath) {
  for (const [tierName, config] of Object.entries(dataClassification.tiers)) {
    if (config.fields && config.fields.includes(fieldPath)) {
      return { tier: tierName, ...config };
    }
  }
  return { tier: 'INTERNAL', ...dataClassification.tiers.INTERNAL };
}

function sanitizeRecordByRole(record, role = 'STAFF', context = {}) {
  if (!record || typeof record !== 'object') return record;
  const isSelf = Boolean(context.isSelf);
  const isPrivileged = role === 'MASTER' || role === 'OWNER';

  if (Array.isArray(record)) {
    return record.map((item) => sanitizeRecordByRole(item, role, context));
  }

  const copy = { ...record };

  // Always strip raw credentials, hashes, and internal secrets across all roles
  delete copy.password;
  delete copy.passwordHash;
  delete copy.pin;
  delete copy.token;
  delete copy.accessToken;
  delete copy.refreshToken;
  delete copy.deviceTokenHash;

  // Mask PII & Financial data if not privileged or not self-access
  if (!isPrivileged && !isSelf) {
    if (copy.salary !== undefined) delete copy.salary;
    if (copy.salaryPaisa !== undefined) delete copy.salaryPaisa;
    if (copy.basicSalaryPaisa !== undefined) delete copy.basicSalaryPaisa;
    if (copy.grossSalaryPaisa !== undefined) delete copy.grossSalaryPaisa;
    if (copy.netSalaryPaisa !== undefined) delete copy.netSalaryPaisa;
    if (copy.bankAccountNumber !== undefined) delete copy.bankAccountNumber;
    if (role === 'STAFF') {
      delete copy.aadhaar;
      delete copy.aadhaarNumber;
      delete copy.pan;
      delete copy.panNumber;
    } else {
      if (copy.aadhaar) copy.aadhaar = maskAadhaar(copy.aadhaar);
      if (copy.aadhaarNumber) copy.aadhaarNumber = maskAadhaar(copy.aadhaarNumber);
      if (copy.pan) copy.pan = maskPan(copy.pan);
      if (copy.panNumber) copy.panNumber = maskPan(copy.panNumber);
    }
    if (copy.phone) copy.phone = maskPhone(copy.phone);
    if (copy.phoneNumber) copy.phoneNumber = maskPhone(copy.phoneNumber);
  }

  // Mask banking details for non-MASTER (or non-self for employee banking)
  if (role !== 'MASTER' && !isSelf) {
    if (copy.bankDetails && typeof copy.bankDetails === 'object') {
      copy.bankDetails = { ...copy.bankDetails };
      if (copy.bankDetails.accountNumber) {
        copy.bankDetails.accountNumber = maskBankAccount(copy.bankDetails.accountNumber);
      }
    }
    if (copy.accountNumber) {
      copy.accountNumber = maskBankAccount(copy.accountNumber);
    }
  }

  // Sanitize nested arrays/objects
  if (copy.bankAccounts && Array.isArray(copy.bankAccounts)) {
    copy.bankAccounts = copy.bankAccounts.map((b) => {
      if (typeof b !== 'object' || isPrivileged || isSelf) return b;
      return {
        ...b,
        accountNumber: maskBankAccount(b.accountNumber),
      };
    });
  }

  return copy;
}

module.exports = {
  dataClassification,
  getFieldClassification,
  sanitizeRecordByRole,
  maskAadhaar,
  maskPan,
  maskBankAccount,
  maskPhone,
  maskEmail,
};
