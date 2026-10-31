import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const plan = readFileSync(
  new URL('../../docs/operations/CLOSED_ANDROID_PILOT_TEST_AND_MEASUREMENT_PLAN.md', import.meta.url),
  'utf8',
);

test('PF5 contains every required Stage A scenario and result field', () => {
  for (const marker of [
    'A01 — Create listing',
    'A02 — Direct search and Discover',
    'A03 — Gemerkt',
    'A04 — Non-reserving Mietkorb',
    'A05 — Send rental request',
    'A06 — Owner accepts request',
    'A07 — Owner rejects request',
    'A08 — Availability change and conflict',
    'A09 — Handover',
    'A10 — Return, damage and needsReview',
    'A11 — Cancellation and withdrawal',
    'A12 — Support and safety routing',
    'A13 — Privacy export and deletion request',
    'A14 — Controlled crash/force-stop and restart',
    'A15 — Offline, WLAN switch and resume',
    '**Role/prerequisites:**',
    '**Steps:**',
    '**Expected:**',
    '**Evidence:**',
    '**Never store:**',
    '**Pilot decision:**',
  ]) {
    assert.equal(plan.includes(marker), true, `PF5 scenario marker missing: ${marker}`);
  }
});

test('PF5 measurement definitions are denominator-safe and planning-only', () => {
  for (const marker of [
    'Project/search start',
    'Mietkorb',
    'Request',
    'Acceptance',
    'Completed flow',
    'Handover success',
    'Abort reason',
    'Support need',
    'Walid time',
    'User understanding',
    'Rebooking intent',
    'missing observations are `unavailable`, never zero',
    'not actual counts',
    'not-run',
  ]) {
    assert.equal(plan.includes(marker), true, `PF5 measurement marker missing: ${marker}`);
  }
});

test('PF5 preserves privacy, payment, activation and gate boundaries', () => {
  for (const marker of [
    'P0 | Security, legal, privacy or data-integrity defect',
    'P1 | Primary Stage A flow cannot complete',
    'Network names, BSSIDs, passwords, IPs',
    'Support file upload off',
    'Synthetic/test payment only.',
    'PILOT_STAGE_A_DECISION_NO_GO',
    'PILOT_STAGE_A_DECISION_GO',
    'Neither token is issued by this plan.',
  ]) {
    assert.equal(plan.includes(marker), true, `PF5 safety boundary missing: ${marker}`);
  }
  assert.equal(plan.includes('Status: **PLANNING ONLY — HOLD / NO-GO**'), true);
});
