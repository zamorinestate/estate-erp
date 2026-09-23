'use strict';

const { logStructuredError } = require('../services/securityLogger');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = Number(error.statusCode || error.status || 500);
  let code = error.code || 'INTERNAL_SERVER_ERROR';
  let message = error.message || 'An unexpected server error occurred.';

  // Mongoose Validation & Schema constraint errors -> 400
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_FORMAT';
    message = `Invalid value for field '${error.path}'.`;
  } else if (error.type === 'entity.too.large' || error.status === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'The request payload exceeds the allowed size limit.';
  }

  // MongoDB E11000 Duplicate Key Error domain-aware translation
  if (error.code === 11000 || error.name === 'MongoServerError') {
    statusCode = 409;
    const errStr = String(error.message || '').toLowerCase();
    const reqPath = String(req.originalUrl || req.url || '').toLowerCase();

    if (errStr.includes('attendance') || errStr.includes('businessdate') || reqPath.includes('/attendance')) {
      code = 'ATTENDANCE_ALREADY_EXISTS';
      message = 'Attendance record already exists for today.';
    } else if (errStr.includes('email') || errStr.includes('userid') || reqPath.includes('/users') || reqPath.includes('/employees')) {
      code = 'USER_ALREADY_EXISTS';
      message = errStr.includes('email')
        ? 'An employee account with this email address already exists.'
        : 'An employee account with this ID or credentials already exists.';
    } else if (errStr.includes('vendorid') || reqPath.includes('/vendors')) {
      code = 'VENDOR_ALREADY_EXISTS';
      message = 'A vendor record with this ID already exists.';
    } else {
      code = 'DUPLICATE_KEY_CONFLICT';
      message = 'A record with this unique key already exists.';
    }
  }

  const isProductionLike =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  // Structured internal logging with correlationId & redacted credentials
  try {
    logStructuredError(error, req, { code, statusCode });
  } catch (_) {}

  const reqId = req.requestId || req.correlationId || 'REQ-UNKNOWN';

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message:
        statusCode === 500 && isProductionLike
          ? `Something went wrong. Reference: ${reqId}`
          : message,
    },
    requestId: req.requestId || req.correlationId || null,
    correlationId: req.correlationId || null,
    ...(!isProductionLike && error.stack ? { stack: error.stack } : {}),
  });
}

module.exports = { errorHandler };