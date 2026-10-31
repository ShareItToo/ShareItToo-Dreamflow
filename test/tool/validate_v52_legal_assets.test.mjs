import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateV52LegalAssets } from '../../tool/validate_v52_legal_assets.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const preservedV51ManifestSha256 = '6cffec53a27f84b24a44aebad50afd6e7ce17a4c196c7946155fba743fdc161f';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-v52-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(
    resolve(repositoryRoot, 'assets/legal'),
    resolve(root, 'assets/legal'),
    { recursive: true },
  );
  return root;
}

function readManifest(root) {
  const path = resolve(root, 'assets/legal/de/legal_manifest_v52.json');
  return { path, manifest: JSON.parse(readFileSync(path, 'utf8')) };
}

function writeManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('accepts exactly nine inactive hash-bound V5.2 user assets while preserving V5.1', () => {
  const result = validateV52LegalAssets({ repositoryRoot });
  assert.equal(result.status, 'draft-blocked');
  assert.equal(result.documentCount, 9);
  assert.equal(result.sourcePages, 55);
  assert.equal(
    sha256(readFileSync(resolve(repositoryRoot, 'assets/legal/de/legal_manifest_v5.json'))),
    preservedV51ManifestSha256,
  );
});

test('rejects content drift after V5.2 legal asset generation', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/v52/part_a_platform_terms.html');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nchanged`);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /legal asset hash drift/,
  );
});

test('rejects premature activation while V5.2 facts and approvals remain open', (t) => {
  const root = fixture(t);
  const { path, manifest } = readManifest(root);
  manifest.status = 'approved';
  manifest.activationAllowed = true;
  manifest.productionProvisioningAllowed = true;
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /must remain an inactive draft/,
  );
});

test('rejects a V5.2 bundle bound to another Drive source or PDF hash', (t) => {
  const root = fixture(t);
  const { path, manifest } = readManifest(root);
  manifest.source.driveFileId = 'another-file';
  manifest.source.sha256 = '0'.repeat(64);
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /source binding does not match/,
  );
});

test('rejects hiding an open operator or provider fact', (t) => {
  const root = fixture(t);
  const { path, manifest } = readManifest(root);
  manifest.openFacts = manifest.openFacts.filter(
    (fact) => fact !== 'marketplacePspContractRegionAndActivationEvidence',
  );
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /hides a mandatory open operator, provider, or publication fact/,
  );
});

test('rejects changing an authoritative A-I source page range', (t) => {
  const root = fixture(t);
  const { path, manifest } = readManifest(root);
  manifest.documents[7].sourcePages = [35, 36, 37, 38, 39, 40];
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /Invalid V5.2 legal document entry for part H/,
  );
});

test('rejects internal source parts J-L even when an injected asset hash is refreshed', (t) => {
  const root = fixture(t);
  const assetPath = resolve(root, 'assets/legal/de/v52/part_i_imprint_withdrawal_shorttexts.html');
  const content = `${readFileSync(assetPath, 'utf8')}\nTeil J - interner Anhang`;
  writeFileSync(assetPath, content);
  const { path, manifest } = readManifest(root);
  manifest.documents[8].sha256 = sha256(content);
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /Internal V5.2 source part leaked/,
  );
});

test('rejects executable content even when an injected asset hash is refreshed', (t) => {
  const root = fixture(t);
  const assetPath = resolve(root, 'assets/legal/de/v52/part_f_community_safety.html');
  const content = `${readFileSync(assetPath, 'utf8')}\n<script src="https://example.invalid/x.js"></script>`;
  writeFileSync(assetPath, content);
  const { path, manifest } = readManifest(root);
  manifest.documents[5].sha256 = sha256(content);
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /contains executable, interactive, or remote content/,
  );
});

test('rejects silently removing a live placeholder from a source-bound part', (t) => {
  const root = fixture(t);
  const assetPath = resolve(root, 'assets/legal/de/v52/part_a_platform_terms.html');
  const content = readFileSync(assetPath, 'utf8').replaceAll(
    '[VOR LIVEGANG EINTRAGEN:',
    '[ANGABE:',
  );
  writeFileSync(assetPath, content);
  const { path, manifest } = readManifest(root);
  manifest.documents[0].sha256 = sha256(content);
  writeManifest(path, manifest);
  assert.throws(
    () => validateV52LegalAssets({ repositoryRoot: root }),
    /legal placeholder topology drift/,
  );
});
