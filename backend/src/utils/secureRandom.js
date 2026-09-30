'use strict';

const crypto = require('node:crypto');

/**
 * Generate a uniformly distributed six-digit decimal PIN using the operating
 * system backed cryptographic PRNG exposed by Node.js.
 */
function generateSixDigitPin() {
  return String(crypto.randomInt(100000, 1000000));
}

module.exports = {
  generateSixDigitPin,
};
