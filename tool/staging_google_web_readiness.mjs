import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GOOGLE_WEB_PROFILE_V2 = 'staging-google-web-v2';
export const GOOGLE_WEB_TARGET = 'https://staging.shareittoo.com';

const envelopeKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture',
  'activationDecision', 'activationEligible', 'configuration',
  'configurationSha256', 'readiness', 'readinessSha256', 'decision',
  'decisionSha256',
]);
const configurationKeys = Object.freeze([
  'projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain',
  'backendProjectId', 'authorizedOrigin',
]);
const readinessKeys = Object.freeze([
  'sourceCommit', 'prerequisiteRunnerSha256', 'firebaseAccountEmailSha256',
  'gateEvidenceSha256', 'baselineSha256', 'projectId', 'projectNumber',
  'backendProjectId', 'webAppId', 'authorizedDomain', 'firebaseProviderId',
  'firebaseProviderEnabled', 'firebaseAuthEnabled', 'firebaseEmulatorEnabled',
  'finalSnapshotSha256', 'finalRevisionSha256', 'authConfigReadbackSha256',
  'providerConfigReadbackSha256', 'webAppReadbackSha256',
  'authorizedDomainsReadbackSha256', 'keyInventoryReadbackSha256',
  'otherAppsReadbackSha256', 'runtimeReadbackSha256',
  'prerequisiteJournalSha256', 'prerequisiteFinalRecordSha256',
  'collectedAtUtc', 'validUntilUtc',
]);
const decisionKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'decision',
  'sourceCommit', 'prerequisiteJournalSha256', 'prerequisiteFinalRecordSha256',
  'configurationSha256', 'readinessSha256', 'projectId', 'projectNumber',
  'webAppId', 'authorizedDomain', 'firebaseProviderId', 'decidedAtUtc',
  'validUntilUtc',
]);
const bindingKeys = Object.freeze([
  'config', 'configDigest', 'readinessJson', 'readinessDigest', 'decisionJson',
  'decisionDigest', 'evidenceDigest', 'validatedAtUtc',
]);
const hashPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const maximumAgeMs = 2 * 60 * 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, code) => { if (!condition) throw new Error(code); };
const ordered = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));

function exact(value, keys, code) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)), code);
}
// The collector and builder share this schema-defined serialization. Keep it
// distinct from the prerequisite journal's recursively sorted snapshot digest.
export function googleWebReadinessDigest(readiness) {
  exact(readiness, readinessKeys, 'google_web_readiness_shape');
  return sha256(JSON.stringify(ordered(readiness, readinessKeys)));
}
function iso(value, code) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  check(!Number.isNaN(date.getTime()), code);
  const result = date.toISOString();
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
    && directory !== '/', 'google_web_readiness_path');
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
    'google_web_readiness_path');
    return { file, fd, stat };
  });
}
function assertDirectories(directories) {
  for (const [index, entry] of directories.entries()) {
    const parent = index === directories.length - 1;
    check(sameDirectory(entry.stat, fs.fstatSync(entry.fd, { bigint: true }), parent)
      && sameDirectory(entry.stat, fs.lstatSync(entry.file, { bigint: true }), parent),
    'google_web_readiness_changed');
  }
}
function readProtected(file) {
  check(typeof file === 'string' && path.isAbsolute(file)
    && path.normalize(file) === file, 'google_web_readiness_path');
  const descriptors = [];
  let bytes;
  try {
    const directories = openDirectories(path.dirname(file), descriptors);
    const parent = directories.at(-1).stat;
    check(parent.uid === BigInt(process.getuid())
      && (parent.mode & 0o7777n) === 0o700n, 'google_web_readiness_parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n
      && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n
      && before.size >= 2n && before.size <= 32768n
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'google_web_readiness_file');
    assertDirectories(directories);
    bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      check(count > 0, 'google_web_readiness_changed');
      offset += count;
    }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0,
      'google_web_readiness_changed');
    check(sameFile(before, fs.fstatSync(fd, { bigint: true }))
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'google_web_readiness_changed');
    assertDirectories(directories);
    return bytes;
  } catch (error) {
    if (/^google_web_readiness_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('google_web_readiness_file');
  } finally {
    let closeFailed = false;
    for (const fd of descriptors.reverse()) {
      try { fs.closeSync(fd); } catch { closeFailed = true; }
    }
    check(!closeFailed, 'google_web_readiness_file');
  }
}
function canonicalEnvelope(evidence) {
  exact(evidence, envelopeKeys, 'google_web_readiness_shape');
  exact(evidence.configuration, configurationKeys, 'google_web_readiness_shape');
  exact(evidence.readiness, readinessKeys, 'google_web_readiness_shape');
  exact(evidence.decision, decisionKeys, 'google_web_readiness_shape');
  return ordered({ ...evidence,
    configuration: ordered(evidence.configuration, configurationKeys),
    readiness: ordered(evidence.readiness, readinessKeys),
    decision: ordered(evidence.decision, decisionKeys),
  }, envelopeKeys);
}

export function bindGoogleWebReadiness(evidence, evidenceDigest,
  { now = new Date(), expectedSource = null } = {}) {
  const canonical = canonicalEnvelope(evidence);
  const canonicalJson = JSON.stringify(canonical);
  check(JSON.stringify(evidence) === canonicalJson, 'google_web_readiness_canonical');
  check(hashPattern.test(evidenceDigest ?? '') && sha256(canonicalJson) === evidenceDigest,
    'google_web_evidence_digest_mismatch');
  check(canonical.schemaVersion === 2
    && canonical.kind === 'sit-google-web-prerequisite-readiness-candidate'
    && canonical.evidenceClass
      === 'verified-prerequisite-journal-and-independent-decision'
    && canonical.syntheticFixture === false
    && canonical.activationDecision === 'approved-independent-review'
    && canonical.activationEligible === true, 'google_web_evidence_class');

  const config = canonical.configuration;
  check(Object.values(config).every((value) => typeof value === 'string')
    && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(config.projectId)
    && /^[0-9]{6,20}$/u.test(config.messagingSenderId)
    && new RegExp(`^1:${config.messagingSenderId}:web:[a-f0-9]{16,64}$`, 'u')
      .test(config.appId)
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(config.apiKey)
    && config.authDomain === `${config.projectId}.firebaseapp.com`
    && config.backendProjectId === config.projectId
    && config.authorizedOrigin === GOOGLE_WEB_TARGET,
  'google_web_config_invalid');
  const configJson = JSON.stringify(config);
  check(hashPattern.test(canonical.configurationSha256)
    && sha256(configJson) === canonical.configurationSha256,
  'google_web_config_digest_mismatch');

  const readiness = canonical.readiness;
  const readinessJson = JSON.stringify(readiness);
  check(hashPattern.test(canonical.readinessSha256)
    && googleWebReadinessDigest(readiness) === canonical.readinessSha256,
  'google_web_readiness_digest_mismatch');
  const collected = Date.parse(iso(readiness.collectedAtUtc, 'google_web_readiness_time'));
  const readinessUntil = Date.parse(iso(readiness.validUntilUtc,
    'google_web_readiness_time'));
  const validated = Date.parse(iso(now, 'google_web_readiness_clock'));
  const digestFields = readinessKeys.filter((key) => key.endsWith('Sha256'));
  check(sourcePattern.test(readiness.sourceCommit)
    && (expectedSource === null || readiness.sourceCommit === expectedSource)
    && readiness.projectId === config.projectId
    && readiness.projectNumber === config.messagingSenderId
    && readiness.backendProjectId === config.backendProjectId
    && readiness.webAppId === config.appId
    && readiness.authorizedDomain === 'staging.shareittoo.com'
    && readiness.firebaseProviderId === 'google.com'
    && readiness.firebaseProviderEnabled === true
    && readiness.firebaseAuthEnabled === true
    && readiness.firebaseEmulatorEnabled === false
    && digestFields.every((key) => hashPattern.test(readiness[key] ?? ''))
    && readinessUntil > collected
    && readinessUntil - collected <= maximumAgeMs
    && validated >= collected && validated < readinessUntil,
  'google_web_readiness_invalid');

  const decision = canonical.decision;
  const decisionJson = JSON.stringify(decision);
  check(hashPattern.test(canonical.decisionSha256)
    && sha256(decisionJson) === canonical.decisionSha256,
  'google_web_decision_digest_mismatch');
  const decided = Date.parse(iso(decision.decidedAtUtc, 'google_web_decision_time'));
  const decisionUntil = Date.parse(iso(decision.validUntilUtc,
    'google_web_decision_time'));
  check(decision.schemaVersion === 1
    && decision.kind === 'sit-google-web-prerequisite-activation-decision'
    && decision.evidenceClass === 'independent-release-review'
    && decision.syntheticFixture === false && decision.decision === 'approved'
    && decision.sourceCommit === readiness.sourceCommit
    && decision.prerequisiteJournalSha256 === readiness.prerequisiteJournalSha256
    && decision.prerequisiteFinalRecordSha256
      === readiness.prerequisiteFinalRecordSha256
    && decision.configurationSha256 === canonical.configurationSha256
    && decision.readinessSha256 === canonical.readinessSha256
    && decision.projectId === readiness.projectId
    && decision.projectNumber === readiness.projectNumber
    && decision.webAppId === readiness.webAppId
    && decision.authorizedDomain === readiness.authorizedDomain
    && decision.firebaseProviderId === readiness.firebaseProviderId
    && decided >= collected && decisionUntil > decided
    && decisionUntil - decided <= maximumAgeMs
    && decisionUntil <= readinessUntil
    && validated >= decided && validated < decisionUntil,
  'google_web_decision_invalid');
  return Object.freeze({
    config: Object.freeze({ ...config }),
    configDigest: canonical.configurationSha256,
    readinessJson,
    readinessDigest: canonical.readinessSha256,
    decisionJson,
    decisionDigest: canonical.decisionSha256,
    evidenceDigest,
    validatedAtUtc: new Date(validated).toISOString(),
  });
}

export function validateGoogleWebBinding(binding,
  { freshAt = null, expectedSource = null } = {}) {
  exact(binding, bindingKeys, 'google_web_binding_shape');
  let readiness;
  let decision;
  try {
    readiness = JSON.parse(binding.readinessJson);
    decision = JSON.parse(binding.decisionJson);
  } catch {
    throw new Error('google_web_readiness_json');
  }
  const evidence = ordered({
    schemaVersion: 2,
    kind: 'sit-google-web-prerequisite-readiness-candidate',
    evidenceClass: 'verified-prerequisite-journal-and-independent-decision',
    syntheticFixture: false,
    activationDecision: 'approved-independent-review',
    activationEligible: true,
    configuration: binding.config,
    configurationSha256: binding.configDigest,
    readiness,
    readinessSha256: binding.readinessDigest,
    decision,
    decisionSha256: binding.decisionDigest,
  }, envelopeKeys);
  const rebound = bindGoogleWebReadiness(evidence, binding.evidenceDigest, {
    now: new Date(binding.validatedAtUtc), expectedSource,
  });
  check(JSON.stringify(rebound) === JSON.stringify(binding), 'google_web_binding_mismatch');
  if (freshAt !== null) bindGoogleWebReadiness(evidence, binding.evidenceDigest,
    { now: freshAt, expectedSource });
  return rebound;
}

export function readGoogleWebReadiness(file, evidenceDigest,
  { now = new Date(), expectedSource = null } = {}) {
  const bytes = readProtected(file);
  try {
    check(hashPattern.test(evidenceDigest ?? '') && sha256(bytes) === evidenceDigest,
      'google_web_evidence_digest_mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const evidence = JSON.parse(text);
    check(JSON.stringify(evidence) === text, 'google_web_readiness_canonical');
    return bindGoogleWebReadiness(evidence, evidenceDigest, { now, expectedSource });
  } catch (error) {
    if (/^google_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('google_web_readiness_json');
  } finally {
    bytes.fill(0);
  }
}
