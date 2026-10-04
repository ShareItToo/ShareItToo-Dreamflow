import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FACEBOOK_WEB_PROFILE = 'staging-facebook-web-v1';
export const FACEBOOK_WEB_TARGET = 'https://staging.shareittoo.com';

export const facebookWebFields = Object.freeze({
  projectId: 'SIT_FACEBOOK_WEB_PROJECT_ID',
  messagingSenderId: 'SIT_FACEBOOK_WEB_SENDER_ID',
  appId: 'SIT_FACEBOOK_WEB_APP_ID',
  apiKey: 'SIT_FACEBOOK_WEB_API_KEY',
  authDomain: 'SIT_FACEBOOK_WEB_AUTH_DOMAIN',
  backendProjectId: 'SIT_FACEBOOK_WEB_BACKEND_PROJECT_ID',
  authorizedOrigin: 'SIT_FACEBOOK_WEB_ORIGIN',
});

const envelopeKeys = Object.freeze([
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'configuration',
  'configurationSha256',
  'readiness',
  'readinessSha256',
]);
const configurationKeys = Object.freeze(Object.keys(facebookWebFields));
const readinessKeys = Object.freeze([
  'schemaVersion',
  'provider',
  'platform',
  'origin',
  'backendFirebaseProjectId',
  'webAppConfigSha256',
  'callbackUrl',
  'firebaseProviderEnabled',
  'metaAppMode',
  'audience',
  'audienceVerified',
  'providerReadbackSha256',
  'observedAtUtc',
  'validUntilUtc',
]);
const bindingKeys = Object.freeze([
  'config',
  'configDigest',
  'readinessJson',
  'readinessDigest',
  'evidenceDigest',
  'validatedAtUtc',
]);
const hashPattern = /^[a-f0-9]{64}$/u;
const maxEvidenceAgeMs = 2 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requireThat = (condition, code) => {
  if (!condition) throw new Error(code);
};

function exactObject(value, keys, code) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key)), code);
}

function ordered(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function canonicalUtc(value, code) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  requireThat(!Number.isNaN(date.getTime()), code);
  if (value instanceof Date) date.setUTCMilliseconds(0);
  const canonical = date.toISOString().replace('.000Z', 'Z');
  requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(canonical), code);
  if (!(value instanceof Date)) requireThat(value === canonical, code);
  return canonical;
}

function sameStat(a, b) {
  return ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => a[key] === b[key]);
}

function confinedDirectory(directory) {
  requireThat(path.isAbsolute(directory) && path.normalize(directory) === directory
    && directory !== '/', 'facebook_web_readiness_path');
  let cursor = '/';
  for (const part of directory.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'facebook_web_readiness_path');
  }
}

function canonicalEnvelope(evidence) {
  exactObject(evidence, envelopeKeys, 'facebook_web_readiness_shape');
  exactObject(evidence.configuration, configurationKeys, 'facebook_web_config_shape');
  exactObject(evidence.readiness, readinessKeys, 'facebook_web_readiness_shape');
  return ordered({
    ...evidence,
    configuration: ordered(evidence.configuration, configurationKeys),
    readiness: ordered(evidence.readiness, readinessKeys),
  }, envelopeKeys);
}

export function bindFacebookWebReadiness(evidence, evidenceDigest, { now = new Date() } = {}) {
  const canonical = canonicalEnvelope(evidence);
  const canonicalJson = JSON.stringify(canonical);
  requireThat(JSON.stringify(evidence) === canonicalJson, 'facebook_web_readiness_canonical');
  requireThat(hashPattern.test(evidenceDigest ?? '')
    && sha256(canonicalJson) === evidenceDigest, 'facebook_web_evidence_digest_mismatch');
  requireThat(canonical.schemaVersion === 1
    && canonical.kind === 'sit-facebook-web-release-readiness'
    && canonical.evidenceClass === 'verified-external'
    && canonical.syntheticFixture === false, 'facebook_web_evidence_class');

  const config = canonical.configuration;
  const configJson = JSON.stringify(config);
  requireThat(Object.values(config).every((value) => typeof value === 'string')
    && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(config.projectId)
    && /^[0-9]{6,20}$/u.test(config.messagingSenderId)
    && new RegExp(`^1:${config.messagingSenderId}:web:[a-f0-9]{16,64}$`, 'u').test(config.appId)
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(config.apiKey)
    && config.authDomain === `${config.projectId}.firebaseapp.com`
    && config.backendProjectId === config.projectId
    && config.authorizedOrigin === FACEBOOK_WEB_TARGET,
  'facebook_web_config_invalid');
  requireThat(hashPattern.test(canonical.configurationSha256)
    && sha256(configJson) === canonical.configurationSha256,
  'facebook_web_config_digest_mismatch');

  const readiness = canonical.readiness;
  const readinessJson = JSON.stringify(readiness);
  requireThat(hashPattern.test(canonical.readinessSha256)
    && sha256(readinessJson) === canonical.readinessSha256,
  'facebook_web_readiness_digest_mismatch');
  const observedAtUtc = canonicalUtc(readiness.observedAtUtc, 'facebook_web_readiness_time');
  const validUntilUtc = canonicalUtc(readiness.validUntilUtc, 'facebook_web_readiness_time');
  const validatedAtUtc = canonicalUtc(now, 'facebook_web_readiness_clock');
  const observed = Date.parse(observedAtUtc);
  const validUntil = Date.parse(validUntilUtc);
  const validatedAt = Date.parse(validatedAtUtc);
  requireThat(readiness.schemaVersion === 1
    && readiness.provider === 'facebook'
    && readiness.platform === 'web'
    && readiness.origin === config.authorizedOrigin
    && readiness.backendFirebaseProjectId === config.backendProjectId
    && readiness.webAppConfigSha256 === canonical.configurationSha256
    && readiness.callbackUrl === `https://${config.authDomain}/__/auth/handler`
    && readiness.firebaseProviderEnabled === true
    && readiness.metaAppMode === 'development'
    && readiness.audience === 'app_roles_only'
    && readiness.audienceVerified === true
    && typeof readiness.providerReadbackSha256 === 'string'
    && hashPattern.test(readiness.providerReadbackSha256)
    && validUntil > observed
    && validUntil - observed <= maxEvidenceAgeMs
    && validatedAt >= observed
    && validatedAt - observed <= maxEvidenceAgeMs
    && validatedAt < validUntil,
  'facebook_web_readiness_invalid');

  return Object.freeze({
    config: Object.freeze({ ...config }),
    configDigest: canonical.configurationSha256,
    readinessJson,
    readinessDigest: canonical.readinessSha256,
    evidenceDigest,
    validatedAtUtc,
  });
}

export function validateFacebookWebBinding(binding, { freshAt = null } = {}) {
  exactObject(binding, bindingKeys, 'facebook_web_binding_shape');
  const validatedAtUtc = canonicalUtc(binding.validatedAtUtc, 'facebook_web_binding_time');
  let readiness;
  try {
    readiness = JSON.parse(binding.readinessJson);
  } catch {
    throw new Error('facebook_web_readiness_json');
  }
  const evidence = ordered({
    schemaVersion: 1,
    kind: 'sit-facebook-web-release-readiness',
    evidenceClass: 'verified-external',
    syntheticFixture: false,
    configuration: binding.config,
    configurationSha256: binding.configDigest,
    readiness,
    readinessSha256: binding.readinessDigest,
  }, envelopeKeys);
  const rebound = bindFacebookWebReadiness(evidence, binding.evidenceDigest, {
    now: new Date(validatedAtUtc),
  });
  requireThat(JSON.stringify(rebound) === JSON.stringify(binding), 'facebook_web_binding_mismatch');
  if (freshAt !== null) {
    bindFacebookWebReadiness(evidence, binding.evidenceDigest, { now: freshAt });
  }
  return rebound;
}

export function readFacebookWebReadiness(file, evidenceDigest, { now = new Date() } = {}) {
  requireThat(typeof file === 'string' && path.isAbsolute(file)
    && path.normalize(file) === file, 'facebook_web_readiness_path');
  const parent = path.dirname(file);
  let parentFd;
  let fd;
  try {
    // Open first; all authorization checks bind to this retained descriptor,
    // never to a pathname checked before open.
    parentFd = fs.openSync(parent,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    confinedDirectory(parent);
    const parentBefore = fs.fstatSync(parentFd, { bigint: true });
    const parentPathBefore = fs.lstatSync(parent, { bigint: true });
    requireThat(parentBefore.isDirectory() && parentBefore.nlink >= 1n
      && parentBefore.uid === BigInt(process.getuid())
      && (parentBefore.mode & 0o7777n) === 0o700n
      && sameStat(parentBefore, parentPathBefore),
    'facebook_web_readiness_parent');
    fd = fs.openSync(file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    requireThat(before.isFile() && before.nlink === 1n
      && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n
      && before.size >= 2n && before.size <= 16384n,
    'facebook_web_readiness_file');
    requireThat(sameStat(before, fs.lstatSync(file, { bigint: true }))
      && sameStat(parentBefore, fs.fstatSync(parentFd, { bigint: true }))
      && sameStat(parentBefore, fs.lstatSync(parent, { bigint: true })),
    'facebook_web_readiness_changed');
    // A raced growth must not make readFileSync allocate beyond the ceiling.
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      requireThat(count > 0, 'facebook_web_readiness_changed');
      offset += count;
    }
    requireThat(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0,
      'facebook_web_readiness_changed');
    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(file, { bigint: true });
    const parentAfter = fs.fstatSync(parentFd, { bigint: true });
    const parentPathAfter = fs.lstatSync(parent, { bigint: true });
    requireThat(BigInt(bytes.length) === before.size
      && sameStat(before, after) && sameStat(before, pathAfter)
      && sameStat(parentBefore, parentAfter)
      && sameStat(parentBefore, parentPathAfter), 'facebook_web_readiness_changed');
    const raw = bytes.toString('utf8');
    requireThat(hashPattern.test(evidenceDigest ?? '')
      && sha256(bytes) === evidenceDigest, 'facebook_web_evidence_digest_mismatch');
    let evidence;
    try {
      evidence = JSON.parse(raw);
    } catch {
      throw new Error('facebook_web_readiness_json');
    }
    requireThat(JSON.stringify(evidence) === raw, 'facebook_web_readiness_canonical');
    return bindFacebookWebReadiness(evidence, evidenceDigest, { now });
  } catch (error) {
    if (/^facebook_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('facebook_web_readiness_file');
  } finally {
    let closeFailed = false;
    for (const descriptor of [fd, parentFd]) {
      try { if (descriptor !== undefined) fs.closeSync(descriptor); }
      catch { closeFailed = true; }
    }
    requireThat(!closeFailed, 'facebook_web_readiness_file');
  }
}
