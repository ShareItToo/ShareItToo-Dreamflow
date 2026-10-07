import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateV51LegalAssets } from '../../tool/validate_v51_legal_assets.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-v51-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(
    resolve(repositoryRoot, 'assets/legal'),
    resolve(root, 'assets/legal'),
    { recursive: true },
  );
  return root;
}

test('accepts the complete inactive hash-bound V5.1 legal asset bundle', () => {
  const result = validateV51LegalAssets({ repositoryRoot });
  assert.equal(result.status, 'draft-blocked');
  assert.equal(result.documentCount, 7);
});

test('rejects content drift after legal text review', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/platform_terms_v5.html');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nchanged`);
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /legal asset hash drift/,
  );
});

test('rejects premature activation while operator facts remain open', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.status = 'approved';
  manifest.activationAllowed = true;
  manifest.productionProvisioningAllowed = true;
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /must remain an inactive draft/,
  );
});

test('rejects a legal bundle bound to another source PDF', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.source.sha256 = '0'.repeat(64);
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /not bound to the reviewed 54-page source PDF/,
  );
});

test('rejects coupling or silently removing retained Push and Crashlytics', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.productDecisions.firebaseCloudMessaging.independentFromCrashlytics = false;
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /independent Push and Crashlytics decision/,
  );
});

test('rejects hiding the source supersession while activation evidence remains open', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.knownConflicts = [];
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /source supersession for retained Push and Crashlytics/,
  );
});

test('rejects treating the product successor decision as an activation approval', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.knownConflicts[0].status = 'resolved';
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(
    () => validateV51LegalAssets({ repositoryRoot: root }),
    /source supersession for retained Push and Crashlytics/,
  );
});
