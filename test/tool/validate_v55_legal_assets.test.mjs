import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateV55LegalAssets } from '../../tool/validate_v55_legal_assets.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('accepts the inactive nine-part V5.5 position-review successor', () => {
  assert.deepEqual(validateV55LegalAssets({ repositoryRoot }), {
    status: 'draft-blocked-after-position-review-correction',
    documentCount: 9,
    activeBindingVersion: 'V5.2-2026-08-16',
    preparedInactiveVersion: 'V5.5-2026-09-15',
    activationAllowed: false,
  });
});

test('rejects activation and removal of exact position isolation', () => {
  const path = 'assets/legal/de/legal_manifest_v55.json';
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
  manifest.activationAllowed = true;
  assert.throws(
    () => validateV55LegalAssets({
      repositoryRoot,
      sourceTexts: { [path]: `${JSON.stringify(manifest, null, 2)}\n` },
    }),
    /activationAllowed must remain false/u,
  );

  manifest.activationAllowed = false;
  manifest.contractModel.positionReview.scope = 'whole-group';
  assert.throws(
    () => validateV55LegalAssets({
      repositoryRoot,
      sourceTexts: { [path]: `${JSON.stringify(manifest, null, 2)}\n` },
    }),
    /position review contract is invalid/u,
  );
});

test('rejects rehashed legal text that drops unrelated-position release', () => {
  const documentPath = 'assets/legal/de/v55/part_d_handover_return_damage.html';
  const content = readFileSync(resolve(repositoryRoot, documentPath), 'utf8')
    .replace('Unstreitige Anteile und andere Positionen', 'Alle Positionen');
  const manifestPath = 'assets/legal/de/legal_manifest_v55.json';
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'));
  manifest.documents[3].sha256 = sha256(content);
  assert.throws(
    () => validateV55LegalAssets({
      repositoryRoot,
      sourceTexts: {
        [documentPath]: content,
        [manifestPath]: `${JSON.stringify(manifest, null, 2)}\n`,
      },
    }),
    /documents are missing Unstreitige Anteile und andere Positionen/u,
  );
});

test('rejects predecessor mutation and runtime activation of V5.5', () => {
  const predecessorPath = 'assets/legal/de/legal_manifest_v54.json';
  const predecessor = `${readFileSync(resolve(repositoryRoot, predecessorPath), 'utf8')}\n`;
  assert.throws(
    () => validateV55LegalAssets({
      repositoryRoot,
      sourceTexts: { [predecessorPath]: predecessor },
    }),
    /historical manifest hash is invalid/u,
  );

  const registryPath = 'backend/src/legal_contract_version_registry.js';
  const registry = readFileSync(resolve(repositoryRoot, registryPath), 'utf8')
    .replace(
      "activeBindingContractVersion = 'V5.2-2026-08-16'",
      "activeBindingContractVersion = 'V5.5-2026-09-15'",
    );
  assert.throws(
    () => validateV55LegalAssets({
      repositoryRoot,
      sourceTexts: { [registryPath]: registry },
    }),
    /runtime registry is missing activeBindingContractVersion/u,
  );
});
