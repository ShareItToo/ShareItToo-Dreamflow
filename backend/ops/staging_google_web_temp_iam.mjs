#!/usr/bin/env node

// Temporary, journaled IAM transport for the staging Google Web prerequisite.
// It grants only the two read roles needed by the already-bound staging service
// account and can later remove only memberships that the same run added.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFirebaseUserCredential, parseServiceCredential,
  readPrivateInput } from './staging_google_web_live_adapter.mjs';

export const STAGING_GOOGLE_IAM_PROJECT = 'shareittoo-staging';
export const STAGING_GOOGLE_IAM_ACCOUNT_SHA256 = '96bad520eb9ff825c6d0f21cfd7826917285b92d7810435ab1008d64af845261';
export const STAGING_GOOGLE_IAM_ROLES = Object.freeze([
  'roles/serviceusage.apiKeysViewer',
  'roles/serviceusage.serviceUsageViewer',
]);

const ownFile = fileURLToPath(import.meta.url);
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const endpoint = `https://cloudresourcemanager.googleapis.com/v1/projects/${STAGING_GOOGLE_IAM_PROJECT}`;
const hashPattern = /^[a-f0-9]{64}$/u;
const rolePattern = /^(?:roles\/[A-Za-z0-9_.]+|projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/roles\/[A-Za-z0-9_.]+|organizations\/[0-9]+\/roles\/[A-Za-z0-9_.]+)$/u;
const trusted = new WeakMap();
const plain = (value) => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value)
  && Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const boundedText = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fail(code, kind = 'validation') {
  const error = new Error(code); trusted.set(error, kind); throw error;
}
function check(value, code) { if (!value) fail(code); }
export function isStagingGoogleTempIamError(error) { return trusted.has(error); }
export function stagingGoogleTempIamErrorCode(error) {
  return trusted.has(error) ? error.message : 'google_temp_iam_failed';
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const digest = (value) => sha256(JSON.stringify(canonical(value)));
function cloneJson(value, code) {
  try {
    const text = JSON.stringify(value); check(text.length <= 1024 * 1024, code);
    return JSON.parse(text);
  } catch (error) { if (trusted.has(error)) throw error; fail(code); }
}
function parseJson(bytes, code) {
  try { const value = JSON.parse(bytes); check(plain(value), code); return value; }
  catch (error) { if (trusted.has(error)) throw error; fail(code); }
}

function currentSourceBinding() {
  try {
    return { sourceCommit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
    runnerDigest: sha256(fs.readFileSync(ownFile)) };
  } catch { fail('iam_source_binding_unavailable'); }
}

function validateBinding(binding, now, requireAcceptedGate) {
  check(exact(binding, ['schemaVersion', 'projectId', 'firebaseAccountEmailSha256', 'serviceAccountEmailSha256', 'roles',
    'runId', 'sourceCommit', 'runnerDigest', 'gate'])
    && binding.schemaVersion === 1 && binding.projectId === STAGING_GOOGLE_IAM_PROJECT
    && binding.firebaseAccountEmailSha256 === STAGING_GOOGLE_IAM_ACCOUNT_SHA256
    && hashPattern.test(binding.serviceAccountEmailSha256 ?? '')
    && Array.isArray(binding.roles) && JSON.stringify(binding.roles) === JSON.stringify(STAGING_GOOGLE_IAM_ROLES)
    && /^[A-Za-z0-9_-]{12,120}$/u.test(binding.runId ?? '')
    && /^[a-f0-9]{40}$/u.test(binding.sourceCommit ?? '') && hashPattern.test(binding.runnerDigest ?? ''),
  'iam_binding_invalid');
  const gate = binding.gate;
  check(exact(gate, ['id', 'decision', 'sourceCommit', 'runnerDigest', 'evidenceDigest', 'expiresAt'])
    && gate.id === 'SIT-GOOGLE-IAM-TEMP-READ-01' && ['pending', 'A PASS'].includes(gate.decision)
    && gate.sourceCommit === binding.sourceCommit && gate.runnerDigest === binding.runnerDigest
    && hashPattern.test(gate.evidenceDigest ?? '') && typeof gate.expiresAt === 'string'
    && Number.isFinite(Date.parse(gate.expiresAt)), 'iam_gate_invalid');
  const current = currentSourceBinding();
  check(binding.sourceCommit === current.sourceCommit && binding.runnerDigest === current.runnerDigest,
    'iam_source_binding_invalid');
  if (requireAcceptedGate) check(gate.decision === 'A PASS' && Date.parse(gate.expiresAt) > now()
    && Date.parse(gate.expiresAt) <= now() + 86_400_000, 'iam_accepted_gate_required');
}

function validatePolicy(value) {
  const policy = cloneJson(value, 'iam_policy_invalid');
  check(plain(policy) && Object.keys(policy).every((key) => ['version', 'bindings', 'auditConfigs', 'etag'].includes(key))
    && Object.hasOwn(policy, 'bindings') && Object.hasOwn(policy, 'etag')
    && (!Object.hasOwn(policy, 'version') || [0, 1, 3].includes(policy.version)) && boundedText(policy.etag, 2048)
    && Array.isArray(policy.bindings) && policy.bindings.length <= 2000
    && (!Object.hasOwn(policy, 'auditConfigs')
      || (Array.isArray(policy.auditConfigs) && policy.auditConfigs.length <= 2000)), 'iam_policy_invalid');
  for (const binding of policy.bindings) {
    check(plain(binding) && Object.keys(binding).every((key) => ['role', 'members', 'condition'].includes(key))
      && boundedText(binding.role, 512) && rolePattern.test(binding.role)
      && Array.isArray(binding.members) && binding.members.length > 0 && binding.members.length <= 5000
      && binding.members.every((member) => boundedText(member, 1024))
      && new Set(binding.members).size === binding.members.length, 'iam_policy_invalid');
    if (Object.hasOwn(binding, 'condition')) check(plain(binding.condition)
      && Object.keys(binding.condition).every((key) => ['title', 'description', 'expression', 'location'].includes(key))
      && boundedText(binding.condition.title) && boundedText(binding.condition.expression, 65536)
      && (!Object.hasOwn(binding.condition, 'description') || typeof binding.condition.description === 'string')
      && (!Object.hasOwn(binding.condition, 'location') || typeof binding.condition.location === 'string'),
    'iam_policy_invalid');
  }
  check(policy.version === 3 || policy.bindings.every((binding) => !Object.hasOwn(binding, 'condition')),
    'iam_policy_version_invalid');
  return policy;
}

function semanticPolicy(policy) {
  const value = cloneJson(policy, 'iam_policy_invalid'); delete value.etag;
  value.bindings = value.bindings.map((binding) => ({ ...binding, members: [...binding.members].sort() }))
    .sort((left, right) => JSON.stringify(canonical(left)).localeCompare(JSON.stringify(canonical(right))));
  if (Object.hasOwn(value, 'auditConfigs')) value.auditConfigs = value.auditConfigs.map((config) => {
    if (!plain(config) || !Array.isArray(config.auditLogConfigs)) return config;
    return { ...config, auditLogConfigs: config.auditLogConfigs.map((entry) => plain(entry)
      && Array.isArray(entry.exemptedMembers) ? { ...entry, exemptedMembers: [...entry.exemptedMembers].sort() } : entry)
      .sort((left, right) => JSON.stringify(canonical(left)).localeCompare(JSON.stringify(canonical(right)))) };
  }).sort((left, right) => JSON.stringify(canonical(left)).localeCompare(JSON.stringify(canonical(right))));
  return value;
}
const semanticPolicyDigest = (policy) => digest(semanticPolicy(policy));

function unconditionalBindings(policy, role) {
  return policy.bindings.map((binding, index) => ({ binding, index }))
    .filter(({ binding }) => binding.role === role && !Object.hasOwn(binding, 'condition'));
}

export function planTemporaryIamGrant(policyValue, principal) {
  check(boundedText(principal, 1024) && principal.startsWith('serviceAccount:'), 'iam_principal_invalid');
  const baseline = validatePolicy(policyValue); const target = cloneJson(baseline, 'iam_policy_invalid');
  const addedRoles = []; const preexistingRoles = [];
  for (const role of STAGING_GOOGLE_IAM_ROLES) {
    const matches = unconditionalBindings(target, role);
    check(matches.length <= 1, 'iam_policy_binding_ambiguous');
    if (matches.length === 1 && matches[0].binding.members.includes(principal)) {
      preexistingRoles.push(role); continue;
    }
    if (matches.length === 1) matches[0].binding.members.push(principal);
    else target.bindings.push({ role, members: [principal] });
    addedRoles.push(role);
  }
  return Object.freeze({ baseline, target, addedRoles: Object.freeze(addedRoles),
    preexistingRoles: Object.freeze(preexistingRoles), baselinePolicySha256: semanticPolicyDigest(baseline),
    targetPolicySha256: semanticPolicyDigest(target), baselineEtagSha256: sha256(baseline.etag) });
}

export function planTemporaryIamRevoke(policyValue, principal, addedRoles) {
  check(boundedText(principal, 1024) && principal.startsWith('serviceAccount:')
    && Array.isArray(addedRoles) && addedRoles.every((role) => STAGING_GOOGLE_IAM_ROLES.includes(role))
    && new Set(addedRoles).size === addedRoles.length, 'iam_revoke_binding_invalid');
  const baseline = validatePolicy(policyValue); const target = cloneJson(baseline, 'iam_policy_invalid');
  for (const role of addedRoles) {
    const matches = unconditionalBindings(target, role)
      .filter(({ binding }) => binding.members.includes(principal));
    check(matches.length === 1, 'iam_revoke_membership_drift');
    const { binding, index } = matches[0]; binding.members = binding.members.filter((member) => member !== principal);
    if (binding.members.length === 0) target.bindings.splice(index, 1);
  }
  return Object.freeze({ baseline, target, addedRoles: Object.freeze([...addedRoles]), preexistingRoles: Object.freeze([]),
    baselinePolicySha256: semanticPolicyDigest(baseline), targetPolicySha256: semanticPolicyDigest(target),
    baselineEtagSha256: sha256(baseline.etag) });
}

function outputPath(file) {
  check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
    && file !== root && !file.startsWith(`${root}${path.sep}`), 'iam_journal_path_invalid');
  const parent = path.dirname(file);
  try {
    const realParent = fs.realpathSync(parent); const metadata = fs.statSync(realParent);
    check(realParent === parent && metadata.isDirectory() && metadata.uid === process.getuid()
      && (metadata.mode & 0o077) === 0, 'iam_journal_path_invalid');
  } catch (error) { if (trusted.has(error)) throw error; fail('iam_journal_path_invalid'); }
  return file;
}

const journalFields = ['schemaVersion', 'runId', 'projectId', 'operation', 'phase', 'bindingSha256', 'principalSha256', 'roles',
  'addedRoles', 'preexistingRoles', 'baselinePolicySha256', 'targetPolicySha256', 'baselineEtagSha256',
  'readbackPolicySha256', 'readbackEtagSha256', 'at', 'previousRecordSha256', 'recordSha256'];
function journalRecord(base, previousRecordSha256) {
  const unsigned = { ...base, previousRecordSha256, recordSha256: null };
  return { ...unsigned, recordSha256: digest(unsigned) };
}
function validateRecord(record, previous) {
  check(exact(record, journalFields) && record.schemaVersion === 1
    && /^[A-Za-z0-9_-]{12,120}$/u.test(record.runId ?? '') && record.projectId === STAGING_GOOGLE_IAM_PROJECT
    && ['grant', 'revoke'].includes(record.operation) && hashPattern.test(record.bindingSha256 ?? '')
    && ['intent', 'applied', 'no_mutation', 'rejected', 'outcome_unknown'].includes(record.phase)
    && hashPattern.test(record.principalSha256 ?? '')
    && JSON.stringify(record.roles) === JSON.stringify(STAGING_GOOGLE_IAM_ROLES)
    && Array.isArray(record.addedRoles) && record.addedRoles.every((role) => STAGING_GOOGLE_IAM_ROLES.includes(role))
    && Array.isArray(record.preexistingRoles) && record.preexistingRoles.every((role) => STAGING_GOOGLE_IAM_ROLES.includes(role))
    && hashPattern.test(record.baselinePolicySha256 ?? '') && hashPattern.test(record.targetPolicySha256 ?? '')
    && hashPattern.test(record.baselineEtagSha256 ?? '')
    && (record.readbackPolicySha256 === null || hashPattern.test(record.readbackPolicySha256))
    && (record.readbackEtagSha256 === null || hashPattern.test(record.readbackEtagSha256))
    && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at))
    && record.previousRecordSha256 === previous && hashPattern.test(record.recordSha256 ?? ''), 'iam_journal_invalid');
  const { recordSha256, ...unsigned } = record;
  check(recordSha256 === digest({ ...unsigned, recordSha256: null }), 'iam_journal_invalid');
}
function loadJournal(file, allowMissing = false) {
  outputPath(file);
  if (!fs.existsSync(file)) { check(allowMissing, 'iam_journal_missing'); return []; }
  let bytes;
  try { bytes = readPrivateInput({ file, maxBytes: 1024 * 1024, code: 'iam_journal_invalid' }); }
  catch (error) { if (trusted.has(error)) throw error; fail('iam_journal_invalid'); }
  check(bytes.endsWith('\n'), 'iam_journal_invalid');
  const records = []; let previous = null;
  for (const line of bytes.trimEnd().split('\n')) {
    const record = parseJson(line, 'iam_journal_invalid'); validateRecord(record, previous);
    records.push(record); previous = record.recordSha256;
  }
  return records;
}
function appendJournal(file, recordBase) {
  const records = loadJournal(file, true); const previous = records.at(-1)?.recordSha256 ?? null;
  const record = journalRecord(recordBase, previous); let descriptor;
  try {
    descriptor = fs.openSync(outputPath(file), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND
      | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC, 0o600);
    const metadata = fs.fstatSync(descriptor);
    check(metadata.isFile() && metadata.nlink === 1 && metadata.uid === process.getuid()
      && (metadata.mode & 0o777) === 0o600, 'iam_journal_invalid');
    fs.writeSync(descriptor, `${JSON.stringify(record)}\n`); fs.fsyncSync(descriptor);
  } catch (error) { if (trusted.has(error)) throw error; fail('iam_journal_write_failed'); }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  return record;
}

function acquireExecutionLock(journalFile) {
  const file = `${outputPath(journalFile)}.lock`; let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC, 0o600);
    const metadata = fs.fstatSync(descriptor);
    check(metadata.isFile() && metadata.nlink === 1 && metadata.uid === process.getuid()
      && (metadata.mode & 0o777) === 0o600, 'iam_execution_lock_invalid');
    fs.writeSync(descriptor, '{"schemaVersion":1,"kind":"sit-google-temp-iam-execution-lock"}\n');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (trusted.has(error)) throw error;
    fail('iam_execution_locked');
  }
  return () => {
    try { fs.closeSync(descriptor); fs.unlinkSync(file); }
    catch { fail('iam_execution_lock_release_failed'); }
  };
}

function recordBase({ binding, operation, phase, plan, principalSha256, readback }) {
  return { schemaVersion: 1, runId: binding.runId, projectId: binding.projectId, operation, phase,
    bindingSha256: digest(binding), principalSha256, roles: [...STAGING_GOOGLE_IAM_ROLES], addedRoles: [...plan.addedRoles],
    preexistingRoles: [...plan.preexistingRoles], baselinePolicySha256: plan.baselinePolicySha256,
    targetPolicySha256: plan.targetPolicySha256, baselineEtagSha256: plan.baselineEtagSha256,
    readbackPolicySha256: readback ? semanticPolicyDigest(readback) : null,
    readbackEtagSha256: readback ? sha256(readback.etag) : null, at: new Date().toISOString() };
}

function grantEvidence(records, binding, principalSha256) {
  const matching = records.filter((record) => record.runId === binding.runId && record.operation === 'grant');
  check(matching.length > 0 && matching.every((record) => record.principalSha256 === principalSha256
    && record.bindingSha256 === digest(binding)),
    'iam_grant_journal_missing');
  const terminal = matching.at(-1);
  check(['applied', 'no_mutation'].includes(terminal.phase), 'iam_grant_outcome_unresolved');
  return terminal;
}

function result(operation, status, binding, principalSha256, plan, readback = null) {
  return Object.freeze({ status, operation, projectId: binding.projectId, runId: binding.runId,
    principalSha256, roles: [...STAGING_GOOGLE_IAM_ROLES], addedRoles: [...plan.addedRoles],
    preexistingRoles: [...plan.preexistingRoles], baselinePolicySha256: plan.baselinePolicySha256,
    targetPolicySha256: plan.targetPolicySha256,
    ...(readback ? { readbackPolicySha256: semanticPolicyDigest(readback) } : {}) });
}

async function runStagingGoogleTempIamLocked({ binding, serviceCredential, adminCredential, journalFile,
  operation, execute = false, transport, now = Date.now } = {}) {
  check(['grant', 'revoke'].includes(operation) && typeof execute === 'boolean' && typeof now === 'function'
    && plain(serviceCredential) && serviceCredential.projectId === STAGING_GOOGLE_IAM_PROJECT
    && plain(adminCredential) && boundedText(adminCredential.authorization, 20000)
    && plain(transport) && typeof transport.getPolicy === 'function' && typeof transport.setPolicy === 'function',
  'iam_execution_binding_invalid');
  validateBinding(binding, now, execute && operation === 'grant'); outputPath(journalFile);
  check(sha256(serviceCredential.clientEmail) === binding.serviceAccountEmailSha256,
    'iam_service_account_binding_invalid');
  const principal = `serviceAccount:${serviceCredential.clientEmail}`;
  const principalSha256 = sha256(principal);
  const records = loadJournal(journalFile, true);
  check(!records.some((record) => record.runId === binding.runId && record.operation === operation),
    'iam_operation_already_started');
  let policy;
  try { policy = validatePolicy(await transport.getPolicy()); }
  catch (error) { if (trusted.has(error)) throw error; fail('iam_policy_read_failed'); }
  let plan;
  if (operation === 'grant') plan = planTemporaryIamGrant(policy, principal);
  else {
    const grant = grantEvidence(records, binding, principalSha256);
    plan = planTemporaryIamRevoke(policy, principal, grant.addedRoles);
  }
  if (!execute) return result(operation, 'preflight-passed-no-mutation', binding, principalSha256, plan);
  if (plan.addedRoles.length === 0) {
    appendJournal(journalFile, recordBase({ binding, operation, phase: 'no_mutation', plan, principalSha256 }));
    return result(operation, 'no-mutation-required', binding, principalSha256, plan);
  }
  appendJournal(journalFile, recordBase({ binding, operation, phase: 'intent', plan, principalSha256 }));
  let setResult;
  try { setResult = await transport.setPolicy(plan.target); }
  catch {
    appendJournal(journalFile, recordBase({ binding, operation, phase: 'outcome_unknown', plan, principalSha256 }));
    fail('iam_policy_write_outcome_unknown', 'unknown');
  }
  if (!plain(setResult) || setResult.accepted !== true) {
    appendJournal(journalFile, recordBase({ binding, operation, phase: setResult?.accepted === false ? 'rejected'
      : 'outcome_unknown', plan, principalSha256 }));
    fail(setResult?.accepted === false ? 'iam_policy_write_rejected' : 'iam_policy_write_outcome_unknown',
      setResult?.accepted === false ? 'rejected' : 'unknown');
  }
  let readback;
  try { readback = validatePolicy(await transport.getPolicy()); }
  catch {
    appendJournal(journalFile, recordBase({ binding, operation, phase: 'outcome_unknown', plan, principalSha256 }));
    fail('iam_policy_readback_unknown', 'unknown');
  }
  if (semanticPolicyDigest(readback) !== plan.targetPolicySha256) {
    appendJournal(journalFile, recordBase({ binding, operation, phase: 'outcome_unknown', plan, principalSha256,
      readback }));
    fail('iam_policy_readback_mismatch', 'unknown');
  }
  appendJournal(journalFile, recordBase({ binding, operation, phase: 'applied', plan, principalSha256, readback }));
  return result(operation, 'applied-and-read-back', binding, principalSha256, plan, readback);
}

export async function runStagingGoogleTempIam(values = {}) {
  if (values.execute === true) {
    const now = values.now ?? Date.now;
    check(typeof now === 'function' && ['grant', 'revoke'].includes(values.operation), 'iam_execution_binding_invalid');
    validateBinding(values.binding, now, values.operation === 'grant');
  }
  const release = values.execute === true ? acquireExecutionLock(values.journalFile) : null;
  if (!release) return runStagingGoogleTempIamLocked(values);
  let released = false;
  const finish = () => { if (!released) { release(); released = true; } };
  try { const value = await runStagingGoogleTempIamLocked(values); finish(); return value; }
  catch (error) { try { finish(); } catch { /* Preserve the primary classified failure. */ } throw error; }
}

export function createStagingGoogleTempIamTransport({ authorization, fetchImpl = globalThis.fetch,
  timeoutMs = 10000 } = {}) {
  check(boundedText(authorization, 20000) && typeof fetchImpl === 'function'
    && Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000, 'iam_transport_binding_invalid');
  const request = async ({ action, body, mutation }) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${endpoint}:${action}`, { method: 'POST', headers: { accept: 'application/json',
        authorization, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!response || !Number.isInteger(response.status) || typeof response.text !== 'function') throw new Error();
      const text = await response.text(); if (text.length > 1024 * 1024) throw new Error();
      if ([400, 401, 403, 404, 409, 412].includes(response.status) && mutation) return { accepted: false };
      if (response.status < 200 || response.status >= 300) throw new Error();
      if (mutation) return { accepted: true };
      return parseJson(text, 'iam_policy_response_invalid');
    } catch (error) {
      if (trusted.has(error)) throw error;
      fail(mutation ? 'iam_policy_write_outcome_unknown' : 'iam_policy_transport_failed',
        mutation ? 'unknown' : 'transport');
    } finally { clearTimeout(timer); }
  };
  return Object.freeze({
    getPolicy: () => request({ action: 'getIamPolicy', body: { options: { requestedPolicyVersion: 3 } }, mutation: false }),
    setPolicy: (policy) => request({ action: 'setIamPolicy', body: { policy }, mutation: true }),
  });
}

function parseArguments(argv) {
  const valued = new Set(['--binding', '--journal', '--operation', '--service-credential-file',
    '--service-credential-fd', '--admin-credential-file', '--admin-credential-fd']);
  const result = { execute: false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === '--execute') { check(result.execute === false, 'iam_argument_invalid'); result.execute = true; continue; }
    check(valued.has(name) && !Object.hasOwn(result, name.slice(2)), 'iam_argument_invalid');
    const value = argv[++index]; check(boundedText(value) && !value.startsWith('--'), 'iam_argument_invalid');
    result[name.slice(2)] = name.endsWith('-fd') ? Number(value) : value;
  }
  for (const required of ['binding', 'journal', 'operation']) check(boundedText(result[required]), 'iam_argument_invalid');
  check(['grant', 'revoke'].includes(result.operation), 'iam_argument_invalid'); return result;
}
const source = (args, prefix) => ({ ...(args[`${prefix}-file`] ? { file: args[`${prefix}-file`] } : {}),
  ...(args[`${prefix}-fd`] !== undefined ? { fd: args[`${prefix}-fd`] } : {}) });

export async function runStagingGoogleTempIamCli(argv, dependencies = {}) {
  const args = parseArguments(argv);
  const binding = parseJson(readPrivateInput({ file: args.binding, code: 'iam_binding_file_invalid' }),
    'iam_binding_file_invalid');
  const serviceCredential = parseServiceCredential(readPrivateInput({ ...source(args, 'service-credential'),
    code: 'iam_service_credential_source_invalid' }), STAGING_GOOGLE_IAM_PROJECT);
  const adminCredential = parseFirebaseUserCredential(readPrivateInput({ ...source(args, 'admin-credential'),
    code: 'iam_admin_credential_source_invalid' }), STAGING_GOOGLE_IAM_ACCOUNT_SHA256,
  dependencies.now ?? Date.now);
  check(Object.keys(dependencies).every((key) => ['fetchImpl', 'timeoutMs', 'now'].includes(key)),
    'iam_cli_dependency_invalid');
  const transport = createStagingGoogleTempIamTransport({ authorization: adminCredential.authorization,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.timeoutMs !== undefined ? { timeoutMs: dependencies.timeoutMs } : {}) });
  return runStagingGoogleTempIam({ binding, serviceCredential, adminCredential, journalFile: args.journal,
    operation: args.operation, execute: args.execute, transport, now: dependencies.now ?? Date.now });
}

async function main() {
  try { process.stdout.write(`${JSON.stringify(await runStagingGoogleTempIamCli(process.argv.slice(2)))}\n`); }
  catch (error) {
    process.stderr.write(`Staging Google temporary IAM failed: ${stagingGoogleTempIamErrorCode(error)}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) await main();
