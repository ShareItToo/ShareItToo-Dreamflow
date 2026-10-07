import fs from 'node:fs';
import { objectDigest } from '../../ops/green_staging_98_106_contract.mjs';
import { canonicalMounts, containerFingerprint } from '../../ops/green_staging_98_106_promotion.mjs';
import { executionPreflight, physicalSchemaSql, writersSql, constraintsSql } from '../../ops/green_staging_106_106_preflight.mjs';
import { snapshotSql } from '../../ops/green_staging_106_106_database.mjs';
import { auxiliarySql, rehearsalConfirmation } from '../../ops/green_staging_106_106_rehearsal.mjs';
import { inputs } from './green_106106_preflight.js';
import { hex } from './green_106106_readonly.js';
import { buildReleaseMetadata } from '../../src/release.js';

// Strict stateful Docker/SQL adapter; synthetic proof only, no daemon calls.
export async function rehearsalFixture(directory) {
  const s = await inputs(), records = s.f.records, source = records[hex(1)], dbSource = records[hex(2)];
  source.HostConfig.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
  s.config.materials[0].destination = source.Mounts[1].Destination = '/run/secrets/mfa-encryption-key';
  s.target.containers[0].configSha256 = containerFingerprint(source);
  s.target.mountsSha256 = objectDigest(canonicalMounts(source.Mounts));
  s.manifest.targetSha256 = objectDigest(s.target); s.manifest.configSha256 = objectDigest(s.config);
  const postgres = records[dbSource.Image];
  postgres.RepoDigests = [`postgres@${s.f.binding.scope.database.imageDigest}`];
  postgres.Config = { Env: ['PG_MAJOR=16'], User: '', Entrypoint: ['docker-entrypoint.sh'], Cmd: ['postgres'] };
  const states = new Map([[dbSource.Id, structuredClone(s.f.sqlRows)]]), auxiliary = new Map([[dbSource.Id,
    [{ mission_sequence: { last_value: 17, is_called: true } }, { mission_materialized: { count: 2, sha256: hex(89) } }]]]);
  const volumes = new Set(['green-uploads']), calls = [], losses = new Set(), beforeFailures = new Set();
  let sequence = 100, probeRan = false;
  const id = () => hex(sequence++);
  const byName = name => Object.values(records).find(r => r?.Name === name || r?.Name === `/${name}`);
  const initialCommand = s.dependencies.command;
  const dispatch = async entry => {
    calls.push(entry); if (beforeFailures.delete(entry.phase)) throw new Error('synthetic_before_effect');
    const a = entry.args; let result = '';
    if (a[0] === 'inspect') result = JSON.stringify([records[a[1]]]);
    else if (a[0] === 'image' && a[1] === 'inspect') result = JSON.stringify([records[a[2]]]);
    else if (a[0] === 'image' && a[1] === 'save') result = s.c.archive;
    else if (a[0] === 'network' && a[1] === 'inspect') result = JSON.stringify([records[a[2]]]);
    else if (a[0] === 'volume' && a[1] === 'inspect') result = JSON.stringify([records[a[2]]]);
    else if (a[0] === 'volume' && a[1] === 'ls') result = [...volumes].join('\n');
    else if (a[0] === 'ps' || (a[0] === 'network' && a[1] === 'ls')) {
      const filter = a[a.indexOf('--filter') + 1];
      const matches = Object.values(records).filter(r => r?.Name && (a[0] === 'ps' ? r.Name.startsWith('/') : r.Internal !== undefined))
        .filter(r => filter.startsWith('label=') ? r.Config?.Labels?.['com.shareittoo.sit.green'] === 'true'
          : filter.startsWith('id=') ? r.Id === filter.slice(3) : new RegExp(filter.slice(5)).test(r.Name));
      result = matches.map(r => r.Id).join('\n');
    } else if (a[0] === 'network' && a[1] === 'create') {
      const labels = {};
      for (let i = 2; i < a.length - 1; i++) {
        if (a[i] === '--internal') continue;
        if (a[i] !== '--label') throw new Error('unmodeled network option');
        const value = a[++i], at = value.indexOf('='); labels[value.slice(0, at)] = value.slice(at + 1);
      }
      const record = { Id: id(), Name: a.at(-1), Internal: true, Driver: 'bridge', Labels: labels, Containers: {} };
      records[record.Id] = record; result = record.Id;
    } else if (a[0] === 'create') {
      const fields = { env: {}, labels: {}, mounts: [] }; let i = 1;
      while (a[i]?.startsWith('--')) {
        const key = a[i++], value = a[i++];
        if (key === '--label') { const at = value.indexOf('='); fields.labels[value.slice(0, at)] = value.slice(at + 1); }
        else if (key === '--env') { if (!Object.hasOwn(entry.env, value)) throw new Error('missing env'); fields.env[value] = entry.env[value]; }
        else if (key === '--mount') {
          const m = Object.fromEntries(value.split(',').map(v => { const at = v.indexOf('='); return at < 0 ? [v, true] : [v.slice(0, at), v.slice(at + 1)]; }));
          if (!['bind', 'volume'].includes(m.type) || (m.type === 'volume' && m.src)) throw new Error('not anonymous');
          const mount = { Type: m.type, Destination: m.dst, RW: m.readonly !== true };
          if (m.type === 'bind') mount.Source = m.src;
          else { mount.Name = id(); volumes.add(mount.Name); }
          fields.mounts.push(mount);
        } else if (['--name', '--network', '--restart', '--entrypoint', '--user'].includes(key)) fields[key.slice(2)] = value;
        else throw new Error('unmodeled container option');
      }
      const image = records[a[i++]]; if (!image?.Id.startsWith('sha256:')) throw new Error('unknown image');
      const network = records[fields.network], env = Object.fromEntries(image.Config.Env.map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
      const record = { Id: id(), Name: `/${fields.name}`, Image: image.Id,
        Config: { Image: image.Id, User: fields.user ?? image.Config.User, Env: Object.entries({ ...env, ...fields.env }).map(([k, v]) => `${k}=${v}`),
          Labels: { ...image.Config.Labels, ...fields.labels }, Entrypoint: fields.entrypoint ? [fields.entrypoint] : image.Config.Entrypoint,
          Cmd: a.slice(i).length ? a.slice(i) : image.Config.Cmd },
        State: { Running: false, Paused: false, Status: 'created', ExitCode: 0 }, Mounts: fields.mounts,
        HostConfig: { Privileged: false, RestartPolicy: { Name: fields.restart, MaximumRetryCount: 0 }, NetworkMode: fields.network,
          PortBindings: null, GroupAdd: [], CapAdd: [], Devices: [], VolumesFrom: [], PidMode: '' },
        NetworkSettings: { Networks: network ? { [network.Name]: { NetworkID: '', IPAddress: '' } } : { none: { NetworkID: '' } } } };
      records[record.Id] = record; result = record.Id;
    } else if (a[0] === 'start') {
      const r = records[a[1]]; if (r.State.Running) throw new Error('replayed start');
      r.State.Running = true; r.State.Status = 'running';
      for (const [name, n] of Object.entries(r.NetworkSettings.Networks)) if (name !== 'none') {
        const net = byName(name); n.NetworkID = net.Id; n.IPAddress = `172.30.0.${sequence % 200 + 2}`; net.Containers[r.Id] = { Name: r.Name.slice(1) };
      }
      if (r.Config.Cmd.includes('-e')) {
        r.output = JSON.stringify({ uid: 10001, gid: 10001, hashes: s.config.materials.map(m => m.sha256) });
        r.State.Running = false; r.State.Status = 'exited';
      } else if (r.Config.Cmd.includes('src/server.js')) {
        const host = new URL(r.Config.Env.find(v => v.startsWith('DATABASE_URL=')).slice(13)).hostname;
        const db = Object.values(records).find(v => v.Name?.endsWith('-database') && Object.values(v.NetworkSettings.Networks).some(n => n.IPAddress === host));
        if (!db || !states.has(db.Id)) throw new Error('wrong database');
        const w = states.get(db.Id)[2][0]; w.last_started_at = w.last_succeeded_at = w.updated_at = '2020-01-01T00:00:01.000Z'; w.attempt_count++; w.success_count++;
      }
      result = r.Id;
    } else if (a[0] === 'stop') {
      const r = records[a[1]]; r.State.Running = false; r.State.Status = 'exited';
      for (const net of Object.values(records)) if (net.Containers) delete net.Containers[r.Id]; result = r.Id;
    } else if (a[0] === 'rename') { records[a[1]].Name = `/${a[2]}`; }
    else if (a[0] === 'wait') result = '0';
    else if (a[0] === 'logs') result = records[a[1]].output ?? 'PostgreSQL init process complete; ready for start up.';
    else if (a[0] === 'rm') {
      const r = records[a.at(-1)]; if (!r || a.join(' ').indexOf('--volumes') < 0) throw new Error('invalid remove');
      for (const m of r.Mounts) if (m.Type === 'volume') volumes.delete(m.Name);
      for (const n of Object.values(records)) if (n.Containers) delete n.Containers[r.Id];
      states.delete(r.Id); auxiliary.delete(r.Id); delete records[r.Id];
    } else if (a[0] === 'network' && a[1] === 'rm') { if (Object.keys(records[a[2]].Containers).length) throw new Error('foreign member'); delete records[a[2]]; }
    else if (a[0] === 'exec') {
      const target = a[1] === '-i' ? a[2] : a[1];
      if (entry.phase === 'protected_backup') fs.writeFileSync(entry.outputFd, Buffer.from('PGDMP-synthetic-only'));
      else if (entry.phase === 'postgres_tools') result = 'postgresql 16.15';
      else if (entry.phase === 'restore106') { if (!Buffer.isBuffer(entry.input) || entry.input.subarray(0, 5).toString() !== 'PGDMP') throw new Error('bad restore bytes');
        states.set(target, structuredClone(states.get(dbSource.Id))); auxiliary.set(target, structuredClone(auxiliary.get(dbSource.Id))); }
      else if (entry.input === snapshotSql) result = states.get(target).map(r => JSON.stringify(r)).join('\n');
      else if (entry.input === auxiliarySql) result = auxiliary.get(target).map(r => JSON.stringify(r)).join('\n');
      else if (entry.input === physicalSchemaSql) result = s.manifest.physicalSchemaSha256;
      else if ([writersSql, constraintsSql].includes(entry.input)) result = '0';
      else if (entry.input === 'SELECT 1') result = '1';
      else if (entry.input === 'SHOW server_version_num') result = '160015';
      else if (entry.phase === 'synthetic_mfa_identity') { probeRan = true; result = JSON.stringify({ mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' }); }
      else if (entry.phase === 'candidate_readiness') {
        const health = { status: 'ok', checks: { technicalSandbox: { available: false, reason: 'disabled', provider: 'stripe', mode: 'disabled', amountMinor: 100,
          currency: 'EUR', maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true }, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
        const env = Object.fromEntries(records[target].Config.Env.map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
        result = JSON.stringify({ live: { status: 'ok' }, health, ready: health, version: buildReleaseMetadata(env) });
      } else throw new Error('unmodeled exec');
    } else result = await initialCommand(entry);
    if (losses.delete(entry.phase)) throw new Error('synthetic_response_loss'); return result;
  };
  const dependencies = { ...s.dependencies, command: dispatch, delay: async () => {} };
  const preflight = await executionPreflight(s.data, dependencies), preflightSha256 = objectDigest(preflight);
  const options = { preflight, preflightSha256, evidenceDirectory: directory, confirmation: rehearsalConfirmation(s.data, preflightSha256) };
  calls.length = 0;
  return { ...s, records, states, auxiliary, volumes, calls, losses, beforeFailures, dependencies, options, source, dbSource,
    probeRan: () => probeRan, id };
}
