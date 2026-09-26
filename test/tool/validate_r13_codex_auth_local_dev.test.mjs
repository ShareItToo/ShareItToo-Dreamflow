import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR13CodexAuthLocalDev } from '../../tool/validate_r13_codex_auth_local_dev.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r13-codex-auth-local-dev-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR13CodexAuthLocalDev({ repositoryRoot: root, evidence: changed });
}

test('accepts exact local Codex subscription-auth evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-local-evaluation-regression-and-codeql-passed',
    classification: 'CODEX_AUTH_LOCAL_DEV_SUPPORTED',
    authMode: 'chatgpt',
    apiBilling: false,
    runtimeProviderEligible: false,
    next48hPackage: 'R3',
  });
});

test('rejects GitHub success or historical external-check overclaims', () => {
  const regression = structuredClone(evidence);
  regression.githubVerification.regression.flutterRegression = 'failure';
  assert.throws(() => validate(regression), /GitHub verification/u);

  const external = structuredClone(evidence);
  external.githubVerification.preExistingExternalHistoryCheck.currentConclusion = 'success';
  assert.throws(() => validate(external), /GitHub verification/u);
});

test('rejects API billing or runtime entitlement overclaims', () => {
  const billing = structuredClone(evidence);
  billing.boundaries.apiBillingEnabled = true;
  assert.throws(() => validate(billing), /live boundary/u);

  const runtime = structuredClone(evidence);
  runtime.officialSupport.sitRuntimeEntitlement = true;
  assert.throws(() => validate(runtime), /official support boundary/u);
});

test('rejects credential extraction or unsupported auth claims', () => {
  const token = structuredClone(evidence);
  token.observedLocalAuth.oauthTokenReadOrCopied = true;
  assert.throws(() => validate(token), /authentication boundary/u);

  const auth = structuredClone(evidence);
  auth.observedLocalAuth.loginStatus = 'api-key';
  assert.throws(() => validate(auth), /authentication boundary/u);
});

test('rejects non-synthetic, authoritative or publishing evaluations', () => {
  const real = structuredClone(evidence);
  real.verifiedEvaluation.synthetic = false;
  assert.throws(() => validate(real), /verified evaluation/u);

  const publish = structuredClone(evidence);
  publish.verifiedEvaluation.publicationAllowed = true;
  assert.throws(() => validate(publish), /verified evaluation/u);
});

test('rejects secret-shaped or private evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'owner@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
