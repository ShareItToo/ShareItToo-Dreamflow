import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateGooglePlayScreenshotCandidate } from '../../tool/validate_google_play_screenshot_candidate.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../docs/evidence/b11/google-play-screenshot-candidate-feed-2026081505.json', import.meta.url), 'utf8'));

async function fixture(mutate) {
  const root = await mkdtemp(join(tmpdir(), 'sit-screenshot-candidate-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, evidencePath };
}

test('accepts the visually approved exact-candidate local feed image', () => {
  assert.deepEqual(validateGooglePlayScreenshotCandidate({ repositoryRoot }), {
    status: 'exact-candidate-local-not-uploaded', scene: 'feed', width: 1080, height: 1920,
  });
});

test('accepts the visually approved exact-candidate local listing detail image', () => {
  assert.deepEqual(validateGooglePlayScreenshotCandidate({
    repositoryRoot,
    evidencePath: new URL(
      '../../docs/evidence/b11/google-play-screenshot-candidate-listing-detail-2026081505.json', import.meta.url).pathname,
  }), {
    status: 'exact-candidate-local-not-uploaded', scene: 'listing-detail', width: 1080, height: 1920,
  });
});

for (const [scene, file] of [
  ['search', 'google-play-screenshot-candidate-search-2026081505.json'],
  ['create-listing', 'google-play-screenshot-candidate-create-listing-2026081505.json'],
]) {
  test(`accepts the visually approved exact-candidate local ${scene} image`, () => {
    assert.equal(validateGooglePlayScreenshotCandidate({
      repositoryRoot,
      evidencePath: new URL(`../../docs/evidence/b11/${file}`, import.meta.url).pathname,
    }).scene, scene);
  });
}

test('rejects a screenshot digest mismatch', async (t) => {
  const data = await fixture((evidence) => { evidence.scene.sha256 = '0'.repeat(64); });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayScreenshotCandidate({ repositoryRoot, ...data }), /digest/);
});

test('rejects claiming the screenshot was uploaded', async (t) => {
  const data = await fixture((evidence) => { evidence.boundaries.screenshotUploaded = true; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayScreenshotCandidate({ repositoryRoot, ...data }), /boundaries/);
});
