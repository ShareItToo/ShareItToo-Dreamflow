import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLE_WEB_TARGET, appleWebFields, appleWebReadinessKeys, appleWebBackendKeys,
  appleWebDecisionKeys, bindAppleWebReadiness,
} from '../../tool/staging_apple_web_readiness.mjs';

export const APPLE_WEB_SOURCE_URLS = Object.freeze({
  appleWebConfiguration: 'https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/',
  firebaseAppleWeb: 'https://firebase.google.com/docs/auth/web/apple',
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const APPLE_WEB_SOURCE_CLOSURE = Object.freeze([
  'backend/ops/staging_apple_web_readiness_cli.mjs',
  'backend/ops/staging_apple_web_readiness_producer.mjs',
  'tool/staging_apple_web_readiness.mjs',
]);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
// Public Apple/Firebase configuration fields and sanitized evidence are digested for deterministic integrity binding; this is not a password or authentication-secret store.
// codeql[js/insufficient-password-hash]
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Apple Services IDs and Firebase OAuth client IDs are public, non-authenticating identifiers required by the source-bound evidence schema.
// codeql[js/insufficient-password-hash]
const publicServiceIdSha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, code = 'apple_web_producer_denied') => { if (!condition) throw new Error(code); };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, code = 'apple_web_producer_shape') => check(plain(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)), code);
const iso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
  && new Date(value).toISOString().replace('.000Z', 'Z') === value;
const sourcePattern = /^[a-f0-9]{40}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const MAX_AGE_MS = 60 * 60 * 1000;
const inputKeys = ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'sourceCommit',
  'collectorIdentitySha256', 'observedAtUtc', 'validUntilUtc', 'configuration',
  'appleConsoleReadback', 'firebaseReadback', 'backendReadback', 'secretMetadataReadback', 'sourceRegister'];
const appleKeys = ['servicesId', 'teamIdSha256', 'keyIdSha256', 'primaryAppSignInEnabled',
  'servicesIdBoundToPrimaryApp', 'signingKeyEnabled', 'domain', 'returnUrl',
  'domainVerified', 'returnUrlVerified', 'evidenceSha256'];
const firebaseKeys = ['projectId', 'projectNumber', 'webAppId', 'apiKey', 'authDomain',
  'webAppEvidenceSha256', 'providerEnabled', 'oauthClientId', 'teamIdSha256', 'keyIdSha256',
  'secretConfigured', 'providerEvidenceSha256'];
const secretMetadataKeys = ['signingKeySource', 'signingKeyMetadataSha256', 'encryptionKeySource',
  'encryptionKeyMetadataSha256', 'protectedSecretFilesVerified', 'evidenceSha256'];
const registerIds = ['apple-console', 'firebase-web-doc', 'firebase-web-app', 'firebase-apple-provider',
  'backend-runtime', 'protected-secret-metadata'];
const registerKeys = ['id', 'sourceUrl', 'method', 'status', 'evidenceSha256', 'observedAtUtc'];
const decisionInputKeys = ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'decision',
  'candidateSha256', 'configurationSha256', 'readinessSha256', 'backendSha256',
  'collectorIdentitySha256', 'reviewerIdentitySha256', 'reviewEvidenceSha256',
  'decidedAtUtc', 'validUntilUtc'];
const shaFields = ['appleServicesIdSha256', 'firebaseAppleServicesIdSha256',
  'backendAppleServicesIdSha256', 'appleTeamIdSha256', 'firebaseAppleTeamIdSha256',
  'appleKeyIdSha256', 'firebaseAppleKeyIdSha256', 'appleRedirectDomainSha256',
  'backendAppleRedirectUriSha256', 'providerReadbackSha256'];

function git(rootDir, args, input) {
  try { return execFileSync('git', args, { cwd: rootDir, input,
    encoding: input ? undefined : 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(); }
  catch { throw new Error('apple_web_source_drift'); }
}

export function currentAppleWebSourceSnapshot(rootDir = root, { afterSourceOpen = () => {} } = {}) {
  const repo = fs.realpathSync(rootDir);
  check(git(repo, ['rev-parse', '--show-toplevel']) === repo, 'apple_web_source_root');
  const sourceCommit = git(repo, ['rev-parse', 'HEAD']);
  check(sourcePattern.test(sourceCommit));
  const statusArgs = ['status', '--porcelain=v1', '--untracked-files=all', '--', ...APPLE_WEB_SOURCE_CLOSURE];
  check(git(repo, statusArgs) === '', 'apple_web_source_drift');
  const files = APPLE_WEB_SOURCE_CLOSURE.map((relativePath) => {
    const file = path.join(repo, relativePath); const parents = openStableSourceParents(file); let fd; let bytes;
    try {
      assertSourceParentsStable(parents);
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
        | fs.constants.O_CLOEXEC | fs.constants.O_NONBLOCK);
      afterSourceOpen(relativePath, fd, parents);
      const before = fs.fstatSync(fd, { bigint: true });
      check(before.isFile() && before.nlink === 1n && (before.mode & 0o022n) === 0n
        && (before.uid === BigInt(process.getuid()) || before.uid === 0n)
        && before.size > 0n && before.size <= 1024n * 1024n, 'apple_web_source_drift');
      assertSourcePathMatches(file, before); assertSourceParentsStable(parents);
      bytes = Buffer.alloc(Number(before.size)); let offset = 0;
      while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0, 'apple_web_source_drift'); offset += count; }
      check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0, 'apple_web_source_drift');
      const current = fs.fstatSync(fd, { bigint: true });
      check(['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every((key) => current[key] === before[key]), 'apple_web_source_drift');
      assertSourcePathMatches(file, current); assertSourceParentsStable(parents);
      const gitBlob = git(repo, ['hash-object', '--stdin'], bytes);
      check(/^[a-f0-9]{40}$/u.test(gitBlob)
        && gitBlob === git(repo, ['rev-parse', `HEAD:${relativePath}`]), 'apple_web_source_drift');
      return { relativePath, gitBlob, currentByteSha256: hash(bytes) };
    } catch (error) {
      if (/^apple_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
      throw new Error('apple_web_source_drift');
    } finally {
      bytes?.fill(0);
      if (fd !== undefined) fs.closeSync(fd);
      closeSourceParents(parents);
    }
  });
  check(git(repo, ['rev-parse', 'HEAD']) === sourceCommit && git(repo, statusArgs) === '', 'apple_web_source_drift');
  return { sourceCommit, files, inventorySha256: digest(files) };
}

function openStableSourceParents(file) {
  const entries = []; let current = '/';
  try {
    const parts = path.dirname(file).split('/').filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index]);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
        | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd, { bigint: true });
      check(stat.isDirectory() && sameSourceDirectory(stat, fs.lstatSync(current, { bigint: true })), 'apple_web_source_drift');
      entries.push({ path: current, fd, stat });
    }
    return entries;
  } catch {
    closeSourceParents(entries);
    throw new Error('apple_web_source_drift');
  }
}
function sameSourceDirectory(left, right) {
  return left.isDirectory() && right.isDirectory()
    && ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);
}
function assertSourceParentsStable(entries) {
  for (const item of entries) check(sameSourceDirectory(fs.fstatSync(item.fd, { bigint: true }),
    fs.lstatSync(item.path, { bigint: true })), 'apple_web_source_drift');
}
function assertSourcePathMatches(file, opened) {
  const named = fs.lstatSync(file, { bigint: true });
  check(named.isFile() && ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => named[key] === opened[key]), 'apple_web_source_drift');
}
function closeSourceParents(entries) {
  for (const item of [...entries].reverse()) try { fs.closeSync(item.fd); } catch { throw new Error('apple_web_source_drift'); }
}

function readProtected(file, repositoryRoot = root) {
  const fds = []; let bytes;
  try {
    check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
      && file !== repositoryRoot && !file.startsWith(`${repositoryRoot}/`));
    const parts = file.split('/').filter(Boolean); let current = '/';
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      fds.push({ fd, path: current, stat: fs.fstatSync(fd, { bigint: true }), directory: true });
    }
    const parent = fds.at(-1); check(parent?.stat.uid === BigInt(process.getuid())
      && (parent.stat.mode & 0o7777n) === 0o700n, 'apple_web_input_parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    fds.push({ fd, path: file, stat: fs.fstatSync(fd, { bigint: true }), directory: false });
    const entry = fds.at(-1); check(entry.stat.isFile() && entry.stat.nlink === 1n
      && entry.stat.uid === BigInt(process.getuid()) && (entry.stat.mode & 0o7777n) === 0o600n
      && entry.stat.size >= 2n && entry.stat.size <= 256n * 1024n, 'apple_web_input_file');
    const stable = (item) => {
      const now = fs.fstatSync(item.fd, { bigint: true }); const named = fs.lstatSync(item.path, { bigint: true });
      const fields = item.directory ? ['dev', 'ino', 'mode', 'uid', 'gid']
        : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
      return fields.every((key) => now[key] === item.stat[key] && named[key] === item.stat[key]);
    };
    check(fds.every(stable), 'apple_web_input_race');
    bytes = Buffer.alloc(Number(entry.stat.size)); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0 && fds.every(stable), 'apple_web_input_race');
    return bytes;
  } catch (error) { bytes?.fill(0); if (/^apple_web_[a-z_]+$/u.test(error?.message ?? '')) throw error; throw new Error(`apple_web_input_denied:${error?.code ?? error?.message ?? 'unknown'}`); }
  finally { for (const item of fds.reverse()) fs.closeSync(item.fd); }
}

function verifyReadback(input, { now, expectedSource, allowSynthetic = false }) {
  exact(input, inputKeys);
  check(input.schemaVersion === 1 && input.kind === 'sit-apple-web-protected-readbacks'
    && input.evidenceClass === 'sanitized-provider-and-runtime-readbacks'
    && (input.syntheticFixture === false || (allowSynthetic && input.syntheticFixture === true))
    && input.sourceCommit === expectedSource && sourcePattern.test(input.sourceCommit)
    && hashPattern.test(input.collectorIdentitySha256 ?? '') && iso(input.observedAtUtc) && iso(input.validUntilUtc), 'apple_web_readback_invalid');
  const start = Date.parse(input.observedAtUtc); const end = Date.parse(input.validUntilUtc);
  check(end > start && end - start <= MAX_AGE_MS && now >= start && now < end, 'apple_web_readback_stale');
  exact(input.configuration, Object.keys(appleWebFields));
  exact(input.appleConsoleReadback, appleKeys); exact(input.firebaseReadback, firebaseKeys);
  exact(input.backendReadback, appleWebBackendKeys);
  check(Array.isArray(input.sourceRegister) && input.sourceRegister.length === registerIds.length
    && JSON.stringify(input.sourceRegister.map((entry) => entry.id)) === JSON.stringify(registerIds), 'apple_web_register_incomplete');
  const expectedUrls = {
    'apple-console': APPLE_WEB_SOURCE_URLS.appleWebConfiguration,
    'firebase-web-doc': APPLE_WEB_SOURCE_URLS.firebaseAppleWeb,
    'firebase-web-app': `https://firebase.googleapis.com/v1beta1/projects/${input.firebaseReadback.projectNumber}/webApps/${input.firebaseReadback.webAppId}/config`,
    'firebase-apple-provider': `https://identitytoolkit.googleapis.com/admin/v2/projects/${input.firebaseReadback.projectId}/defaultSupportedIdpConfigs/apple.com`,
    'backend-runtime': 'https://staging.shareittoo.com/api/v1/version',
    'protected-secret-metadata': null,
  };
  for (const entry of input.sourceRegister) {
    exact(entry, registerKeys); const manual = entry.id === 'apple-console';
    const local = entry.id === 'protected-secret-metadata';
    check(entry.sourceUrl === expectedUrls[entry.id]
      && entry.method === (manual ? 'sanitized-console-readback' : local ? 'protected-mount-metadata' : 'GET')
      && entry.status === (manual || local ? 'read-only-confirmed' : 200)
      && hashPattern.test(entry.evidenceSha256 ?? '') && iso(entry.observedAtUtc)
      && Date.parse(entry.observedAtUtc) >= start && Date.parse(entry.observedAtUtc) <= end,
    `apple_web_source_register_invalid_${entry.id}`);
  }
  const c = input.configuration; const a = input.appleConsoleReadback; const f = input.firebaseReadback; const b = input.backendReadback;
  exact(input.secretMetadataReadback, secretMetadataKeys);
  const sourceById = Object.fromEntries(input.sourceRegister.map((entry) => [entry.id, entry]));
  check(sourceById['apple-console'].evidenceSha256 === a.evidenceSha256
    && sourceById['firebase-web-app'].evidenceSha256 === f.webAppEvidenceSha256
    && sourceById['firebase-apple-provider'].evidenceSha256 === f.providerEvidenceSha256
    && sourceById['backend-runtime'].evidenceSha256 === b.runtimeReadbackSha256
    && sourceById['protected-secret-metadata'].evidenceSha256 === input.secretMetadataReadback.evidenceSha256
    && input.secretMetadataReadback.signingKeySource === 'file'
    && input.secretMetadataReadback.encryptionKeySource === 'file'
    && input.secretMetadataReadback.protectedSecretFilesVerified === true
    && hashPattern.test(input.secretMetadataReadback.signingKeyMetadataSha256 ?? '')
    && hashPattern.test(input.secretMetadataReadback.encryptionKeyMetadataSha256 ?? ''), 'apple_web_source_register_binding');
  check(c.projectId === f.projectId && c.messagingSenderId === String(f.projectNumber)
    && c.appId === f.webAppId && c.apiKey === f.apiKey && c.authDomain === f.authDomain
    && c.backendProjectId === f.projectId && c.authorizedOrigin === APPLE_WEB_TARGET
    && c.clientId === a.servicesId && c.clientId === f.oauthClientId
    && c.redirectUri === a.returnUrl && a.domain === new URL(APPLE_WEB_TARGET).hostname
    && a.domainVerified === true && a.returnUrlVerified === true
    && a.primaryAppSignInEnabled === true && a.servicesIdBoundToPrimaryApp === true && a.signingKeyEnabled === true
    && f.providerEnabled === true && f.secretConfigured === true
    && hashPattern.test(a.teamIdSha256) && hashPattern.test(a.keyIdSha256)
    && a.teamIdSha256 === f.teamIdSha256 && a.keyIdSha256 === f.keyIdSha256
    && b.sourceCommit === expectedSource && b.firebaseProjectId === f.projectId && b.webAppId === f.webAppId
    && b.appleServicesIdSha256 === publicServiceIdSha256(c.clientId) && b.appleTeamIdSha256 === a.teamIdSha256
    && b.appleKeyIdSha256 === a.keyIdSha256 && b.appleRedirectUriSha256 === hash(c.redirectUri)
    && b.observedAtUtc === input.observedAtUtc && b.validUntilUtc === input.validUntilUtc,
  'apple_web_readback_binding');
  return input;
}

export function composeAppleWebCandidate(input, { now = Date.now(), expectedSource, allowSyntheticFixture = false,
  sourceInventory = [], sourceInventorySha256 = '' } = {}) {
  verifyReadback(input, { now, expectedSource, allowSynthetic: allowSyntheticFixture });
  check(Array.isArray(sourceInventory) && digest(sourceInventory) === sourceInventorySha256
    && JSON.stringify(sourceInventory.map((entry) => entry.relativePath)) === JSON.stringify(APPLE_WEB_SOURCE_CLOSURE), 'apple_web_source_inventory');
  const c = input.configuration; const a = input.appleConsoleReadback; const f = input.firebaseReadback; const b = input.backendReadback;
  const configurationSha256 = digest(c);
  const sourceRegisterSha256 = digest(input.sourceRegister);
  const r = Object.fromEntries(appleWebReadinessKeys.map((key) => [key, null]));
  Object.assign(r, { schemaVersion: 2, provider: 'apple', platform: 'web_direct', origin: APPLE_WEB_TARGET,
    apiBaseUrl: `${APPLE_WEB_TARGET}/api/v1`, backendFirebaseProjectId: c.backendProjectId,
    webAppConfigSha256: configurationSha256, callbackUrl: c.redirectUri,
    firebaseProviderEnabled: f.providerEnabled, firebaseAppleOAuthConfigured: f.secretConfigured,
    appleServicesIdSha256: publicServiceIdSha256(c.clientId), firebaseAppleServicesIdSha256: publicServiceIdSha256(f.oauthClientId),
    backendAppleServicesIdSha256: b.appleServicesIdSha256,
    backendAppleOwnershipConfigured: b.ownershipConfigured, backendAppleAcquisitionEnabled: b.acquisitionEnabled,
    appleTeamIdSha256: a.teamIdSha256, firebaseAppleTeamIdSha256: f.teamIdSha256,
    appleKeyIdSha256: a.keyIdSha256, firebaseAppleKeyIdSha256: f.keyIdSha256,
    applePrimaryAppSignInEnabled: a.primaryAppSignInEnabled,
    appleServicesIdBoundToPrimaryApp: a.servicesIdBoundToPrimaryApp,
    appleSigningKeyEnabled: a.signingKeyEnabled,
    appleRedirectDomainSha256: hash(a.domain), backendAppleRedirectUriSha256: hash(c.redirectUri),
    appleRedirectDomainVerified: a.domainVerified, appleReturnUrlVerified: a.returnUrlVerified,
    scope: 'private_pilot', audience: 'existing_allowlisted_accounts_only', audienceVerified: true,
    providerReadbackSha256: digest({ appleConsoleReadback: a, firebaseReadback: f, sourceRegisterSha256 }),
    observedAtUtc: input.observedAtUtc, validUntilUtc: input.validUntilUtc });
  const candidate = { schemaVersion: 1, kind: 'sit-apple-web-readiness-candidate',
    evidenceClass: input.syntheticFixture ? 'synthetic-test-readbacks' : 'sanitized-provider-and-runtime-readbacks',
    syntheticFixture: input.syntheticFixture, activationEligible: false,
    sourceCommit: input.sourceCommit, sourceInventory,
    sourceInventorySha256, collectorIdentitySha256: input.collectorIdentitySha256,
    configuration: c, configurationSha256, readiness: r, readinessSha256: digest(r),
    backend: b, backendSha256: digest(b), sourceRegister: input.sourceRegister,
    sourceRegisterSha256, observedAtUtc: input.observedAtUtc, validUntilUtc: input.validUntilUtc };
  candidate.candidateSha256 = digest(candidate);
  return candidate;
}

export function composeAppleWebDecision(candidate, decision, { now = Date.now(), expectedSource, syntheticTestOnly = false } = {}) {
  check(plain(candidate) && candidate.kind === 'sit-apple-web-readiness-candidate'
    && candidate.sourceCommit === expectedSource && sourcePattern.test(expectedSource ?? '')
    && candidate.candidateSha256 === digest(Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'candidateSha256')))
    && Array.isArray(candidate.sourceInventory) && digest(candidate.sourceInventory) === candidate.sourceInventorySha256,
  'apple_web_candidate_invalid');
  exact(decision, decisionInputKeys);
  const synthetic = candidate.syntheticFixture === true || decision.syntheticFixture === true;
  check((!synthetic && candidate.syntheticFixture === false && decision.syntheticFixture === false)
    || (syntheticTestOnly && candidate.syntheticFixture === true && decision.syntheticFixture === true), 'apple_web_synthetic_denied');
  check(decision.schemaVersion === 1 && decision.kind === 'sit-apple-web-independent-decision'
    && decision.evidenceClass === 'independent-release-review'
    && decision.decision === 'approved' && decision.candidateSha256 === candidate.candidateSha256
    && decision.configurationSha256 === candidate.configurationSha256
    && decision.readinessSha256 === candidate.readinessSha256 && decision.backendSha256 === candidate.backendSha256
    && decision.collectorIdentitySha256 === candidate.collectorIdentitySha256
    && hashPattern.test(decision.reviewerIdentitySha256 ?? '')
    && decision.reviewerIdentitySha256 !== candidate.collectorIdentitySha256
    && hashPattern.test(decision.reviewEvidenceSha256 ?? '')
    && iso(decision.decidedAtUtc) && iso(decision.validUntilUtc)
    && Date.parse(candidate.observedAtUtc) <= Date.parse(decision.decidedAtUtc)
    && Date.parse(decision.decidedAtUtc) <= now && now < Date.parse(decision.validUntilUtc)
    && Date.parse(decision.validUntilUtc) <= Math.min(Date.parse(candidate.validUntilUtc), Date.parse(decision.decidedAtUtc) + MAX_AGE_MS),
  'apple_web_decision_invalid');
  const d = { schemaVersion: 1, kind: 'sit-apple-web-activation-decision',
    evidenceClass: 'independent-release-review', syntheticFixture: synthetic,
    decision: 'approved', sourceCommit: candidate.sourceCommit,
    configurationSha256: candidate.configurationSha256, readinessSha256: candidate.readinessSha256,
    backendSha256: candidate.backendSha256, collectorIdentitySha256: candidate.collectorIdentitySha256,
    reviewerIdentitySha256: decision.reviewerIdentitySha256, reviewEvidenceSha256: decision.reviewEvidenceSha256,
    decidedAtUtc: decision.decidedAtUtc, validUntilUtc: decision.validUntilUtc };
  const envelope = { schemaVersion: 1, kind: synthetic ? 'sit-apple-web-synthetic-compose-test' : 'sit-apple-web-release-readiness',
    evidenceClass: synthetic ? 'synthetic-test-only' : 'provider-runtime-readback-and-independent-decision',
    syntheticFixture: synthetic, activationEligible: !synthetic,
    configuration: candidate.configuration, configurationSha256: candidate.configurationSha256,
    readiness: candidate.readiness, readinessSha256: candidate.readinessSha256,
    backend: candidate.backend, backendSha256: candidate.backendSha256,
    decision: d, decisionSha256: digest(d) };
  const evidenceSha256 = digest(envelope);
  if (!synthetic) bindAppleWebReadiness(envelope, evidenceSha256, { now: new Date(now), expectedSource });
  return { envelope, evidenceSha256 };
}

export function writeAppleWebOutput({ directory, runId, kind, bytes, repositoryRoot = root,
  afterTempOpen = () => {}, afterTempWrite = () => {}, beforePublish = () => {} }) {
  check(['candidate', 'readiness'].includes(kind) && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(runId)
    && path.isAbsolute(directory) && path.normalize(directory) === directory
    && directory !== repositoryRoot && !directory.startsWith(`${repositoryRoot}/`)
    && typeof bytes === 'string' && bytes.length >= 2 && bytes.length <= 256 * 1024
    && JSON.stringify(JSON.parse(bytes)) === bytes, 'apple_web_output_denied');
  const dirs = []; const temps = []; const published = []; let buffer; let readback;
  try {
    let name = '/';
    for (const part of directory.split('/').filter(Boolean)) {
      name = path.join(name, part);
      const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      dirs.push({ path: name, fd, stat: fs.fstatSync(fd, { bigint: true }) });
    }
    check(dirs.at(-1).stat.uid === BigInt(process.getuid()) && (dirs.at(-1).stat.mode & 0o7777n) === 0o700n, 'apple_web_output_parent');
    const finalPath = path.join(directory, `${runId}.${kind}.json`);
    try { fs.lstatSync(finalPath); check(false); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const tempPath = path.join(directory, `.${runId}.${kind}.${crypto.randomBytes(12).toString('hex')}.tmp`);
    const fd = fs.openSync(tempPath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const stat = fs.fstatSync(fd, { bigint: true }); temps.push({ path: tempPath, finalPath, fd, stat });
    check(stat.isFile() && stat.nlink === 1n && stat.uid === BigInt(process.getuid())
      && (stat.mode & 0o7777n) === 0o600n && stat.size === 0n, 'apple_web_output_temp');
    afterTempOpen(fd, tempPath);
    const openedTemp = fs.fstatSync(fd, { bigint: true }); const linkedTemp = fs.lstatSync(tempPath, { bigint: true });
    check(openedTemp.isFile() && openedTemp.dev === stat.dev && openedTemp.ino === stat.ino
      && openedTemp.nlink === 1n && openedTemp.uid === BigInt(process.getuid())
      && (openedTemp.mode & 0o7777n) === 0o600n && openedTemp.size === 0n
      && linkedTemp.dev === stat.dev && linkedTemp.ino === stat.ino && linkedTemp.nlink === 1n,
    'apple_web_output_temp_race');
    const bufferLocal = Buffer.from(bytes); buffer = bufferLocal; let offset = 0;
    while (offset < buffer.length) { const n = fs.writeSync(fd, buffer, offset, buffer.length - offset, offset); check(n > 0); offset += n; }
    fs.fsyncSync(fd);
    const beforeRead = fs.fstatSync(fd, { bigint: true });
    check(beforeRead.isFile() && beforeRead.dev === stat.dev && beforeRead.ino === stat.ino
      && beforeRead.nlink === 1n && beforeRead.uid === stat.uid && beforeRead.mode === stat.mode
      && beforeRead.size === BigInt(buffer.length), 'apple_web_output_temp_race');
    readback = Buffer.alloc(buffer.length); offset = 0;
    while (offset < readback.length) { const n = fs.readSync(fd, readback, offset, readback.length - offset, offset); check(n > 0); offset += n; }
    const afterRead = fs.fstatSync(fd, { bigint: true }); const namedAfterRead = fs.lstatSync(tempPath, { bigint: true });
    check(afterRead.isFile() && afterRead.dev === stat.dev && afterRead.ino === stat.ino
      && afterRead.nlink === 1n && afterRead.uid === stat.uid && afterRead.mode === stat.mode
      && afterRead.size === BigInt(buffer.length) && namedAfterRead.dev === afterRead.dev
      && namedAfterRead.ino === afterRead.ino && namedAfterRead.nlink === 1n
      && namedAfterRead.size === afterRead.size && afterRead.mtimeNs === beforeRead.mtimeNs
      && afterRead.ctimeNs === beforeRead.ctimeNs, 'apple_web_output_temp_race');
    check(readback.equals(buffer) && hash(readback) === hash(buffer)); const outputSha256 = hash(readback);
    afterTempWrite({ fd, tempPath, buffer, readback });
    beforePublish();
    check(fs.fstatSync(fd, { bigint: true }).ino === stat.ino
      && fs.lstatSync(tempPath, { bigint: true }).ino === stat.ino, 'apple_web_output_temp_race');
    fs.linkSync(tempPath, finalPath); const linked = fs.lstatSync(finalPath, { bigint: true });
    check(linked.dev === stat.dev && linked.ino === stat.ino && linked.nlink === 2n);
    published.push({ path: finalPath, dev: linked.dev, ino: linked.ino });
    fs.unlinkSync(tempPath); fs.fsyncSync(dirs.at(-1).fd);
    check(fs.fstatSync(fd, { bigint: true }).ino === stat.ino
      && fs.lstatSync(finalPath, { bigint: true }).ino === stat.ino
      && fs.lstatSync(finalPath, { bigint: true }).nlink === 1n);
    for (const entry of dirs) check(entry.stat.ino === fs.fstatSync(entry.fd, { bigint: true }).ino
      && entry.stat.ino === fs.lstatSync(entry.path, { bigint: true }).ino);
    return { path: finalPath, sha256: outputSha256 };
  } catch (error) {
    for (const entry of published) { try { const st = fs.lstatSync(entry.path, { bigint: true }); if (st.dev === entry.dev && st.ino === entry.ino) fs.unlinkSync(entry.path); } catch {} }
    for (const entry of temps) { try { const st = fs.lstatSync(entry.path, { bigint: true }); if (st.dev === entry.stat.dev && st.ino === entry.stat.ino) fs.unlinkSync(entry.path); } catch {} }
    throw new Error(`apple_web_output_denied:${error?.code ?? error?.message ?? 'unknown'}`);
  } finally {
    buffer?.fill(0); readback?.fill(0);
    for (const entry of temps.reverse()) fs.closeSync(entry.fd);
    for (const entry of dirs.reverse()) fs.closeSync(entry.fd);
  }
}

export { readProtected as readProtectedAppleWebInput, hash as appleWebSha256, digest as appleWebDigest, root as APPLE_WEB_REPOSITORY_ROOT };
