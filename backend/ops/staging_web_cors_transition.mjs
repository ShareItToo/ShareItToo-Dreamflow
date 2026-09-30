#!/usr/bin/env node

import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export const corsManifestKind = 'sit-staging-web-cors-runtime-manifest';
export const corsBefore = 'http://shareittoo-staging-api:8080';
export const corsAfter = `${corsBefore},https://staging.shareittoo.com`;
export const isCorsTransition = (manifest) => manifest?.kind === corsManifestKind;
const origin = 'https://staging.shareittoo.com';
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
function fail(code) { throw Object.assign(new Error(code), { code }); }

export async function withCorsTransitionLock(manifest, execute, operation) {
  if (!execute) return operation();
  const parent = await lstat(dirname(manifest.envFile));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== manifest.envUid || (parent.mode & 0o022)) fail('cors_lock_directory_unsafe');
  const lockPath = `${manifest.envFile}.web-cors.lock`;
  let handle;
  try { handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch { fail('cors_transition_locked'); }
  const identity = await handle.stat();
  try { return await operation(); }
  finally {
    try {
      const current = await lstat(lockPath);
      if (!current.isFile() || current.ino !== identity.ino || current.dev !== identity.dev) fail('cors_lock_identity_changed');
      await unlink(lockPath);
    } finally { await handle.close(); }
  }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

// Readback-only fingerprints: no raw inspect/env backup is ever serialized.
export function corsContainerFingerprint(record) {
  return digest(JSON.stringify(canonical({
    Id: record?.Id, Name: record?.Name, Image: record?.Image,
    Running: record?.State?.Running, Config: record?.Config,
    HostConfig: record?.HostConfig, Mounts: record?.Mounts,
    Networks: record?.NetworkSettings?.Networks, Ports: record?.NetworkSettings?.Ports,
  })));
}

export function assertCorsBinding(binding) {
  if (!binding || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify([
    'apiFingerprint', 'envSha256', 'productionApiId', 'productionApiFingerprint',
    'webId', 'webFingerprint', 'productionRootSha256',
  ].sort()) || Object.values(binding).some((value) => !/^[a-f0-9]{64}$/u.test(value ?? ''))) fail('cors_binding_invalid');
  return true;
}

export function assertCorsPreState(manifest, api, content, values) {
  for (const [name, value] of Object.entries(manifest.safetyEnv)) {
    if (values[name] !== value) fail('cors_safety_environment_drift');
  }
  if (values.CORS_ORIGINS !== corsBefore
      || values.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || String(values.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '') !== ''
      || digest(content) !== manifest.corsBinding.envSha256
      || corsContainerFingerprint(api) !== manifest.corsBinding.apiFingerprint) fail('cors_prestate_binding_invalid');
}

export const corsUsersSql = "SELECT count(*) || '|' || (SELECT count(*) FROM auth_identities WHERE provider = 'google') FROM users";

const externalReadbackScript = (includeCors) => `
import crypto from 'node:crypto';
const root=await fetch('https://shareittoo.com/',{redirect:'error',signal:AbortSignal.timeout(8000)});
if(root.status!==200)throw new Error('production_root_unavailable');
const productionRootSha256=crypto.createHash('sha256').update(Buffer.from(await root.arrayBuffer())).digest('hex');
const result={productionRootSha256};
${includeCors ? `
const options=await fetch('${origin}/api/v1/auth/register',{method:'OPTIONS',redirect:'error',headers:{Origin:'${origin}','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(8000)});
result.options={status:options.status,origin:options.headers.get('access-control-allow-origin'),methods:options.headers.get('access-control-allow-methods'),headers:options.headers.get('access-control-allow-headers')};
const post=await fetch('${origin}/api/v1/auth/register',{method:'POST',redirect:'error',headers:{Origin:'${origin}','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
const body=await post.json();result.post={status:post.status,origin:post.headers.get('access-control-allow-origin'),error:body.error};
` : ''}
process.stdout.write(JSON.stringify(result));`;

export async function readCorsWitnesses({ manifest, command, phase, includeCors = false }) {
  const witnesses = {};
  for (const [name, idKey, fingerprintKey] of [
    ['shareittoo-api', 'productionApiId', 'productionApiFingerprint'],
    ['shareittoo-web', 'webId', 'webFingerprint'],
  ]) {
    const result = await command('docker', ['inspect', '--format', '{{json .}}', name], { phase: `${phase}_${name}_witness` });
    let record;
    try { record = JSON.parse(result.stdout); } catch { fail('cors_production_witness_invalid'); }
    if (record?.Name !== `/${name}` || record?.Id !== manifest.corsBinding[idKey]
        || record?.State?.Running !== true || corsContainerFingerprint(record) !== manifest.corsBinding[fingerprintKey]) fail('cors_production_witness_drift');
    witnesses[name] = manifest.corsBinding[fingerprintKey];
  }
  const response = await command(process.execPath, ['--input-type=module', '-e', externalReadbackScript(includeCors)], { phase: `${phase}_external_readback` });
  let result;
  try { result = JSON.parse(response.stdout); } catch { fail('cors_external_readback_invalid'); }
  if (result.productionRootSha256 !== manifest.corsBinding.productionRootSha256) fail('cors_production_root_drift');
  if (includeCors && (result.options?.status !== 204 || result.options?.origin !== origin
      || !String(result.options?.methods ?? '').split(',').map((s) => s.trim()).includes('POST')
      || !String(result.options?.headers ?? '').toLowerCase().split(',').map((s) => s.trim()).includes('content-type')
      || result.post?.status !== 403 || result.post?.origin !== origin
      || result.post?.error !== 'staging_registration_disabled')) fail('cors_external_probe_invalid');
  return { witnesses, productionRootSha256: result.productionRootSha256, ...(includeCors ? { optionsStatus: 204, postStatus: 403, postError: 'staging_registration_disabled' } : {}) };
}

export async function readCorsUserCounts(manifest, command, phase) {
  const response = await command('docker', ['exec', manifest.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', corsUsersSql], { phase });
  const counts = String(response.stdout ?? '').trim();
  if (!/^\d+\|\d+$/u.test(counts)) fail('cors_user_count_invalid');
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stderr.write('{"status":"failed","code":"use_enable_staging_web_cors_entrypoint"}\n');
  process.exitCode = 1;
}
