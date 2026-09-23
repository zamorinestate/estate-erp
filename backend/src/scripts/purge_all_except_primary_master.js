'use strict';

/**
 * KEEP ONLY PRIMARY MASTER (Pradeesh K / pradeeshk331@gmail.com)
 * AND PURGE ALL OTHER ACCOUNTS AND SESSIONS.
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

const uri = `mongodb://zamorin_admin:2gCygldpDF0kw1AY@${hosts}/zamorin_cafe_erp?${options}`;

async function main() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  // 1. Locate Primary Master
  const primaryMaster = await db.collection('users').findOne({
    isPrimaryMaster: true,
    email: 'pradeeshk331@gmail.com',
  });

  if (!primaryMaster) {
    throw new Error('FATAL: Primary Master (pradeeshk331@gmail.com) was not found in the database. Aborting to prevent data loss.');
  }

  console.log(`✔ Found Primary Master: ${primaryMaster.name} (${primaryMaster.userId} / ${primaryMaster.email})`);

  // 2. Find all other users to be removed
  const otherUsers = await db.collection('users').find({
    _id: { $ne: primaryMaster._id },
    email: { $ne: 'pradeeshk331@gmail.com' },
  }).toArray();

  console.log(`\nFound ${otherUsers.length} accounts to remove:`);
  otherUsers.forEach(u => {
    console.log(`  - [${u.userId}] ${u.name} (${u.email}) [${u.role}]`);
  });

  const otherUserIds = otherUsers.map(u => u.userId);

  // 3. Delete all other users
  const deleteUsersResult = await db.collection('users').deleteMany({
    _id: { $ne: primaryMaster._id },
    email: { $ne: 'pradeeshk331@gmail.com' },
  });
  console.log(`\n✔ Deleted ${deleteUsersResult.deletedCount} user accounts.`);

  // 4. Delete sessions of removed users
  const deleteSessionsResult = await db.collection('sessions').deleteMany({
    userId: { $in: otherUserIds },
  });
  console.log(`✔ Deleted ${deleteSessionsResult.deletedCount} sessions belonging to removed users.`);

  // 5. Delete attendances of removed users
  const deleteAttendanceResult = await db.collection('attendances').deleteMany({
    userId: { $in: otherUserIds },
  });
  console.log(`✔ Deleted ${deleteAttendanceResult.deletedCount} attendance records belonging to removed users.`);

  // 6. Delete passkeys of removed users if any
  try {
    const deletePasskeys = await db.collection('passkey_credentials').deleteMany({
      userId: { $in: otherUserIds },
    });
    console.log(`✔ Deleted ${deletePasskeys.deletedCount} passkey credentials belonging to removed users.`);
  } catch (_) {}

  // 7. Verify remaining users
  const remainingUsers = await db.collection('users').find({}).toArray();
  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(` FINAL DATABASE USER VERIFICATION (Total: ${remainingUsers.length})`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  remainingUsers.forEach(u => {
    console.log(`  [${u.userId}] ${u.name} — ${u.email} (${u.role}, isPrimaryMaster: ${u.isPrimaryMaster})`);
  });

  await mongoose.disconnect();
  console.log('\n✔ Finished successfully! Only Pradeesh K (Primary Master) remains.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
