import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateGooglePlayAppContentProgress } from '../../tool/validate_google_play_app_content_progress.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../docs/evidence/b11/google-play-app-content-progress-2026081509-20260815.json',
  import.meta.url), 'utf8'));

async function fixture(mutate) {
  const root = await mkdtemp(join(tmpdir(), 'sit-play-progress-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, evidencePath };
}

test('accepts eleven saved and one fail-closed Play work area', () => {
  assert.deepEqual(validateGooglePlayAppContentProgress({ repositoryRoot }), {
    status: 'eleven-of-twelve-saved-one-open', totalTasks: 12,
    savedTasks: 11, openTasks: 1,
  });
});

test('rejects losing the saved privacy-policy task', async (t) => {
  const data = await fixture((evidence) => {
    evidence.consoleState.privacyPolicyUrlSaved = false;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /console state/);
});

test('rejects claiming the Data Safety draft was saved', async (t) => {
  const data = await fixture((evidence) => {
    evidence.consoleState.dataSafetyDraftSaved = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /console state/);
});

test('rejects claiming the Data Safety form was submitted', async (t) => {
  const data = await fixture((evidence) => {
    evidence.consoleState.dataSafetySubmitted = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /console state/);
});

test('rejects hiding the single open Data Safety task', async (t) => {
  const data = await fixture((evidence) => {
    evidence.counts.savedTasks = 12;
    evidence.counts.openTasks = 0;
    evidence.openTasks = {};
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /task counts|Data Safety/);
});

test('rejects a stale current Internal candidate binding', async (t) => {
  const data = await fixture((evidence) => {
    evidence.candidate.currentInternalBuildNumber = '2026081508';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /stale or not bound/);
});

test('rejects replacing an authoritative evidence reference', async (t) => {
  const data = await fixture((evidence) => {
    evidence.authoritativeSources.currentCandidateBindingRef = 'store/device-validation.json';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /authoritative sources/);
});

test('rejects external side effects or unsanitized account data', async (t) => {
  const data = await fixture((evidence) => {
    evidence.boundaries.reviewSubmitted = true;
    evidence.note = 'private@example.invalid';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentProgress({ repositoryRoot, ...data }),
    /unsafe or unsanitized/);
});
