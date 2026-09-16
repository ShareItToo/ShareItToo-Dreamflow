import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateV54LegalAssets } from '../../tool/validate_v54_legal_assets.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-v54-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(resolve(repositoryRoot, 'assets'), resolve(root, 'assets'), { recursive: true });
  cpSync(resolve(repositoryRoot, 'backend/src'), resolve(root, 'backend/src'), { recursive: true });
  return root;
}

test('accepts the inactive nine-part V5.4 AI-correction draft', () => {
  assert.deepEqual(validateV54LegalAssets({ repositoryRoot }), {
    status: 'draft-blocked-after-ai-corrections',
    documentCount: 9,
    activeBindingVersion: 'V5.2-2026-08-16',
    preparedInactiveVersion: 'V5.4-2026-09-15',
    activationAllowed: false,
  });
});

test('rejects activation or a debtor-creditor role reversal', (t) => {
  const root = fixture(t);
  const manifestPath = resolve(root, 'assets/legal/de/legal_manifest_v54.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.activationAllowed = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => validateV54LegalAssets({ repositoryRoot: root }),
    /activationAllowed must remain false/u,
  );

  manifest.activationAllowed = false;
  manifest.receiptRoles.rentDebtor = 'private-owner';
  manifest.receiptRoles.rentCreditorAndServiceProvider = 'renter';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => validateV54LegalAssets({ repositoryRoot: root }),
    /receipt and debtor-creditor roles is invalid/u,
  );
});

test('rejects a rehashed legal text that drops the proposed checkout warning', (t) => {
  const root = fixture(t);
  const documentPath = resolve(root, 'assets/legal/de/v54/part_i_imprint_withdrawal_shorttexts.html');
  const content = readFileSync(documentPath, 'utf8')
    .replace('Zahlungspflichtige Mietanfrage senden', 'Weiter');
  writeFileSync(documentPath, content);
  const manifestPath = resolve(root, 'assets/legal/de/legal_manifest_v54.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.documents[8].sha256 = sha256(content);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => validateV54LegalAssets({ repositoryRoot: root }),
    /document I is missing Zahlungspflichtige Mietanfrage senden/u,
  );
});

test('rejects selecting V5.4 as active even if the draft manifest remains unchanged', () => {
  const path = 'backend/src/legal_contract_version_registry.js';
  const registry = readFileSync(resolve(repositoryRoot, path), 'utf8')
    .replace(
      "activeBindingContractVersion = 'V5.2-2026-08-16'",
      "activeBindingContractVersion = 'V5.4-2026-09-15'",
    );
  assert.throws(
    () => validateV54LegalAssets({ repositoryRoot, sourceTexts: { [path]: registry } }),
    /runtime registry is missing activeBindingContractVersion/u,
  );
});

test('rejects mutation of the preserved V5.2 or V5.3 predecessor', () => {
  const path = 'assets/legal/de/legal_manifest_v53.json';
  const text = `${readFileSync(resolve(repositoryRoot, path), 'utf8')}\n`;
  assert.throws(
    () => validateV54LegalAssets({ repositoryRoot, sourceTexts: { [path]: text } }),
    /historical V5.3 manifest hash is invalid/u,
  );
});
