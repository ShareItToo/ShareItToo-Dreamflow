import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp74DisputeTransferRecovery,
} from '../../tool/validate_wp74_dispute_transfer_recovery.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp74-dispute-transfer-recovery-20260909.json',
), 'utf8'));
const validatorSource = readFileSync(resolve(
  root,
  'tool/validate_wp74_dispute_transfer_recovery.mjs',
), 'utf8');

function validate(changed = evidence) {
  return validateWp74DisputeTransferRecovery({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts the exact WP74 payment-integrity evidence', () => {
  assert.deepEqual(validate(), {
    status: 'implemented-pending-full-regression',
    package: 'WP74',
    paidTransferRecovery: 'durable-idempotent-provider-bound',
    providerTrafficChanged: false,
  });
});

test('uses repository-bound source proof without installed backend dependencies', () => {
  assert.doesNotMatch(validatorSource, /backend\/node_modules/u);
  assert.match(validatorSource, /sourceAtImplementationHead/u);
});

test('rejects changed recovery outcomes, source hashes and live-boundary overclaims', () => {
  const outcome = structuredClone(evidence);
  outcome.outcomes.readiness = 'healthy-while-pending';
  assert.throws(() => validate(outcome), /outcomes/u);

  const source = structuredClone(evidence);
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);

  const boundary = structuredClone(evidence);
  boundary.boundaries.moneyMoved = true;
  assert.throws(() => validate(boundary), /boundary/u);
});

test('rejects incomplete completion claims and secret-shaped evidence', () => {
  const completion = structuredClone(evidence);
  completion.status = 'complete-local-github';
  assert.throws(() => validate(completion), /complete verification/u);

  const secret = structuredClone(evidence);
  secret.note = 'whsec_should_never_be-here';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});
