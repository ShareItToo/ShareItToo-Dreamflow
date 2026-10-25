import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { canonicalSuccessorSpec } from './green_staging_106_106_promotion.mjs';
import { repositoryRoot } from './green_staging_98_106_contract.mjs';
import { privateDirectory } from './green_staging_98_106_evidence.mjs';
import { technicalSandbox106EvidenceStore } from './technical_sandbox_106_executor.mjs';

const safeFail = code => { const e = new Error(code); e.code = code; e.exitCode = code === 'sandbox106_recovery_required' ? 3 : 2; throw e; };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const jsonKeys = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) safeFail(code);
};
const outsideRepo = value => path.isAbsolute(value) && path.normalize(value) === value
  && value !== repositoryRoot && !value.startsWith(`${repositoryRoot}${path.sep}`);

function readProtectedBytes(file, expectedSha256, { afterRead = () => {} } = {}) {
  if (!outsideRepo(file) || !isHash(expectedSha256)) safeFail('sandbox106_protected_path');
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.uid !== BigInt(process.getuid())
        || (before.mode & 0o7777n) !== 0o600n || before.size < 2n || before.size > 32768n) safeFail('sandbox106_protected_metadata');
    const beforePath = fs.lstatSync(file, { bigint: true });
    if (['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k => before[k] !== beforePath[k])) safeFail('sandbox106_protected_changed');
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (count <= 0) safeFail('sandbox106_protected_read'); offset += count; }
    afterRead();
    const after = fs.fstatSync(fd, { bigint: true }); const link = fs.lstatSync(file, { bigint: true });
    if (['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k => before[k] !== after[k] || after[k] !== link[k])) {
      bytes.fill(0); safeFail('sandbox106_protected_changed');
    }
    if (digest(bytes) !== expectedSha256) { bytes.fill(0); safeFail('sandbox106_protected_digest'); }
    return bytes;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function readTechnicalSandboxSessionProof(file, expectedSha256, { userIds, now = Date.now(), afterRead } = {}) {
  if (!outsideRepo(file)) safeFail('sandbox106_protected_path');
  privateDirectory(path.dirname(file));
  const bytes = readProtectedBytes(file, expectedSha256, { afterRead });
  let proof;
  try { proof = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { bytes.fill(0); safeFail('sandbox106_session_json'); }
  bytes.fill(0);
  jsonKeys(proof, ['kind','schemaVersion','principalId','issuedAt','expiresAt','accessToken'], 'sandbox106_session_shape');
  const issued = Date.parse(proof.issuedAt), expires = Date.parse(proof.expiresAt);
  if (proof.kind !== 'sit-technical-sandbox-session-proof' || proof.schemaVersion !== 1
      || !Array.isArray(userIds) || !userIds.includes(proof.principalId)
      || !Number.isFinite(issued) || issued > now || now - issued > 60 * 60 * 1000
      || !Number.isFinite(expires) || expires <= now || expires - issued > 24 * 60 * 60 * 1000
      || typeof proof.accessToken !== 'string' || proof.accessToken.length < 16 || proof.accessToken.length > 8192
      || /[\r\n\u0000]/u.test(proof.accessToken)) safeFail('sandbox106_session_invalid');
  return Object.freeze({ principalId: proof.principalId, issuedAt: proof.issuedAt, expiresAt: proof.expiresAt, token: proof.accessToken });
}

function secretDigest(file, { lstatSync = fs.lstatSync, fstatSync = fs.fstatSync, openSync = fs.openSync,
  readSync = fs.readSync, closeSync = fs.closeSync } = {}) {
  let fd, scratch; const chunks = []; let size = 0;
  try {
    fd = openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.uid !== 100n || before.gid !== 101n
        || (before.mode & 0o7777n) !== 0o600n || before.size < 1n || before.size > 16384n) safeFail('sandbox106_secret_metadata');
    const beforePath = lstatSync(file, { bigint: true });
    if (['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k => before[k] !== beforePath[k])) safeFail('sandbox106_secret_changed');
    scratch = Buffer.alloc(4096);
    while (true) {
      const count = readSync(fd, scratch, 0, scratch.length, null);
      if (count <= 0) break;
      size += count; if (size > 16384) safeFail('sandbox106_secret_size');
      chunks.push(Buffer.from(scratch.subarray(0, count)));
    }
    const after = fstatSync(fd, { bigint: true }); const afterPath = lstatSync(file, { bigint: true });
    if (['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k => before[k] !== after[k] || after[k] !== afterPath[k])
        || BigInt(size) !== before.size) safeFail('sandbox106_secret_changed');
    const all = Buffer.concat(chunks);
    try { return digest(all); } finally { all.fill(0); }
  } finally {
    scratch?.fill(0);
    for (const part of chunks) part.fill(0);
    if (fd !== undefined) closeSync(fd);
  }
}

export function validateTechnicalSandboxSecretMetadata(evidence, { fsOps = {} } = {}) {
  const items = [evidence?.credentials?.secretKey, evidence?.credentials?.webhookSecret];
  if (!items[0] || !items[1] || items[0].path === items[1].path || items[0].sha256 === items[1].sha256) safeFail('sandbox106_secret_distinct');
  for (const item of items) {
    if (!item || !outsideRepo(item.path) || item.path.includes(',') || /[\r\n]/u.test(item.path)) safeFail('sandbox106_secret_path');
    if (!isHash(item.sha256) || secretDigest(item.path, fsOps) !== item.sha256) safeFail('sandbox106_secret_digest');
  }
  return true;
}

async function readBounded(response, limit = 32768) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text(); if (Buffer.byteLength(text) > limit) safeFail('sandbox106_gateway_body_size'); return text;
  }
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > limit) { await reader.cancel(); safeFail('sandbox106_gateway_body_size'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

const gatewayBase = 'https://staging.shareittoo.com';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function readStagingTechnicalSandboxCapability({ token, expectedAvailable, fetchImpl = fetch,
  expectedCommit, expectedImageDigest, runtimeReadback, attempts = 3, delay = sleep, timeoutMs = 5000 } = {}) {
  if (typeof token !== 'string' || token.length < 16 || ![true,false].includes(expectedAvailable)
      || attempts < 1 || attempts > 3 || timeoutMs < 1 || timeoutMs > 5000) safeFail('sandbox106_gateway_arguments');
  if (typeof runtimeReadback !== 'function') safeFail('sandbox106_gateway_runtime_readback');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const fetchJson = async (pathname, authenticated = false) => {
        const url = new URL(pathname, gatewayBase);
        if (url.origin !== gatewayBase || !['/api/version','/api/v1/payments/capabilities'].includes(url.pathname) || url.search || url.hash) safeFail('sandbox106_gateway_url');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
            headers: { ...(authenticated ? { authorization: `Bearer ${token}` } : {}), accept: 'application/json' } });
          if (response.status === 401 || response.status === 403) safeFail('sandbox106_gateway_auth_rejected');
          if (response.status >= 300 && response.status < 400) safeFail('sandbox106_gateway_redirect');
          if (response.status >= 500 && attempt + 1 < attempts) { await response.body?.cancel?.(); throw Object.assign(new Error('retry'), { retryable: true }); }
          if (response.status !== 200) safeFail('sandbox106_gateway_status');
          const text = await readBounded(response); let body;
          try { body = JSON.parse(text); } catch { safeFail('sandbox106_gateway_json'); }
          return { body, bodySha256: digest(Buffer.from(text)) };
        } finally { clearTimeout(timer); }
      };
      const version = await fetchJson('/api/version');
      if (!/^[a-f0-9]{40}$/u.test(version.body?.commit ?? '')) safeFail('sandbox106_gateway_version');
      const capability = await fetchJson('/api/v1/payments/capabilities', true);
      const t = capability.body?.technicalSandbox, p = capability.body?.capabilities;
      if (!t || !p || typeof t.technicalSandboxAvailable !== 'boolean') safeFail('sandbox106_gateway_shape');
      const runtime = await runtimeReadback();
      if (runtime?.versionCommit !== version.body.commit || runtime?.configCommit !== version.body.commit
          || version.body.commit !== expectedCommit || runtime?.imageDigest !== expectedImageDigest
          || !/^sha256:[a-f0-9]{64}$/u.test(runtime?.imageDigest ?? '')) safeFail('sandbox106_gateway_runtime_binding');
      const result = Object.freeze({ authenticated: true, versionCommit: version.body.commit, imageDigest: runtime.imageDigest,
        technicalSandbox: Object.freeze({ available: t.technicalSandboxAvailable, provider: t.provider, mode: t.mode,
          amountMinor: t.amountMinor, currency: t.currency, maxRunsPerUser24h: t.maxRunsPerUser24h,
          professionalReview: t.professionalReview, syntheticOnly: t.syntheticOnly, liveMoney: t.liveMoney,
          bookingEffects: t.bookingEffect, ledgerEffects: t.ledgerEffect, connectEffects: t.connectEffect,
          payoutEffects: p.payoutOnboardingAvailable, notificationEffects: false, marketplaceStripe: p.providerBacked }),
        paymentTransport: p.providerBacked ? 'stripe' : 'memory', bodySha256: capability.bodySha256, versionSha256: version.bodySha256 });
      if (result.technicalSandbox.available !== expectedAvailable) safeFail('sandbox106_gateway_capability_mismatch');
      return result;
    } catch (error) {
      if (error?.retryable && attempt + 1 < attempts) { await delay(150 * (attempt + 1)); continue; }
      if (error?.code?.startsWith?.('sandbox106_')) throw error;
      if (attempt + 1 < attempts) { await delay(150 * (attempt + 1)); continue; }
      safeFail('sandbox106_gateway_timeout_or_network');
    }
  }
  safeFail('sandbox106_gateway_unavailable');
}

const localCapabilityScript = `const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const {token}=JSON.parse(Buffer.concat(chunks).toString('utf8'));const get=async(path,auth=false)=>{const r=await fetch('http://127.0.0.1:8080'+path,{headers:auth?{authorization:'Bearer '+token}:undefined,signal:AbortSignal.timeout(4000),redirect:'manual'});if(r.status>=300&&r.status<400)throw Error('redirect');return {status:r.status,body:await r.json()}};const [live,ready,cap]=await Promise.all([get('/health/live'),get('/health/ready'),get('/v1/payments/capabilities',true)]);const t=cap.body.technicalSandbox,p=cap.body.capabilities;const out={authenticated:cap.status===200,live:{status:live.status===200?'ok':'failed'},ready:{status:ready.body.status==='ok'?'ok':'failed'},technicalSandbox:{available:t.technicalSandboxAvailable,provider:t.provider,mode:t.mode,amountMinor:t.amountMinor,currency:t.currency,maxRunsPerUser24h:t.maxRunsPerUser24h,professionalReview:t.professionalReview,syntheticOnly:t.syntheticOnly,liveMoney:t.liveMoney,bookingEffects:t.bookingEffect,ledgerEffects:t.ledgerEffect,connectEffects:t.connectEffect,payoutEffects:p.payoutOnboardingAvailable,notificationEffects:false,marketplaceStripe:p.providerBacked},paymentTransport:p.providerBacked?'stripe':'memory'};process.stdout.write(JSON.stringify(out));`;

function safeDocker() {
  return async ({ args, input, env = {}, timeout = 30000 }) => {
    if (!Array.isArray(args) || args.some(v => typeof v !== 'string' || v.includes('\u0000'))
        || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) safeFail('sandbox106_docker_arguments');
    return await new Promise((resolve, reject) => {
      let settled = false;
      const child = execFile('docker', args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
        windowsHide: true, shell: false, env: { ...process.env, ...env } }, (error, stdout) => {
        if (settled) return; settled = true;
        if (error) reject(error); else resolve(stdout);
      });
      if (input !== undefined) {
        const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
        child.stdin.on('error', () => bytes.fill(0));
        child.stdin.end(bytes, () => bytes.fill(0));
      } else child.stdin.end();
    }).catch(() => safeFail('sandbox106_docker_failed'));
  };
}

function oneJson(raw, code) {
  let rows; try { rows = JSON.parse(String(raw)); } catch { safeFail(code); }
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') safeFail(code);
  return rows[0];
}
function validDockerId(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }

export function createTechnicalSandbox106Dependencies({ token, command = safeDocker(), fetchImpl = fetch,
  evidenceDirectory, now = Date.now, delay = sleep } = {}) {
  if (typeof token !== 'string' || token.length < 16) safeFail('sandbox106_token_required');
  const store = technicalSandbox106EvidenceStore(evidenceDirectory);
  const inspect = async id => {
    if (!validDockerId(id)) safeFail('sandbox106_docker_id');
    const value = oneJson(await command({ args: ['inspect', id] }), 'sandbox106_docker_inspect');
    if (value.Id !== id) safeFail('sandbox106_docker_identity'); return value;
  };
  const inspectNetwork = async id => {
    if (!validDockerId(id)) safeFail('sandbox106_network_id');
    const value = oneJson(await command({ args: ['network','inspect',id] }), 'sandbox106_network_inspect');
    if (value.Id !== id || !value.Name) safeFail('sandbox106_network_identity');
    return { Id: id, Name: value.Name, Internal: value.Internal === true, ContainerIds: Object.keys(value.Containers ?? {}).sort() };
  };
  const inspectImage = async id => {
    if (typeof id !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(id)) safeFail('sandbox106_image_id');
    const value = oneJson(await command({ args: ['image','inspect',id] }), 'sandbox106_image_inspect');
    if (value.Id !== id) safeFail('sandbox106_image_identity'); return value;
  };
  const lookupName = async name => {
    if (!['shareittoo-staging-api'].includes(name) && !/^sit-technical-sandbox(?:-old)?-[0-9a-f-]{36}$/u.test(name)) safeFail('sandbox106_docker_name');
    const raw = String(await command({ args: ['ps','--all','--no-trunc','--filter',`name=^/${name}$`,'--format','{{.ID}}'] })).trim();
    if (!raw) return null;
    const ids = raw.split(/\s+/u); if (ids.length !== 1 || !validDockerId(ids[0])) safeFail('sandbox106_docker_name_ambiguous');
    return ids[0];
  };
  const buildCandidate = async (source, image, spec) => {
    const networkList = [];
    for (const [name, endpoint] of Object.entries(source.NetworkSettings?.Networks ?? {})) {
      const network = await inspectNetwork(endpoint.NetworkID);
      if (network.Name !== name) safeFail('sandbox106_network_name_drift');
      networkList.push({ id: network.Id, name, internal: network.Internal });
    }
    const uploads = source.Mounts?.find(m => m.Destination === '/data/uploads' && m.Type === 'volume');
    if (!uploads?.Name) safeFail('sandbox106_upload_volume');
    const runId = spec?.name?.slice('sit-technical-sandbox-'.length) ?? '00000000-0000-4000-8000-000000000000';
    const greenInputs = { config: { runId }, binding: { scope: { api: { name: 'shareittoo-staging-api' } } },
      target: { networks: networkList, uploads: { name: uploads.Name } } };
    const built = canonicalSuccessorSpec(source, image, greenInputs);
    if (source.HostConfig?.RestartPolicy?.Name !== 'unless-stopped' || source.HostConfig.RestartPolicy.MaximumRetryCount !== 0) safeFail('sandbox106_restart_policy');
    const args = [...built.args];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--name') args[i + 1] = spec?.name ?? 'sit-technical-sandbox-00000000-0000-4000-8000-000000000000';
      else if (args[i] === '--network') args[i + 1] = 'none';
      else if (args[i] === '--restart') args[i + 1] = 'unless-stopped';
    }
    const imageIndex = args.lastIndexOf(source.Image);
    if (imageIndex < 0) safeFail('sandbox106_create_image_argument');
    const filtered = [];
    for (let i = 0; i < imageIndex; i++) {
      if (args[i] === '--label') { i++; continue; }
      if (args[i] === '--env') {
        const key = args[i + 1]; i++;
        if (!spec?.environment || !Object.hasOwn(spec.environment, key)) filtered.push('--env', key);
        continue;
      }
      filtered.push(args[i]);
    }
    if (source.Config?.Hostname) filtered.push('--hostname', source.Config.Hostname);
    for (const key of Object.keys(spec?.environment ?? {})) filtered.push('--env', key);
    for (const label of Object.keys(spec?.labels ?? {}).sort()) filtered.push('--label', `${label}=${spec.labels[label]}`);
    for (const mount of spec?.mounts ?? []) filtered.push('--mount', `type=bind,src=${mount.source},dst=${mount.destination},readonly`);
    filtered.push(...args.slice(imageIndex));
    return { built, args: filtered, networkList };
  };
  return {
    now,
    inspect,
    inspectNetwork,
    inspectImage,
    async validateTopology({ canonical, image }) {
      const live = await inspect(canonical.Id);
      if (live.Id !== canonical.Id || live.Image !== canonical.Image || live.Name !== canonical.Name
          || JSON.stringify(live.HostConfig) !== JSON.stringify(canonical.HostConfig)
          || JSON.stringify(live.Mounts) !== JSON.stringify(canonical.Mounts)) safeFail('sandbox106_topology_source_drift');
      await buildCandidate(live, image, null);
      return true;
    },
    lookupName,
    async create(spec) {
      const source = await inspect(spec.sourceId), image = await this.inspectImage(source.Image);
      const plan = await buildCandidate(source, image, spec);
      const env = { ...plan.built.env, ...spec.environment };
      const created = String(await command({ args: plan.args, env, timeout: 60000 })).trim();
      if (!validDockerId(created)) safeFail('sandbox106_create_response'); return created;
    },
    attach: ({ candidateId, networkId }) => {
      if (!validDockerId(candidateId) || !validDockerId(networkId)) safeFail('sandbox106_attach_id');
      return command({ args: ['network','connect',networkId,candidateId] });
    },
    start: id => { if (!validDockerId(id)) safeFail('sandbox106_start_id'); return command({ args: ['start',id] }); },
    stop: id => { if (!validDockerId(id)) safeFail('sandbox106_stop_id'); return command({ args: ['stop','--time','10',id], timeout: 15000 }); },
    remove: id => { if (!validDockerId(id)) safeFail('sandbox106_remove_id'); return command({ args: ['rm',id] }); },
    rename: ({ id, name }) => {
      if (!validDockerId(id) || name !== 'shareittoo-staging-api'
          && !/^sit-technical-sandbox(?:-old)?-[0-9a-f-]{36}$/u.test(name)) safeFail('sandbox106_rename_arguments');
      return command({ args: ['rename',id,name] });
    },
    async localReadback(candidateId) {
      if (!validDockerId(candidateId)) safeFail('sandbox106_local_id');
      const raw = await command({ args: ['exec','-i',candidateId,'node','--input-type=module','-e',localCapabilityScript],
        input: JSON.stringify({ token }), timeout: 10000 });
      let value; try { value = JSON.parse(String(raw)); } catch { safeFail('sandbox106_local_readback'); }
      return value;
    },
    gatewayReadback: async ({ expectedTechnicalSandbox, expectedCommit, expectedImageDigest }) => readStagingTechnicalSandboxCapability({ token,
      expectedAvailable: expectedTechnicalSandbox, expectedCommit, expectedImageDigest, fetchImpl, attempts: 3, delay, timeoutMs: 5000,
      runtimeReadback: async () => {
        const id = await lookupName('shareittoo-staging-api');
        if (!validDockerId(id)) safeFail('sandbox106_gateway_canonical_id');
        const current = await inspect(id), runtimeImage = await inspectImage(current.Image);
        const env = Object.fromEntries((current.Config?.Env ?? []).map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
        const repoDigest = runtimeImage.RepoDigests?.find(value => value.endsWith(`@${expectedImageDigest}`));
        if (!repoDigest || !env.APP_COMMIT) safeFail('sandbox106_gateway_runtime_inspect');
        return { versionCommit: env.APP_COMMIT, configCommit: env.APP_COMMIT, imageDigest: repoDigest.slice(repoDigest.lastIndexOf('@') + 1) };
      } }),
    acquireLock: store.acquireLock,
    writeReceipt: store.writeReceipt,
    releaseLock: store.releaseLock,
  };
}

export async function inspectTechnicalSandboxTarget(evidence, dependencies) {
  const canonical = await dependencies.inspect(evidence.runtime.canonicalContainerId);
  const image = await dependencies.inspectImage(canonical.Image);
  return { canonical, image };
}
