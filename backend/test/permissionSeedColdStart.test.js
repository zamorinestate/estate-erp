'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RolePermission,
} = require('../src/models/RolePermission');
const {
  SequenceCounter,
} = require('../src/models/SequenceCounter');
const {
  DEFAULT_PERMISSION_RULES,
  seedPermissionRules,
} = require('../src/scripts/seedInitialData');

function makeExistingRule(rule) {
  return {
    role: rule.role,
    permissionCode: rule.permissionCode,
    scope: rule.scope,
    module: rule.module,
    resource: rule.resource,
    action: rule.action,
    effect: rule.effect,
    description: rule.description,
    requiresMfa: Boolean(rule.requiresMfa),
    requiresStepUpAuthentication: Boolean(
      rule.requiresStepUpAuthentication
    ),
    requiresReason: Boolean(rule.requiresReason),
    requiresAuditEvent:
      rule.requiresAuditEvent !== false,
    requiresReauthentication: Boolean(
      rule.requiresReauthentication
    ),
    policyVersion: 1,
    isActive: true,
    archivedAt: null,
    save: async () => {
      throw new Error(
        'Unchanged permission rules must not be saved.'
      );
    },
  };
}

test('steady-state permission reconciliation uses one rule read instead of one query per default rule', async (t) => {
  const existingRules =
    DEFAULT_PERMISSION_RULES.map(
      makeExistingRule
    );

  let findCalls = 0;
  let findOneCalls = 0;
  let createCalls = 0;
  let sequenceCalls = 0;

  t.mock.method(
    RolePermission,
    'find',
    async () => {
      findCalls += 1;
      return existingRules;
    }
  );

  t.mock.method(
    RolePermission,
    'findOne',
    async () => {
      findOneCalls += 1;
      throw new Error(
        'Per-rule findOne() must not be used.'
      );
    }
  );

  t.mock.method(
    RolePermission,
    'create',
    async () => {
      createCalls += 1;
      throw new Error(
        'Steady-state reconciliation must not create rules.'
      );
    }
  );

  t.mock.method(
    SequenceCounter,
    'generateId',
    async () => {
      sequenceCalls += 1;
      throw new Error(
        'Steady-state reconciliation must not allocate IDs.'
      );
    }
  );

  await seedPermissionRules({
    organisationId: 'ZAMORIN',
    masterUserId: 'MU-0001',
  });

  assert.equal(
    existingRules.length,
    DEFAULT_PERMISSION_RULES.length
  );
  assert.equal(findCalls, 1);
  assert.equal(findOneCalls, 0);
  assert.equal(createCalls, 0);
  assert.equal(sequenceCalls, 0);
});

test('stale permission rules are deactivated from the same preloaded snapshot', async (t) => {
  let staleSaveCalls = 0;
  const staleRule = {
    role: 'STAFF',
    permissionCode: 'RETIRED_PERMISSION',
    isActive: true,
    archivedAt: null,
    policyVersion: 1,
    save: async function () {
      staleSaveCalls += 1;
      return this;
    },
  };

  t.mock.method(
    RolePermission,
    'find',
    async () => [
      ...DEFAULT_PERMISSION_RULES.map(
        makeExistingRule
      ),
      staleRule,
    ]
  );

  t.mock.method(
    RolePermission,
    'create',
    async () => {
      throw new Error(
        'No permission creation expected.'
      );
    }
  );

  t.mock.method(
    SequenceCounter,
    'generateId',
    async () => {
      throw new Error(
        'No sequence allocation expected.'
      );
    }
  );

  await seedPermissionRules({
    organisationId: 'ZAMORIN',
    masterUserId: 'MU-0001',
  });

  assert.equal(staleSaveCalls, 1);
  assert.equal(staleRule.isActive, false);
  assert.ok(staleRule.archivedAt instanceof Date);
  assert.equal(
    staleRule.updatedBy,
    'MU-0001'
  );
});
