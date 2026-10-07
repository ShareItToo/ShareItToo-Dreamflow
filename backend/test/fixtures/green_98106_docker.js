// Stateful Docker/SQL model only. It is NOT live or image-execution evidence.
import fs from 'node:fs';
import path from 'node:path';
import { green98106, digest, migrationInventory, newTableNames, objectDigest, repositoryRoot, requiredSourcePaths } from '../../ops/green_staging_98_106_contract.mjs';
import { canonicalMounts, containerFingerprint, requiredEnvironment } from '../../ops/green_staging_98_106_promotion.mjs';
import { historicalWitnesses } from '../../ops/green_staging_98_106_collector.mjs';

export function dockerFixture() {
  let sequence = 1; const id = () => (sequence++).toString(16).padStart(64, '0');
  const records = new Map(); const images = new Map(); const volumes = new Set(); const calls = [];
  const nets = [{ name: 'sit-green-network-20260918011528-wp254', id: id(), internal: true },
    { name: 'sit-staging-provider-egress', id: id(), internal: false }];
  for (const n of nets) records.set(n.id, { Id: n.id, Name: n.name, Internal: n.internal, Driver: 'bridge', Containers: {}, Labels: {} });
  const image = (reference, revision, postgres = false) => {
    const imageId = `sha256:${id()}`;
    const value = { Id: imageId, RepoDigests: [reference.replace(/:[^/:]+@/u, '@')], Config: {
      User: postgres ? '' : 'shareittoo', Env: ['PATH=/usr/local/bin:/usr/bin:/bin', ...(postgres ? ['PG_MAJOR=16'] : [`APP_COMMIT=${revision}`])],
      Entrypoint: postgres ? ['docker-entrypoint.sh'] : null, Cmd: postgres ? ['postgres'] : ['node', 'src/server.js'],
      Labels: revision ? { 'org.opencontainers.image.revision': revision } : {},
    } };
    images.set(reference, value); images.set(imageId, value); return value;
  };
  const publication = { schemaVersion: 2, commit: green98106.runtimeCommit,
    tag: `ghcr.io/shareittoo/shareittoo-api:${green98106.runtimeCommit}`,
    digest: 'sha256:abaf153e6918af696bce88ecccfe40ce4877e0d551f24972baeccc69cf29cf3e', workflow: 'regression',
    runId: '37191503997', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow', eventName: 'workflow_dispatch',
    observedTagDigest: 'sha256:abaf153e6918af696bce88ecccfe40ce4877e0d551f24972baeccc69cf29cf3e', observedOciRevision: green98106.runtimeCommit };
  const currentImage = image(`${publication.tag}@${publication.digest}`, green98106.runtimeCommit);
  const postgresImage = image(green98106.postgresImage, null, true);
  const env = { ...requiredEnvironment, DATABASE_URL: 'postgresql://shareittoo_green:synthetic@' + 'sit-green-postgres-20260918011528-wp254/shareittoo_green', JWT_SECRET: 'synthetic-not-a-real-secret' };
  const make = (name, reference, digestValue, running, imageValue) => {
    const img = imageValue ?? image(reference.includes('@') ? reference : `${reference}@${digestValue}`, 'synthetic-revision');
    const value = { Id: id(), Image: img.Id, Name: `/${name}`,
      State: { Running: running, Paused: false, Status: running ? 'running' : 'exited', ExitCode: 0 },
      Config: { Image: reference, User: img.Config.User, Entrypoint: img.Config.Entrypoint,
        Cmd: img.Config.Cmd, Env: Object.entries({ ...Object.fromEntries(img.Config.Env.map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)])), ...env,
          SIT_STAGING_ALLOWED_USER_IDS: 'synthetic-unit-owner' }).map(([k, v]) => `${k}=${v}`),
        Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': '20260918011528-wp254' } },
      HostConfig: { Privileged: false, RestartPolicy: { Name: 'no', MaximumRetryCount: 0 }, GroupAdd: ['65532'], NetworkMode: nets[0].id, PortBindings: null },
      Mounts: [], NetworkSettings: { Networks: Object.fromEntries(nets.map((n, i) => [n.name,
        { NetworkID: n.id, IPAddress: `172.${20 + i}.0.${name.includes('postgres') ? 2 : 3}`, EndpointID: id(), Aliases: [name] }])) } };
    records.set(value.Id, value);
    if (running) for (const n of nets) records.get(n.id).Containers[value.Id] = { Name: name };
    return value;
  };
  const api = make('shareittoo-staging-api', `ghcr.io/shareittoo/shareittoo-api:${green98106.predecessorCommit}@${green98106.predecessorDigest}`, green98106.predecessorDigest, true);
  const database = make('sit-green-postgres-20260918011528-wp254', green98106.postgresImage, green98106.postgresImage.split('@')[1], true, postgresImage);
  delete database.Config.Labels['com.shareittoo.sit.green.run_id'];
  database.NetworkSettings.Networks = { [nets[0].name]: database.NetworkSettings.Networks[nets[0].name] };
  delete records.get(nets[1].id).Containers[database.Id];
  const witnesses = historicalWitnesses.map(w => make(w.name, w.image ?? `ghcr.io/shareittoo/shareittoo-api:d3c2f5d7@${w.imageDigest}`, w.imageDigest, false));
  api.Mounts = [
    { Type: 'bind', Source: '/protected/synthetic/mfa', Destination: '/run/secrets/mfa-encryption-key', RW: false },
    { Type: 'bind', Source: '/protected/synthetic/firebase', Destination: '/run/secrets/firebase-service-account.json', RW: false },
    { Type: 'volume', Name: 'sit-green-uploads-20260918011528-wp254', Source: '/protected/synthetic/uploads', Destination: '/data/uploads', RW: true },
  ];
  for (const witness of witnesses) witness.Mounts = structuredClone(api.Mounts);
  const descriptor = (r, imageDigest) => ({ name: r.Name.slice(1), id: r.Id, imageId: r.Image, imageDigest, configSha256: containerFingerprint(r) });
  const upload = { Name: 'sit-green-uploads-20260918011528-wp254', Driver: 'local', Labels: {} };
  volumes.add(upload.Name);
  const target = { kind: 'sit-green-staging-98-106-target', schemaVersion: 2, api: descriptor(api, green98106.predecessorDigest),
    database: descriptor(database, green98106.postgresImage.split('@')[1]), networks: nets,
    uploads: { name: upload.Name, configSha256: objectDigest(upload) }, witnesses: witnesses.map((r, i) => descriptor(r, historicalWitnesses[i].imageDigest)),
    databaseUser: 'shareittoo_green', databaseName: 'shareittoo_green', sourceLedger: green98106.sourceLedger, targetLedger: green98106.targetLedger };
  const config = { kind: 'sit-green-staging-98-106-config', schemaVersion: 2, environment: 'test', firebaseAuthEnabled: true,
    emulatorEnabled: false, accessGateEnabled: true, allowedUsersSha256: digest('synthetic-unit-owner'), googleRegistrationEnabled: false,
    appleRevocationEnabled: false, appleAcquisitionEnabled: false, paymentTransport: 'memory', stripeLivemode: false,
    mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device', externalListingAiEnabled: false,
    technicalSandboxEnabled: false, mountsSha256: objectDigest(canonicalMounts(api.Mounts)), runtimeEnvironmentSha256: objectDigest(api.Config.Env) };
  const ops = 'f'.repeat(40), review = 'a'.repeat(40);
  const publicationSha256 = digest(`${JSON.stringify(publication, null, 2)}\n`);
  const sourceInventory = Object.fromEntries(requiredSourcePaths.map(p => [p, digest(fs.readFileSync(path.join(repositoryRoot, p)))]));
  const inputs = { publication, publicationSha256, target, config,
    binding: { kind: green98106.kind, schemaVersion: 1, runtimeCommit: green98106.runtimeCommit, publicationSha256,
      reviewedImplementationCommit: review, opsCommit: ops, sourceInventory, targetSha256: objectDigest(target), configSha256: objectDigest(config) },
    privateRuntime: { kind: 'sit-green-staging-98-106-private-runtime', schemaVersion: 1, collectedAt: new Date().toISOString(),
      api: structuredClone(api), acceptanceMfaFile: '/protected/synthetic/acceptance-mfa' } };
  const ledgers = migrationInventory().map(r => ({ ...r, applied_at: '2026-10-04T00:00:00.000Z' }));
  const dbStates = new Map([[database.Id, { schema: 98, business: { users: { count: 1, sha256: '3'.repeat(64) }, auth_identities: { count: 1, sha256: '4'.repeat(64) } } }]]);
  const functions = migrationInventory().slice(98).flatMap(({ name }) => [...fs.readFileSync(path.join(repositoryRoot, 'backend/sql/migrations', name), 'utf8')
    .matchAll(/^CREATE(?: OR REPLACE)? FUNCTION ([a-z][a-z0-9_]+)\(/gmu)].map(m => m[1]));
  const materials = { mfaFile: '/protected/synthetic/mfa', firebaseFile: '/protected/synthetic/firebase', acceptanceMfaFile: '/protected/synthetic/acceptance-mfa',
    mfaSha256: '1'.repeat(64), firebaseSha256: '2'.repeat(64), recheck() {}, close() {} };
  const losses = new Set(); const beforeFailures = new Set(); let foreignWriters = 0;
  const findRecord = identity => records.get(identity) ?? [...records.values()].find(r => r.Name === identity || r.Name === `/${identity}`);
  const createContainer = entry => {
    const args = entry.args; const fields = { env: {}, labels: {}, mounts: [], groups: [], ports: {} }; let index = 1;
    while (args[index]?.startsWith('--')) {
      const option = args[index++]; const value = args[index++];
      if (option === '--env') fields.env[value] = entry.env[value];
      else if (option === '--label') fields.labels[value.slice(0, value.indexOf('='))] = value.slice(value.indexOf('=') + 1);
      else if (option === '--group-add') fields.groups.push(value);
      else if (option === '--publish') fields.ports['8080/tcp'] = [{ HostIp: '127.0.0.1', HostPort: '18082' }];
      else if (option === '--mount') {
        const m = Object.fromEntries(value.split(',').map(x => { const split = x.indexOf('='); return split < 0 ? [x, true] : [x.slice(0, split), x.slice(split + 1)]; }));
        const volumeName = m.type === 'volume' ? m.src ?? id() : undefined;
        if (volumeName) volumes.add(volumeName);
        fields.mounts.push({ Type: m.type, Destination: m.dst, RW: m.readonly !== true,
          ...(m.type === 'bind' ? { Source: m.src } : { Name: volumeName, Source: `/var/lib/docker/volumes/${volumeName}/_data` }) });
      } else fields[option.slice(2)] = value;
    }
    const reference = args[index++]; const img = images.get(reference); if (!img) throw new Error('synthetic_missing_image');
    const baseEnv = Object.fromEntries(img.Config.Env.map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
    const network = records.get(fields.network);
    const value = { Id: id(), Image: img.Id, Name: `/${fields.name}`, State: { Running: false, Paused: false, Status: 'created', ExitCode: 0 },
      Config: { Image: reference, User: img.Config.User, Labels: { ...img.Config.Labels, ...fields.labels },
        Env: Object.entries({ ...baseEnv, ...fields.env }).map(([k, v]) => `${k}=${v}`),
        Entrypoint: fields.entrypoint ? [fields.entrypoint] : img.Config.Entrypoint, Cmd: args.slice(index).length ? args.slice(index) : img.Config.Cmd },
      HostConfig: { Privileged: false, RestartPolicy: { Name: 'no', MaximumRetryCount: 0 }, NetworkMode: fields.network,
        GroupAdd: fields.groups, PortBindings: Object.keys(fields.ports).length ? fields.ports : null },
      Mounts: fields.mounts, NetworkSettings: { Networks: network ? { [network.Name]: { NetworkID: '', IPAddress: '', EndpointID: '', Aliases: [fields.name] } } : { none: { NetworkID: '' } } } };
    records.set(value.Id, value); return value.Id;
  };
  const dispatch = async entry => {
    calls.push(entry);
    if (beforeFailures.delete(entry.phase)) throw new Error('synthetic_before_effect');
    const a = entry.args; let out = '';
    if (a[0] === 'inspect') out = JSON.stringify([findRecord(a[1])]);
    else if (a[0] === 'image' && a[1] === 'inspect') out = JSON.stringify([images.get(a[2])]);
    else if (a[0] === 'network' && a[1] === 'inspect') out = JSON.stringify([findRecord(a[2])]);
    else if (a[0] === 'volume' && a[1] === 'inspect') out = JSON.stringify([upload]);
    else if (a[0] === 'ps' || (a[0] === 'network' && a[1] === 'ls')) {
      const filter = a[a.indexOf('--filter') + 1];
      const found = [...records.values()].filter(r => (a[0] === 'ps' ? r.Config : r.Internal !== undefined)
        && (filter.startsWith('id=') ? r.Id === filter.slice(3)
          : new RegExp(filter.slice(5)).test(a[0] === 'ps' ? r.Name : r.Name)));
      out = found.map(r => r.Id).join('\n');
    } else if (a[0] === 'volume' && a[1] === 'ls') out = [...volumes].join('\n');
    else if (a[0] === 'network' && a[1] === 'create') {
      const labels = {}; for (let i = 0; i < a.length; i++) if (a[i] === '--label') { const v = a[++i]; labels[v.slice(0, v.indexOf('='))] = v.slice(v.indexOf('=') + 1); }
      const r = { Id: id(), Name: a.at(-1), Internal: true, Driver: 'bridge', Containers: {}, Labels: labels }; records.set(r.Id, r); out = r.Id;
    } else if (a[0] === 'create') out = createContainer(entry);
    else if (a[0] === 'start') {
      const r = records.get(a[1]); r.State.Running = true; r.State.Status = 'running';
      for (const [name, n] of Object.entries(r.NetworkSettings.Networks)) if (name !== 'none') {
        const network = [...records.values()].find(v => v.Name === name); n.NetworkID = network.Id; n.EndpointID = id(); n.IPAddress ||= `172.30.0.${sequence % 200 + 2}`;
        network.Containers[r.Id] = { Name: r.Name.slice(1) };
      }
      const role = r.Name.split('-').at(-2);
      if (r.Config.Cmd?.includes('-e')) {
        const code = r.Config.Cmd.at(-1);
        if (code.includes('migration-complete')) {
          const databaseUrl = r.Config.Env.find(x => x.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length);
          const host = new URL(databaseUrl).hostname;
          const db = [...records.values()].find(v => dbStates.has(v.Id) && Object.values(v.NetworkSettings.Networks).some(n => n.IPAddress === host));
          if (!db) throw new Error('synthetic_database_unbound'); dbStates.get(db.Id).schema = 106; r.output = 'migration-complete';
        } else r.output = JSON.stringify({ uid: 100, gid: 101, mfa: materials.mfaSha256, firebase: materials.firebaseSha256, acceptance: materials.mfaSha256 });
        r.State.Running = false; r.State.Status = 'exited';
        for (const n of Object.values(records.get(a[1]).NetworkSettings.Networks)) if (records.has(n.NetworkID)) delete records.get(n.NetworkID).Containers[r.Id];
      }
      out = r.Id;
    } else if (a[0] === 'stop') {
      const r = records.get(a[1]); r.State.Running = false; r.State.Status = 'exited';
      for (const n of Object.values(r.NetworkSettings.Networks)) { if (records.has(n.NetworkID)) delete records.get(n.NetworkID).Containers[r.Id]; n.IPAddress = ''; n.EndpointID = ''; }
      out = r.Id;
    } else if (a[0] === 'rename') { records.get(a[1]).Name = `/${a[2]}`; out = ''; }
    else if (a[0] === 'wait') out = '0';
    else if (a[0] === 'logs') out = records.get(a[1]).output ?? 'PostgreSQL init process complete; ready for start up.';
    else if (a[0] === 'rm') {
      const resourceId = a.at(-1); const r = records.get(resourceId);
      for (const m of r.Mounts) if (m.Type === 'volume' && /^[a-f0-9]{64}$/u.test(m.Name)) volumes.delete(m.Name);
      for (const n of records.values()) if (n.Containers) delete n.Containers[resourceId];
      records.delete(resourceId); dbStates.delete(resourceId); out = resourceId;
    } else if (a[0] === 'network' && a[1] === 'rm') { records.delete(a[2]); out = a[2]; }
    else if (a[0] === 'network' && ['connect', 'disconnect'].includes(a[1])) {
      const net = records.get(a[2]), r = records.get(a[3]);
      if (a[1] === 'connect') { r.NetworkSettings.Networks[net.Name] = { NetworkID: net.Id, IPAddress: '172.31.0.5', EndpointID: id() }; if (r.State.Running) net.Containers[r.Id] = { Name: r.Name.slice(1) }; }
      else { delete r.NetworkSettings.Networks[net.Name]; delete net.Containers[r.Id]; }
    } else if (a[0] === 'exec') {
      const targetId = a[1] === '-i' ? a[2] : a[1];
      if (entry.phase === 'protected_backup') fs.writeFileSync(entry.outputFd, Buffer.from('PGDMP-synthetic-command-model-only'));
      else if (entry.phase === 'restore98') { if (!Buffer.isBuffer(entry.input)) throw new Error('synthetic_restore_not_buffer'); dbStates.set(targetId, structuredClone(dbStates.get(database.Id))); }
      else if (entry.phase === 'candidate_mfa_identity') out = JSON.stringify({ mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
      else if (entry.phase === 'application_readbacks') {
        const health = { status: 'ok', checks: { technicalSandbox: { available: false, reason: 'disabled', provider: 'stripe', mode: 'disabled', amountMinor: 100,
          currency: 'EUR', maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true }, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
        out = JSON.stringify({ live: { status: 'ok' }, health, ready: health, version: { commit: green98106.runtimeCommit, environment: 'test' } });
      } else {
        const state = dbStates.get(targetId); const sql = a.at(-1);
        if (entry.phase === 'ledger_readback') out = JSON.stringify(ledgers.slice(0, 98).map(({ name, checksum }) => ({ name, checksum })));
        else if (['postgres_version', 'postgres_major'].includes(entry.phase)) out = '160015';
        else if (entry.phase.startsWith('postgres_select_')) out = '1';
        else if (entry.phase === 'foreign_writers') out = String(foreignWriters);
        else if (entry.phase === 'table_names') out = JSON.stringify([...Object.keys(state.business), 'schema_migrations', ...(state.schema === 106 ? newTableNames() : [])].sort());
        else if (entry.phase === 'ledger_rows') out = JSON.stringify(ledgers.slice(0, state.schema));
        else if (entry.phase === 'business_fingerprint') out = JSON.stringify(state.business);
        else if (entry.phase === 'new_namespace_count') out = '0';
        else if (entry.phase === 'readiness_fingerprint') out = JSON.stringify({ paymentRecoveryNeedsReview: [], supportNextUpdateOverdue: [] });
        else if (entry.phase === 'function_inventory') out = JSON.stringify(functions);
        else if (entry.phase === 'foreign_key_integrity') out = 'COMMIT';
        else throw new Error(`synthetic_unhandled_sql_phase:${entry.phase}`);
      }
    } else throw new Error(`synthetic_unhandled:${entry.phase}`);
    if (losses.delete(entry.phase)) throw new Error('synthetic_response_lost_after_effect');
    return out;
  };
  const git = args => args[0] === 'rev-parse' ? ops : args[0] === 'merge-base' ? args[1]
    : fs.readFileSync(path.join(repositoryRoot, args[1].split(':')[1]), 'utf8');
  const dependencies = { command: dispatch, git, bindMaterials: () => materials, assertPort: async () => {}, delay: async () => {},
    publicReadback: async () => {
      const final = [...records.values()].find(r => r.Name === '/shareittoo-staging-api' && r.State?.Running
        && r.Config?.Labels?.['com.shareittoo.green.98_106.promotion'] && r.NetworkSettings.Networks[nets[1].name]);
      return final ? { status: 200, body: { commit: green98106.runtimeCommit, environment: 'test' } } : { status: 503, body: null };
    } };
  return { inputs, records, images, volumes, calls, losses, beforeFailures, dependencies, dbStates,
    setForeignWriters: value => { foreignWriters = value; }, id, currentImage, materials, api, database };
}
