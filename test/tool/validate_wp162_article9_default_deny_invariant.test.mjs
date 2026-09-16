import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateWp162Article9DefaultDenyInvariant,
  wp162Article9SourcePaths,
} from '../../tool/validate_wp162_article9_default_deny_invariant.mjs';

const repositoryRoot = new URL('../..', import.meta.url).pathname;

async function currentSources() {
  return Object.fromEntries(await Promise.all(
    wp162Article9SourcePaths.map(async (path) => [
      path,
      await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'),
    ]),
  ));
}

test('denies sensitive handling even when backend readiness is HTTP 200', async () => {
  const result = validateWp162Article9DefaultDenyInvariant({
    repositoryRoot,
    sourceTexts: await currentSources(),
    backendReadyStatus: 200,
  });
  assert.equal(result.status, 'passed-default-deny-independent-of-readiness');
  assert.equal(result.sensitiveFlow, 'denied');
  assert.equal(result.denialCode, 'article9_server_authorization_required');
});

test('rejects a backend fixture with the Article 9 default-deny guard removed', async () => {
  const sources = await currentSources();
  sources['backend/src/special_category_data_guard.js'] = sources[
    'backend/src/special_category_data_guard.js'
  ].replace(
    "  if (!isTrustedServerArticle9Authorization(serverSideArticle9Authorization)) {",
    '  if (false) {',
  );
  assert.throws(
    () => validateWp162Article9DefaultDenyInvariant({
      repositoryRoot,
      sourceTexts: sources,
      backendReadyStatus: 200,
    }),
    /Article 9 guard marker missing/u,
  );
});

test('rejects a backend fixture that persists evidence before the Article 9 denial', async () => {
  const sources = await currentSources();
  const workflow = sources['backend/src/support_evidence_workflow.js'];
  const denial = "  if (metadata.specialCategoryClassification === 'possible_special_category'\n"
    + "      || isArticle9ProductSafetyCase) {\n"
    + "    throw new SupportCaseError(\n"
    + "      409,\n"
    + "      'support_evidence_article9_server_authorization_required',\n"
    + '    );\n'
    + '  }\n';
  sources['backend/src/support_evidence_workflow.js'] = workflow.replace(denial, '') + `\n${denial}`;
  assert.throws(
    () => validateWp162Article9DefaultDenyInvariant({
      repositoryRoot,
      sourceTexts: sources,
      backendReadyStatus: 200,
    }),
    /Article 9 denial must precede file persistence/u,
  );
});
