// Source-only orchestration contract. Live credentials and transport remain in
// the separately reviewed staging_google_web_live_adapter.mjs. Any adapter must supply complete paginated
// inventories, full-config digests (including secret-bearing provider fields,
// never their values), and enforce the supplied conditional/exclusive guard.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, bindGoogleWebConfig, readGoogleWebConfig, confinedDirectory, sha256 } from '../../tool/staging_web_contract.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const host = 'staging.shareittoo.com';
export const STAGING_GOOGLE_WEB_DISPLAY_NAME = 'ShareItToo Staging Web';
const schemaVersion = 3;
const hashPattern = /^[a-f0-9]{64}$/u;
const ownFile = fileURLToPath(import.meta.url);
const phases = ['ready', 'create_intent', 'create_pending', 'app_verified', 'domain_intent', 'domain_verified', 'export_intent', 'complete'];
const errors = new WeakSet();
function fail(code) { const error = new Error(code); errors.add(error); throw error; }
export const isStagingGoogleWebPrerequisiteError = (error) => errors.has(error);
function requireThat(ok, code) { if (!ok) fail(code); }
function keys(value, expected) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const prerequisiteSnapshotDigest = (value) => sha256(JSON.stringify(canonical(value)));

function apiKeyBinding(value, projectId) {
  requireThat(keys(value, ['apiKeyId', 'projectId', 'keyFingerprint', 'restrictionsDigest'])
    && typeof value.apiKeyId === 'string' && /^[A-Za-z0-9_-]{1,200}$/u.test(value.apiKeyId)
    && value.projectId === projectId && hashPattern.test(value.keyFingerprint)
    && hashPattern.test(value.restrictionsDigest), 'api_key_binding_invalid');
}

function snapshot(value, binding) {
  requireThat(keys(value, ['complete', 'projectId', 'projectNumber', 'backendProjectId', 'authEnabled',
    'emulatorEnabled', 'googleEnabled', 'webApps', 'webAppsInventory', 'apiKey', 'keyInventoryDigest',
    'authorizedDomains', 'authConfigDigest', 'providerConfigDigest', 'otherAppsDigest', 'runtimeDigest', 'revision']), 'snapshot_shape_invalid');
  requireThat(value.complete === true && value.projectId === binding.projectId
    && value.projectNumber === binding.projectNumber && value.backendProjectId === binding.projectId
    && value.authEnabled === true && value.emulatorEnabled === false && value.googleEnabled === true,
  'snapshot_identity_invalid');
  // authConfigDigest covers every auth setting EXCEPT authorizedDomains and
  // revision metadata; providerConfigDigest covers every provider setting.
  // keyInventoryDigest covers the complete existing key inventory and restrictions.
  // keyFingerprint is SHA-256 of the UTF-8 public keyString, never the raw value.
  for (const key of ['authConfigDigest', 'providerConfigDigest', 'otherAppsDigest', 'runtimeDigest', 'keyInventoryDigest']) {
    requireThat(hashPattern.test(value[key] ?? ''), 'snapshot_digest_invalid');
  }
  requireThat(keys(value.apiKey, ['apiKeyId', 'projectId', 'keyFingerprint', 'restrictionsDigest', 'exists', 'webCompatible'])
    && equal(value.apiKey, { ...binding.apiKey, exists: true, webCompatible: true }), 'existing_api_key_unverified');
  requireThat(keys(value.webAppsInventory, ['showDeleted', 'exhausted', 'nextPageToken'])
    && value.webAppsInventory.showDeleted === true && value.webAppsInventory.exhausted === true
    && value.webAppsInventory.nextPageToken === '', 'app_inventory_incomplete');
  requireThat(typeof value.revision === 'string' && value.revision.length > 0 && value.revision.length <= 256, 'snapshot_revision_invalid');
  requireThat(Array.isArray(value.authorizedDomains) && value.authorizedDomains.length < 1000
    && value.authorizedDomains.every((domain) => typeof domain === 'string' && /^[a-z0-9.-]+$/u.test(domain))
    && new Set(value.authorizedDomains).size === value.authorizedDomains.length, 'domain_inventory_invalid');
  requireThat(Array.isArray(value.webApps) && value.webApps.length < 1000, 'app_inventory_invalid');
  for (const app of value.webApps) {
    requireThat(keys(app, ['appId', 'projectId', 'state', 'apiKeyId', 'displayName']) && app.projectId === binding.projectId
      && new RegExp(`^1:${binding.projectNumber}:web:[a-f0-9]{16,64}$`, 'u').test(app.appId)
      && typeof app.apiKeyId === 'string' && /^[A-Za-z0-9_-]{1,200}$/u.test(app.apiKeyId)
      && app.displayName === STAGING_GOOGLE_WEB_DISPLAY_NAME
      && ['ACTIVE', 'DELETED'].includes(app.state), 'app_inventory_invalid');
  }
  requireThat(new Set(value.webApps.map((app) => app.appId)).size === value.webApps.length, 'app_inventory_invalid');
  return structuredClone(value);
}

function validateBinding(binding, now) {
  requireThat(keys(binding, ['schemaVersion', 'projectId', 'projectNumber', 'origin', 'displayName',
    'firebaseAccountEmailSha256', 'sourceCommit', 'runnerDigest', 'baselineDigest', 'apiKey', 'domainLeaseVerifier', 'gate']), 'binding_shape_invalid');
  requireThat(binding.schemaVersion === schemaVersion && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(binding.projectId)
    && /^[0-9]{6,20}$/u.test(binding.projectNumber) && binding.origin === TARGET
    && binding.displayName === STAGING_GOOGLE_WEB_DISPLAY_NAME
    && hashPattern.test(binding.firebaseAccountEmailSha256 ?? '')
    && /^[a-f0-9]{40}$/u.test(binding.sourceCommit) && hashPattern.test(binding.baselineDigest), 'binding_invalid');
  apiKeyBinding(binding.apiKey, binding.projectId);
  requireThat(keys(binding.domainLeaseVerifier, ['algorithm', 'publicKeySha256'])
    && binding.domainLeaseVerifier.algorithm === 'Ed25519'
    && hashPattern.test(binding.domainLeaseVerifier.publicKeySha256 ?? ''), 'domain_lease_verifier_invalid');
  requireThat(binding.runnerDigest === sha256(fs.readFileSync(ownFile))
    && binding.sourceCommit === execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'source_binding_invalid');
  const gate = binding.gate;
  requireThat(keys(gate, ['id', 'decision', 'firebaseAccountEmailSha256', 'sourceCommit', 'runnerDigest', 'baselineDigest', 'evidenceDigest', 'expiresAt'])
    && gate.id === 'SIT-GOOGLE-WEB-PREREQ-01' && ['pending', 'A PASS'].includes(gate.decision)
    && gate.sourceCommit === binding.sourceCommit && gate.runnerDigest === binding.runnerDigest
    && gate.firebaseAccountEmailSha256 === binding.firebaseAccountEmailSha256
    && gate.baselineDigest === binding.baselineDigest && hashPattern.test(gate.evidenceDigest)
    && typeof gate.expiresAt === 'string' && Number.isFinite(Date.parse(gate.expiresAt))
    && Date.parse(gate.expiresAt) > now(), 'gate_binding_invalid');
}

export function assertPrerequisiteOutputPath(file) {
  requireThat(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
    && file !== root && !file.startsWith(`${root}${path.sep}`), 'output_path_invalid');
  confinedDirectory(path.dirname(file));
  const parent = fs.lstatSync(path.dirname(file));
  requireThat(parent.uid === process.getuid() && (parent.mode & 0o777) === 0o700, 'output_directory_unsafe');
}
function validateState(state, binding, configFile) {
  requireThat(keys(state, ['schemaVersion', 'binding', 'configFile', 'baseline', 'phase', 'appId', 'operation', 'configDigest'])
    && state.schemaVersion === schemaVersion && state.binding?.schemaVersion === schemaVersion
    && phases.includes(state.phase), 'journal_state_invalid');
  apiKeyBinding(state.binding.apiKey, state.binding.projectId);
  requireThat(equal(state.binding, binding) && state.configFile === configFile, 'journal_binding_invalid');
  requireThat(prerequisiteSnapshotDigest(snapshot(state.baseline, binding)) === binding.baselineDigest, 'journal_baseline_invalid');
  const phase = phases.indexOf(state.phase);
  requireThat(phase < 2 ? state.operation === null : /^operations\/[A-Za-z0-9_-]{1,200}$/u.test(state.operation), 'journal_state_invalid');
  requireThat(phase < 3 ? state.appId === null : new RegExp(`^1:${binding.projectNumber}:web:[a-f0-9]{16,64}$`, 'u').test(state.appId), 'journal_state_invalid');
  requireThat(phase < 6 ? state.configDigest === null : hashPattern.test(state.configDigest), 'journal_state_invalid');
}
function exists(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function metadata(fd, maxBytes) {
  const stat = fs.fstatSync(fd);
  requireThat(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid()
    && (stat.mode & 0o777) === 0o600 && stat.size <= maxBytes, 'private_file_unsafe');
  return stat;
}
function exclusive(file, bytes) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { metadata(fd, 0); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const dir = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
function readJournal(file) {
  if (!exists(file)) return null;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    metadata(fd, 1024 * 1024);
    const bytes = fs.readFileSync(fd, 'utf8');
    requireThat(bytes.endsWith('\n'), 'journal_incomplete');
    const records = bytes.trimEnd().split('\n').map((line) => JSON.parse(line));
    requireThat(records.length > 0 && records.length <= phases.length, 'journal_invalid');
    let previous = null;
    for (const [index, record] of records.entries()) {
      requireThat(keys(record, ['sequence', 'previous', 'state', 'digest']) && record.sequence === index
        && record.previous === previous && record.digest === prerequisiteSnapshotDigest(record.state)
        && record.state.phase === phases[index], 'journal_invalid');
      validateState(record.state, record.state.binding, record.state.configFile);
      if (index > 0) {
        const prior = records[index - 1].state;
        requireThat(equal(prior.binding, record.state.binding) && equal(prior.baseline, record.state.baseline)
          && prior.configFile === record.state.configFile && (!prior.operation || prior.operation === record.state.operation)
          && (!prior.appId || prior.appId === record.state.appId)
          && (!prior.configDigest || prior.configDigest === record.state.configDigest), 'journal_invalid');
      }
      previous = record.digest;
    }
    return { records, state: records.at(-1).state, bytes, identity: fs.fstatSync(fd) };
  } finally { fs.closeSync(fd); }
}
function append(file, previous, state) {
  const record = { sequence: previous?.records.length ?? 0, previous: previous?.records.at(-1).digest ?? null,
    state, digest: prerequisiteSnapshotDigest(state) };
  const bytes = `${JSON.stringify(record)}\n`;
  if (!previous) exclusive(file, bytes);
  else {
    const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
    try {
      const stat = metadata(fd, 1024 * 1024);
      requireThat(stat.ino === previous.identity.ino && stat.dev === previous.identity.dev
        && fs.readFileSync(fd, 'utf8') === previous.bytes, 'journal_changed');
      fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }
  return readJournal(file);
}
function expectedSnapshot(baseline, appId, withDomain) {
  return { ...baseline, webApps: appId ? [{ appId, projectId: baseline.projectId, state: 'ACTIVE', apiKeyId: baseline.apiKey.apiKeyId,
    displayName: STAGING_GOOGLE_WEB_DISPLAY_NAME }] : [],
    authorizedDomains: [...baseline.authorizedDomains, ...(withDomain ? [host] : [])].sort() };
}
function sameSnapshot(actual, expected, { compareRevision = false } = {}) {
  const normalize = (value) => ({ ...value, authorizedDomains: [...value.authorizedDomains].sort(),
    ...(compareRevision ? {} : { revision: null }) });
  return equal(normalize(actual), normalize(expected));
}

/** Adapter contract: readSnapshot, createWebApp, readOperation, readWebApp, readSdkConfig,
 * readSnapshot must enumerate ACTIVE + DELETED apps with showDeleted=true on
 * every page until nextPageToken is exhausted; never persist short-lived tokens.
 * It must independently verify the bound existing project-owned key, its web
 * restrictions and fingerprint. createWebApp must send the exact apiKeyId and
 * canonical displayName;
 * omission/fallback/automatic key provisioning is forbidden. readWebApp is an
 * independent webApps.get response, not a cached list or operation response.
 * acquireDomainGuard, patchAuthorizedDomains. Guard acquisition must prove
 * provider-enforced CAS, or exclusive ownership across ALL configuration writers
 * (a local lock is insufficient). PATCH receives the proof and must enforce it.
 * Methods must have bounded transport deadlines; this module never retries a
 * mutation or interprets an arbitrary exception's message/code as trusted output.
 */
export async function runStagingGoogleWebPrerequisites({ binding, adapter, journalFile, configFile,
  execute = false, now = Date.now } = {}) {
  let lockFd;
  let lockIdentity;
  const lockFile = typeof journalFile === 'string' ? `${journalFile}.lock` : null;
  try {
    requireThat(typeof execute === 'boolean', 'execute_flag_invalid');
    validateBinding(binding, now);
    assertPrerequisiteOutputPath(journalFile); assertPrerequisiteOutputPath(configFile);
    requireThat(journalFile !== configFile && configFile !== lockFile, 'output_path_collision');
    let journal = readJournal(journalFile);
    if (journal) validateState(journal.state, binding, configFile);
    let observed = snapshot(await adapter.readSnapshot(), binding);
    if (!journal) {
      // Compare validated bare-host entries, never URL substrings.
      requireThat(observed.webApps.length === 0 && !observed.authorizedDomains.some((domain) => domain === host), 'baseline_already_changed');
      requireThat(prerequisiteSnapshotDigest(observed) === binding.baselineDigest, 'baseline_stale');
      requireThat(!exists(configFile), 'output_already_exists');
    }
    if (!execute) return journal ? { status: 'resume-readback-only', phase: journal.state.phase }
      : { status: 'preflight-passed-no-mutation', resumable: false };
    requireThat(binding.gate.decision === 'A PASS', 'accepted_gate_required');
    lockFd = fs.openSync(lockFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    lockIdentity = metadata(lockFd, 0);
    // Re-open after taking the lock: another executor may have advanced it.
    journal = readJournal(journalFile);
    if (journal) validateState(journal.state, binding, configFile);
    else journal = append(journalFile, null, { schemaVersion, binding, configFile, baseline: observed, phase: 'ready', appId: null, operation: null, configDigest: null });
    let state = journal.state;
    validateState(state, binding, configFile);
    const baseline = snapshot(state.baseline, binding);
    requireThat(prerequisiteSnapshotDigest(baseline) === binding.baselineDigest, 'journal_baseline_invalid');
    const save = (changes) => { state = { ...state, ...changes }; journal = append(journalFile, journal, state); };
    const read = async () => snapshot(await adapter.readSnapshot(), binding);
    if (state.phase === 'ready') {
      observed = await read();
      requireThat(sameSnapshot(observed, baseline, { compareRevision: true }), 'baseline_stale');
      validateBinding(binding, now);
      save({ phase: 'create_intent' });
      const operation = await adapter.createWebApp({ projectId: binding.projectId, apiKeyId: binding.apiKey.apiKeyId,
        displayName: binding.displayName });
      requireThat(keys(operation, ['name']) && /^operations\/[A-Za-z0-9_-]{1,200}$/u.test(operation.name), 'operation_invalid');
      save({ phase: 'create_pending', operation: operation.name });
    } else if (state.phase === 'create_intent') fail('create_outcome_unknown');
    if (state.phase === 'create_pending') {
      const operation = await adapter.readOperation({ name: state.operation, projectId: binding.projectId });
      requireThat(keys(operation, ['name', 'done', 'appId', 'failed']) && operation.name === state.operation
        && typeof operation.done === 'boolean' && operation.failed === false, 'operation_failed_or_foreign');
      if (!operation.done) return { status: 'pending', phase: 'create_pending' };
      requireThat(new RegExp(`^1:${binding.projectNumber}:web:[a-f0-9]{16,64}$`, 'u').test(operation.appId), 'operation_app_invalid');
      observed = await read();
      requireThat(sameSnapshot(observed, expectedSnapshot(baseline, operation.appId, false)), 'created_app_readback_drift');
      requireThat(equal(await adapter.readWebApp({ projectId: binding.projectId, appId: operation.appId }),
        expectedSnapshot(baseline, operation.appId, false).webApps[0]), 'created_app_identity_invalid');
      save({ phase: 'app_verified', appId: operation.appId });
    }
    if (state.phase === 'app_verified') {
      observed = await read();
      requireThat(sameSnapshot(observed, expectedSnapshot(baseline, state.appId, false)), 'prepatch_drift');
      const guard = await adapter.acquireDomainGuard({ projectId: binding.projectId, revision: observed.revision });
      const conditional = keys(guard, ['kind', 'providerEnforced', 'projectId', 'revision'])
        && guard.kind === 'conditional' && guard.providerEnforced === true && guard.revision === observed.revision;
      const exclusiveGuard = keys(guard, ['kind', 'allWritersExcluded', 'projectId', 'leaseId', 'expiresAt'])
        && guard.kind === 'exclusive' && guard.allWritersExcluded === true && typeof guard.leaseId === 'string'
        && guard.leaseId.length > 0 && typeof guard.expiresAt === 'string' && Date.parse(guard.expiresAt) > now();
      requireThat((conditional || exclusiveGuard) && guard.projectId === binding.projectId, 'domain_guard_unproven');
      const immediate = await read();
      requireThat(sameSnapshot(immediate, observed, { compareRevision: true }), 'prepatch_drift');
      if (exclusiveGuard) requireThat(Date.parse(guard.expiresAt) > now(), 'domain_guard_expired');
      validateBinding(binding, now);
      save({ phase: 'domain_intent' });
      await adapter.patchAuthorizedDomains({ projectId: binding.projectId, updateMask: 'authorizedDomains',
        authorizedDomains: expectedSnapshot(baseline, state.appId, true).authorizedDomains, guard });
    }
    if (state.phase === 'domain_intent') {
      observed = await read();
      requireThat(sameSnapshot(observed, expectedSnapshot(baseline, state.appId, true)), 'domain_outcome_unknown_or_drift');
      save({ phase: 'domain_verified' });
    }
    requireThat(['domain_verified', 'export_intent', 'complete'].includes(state.phase), 'journal_phase_invalid');
    observed = await read();
    requireThat(sameSnapshot(observed, expectedSnapshot(baseline, state.appId, true)), 'final_readback_drift');
    requireThat(equal(await adapter.readWebApp({ projectId: binding.projectId, appId: state.appId }),
      expectedSnapshot(baseline, state.appId, true).webApps[0]), 'created_app_identity_invalid');
    const sdk = await adapter.readSdkConfig({ projectId: binding.projectId, appId: state.appId });
    requireThat(keys(sdk, ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain'])
      && sdk.projectId === binding.projectId && sdk.messagingSenderId === binding.projectNumber && sdk.appId === state.appId, 'sdk_config_invalid');
    requireThat(typeof sdk.apiKey === 'string' && sha256(sdk.apiKey) === binding.apiKey.keyFingerprint, 'sdk_key_binding_invalid');
    const config = { projectId: sdk.projectId, messagingSenderId: sdk.messagingSenderId, appId: sdk.appId,
      apiKey: sdk.apiKey, authDomain: sdk.authDomain, backendProjectId: binding.projectId, authorizedOrigin: TARGET };
    const digest = sha256(JSON.stringify(config));
    bindGoogleWebConfig(config, digest);
    if (state.phase === 'domain_verified') { requireThat(!exists(configFile), 'output_already_exists'); save({ phase: 'export_intent', configDigest: digest }); }
    requireThat(state.configDigest === digest, 'public_config_drift');
    if (!exists(configFile)) {
      requireThat(state.phase === 'export_intent', 'completed_config_missing');
      exclusive(configFile, JSON.stringify(config));
    }
    readGoogleWebConfig(configFile, digest);
    // Config export never substitutes for the final independent provider read.
    requireThat(sameSnapshot(await read(), expectedSnapshot(baseline, state.appId, true)), 'final_readback_drift');
    if (state.phase !== 'complete') save({ phase: 'complete' });
    return { status: 'prerequisites-verified-config-awaiting-review', configDigest: digest,
      addedDomain: host, webAppCount: 1, providerApprovalInferred: false, buildExecuted: false };
  } catch (error) {
    if (errors.has(error)) throw error;
    fail('google_web_prerequisite_operation_failed');
  } finally {
    if (lockFd !== undefined) {
      let cleanupFailed = false;
      try {
        const stat = fs.lstatSync(lockFile);
        requireThat(lockIdentity && stat.ino === lockIdentity.ino && stat.dev === lockIdentity.dev && stat.nlink === 1, 'lock_identity_changed');
        fs.unlinkSync(lockFile);
      } catch { cleanupFailed = true; }
      try { fs.closeSync(lockFd); } catch { cleanupFailed = true; }
      if (cleanupFailed) fail('journal_lock_cleanup_failed');
    }
  }
}
