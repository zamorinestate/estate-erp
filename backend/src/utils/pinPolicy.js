'use strict';

let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch {
  bcrypt = require('bcryptjs');
}

const PIN_LENGTH = 6;

// Curated blocklist of trivial, sequential, repetitive, and common 6-digit PINs
const TRIVIAL_SIX_DIGIT_PINS = new Set([
  // Repeated digits
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  // Ascending sequences
  '012345', '123456', '234567', '345678', '456789', '567890',
  // Descending sequences
  '987654', '876543', '765432', '654321', '543210',
  // Common alternating / repetitive patterns
  '121212', '101010', '123123', '696969', '112233', '007007', '112211',
  '123321', '131313', '141414', '151515', '212121', '242424',
]);

/**
 * Validates whether a candidate PIN is weak, sequential, repetitive, or blocklisted.
 * @param {string} pin - Candidate 6-digit PIN
 * @returns {boolean} - true if weak/disallowed, false if acceptable
 */
function isWeakPin(pin) {
  if (typeof pin !== 'string') return true;
  const trimmed = pin.trim();
  if (!/^\d{6}$/.test(trimmed)) return true;
  if (TRIVIAL_SIX_DIGIT_PINS.has(trimmed)) return true;

  const digits = trimmed.split('').map(Number);

  // Check single repeated digit (e.g. 888888)
  if (new Set(digits).size === 1) return true;

  // Check strict sequential ascending or descending
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) ascending = false;
    if (digits[i] !== digits[i - 1] - 1) descending = false;
  }
  if (ascending || descending) return true;

  return false;
}

/**
 * Throws a formatted error if candidate PIN is invalid or weak.
 * @param {string} pin
 */
function validateSixDigitPinPolicy(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin.trim())) {
    const err = new Error('PIN must be exactly 6 numeric digits.');
    err.code = 'INVALID_PIN_FORMAT';
    err.statusCode = 400;
    throw err;
  }
  if (isWeakPin(pin)) {
    const err = new Error('Trivially guessable, repetitive, or sequential PINs are not permitted.');
    err.code = 'WEAK_PIN_REJECTED';
    err.statusCode = 400;
    throw err;
  }
}

// Precomputed runtime dummy hash for constant-time comparisons when entity is not found
const DUMMY_HASH = bcrypt.hashSync('__zamorin_dummy_pin_hash_precomputed__', 12);

module.exports = {
  PIN_LENGTH,
  TRIVIAL_SIX_DIGIT_PINS,
  isWeakPin,
  validateSixDigitPinPolicy,
  DUMMY_HASH,
};
