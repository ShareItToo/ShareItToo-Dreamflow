// Read-only successor. This module has no network client, CLI, credential
// reader, filesystem writer or provider mutation capability. The caller owns
// authenticated, bounded readers; injected observations are not live proof.
// OPERATIONAL HOLD: no executable command is supplied. A separately reviewed
// adapter must wrap the existing live adapter's three read methods with genuine
// timestamp/source receipts and supply a fresh authenticated operator/project
// reader. Service-account possession alone cannot supply that operator proof.
// A separate protected writer must persist JSON.stringify(candidate) and the
// unchanged journalBytes outside Git, then independently record both byte hashes.
// After review (including a process restart), loadGoogleWebReattestation accepts
// those protected files/hashes; bindGoogleWebReattestationDecision then checks
// the separately returned canonical decision bytes and their independent hash.
// Neither stage enables a flag, deploys a build or proves successful login.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bindGoogleWebReadiness, googleWebReadinessDigest } from '../../tool/staging_google_web_readiness.mjs';

const ownPath = 'backend/ops/staging_google_web_reattestation.mjs';
const ownFile = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(ownFile), '../..');
const sourcePaths = [ownPath, 'tool/staging_google_web_readiness.mjs'];
const loadedSourceBytes = new Map(sourcePaths.map((locator) => [locator, fs.readFileSync(path.resolve(defaultRoot, locator))]));
const digestPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const host = 'staging.shareittoo.com';
const origin = `https://${host}`;
const maximumCollectionMs = 60_000;
const maximumAgeMs = 2 * 60 * 60_000;
const candidates = new WeakMap();
// Exhaustive sources of the existing complete-snapshot contract. A snapshot
// reader must attest each independently read surface, including pagination.
export function googleWebReattestationReadSources(method, binding) {
  const project = binding.projectId; const number = binding.projectNumber;
  const app = `https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${binding.webAppId}`;
  if (method === 'readAccountIdentity') return [`authenticated-session:sha256:${binding.firebaseAccountEmailSha256}`];
  if (method === 'readWebApp') return [app];
  if (method === 'readSdkConfig') return [app, `${app}/config`];
  check(method === 'readSnapshot');
  return [
    `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`,
    ...['webApps', 'androidApps', 'iosApps'].map((kind) => `https://firebase.googleapis.com/v1beta1/projects/${number}/${kind}?showDeleted=true`),
    ...['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].map((service) => `https://serviceusage.googleapis.com/v1/projects/${number}/services/${service}`),
    `https://apikeys.googleapis.com/v2/projects/${number}/locations/global/keys?showDeleted=true`,
    `https://apikeys.googleapis.com/v2/${binding.apiKeyResourceName}`,
    `https://apikeys.googleapis.com/v2/${binding.apiKeyResourceName}/keyString`,
    `docker://${binding.runtimeContainerId}/firebase-runtime?source=${binding.runtimeCommit}`,
  ];
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const check = (value) => { if (!value) throw new Error('google_web_reattestation_denied'); };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export const googleWebReattestationDigest = (value) => hash(JSON.stringify(canonical(value)));
const same = (left, right) => googleWebReattestationDigest(left) === googleWebReattestationDigest(right);
function instant(value) {
  check(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return Date.parse(value);
}
function sourceRegister(root, expectedSource) {
  check(sourcePattern.test(expectedSource) && path.isAbsolute(root) && fs.realpathSync(root) === root);
  const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
  check(git(['rev-parse', '--show-toplevel']).toString().trim() === root
    && git(['rev-parse', 'HEAD']).toString().trim() === expectedSource);
  return sourcePaths.map((locator) => {
    const committed = git(['show', `${expectedSource}:${locator}`]);
    const current = fs.readFileSync(path.join(root, locator));
    check(current.equals(committed));
    // A different checkout cannot substitute a different collector/validator.
    const executing = loadedSourceBytes.get(locator);
    check(executing.equals(current));
    return { locator, version: expectedSource, sha256: hash(current) };
  });
}
function snapshot(value, binding) {
  check(exact(value, ['complete', 'projectId', 'projectNumber', 'backendProjectId', 'authEnabled',
    'emulatorEnabled', 'googleEnabled', 'webApps', 'webAppsInventory', 'apiKey', 'keyInventoryDigest',
    'authorizedDomains', 'authConfigDigest', 'providerConfigDigest', 'otherAppsDigest', 'runtimeDigest', 'revision']));
  check(value.complete === true && value.projectId === binding.projectId && value.projectNumber === binding.projectNumber
    && value.backendProjectId === binding.projectId && value.authEnabled === true
    && value.emulatorEnabled === false && value.googleEnabled === true);
  for (const key of ['keyInventoryDigest', 'authConfigDigest', 'providerConfigDigest', 'otherAppsDigest', 'runtimeDigest', 'revision']) {
    check(digestPattern.test(value[key] ?? ''));
  }
  check(exact(value.webAppsInventory, ['showDeleted', 'exhausted', 'nextPageToken'])
    && value.webAppsInventory.showDeleted === true && value.webAppsInventory.exhausted === true
    && value.webAppsInventory.nextPageToken === '');
  check(same(value.apiKey, { ...binding.apiKey, exists: true, webCompatible: true }));
  check(Array.isArray(value.authorizedDomains) && value.authorizedDomains.length > 0
    && value.authorizedDomains.length < 1000 && value.authorizedDomains.includes(host)
    && value.authorizedDomains.every((item) => typeof item === 'string' && /^[a-z0-9.-]+$/u.test(item))
    && new Set(value.authorizedDomains).size === value.authorizedDomains.length);
  check(Array.isArray(value.webApps) && value.webApps.length > 0 && value.webApps.length < 1000);
  for (const app of value.webApps) check(exact(app, ['appId', 'projectId', 'state', 'apiKeyId', 'displayName'])
    && app.projectId === binding.projectId && typeof app.displayName === 'string'
    && new RegExp(`^1:${binding.projectNumber}:web:[a-f0-9]{16,64}$`, 'u').test(app.appId)
    && typeof app.apiKeyId === 'string' && ['ACTIVE', 'DELETED'].includes(app.state));
  check(new Set(value.webApps.map((app) => app.appId)).size === value.webApps.length);
  const app = value.webApps.find((entry) => entry.appId === binding.webAppId);
  check(app?.state === 'ACTIVE' && app.apiKeyId === binding.apiKey.apiKeyId);
  return structuredClone(value);
}

function pendingCandidate(record, journalBytes, configuration) {
  const binding = record.binding; const final = record.finalSnapshot; const app = record.finalWebApp;
  const readiness = {
    sourceCommit: binding.sourceCommit, prerequisiteRunnerSha256: record.sourceRegister[0].sha256,
    firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256, gateEvidenceSha256: binding.reviewEvidenceSha256,
    baselineSha256: binding.expectedSnapshotSha256, projectId: binding.projectId, projectNumber: binding.projectNumber,
    backendProjectId: binding.projectId, webAppId: binding.webAppId, authorizedDomain: host, firebaseProviderId: 'google.com',
    firebaseProviderEnabled: true, firebaseAuthEnabled: true, firebaseEmulatorEnabled: false,
    finalSnapshotSha256: googleWebReattestationDigest(final), finalRevisionSha256: hash(final.revision),
    authConfigReadbackSha256: final.authConfigDigest, providerConfigReadbackSha256: final.providerConfigDigest,
    webAppReadbackSha256: googleWebReattestationDigest(app),
    authorizedDomainsReadbackSha256: googleWebReattestationDigest([...final.authorizedDomains].sort()),
    keyInventoryReadbackSha256: final.keyInventoryDigest, otherAppsReadbackSha256: final.otherAppsDigest,
    runtimeReadbackSha256: final.runtimeDigest, prerequisiteJournalSha256: hash(journalBytes),
    prerequisiteFinalRecordSha256: googleWebReattestationDigest(record), collectedAtUtc: record.collectedAtUtc,
    validUntilUtc: new Date(instant(record.startedAtUtc) + maximumAgeMs).toISOString(),
  };
  return { schemaVersion: 2, kind: 'sit-google-web-prerequisite-readiness-candidate',
    evidenceClass: 'verified-read-only-reattestation-awaiting-independent-decision', syntheticFixture: false,
    activationDecision: 'pending-independent-review', activationEligible: false,
    configuration, configurationSha256: binding.configurationSha256,
    readiness, readinessSha256: googleWebReadinessDigest(readiness) };
}

/** All four readers must perform fresh authenticated reads, not cached claims.
 * Each returns { value, observedAtUtc, sources }, where sources contains the
 * exact complete locator set from googleWebReattestationReadSources. Freshness
 * is provided by the authoritative reader, never inferred from invocation time.
 * readSnapshot uses the complete existing live-adapter contract (including
 * enabled auth services and exhaustive key/native-app inventories).
 * readAccountIdentity independently binds the current authenticated operator
 * and project and returns its observation time and sanitized proof digest.
 * This explicit caller boundary is intentionally not a service-account-to-owner
 * inference. No operational adapter for that account reader is supplied here.
 */
function validateBinding(binding) {
    check(exact(binding, ['schemaVersion', 'sourceCommit', 'projectId', 'projectNumber', 'webAppId',
      'firebaseAccountEmailSha256', 'apiKey', 'apiKeyResourceName', 'runtimeContainerId', 'runtimeCommit',
      'expectedSnapshotSha256', 'configurationSha256', 'reviewEvidenceSha256'])
      && binding.schemaVersion === 1 && sourcePattern.test(binding.sourceCommit)
      && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(binding.projectId)
      && /^[0-9]{6,20}$/u.test(binding.projectNumber)
      && new RegExp(`^1:${binding.projectNumber}:web:[a-f0-9]{16,64}$`, 'u').test(binding.webAppId));
    for (const key of ['firebaseAccountEmailSha256', 'expectedSnapshotSha256', 'configurationSha256', 'reviewEvidenceSha256']) {
      check(digestPattern.test(binding[key] ?? ''));
    }
    check(exact(binding.apiKey, ['apiKeyId', 'projectId', 'keyFingerprint', 'restrictionsDigest'])
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(binding.apiKey.apiKeyId)
      && binding.apiKey.projectId === binding.projectId
      && digestPattern.test(binding.apiKey.keyFingerprint) && digestPattern.test(binding.apiKey.restrictionsDigest));
    check(new RegExp(`^projects/${binding.projectNumber}/locations/global/keys/[A-Za-z0-9_-]{1,200}$`, 'u').test(binding.apiKeyResourceName)
      && digestPattern.test(binding.runtimeContainerId) && sourcePattern.test(binding.runtimeCommit));
}

export async function collectGoogleWebReattestation({ binding, readers, repositoryRoot = defaultRoot, now = Date.now } = {}) {
  try {
    validateBinding(binding);
    const methods = ['readSnapshot', 'readWebApp', 'readSdkConfig', 'readAccountIdentity'];
    check(exact(readers, methods) && methods.every((method) => typeof readers[method] === 'function') && typeof now === 'function');
    binding = structuredClone(binding);
    const started = now(); check(Number.isFinite(started));
    const sources = sourceRegister(repositoryRoot, binding.sourceCommit);
    const register = [];
    async function read(method, locator, request) {
      const began = now(); check(began >= started && began - started <= maximumCollectionMs);
      // A hung reader must not stall collection or yield an unbounded proof.
      let timer;
      try {
        const observation = structuredClone(await Promise.race([
          Promise.resolve().then(() => readers[method](request)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 10_000); }),
        ]));
        const ended = now(); check(ended >= began && ended - started <= maximumCollectionMs);
        check(exact(observation, ['value', 'observedAtUtc', 'sources'])
          && instant(observation.observedAtUtc) >= began && instant(observation.observedAtUtc) <= ended
          && same(observation.sources, googleWebReattestationReadSources(method, binding)));
        const value = observation.value;
        register.push({ method, locator, version: 'authenticated-read-v1', accessedAtUtc: new Date(ended).toISOString(),
          observedAtUtc: observation.observedAtUtc, sources: observation.sources,
          observationSha256: googleWebReattestationDigest(value) });
        return value;
      } finally { clearTimeout(timer); }
    }
    const accountLocator = `authenticated-session:sha256:${binding.firebaseAccountEmailSha256}`;
    const identity = await read('readAccountIdentity', accountLocator);
    check(exact(identity, ['projectId', 'projectNumber', 'firebaseAccountEmailSha256', 'observedAtUtc', 'proofSha256'])
      && identity.projectId === binding.projectId && identity.projectNumber === binding.projectNumber
      && identity.firebaseAccountEmailSha256 === binding.firebaseAccountEmailSha256
      && digestPattern.test(identity.proofSha256) && instant(identity.observedAtUtc) >= started
      && instant(identity.observedAtUtc) <= now());
    const snapshotLocator = `firebase-project-snapshot:${binding.projectId}`;
    const first = snapshot(await read('readSnapshot', snapshotLocator), binding);
    check(googleWebReattestationDigest(first) === binding.expectedSnapshotSha256);
    const request = { projectId: binding.projectId, appId: binding.webAppId };
    const appLocator = `https://firebase.googleapis.com/v1beta1/projects/${binding.projectNumber}/webApps/${binding.webAppId}`;
    const app = await read('readWebApp', appLocator, request);
    check(same(app, first.webApps.find((entry) => entry.appId === binding.webAppId)));
    const sdk = await read('readSdkConfig', `${appLocator}/config`, request);
    check(exact(sdk, ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain'])
      && sdk.projectId === binding.projectId && sdk.messagingSenderId === binding.projectNumber
      && sdk.appId === binding.webAppId && typeof sdk.apiKey === 'string'
      && /^AIza[A-Za-z0-9_-]{35}$/u.test(sdk.apiKey) && hash(sdk.apiKey) === binding.apiKey.keyFingerprint
      && sdk.authDomain === `${binding.projectId}.firebaseapp.com`);
    const configuration = { projectId: sdk.projectId, messagingSenderId: sdk.messagingSenderId, appId: sdk.appId,
      apiKey: sdk.apiKey, authDomain: sdk.authDomain, backendProjectId: binding.projectId, authorizedOrigin: origin };
    check(hash(JSON.stringify(configuration)) === binding.configurationSha256);
    const final = snapshot(await read('readSnapshot', snapshotLocator), binding);
    check(same(first, final));
    const finalIdentity = await read('readAccountIdentity', accountLocator);
    check(exact(finalIdentity, Object.keys(identity)) && finalIdentity.projectId === identity.projectId
      && finalIdentity.projectNumber === identity.projectNumber
      && finalIdentity.firebaseAccountEmailSha256 === identity.firebaseAccountEmailSha256
      && finalIdentity.proofSha256 === identity.proofSha256
      && instant(finalIdentity.observedAtUtc) >= instant(identity.observedAtUtc)
      && instant(finalIdentity.observedAtUtc) <= now());
    const completed = now(); check(completed >= started && completed - started <= maximumCollectionMs);
    check(same(sources, sourceRegister(repositoryRoot, binding.sourceCommit)));
    const record = { schemaVersion: 1, kind: 'sit-google-web-read-only-reattestation', sourceCommit: binding.sourceCommit,
      startedAtUtc: new Date(started).toISOString(), collectedAtUtc: new Date(completed).toISOString(),
      bindingSha256: googleWebReattestationDigest(binding), snapshotSha256: googleWebReattestationDigest(final),
      configurationSha256: binding.configurationSha256, providerMutationCount: 0,
      binding, finalSnapshot: final, finalWebApp: app, initialAccountIdentity: identity, finalAccountIdentity: finalIdentity,
      sourceRegister: sources.map((source) => ({ ...source, accessedAtUtc: new Date(completed).toISOString() })), readRegister: register };
    const journal = { schemaVersion: 1, kind: 'sit-google-web-read-only-reattestation-journal', records: [record] };
    const journalBytes = JSON.stringify(journal);
    const candidate = pendingCandidate(record, journalBytes, configuration);
    candidates.set(candidate, { digest: hash(JSON.stringify(candidate)), repositoryRoot, sources });
    return { candidate, journalBytes };
  } catch { throw new Error('google_web_reattestation_denied'); }
}

function protectedBytes(file, repositoryRoot, limit) {
  const descriptors = []; const chain = []; let bytes;
  const metadataEqual = (a, b, directory = false) => (directory
    ? ['dev', 'ino', 'mode', 'uid', 'gid']
    : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    .every((key) => a[key] === b[key]);
  const stable = () => chain.forEach(({ name, fd, stat, directory }) => {
    check(metadataEqual(stat, fs.fstatSync(fd, { bigint: true }), directory)
      && metadataEqual(stat, fs.lstatSync(name, { bigint: true }), directory));
  });
  try {
    check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
      && file !== repositoryRoot && !file.startsWith(`${repositoryRoot}${path.sep}`));
    let name = '/';
    for (const part of ['', ...path.dirname(file).split('/').filter(Boolean)]) {
      if (part) name = path.join(name, part);
      const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      descriptors.push(fd); const stat = fs.fstatSync(fd, { bigint: true });
      check(stat.isDirectory()); chain.push({ name, fd, stat, directory: true });
    }
    const parent = chain.at(-1).stat;
    check(parent.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push(fd); const stat = fs.fstatSync(fd, { bigint: true });
    check(stat.isFile() && stat.nlink === 1n && stat.uid === BigInt(process.getuid())
      && (stat.mode & 0o7777n) === 0o600n && stat.size >= 2n && stat.size <= BigInt(limit));
    chain.push({ name: file, fd, stat, directory: false }); stable();
    bytes = Buffer.alloc(Number(stat.size)); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0); stable();
    return bytes;
  } finally {
    for (const fd of descriptors.reverse()) fs.closeSync(fd);
  }
}

/** Resume after independent review in another process. The caller must obtain
 * both expected byte digests independently; a file's self-declared hash is not
 * provenance. Files are externally persisted, canonical JSON, 0600/0700 and
 * outside the checkout. This reader never creates or overwrites artifacts.
 */
export function loadGoogleWebReattestation({ candidateFile, expectedCandidateSha256, journalFile,
  expectedJournalSha256, repositoryRoot = defaultRoot, now = new Date() } = {}) {
  let candidateBytes; let journalBytes;
  try {
    check(candidateFile !== journalFile && digestPattern.test(expectedCandidateSha256)
      && digestPattern.test(expectedJournalSha256));
    candidateBytes = protectedBytes(candidateFile, repositoryRoot, 32768);
    journalBytes = protectedBytes(journalFile, repositoryRoot, 131072);
    check(hash(candidateBytes) === expectedCandidateSha256 && hash(journalBytes) === expectedJournalSha256);
    const candidateText = new TextDecoder('utf-8', { fatal: true }).decode(candidateBytes);
    const journalText = new TextDecoder('utf-8', { fatal: true }).decode(journalBytes);
    const candidate = JSON.parse(candidateText); const journal = JSON.parse(journalText);
    check(JSON.stringify(candidate) === candidateText && JSON.stringify(journal) === journalText
      && exact(journal, ['schemaVersion', 'kind', 'records']) && journal.schemaVersion === 1
      && journal.kind === 'sit-google-web-read-only-reattestation-journal'
      && Array.isArray(journal.records) && journal.records.length === 1);
    const record = journal.records[0];
    check(exact(record, ['schemaVersion', 'kind', 'sourceCommit', 'startedAtUtc', 'collectedAtUtc',
      'bindingSha256', 'snapshotSha256', 'configurationSha256', 'providerMutationCount', 'binding',
      'finalSnapshot', 'finalWebApp', 'initialAccountIdentity', 'finalAccountIdentity', 'sourceRegister', 'readRegister'])
      && record.schemaVersion === 1 && record.kind === 'sit-google-web-read-only-reattestation'
      && record.providerMutationCount === 0 && record.bindingSha256 === googleWebReattestationDigest(record.binding)
      && record.sourceCommit === record.binding.sourceCommit);
    const started = instant(record.startedAtUtc); const collected = instant(record.collectedAtUtc); const current = new Date(now).getTime();
    check(collected >= started && collected - started <= maximumCollectionMs && current >= collected && current < started + maximumAgeMs);
    const sources = sourceRegister(repositoryRoot, record.sourceCommit);
    check(same(record.sourceRegister, sources.map((source) => ({ ...source, accessedAtUtc: record.collectedAtUtc }))));
    const binding = record.binding; validateBinding(binding);
    const final = snapshot(record.finalSnapshot, binding);
    check(record.snapshotSha256 === googleWebReattestationDigest(final)
      && record.snapshotSha256 === binding.expectedSnapshotSha256
      && same(record.finalWebApp, final.webApps.find((app) => app.appId === binding.webAppId))
      && record.configurationSha256 === binding.configurationSha256
      && hash(JSON.stringify(candidate.configuration)) === binding.configurationSha256);
    const config = candidate.configuration;
    check(exact(config, ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain', 'backendProjectId', 'authorizedOrigin'])
      && config.projectId === binding.projectId && config.messagingSenderId === binding.projectNumber
      && config.appId === binding.webAppId && config.backendProjectId === binding.projectId
      && config.authorizedOrigin === origin && config.authDomain === `${binding.projectId}.firebaseapp.com`
      && /^AIza[A-Za-z0-9_-]{35}$/u.test(config.apiKey) && hash(config.apiKey) === binding.apiKey.keyFingerprint);
    for (const identity of [record.initialAccountIdentity, record.finalAccountIdentity]) {
      check(exact(identity, ['projectId', 'projectNumber', 'firebaseAccountEmailSha256', 'observedAtUtc', 'proofSha256'])
        && identity.projectId === binding.projectId && identity.projectNumber === binding.projectNumber
        && identity.firebaseAccountEmailSha256 === binding.firebaseAccountEmailSha256 && digestPattern.test(identity.proofSha256)
        && instant(identity.observedAtUtc) >= started && instant(identity.observedAtUtc) <= collected);
    }
    check(record.initialAccountIdentity.proofSha256 === record.finalAccountIdentity.proofSha256
      && instant(record.finalAccountIdentity.observedAtUtc) >= instant(record.initialAccountIdentity.observedAtUtc));
    const sdk = Object.fromEntries(['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain'].map((key) => [key, config[key]]));
    const expectedReads = [['readAccountIdentity', record.initialAccountIdentity], ['readSnapshot', final],
      ['readWebApp', record.finalWebApp], ['readSdkConfig', sdk], ['readSnapshot', final], ['readAccountIdentity', record.finalAccountIdentity]];
    check(Array.isArray(record.readRegister) && record.readRegister.length === expectedReads.length);
    let previousTime = started;
    for (const [index, [method, value]] of expectedReads.entries()) {
      const entry = record.readRegister[index];
      const locators = googleWebReattestationReadSources(method, binding);
      const locator = method === 'readSnapshot' ? `firebase-project-snapshot:${binding.projectId}`
        : method === 'readSdkConfig' ? locators.at(-1) : locators[0];
      check(exact(entry, ['method', 'locator', 'version', 'accessedAtUtc', 'observedAtUtc', 'sources', 'observationSha256'])
        && entry.method === method && entry.locator === locator && entry.version === 'authenticated-read-v1'
        && instant(entry.observedAtUtc) >= previousTime && instant(entry.observedAtUtc) <= instant(entry.accessedAtUtc)
        && instant(entry.accessedAtUtc) <= collected && same(entry.sources, googleWebReattestationReadSources(method, binding))
        && entry.observationSha256 === googleWebReattestationDigest(value));
      previousTime = instant(entry.accessedAtUtc);
    }
    check(JSON.stringify(candidate) === JSON.stringify(pendingCandidate(record, journalText, config)));
    candidates.set(candidate, { digest: expectedCandidateSha256, repositoryRoot, sources });
    return candidate;
  } catch { throw new Error('google_web_reattestation_load_denied'); }
  finally { candidateBytes?.fill(0); journalBytes?.fill(0); }
}

// No approval is generated here. Only the exact independent canonical decision
// may compose a schema-2 envelope, under the unchanged builder validator.
export function bindGoogleWebReattestationDecision({ candidate, decisionBytes, expectedDecisionSha256, now = new Date() } = {}) {
  try {
    const retained = candidates.get(candidate);
    check(retained && hash(JSON.stringify(candidate)) === retained.digest
      && same(retained.sources, sourceRegister(retained.repositoryRoot, candidate.readiness.sourceCommit))
      && typeof decisionBytes === 'string' && digestPattern.test(expectedDecisionSha256)
      && hash(decisionBytes) === expectedDecisionSha256);
    const decision = JSON.parse(decisionBytes);
    check(JSON.stringify(decision) === decisionBytes);
    const envelope = { ...candidate, evidenceClass: 'verified-prerequisite-journal-and-independent-decision',
      activationDecision: 'approved-independent-review', activationEligible: true, decision, decisionSha256: expectedDecisionSha256 };
    const evidenceSha256 = hash(JSON.stringify(envelope));
    bindGoogleWebReadiness(envelope, evidenceSha256, { now, expectedSource: candidate.readiness.sourceCommit });
    return { envelope, evidenceSha256 };
  } catch { throw new Error('google_web_reattestation_decision_denied'); }
}
