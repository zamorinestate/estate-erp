'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCanonicalReportingActor,
  isPrimaryMasterAuth,
} = require('../src/reporting/reportingAuthority');
const {
  ROLE_AUTHORITY_MATRIX,
  resolveReportScope,
} = require('../src/reporting/reportingScope');
const { ReportRegistry } = require('../src/reporting/reportRegistry');
const { ForecastRegistry } = require('../src/reporting/forecastRegistry');
const {
  calculateDiagnosticExceptions,
} = require('../src/reporting/calculations/diagnosticCalculations');
const {
  ROLE_VISIBILITY_CREATE_PERMISSIONS,
} = require('../src/reporting/calculations/reportingProductivityCalculations');

describe('Retired MASTER reporting security boundary', () => {
  const primary = {
    userId: 'MU-PRIMARY-TEST',
    role: 'MASTER',
    isPrimaryMaster: true,
    organisationId: 'ORG-TEST',
  };

  const retired = {
    userId: 'MU-RETIRED-TEST',
    role: 'MASTER',
    isPrimaryMaster: false,
    organisationId: 'ORG-TEST',
  };

  it('recognizes MASTER authority only with explicit isPrimaryMaster=true', () => {
    assert.equal(isPrimaryMasterAuth(primary), true);
    assert.equal(isPrimaryMasterAuth(retired), false);
    assert.deepEqual(assertCanonicalReportingActor(primary), {
      role: 'MASTER',
      isPrimaryMaster: true,
    });
  });

  it('rejects a non-primary MASTER at the canonical reporting authority boundary', () => {
    assert.throws(
      () => assertCanonicalReportingActor(retired),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('contains exactly one MASTER-derived authority type in reporting scope', () => {
    const masterDerivedAuthorityKeys = Object.keys(ROLE_AUTHORITY_MATRIX)
      .filter((key) => key.endsWith('_MASTER'));
    assert.deepEqual(masterDerivedAuthorityKeys, ['PRIMARY_MASTER']);
    assert.deepEqual(
      Object.keys(ROLE_AUTHORITY_MATRIX).sort(),
      ['CAFE_ADMIN', 'OWNER', 'PRIMARY_MASTER', 'STAFF'].sort()
    );
  });

  it('rejects retired MASTER before report scope resolution', () => {
    assert.throws(
      () => resolveReportScope({ auth: retired, query: {} }),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('rejects retired MASTER before registry role or permission evaluation', () => {
    assert.throws(
      () => ReportRegistry.assertReportAccess('daily-sales', {
        ...retired,
        permissions: ['REPORTS_READ'],
      }),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('rejects retired MASTER from forecasting', () => {
    assert.throws(
      () => ForecastRegistry.assertForecastTargetAccess('NET_SALES', retired),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
    assert.throws(
      () => ForecastRegistry.resolveAuthorizedCafeScope(retired, null),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('rejects retired MASTER from direct diagnostic calculation calls', async () => {
    await assert.rejects(
      () => calculateDiagnosticExceptions({
        preloadedExceptions: [],
        auth: retired,
      }),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('exposes organisation-shared creation only through PRIMARY_MASTER among MASTER-derived authorities', () => {
    const masterDerivedAuthorityKeys = Object.keys(ROLE_VISIBILITY_CREATE_PERMISSIONS)
      .filter((key) => key.endsWith('_MASTER'));
    assert.deepEqual(masterDerivedAuthorityKeys, ['PRIMARY_MASTER']);
    assert.ok(ROLE_VISIBILITY_CREATE_PERMISSIONS.PRIMARY_MASTER.includes('SHARED_ORGANISATION'));
  });
});
