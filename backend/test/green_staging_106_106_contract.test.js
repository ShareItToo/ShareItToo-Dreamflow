import assert from 'node:assert/strict';
import test from 'node:test';
import { digest, migrationInventory } from '../ops/green_staging_98_106_contract.mjs';
import { assertUnchangedSchema106, planSuccessor, successorConfirmation, validateSchema106Snapshot,
  validateSuccessorImage, validateSuccessorPublication } from '../ops/green_staging_106_106_contract.mjs';

// Synthetic inputs exercise binding only, never publication or deployment proof.
function fixture() {
  const runtimeCommit = 'a'.repeat(40), sha = `sha256:${'b'.repeat(64)}`;
  const publication = { schemaVersion: 2, commit: runtimeCommit,
    tag: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: sha,
    workflow: 'regression', runId: '1', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow',
    eventName: 'workflow_dispatch', observedTagDigest: sha, observedOciRevision: runtimeCommit };
  const publicationBytes = Buffer.from(`${JSON.stringify(publication)}\n`);
  const expectedTables = ['mission_needs', 'users'];
  const schemaSnapshot = { schema: 106,
    ledgerRows: migrationInventory().map(r => ({ ...r, applied_at: '2026-10-07T12:00:00.000Z' })),
    tableNames: expectedTables, tables: { mission_needs: { count: 3, sha256: 'c'.repeat(64) },
      users: { count: 2, sha256: 'd'.repeat(64) } }, readinessSha256: 'e'.repeat(64) };
  return { runtimeCommit, publication, publicationBytes, publicationSha256: digest(publicationBytes), expectedTables, schemaSnapshot,
    imageReadback: { Id: `sha256:${'f'.repeat(64)}`, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${sha}`],
      Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit } } } };
}
test('successor plan is read-only and accepts populated existing Mission tables at unchanged schema106', () => {
  const f = fixture(), result = planSuccessor(f);
  assert.equal(result.runtimeCommit, f.runtimeCommit); assert.deepEqual(result.migrationRange, []);
  assert.equal(result.sourceSchema, 106); assert.equal(result.targetSchema, 106);
  assert.equal(result.collectionImplemented, true);
  for (const key of ['mutationAdapterImplemented', 'sourceBindingsVerified',
    'rehearsalPassed', 'promotionAuthorized', 'publicReleaseComplete']) assert.equal(result[key], false);
  assert.equal(assertUnchangedSchema106(f.schemaSnapshot, structuredClone(f.schemaSnapshot), f.expectedTables), true);
  assert.equal(planSuccessor({ ...f, mode: 'validate' }).status, 'contract_validated_no_execution');
});
test('exact publication bytes, source and all immutable publication metadata remain bound', () => {
  const f = fixture(); assert.deepEqual(validateSuccessorPublication(f.publicationBytes, f), f.publication);
  assert.throws(() => validateSuccessorPublication(Buffer.concat([f.publicationBytes, Buffer.from(' ')]), f));
  assert.throws(() => validateSuccessorPublication(f.publicationBytes, { ...f, runtimeCommit: 'c'.repeat(40) }));
  assert.throws(() => validateSuccessorPublication(f.publicationBytes, { ...f, runtimeCommit: [f.runtimeCommit] }));
  for (const patch of [{ schemaVersion: 1 }, { commit: 'c'.repeat(40) }, { tag: 'ghcr.io/shareittoo/shareittoo-api:latest' },
    { digest: 'bad' }, { observedTagDigest: `sha256:${'c'.repeat(64)}` }, { observedOciRevision: 'c'.repeat(40) },
    { repository: 'foreign/project' }, { workflow: 'foreign' }, { eventName: 'push' }, { runId: '0' }, { runAttempt: '0' },
    { runId: 1 }, { runAttempt: 1 }, { extra: true }]) {
    const bytes = Buffer.from(JSON.stringify({ ...f.publication, ...patch }));
    assert.throws(() => validateSuccessorPublication(bytes, { ...f, publicationSha256: digest(bytes) }));
  }
});
test('image identity requires immutable ID, RepoDigest and exact OCI revision together', () => {
  const f = fixture();
  for (const mutate of [i => { i.Id = 'latest'; }, i => { i.RepoDigests = []; },
    i => { i.Config.Labels['org.opencontainers.image.revision'] = 'c'.repeat(40); }]) {
    const image = structuredClone(f.imageReadback); mutate(image);
    assert.throws(() => validateSuccessorImage(image, f.publication));
  }
});
test('same-schema proof rejects ledger/time/table/content/readiness drift and missing inventories', () => {
  const f = fixture();
  for (const mutate of [s => { s.schema = 98; }, s => { s.ledgerRows.pop(); },
    s => { s.ledgerRows[0].checksum = '0'.repeat(64); }, s => { s.ledgerRows[0].applied_at = '2026-10-07T13:00:00.000Z'; },
    s => { s.tableNames = ['users']; }, s => { delete s.tables.mission_needs; },
    s => { s.tables.users.count++; }, s => { s.tables.mission_needs.sha256 = '0'.repeat(64); },
    s => { s.readinessSha256 = '0'.repeat(64); }, s => { s.tables.foreign = { count: 0, sha256: '0'.repeat(64) }; }]) {
    const after = structuredClone(f.schemaSnapshot); mutate(after);
    assert.throws(() => assertUnchangedSchema106(f.schemaSnapshot, after, f.expectedTables));
  }
  for (const names of [[], ['users', 'mission_needs'], ['users', 'users'], ['schema_migrations']]) {
    assert.throws(() => validateSchema106Snapshot(f.schemaSnapshot, names));
  }
});
test('rehearsal/promotion consent are distinct bindings and cannot enable mutation modes', () => {
  const f = fixture(), bound = { runtimeCommit: f.runtimeCommit, opsCommit: 'b'.repeat(40), targetSha256: 'c'.repeat(64), rehearsalSha256: 'd'.repeat(64) };
  assert.equal(successorConfirmation('rehearse', bound), `rehearse:${bound.runtimeCommit}:${bound.opsCommit}:${bound.targetSha256}`);
  assert.equal(successorConfirmation('promote', bound), `promote:${bound.runtimeCommit}:${bound.opsCommit}:${bound.rehearsalSha256}`);
  assert.throws(() => successorConfirmation('promote', { ...bound, rehearsalSha256: undefined }));
  for (const mode of ['collect', 'preflight', 'rehearse', 'promote', 'execute']) {
    assert.throws(() => planSuccessor({ ...f, mode, confirmation: successorConfirmation('promote', bound) }), /mutation_adapter_not_implemented/u);
  }
});
