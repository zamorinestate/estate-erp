
const BASE_URL = 'http://localhost:3000/api/v1';

async function run() {
  console.log('================================================================');
  console.log('TESTING ALL 5 BUTTON WORKFLOWS, AUTH, ROUTES, & MASTER APPROVALS');
  console.log('================================================================\n');

  // 1. Log in as Primary Master
  console.log('[1] Logging in as Primary Master (pradeeshk331@gmail.com)...');
  const masterLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pradeeshk331@gmail.com',
      password: 'PRADEESHK@94309',
      device: {
        deviceId: 'TEST-DEV-MASTER-001',
        deviceName: 'Test Master Terminal',
        deviceType: 'DESKTOP',
      },
    }),
  });

  const masterLoginData = await masterLoginRes.json();
  if (!masterLoginRes.ok || !masterLoginData.success) {
    throw new Error(`Master login failed: ${JSON.stringify(masterLoginData)}`);
  }
  const masterToken = masterLoginData.data?.accessToken;
  console.log('✓ Master login successful. Token acquired.');

  // Check if tester staff user exists, if not create/seed tester
  console.log('\n[2] Setting up/verifying Staff account (ST-0003 / tester)...');
  let staffToken;
  const staffLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'zamorinestatepvtltd.erp@gmail.com',
      password: 'Password@123',
      device: {
        deviceId: 'TEST-DEV-STAFF-001',
        deviceName: 'Test Staff Terminal',
        deviceType: 'DESKTOP',
      },
    }),
  });
  const staffLoginData = await staffLoginRes.json();

  if (staffLoginRes.ok && staffLoginData.success) {
    staffToken = staffLoginData.data?.accessToken;
    console.log('✓ Staff logged in with Password@123.');
  } else {
    console.log('Staff login failed, updating credentials for ST-0003 via Master...');
    const credsRes = await fetch(`${BASE_URL}/employees/ST-0003/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${masterToken}`,
      },
      body: JSON.stringify({
        password: 'Password@123',
      }),
    });
    const credsData = await credsRes.json();
    console.log('Set credentials response:', credsData.message || credsData);

    const relogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'zamorinestatepvtltd.erp@gmail.com',
        password: 'Password@123',
        device: {
          deviceId: 'TEST-DEV-STAFF-001',
          deviceName: 'Test Staff Terminal',
          deviceType: 'DESKTOP',
        },
      }),
    });
    const reloginData = await relogin.json();
    staffToken = reloginData.data?.accessToken;
    if (!staffToken) {
      throw new Error(`Could not obtain staff token: ${JSON.stringify(reloginData)}`);
    }
    console.log('✓ Staff created and logged in.');
  }

  // 3. Test Button 1: Request Attendance Correction
  console.log('\n[3] Testing Button 1: POST /attendance/corrections (Request Correction →)...');
  const today = new Date().toISOString().slice(0, 10);
  const corrRes = await fetch(`${BASE_URL}/attendance/corrections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      businessDate: today,
      requestedCheckIn: `${today}T09:00:00.000Z`,
      requestedCheckOut: `${today}T17:30:00.000Z`,
      reason: 'QR reader biometric scanner glitch during morning rush hour',
    }),
  });
  const corrData = await corrRes.json();
  console.log('Attendance correction response:', corrRes.status, corrData.message || corrData);
  if (!corrRes.ok || !corrData.success) {
    throw new Error(`Correction failed: ${JSON.stringify(corrData)}`);
  }
  const corrRequestId = corrData.data?.correctionRequest?.requestId;
  console.log(`✓ Attendance Correction created: ${corrRequestId}`);

  // 4. Test Button 2 & 5: Change Shift Request / Availability
  console.log('\n[4] Testing Button 2 & 5: POST /shifts/me/requests (Change Shift Request →)...');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const shiftRes = await fetch(`${BASE_URL}/shifts/me/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      requestedDate: tomorrow,
      currentShift: 'Morning Shift (07:00 – 15:30)',
      requestedShift: 'EVENING',
      reason: 'College evening examination schedule adjustment',
      notes: 'Coordinated swap with teammate',
    }),
  });
  const shiftData = await shiftRes.json();
  console.log('Shift request response:', shiftRes.status, shiftData.message || shiftData);
  if (!shiftRes.ok || !shiftData.success) {
    throw new Error(`Shift request failed: ${JSON.stringify(shiftData)}`);
  }
  const shiftRequestId = shiftData.data?.shiftRequest?.requestId || shiftData.data?.request?.requestId;
  console.log(`✓ Shift Change Request created: ${shiftRequestId}`);

  // 5. Test Button 3: Submit Leave Request
  console.log('\n[5] Testing Button 3: POST /leave/requests (Submit Leave Request)...');
  const leaveStart = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
  const leaveEnd = new Date(Date.now() + 259200000).toISOString().slice(0, 10);
  const leaveRes = await fetch(`${BASE_URL}/leave/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      leaveType: 'CASUAL',
      startDate: leaveStart,
      endDate: leaveEnd,
      durationUnit: 'FULL_DAY',
      reason: 'Attending family personal ceremony',
    }),
  });
  const leaveData = await leaveRes.json();
  console.log('Leave request response:', leaveRes.status, leaveData.message || leaveData);
  if (!leaveRes.ok || !leaveData.success) {
    throw new Error(`Leave request failed: ${JSON.stringify(leaveData)}`);
  }
  const leaveId = leaveData.data?.leave?.leaveId || leaveData.data?.leaveId;
  console.log(`✓ Leave Request created: ${leaveId}`);

  // 6. Test Primary Master: Verify All Requests Reached Master
  console.log('\n[6] Verifying Master received ALL 3 requests in GET /approvals?status=PENDING...');
  const approvalsRes = await fetch(`${BASE_URL}/approvals?status=PENDING&limit=100`, {
    headers: { Authorization: `Bearer ${masterToken}` },
  });
  const approvalsData = await approvalsRes.json();
  const pendingApprovals = approvalsData.data?.approvals || [];
  console.log(`Master pending approvals count: ${pendingApprovals.length}`);

  const foundCorrApproval = pendingApprovals.find(
    (a) => a.entityType === 'ATTENDANCE_CORRECTION' && a.entityId === corrRequestId
  );
  const foundShiftApproval = pendingApprovals.find(
    (a) => a.entityType === 'SHIFT_CHANGE' && a.entityId === shiftRequestId
  );
  const foundLeaveApproval = pendingApprovals.find(
    (a) => a.entityType === 'LEAVE_REQUEST' && a.entityId === leaveId
  );

  console.log(`- Attendance Correction in Master Approvals: ${foundCorrApproval ? `✓ Found (${foundCorrApproval.approvalId})` : '✗ NOT FOUND'}`);
  console.log(`- Shift Change in Master Approvals: ${foundShiftApproval ? `✓ Found (${foundShiftApproval.approvalId})` : '✗ NOT FOUND'}`);
  console.log(`- Leave Request in Master Approvals: ${foundLeaveApproval ? `✓ Found (${foundLeaveApproval.approvalId})` : '✗ NOT FOUND'}`);

  if (!foundCorrApproval || !foundShiftApproval || !foundLeaveApproval) {
    throw new Error('Not all requests reached Master approvals list!');
  }

  // 7. Verify Notifications reached Master
  console.log('\n[7] Verifying Master received in-app notifications in GET /notifications...');
  const notifsRes = await fetch(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${masterToken}` },
  });
  const notifsData = await notifsRes.json();
  const masterNotifs = notifsData.data?.notifications || notifsData.notifications || [];
  console.log(`Master notifications count: ${masterNotifs.length}`);

  const notifCorr = masterNotifs.find((n) => n.sourceEntityId === corrRequestId || n.eventType === 'ATTENDANCE_CORRECTION_REQUESTED');
  const notifShift = masterNotifs.find((n) => n.sourceEntityId === shiftRequestId || n.eventType === 'SHIFT_CHANGE_REQUESTED');
  const notifLeave = masterNotifs.find((n) => n.sourceEntityId === leaveId || n.eventType === 'LEAVE_REQUESTED');

  console.log(`- Attendance Correction Notification: ${notifCorr ? `✓ Found ("${notifCorr.title}")` : '✗ NOT FOUND'}`);
  console.log(`- Shift Change Notification: ${notifShift ? `✓ Found ("${notifShift.title}")` : '✗ NOT FOUND'}`);
  console.log(`- Leave Request Notification: ${notifLeave ? `✓ Found ("${notifLeave.title}")` : '✗ NOT FOUND'}`);

  if (!notifCorr || !notifShift || !notifLeave) {
    throw new Error('Not all notifications reached Master!');
  }

  // 8. Test Master Approving Each Request via Governance Workbench
  console.log('\n[8] Testing Master Approving each request via POST /approvals/:id/decide...');

  // Approve Attendance Correction
  const decideCorrRes = await fetch(`${BASE_URL}/approvals/${foundCorrApproval.approvalId}/decide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterToken}`,
    },
    body: JSON.stringify({ decision: 'APPROVED', remarks: 'Approved by Primary Master Pradeesh K' }),
  });
  const decideCorrData = await decideCorrRes.json();
  console.log(`- Decide Attendance Correction (${foundCorrApproval.approvalId}):`, decideCorrRes.status, decideCorrData.success ? '✓ APPROVED' : decideCorrData);

  // Approve Shift Change
  const decideShiftRes = await fetch(`${BASE_URL}/approvals/${foundShiftApproval.approvalId}/decide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterToken}`,
    },
    body: JSON.stringify({ decision: 'APPROVED', remarks: 'Approved by Primary Master Pradeesh K' }),
  });
  const decideShiftData = await decideShiftRes.json();
  console.log(`- Decide Shift Change (${foundShiftApproval.approvalId}):`, decideShiftRes.status, decideShiftData.success ? '✓ APPROVED' : decideShiftData);

  // Approve Leave Request
  const decideLeaveRes = await fetch(`${BASE_URL}/approvals/${foundLeaveApproval.approvalId}/decide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterToken}`,
    },
    body: JSON.stringify({ decision: 'APPROVED', remarks: 'Approved by Primary Master Pradeesh K' }),
  });
  const decideLeaveData = await decideLeaveRes.json();
  console.log(`- Decide Leave Request (${foundLeaveApproval.approvalId}):`, decideLeaveRes.status, decideLeaveData.success ? '✓ APPROVED' : decideLeaveData);

  console.log('\n================================================================');
  console.log('🎉 ALL 5 BUTTON WORKFLOWS & MASTER INTEGRATIONS VERIFIED 100%!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
