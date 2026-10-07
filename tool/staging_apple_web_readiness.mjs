import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const APPLE_WEB_PROFILE = 'staging-apple-web-v1';
export const APPLE_WEB_TARGET = 'https://staging.shareittoo.com';
export const appleWebFields = Object.freeze({
  projectId: 'SIT_APPLE_WEB_PROJECT_ID',
  messagingSenderId: 'SIT_APPLE_WEB_SENDER_ID',
  appId: 'SIT_APPLE_WEB_APP_ID',
  apiKey: 'SIT_APPLE_WEB_API_KEY',
  authDomain: 'SIT_APPLE_WEB_AUTH_DOMAIN',
  backendProjectId: 'SIT_APPLE_WEB_BACKEND_PROJECT_ID',
  authorizedOrigin: 'SIT_APPLE_WEB_ORIGIN',
  clientId: 'SIT_APPLE_WEB_CLIENT_ID',
  redirectUri: 'SIT_APPLE_WEB_REDIRECT_URI',
});
export const appleWebEvidenceFields = Object.freeze({
  configDigest: 'SIT_APPLE_WEB_CONFIG_SHA256',
  readinessJson: 'SIT_APPLE_WEB_READINESS_JSON',
  readinessDigest: 'SIT_APPLE_WEB_READINESS_SHA256',
  backendJson: 'SIT_APPLE_WEB_BACKEND_READINESS_JSON',
  backendDigest: 'SIT_APPLE_WEB_BACKEND_READINESS_SHA256',
  decisionJson: 'SIT_APPLE_WEB_DECISION_JSON',
  decisionDigest: 'SIT_APPLE_WEB_DECISION_SHA256',
  evidenceDigest: 'SIT_APPLE_WEB_EVIDENCE_SHA256',
});
const envelopeKeys = [
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture',
  'activationEligible', 'configuration', 'configurationSha256', 'readiness',
  'readinessSha256', 'backend', 'backendSha256', 'decision', 'decisionSha256',
];
// Exact current Direct-Web runtime contract (not the dormant Firebase-handler W1).
const readinessKeys = [
  'schemaVersion', 'provider', 'platform', 'origin', 'apiBaseUrl',
  'backendFirebaseProjectId', 'webAppConfigSha256', 'callbackUrl',
  'firebaseProviderEnabled', 'firebaseAppleOAuthConfigured',
  'appleServicesIdSha256', 'firebaseAppleServicesIdSha256', 'backendAppleServicesIdSha256',
  'backendAppleOwnershipConfigured', 'backendAppleAcquisitionEnabled',
  'appleTeamIdSha256', 'firebaseAppleTeamIdSha256', 'appleKeyIdSha256',
  'firebaseAppleKeyIdSha256', 'applePrimaryAppSignInEnabled',
  'appleServicesIdBoundToPrimaryApp', 'appleSigningKeyEnabled',
  'appleRedirectDomainSha256', 'backendAppleRedirectUriSha256',
  'appleRedirectDomainVerified', 'appleReturnUrlVerified', 'scope', 'audience',
  'audienceVerified', 'providerReadbackSha256', 'observedAtUtc', 'validUntilUtc',
];
const backendKeys = [
  'schemaVersion', 'evidenceClass', 'syntheticFixture', 'sourceCommit',
  'runtimeCommit', 'runtimeImageSha256', 'firebaseProjectId', 'webAppId',
  'apiBaseUrl', 'appleServicesIdSha256', 'appleRedirectUriSha256',
  'appleTeamIdSha256', 'appleKeyIdSha256', 'revocationEnabled',
  'revocationConfigured', 'revocationSigningKeySource', 'revocationEncryptionKeySource',
  'protectedSecretFilesVerified', 'ownershipConfigured', 'acquisitionEnabled',
  'ownershipProtocolVersion', 'ownershipProfileSha256', 'existingAccountsOnly',
  'allowlistEnforced', 'allowlistSha256', 'firebaseAuthEnabled', 'firebaseEmulatorEnabled',
  'collectorIdentitySha256', 'appleProviderReadbackSha256',
  'firebaseProviderReadbackSha256', 'firebaseWebAppReadbackSha256',
  'runtimeReadbackSha256', 'observedAtUtc', 'validUntilUtc',
];
const decisionKeys = [
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'decision',
  'sourceCommit', 'configurationSha256', 'readinessSha256', 'backendSha256',
  'collectorIdentitySha256', 'reviewerIdentitySha256', 'reviewEvidenceSha256',
  'decidedAtUtc', 'validUntilUtc',
];
const bindingKeys = [
  'config', 'configDigest', 'readinessJson', 'readinessDigest', 'backendJson',
  'backendDigest', 'decisionJson', 'decisionDigest', 'evidenceDigest', 'validatedAtUtc',
];
const hashPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
// Build/deployment freshness is intentionally narrower than the dormant 24h UI bound.
const maximumAgeMs = 2 * 60 * 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, code) => { if (!condition) throw new Error(code); };
const ordered = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));
function exact(value, keys, code = 'apple_web_readiness_shape') {
  check(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)), code);
}
function iso(value, code) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  check(!Number.isNaN(date.getTime()), code);
  const result = date.toISOString().replace('.000Z', 'Z');
  if (!(value instanceof Date)) check(value === result, code);
  return result;
}
function sameFile(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key]);
}
function sameDirectory(left, right, parent) {
  return (parent ? ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink']
    : ['dev', 'ino', 'mode', 'uid', 'gid']).every((key) => left[key] === right[key]);
}
function openDirectories(directory, descriptors) {
  check(path.isAbsolute(directory) && path.normalize(directory) === directory
    && directory !== '/', 'apple_web_readiness_path');
  const paths = ['/'];
  for (const part of directory.split('/').filter(Boolean)) {
    paths.push(path.join(paths.at(-1), part));
  }
  return paths.map((file, index) => {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
      | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const stat = fs.fstatSync(fd, { bigint: true });
    check(stat.isDirectory() && sameDirectory(stat,
      fs.lstatSync(file, { bigint: true }), index === paths.length - 1),
    'apple_web_readiness_path');
    return { file, fd, stat };
  });
}
function assertDirectories(directories) {
  for (const [index, entry] of directories.entries()) {
    const parent = index === directories.length - 1;
    check(sameDirectory(entry.stat, fs.fstatSync(entry.fd, { bigint: true }), parent)
      && sameDirectory(entry.stat, fs.lstatSync(entry.file, { bigint: true }), parent),
    'apple_web_readiness_changed');
  }
}
function readProtected(file) {
  check(typeof file === 'string' && path.isAbsolute(file)
    && path.normalize(file) === file, 'apple_web_readiness_path');
  const descriptors = [];
  let bytes;
  try {
    const directories = openDirectories(path.dirname(file), descriptors);
    const parent = directories.at(-1).stat;
    check(parent.uid === BigInt(process.getuid())
      && (parent.mode & 0o7777n) === 0o700n, 'apple_web_readiness_parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n
      && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n
      && before.size >= 2n && before.size <= 32768n
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'apple_web_readiness_file');
    assertDirectories(directories);
    bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      check(count > 0, 'apple_web_readiness_changed');
      offset += count;
    }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0,
      'apple_web_readiness_changed');
    check(sameFile(before, fs.fstatSync(fd, { bigint: true }))
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'apple_web_readiness_changed');
    assertDirectories(directories);
    return bytes;
  } catch (error) {
    if (/^apple_web_readiness_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('apple_web_readiness_file');
  } finally {
    let closeFailed = false;
    for (const fd of descriptors.reverse()) {
      try { fs.closeSync(fd); } catch { closeFailed = true; }
    }
    check(!closeFailed, 'apple_web_readiness_file');
  }
}

function canonicalEnvelope(value) {
  exact(value, envelopeKeys);
  exact(value.configuration, Object.keys(appleWebFields));
  exact(value.readiness, readinessKeys);
  exact(value.backend, backendKeys);
  exact(value.decision, decisionKeys);
  return ordered({ ...value,
    configuration: ordered(value.configuration, Object.keys(appleWebFields)),
    readiness: ordered(value.readiness, readinessKeys),
    backend: ordered(value.backend, backendKeys),
    decision: ordered(value.decision, decisionKeys),
  }, envelopeKeys);
}
function digest(value, expected, code) {
  const raw = JSON.stringify(value);
  check(hashPattern.test(expected ?? '') && sha256(raw) === expected, code);
  return raw;
}
function window(value, now, code) {
  check([value.observedAtUtc ?? value.decidedAtUtc, value.validUntilUtc]
    .every((time) => typeof time === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(time)), code);
  const start = Date.parse(iso(value.observedAtUtc ?? value.decidedAtUtc, code));
  const end = Date.parse(iso(value.validUntilUtc, code));
  check(end > start && end - start <= maximumAgeMs && now >= start && now < end, code);
  return { start, end };
}

// This consumer never creates approval. The caller must obtain the expected
// digest independently of the file; hashes authenticate bindings, not reviewers.
export function bindAppleWebReadiness(evidence, evidenceDigest,
  { now = new Date(), expectedSource = null } = {}) {
  const e = canonicalEnvelope(evidence);
  check(JSON.stringify(evidence) === JSON.stringify(e), 'apple_web_readiness_canonical');
  digest(e, evidenceDigest, 'apple_web_evidence_digest_mismatch');
  check(e.schemaVersion === 1 && e.kind === 'sit-apple-web-release-readiness'
    && e.evidenceClass === 'provider-runtime-readback-and-independent-decision'
    && e.syntheticFixture === false && e.activationEligible === true,
  'apple_web_evidence_class');
  const c = e.configuration;
  let redirect;
  try { redirect = new URL(c.redirectUri); } catch { throw new Error('apple_web_config_invalid'); }
  check(Object.values(c).every((value) => typeof value === 'string')
    && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(c.projectId)
    && /^[0-9]{6,20}$/u.test(c.messagingSenderId)
    && new RegExp(`^1:${c.messagingSenderId}:web:[a-f0-9]{16,64}$`, 'u').test(c.appId)
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(c.apiKey)
    && c.authDomain === `${c.projectId}.firebaseapp.com`
    && c.backendProjectId === c.projectId && c.authorizedOrigin === APPLE_WEB_TARGET
    && /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u.test(c.clientId)
    && redirect.href === c.redirectUri && redirect.origin === APPLE_WEB_TARGET
    && redirect.pathname !== '/' && !redirect.search && !redirect.hash
    && !redirect.username && !redirect.password,
  'apple_web_config_invalid');
  digest(c, e.configurationSha256, 'apple_web_config_digest_mismatch');
  const r = e.readiness;
  const readinessJson = digest(r, e.readinessSha256, 'apple_web_readiness_digest_mismatch');
  const validatedAtUtc = iso(now, 'apple_web_readiness_clock');
  const clock = Date.parse(validatedAtUtc);
  const rw = window(r, clock, 'apple_web_readiness_time');
  const clientDigest = sha256(c.clientId);
  const redirectDigest = sha256(c.redirectUri);
  check(r.schemaVersion === 2 && r.provider === 'apple' && r.platform === 'web_direct'
    && r.origin === c.authorizedOrigin && r.apiBaseUrl === `${APPLE_WEB_TARGET}/api/v1`
    && r.backendFirebaseProjectId === c.backendProjectId
    && r.webAppConfigSha256 === e.configurationSha256 && r.callbackUrl === c.redirectUri
    && ['firebaseProviderEnabled', 'firebaseAppleOAuthConfigured',
      'backendAppleOwnershipConfigured', 'backendAppleAcquisitionEnabled',
      'applePrimaryAppSignInEnabled', 'appleServicesIdBoundToPrimaryApp',
      'appleSigningKeyEnabled', 'appleRedirectDomainVerified', 'appleReturnUrlVerified',
      'audienceVerified'].every((key) => r[key] === true)
    && ['appleServicesIdSha256', 'firebaseAppleServicesIdSha256',
      'backendAppleServicesIdSha256'].every((key) => r[key] === clientDigest)
    && hashPattern.test(r.appleTeamIdSha256) && r.appleTeamIdSha256 === r.firebaseAppleTeamIdSha256
    && hashPattern.test(r.appleKeyIdSha256) && r.appleKeyIdSha256 === r.firebaseAppleKeyIdSha256
    && r.appleRedirectDomainSha256 === sha256(redirect.hostname)
    && r.backendAppleRedirectUriSha256 === redirectDigest
    && r.scope === 'private_pilot' && r.audience === 'existing_allowlisted_accounts_only'
    && hashPattern.test(r.providerReadbackSha256), 'apple_web_readiness_invalid');
  const b = e.backend;
  const backendJson = digest(b, e.backendSha256, 'apple_web_backend_digest_mismatch');
  const bw = window(b, clock, 'apple_web_backend_time');
  check(b.schemaVersion === 1 && b.evidenceClass === 'verified-runtime-readback'
    && b.syntheticFixture === false && sourcePattern.test(b.sourceCommit)
    && (expectedSource === null || b.sourceCommit === expectedSource)
    && sourcePattern.test(b.runtimeCommit)
    && b.firebaseProjectId === c.backendProjectId && b.webAppId === c.appId
    && b.apiBaseUrl === r.apiBaseUrl && b.appleServicesIdSha256 === clientDigest
    && b.appleRedirectUriSha256 === redirectDigest
    && b.appleTeamIdSha256 === r.appleTeamIdSha256 && b.appleKeyIdSha256 === r.appleKeyIdSha256
    && ['revocationEnabled', 'revocationConfigured', 'protectedSecretFilesVerified',
      'ownershipConfigured', 'acquisitionEnabled', 'existingAccountsOnly',
      'allowlistEnforced', 'firebaseAuthEnabled'].every((key) => b[key] === true)
    && b.firebaseEmulatorEnabled === false && b.ownershipProtocolVersion === 2
    && b.revocationSigningKeySource === 'file' && b.revocationEncryptionKeySource === 'file'
    && backendKeys.filter((key) => key.endsWith('Sha256'))
      .every((key) => hashPattern.test(b[key] ?? '')), 'apple_web_backend_invalid');
  const d = e.decision;
  const decisionJson = digest(d, e.decisionSha256, 'apple_web_decision_digest_mismatch');
  const dw = window(d, clock, 'apple_web_decision_time');
  check(d.schemaVersion === 1 && d.kind === 'sit-apple-web-activation-decision'
    && d.evidenceClass === 'independent-release-review' && d.syntheticFixture === false
    && d.decision === 'approved' && d.sourceCommit === b.sourceCommit
    && d.configurationSha256 === e.configurationSha256
    && d.readinessSha256 === e.readinessSha256 && d.backendSha256 === e.backendSha256
    && d.collectorIdentitySha256 === b.collectorIdentitySha256
    && hashPattern.test(d.reviewerIdentitySha256)
    && d.reviewerIdentitySha256 !== d.collectorIdentitySha256
    && hashPattern.test(d.reviewEvidenceSha256)
    && dw.start >= Math.max(rw.start, bw.start)
    && dw.end <= Math.min(rw.end, bw.end), 'apple_web_decision_invalid');
  return Object.freeze({
    config: Object.freeze({ ...c }), configDigest: e.configurationSha256,
    readinessJson, readinessDigest: e.readinessSha256,
    backendJson, backendDigest: e.backendSha256,
    decisionJson, decisionDigest: e.decisionSha256, evidenceDigest, validatedAtUtc,
  });
}
export function validateAppleWebBinding(binding, { freshAt = null, expectedSource = null } = {}) {
  exact(binding, bindingKeys, 'apple_web_binding_shape');
  let readiness, backend, decision;
  try {
    readiness = JSON.parse(binding.readinessJson);
    backend = JSON.parse(binding.backendJson);
    decision = JSON.parse(binding.decisionJson);
  } catch { throw new Error('apple_web_readiness_json'); }
  const evidence = {
    schemaVersion: 1, kind: 'sit-apple-web-release-readiness',
    evidenceClass: 'provider-runtime-readback-and-independent-decision',
    syntheticFixture: false, activationEligible: true,
    configuration: binding.config, configurationSha256: binding.configDigest,
    readiness, readinessSha256: binding.readinessDigest,
    backend, backendSha256: binding.backendDigest,
    decision, decisionSha256: binding.decisionDigest,
  };
  const rebound = bindAppleWebReadiness(evidence, binding.evidenceDigest,
    { now: binding.validatedAtUtc, expectedSource });
  check(JSON.stringify(rebound) === JSON.stringify(binding), 'apple_web_binding_mismatch');
  if (freshAt !== null) bindAppleWebReadiness(evidence, binding.evidenceDigest,
    { now: freshAt, expectedSource });
  return rebound;
}
export function readAppleWebReadiness(file, evidenceDigest,
  { now = new Date(), expectedSource = null } = {}) {
  const bytes = readProtected(file);
  try {
    check(hashPattern.test(evidenceDigest ?? '') && sha256(bytes) === evidenceDigest,
      'apple_web_evidence_digest_mismatch');
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const evidence = JSON.parse(raw);
    check(JSON.stringify(evidence) === raw, 'apple_web_readiness_canonical');
    return bindAppleWebReadiness(evidence, evidenceDigest, { now, expectedSource });
  } catch (error) {
    if (/^apple_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('apple_web_readiness_json');
  } finally { bytes.fill(0); }
}
