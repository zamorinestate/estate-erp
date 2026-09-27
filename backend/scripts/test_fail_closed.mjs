import { connectDatabase } from '../src/config/database.js';

process.env.APP_MODE = 'REAL_USER_TEST';
process.env.REQUIRE_PERSISTENT_DB = 'true';

try {
  await connectDatabase({
    uri: 'mongodb://127.0.0.1:9999/unreachable_db',
    serverSelectionTimeoutMs: 1500,
  });
  console.log('FAIL: should not have connected');
  process.exit(1);
} catch (err) {
  if (err.message && err.message.includes('PERSISTENT_DATABASE_REQUIRED')) {
    console.log('FAIL_CLOSED_CONFIRMED: ' + err.message);
    process.exit(0);
  } else {
    console.error('Different error:', err);
    process.exit(1);
  }
}
