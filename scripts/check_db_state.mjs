import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await mongoose.connection.db.collection('users').find({}).project({ email: 1, role: 1, accountStatus: 1, isPrimaryMaster: 1, vendorId: 1, primaryCafeId: 1 }).toArray();
  console.log('TOTAL USERS:', users.length);
  for (const u of users) {
    console.log(`- ${u.email} | role: ${u.role} | status: ${u.accountStatus} | primaryMaster: ${u.isPrimaryMaster} | vendorId: ${u.vendorId || 'N/A'}`);
  }
  const cafes = await mongoose.connection.db.collection('cafes').find({}).project({ cafeId: 1, name: 1, status: 1 }).toArray();
  console.log('TOTAL CAFES:', cafes.length);
  for (const c of cafes) {
    console.log(`- ${c.cafeId} | ${c.name} | status: ${c.status}`);
  }
  await mongoose.disconnect();
}
main().catch(console.error);
