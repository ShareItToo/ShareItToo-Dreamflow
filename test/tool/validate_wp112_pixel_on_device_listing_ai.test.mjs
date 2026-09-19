import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateWp112PixelOnDeviceListingAi } from '../../tool/validate_wp112_pixel_on_device_listing_ai.mjs';

test('validates the exact physical Pixel on-device Listing-AI evidence', () => {
  const result = validateWp112PixelOnDeviceListingAi();
  assert.equal(result.status, 'passed-wp112-pixel-on-device-listing-ai-evidence');
  assert.equal(result.sourceInventoryEntries, 3);
});

test('fails closed when historical runner binding or stored digest is altered', () => {
  const evidence = JSON.parse(readFileSync(new URL(
    '../../docs/evidence/release-readiness/wp112-pixel-on-device-listing-ai-20260911.json',
    import.meta.url,
  ), 'utf8'));
  for (const mutate of [
    (value) => { value.runnerSourceCommit = '0'.repeat(40); },
    (value) => { value.sourceInventory['tool/diagnose_android_on_device_listing_ai.mjs'] = '0'.repeat(64); },
  ]) {
    const mutated = structuredClone(evidence);
    mutate(mutated);
    assert.throws(() => validateWp112PixelOnDeviceListingAi({ evidence: mutated }), /WP112|historical/u);
  }
});
