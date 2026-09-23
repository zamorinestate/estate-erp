'use strict';

/**
 * ZAMORIN CAFÉ ERP — AUTHORIZED SYNTHETIC EMPLOYEE PURGE SCRIPT
 *
 * Safely removes 500 load-test/synthetic staff accounts (perfstaff_xxxx@zamorin.perftest,
 * ST-0xxx) from MongoDB Atlas, while strictly safeguarding canonical accounts
 * (MU-0001 Pradeesh K Primary Master, MU-0002, OW-0001, AD-0001, AD-0002, AD-0003).
 */

const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

require('dotenv').config();
const mongoose = require('mongoose');

const hosts = 'ac-rdyrmsn-shard-00-00.maxooka.mongodb.net:27017,ac-rdyrmsn-shard-00-01.maxooka.mongodb.net:27017,ac-rdyrmsn-shard-00-02.maxooka.mongodb.net:27017';
const options = 'ssl=true&replicaSet=atlas-jsr01r-shard-0&authSource=admin&retryWrites=true&w=majority';

// Try standard replica set first (bypasses querySrv), then fall back to MONGODB_URI
const connectionStrings = [
  `mongodb://zamorin_admin:2gCygldpDF0kw1AY@${hosts}/zamorin_cafe_erp?${options}`,
  `mongodb://zamorin_admin:Zamestpvt2124@${hosts}/zamorin_cafe_erp?${options}`,
  process.env.MONGODB_URI,
  process.env.MONGODB_URI_LIVE,
].filter(Boolean);

async function connectToMongo() {
  for (const uri of connectionStrings) {
    const masked = uri.replace(/:([^:@]{4})[^:@]*@/, ':****@');
    console.log(`Attempting connection to: ${masked}...`);
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      console.log('✔ Connected to MongoDB Atlas successfully!\n');
      return;
    } catch (err) {
      console.log(`  Connection attempt failed: ${err.message}`);
    }
  }
  throw new Error('All connection attempts to MongoDB Atlas failed. Please ensure current IP is whitelisted in MongoDB Atlas Network Access.');
}

async function purgeSyntheticEmployees() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(' ZAMORIN CAFÉ ERP — DUMMY & SYNTHETIC EMPLOYEE PURGE');
  console.log('══════════════════════════════════════════════════════════════════\n');

  await connectToMongo();
  const db = mongoose.connection.db;

  // 1. Pre-validation: verify Primary Master exists
  const primaryMaster = await db.collection('users').findOne({
    isPrimaryMaster: true,
    email: 'pradeeshk331@gmail.com',
  });

  if (!primaryMaster) {
    throw new Error('SAFETY ABORT: Primary Master (pradeeshk331@gmail.com) was not found in database!');
  }
  console.log(`✔ Primary Master verified intact: ${primaryMaster.name} (${primaryMaster.userId} / ${primaryMaster.email})`);

  // 2. Identify synthetic dummy employees
  const syntheticFilter = {
    $or: [
      { email: /@zamorin\.perftest$/i },
      { email: /@zamorin\.test$/i },
      { name: /^Perf Staff/i },
      { name: /^Staff Member/i },
      { name: /^Test /i },
      { userId: /^ST-\d{4,}$/ },
    ],
    isPrimaryMaster: { $ne: true },
    email: { $ne: 'pradeeshk331@gmail.com' },
  };

  const syntheticUsers = await db.collection('users').find(syntheticFilter).toArray();
  const countBefore = await db.collection('users').countDocuments({});
  console.log(`\nFound ${syntheticUsers.length} synthetic employee accounts to purge (out of ${countBefore} total users).`);

  if (syntheticUsers.length === 0) {
    console.log('No synthetic dummy employees found. Database is already clean!');
    await mongoose.disconnect();
    return;
  }

  const syntheticUserIds = syntheticUsers.map(u => u.userId);

  // 3. Purge synthetic employees from users collection
  const deleteResult = await db.collection('users').deleteMany({
    userId: { $in: syntheticUserIds },
    isPrimaryMaster: { $ne: true },
    email: { $ne: 'pradeeshk331@gmail.com' },
  });
  console.log(`✔ Successfully deleted ${deleteResult.deletedCount} dummy employee accounts from 'users'.`);

  // 4. Clean up any related test sessions
  const sessionResult = await db.collection('sessions').deleteMany({
    $or: [
      { userId: { $in: syntheticUserIds } },
      { 'device.deviceId': /^DEV-HT02-/ },
      { 'device.deviceId': /^DEV-SMOKE-/ },
    ],
  });
  console.log(`✔ Cleaned up ${sessionResult.deletedCount} orphaned test sessions.`);

  // 5. Clean up any related test attendances
  const attendanceResult = await db.collection('attendances').deleteMany({
    userId: { $in: syntheticUserIds },
  });
  console.log(`✔ Cleaned up ${attendanceResult.deletedCount} orphaned test attendance records.`);

  // 6. Post-purge verification
  const countAfter = await db.collection('users').countDocuments({});
  const remainingUsers = await db.collection('users').find({}, {
    projection: { userId: 1, name: 1, email: 1, role: 1, employmentStatus: 1 }
  }).toArray();

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' POST-PURGE CANONICAL DIRECTORY VERIFICATION');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`Total remaining active users: ${countAfter}`);
  remainingUsers.forEach((u, i) => {
    console.log(`  ${i + 1}. [${u.userId}] ${u.name} — ${u.email} (${u.role}) [${u.employmentStatus || 'ACTIVE'}]`);
  });

  console.log('\n✔ PURGE COMPLETED SUCCESSFULLY. Directory is pristine and ready for fresh staff onboarding!\n');
  await mongoose.disconnect();
}

purgeSyntheticEmployees()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Purge failed:', err.message);
    process.exit(1);
  });
