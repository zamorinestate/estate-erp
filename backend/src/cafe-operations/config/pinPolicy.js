const {
  PIN_LENGTH,
  TRIVIAL_SIX_DIGIT_PINS,
  isWeakPin,
  validateSixDigitPinPolicy,
  generateStrongSixDigitPin,
  DUMMY_HASH,
} = require('../../utils/pinPolicy');

module.exports = {
  PIN_LENGTH,
  BLOCKLIST: TRIVIAL_SIX_DIGIT_PINS,
  TRIVIAL_SIX_DIGIT_PINS,
  isWeakPin,
  validateSixDigitPinPolicy,
  generateStrongSixDigitPin,
  DUMMY_HASH,
};
