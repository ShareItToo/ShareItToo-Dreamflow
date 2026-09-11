import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp111PixelFcmIconVisualReview,
} from '../../tool/validate_wp111_pixel_fcm_icon_visual_review.mjs';

const evidence = JSON.parse(readFileSync(
  new URL(
    '../../docs/evidence/release-readiness/wp111-pixel-fcm-icon-visual-review-20260911.json',
    import.meta.url,
  ),
  'utf8',
));

test('WP111 validates the exact private Pixel FCM icon review', () => {
  const result = validateWp111PixelFcmIconVisualReview(structuredClone(evidence));
  assert.equal(result.status, 'passed-wp111-pixel-fcm-icon-visual-review-evidence');
  assert.equal(result.privateCaptureCommitted, false);
});

test('WP111 rejects a generic or blank notification icon observation', () => {
  const changed = structuredClone(evidence);
  changed.visualReview.blankOrGenericPlaceholder = true;
  assert.throws(
    () => validateWp111PixelFcmIconVisualReview(changed),
    /blankOrGenericPlaceholder is not exact/u,
  );
});

test('WP111 rejects committing the private notification-shade capture', () => {
  const changed = structuredClone(evidence);
  changed.boundaries.privateScreenshotCommitted = true;
  assert.throws(
    () => validateWp111PixelFcmIconVisualReview(changed),
    /privateScreenshotCommitted is not exact/u,
  );
});
