import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(path.resolve(__dirname, '../Backend/package.json'));
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Centralized weak pin check
function isWeak(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return true;
  const TRIVIAL = new Set([
    '000000', '111111', '222222', '333333', '444444',
    '555555', '666666', '777777', '888888', '999999',
    '012345', '123456', '234567', '345678', '456789', '567890',
    '987654', '876543', '765432', '654321', '543210',
    '121212', '101010', '123123', '696969', '112233', '007007',
    '147258', '258369', '369258', '951753'
  ]);
  if (TRIVIAL.has(pin)) return true;
  const digits = pin.split('').map(Number);
  if (new Set(digits).size <= 2) return true;
  let asc = true, desc = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) asc = false;
    if (digits[i] !== digits[i - 1] - 1) desc = false;
  }
  return asc || desc;
}

function generateSecurePin() {
  while (true) {
    const num = crypto.randomInt(100000, 999999).toString();
    if (!isWeak(num)) return num;
  }
}

async function rotatePins() {
  console.log('Connecting to persistent MongoDB at mongodb://127.0.0.1:27017/zamorin_cafe_erp...');
  await mongoose.connect('mongodb://127.0.0.1:27017/zamorin_cafe_erp');

  // Generate strong non-trivial PINs
  const cafePin1 = generateSecurePin();
  const cafePin2 = generateSecurePin();
  const staffPin1 = generateSecurePin();
  const adminPin1 = generateSecurePin();
  const adminPin2 = generateSecurePin();

  // Standardize Café Operations bcrypt cost to 12
  const BCRYPT_COST = 12;
  const cafeHash1 = await bcrypt.hash(cafePin1, BCRYPT_COST);
  const cafeHash2 = await bcrypt.hash(cafePin2, BCRYPT_COST);
  const staffHash1 = await bcrypt.hash(staffPin1, BCRYPT_COST);
  const adminHash1 = await bcrypt.hash(adminPin1, BCRYPT_COST);
  const adminHash2 = await bcrypt.hash(adminPin2, BCRYPT_COST);

  // 1. Rotate Café Operations PINs
  await mongoose.connection.collection('cafes').updateOne(
    { cafeId: 'ZC-0001' },
    {
      $set: {
        code: 'ZC-0001',
        operationsPinHash: cafeHash1,
        operationsPinSetAt: new Date(),
        operationsPinFailedAttempts: 0,
        operationsPinLockedUntil: null,
      }
    }
  );
  console.log('[ROTATION] Cafe ZC-0001 operations PIN rotated to [REDACTED_CAFE_PIN] (bcrypt cost 12).');

  await mongoose.connection.collection('cafes').updateOne(
    { cafeId: 'ZC-0002' },
    {
      $set: {
        code: 'ZC-0002',
        operationsPinHash: cafeHash2,
        operationsPinSetAt: new Date(),
        operationsPinFailedAttempts: 0,
        operationsPinLockedUntil: null,
      }
    }
  );
  console.log('[ROTATION] Cafe ZC-0002 operations PIN rotated to [REDACTED_CAFE_PIN] (bcrypt cost 12).');

  // 2. Rotate Employee Operator PINs
  await mongoose.connection.collection('users').updateOne(
    { userId: 'ST-0001' },
    {
      $set: {
        operatorPinHash: staffHash1,
        operatorPinSetAt: new Date(),
        operatorPinFailedAttempts: 0,
        operatorPinLockedUntil: null,
      }
    }
  );
  console.log('[ROTATION] Staff ST-0001 employee PIN rotated to [REDACTED_EMPLOYEE_PIN] (bcrypt cost 12).');

  await mongoose.connection.collection('users').updateOne(
    { userId: 'AD-0001' },
    {
      $set: {
        operatorPinHash: adminHash1,
        operatorPinSetAt: new Date(),
        operatorPinFailedAttempts: 0,
        operatorPinLockedUntil: null,
      }
    }
  );
  console.log('[ROTATION] Admin AD-0001 employee PIN rotated to [REDACTED_EMPLOYEE_PIN] (bcrypt cost 12).');

  await mongoose.connection.collection('users').updateOne(
    { userId: 'AD-0002' },
    {
      $set: {
        operatorPinHash: adminHash2,
        operatorPinSetAt: new Date(),
        operatorPinFailedAttempts: 0,
        operatorPinLockedUntil: null,
      }
    }
  );
  console.log('[ROTATION] Admin AD-0002 employee PIN rotated to [REDACTED_EMPLOYEE_PIN] (bcrypt cost 12).');

  // 3. Write local uncommitted environment file for E2E runner (.env.cafe_ops_e2e.local)
  const envContent = [
    `CAFE_OPS_E2E_CAFE_ID=ZC-0001`,
    `CAFE_OPS_E2E_STAFF_ID=ST-0001`,
    `CAFE_OPS_E2E_CAFE_PIN=${cafePin1}`,
    `CAFE_OPS_E2E_EMPLOYEE_PIN=${staffPin1}`,
    `CAFE_OPS_E2E_ADMIN_ID=AD-0001`,
    `CAFE_OPS_E2E_ADMIN_PIN=${adminPin1}`,
    `CAFE_OPS_E2E_BASE_URL=http://localhost:3000`,
    `ALLOW_CAFE_OPS_E2E_NONLOCAL=false`,
  ].join('\n') + '\n';

  const localEnvPath = path.resolve(__dirname, '../.env.cafe_ops_e2e.local');
  fs.writeFileSync(localEnvPath, envContent, 'utf8');
  console.log(`[SECURE_CONFIG] Local uncommitted credentials written to .env.cafe_ops_e2e.local (gitignored).`);

  await mongoose.disconnect();
  console.log('[SUCCESS] All persistent test PINs securely rotated and documented with [REDACTED_CAFE_PIN] / [REDACTED_EMPLOYEE_PIN].');
}

rotatePins().catch(err => {
  console.error('[ROTATION_ERROR] Failed to rotate test PINs:', err);
  process.exit(1);
});
