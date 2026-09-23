'use strict';

/**
 * Zamorin Café ERP — Central Security Logger & Data Sanitiser
 * 
 * Provides unified, structured security event emission and strict redaction
 * of sensitive credentials, tokens, cookies, secrets, and PII from all log paths.
 */

const crypto = require('crypto');

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /passwordhash/i,
  /secret/i,
  /apisecret/i,
  /token/i,
  /accesstoken/i,
  /refreshtoken/i,
  /devicetoken/i,
  /authorization/i,
  /bearer/i,
  /cookie/i,
  /sessionid/i,
  /sessioncookie/i,
  /cvv/i,
  /cvc/i,
  /cardnumber/i,
  /pan\b/i,
  /creditcard/i,
  /debitcard/i,
  /paymentcredentials/i,
  /pin\b/i,
  /otp/i,
  /recoverycode/i,
  /privatekey/i,
  /mfakey/i,
  /aadhaar/i,
  /accountnumber/i,
  /bankaccount/i,
  /bankdetails/i,
  /ifsc/i,
  /iban/i,
  /mongodb.?uri/i,
  /connectionstring/i,
];

const SENSITIVE_VALUE_PATTERNS = [
  /mongodb(\+srv)?:\/\/[^\s]+/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /ey[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWT pattern
];

const SECURITY_ACTIONS = Object.freeze({
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_LOCKED: 'SESSION_LOCKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  DEVICE_ENROLLED: 'DEVICE_ENROLLED',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  DEVICE_REJECTED: 'DEVICE_REJECTED',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  OPERATOR_SWITCHED: 'OPERATOR_SWITCHED',
  REFUND: 'REFUND',
  CASH_REVERSAL: 'CASH_REVERSAL',
  EXPENSE_SUBMITTED: 'EXPENSE_SUBMITTED',
  STOCK_ADJUSTED: 'STOCK_ADJUSTED',
  PROCUREMENT_APPROVED: 'PROCUREMENT_APPROVED',
});

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactSensitiveString(str) {
  if (typeof str !== 'string') return str;
  let redacted = str;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_URI_OR_TOKEN]');
  }
  return redacted;
}

function sanitizeForLogging(value, visited = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return '[BINARY_DATA_REDACTED]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      code: value.code,
      statusCode: value.statusCode || value.status,
      ...(process.env.NODE_ENV !== 'production' && value.stack ? { stack: redactSensitiveString(value.stack) } : {}),
    };
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (visited.has(value)) {
    return '[CIRCULAR_REFERENCE]';
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, visited));
  }

  const sanitized = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = sanitizeForLogging(v, visited);
    }
  }

  return sanitized;
}

function logSecurityEvent({
  correlationId = null,
  organisationId = null,
  cafeId = null,
  actorId = null,
  operatorSessionId = null,
  deviceId = null,
  action,
  targetType = null,
  targetId = null,
  outcome = 'SUCCESS',
  severity = 'INFO',
  metadata = {},
} = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    correlationId: correlationId || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null),
    organisationId: organisationId ? String(organisationId).trim().toUpperCase() : null,
    cafeId: cafeId ? String(cafeId).trim().toUpperCase() : null,
    actorId: actorId ? String(actorId).trim() : null,
    operatorSessionId: operatorSessionId ? String(operatorSessionId).trim() : null,
    deviceId: deviceId ? String(deviceId).trim() : null,
    action: action || 'SECURITY_EVENT',
    targetType: targetType ? String(targetType).trim() : null,
    targetId: targetId ? String(targetId).trim() : null,
    outcome: String(outcome).toUpperCase(),
    severity: String(severity).toUpperCase(),
    metadata: sanitizeForLogging(metadata),
  };

  const serialized = JSON.stringify(event);
  if (process.env.NODE_ENV !== 'test') {
    process.stdout.write(`[SECURITY_EVENT] ${serialized}\n`);
  }

  return event;
}

function logStructuredError(error, req = null, additionalContext = {}) {
  const correlationId = req?.correlationId || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null);
  const requestId = req?.requestId || correlationId;
  const structured = {
    timestamp: new Date().toISOString(),
    type: 'APPLICATION_ERROR',
    requestId,
    correlationId,
    path: req?.originalUrl || req?.url || null,
    method: req?.method || null,
    organisationId: req?.auth?.organisationId || null,
    cafeId: req?.auth?.cafeId || req?.headers?.['x-cafe-id'] || null,
    actorId: req?.auth?.userId || null,
    error: {
      name: error?.name || 'Error',
      code: error?.code || 'INTERNAL_ERROR',
      message: redactSensitiveString(error?.message || 'Unknown error'),
      statusCode: error?.statusCode || error?.status || 500,
    },
    context: sanitizeForLogging(additionalContext),
  };

  if (process.env.NODE_ENV !== 'production' && error?.stack) {
    structured.error.stack = redactSensitiveString(error.stack);
  }

  if (process.env.NODE_ENV !== 'test') {
    process.stderr.write(`[STRUCTURED_ERROR] ${JSON.stringify(structured)}\n`);
  }

  return structured;
}

module.exports = {
  SECURITY_ACTIONS,
  isSensitiveKey,
  redactSensitiveString,
  sanitizeForLogging,
  logSecurityEvent,
  logStructuredError,
};
