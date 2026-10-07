import fs from 'node:fs';
import path from 'node:path';
import { digest, objectDigest } from '../../ops/green_staging_98_106_contract.mjs';
import { collectSuccessor } from '../../ops/green_staging_106_106_collector.mjs';
import { executionPreflight } from '../../ops/green_staging_106_106_preflight.mjs';
import { rehearsalConfirmation, runSuccessorRehearsal } from '../../ops/green_staging_106_106_rehearsal.mjs';
import { candidateArchive } from './green_106106_archive.js';
import { rehearsalFixture } from './green_106106_rehearsal.js';
import { buildReleaseMetadata } from '../../src/release.js';

export async function promotionFixture(directory) {
  const f = await rehearsalFixture(directory);
  f.f.binding.scope.api.name = 'shareittoo-staging-api'; f.source.Name = '/shareittoo-staging-api';
  f.source.Config.Labels['com.shareittoo.sit.green.run_id'] = 'synthetic-source-run';
  for (const n of f.f.binding.scope.networks) f.records[n.id].Containers[f.source.Id].Name = 'shareittoo-staging-api';
  f.source.Config.Env.push('DATABASE_URL=postgresql://synthetic:synthetic@canonical-db:5432/synthetic');
  Object.assign(f.c, candidateArchive(f.source.Config.Env));
  f.f.binding.candidateImageId = f.c.image.Id; f.records[f.c.image.Id] = f.c.image;
  const collected = await collectSuccessor({ binding: f.f.binding, publicationBytes: f.f.publicationBytes, mode: 'collect' }, f.dependencies);
  Object.assign(f.target, collected.target);
  f.manifest.bindingSha256 = objectDigest(f.f.binding); f.manifest.targetSha256 = objectDigest(f.target);
  f.options.preflight = await executionPreflight(f.data, f.dependencies);
  f.options.preflightSha256 = objectDigest(f.options.preflight);
  f.options.confirmation = rehearsalConfirmation(f.data, f.options.preflightSha256);
  await runSuccessorRehearsal(f.data, f.options, f.dependencies);
  const receipt = fs.readFileSync(path.join(directory, `${f.config.runId}.rehearsal.json`));
  const options = { execute: true, evidenceDirectory: directory, rehearsalSha256: digest(receipt),
    confirmation: `promote:${f.f.binding.runtimeCommit}:${f.f.binding.opsCommit}:${digest(receipt)}` };
  f.calls.length = 0;
  const original = f.dependencies.command, failures = new Set(), losses = new Set(), routing = [];
  const caddyResolve = () => Object.values(f.records).filter(r => r.State?.Running
    && Object.values(r.NetworkSettings?.Networks ?? {}).some(n => n.NetworkID === f.target.networks.find(n => n.internal).id)
    && (r.Name === '/shareittoo-staging-api' || Object.values(r.NetworkSettings.Networks).some(n => [...(n.Aliases ?? []), ...(n.DNSNames ?? [])].includes('shareittoo-staging-api')))).map(r => r.Id);
  const command = async e => {
    if (failures.delete(e.phase)) { f.calls.push(e); throw new Error('synthetic_before'); }
    const a = e.args; let result;
    if (e.phase === 'promotion_create') {
      f.calls.push(e); const fields = { labels: {}, groups: [], mounts: [], env: {} }; let i = 1;
      while (a[i]?.startsWith('--')) {
        const key = a[i++]; if (key === '--read-only') { fields.readonly = true; continue; }
        const value = a[i++];
        if (key === '--name') fields.name = value;
        else if (key === '--network') fields.network = value;
        else if (key === '--restart') fields.restart = value;
        else if (key === '--group-add') fields.groups.push(value);
        else if (key === '--env') { if (!Object.hasOwn(e.env, value)) throw Error('env absent'); fields.env[value] = e.env[value]; }
        else if (key === '--label') { const at = value.indexOf('='); fields.labels[value.slice(0, at)] = value.slice(at + 1); }
        else if (key === '--mount') {
          const m = Object.fromEntries(value.split(',').map(p => p.includes('=') ? p.split('=') : [p, true]));
          const expected = f.source.Mounts.find(v => v.Destination === m.dst);
          if (!expected || m.type !== expected.Type || m.src !== (expected.Name ?? expected.Source) || Boolean(m.readonly) !== !expected.RW) throw Error('mount drift');
          fields.mounts.push(structuredClone(expected));
        } else throw Error('unmodeled create option');
      }
      if (i !== a.length - 1 || a[i] !== f.c.image.Id || fields.restart !== 'no') throw Error('image/command');
      const image = f.c.image, id = f.id(), n = f.records[fields.network];
      const env = { ...Object.fromEntries(image.Config.Env.map(v => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)])), ...fields.env };
      f.records[id] = { Id: id, Name: `/${fields.name}`, Image: image.Id,
        Config: { ...structuredClone(image.Config), Image: image.Id, Env: Object.entries(env).map(([k, v]) => `${k}=${v}`), Labels: { ...image.Config.Labels, ...fields.labels } },
        HostConfig: { Privileged: false, ReadonlyRootfs: fields.readonly === true, RestartPolicy: { Name: fields.restart, MaximumRetryCount: 0 },
          NetworkMode: fields.network, GroupAdd: fields.groups, PortBindings: {}, CapAdd: [], Devices: [], VolumesFrom: [], PidMode: '' },
        Mounts: fields.mounts, State: { Running: false, Paused: false }, NetworkSettings: { Networks: { [n.Name]: {
          NetworkID: n.Id, Aliases: [fields.name], DNSNames: [fields.name, id.slice(0, 12)] } } } };
      result = id;
    } else if (e.phase === 'promotion_start') {
      f.calls.push(e); const r = f.records[a[1]]; r.State.Running = true;
      for (const n of Object.values(r.NetworkSettings.Networks)) f.records[n.NetworkID].Containers[r.Id] = { Name: r.Name.slice(1) };
      const w = f.states.get(f.dbSource.Id)[2][0]; w.last_started_at = w.last_succeeded_at = w.updated_at = '2020-01-01T00:00:01.000Z'; w.attempt_count++; w.success_count++;
      result = r.Id;
    } else if (e.phase === 'promotion_attach') {
      f.calls.push(e); const n = f.records[a[2]], r = f.records[a[3]];
      r.NetworkSettings.Networks[n.Name] = { NetworkID: n.Id, Aliases: [r.Name.slice(1)], DNSNames: [r.Name.slice(1), r.Id.slice(0, 12)] };
      if (r.State.Running) n.Containers[r.Id] = { Name: r.Name.slice(1) }; result = '';
    } else if (e.phase === 'promotion_rename') {
      f.calls.push(e);
      if (Object.values(f.records).some(r => r.Name === `/${a[2]}`)) throw Error('name collision');
      const r = f.records[a[1]]; r.Name = `/${a[2]}`;
      for (const n of Object.values(r.NetworkSettings.Networks)) {
        n.DNSNames = [a[2], r.Id.slice(0, 12)];
        if (r.State.Running) f.records[n.NetworkID].Containers[r.Id].Name = a[2];
      }
      result = '';
    } else if (e.phase === 'promotion_readiness') result = await original({ ...e, phase: 'candidate_readiness' });
    else result = await original(e);
    routing.push({ phase: e.phase, resolved: caddyResolve() });
    if (losses.delete(e.phase)) throw Error('synthetic_response_loss'); return result;
  };
  const publicReadback = async () => {
    const ids = caddyResolve(); if (ids.length !== 1) throw Error('gateway unavailable');
    const r = f.records[ids[0]], env = Object.fromEntries(r.Config.Env.map(v => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]));
    routing.push({ phase: 'gateway', resolved: ids });
    return { version: buildReleaseMetadata(env), ready: { status: 'ok' } };
  };
  return { ...f, options, receipt: JSON.parse(receipt), failures, promotionLosses: losses, routing, caddyResolve,
    dependencies: { ...f.dependencies, command, publicReadback } };
}
