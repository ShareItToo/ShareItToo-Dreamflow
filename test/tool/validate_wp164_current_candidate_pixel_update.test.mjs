import test from 'node:test';
import assert from 'node:assert/strict';

import { validateWp164CurrentCandidatePixelUpdate } from '../../tool/validate_wp164_current_candidate_pixel_update.mjs';

test('WP164 current candidate Pixel update evidence is exact and privacy-safe', () => {
  assert.deepEqual(validateWp164CurrentCandidatePixelUpdate(), {
    status: 'passed-data-preserving-pixel-update',
    versionCode: '2026091601',
  });
});
