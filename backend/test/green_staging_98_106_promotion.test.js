import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { digest, green98106, migrationInventory, networkMembers, objectDigest, repositoryRoot, requiredSourcePaths } from '../ops/green_staging_98_106_contract.mjs';
import { assertEnvironment, assertReadOnlyCommand, boundary, buildPlan, containerFingerprint, requiredEnvironment, runReadOnlyPreflight, validateGitBinding } from '../ops/green_staging_98_106_promotion.mjs';

// These deliberately synthetic values are test inputs, never a runtime manifest.
function fixture() {
  let counter = 1; const id = () => (counter++).toString(16).padStart(64, '0');
  const nets = [{ name: 'sit-green-network-20260918011528-wp254', id: id(), internal: true },
    { name: 'sit-staging-provider-egress', id: id(), internal: false }];
  const records = new Map();
  const make = (name, imageDigest, running) => {
    const record = { Id: id(), Image: `sha256:${id()}`, Name: `/${name}`, State: { Running: running, Paused: false },
      Config: { Image: `synthetic.invalid/image@${imageDigest}`,
        Env: [...Object.entries(requiredEnvironment).map(([k, v]) => `${k}=${v}`), 'SIT_STAGING_ALLOWED_USER_IDS=synthetic-test-user'], User: '1000:1000' },
      HostConfig: { Privileged: false, ReadonlyRootfs: true }, Mounts: [],
      NetworkSettings: { Networks: Object.fromEntries(nets.map(n => [n.name, { NetworkID: n.id }])) } };
    records.set(record.Id, record);
    return { name, id: record.Id, imageId: record.Image, imageDigest, configSha256: containerFingerprint(record) };
  };
  const api = make('shareittoo-staging-api', green98106.predecessorDigest, true);
  const database = make('sit-green-postgres-20260918011528-wp254', `sha256:${'b'.repeat(64)}`, true);
  delete records.get(database.id).NetworkSettings.Networks[nets[1].name];
  database.configSha256 = containerFingerprint(records.get(database.id));
  const witnesses = Array.from({ length: 21 }, (_, i) => make(`shareittoo-staging-api-synthetic-${i}`, `sha256:${'c'.repeat(64)}`, false));
  const router = { id: id(), name: 'synthetic-router' };
  for (const network of nets) records.set(network.id, { Id: network.id, Name: network.name,
    Internal: network.internal, Containers: { [api.id]: { Name: api.name },
      ...(network.internal ? { [database.id]: { Name: database.name }, [router.id]: { Name: router.name } } : {}) } });
  for (const network of nets) network.members = networkMembers(records.get(network.id).Containers);
  const volume = { Name: 'sit-green-uploads-20260918011528-wp254', Driver: 'local', Labels: { synthetic: 'true' } };
  const target = { kind: 'sit-green-staging-98-106-target', schemaVersion: 3, api, database, networks: nets,
    uploads: { name: volume.Name, configSha256: objectDigest(volume) }, witnesses,
    databaseUser: 'shareittoo_green', databaseName: 'shareittoo_green', sourceLedger: green98106.sourceLedger, targetLedger: green98106.targetLedger };
  const config = { kind: 'sit-green-staging-98-106-config', schemaVersion: 2, environment: 'test', firebaseAuthEnabled: true,
    emulatorEnabled: false, accessGateEnabled: true, allowedUsersSha256: digest('synthetic-test-user'), googleRegistrationEnabled: false,
    appleRevocationEnabled: false, appleAcquisitionEnabled: false, paymentTransport: 'memory', stripeLivemode: false,
    mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device',
    externalListingAiEnabled: false, technicalSandboxEnabled: false, mountsSha256: objectDigest([]),
    runtimeEnvironmentSha256: objectDigest(records.get(api.id).Config.Env) };
  const publication = { schemaVersion: 2, commit: green98106.runtimeCommit,
    tag: `ghcr.io/shareittoo/shareittoo-api:${green98106.runtimeCommit}`, digest: `sha256:${'e'.repeat(64)}`,
    workflow: 'regression', runId: '1', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow',
    eventName: 'workflow_dispatch', observedTagDigest: `sha256:${'e'.repeat(64)}`, observedOciRevision: green98106.runtimeCommit };
  const publicationSha256 = digest(`${JSON.stringify(publication, null, 2)}\n`);
  const ops = 'f'.repeat(40); const reviewed = 'a'.repeat(40);
  const sourceInventory = Object.fromEntries(requiredSourcePaths.map(p => [p, digest(fs.readFileSync(path.join(repositoryRoot, p)))]));
  const binding = { kind: green98106.kind, schemaVersion: 1, runtimeCommit: green98106.runtimeCommit,
    publicationSha256, reviewedImplementationCommit: reviewed, opsCommit: ops, sourceInventory,
    targetSha256: objectDigest(target), configSha256: objectDigest(config) };
  const inputs = { binding, publication, publicationSha256, target, config, actualOpsCommit: ops };
  const calls = [];
  const git = args => args[0] === 'rev-parse' ? ops : args[0] === 'merge-base' ? args[1]
    : fs.readFileSync(path.join(repositoryRoot, args[1].split(':')[1]), 'utf8');
  const command = async entry => {
    calls.push(entry);
    if (entry.phase === 'uploads_inspect') return JSON.stringify([volume]);
    if (entry.phase === 'runtime_image_inspect') return JSON.stringify([{ RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${publication.digest}`],
      Config: { Labels: { 'org.opencontainers.image.revision': green98106.runtimeCommit } } }]);
    if (entry.phase === 'ledger_readback') return JSON.stringify(migrationInventory().slice(0, 98));
    if (entry.phase === 'postgres_version') return '160015\n';
    return JSON.stringify([records.get(entry.args.at(-1))]);
  };
  return { inputs, records, calls, git, command };
}
test('stateful production-shaped executor reaches exact hard boundary without mutations', async () => {
  const f = fixture(); const result = await runReadOnlyPreflight(f.inputs, f);
  assert.equal(result.status, 'read_only_prefix_passed'); assert.equal(result.boundary, boundary);
  assert.equal(result.mutationAdapterImplemented, true); assert.equal(result.rehearsalPassed, false);
  assert.equal(result.promotionAuthorized, false);
  assert.equal(f.calls.length, 31);
  assert.ok(f.calls.every(c => !c.args.some(a => ['stop', 'rename', 'run', 'create', 'start', 'rm', 'connect'].includes(a))));
});
test('missing and drifted external bindings reject before any executor call', async () => {
  for (const mutate of [i => { delete i.binding.opsCommit; }, i => { i.binding.targetSha256 = '0'.repeat(64); },
    i => { i.publicationSha256 = '0'.repeat(64); }, i => { i.binding.sourceInventory[requiredSourcePaths[0]] = '0'.repeat(64); },
    i => { i.config.appleAcquisitionEnabled = true; }, i => { i.target.witnesses.pop(); }]) {
    const f = fixture(); mutate(f.inputs);
    await assert.rejects(runReadOnlyPreflight(f.inputs, f)); assert.equal(f.calls.length, 0);
  }
});
test('stateful running/config/network/ledger/image/PG drift fails closed', async () => {
  for (const phase of ['api_inspect', 'witness_inspect', 'network_inspect', 'runtime_image_inspect',
    'ledger_readback', 'postgres_version', 'api_recheck']) {
    const f = fixture(); const original = f.command;
    f.command = async entry => {
      const raw = await original(entry); if (entry.phase !== phase) return raw;
      if (phase === 'postgres_version') return '150010';
      if (phase === 'ledger_readback') return '[]';
      const value = JSON.parse(raw);
      if (phase === 'network_inspect') value[0].Containers['0'.repeat(64)] = { Name: 'foreign' };
      else if (phase === 'runtime_image_inspect') value[0].Config.Labels = {};
      else value[0].State.Paused = true;
      return JSON.stringify(value);
    };
    await assert.rejects(runReadOnlyPreflight(f.inputs, f));
    assert.ok(f.calls.every(c => !c.args.includes('stop')));
  }
});
test('review commit is external and bound to exact current implementation bytes', () => {
  const f = fixture(); assert.equal(validateGitBinding(f.inputs.binding, f), 'f'.repeat(40));
  assert.throws(() => validateGitBinding(f.inputs.binding, { git: () => '0'.repeat(40) }));
  const plan = buildPlan(f.inputs); assert.equal(plan.status, 'plan_only'); assert.equal(plan.mutationAdapterImplemented, true);
});
test('environment semantics reject hidden provider activation, emulator, duplicates and allowlist drift', () => {
  const f = fixture(); const env = f.records.get(f.inputs.target.api.id).Config.Env;
  for (const extra of ['APPLE_REVOCATION_ENABLED=true', 'APPLE_OWNERSHIP_ACQUISITION_ENABLED=true',
    'FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099', 'STRIPE_SECRET_KEY=synthetic', 'PAYMENT_TRANSPORT=memory']) {
    assert.throws(() => assertEnvironment([...env, extra], f.inputs.config));
  }
  assert.throws(() => assertEnvironment(env, { ...f.inputs.config, allowedUsersSha256: '0'.repeat(64) }));
});
test('executor allowlist rejects command injection and arbitrary SQL despite readback phase label', () => {
  for (const args of [['stop', 'a'.repeat(64)], ['inspect', '--help'], ['exec', 'a'.repeat(64), 'sh', '-c', 'true'],
    ['exec', 'a'.repeat(64), 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'shareittoo_green', '-d', 'shareittoo_green', '-At', '-c', 'DELETE FROM users']]) {
    assert.throws(() => assertReadOnlyCommand({ command: 'docker', phase: 'ledger_readback', args }));
  }
});
