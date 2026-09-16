import assert from 'node:assert/strict';
import test from 'node:test';

import { validateWp112PixelOnDeviceListingAi } from '../../tool/validate_wp112_pixel_on_device_listing_ai.mjs';

test('validates the exact physical Pixel on-device Listing-AI evidence', () => {
  const result = validateWp112PixelOnDeviceListingAi();
  assert.equal(result.status, 'passed-wp112-pixel-on-device-listing-ai-evidence');
  assert.equal(result.sourceInventoryEntries, 3);
});
