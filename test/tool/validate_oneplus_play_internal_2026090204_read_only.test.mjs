import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateOnePlusPlayInternal2026090204ReadOnly,
} from '../../tool/validate_oneplus_play_internal_2026090204_read_only.mjs';

const root = new URL('../../', import.meta.url).pathname;
const source = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/oneplus-play-internal-2026090204-read-only.json',
  import.meta.url,
), 'utf8'));

function clone() {
  return structuredClone(source);
}

test('accepts the bounded exact-build OnePlus read-only and isolation evidence', () => {
  assert.deepEqual(validateOnePlusPlayInternal2026090204ReadOnly({
    root,
    evidence: clone(),
  }), {
    status: 'passed-bounded-read-only-account-isolation-with-open-fixture-drift',
    versionCode: '2026090204',
    physicalDevice: 'OnePlus CPH2581',
    guestReadOnlyPassed: true,
    twoRoleIsolationPassed: true,
    fullBindingBusinessJourneyPassed: false,
    legalGateRemainsOpen: true,
  });
});

test('rejects candidate, delivery, pass and mutation overclaims', () => {
  const mutations = [
    (value) => { value.candidate.versionCode = '2026090203'; },
    (value) => { value.device.delivery = 'direct-apk'; },
    (value) => { value.device.playAppSigningCertificateMatched = false; },
    (value) => { value.checks.owner.sessionPersistencePassed = false; },
    (value) => { value.checks.roleTransition.ownerDataAbsentUnderRenter = false; },
    (value) => { value.boundaries.listingMutation = true; },
  ];
  for (const mutate of mutations) {
    const value = clone();
    mutate(value);
    assert.throws(() => validateOnePlusPlayInternal2026090204ReadOnly({
      root,
      evidence: value,
    }));
  }
});

test('rejects hiding either known open gate', () => {
  for (const mutate of [
    (value) => { value.openFindings.publicCatalogContainsFixture = true; },
    (value) => { value.openFindings.catalogFilterCause = 'all-filters-passed'; },
    (value) => { value.openFindings.historicalBookingFixtureDrift = 'CLOSED'; },
    (value) => { value.openFindings.fullBindingBusinessJourney = 'PASSED'; },
    (value) => { value.openFindings.catalogFilterUnknownFields.pop(); },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validateOnePlusPlayInternal2026090204ReadOnly({
      root,
      evidence: value,
    }));
  }
});

test('rejects credential, tester, path and network material', () => {
  const credentialKey = ['pass', 'word'].join('');
  for (const unsafe of [
    { note: 'person@example.invalid' },
    { note: '/Users/person/private' },
    { note: '192.0.2.1' },
    { [credentialKey]: 'not-allowed' },
    { deviceSerial: 'not-allowed' },
  ]) {
    const value = clone();
    value.unsafe = unsafe;
    assert.throws(() => validateOnePlusPlayInternal2026090204ReadOnly({
      root,
      evidence: value,
    }));
  }
});
