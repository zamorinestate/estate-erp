'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = path.join(__dirname, '../src/controllers/employeeController.js');
const routesPath = path.join(__dirname, '../src/routes/employeeRoutes.js');
const frontendPath = path.join(__dirname, '../../frontend/src/js/pages/employees.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('EMP-DEL-001: permanent employee deletion is Primary-Master-only at route and controller', () => {
  const routes = read(routesPath);
  const controller = read(controllerPath);
  const routeStart = routes.indexOf("router.delete(\n  '/:userId'");
  const routeEnd = routes.indexOf('// ── Stage 04: Onboarding Readiness Checklist', routeStart);
  const section = routes.slice(routeStart, routeEnd);
  assert.ok(section.includes("allowedRoles: ['MASTER']"));
  assert.equal(section.includes("allowedRoles: ['MASTER', 'OWNER']"), false);
  assert.ok(controller.includes('Only the Primary Master may permanently delete an employee identity.'));
  assert.ok(controller.includes("req.auth?.isPrimaryMaster !== true"));
});

test('EMP-DEL-002: permanent deletion requires confirmation, reason and immutable audit before destructive writes', () => {
  const controller = read(controllerPath);
  const start = controller.indexOf('const deleteEmployeeAccount = asyncHandler');
  const end = controller.indexOf('const initiateOffboarding = asyncHandler', start);
  const source = controller.slice(start, end);
  const confirmation = source.indexOf('PERMANENTLY_DELETE_EMPLOYEE_ACCOUNT');
  const reason = source.indexOf('PERMANENT_EMPLOYEE_DELETE_REASON_REQUIRED');
  const audit = source.indexOf("action: 'DELETE_EMPLOYEE_ACCOUNT_AUTHORIZED'");
  const revoke = source.indexOf('await revokeEmployeeAuthenticationArtifacts');
  const deleteIdentity = source.indexOf('const deletion = await User.deleteOne');
  assert.ok(confirmation >= 0);
  assert.ok(reason > confirmation);
  assert.ok(audit > reason);
  assert.ok(revoke > audit);
  assert.ok(deleteIdentity > revoke);
  assert.ok(source.includes('EMPLOYEE_DELETE_AUDIT_NOT_CONFIRMED'));
  assert.ok(source.includes('EMPLOYEE_DELETE_STATE_CONFLICT'));
});

test('EMP-DEL-003: credential-store failures are not swallowed before identity deletion', () => {
  const controller = read(controllerPath);
  const start = controller.indexOf('async function revokeEmployeeAuthenticationArtifacts');
  const end = controller.indexOf('// ─── 9. OFFBOARDING', start);
  const source = controller.slice(start, end);
  assert.ok(source.includes('Session.deleteMany'));
  assert.ok(source.includes('PasskeyCredential.deleteMany'));
  assert.ok(source.includes('OperatorSession.deleteMany'));
  assert.ok(source.includes('return Promise.all(operations)'));
  assert.equal(source.includes('.catch(() => null)'), false);
});

test('EMP-OFF-001: access revocation and termination preserve employee identity', () => {
  const controller = read(controllerPath);
  const start = controller.indexOf('const initiateOffboarding = asyncHandler');
  const end = controller.indexOf('// ─── 10. WORKFORCE INTEGRITY CHECKS', start);
  const source = controller.slice(start, end);
  assert.ok(source.includes('USE_DEDICATED_PERMANENT_DELETE_ENDPOINT'));
  assert.ok(source.includes("user.employmentStatus = 'EXITED'"));
  assert.ok(source.includes("user.accountStatus = 'DISABLED'"));
  assert.ok(source.includes('includePreferences: false'));
  assert.ok(source.includes('employee identity and HR history were preserved'));
  assert.equal(source.includes('User.deleteOne'), false);
});

test('EMP-OFF-002: offboarding audit authorization is required before access-state mutation', () => {
  const controller = read(controllerPath);
  const start = controller.indexOf('const initiateOffboarding = asyncHandler');
  const end = controller.indexOf('// ─── 10. WORKFORCE INTEGRITY CHECKS', start);
  const source = controller.slice(start, end);
  const audit = source.indexOf('OFFBOARD_EMPLOYEE_ACCESS_REVOCATION_AUTHORIZED');
  const save = source.indexOf('await user.save()');
  assert.ok(audit >= 0);
  assert.ok(save > audit);
  assert.ok(source.includes('EMPLOYEE_OFFBOARD_AUDIT_NOT_CONFIRMED'));
});

test('EMP-UI-001: non-Primary-Master UI cannot expose permanent deletion', () => {
  const frontend = read(frontendPath);
  assert.ok(frontend.includes('isViewerPrimaryMaster ?'));
  assert.ok(frontend.includes('Primary Master only: permanently delete account'));
  assert.ok(frontend.includes('Only the Primary Master may permanently delete an employee identity.'));
  assert.ok(frontend.includes('PERMANENTLY_DELETE_EMPLOYEE_ACCOUNT'));
  assert.ok(frontend.includes('/offboard`, payload'));
  assert.equal(frontend.includes('apiDelete(`/employees/${encodeURIComponent(userId)}`)'), false);
});

test('EMP-UI-002: offboarding no longer treats access revocation as permanent deletion', () => {
  const frontend = read(frontendPath);
  const start = frontend.indexOf('document.getElementById("offboard-staff-form")');
  const end = frontend.indexOf('function openEmployee360Drawer', start);
  const source = frontend.slice(start, end);
  assert.ok(source.toLowerCase().includes('access revoked'));
  assert.ok(source.toLowerCase().includes('identity and hr history were preserved'));
  assert.equal(source.includes('/delete'), false);
  assert.equal(source.toLowerCase().includes('permanently deleted'), false);
});
