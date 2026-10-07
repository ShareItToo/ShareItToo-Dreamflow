import { createHash } from 'node:crypto';
import { assertLedger, equal, objectDigest } from './green_staging_98_106_contract.mjs';

// Successor contract only. No Docker, filesystem writes or mutation adapter.
export const successorKind = 'sit-green-staging-106-106';
const hash = /^[a-f0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const imageDigest = /^sha256:[a-f0-9]{64}$/u;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const imageName = 'ghcr.io/shareittoo/shareittoo-api';
const assert = (condition, code) => { if (!condition) throw new Error(`green_106_106_${code}`); };
function exact(value, keys, code) {
  assert(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && equal(Object.keys(value).sort(), [...keys].sort()), code);
}

export function validateSuccessorPublication(bytes, { publicationSha256, runtimeCommit }) {
  assert(matches(commit, runtimeCommit) && matches(hash, publicationSha256), 'publication_binding');
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 1048576, 'publication_bytes');
  assert(createHash('sha256').update(bytes).digest('hex') === publicationSha256, 'publication_bytes');
  let publication;
  try { publication = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('green_106_106_publication_json'); }
  exact(publication, ['schemaVersion', 'commit', 'tag', 'digest', 'workflow', 'runId', 'runAttempt',
    'repository', 'eventName', 'observedTagDigest', 'observedOciRevision'], 'publication_shape');
  assert(publication.schemaVersion === 2 && publication.commit === runtimeCommit
    && publication.tag === `${imageName}:${runtimeCommit}` && matches(imageDigest, publication.digest)
    && publication.observedTagDigest === publication.digest && publication.observedOciRevision === runtimeCommit
    && publication.workflow === 'regression' && publication.repository === 'ShareItToo/ShareItToo-Dreamflow'
    && publication.eventName === 'workflow_dispatch' && matches(/^[1-9][0-9]*$/u, publication.runId)
    && matches(/^[1-9][0-9]*$/u, publication.runAttempt), 'publication_identity');
  return Object.freeze(structuredClone(publication));
}

export function validateSuccessorImage(image, publication) {
  assert(matches(imageDigest, image?.Id) && Array.isArray(image?.RepoDigests)
    && image.RepoDigests.includes(`${imageName}@${publication.digest}`)
    && image.Config?.Labels?.['org.opencontainers.image.revision'] === publication.commit,
  'image_identity');
  return { imageId: image.Id, image: `${imageName}@${publication.digest}`, runtimeCommit: publication.commit };
}

export function validateSchema106Snapshot(snapshot, expectedTables) {
  exact(snapshot, ['schema', 'ledgerRows', 'tableNames', 'tables', 'readinessSha256'], 'snapshot_shape');
  assert(snapshot.schema === 106 && Array.isArray(snapshot.ledgerRows), 'snapshot_schema');
  const rows = snapshot.ledgerRows;
  for (const row of rows) {
    exact(row, ['name', 'checksum', 'applied_at'], 'snapshot_ledger_row');
    assert(typeof row.applied_at === 'string' && Number.isFinite(Date.parse(row.applied_at)), 'snapshot_ledger_time');
  }
  assertLedger(rows.map(({ name, checksum }) => ({ name, checksum })), 106);
  assert(Array.isArray(expectedTables) && expectedTables.length > 0
    && expectedTables.every(n => typeof n === 'string' && /^[a-z][a-z0-9_]+$/u.test(n) && n !== 'schema_migrations')
    && new Set(expectedTables).size === expectedTables.length
    && equal(expectedTables, [...expectedTables].sort()), 'snapshot_expected_tables');
  assert(equal(snapshot.tableNames, expectedTables), 'snapshot_table_inventory');
  exact(snapshot.tables, expectedTables, 'snapshot_tables');
  for (const table of Object.values(snapshot.tables)) {
    exact(table, ['count', 'sha256'], 'snapshot_table');
    assert(Number.isSafeInteger(table.count) && table.count >= 0 && matches(hash, table.sha256), 'snapshot_table');
  }
  assert(matches(hash, snapshot.readinessSha256), 'snapshot_readiness');
  return objectDigest(snapshot);
}

export function assertUnchangedSchema106(before, after, expectedTables) {
  const first = validateSchema106Snapshot(before, expectedTables);
  assert(validateSchema106Snapshot(after, expectedTables) === first, 'snapshot_changed');
  return true;
}

export function successorConfirmation(mode, { runtimeCommit, opsCommit, targetSha256, rehearsalSha256 }) {
  assert(['rehearse', 'promote'].includes(mode) && matches(commit, runtimeCommit)
    && matches(commit, opsCommit), 'confirmation_identity');
  const binding = mode === 'rehearse' ? targetSha256 : rehearsalSha256;
  assert(matches(hash, binding), 'confirmation_binding');
  return `${mode}:${runtimeCommit}:${opsCommit}:${binding}`;
}

export function planSuccessor({ mode = 'plan', publicationBytes, publicationSha256, runtimeCommit,
  imageReadback, schemaSnapshot, expectedTables }) {
  // A syntactically valid confirmation must never enable an unfinished runner.
  assert(mode === 'plan' || mode === 'validate', 'mutation_adapter_not_implemented');
  const publication = validateSuccessorPublication(publicationBytes, { publicationSha256, runtimeCommit });
  const image = validateSuccessorImage(imageReadback, publication);
  const sourceSnapshotSha256 = validateSchema106Snapshot(schemaSnapshot, expectedTables);
  return Object.freeze({ kind: successorKind, schemaVersion: 1, status: 'contract_validated_no_execution',
    ...image, publicationSha256, sourceSchema: 106, targetSchema: 106, migrationRange: [],
    sourceSnapshotSha256, mutationAdapterImplemented: false, collectionImplemented: true,
    sourceBindingsVerified: false, rehearsalPassed: false, promotionAuthorized: false,
    publicReleaseComplete: false, boundary: 'before_any_docker_call_or_write' });
}
