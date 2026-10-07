import assert from "node:assert/strict";
import fs from "node:fs";
import { digest, objectDigest } from "../../ops/green_staging_98_106_contract.mjs";
import { collectSuccessor } from "../../ops/green_staging_106_106_collector.mjs";
import { physicalSchemaSql, writersSql, constraintsSql, bindExecutionMaterials } from "../../ops/green_staging_106_106_preflight.mjs";
import { fixture, hex } from "./green_106106_readonly.js";
import { candidateArchive } from "./green_106106_archive.js";
export async function inputs() {
  const f = fixture(), c = candidateArchive(f.records[hex(1)].Config.Env);
  f.binding.candidateImageId = c.image.Id; f.records[c.image.Id] = c.image;
  const bytes = Buffer.from('synthetic-runtime-material'), firebaseBytes = Buffer.from('{"synthetic":true}'),
    env = Buffer.from('PAYMENT_TRANSPORT=memory\n');
  const material = { source: '/private/sit-preflight/mfa', destination: '/run/secrets/mfa', sha256: digest(bytes), uid: 0, gid: 10001, mode: 0o640 };
  const firebase = { source: '/private/sit-preflight/firebase', destination: '/run/secrets/firebase-service-account.json',
    sha256: digest(firebaseBytes), uid: 0, gid: 65532, mode: 0o640 };
  f.records[hex(1)].HostConfig.GroupAdd = ['65532'];
  f.records[hex(1)].Mounts.push(...[material, firebase].map(entry =>
    ({ Type: 'bind', Source: entry.source, Destination: entry.destination, RW: false })));
  const target = (await collectSuccessor({ binding: f.binding, publicationBytes: f.publicationBytes, mode: 'collect' },
    { command: f.command, sourceOptions: { git: f.git } })).target;
  const config = { kind: 'sit-green-staging-106-106-execution-config', schemaVersion: 1,
    sourceState: 'running', sealedSourceName: 'sit-green-106-106-sealed-synthetic-run', runId: 'synthetic-run', uid: 10001, gid: 10001,
    materials: [material, firebase], envFile: { source: '/private/sit-preflight/env', destination: null, sha256: digest(env), uid: 0, gid: 0, mode: 0o600 } };
  const manifest = { kind: 'sit-green-staging-106-106-runtime', schemaVersion: 1, opsCommit: f.binding.opsCommit,
    runtimeCommit: f.binding.runtimeCommit, bindingSha256: objectDigest(f.binding), targetSha256: objectDigest(target),
    configSha256: objectDigest(config), physicalSchemaSha256: hex(80) };
  const prior = f.command;
  const command = e => e.args[0] === 'image' && e.args[1] === 'save' ? c.archive
    : e.input === physicalSchemaSql ? hex(80) : [writersSql, constraintsSql].includes(e.input) ? '0' : prior(e);
  const files = new Map([[material.source, bytes], [firebase.source, firebaseBytes], [config.envFile.source, env]]);
  let next = 1; const open = new Map(); const stats = new Map();
  const stat = name => {
    if (!stats.has(name)) {
      const m = [...config.materials, config.envFile].find(m => m.source === name), directory = !m;
      stats.set(name, { dev: 1n, ino: BigInt(stats.size + 1), mode: BigInt(m?.mode ?? 0o700), uid: 0n, gid: BigInt(m?.gid ?? 0),
        nlink: 1n, size: BigInt(files.get(name)?.length ?? 0), mtimeNs: 1n, ctimeNs: 1n,
        isDirectory: () => directory, isFile: () => !directory });
    }
    return { ...stats.get(name) };
  };
  const io = { openSync: (name, flags) => { assert.ok(flags & fs.constants.O_NOFOLLOW); const fd = next++; open.set(fd, name); return fd; },
    fstatSync: fd => stat(open.get(fd)), lstatSync: stat, readFileSync: fd => Buffer.from(files.get(open.get(fd))), closeSync: fd => open.delete(fd) };
  const dependencies = { command, sourceOptions: { git: f.git }, materials: (cfg, api, image) => bindExecutionMaterials(cfg, api, image, io) };
  return { f, c, target, config, manifest, files, stats, io, open, dependencies,
    data: { binding: f.binding, publicationBytes: f.publicationBytes, target, config, manifest } };
}
