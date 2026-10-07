import fs from "node:fs";
import { digest, migrationInventory, repositoryRoot } from "../../ops/green_staging_98_106_contract.mjs";
import { requiredEnvironment } from "../../ops/green_staging_98_106_promotion.mjs";
import { successorSourcePaths } from "../../ops/green_staging_106_106_binding.mjs";
export const hex = n => n.toString(16).padStart(64, '0');
export function fixture() {
  const runtimeCommit = 'a'.repeat(40), opsCommit = 'b'.repeat(40), revision = 'c'.repeat(40);
  const descriptor = (n, name) => ({ id: hex(n), name, imageId: `sha256:${hex(n + 10)}`, imageDigest: `sha256:${hex(n + 20)}` });
  const api = { ...descriptor(1, 'canonical-api'), runtimeCommit: revision }, database = descriptor(2, 'canonical-db');
  const witness = descriptor(3, 'sealed-api');
  const networks = [{ id: hex(31), name: 'internal', internal: true }, { id: hex(32), name: 'provider', internal: false }];
  const candidateImageId = `sha256:${hex(50)}`, publishedDigest = `sha256:${hex(51)}`;
  const publication = { schemaVersion: 2, commit: runtimeCommit, tag: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`,
    digest: publishedDigest, workflow: 'regression', runId: '1', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow',
    eventName: 'workflow_dispatch', observedTagDigest: publishedDigest, observedOciRevision: runtimeCommit };
  const publicationBytes = Buffer.from(JSON.stringify(publication));
  const binding = { kind: 'sit-green-staging-106-106-binding', schemaVersion: 1, opsCommit, reviewedCommit: opsCommit,
    runtimeCommit, publicationSha256: digest(publicationBytes), candidateImageId,
    sourceInventory: Object.fromEntries(successorSourcePaths().map(p => [p, digest(fs.readFileSync(`${repositoryRoot}/${p}`))])),
    scope: { api, database, witnesses: [witness], networks, uploads: 'green-uploads', databaseUser: 'synthetic', databaseName: 'synthetic' } };
  const git = args => args[0] === 'show' ? fs.readFileSync(`${repositoryRoot}/${args[1].split(':').slice(1).join(':')}`)
    : args[0] === 'ls-tree' ? migrationInventory().map(r => r.name).join('\n') : opsCommit;
  const records = {};
  for (const c of [api, database, witness]) {
    records[c.id] = { Id: c.id, Name: `/${c.name}`, Image: c.imageId,
      State: { Running: c !== witness, Paused: false }, Config: { Labels: { 'com.shareittoo.sit.green': 'true' },
        Env: [...Object.entries(requiredEnvironment).map(([k, v]) => `${k}=${v}`), 'SIT_STAGING_ALLOWED_USER_IDS=synthetic-only'] },
      HostConfig: { ReadonlyRootfs: true }, Mounts: [{ Type: 'volume', Name: 'green-uploads', Destination: '/app/uploads', RW: true }],
      NetworkSettings: { Networks: Object.fromEntries(networks.map(n => [n.name, { NetworkID: n.id }])) } };
    records[c.imageId] = { Id: c.imageId, RepoDigests: [`synthetic@${c.imageDigest}`], Config: { Labels: { 'org.opencontainers.image.revision': revision } } };
  }
  records[candidateImageId] = { Id: candidateImageId, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${publishedDigest}`],
    Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit } } };
  for (const n of networks) records[n.id] = { Id: n.id, Name: n.name, Internal: n.internal,
    Containers: { [api.id]: { Name: api.name }, ...(n.internal ? { [database.id]: { Name: database.name }, [hex(60)]: { Name: 'router' } } : {}) } };
  records['green-uploads'] = { Name: 'green-uploads', Driver: 'local' };
  const watchdog = { singleton: true, worker_version: 'support-deadline-watchdog-v1', last_started_at: '2020-01-01T00:00:00.000Z',
    last_succeeded_at: '2020-01-01T00:00:00.000Z', last_failed_at: null, last_error_code: null,
    last_inspected_count: 0, last_alert_count: 0, attempt_count: 1, success_count: 1, updated_at: '2020-01-01T00:00:00.000Z' };
  const sqlRows = [migrationInventory().map(r => ({ ...r, applied_at: '2020-01-01T00:00:00.000Z' })),
    { mission_needs: { count: 3, sha256: hex(70) }, users: { count: 2, sha256: hex(71) } }, [watchdog],
    { paymentRecoveryNeedsReview: [], supportNextUpdateOverdue: [] }];
  const calls = [];
  const command = async entry => {
    calls.push(structuredClone(entry));
    if (entry.args[0] === 'ps') return [api.id, database.id, witness.id].join('\n');
    if (entry.args[0] === 'exec') return sqlRows.map(r => JSON.stringify(r)).join('\n');
    return JSON.stringify([records[entry.args.at(-1)]]);
  };
  return { binding, publicationBytes, git, records, sqlRows, calls, command };
}
