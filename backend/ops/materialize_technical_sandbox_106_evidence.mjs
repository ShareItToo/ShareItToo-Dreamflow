#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProtectedJson } from './green_staging_98_106_contract.mjs';
import { privateDirectory } from './green_staging_98_106_evidence.mjs';
import { validateTechnicalSandbox106Evidence } from './technical_sandbox_106_activation.mjs';
import { validateTechnicalSandboxSecretMetadata } from './technical_sandbox_106_runtime_adapter.mjs';

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const rawSha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const outsideRepo = file => path.isAbsolute(file) && path.normalize(file) === file
  && file !== repositoryRoot && !file.startsWith(`${repositoryRoot}${path.sep}`);
const exact = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(code);
};
function readProtectedJsonWithTime(file, expectedSha256) {
  if (!outsideRepo(file) || !sha(expectedSha256)) fail('sandbox106_input_path');
  const parent = privateDirectory(path.dirname(file));
  let fd; let bytes;
  try {
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_CLOEXEC);
    const before=fs.fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.uid!==BigInt(process.getuid())
        ||(before.mode&0o7777n)!==0o600n||before.size<2n||before.size>32768n) fail('sandbox106_input_metadata');
    const beforePath=fs.lstatSync(file,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==beforePath[k]))fail('sandbox106_input_changed');
    bytes=Buffer.alloc(Number(before.size)); let offset=0;
    while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)fail('sandbox106_input_read');offset+=n;}
    const after=fs.fstatSync(fd,{bigint:true}), finalPath=fs.lstatSync(file,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]||after[k]!==finalPath[k]))fail('sandbox106_input_changed');
    if(rawSha(bytes)!==expectedSha256)fail('sandbox106_input_digest');
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('sandbox106_input_json');}
    const mtime = new Date(Number(before.mtimeMs)).toISOString(), ctime = new Date(Number(before.ctimeMs)).toISOString();
    if (Math.abs(Date.parse(mtime) - Date.parse(ctime)) > 5 * 60 * 1000) fail('sandbox106_promotion_file_time_drift');
    return { value, mtime, ctime };
  } finally { bytes?.fill(0); if(fd!==undefined)fs.closeSync(fd); }
}

export function readTechnicalSandboxSecretEvidence(file) {
  if (!outsideRepo(file)) fail('sandbox106_secret_path');
  let fd;let scratch;const parts=[];let size=0;
  try {
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_CLOEXEC);
    const before=fs.fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.uid!==100n||before.gid!==101n
        ||(before.mode&0o7777n)!==0o600n||before.size<1n||before.size>16384n)fail('sandbox106_secret_metadata');
    const beforePath=fs.lstatSync(file,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==beforePath[k]))fail('sandbox106_secret_changed');
    scratch=Buffer.alloc(4096);
    while(true){const n=fs.readSync(fd,scratch,0,scratch.length,null);if(n<=0)break;size+=n;if(size>16384)fail('sandbox106_secret_size');parts.push(Buffer.from(scratch.subarray(0,n)));}
    const after=fs.fstatSync(fd,{bigint:true}),finalPath=fs.lstatSync(file,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]||after[k]!==finalPath[k])||BigInt(size)!==before.size)fail('sandbox106_secret_changed');
    const content=Buffer.concat(parts);let digest;try{digest=rawSha(content);}finally{content.fill(0);}
    return Object.freeze({path:file,sha256:digest,mode:'0600',uid:100,gid:101,regular:true,symlink:false,outsideRepository:true,mountReadOnly:true});
  } finally {scratch?.fill(0);for(const part of parts)part.fill(0);if(fd!==undefined)fs.closeSync(fd);}
}

export function readOnlyDocker({ exec = execFile } = {}) {
  return async args => new Promise((resolve, reject) => {
    if (!Array.isArray(args) || args.some(value => typeof value !== 'string' || value.includes('\u0000'))) return reject(new Error('sandbox106_docker_arguments'));
    exec('docker', args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => error ? reject(new Error('sandbox106_docker_readback')) : resolve(stdout));
  });
}

function jsonOne(text, code) {
  let rows; try { rows = JSON.parse(String(text)); } catch { fail(code); }
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') fail(code);
  return rows[0];
}

export async function readCanonicalGreenRuntime({ command = readOnlyDocker(), expectedCommit }) {
  if (expectedCommit !== undefined && !/^[a-f0-9]{40}$/u.test(expectedCommit)) fail('sandbox106_runtime_commit_input');
  const inventory = String(await command(['ps','--all','--no-trunc','--filter','name=^/shareittoo-staging-api$','--format','{{.ID}}'])).trim();
  const ids = inventory ? inventory.split(/\s+/u) : [];
  if (ids.length !== 1 || !/^[a-f0-9]{64}$/u.test(ids[0])) fail('sandbox106_runtime_name_inventory');
  const id = ids[0];
  const container = jsonOne(await command(['inspect',id]), 'sandbox106_runtime_inspect');
  if (container.Id !== id || container.Name !== '/shareittoo-staging-api' || container.State?.Running !== true
      || container.State?.Paused !== false || !Array.isArray(container.Config?.Env) || container.Config.Env.length === 0) fail('sandbox106_runtime_identity');
  const env = Object.fromEntries(container.Config.Env.map(pair => {
    const index = pair.indexOf('='); if (index < 1) fail('sandbox106_runtime_environment');
    return [pair.slice(0,index), pair.slice(index+1)];
  }));
  const labels = container.Config?.Labels ?? {};
  const promotionRunId = labels['com.shareittoo.green.106_106.promotion'];
  const runtimeCommit=env.APP_COMMIT;
  if (!/^[a-f0-9]{40}$/u.test(runtimeCommit ?? '') || (expectedCommit !== undefined && runtimeCommit !== expectedCommit) || env.DEPLOYMENT_ENVIRONMENT !== 'test'
      || env.SIT_STAGING_PILOT_ID !== 'heilbronn_wave0' || env.PAYMENT_TRANSPORT !== 'memory'
      || env.STRIPE_LIVEMODE !== 'false' || env.TECHNICAL_SANDBOX_ENABLED !== '0'
      || env.TECHNICAL_SANDBOX_KILL_SWITCH !== '1' || labels['com.shareittoo.sit.green'] !== 'true'
      || !/^[a-z0-9][a-z0-9-]{7,47}$/u.test(promotionRunId ?? '')
      || !labels['com.shareittoo.sit.green.run_id']) fail('sandbox106_runtime_binding');
  const sandboxPrivateEnv=['TECHNICAL_SANDBOX_ACCOUNT_ID','TECHNICAL_SANDBOX_USER_IDS','TECHNICAL_SANDBOX_AUTHORIZATION_ID',
    'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT','TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT',
    'TECHNICAL_SANDBOX_SECRET_KEY_FILE','TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET'];
  if (sandboxPrivateEnv.some(key => (env[key] ?? '') !== '') || !Array.isArray(container.Mounts)
      || container.Mounts.some(mount => /technical-sandbox/iu.test(String(mount.Destination ?? mount.DestinationPath ?? '')))) fail('sandbox106_runtime_not_disabled');
  const image = jsonOne(await command(['image','inspect',container.Image]), 'sandbox106_runtime_image');
  const digest = (image.RepoDigests ?? []).map(value => /^ghcr\.io\/shareittoo\/shareittoo-api@(?<digest>sha256:[a-f0-9]{64})$/u.exec(value)?.groups?.digest).filter(Boolean);
  if (image.Id !== container.Image || !digest.length || new Set(digest).size !== 1
      || image.Config?.Labels?.['org.opencontainers.image.revision'] !== runtimeCommit) fail('sandbox106_runtime_image_binding');
  return Object.freeze({ canonicalContainerId: id, commit: runtimeCommit, imageDigest: digest[0], promotionRunId,
    secretMountsRemoved: true, technicalSandboxDisabled: true, paymentTransport: 'memory', observedAt: new Date().toISOString() });
}

export function buildTechnicalSandbox106Evidence({ promotionReceipt, promotionReceiptSha256, runtime,
  ownerAuthorization, ownerAuthorizationSha256, credentials, stripeReadback, stripeReadbackSha256,
  rollback, rollbackSha256, promotedAt, now = Date.now, validateSecrets = validateTechnicalSandboxSecretMetadata } = {}) {
  if (![promotionReceiptSha256,ownerAuthorizationSha256,stripeReadbackSha256,rollbackSha256].every(sha)) fail('sandbox106_input_digest');
  exact(promotionReceipt, ['status','schemaVersion','kind','candidateId','sourceId','runtimeCommit','opsCommit','rehearsalSha256',
    'backupSha256','ownerSmokePassed','publicReleaseComplete','oldImageRestarted','lockRetained','intentionalProviderCalls',
    'gatewayVerified','gatewayVersionSha256','gatewayReadbackSha256','visibilityBoundary','renameReconciled',
    'canonicalRestartPolicy','canonicalRestartPolicyVerified','hostRebootVerified'], 'sandbox106_green_receipt_shape');
  if (promotionReceipt.kind !== 'sit-green-staging-106-106-promotion' || promotionReceipt.schemaVersion !== 2
      || promotionReceipt.status !== 'promoted_owner_smoke_pending' || promotionReceipt.candidateId !== runtime?.canonicalContainerId
      || promotionReceipt.runtimeCommit !== runtime?.commit || promotionReceipt.ownerSmokePassed !== false
      || promotionReceipt.publicReleaseComplete !== false || promotionReceipt.oldImageRestarted !== false
      || promotionReceipt.intentionalProviderCalls !== 0 || promotionReceipt.gatewayVerified !== true
      || promotionReceipt.canonicalRestartPolicyVerified !== true || promotionReceipt.canonicalRestartPolicy !== 'unless-stopped'
      || promotionReceipt.visibilityBoundary !== 'captured_id_rename' || !sha(promotionReceipt.gatewayReadbackSha256)) fail('sandbox106_green_receipt_binding');
  exact(ownerAuthorization, ['id','issuedAt','expiresAt','scope','userIds'], 'sandbox106_owner_authorization_shape');
  exact(stripeReadback, ['authenticated','accountId','accountMode','livemode','readAt'], 'sandbox106_stripe_readback_shape');
  exact(rollback, ['target','canonicalContainerId','imageDigest','gatewayReadbackSha256','verifiedAt',
    'mockPaymentTransport','technicalSandboxDisabled','secretMountsRemoved'], 'sandbox106_rollback_shape');
  if(rollback.target!==runtime?.commit||rollback.canonicalContainerId!==runtime?.canonicalContainerId
      ||rollback.imageDigest!==runtime?.imageDigest||!sha(rollback.gatewayReadbackSha256))fail('sandbox106_rollback_runtime_binding');
  if (!runtime || runtime.canonicalContainerId !== promotionReceipt.candidateId || runtime.commit !== promotionReceipt.runtimeCommit
  || !/^sha256:[a-f0-9]{64}$/u.test(runtime.imageDigest ?? '')
      || !/^[a-z0-9][a-z0-9-]{7,47}$/u.test(runtime.promotionRunId ?? '')
      || !credentials || !ownerAuthorization || !stripeReadback || !rollback) fail('sandbox106_runtime_binding');
  const runtimeObserved = Date.parse(runtime.observedAt);
  const promotionObserved = Date.parse(promotedAt);
  if (!Number.isFinite(runtimeObserved) || runtimeObserved > now() || now() - runtimeObserved > 5 * 60 * 1000
      || !Number.isFinite(promotionObserved) || runtimeObserved < promotionObserved) fail('sandbox106_runtime_stale');
  const evidence = {
    kind: 'sit-technical-sandbox-106-activation-evidence', schemaVersion: 1, environment: 'staging', pilotId: 'heilbronn_wave0',
    runtime: { canonicalContainerId: runtime.canonicalContainerId, commit: runtime.commit, imageDigest: runtime.imageDigest },
    promotion: { status: 'promoted', kind: 'sit-green-staging-106-106-promotion', runId: runtime.promotionRunId,
      candidateId: runtime.canonicalContainerId, receiptSha256: promotionReceiptSha256, sourceSchema: 106, targetSchema: 106,
      runtimeCommit: runtime.commit, imageDigest: runtime.imageDigest, promotedAt },
    ownerAuthorization: { ...ownerAuthorization, receiptSha256: ownerAuthorizationSha256 },
    credentials,
    stripeReadback: { ...stripeReadback, receiptSha256: stripeReadbackSha256 },
    rollback: { ...rollback, receiptSha256: rollbackSha256 },
    boundaries: { paymentTransport: 'memory', stripeLivemode: false, marketplaceStripe: false, bookingLedger: false,
      connect: false, payout: false, notifications: false, amountMinor: 100, currency: 'EUR', maxRunsPerUser24h: 3, syntheticOnly: true },
    validatedAt: new Date(now()).toISOString(),
  };
  if (!promotedAt) fail('sandbox106_green_promotion_time');
  if (validateSecrets(evidence) !== true) fail('sandbox106_secret_metadata');
  validateTechnicalSandbox106Evidence(evidence, { now: now() });
  return Object.freeze(evidence);
}

export function writeTechnicalSandboxEvidenceNoClobber(filename, evidence) {
  if (!outsideRepo(filename)) fail('sandbox106_output_path');
  const directory = privateDirectory(path.dirname(filename));
  const target = path.basename(filename);
  if (!/^[a-z0-9][a-z0-9._-]{0,150}$/u.test(target)) fail('sandbox106_output_name');
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const temporary = `.${target}.${crypto.randomBytes(16).toString('hex')}.tmp`;
  let fd, createdIdentity;
  try {
    fd = fs.openSync(path.join(directory.directory, temporary), fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd, { bigint: true });
    createdIdentity = { dev: stat.dev, ino: stat.ino };
    if (!stat.isFile() || stat.nlink !== 1n || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o7777n) !== 0o600n || stat.size !== BigInt(bytes.length)) fail('sandbox106_output_metadata');
    fs.linkSync(path.join(directory.directory, temporary), filename);
    const linked = fs.lstatSync(filename, { bigint: true });
    if (linked.dev !== stat.dev || linked.ino !== stat.ino) fail('sandbox106_output_link_changed');
    fs.unlinkSync(path.join(directory.directory, temporary));
    const final = fs.fstatSync(fd, { bigint: true });
    const finalPath = fs.lstatSync(filename, { bigint: true });
    if (!final.isFile() || final.dev !== stat.dev || final.ino !== stat.ino || final.nlink !== 1n
        || final.uid !== BigInt(process.getuid()) || (final.mode & 0o7777n) !== 0o600n || final.size !== BigInt(bytes.length)
        || ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k => final[k] !== finalPath[k])) fail('sandbox106_output_metadata');
    const check = Buffer.alloc(bytes.length); let offset = 0;
    while (offset < check.length) { const n = fs.readSync(fd, check, offset, check.length - offset, offset); if (n <= 0) fail('sandbox106_output_short_read'); offset += n; }
    if (rawSha(check) !== rawSha(bytes)) { check.fill(0); fail('sandbox106_output_digest'); }
    check.fill(0);
    const rawSha256 = rawSha(bytes); bytes.fill(0); return Object.freeze({ path: filename, rawSha256 });
  } catch (error) {
    bytes.fill(0); try { fs.unlinkSync(path.join(directory.directory, temporary)); } catch {}
    try { const current=fs.lstatSync(filename,{bigint:true}); if(createdIdentity&&current.dev===createdIdentity.dev&&current.ino===createdIdentity.ino)fs.unlinkSync(filename); } catch {}
    throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const flags = new Set(['promotion-receipt','promotion-receipt-sha256','owner-authorization','owner-authorization-sha256',
  'stripe-readback','stripe-readback-sha256','rollback-proof','rollback-proof-sha256','secret-key','webhook-secret','output']);
export function parseMaterializerArgs(args) {
  if (args.length % 2) fail('sandbox106_arguments'); const result = {};
  for (let i=0;i<args.length;i+=2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!flags.has(key) || Object.hasOwn(result,key) || typeof args[i+1] !== 'string' || args[i+1].startsWith('--')) fail('sandbox106_arguments');
    result[key]=args[i+1];
  }
  if ([...flags].some(key => !result[key]) || !['promotion-receipt-sha256','owner-authorization-sha256','stripe-readback-sha256','rollback-proof-sha256'].every(k=>sha(result[k]))) fail('sandbox106_arguments');
  for (const key of ['promotion-receipt','owner-authorization','stripe-readback','rollback-proof','secret-key','webhook-secret','output']) if (!outsideRepo(result[key])) fail('sandbox106_input_path');
  return Object.freeze(result);
}

export async function runTechnicalSandbox106Materializer(args, { now = Date.now, command = readOnlyDocker(),
  secretEvidence = readTechnicalSandboxSecretEvidence } = {}) {
  const options = parseMaterializerArgs(args);
  const promotionInput = readProtectedJsonWithTime(options['promotion-receipt'], options['promotion-receipt-sha256']);
  const promotionReceipt = promotionInput.value;
  const ownerAuthorization = readProtectedJson(options['owner-authorization'], options['owner-authorization-sha256']);
  const stripeReadback = readProtectedJson(options['stripe-readback'], options['stripe-readback-sha256']);
  const rollback = readProtectedJson(options['rollback-proof'], options['rollback-proof-sha256']);
  const runtime = await readCanonicalGreenRuntime({ command, expectedCommit: promotionReceipt.runtimeCommit });
  const credentials = { secretKey: { kind:'restricted_test_key', ...secretEvidence(options['secret-key']) },
    webhookSecret: { kind:'webhook_signing_secret', ...secretEvidence(options['webhook-secret']) } };
  const evidence = buildTechnicalSandbox106Evidence({ promotionReceipt, promotionReceiptSha256: options['promotion-receipt-sha256'],
    runtime, ownerAuthorization, ownerAuthorizationSha256: options['owner-authorization-sha256'], credentials,
    stripeReadback, stripeReadbackSha256: options['stripe-readback-sha256'], rollback,
    rollbackSha256: options['rollback-proof-sha256'], promotedAt: promotionInput.mtime, now });
  const written = writeTechnicalSandboxEvidenceNoClobber(options.output, evidence);
  return Object.freeze({ status: 'evidence_materialized', rawSha256: written.rawSha256, evidenceSha256: validateTechnicalSandbox106Evidence(evidence, { now: now() }).evidenceSha256,
    runtimeCommit: runtime.commit, imageDigest: runtime.imageDigest, validatedAt: evidence.validatedAt });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTechnicalSandbox106Materializer(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error?.code ?? 'sandbox106_materializer_rejected'}\n`); process.exitCode = 2; });
}
