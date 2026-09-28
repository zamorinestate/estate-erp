import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zamorin_cafe_erp';
const PRIMARY_MASTER_EMAIL = String(process.env.INITIAL_MASTER_EMAIL || '').trim();
const DEMO_PASSWORD = String(process.env.SEED_DEMO_PASSWORD || '').trim();

if (!PRIMARY_MASTER_EMAIL || !DEMO_PASSWORD) {
  throw new Error('INITIAL_MASTER_EMAIL and SEED_DEMO_PASSWORD are required; canonical seed credentials must not be embedded in source.');
}

async function seedUsers() {
  console.log(`Connecting to MongoDB (${MONGODB_URI.replace(/:([^:@]+)@/, ':***@')})...`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const usersColl = db.collection('users');

  const defaultPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Master (ensure active & clean)
  const master = await usersColl.findOne({ email: PRIMARY_MASTER_EMAIL });
  if (master) {
    await usersColl.updateOne(
      { email: PRIMARY_MASTER_EMAIL },
      {
        $set: {
          accountStatus: 'ACTIVE',
          role: 'MASTER',
          isPrimaryMaster: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }
      }
    );
    console.log('Master MU-0001 verified.');
  }

  // 2. Owner
  const owner = await usersColl.findOne({ email: 'owner@example.com' });
  if (!owner) {
    await usersColl.insertOne({
      userId: 'OW-0001',
      organisationId: 'ZAMORIN',
      name: 'Café Owner',
      email: 'owner@example.com',
      role: 'OWNER',
      designation: 'Café Owner / Franchise Partner',
      position: 'Café Owner / Franchise Partner',
      department: 'Management',
      accountStatus: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001', 'ZC-0002'],
      passwordHash: defaultPasswordHash,
      isPrimaryMaster: false,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 1,
      permissionsVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Seeded Owner OW-0001');
  } else {
    await usersColl.updateOne(
      { email: 'owner@example.com' },
      {
        $set: {
          passwordHash: defaultPasswordHash,
          accountStatus: 'ACTIVE',
          role: 'OWNER',
          failedLoginAttempts: 0,
          lockedUntil: null,
          isPrimaryMaster: false,
          mfaEnabled: false,
        }
      }
    );
    console.log('Updated Owner OW-0001');
  }

  // 3. Cafe Admin
  const admin = await usersColl.findOne({ email: 'admin@example.com' });
  if (!admin) {
    await usersColl.insertOne({
      userId: 'AD-0003',
      organisationId: 'ZAMORIN',
      name: 'Cafe Admin (Ops)',
      email: 'admin@example.com',
      role: 'CAFE_ADMIN',
      designation: 'Café General Manager',
      position: 'Café General Manager',
      department: 'Operations',
      accountStatus: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001', 'ZC-0002'],
      passwordHash: defaultPasswordHash,
      isPrimaryMaster: false,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 1,
      permissionsVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Seeded Cafe Admin AD-0003');
  } else {
    await usersColl.updateOne(
      { email: 'admin@example.com' },
      {
        $set: {
          passwordHash: defaultPasswordHash,
          accountStatus: 'ACTIVE',
          role: 'CAFE_ADMIN',
          failedLoginAttempts: 0,
          lockedUntil: null,
          isPrimaryMaster: false,
          mfaEnabled: false,
        }
      }
    );
    console.log('Updated Cafe Admin AD-0003');
  }

  // 4. Staff
  const staff = await usersColl.findOne({ email: 'staff@example.com' });
  if (!staff) {
    await usersColl.insertOne({
      userId: 'ST-0001',
      organisationId: 'ZAMORIN',
      name: 'Normal Employee / Staff',
      email: 'staff@example.com',
      role: 'STAFF',
      designation: 'Senior Barista',
      position: 'Senior Barista',
      department: 'Front of House',
      accountStatus: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      primaryCafeId: 'ZC-0001',
      assignedCafeIds: ['ZC-0001'],
      passwordHash: defaultPasswordHash,
      isPrimaryMaster: false,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 1,
      permissionsVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Seeded Staff ST-0001');
  } else {
    await usersColl.updateOne(
      { email: 'staff@example.com' },
      {
        $set: {
          passwordHash: defaultPasswordHash,
          accountStatus: 'ACTIVE',
          role: 'STAFF',
          failedLoginAttempts: 0,
          lockedUntil: null,
          isPrimaryMaster: false,
          mfaEnabled: false,
        }
      }
    );
    console.log('Updated Staff ST-0001');
  }

  console.log('Seeding canonical users complete.');
  await mongoose.disconnect();
}

seedUsers().catch((err) => {
  console.error('Seed users error:', err);
  process.exit(1);
});
