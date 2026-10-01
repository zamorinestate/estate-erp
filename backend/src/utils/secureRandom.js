'use strict';

const crypto = require('node:crypto');

/**
 * Generate a uniformly distributed six-digit decimal PIN using the operating
 * system backed cryptographic PRNG exposed by Node.js.
 */
function generateSixDigitPin() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateSecureString(length, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789') {
  const size = Number(length);
  if (!Number.isInteger(size) || size < 1 || size > 4096) {
    throw new TypeError('length must be an integer between 1 and 4096.');
  }

  const chars = String(alphabet || '');
  if (chars.length < 2) {
    throw new TypeError('alphabet must contain at least two characters.');
  }

  let value = '';
  for (let i = 0; i < size; i += 1) {
    value += chars[crypto.randomInt(0, chars.length)];
  }
  return value;
}

function generateTemporaryEmployeePassword() {
  return `Zamorin@${generateSecureString(10)}!`;
}

module.exports = {
  generateSixDigitPin,
  generateSecureString,
  generateTemporaryEmployeePassword,
};
