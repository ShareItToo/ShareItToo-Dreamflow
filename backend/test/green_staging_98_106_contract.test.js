import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertDataTransition, assertLedger, digest, green98106, migrationInventory, newTableNames,
  readProtectedJson, safeError, validatePublication } from '../ops/green_staging_98_106_contract.mjs';

test('98 and 106 are exact current immutable migration ledgers', () => {
  const rows = migrationInventory();
  assert.equal(assertLedger(rows.slice(0, 98), 98), green98106.sourceLedger);
  assert.equal(assertLedger(rows, 106), green98106.targetLedger);
  for (const bad of [rows.slice(0, 105), [...rows].reverse(), rows.map((r, i) => i ? r : { ...r, checksum: '0'.repeat(64) })]) {
    assert.throws(() => assertLedger(bad, 106));
  }
});
test('only exact empty new namespaces may change; old business fingerprint cannot', () => {
  const before = { schema: 98, ledger: green98106.sourceLedger, business: { users: { count: 3, sha256: 'a'.repeat(64) } }, newTables: [] };
  const after = { ...structuredClone(before), schema: 106, ledger: green98106.targetLedger,
    newTables: newTableNames().map((name) => ({ name, count: 0 })) };
  assert.equal(assertDataTransition(before, after), true);
  for (const mutate of [v => { v.business.users.sha256 = 'b'.repeat(64); },
    v => { v.newTables.pop(); }, v => { v.newTables[0].count = 1; },
    v => { v.newTables[0].name = v.newTables[1].name; }, v => { v.ledger = 'a'.repeat(64); }]) {
    const bad = structuredClone(after); mutate(bad); assert.throws(() => assertDataTransition(before, bad));
  }
});
test('publication metadata is exact; synthetic digest is not publication evidence', () => {
  const value = { schemaVersion: 2, commit: green98106.runtimeCommit,
    tag: `ghcr.io/shareittoo/shareittoo-api:${green98106.runtimeCommit}`, digest: `sha256:${'a'.repeat(64)}`,
    workflow: 'regression', runId: '1', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow',
    eventName: 'workflow_dispatch', observedTagDigest: `sha256:${'a'.repeat(64)}`, observedOciRevision: green98106.runtimeCommit };
  assert.deepEqual(validatePublication(value), value);
  for (const patch of [{ observedOciRevision: '0'.repeat(40) }, { observedTagDigest: `sha256:${'b'.repeat(64)}` },
    { runAttempt: '0' }, { extra: true }, { commit: green98106.predecessorCommit }]) {
    assert.throws(() => validatePublication({ ...value, ...patch }));
  }
});
test('protected external JSON rejects permissions, symlinks, hardlinks and wrong bytes', () => {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-98-106-file-'));
  fs.chmodSync(temporary, 0o700);
  const file = path.join(temporary, 'binding.json'); const bytes = '{"safe":true}\n';
  try {
    fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
    assert.deepEqual(readProtectedJson(file, digest(bytes)), { safe: true });
    assert.throws(() => readProtectedJson(file, '0'.repeat(64)));
    fs.chmodSync(file, 0o644); assert.throws(() => readProtectedJson(file, digest(bytes))); fs.chmodSync(file, 0o600);
    fs.linkSync(file, path.join(temporary, 'link')); assert.throws(() => readProtectedJson(file, digest(bytes)));
    fs.unlinkSync(path.join(temporary, 'link')); fs.symlinkSync(file, path.join(temporary, 'symlink'));
    assert.throws(() => readProtectedJson(path.join(temporary, 'symlink'), digest(bytes)));
    fs.chmodSync(temporary, 0o755); assert.throws(() => readProtectedJson(file, digest(bytes)));
    assert.equal(safeError(new Error('secret')), 'green_98_106_operation_failed');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
