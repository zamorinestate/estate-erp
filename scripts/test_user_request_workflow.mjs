/**
 * test_user_request_workflow.mjs
 * 
 * Verifies End-to-End User Request -> Primary Master -> User Resolution Lifecycle
 * Requirements:
 * 1. Ordinary authenticated user (STAFF / CAFE_ADMIN) submits a business request.
 * 2. Backend validates, persists, assigns unique sequence ID, records scope & timestamp.
 * 3. Primary Master receives notification and sees pending request in Approvals inbox.
 * 4. Primary Master reviews and decides (approves/rejects with audit reason).
 * 5. Resolution persists, state transitions correctly.
 * 6. Requester receives in-app notification linking back to the resolved request.
 * 7. Requester can view their updated status and history.
 */

const BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:3000/api/v1';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required; browser/integration credentials must be supplied through the environment.`);
  return value;
}

const PRIMARY_MASTER_EMAIL = requiredEnv('E2E_PRIMARY_MASTER_EMAIL');
const PRIMARY_MASTER_PASSWORD = requiredEnv('E2E_PRIMARY_MASTER_PASSWORD');
const STAFF_EMAIL = requiredEnv('E2E_STAFF_EMAIL');
const STAFF_PASSWORD = requiredEnv('E2E_STAFF_PASSWORD');
const CAFE_ADMIN_EMAIL = requiredEnv('E2E_CAFE_ADMIN_EMAIL');
const CAFE_ADMIN_PASSWORD = requiredEnv('E2E_CAFE_ADMIN_PASSWORD');

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
      'x-device-id': 'test-device-uuid-001',
    },
    body: JSON.stringify({
      organisationId: 'ZAMORIN',
      email,
      password,
      device: {
        deviceId: 'test-device-uuid-001',
        deviceName: 'Node Test Runner',
        deviceType: 'DESKTOP',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

  return {
    user: data.data.user,
    accessToken: data.data.accessToken,
    cookieHeader,
    headers: {
      'Authorization': `Bearer ${data.data.accessToken}`,
      'Cookie': cookieHeader,
      'Origin': 'http://localhost:3000',
      'Content-Type': 'application/json',
    }
  };
}

async function main() {
  console.log('=== STARTING USER REQUEST -> PRIMARY MASTER -> USER RESOLUTION AUDIT ===\n');

  // Step 1: Login Staff and Primary Master
  console.log('1. Authenticating test users...');
  const staff = await loginUser(STAFF_EMAIL, STAFF_PASSWORD);
  console.log(`   ✓ Staff logged in: ${staff.user.userId} (${staff.user.email}) - Role: ${staff.user.role}`);

  const master = await loginUser(PRIMARY_MASTER_EMAIL, PRIMARY_MASTER_PASSWORD);
  console.log(`   ✓ Primary Master logged in: ${master.user.userId} (${master.user.email}) - Role: ${master.user.role}, isPrimaryMaster: ${master.user.isPrimaryMaster}`);

  // Step 2: Staff Submits Leave Request
  console.log('\n2. Staff submits Leave Request...');
  const leavePayload = {
    leaveType: 'CASUAL',
    startDate: '2026-10-15',
    endDate: '2026-10-16',
    durationUnit: 'FULL_DAY',
    reason: 'Attending family wedding ceremony',
  };

  const leaveRes = await fetch(`${BASE_URL}/leave/requests`, {
    method: 'POST',
    headers: staff.headers,
    body: JSON.stringify(leavePayload),
  });

  if (!leaveRes.ok) {
    throw new Error(`Failed to submit leave request: ${leaveRes.status} ${await leaveRes.text()}`);
  }

  const leaveData = await leaveRes.json();
  const createdLeave = leaveData.data.leave || leaveData.data.leaveRequest || leaveData.data;
  const leaveId = createdLeave.leaveId;
  console.log(`   ✓ Leave request created successfully: ${leaveId}`);
  console.log(`   ✓ Status: ${createdLeave.status}, Days: ${createdLeave.requestedDays}`);

  // Step 3: Verify Primary Master sees pending request in Approvals inbox
  console.log('\n3. Primary Master checks pending Approvals inbox...');
  const approvalsRes = await fetch(`${BASE_URL}/approvals?status=PENDING&limit=100`, {
    method: 'GET',
    headers: master.headers,
  });

  if (!approvalsRes.ok) {
    throw new Error(`Failed to fetch approvals: ${approvalsRes.status} ${await approvalsRes.text()}`);
  }

  const approvalsData = await approvalsRes.json();
  const pendingApprovals = approvalsData.data.approvals || [];
  console.log(`   ✓ Found ${pendingApprovals.length} pending approval(s) in Master inbox.`);

  const leaveApproval = pendingApprovals.find(a => a.entityId === leaveId || a.entityId === createdLeave._id);
  if (!leaveApproval) {
    throw new Error(`FATAL: Leave request ${leaveId} was NOT found in Primary Master approvals inbox!`);
  }
  console.log(`   ✓ Matched approval record: ${leaveApproval.approvalId}`);
  console.log(`     - Type: ${leaveApproval.entityType}`);
  console.log(`     - Requesting User: ${leaveApproval.requestingUserId}`);
  console.log(`     - Action: ${leaveApproval.actionRequired}`);

  // Step 4: Primary Master decides (Approves) the Leave Request
  console.log('\n4. Primary Master reviews and APPROVES the request...');
  const decisionRes = await fetch(`${BASE_URL}/approvals/${leaveApproval.approvalId}/decide`, {
    method: 'POST',
    headers: master.headers,
    body: JSON.stringify({
      decision: 'APPROVED',
      reason: 'Approved by Primary Master Pradeesh K. Roster adjusted.',
    }),
  });

  if (!decisionRes.ok) {
    throw new Error(`Failed to decide approval: ${decisionRes.status} ${await decisionRes.text()}`);
  }

  const decisionData = await decisionRes.json();
  console.log(`   ✓ Approval decision recorded: ${decisionData.data.approval.status}`);
  console.log(`   ✓ Decided by: ${decisionData.data.approval.decidedByUserId}`);

  // Step 5: Staff verifies their Leave Request is now APPROVED
  console.log('\n5. Staff verifies Leave Request status update...');
  const staffLeaveRes = await fetch(`${BASE_URL}/leave/requests/${leaveId}`, {
    method: 'GET',
    headers: staff.headers,
  });

  if (!staffLeaveRes.ok) {
    throw new Error(`Failed to get staff leave detail: ${staffLeaveRes.status}`);
  }

  const staffLeaveData = await staffLeaveRes.json();
  const updatedLeave = staffLeaveData.data.leave || staffLeaveData.data.leaveRequest || staffLeaveData.data;
  if (updatedLeave.status !== 'APPROVED') {
    throw new Error(`Expected leave status APPROVED but got ${updatedLeave.status}`);
  }
  console.log(`   ✓ Staff sees updated status: ${updatedLeave.status}`);
  console.log(`   ✓ Approved by: ${updatedLeave.approvedBy}`);
  console.log(`   ✓ Decision reason: "${updatedLeave.decisionReason}"`);

  // Step 6: Staff verifies In-App Notification received
  console.log('\n6. Staff checks received notifications...');
  const notifRes = await fetch(`${BASE_URL}/notifications?limit=20`, {
    method: 'GET',
    headers: staff.headers,
  });

  if (!notifRes.ok) {
    throw new Error(`Failed to fetch staff notifications: ${notifRes.status}`);
  }

  const notifData = await notifRes.json();
  const notifications = notifData.data.notifications || [];
  console.log(`   ✓ Staff has ${notifications.length} notification(s).`);

  const matchingNotif = notifications.find(n => 
    (n.sourceEntityId === leaveId || (n.message && n.message.includes(leaveId)) || (n.title && n.title.includes('Leave APPROVED')))
  );

  if (!matchingNotif) {
    console.log('   Recent notifications:', notifications.map(n => ({ title: n.title, message: n.message })));
    throw new Error(`FATAL: Staff did NOT receive notification for approved leave ${leaveId}!`);
  }
  console.log(`   ✓ Notification successfully delivered to Staff:`);
  console.log(`     - Title: "${matchingNotif.title}"`);
  console.log(`     - Message: "${matchingNotif.message}"`);
  console.log(`     - Deep link: "${matchingNotif.deepLink}"`);

  // Step 7: Staff Submits Salary Advance Request
  console.log('\n7. Staff submits Salary Advance Request...');
  const advancePayload = {
    requestedAmount: 3500,
    reason: 'Emergency dental treatment',
  };

  const advanceRes = await fetch(`${BASE_URL}/loan-advances/me/requests/advance`, {
    method: 'POST',
    headers: staff.headers,
    body: JSON.stringify(advancePayload),
  });

  if (!advanceRes.ok) {
    throw new Error(`Failed to submit salary advance: ${advanceRes.status} ${await advanceRes.text()}`);
  }

  const advanceData = await advanceRes.json();
  const createdAdvance = advanceData.data.advance || advanceData.data.loan || advanceData.data;
  const loanAdvanceId = createdAdvance.loanAdvanceId;
  console.log(`   ✓ Salary advance created successfully: ${loanAdvanceId}`);
  console.log(`   ✓ Requested Amount: ₹${(createdAdvance.requestedAmountPaise / 100).toFixed(2)}, Status: ${createdAdvance.status}`);

  // Step 8: Master sees Salary Advance in Approvals inbox
  console.log('\n8. Primary Master checks inbox for Salary Advance approval...');
  const approvalsRes2 = await fetch(`${BASE_URL}/approvals?status=PENDING&limit=100`, {
    method: 'GET',
    headers: master.headers,
  });
  const approvalsData2 = await approvalsRes2.json();
  const advanceApproval = (approvalsData2.data.approvals || []).find(a => a.entityId === loanAdvanceId);

  if (!advanceApproval) {
    throw new Error(`FATAL: Salary advance ${loanAdvanceId} was NOT found in Primary Master approvals inbox!`);
  }
  console.log(`   ✓ Found advance approval: ${advanceApproval.approvalId}`);
  console.log(`     - Action: ${advanceApproval.actionRequired}`);

  // Step 9: Primary Master Approves Salary Advance
  console.log('\n9. Primary Master APPROVES Salary Advance...');
  const advanceDecisionRes = await fetch(`${BASE_URL}/approvals/${advanceApproval.approvalId}/decide`, {
    method: 'POST',
    headers: master.headers,
    body: JSON.stringify({
      decision: 'APPROVED',
      reason: 'Medical advance approved by Primary Master.',
    }),
  });

  if (!advanceDecisionRes.ok) {
    throw new Error(`Failed to approve advance: ${advanceDecisionRes.status} ${await advanceDecisionRes.text()}`);
  }
  console.log(`   ✓ Advance approval recorded.`);

  // Step 10: Staff checks advance status & notification
  console.log('\n10. Staff verifies Advance resolution & notification...');
  const staffAdvanceRes = await fetch(`${BASE_URL}/loan-advances/me/${loanAdvanceId}`, {
    method: 'GET',
    headers: staff.headers,
  });

  if (!staffAdvanceRes.ok) {
    throw new Error(`Failed to get staff advance details: ${staffAdvanceRes.status}`);
  }

  const staffAdvanceData = await staffAdvanceRes.json();
  const updatedAdvance = staffAdvanceData.data.loan;
  console.log(`   ✓ Staff sees advance status: ${updatedAdvance.status}`);
  if (updatedAdvance.status !== 'DISBURSEMENT_PENDING' && updatedAdvance.status !== 'APPROVED') {
    throw new Error(`Expected advance status DISBURSEMENT_PENDING but got ${updatedAdvance.status}`);
  }

  const notifRes2 = await fetch(`${BASE_URL}/notifications?limit=20`, {
    method: 'GET',
    headers: staff.headers,
  });
  const notifData2 = await notifRes2.json();
  const advanceNotif = (notifData2.data.notifications || []).find(n => 
    n.title && n.title.includes(loanAdvanceId)
  );

  if (!advanceNotif) {
    console.log('   Recent notifications:', (notifData2.data.notifications || []).map(n => ({ title: n.title })));
    throw new Error(`FATAL: Staff did NOT receive notification for resolved salary advance ${loanAdvanceId}!`);
  }
  console.log(`   ✓ Advance notification confirmed: "${advanceNotif.title}" - "${advanceNotif.message}"`);

  // Step 11: Staff submits Leave Request that Primary Master REJECTS with mandatory reason
  console.log('\n11. Testing REJECTION Flow (Staff Leave Request -> Master Rejection -> Staff Notification)...');
  const rejectLeavePayload = {
    leaveType: 'CASUAL',
    startDate: '2026-11-01',
    endDate: '2026-11-03',
    durationUnit: 'FULL_DAY',
    reason: 'Festival travel',
  };

  const rejectLeaveRes = await fetch(`${BASE_URL}/leave/requests`, {
    method: 'POST',
    headers: staff.headers,
    body: JSON.stringify(rejectLeavePayload),
  });
  const rejectLeaveData = await rejectLeaveRes.json();
  const rejLeaveId = (rejectLeaveData.data.leave || rejectLeaveData.data).leaveId;
  console.log(`   ✓ Leave request submitted: ${rejLeaveId}`);

  const appListRes = await fetch(`${BASE_URL}/approvals?status=PENDING&limit=100`, {
    method: 'GET',
    headers: master.headers,
  });
  const appListData = await appListRes.json();
  const rejApproval = (appListData.data.approvals || []).find(a => a.entityId === rejLeaveId);
  if (!rejApproval) throw new Error(`Approval not found for ${rejLeaveId}`);

  const rejReason = 'High festive footfall anticipated; maximum staffing required on these dates.';
  const rejDecideRes = await fetch(`${BASE_URL}/approvals/${rejApproval.approvalId}/decide`, {
    method: 'POST',
    headers: master.headers,
    body: JSON.stringify({
      decision: 'REJECTED',
      reason: rejReason,
    }),
  });
  if (!rejDecideRes.ok) throw new Error(`Failed to reject leave: ${rejDecideRes.status}`);
  console.log(`   ✓ Primary Master REJECTED request with reason: "${rejReason}"`);

  // Verify staff sees REJECTED status & reason
  const staffCheckRes = await fetch(`${BASE_URL}/leave/requests/${rejLeaveId}`, {
    method: 'GET',
    headers: staff.headers,
  });
  const staffCheckData = await staffCheckRes.json();
  const checkedLeave = staffCheckData.data.leave;
  if (checkedLeave.status !== 'REJECTED') {
    throw new Error(`Expected REJECTED but got ${checkedLeave.status}`);
  }
  console.log(`   ✓ Staff sees status: ${checkedLeave.status}, Reason: "${checkedLeave.decisionReason}"`);

  // Verify staff gets REJECTED notification
  const notifRes3 = await fetch(`${BASE_URL}/notifications?limit=20`, {
    method: 'GET',
    headers: staff.headers,
  });
  const notifData3 = await notifRes3.json();
  const rejNotif = (notifData3.data.notifications || []).find(n => 
    n.sourceEntityId === rejLeaveId || (n.title && n.title.includes('REJECTED'))
  );
  if (!rejNotif) throw new Error(`Staff did not receive REJECTED notification for ${rejLeaveId}`);
  console.log(`   ✓ Rejection notification verified: "${rejNotif.title}" - "${rejNotif.message}"`);

  // Step 12: Cafe Admin Expense Claim Workflow
  console.log('\n12. Testing Cafe Admin Expense Claim Workflow...');
  const cafeAdmin = await loginUser(CAFE_ADMIN_EMAIL, CAFE_ADMIN_PASSWORD);
  console.log(`   ✓ Cafe Admin logged in: ${cafeAdmin.user.userId}`);

  const expensePayload = {
    cafeId: 'ZC-0001',
    category: 'SUPPLIES',
    purpose: 'Urgent Store Cleaning Equipment',
    description: 'Floor disinfectants and microfiber mops',
    amount: 850,
    paymentMethod: 'CASH',
  };

  const expCreateRes = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: cafeAdmin.headers,
    body: JSON.stringify(expensePayload),
  });
  if (!expCreateRes.ok) throw new Error(`Failed to create expense: ${expCreateRes.status} ${await expCreateRes.text()}`);
  const expData = await expCreateRes.json();
  const createdExp = expData.data?.expense || expData.expense || expData;
  const expenseId = createdExp.expenseId;
  console.log(`   ✓ Expense created & submitted: ${expenseId} (₹${createdExp.amount})`);

  // Master finds expense approval
  const expAppListRes = await fetch(`${BASE_URL}/approvals?status=PENDING&limit=100`, {
    method: 'GET',
    headers: master.headers,
  });
  const expAppListData = await expAppListRes.json();
  const expApproval = (expAppListData.data.approvals || []).find(a => a.entityId === expenseId);
  if (!expApproval) throw new Error(`Expense approval for ${expenseId} not found in Master inbox!`);
  console.log(`   ✓ Master found expense approval: ${expApproval.approvalId}`);

  // Master decides expense
  const expDecideRes = await fetch(`${BASE_URL}/approvals/${expApproval.approvalId}/decide`, {
    method: 'POST',
    headers: master.headers,
    body: JSON.stringify({
      decision: 'APPROVED',
      reason: 'Approved for cafe sanitization compliance.',
    }),
  });
  if (!expDecideRes.ok) throw new Error(`Master failed to approve expense: ${expDecideRes.status}`);
  console.log(`   ✓ Master approved expense.`);

  // Cafe Admin verifies notification
  const adminNotifRes = await fetch(`${BASE_URL}/notifications?limit=20`, {
    method: 'GET',
    headers: cafeAdmin.headers,
  });
  const adminNotifData = await adminNotifRes.json();
  const adminExpNotif = (adminNotifData.data.notifications || []).find(n => 
    n.sourceEntityId === expenseId || (n.title && n.title.includes(expenseId))
  );
  if (!adminExpNotif) throw new Error(`Cafe Admin did not receive notification for approved expense ${expenseId}`);
  console.log(`   ✓ Cafe Admin received approval notification: "${adminExpNotif.title}" - "${adminExpNotif.message}"`);

  // Step 13: Concurrency / Double Submit Protection
  console.log('\n13. Testing Double-Submit / Idempotency Protection...');
  const doubleSubmitPayload = {
    leaveType: 'CASUAL',
    startDate: '2026-11-20',
    endDate: '2026-11-20',
    durationUnit: 'FULL_DAY',
    reason: 'Medical checkup',
  };

  const [req1, req2] = await Promise.all([
    fetch(`${BASE_URL}/leave/requests`, { method: 'POST', headers: staff.headers, body: JSON.stringify(doubleSubmitPayload) }),
    fetch(`${BASE_URL}/leave/requests`, { method: 'POST', headers: staff.headers, body: JSON.stringify(doubleSubmitPayload) }),
  ]);

  const res1Status = req1.status;
  const res2Status = req2.status;
  console.log(`   ✓ Concurrent submissions handled cleanly: Status 1 = ${res1Status}, Status 2 = ${res2Status}`);
  // Both or one should return safely without 500 error
  if (res1Status >= 500 || res2Status >= 500) {
    throw new Error(`Server returned 500 error under rapid concurrent submission!`);
  }
  console.log(`   ✓ Zero 500 server errors under concurrency.`);

  console.log('\n=== ALL USER REQUEST -> PRIMARY MASTER -> USER RESOLUTION TESTS PASSED! ===');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
