import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateGooglePlayAppContentHandoff } from '../../tool/validate_google_play_app_content_handoff.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(
  new URL('../../store/google-play/app-content-handoff.json', import.meta.url), 'utf8'));
const technicalRegression = await readFile(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');

async function fixture(mutate = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-play-content-'));
  const handoff = structuredClone(canonical);
  mutate(handoff);
  const handoffPath = join(root, 'handoff.json');
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  return { root, handoffPath };
}

function validate(overrides = {}) {
  return validateGooglePlayAppContentHandoff({
    repositoryRoot,
    allowCandidateRollover: true,
    ...overrides,
  });
}

test('accepts eleven saved Play tasks while Data Safety alone remains stopped', () => {
  const result = validate();
  assert.deepEqual(result, { taskCount: 12, buildNumber: canonical.candidate.buildNumber });
});

test('rejects losing the saved privacy-policy proof', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.privacyPolicy.status = 'blocked-public-route-approval';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data), /product truth/);
});

test('keeps strict candidate binding unless an internal rollover is explicit', async (t) => {
  const data = await fixture((handoff) => {
    handoff.candidate.buildNumber = String(BigInt(canonical.candidate.buildNumber) - 1n);
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateGooglePlayAppContentHandoff({
    repositoryRoot,
    handoffPath: data.handoffPath,
  }),
    /internal Staging candidate/);
});

test('technical regression explicitly enables the bounded internal rollover path', () => {
  assert.match(
    technicalRegression,
    /validate_google_play_app_content_handoff\.mjs --allow-candidate-rollover/u,
  );
});

test('rejects losing the completed owner-approved IARC state', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.contentRating.iarcTermsAccepted = false;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects omitting the user-controlled precise location share', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.contentRating.preciseDeviceLocationSharedByUser = false;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects claiming Advertising ID use for the current binary', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.advertisingId.proposedAnswer = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects selecting a social-network category for the rental marketplace', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.contentRating.category = 'social-or-communication';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects claiming ads for the current binary', async (t) => {
  const data = await fixture((handoff) => { handoff.tasks.ads.proposedAnswer = true; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects lowering the prepared target audience below eighteen', async (t) => {
  const data = await fixture((handoff) => { handoff.tasks.targetAudience.minimumAge = 13; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects enabling review submission', async (t) => {
  const data = await fixture((handoff) => { handoff.hardStops.sendForReview = false; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /hardStops.sendForReview/);
});

test('rejects claiming OAuth support before the providers are available', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.dataSafety.oauthPreparedButUnavailable = false;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects a Data safety type count that includes free documents', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.dataSafety.dataTypesPrepared = 18;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects a stale Data Safety handoff that is not bound to the full answer matrix', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.dataSafety.answerMatrixEvidenceRef =
      'docs/evidence/b11/google-play-data-safety-datatypes-20260812.json';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('rejects a Data Safety handoff without the provider-role classification', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.dataSafety.providerClassificationEvidenceRef =
      'docs/evidence/b11/google-play-data-safety-answer-matrix-20260813.json';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /product truth/);
});

test('binds the unchanged answer projection to the current internal candidate', () => {
  const result = validate();
  assert.equal(result.buildNumber, canonical.candidate.buildNumber);
  assert.match(
    canonical.tasks.dataSafety.currentCandidateBindingEvidenceRef,
    /2026081509/u,
  );
});

test('rejects a stale current-candidate Data Safety binding', async (t) => {
  const data = await fixture((handoff) => {
    handoff.tasks.dataSafety.currentCandidateBindingEvidenceRef =
      'docs/evidence/b11/google-play-data-safety-answer-matrix-2026081505-20260815.json';
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data), /product truth/);
});

test('rejects an app-content handoff that loses the current Google-provider evidence', async (t) => {
  const data = await fixture((handoff) => {
    handoff.evidenceRefs = handoff.evidenceRefs.filter(
      (ref) => ref !== 'docs/evidence/b11/firebase-google-signin-provider-20260815.json',
    );
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data), /evidence references/i);
});

test('rejects credential or account data', async (t) => {
  const data = await fixture((handoff) => { handoff.account = 'private@example.test'; });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validate(data),
    /sanitized/);
});
