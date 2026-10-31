import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateV53LegalAssets } from '../../tool/validate_v53_legal_assets.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-v53-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(resolve(repositoryRoot, 'assets/legal'), resolve(root, 'assets/legal'), { recursive: true });
  return root;
}

test('accepts the nine-part sole-proprietor V5.3 draft without activation', () => {
  assert.deepEqual(validateV53LegalAssets({ repositoryRoot }), {
    status: 'draft-blocked', documentCount: 9, activationAllowed: false,
  });
});

test('rejects legacy company facts even when the mutated hash is refreshed', (t) => {
  const root = fixture(t);
  const asset = resolve(root, 'assets/legal/de/v53/part_i_imprint_withdrawal_shorttexts.html');
  const content = `${readFileSync(asset, 'utf8')}\nShareItToo UG`;
  writeFileSync(asset, content);
  const manifestPath = resolve(root, 'assets/legal/de/legal_manifest_v53.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.documents[8].sha256 = hash(content);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => validateV53LegalAssets({ repositoryRoot: root }), /contains legacy/u);
});

test('rejects a premature legal, payment, DSA, or maps activation', (t) => {
  const root = fixture(t);
  const manifestPath = resolve(root, 'assets/legal/de/legal_manifest_v53.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.activationAllowed = true;
  manifest.taxAndConsumerBoundaries.paymentOrPayoutEnabled = true;
  manifest.dsaBoundaries.noticeAndActionImplementationComplete = true;
  manifest.externalBoundaries.mapsConfigurationChanged = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => validateV53LegalAssets({ repositoryRoot: root }), /must remain false/u);
});
