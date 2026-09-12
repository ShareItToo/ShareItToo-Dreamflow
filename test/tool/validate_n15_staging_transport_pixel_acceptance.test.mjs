import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN15StagingTransportPixelAcceptance,
} from '../../tool/validate_n15_staging_transport_pixel_acceptance.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n15-staging-transport-pixel-acceptance-2026090303.json',
), 'utf8'));

test('accepts the sanitized N15 Staging transport and Pixel evidence', () => {
  assert.equal(validateN15StagingTransportPixelAcceptance(evidence), evidence);
});

test('rejects a false completed-email claim', () => {
  const changed = structuredClone(evidence);
  changed.emailVerification.verificationLinksFollowed = 2;
  assert.throws(
    () => validateN15StagingTransportPixelAcceptance(changed),
    /followed verification links/,
  );
});

test('rejects a binding or paid diagnostic claim', () => {
  for (const [key, value] of [
    ['contractCreatedDuringProbe', true],
    ['paymentEndpointCalled', true],
    ['stripeLivemode', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.isolation[key] = value;
    assert.throws(
      () => validateN15StagingTransportPixelAcceptance(changed),
      new RegExp(key),
    );
  }
});
