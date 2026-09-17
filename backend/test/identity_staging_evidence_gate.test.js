import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateIdentityStagingEvidence } from '../ops/validate_identity_staging_evidence.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const now = Date.parse('2026-09-17T12:00:00.000Z');

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sit-identity-evidence-'));
  const file = join(root, 'evidence.json');
  writeFileSync(file, JSON.stringify({
    kind: 'sit-stripe-identity-staging-account-evidence',
    commit,
    pilotId: 'heilbronn_wave0',
    mode: 'test',
    country: 'DE',
    accountId: 'acct_testidentitystaging',
    accountContextHash: 'a'.repeat(64),
    readbackMethod: 'owner_dashboard_readback',
    privacyPolicyUrl: 'https://shareittoo.com/privacy',
    privacyReadbackHash: 'b'.repeat(64),
    privacyIdentityNoticeMarkers: [
      'identity-test-staging-only-v1',
      'identity-test-consent-art6a',
      'identity-test-provider-redaction',
      'identity-test-stripe-retention-caveat',
    ],
    identityApplicationEnabled: true,
    brandingReviewed: true,
    accountBound: true,
    legalFactsBound: true,
    stripeRole: 'mixed',
    feesCollector: 'application',
    lossesCollector: 'application',
    contractingEntity: 'Stripe Payments Europe, Limited',
    processingLocations: ['EU', 'US'],
    transferMechanisms: ['scc', 'eu_us_dpf'],
    officialSourceUrls: [
      'https://stripe.com/de/legal/privacy-center',
      'https://stripe.com/de/legal/dpa',
    ],
    legalFactsObservedAt: '2026-09-17T11:00:00.000Z',
    observedAt: '2026-09-17T11:00:00.000Z',
    ...overrides,
  }));
  chmodSync(file, 0o600);
  return { root, file };
}

test('identity staging evidence is bound to commit, pilot and fresh test account readback', () => {
  const { file } = fixture();
  const result = validateIdentityStagingEvidence({
    evidenceFile: file,
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    now,
  });
  assert.equal(result.commit, commit);
});

test('identity staging evidence fails closed for stale or mismatched readback', () => {
  const { file } = fixture({ observedAt: '2026-09-15T11:00:00.000Z' });
  assert.throws(() => validateIdentityStagingEvidence({
    evidenceFile: file,
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    now,
  }), /evidence gate failed/u);
});

test('identity staging evidence rejects symlink paths', () => {
  const { root, file } = fixture();
  const link = join(root, 'link.json');
  symlinkSync(file, link);
  assert.throws(() => validateIdentityStagingEvidence({
    evidenceFile: link,
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    now,
  }), /evidence gate failed/u);
});
