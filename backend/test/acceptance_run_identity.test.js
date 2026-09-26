import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAcceptancePrincipalGateCompatibility,
  assertAcceptancePaymentPilotCompatibility,
  deriveAcceptancePrincipalIds,
  resolveAcceptanceBaseUrl,
  resolveAcceptanceRunId,
} from '../ops/acceptance_run_identity.mjs';

test('acceptance endpoint is explicit, absolute and normalized before a runner starts', () => {
  assert.throws(
    () => resolveAcceptanceBaseUrl({}),
    /acceptance_base_url_missing/u,
  );
  assert.throws(
    () => resolveAcceptanceBaseUrl({ ACCEPTANCE_BASE_URL: '' }),
    /acceptance_base_url_missing/u,
  );
  for (const value of [
    'http://api:8080',
    'http://api:8080/v1/extra',
    'http://user:pass@api:8080/v1',
    'http://api:8080/v1?probe=1',
    'http://api:8080/v1#probe',
    'ftp://api:8080/v1',
    ' http://api:8080/v1',
    'http://api:8080/v1 ',
  ]) {
    assert.throws(
      () => resolveAcceptanceBaseUrl({ ACCEPTANCE_BASE_URL: value }),
      /acceptance_base_url_invalid/u,
      value,
    );
  }
  assert.equal(
    resolveAcceptanceBaseUrl({ ACCEPTANCE_BASE_URL: 'http://api:8080/v1' }),
    'http://api:8080/v1',
  );
  assert.equal(
    resolveAcceptanceBaseUrl({ ACCEPTANCE_BASE_URL: 'https://clone.internal:8443/v1/' }),
    'https://clone.internal:8443/v1',
  );
  assert.equal(
    resolveAcceptanceBaseUrl({ ACCEPTANCE_BASE_URL: 'http://127.0.0.1:8080/v1/' }),
    'http://127.0.0.1:8080/v1',
  );
});

test('explicit B8 run IDs are strict and derive stable principal IDs', () => {
  const environment = { ACCEPTANCE_RUN_ID: 'b8-muh2n3rs-fed16b' };
  const runId = resolveAcceptanceRunId('b8', environment);
  assert.equal(runId, environment.ACCEPTANCE_RUN_ID);
  assert.deepEqual(
    deriveAcceptancePrincipalIds(runId, ['owner', 'renter', 'admin']),
    {
      owner: 'b8-muh2n3rs-fed16b-owner',
      renter: 'b8-muh2n3rs-fed16b-renter',
      admin: 'b8-muh2n3rs-fed16b-admin',
    },
  );
});

test('explicit run IDs reject wrong block, case, whitespace and malformed entropy', () => {
  for (const value of [
    'b9-muh2n3rs-fed16b',
    'b8-MUH2N3RS-fed16b',
    ' b8-muh2n3rs-fed16b',
    'b8-muh2n3rs-fed16',
    'b8-muh2n3rs-fed16b ',
  ]) {
    assert.throws(
      () => resolveAcceptanceRunId('b8', { ACCEPTANCE_RUN_ID: value }),
      /b8_acceptance_run_id_invalid/u,
    );
  }
});

test('enabled gate requires every exact principal and rejects wildcard allowlists', () => {
  const runId = 'b9-muh2n3rs-fed16b';
  const principals = Object.values(deriveAcceptancePrincipalIds(
    runId,
    ['owner', 'renter', 'outsider', 'support', 'admin'],
  ));
  const base = { SIT_STAGING_ACCESS_GATE_ENABLED: 'true' };
  assert.throws(
    () => assertAcceptancePrincipalGateCompatibility(runId, principals, base),
    /acceptance_principal_allowlist_missing/u,
  );
  assert.throws(
    () => assertAcceptancePrincipalGateCompatibility(runId, principals, {
      ...base,
      SIT_STAGING_ALLOWED_USER_IDS: `${principals.join(',')},*`,
    }),
    /acceptance_principal_allowlist_invalid/u,
  );
  assert.deepEqual(
    assertAcceptancePrincipalGateCompatibility(runId, principals, {
      ...base,
      SIT_STAGING_ALLOWED_USER_IDS: principals.join(','),
    }),
    { enabled: true, missing: [] },
  );
});

test('disabled gate does not hide principal compatibility checks behind a wildcard', () => {
  const runId = 'b8-muh2n3rs-fed16b';
  const principal = 'b8-muh2n3rs-fed16b-owner';
  assert.deepEqual(
    assertAcceptancePrincipalGateCompatibility(runId, [principal], {
      SIT_STAGING_ACCESS_GATE_ENABLED: 'false',
      SIT_STAGING_ALLOWED_USER_IDS: '',
    }),
    { enabled: false, missing: [] },
  );
});

test('memory payment pilot gate requires every exact B8 principal before mutation', () => {
  const runId = 'b8-muh2n3rs-fed16b';
  const principals = Object.values(deriveAcceptancePrincipalIds(runId, ['owner', 'renter', 'admin']));
  const base = { PAYMENT_TRANSPORT: 'memory' };
  assert.throws(
    () => assertAcceptancePaymentPilotCompatibility(runId, principals, base),
    /acceptance_payment_pilot_allowlist_missing/u,
  );
  assert.throws(
    () => assertAcceptancePaymentPilotCompatibility(runId, principals, {
      ...base,
      PAYMENT_PILOT_USER_IDS: `${principals[0]},${principals[1]},*`,
    }),
    /acceptance_payment_pilot_allowlist_invalid/u,
  );
  assert.throws(
    () => assertAcceptancePaymentPilotCompatibility(runId, principals, {
      ...base,
      PAYMENT_PILOT_USER_IDS: principals.slice(0, 2).join(','),
    }),
    /acceptance_payment_pilot_not_allowlisted:b8-muh2n3rs-fed16b-admin/u,
  );
  assert.deepEqual(
    assertAcceptancePaymentPilotCompatibility(runId, principals, {
      ...base,
      PAYMENT_PILOT_USER_IDS: principals.join(','),
    }),
    { enabled: true, missing: [] },
  );
});

test('non-memory payment transport does not activate the memory pilot gate', () => {
  const runId = 'b8-muh2n3rs-fed16b';
  const principal = 'b8-muh2n3rs-fed16b-owner';
  assert.deepEqual(
    assertAcceptancePaymentPilotCompatibility(runId, [principal], {
      PAYMENT_TRANSPORT: 'disabled',
      PAYMENT_PILOT_USER_IDS: '',
    }),
    { enabled: false, missing: [] },
  );
});
