import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateGooglePlayScreenshotReadiness } from '../../tool/validate_google_play_screenshot_readiness.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(
  new URL('../../docs/evidence/b11/google-play-feed-screenshot-compatibility-2026081509-20260815.json', import.meta.url), 'utf8'));
const historicalCompatibility = new URL(
  '../../docs/evidence/b11/google-play-feed-screenshot-compatibility-2026081405-20260814.json',
  import.meta.url,
).pathname;

async function fixture(mutate) {
  const root = await mkdtemp(join(tmpdir(), 'sit-screenshot-ready-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, evidencePath };
}

test('accepts the current candidate when Store-visible screenshot flows are unchanged', () => {
  assert.deepEqual(validateGooglePlayScreenshotReadiness({ repositoryRoot }), {
    status: 'verified-compatible-no-visible-product-change',
    curatedListingCount: 4,
  });
});

test('rejects preserved compatibility evidence once the exact candidate advances', () => {
  assert.throws(() => validateGooglePlayScreenshotReadiness({
    repositoryRoot,
    evidencePath: historicalCompatibility,
  }), /not bound to the exact current candidate/);
});

test('rejects exact-candidate readiness when visual acceptance is missing', async (t) => {
  const data = await fixture((evidence) => { evidence.compatibilityReview.screenshotsNeedRecapture = true; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayScreenshotReadiness({ repositoryRoot, ...data }),
    /incomplete or contradicts/);
});

test('rejects losing the exact Console draft upload', async (t) => {
  const data = await fixture((evidence) => { evidence.boundaries.screenshotUploadedDuringReview = true; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayScreenshotReadiness({ repositoryRoot, ...data }),
    /must not claim Store changes/);
});
