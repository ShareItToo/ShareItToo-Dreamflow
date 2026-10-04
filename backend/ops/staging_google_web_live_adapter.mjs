#!/usr/bin/env node

// Narrow production transport for staging_google_web_prerequisites.mjs.
// Secrets enter only through a protected absolute file or an inherited regular
// descriptor, remain in memory, and are never included in results or errors.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStagingGoogleWebReadAdapter } from './staging_google_web_read_adapter.mjs';
import { isStagingGoogleWebPrerequisiteError, runStagingGoogleWebPrerequisites,
  STAGING_GOOGLE_WEB_DISPLAY_NAME } from './staging_google_web_prerequisites.mjs';

const TARGET = 'https://staging.shareittoo.com';
const HOST = 'staging.shareittoo.com';
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MAX_SECRET_BYTES = 128 * 1024;
const endpoints = Object.freeze({
  firebase: 'https://firebase.googleapis.com',
  identitytoolkit: 'https://identitytoolkit.googleapis.com',
  apikeys: 'https://apikeys.googleapis.com',
  serviceusage: 'https://serviceusage.googleapis.com',
  cloudresourcemanager: 'https://cloudresourcemanager.googleapis.com',
});
const trusted = new WeakSet();
function fail(code) { const error = new Error(code); trusted.add(error); throw error; }
function check(value, code) { if (!value) fail(code); }
const plain = (value) => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value)
  && Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const allowed = (value, fields) => plain(value) && Object.keys(value).every((key) => fields.includes(key));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const digest = (value) => sha256(JSON.stringify(canonical(value)));
const boundedText = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max;

function readDescriptor(descriptor, maxBytes, code) {
  check(Number.isInteger(descriptor) && descriptor >= 3 && descriptor <= 1024, code);
  const before = fs.fstatSync(descriptor);
  check(before.isFile() && before.size > 1 && before.size <= maxBytes, code);
  const bytes = Buffer.alloc(before.size); let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    check(count > 0, code); offset += count;
  }
  const after = fs.fstatSync(descriptor);
  check(before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, code);
  return bytes.toString('utf8');
}

export function readPrivateInput({ file, fd, maxBytes = MAX_SECRET_BYTES, code = 'private_input_invalid' } = {}) {
  check((file === undefined) !== (fd === undefined), code);
  if (fd !== undefined) return readDescriptor(fd, maxBytes, code);
  check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file, code);
  let descriptor;
  try {
    check(fs.realpathSync(file) === file && file !== root && !file.startsWith(`${root}${path.sep}`), code);
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
    const metadata = fs.fstatSync(descriptor);
    check(metadata.isFile() && metadata.nlink === 1 && metadata.uid === process.getuid()
      && (metadata.mode & 0o777) === 0o600, code);
    return readDescriptor(descriptor, maxBytes, code);
  } catch (error) {
    if (trusted.has(error)) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseJson(bytes, code) {
  try { const value = JSON.parse(bytes); check(plain(value), code); return value; }
  catch (error) { if (trusted.has(error)) throw error; fail(code); }
}

function normalizedEmailSha256(value) {
  check(typeof value === 'string' && value.length <= 320, 'user_account_invalid');
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  check(normalized.length >= 3 && normalized.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(normalized),
    'user_account_invalid');
  return sha256(normalized);
}

export function parseFirebaseUserCredential(bytes, expectedEmailSha256, now = Date.now) {
  const value = parseJson(bytes, 'user_credential_invalid');
  check(/^[a-f0-9]{64}$/u.test(expectedEmailSha256 ?? '')
    && (!Object.hasOwn(value, 'activeAccounts') || (plain(value.activeAccounts)
      && Object.values(value.activeAccounts).every((email) => typeof email === 'string')))
    && (!Object.hasOwn(value, 'additionalAccounts') || Array.isArray(value.additionalAccounts)), 'user_account_inventory_invalid');
  const hasUser = Object.hasOwn(value, 'user'); const hasTokens = Object.hasOwn(value, 'tokens');
  check(hasUser === hasTokens, 'user_account_inventory_invalid');
  const accounts = [...(hasUser ? [{ user: value.user, tokens: value.tokens }] : []), ...(value.additionalAccounts ?? [])];
  check(accounts.length > 0 && accounts.length <= 100, 'user_account_inventory_invalid');
  const seen = new Set(); const matches = [];
  for (const account of accounts) {
    check(exact(account, ['user', 'tokens']) && plain(account.user) && plain(account.tokens), 'user_account_invalid');
    const emailSha256 = normalizedEmailSha256(account.user.email);
    check(!seen.has(emailSha256), 'user_account_duplicate'); seen.add(emailSha256);
    if (emailSha256 === expectedEmailSha256) matches.push(account);
  }
  check(matches.length === 1, 'user_account_not_found');
  const tokens = matches[0].tokens;
  check(boundedText(tokens.access_token, 16384) && Number.isFinite(tokens.expires_at)
    && /^[\x21-\x7e]+$/u.test(tokens.access_token) && tokens.expires_at > now() + 120_000, 'user_access_token_expired');
  return Object.freeze({ authorization: `Bearer ${tokens.access_token}` });
}

export function parseServiceCredential(bytes, projectId) {
  const value = parseJson(bytes, 'service_credential_invalid');
  check(value.type === 'service_account' && value.project_id === projectId
    && boundedText(value.client_email) && value.client_email.endsWith('.iam.gserviceaccount.com')
    && boundedText(value.private_key, 65536) && value.private_key.includes('BEGIN PRIVATE KEY')
    && value.token_uri === 'https://oauth2.googleapis.com/token', 'service_credential_invalid');
  try { createPrivateKey(value.private_key); } catch { fail('service_credential_invalid'); }
  return Object.freeze({ projectId, clientEmail: value.client_email, privateKey: value.private_key, tokenUri: value.token_uri });
}

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function createServiceAuthorizer({ credential, request, now = Date.now }) {
  let cached; let pending;
  return async () => {
    if (cached && cached.expiresAt > now() + 120_000) return cached.authorization;
    if (!pending) pending = (async () => {
      const issued = Math.floor(now() / 1000);
      const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const claims = base64url(JSON.stringify({ iss: credential.clientEmail,
        scope: 'https://www.googleapis.com/auth/cloud-platform', aud: credential.tokenUri, iat: issued, exp: issued + 3600 }));
      const assertion = `${header}.${claims}.${sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), credential.privateKey).toString('base64url')}`;
      const response = await request({ method: 'POST', absoluteUrl: credential.tokenUri,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        authorization: null, mutation: false });
      check(allowed(response, ['access_token', 'expires_in', 'token_type', 'scope']) && response.token_type === 'Bearer'
      && boundedText(response.access_token, 16384) && /^[\x21-\x7e]+$/u.test(response.access_token)
      && Number.isFinite(response.expires_in)
        && response.expires_in >= 120 && response.expires_in <= 7200, 'service_token_invalid');
      cached = { authorization: `Bearer ${response.access_token}`, expiresAt: now() + response.expires_in * 1000 };
      return cached.authorization;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

function requestClient({ fetchImpl, timeoutMs }) {
  check(typeof fetchImpl === 'function' && Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000,
    'transport_binding_invalid');
  return async ({ method, service, resource, query = {}, headers = {}, body, authorization, absoluteUrl }) => {
    const base = absoluteUrl ?? endpoints[service];
    check(boundedText(base) && (absoluteUrl || Object.hasOwn(endpoints, service))
      && ['GET', 'POST', 'PATCH'].includes(method) && boundedText(resource ?? '/', 8192), 'request_invalid');
    const url = new URL(resource ?? '', base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method, headers: { accept: 'application/json', ...headers,
        ...(authorization ? { authorization } : {}) }, body, signal: controller.signal });
      check(response && Number.isInteger(response.status) && typeof response.text === 'function', 'transport_response_invalid');
      const text = await response.text();
      check(text.length <= 1024 * 1024 && response.status >= 200 && response.status < 300, 'transport_response_invalid');
      const value = text.length ? JSON.parse(text) : {};
      check(plain(value), 'transport_response_invalid');
      return value;
    } catch (error) {
      if (trusted.has(error)) throw error;
      fail('live_transport_failed');
    } finally { clearTimeout(timer); }
  };
}

function defaultRuntimeReader(projectId) {
  const probe = "const fs=require('node:fs');const has=(n)=>Object.prototype.hasOwnProperty.call(process.env,n);"
    + "let s;try{const x=fs.lstatSync('/run/secrets/firebase-service-account.json');s={regular:x.isFile(),symlink:x.isSymbolicLink(),nonempty:x.size>0}}catch{s={regular:false,symlink:false,nonempty:false}};"
    + "process.stdout.write(JSON.stringify({projectId:process.env.FIREBASE_PROJECT_ID??null,authEnabled:process.env.FIREBASE_AUTH_ENABLED??null,emulator:has('FIREBASE_AUTH_EMULATOR_HOST')?process.env.FIREBASE_AUTH_EMULATOR_HOST:null,serviceCredential:s,appCommit:process.env.APP_COMMIT??null}))";
  let value;
  try {
    value = JSON.parse(execFileSync('docker', ['exec', 'shareittoo-staging-api', 'node', '-e', probe],
      { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { fail('runtime_read_failed'); }
  check(exact(value, ['projectId', 'authEnabled', 'emulator', 'serviceCredential', 'appCommit'])
    && value.projectId === projectId && value.authEnabled === 'true' && value.emulator === null
    && exact(value.serviceCredential, ['regular', 'symlink', 'nonempty'])
    && value.serviceCredential.regular === true && value.serviceCredential.symlink === false
    && value.serviceCredential.nonempty === true && /^[a-f0-9]{40}$/u.test(value.appCommit), 'runtime_binding_invalid');
  return { backendProjectId: projectId, authEnabled: true, emulatorEnabled: false, runtimeDigest: digest(value) };
}

function verifyLease({ bytes, publicKeyBytes, binding, revision, now }) {
  const assertion = parseJson(bytes, 'domain_lease_invalid');
  check(exact(assertion, ['schemaVersion', 'kind', 'projectId', 'baselineRevision', 'baselineDigest', 'host',
    'operation', 'leaseId', 'issuedAt', 'expiresAt', 'allWritersExcluded', 'signature']), 'domain_lease_invalid');
  const { signature, ...unsigned } = assertion;
  check(assertion.schemaVersion === 1 && assertion.kind === 'sit-google-web-domain-all-writer-exclusion'
    && assertion.projectId === binding.projectId && assertion.baselineRevision === revision
    && assertion.baselineDigest === binding.baselineDigest && assertion.host === HOST
    && assertion.operation === 'authorizedDomains.append' && assertion.allWritersExcluded === true
    && boundedText(assertion.leaseId, 200) && /^[A-Za-z0-9_-]+$/u.test(assertion.leaseId)
    && typeof assertion.issuedAt === 'string' && typeof assertion.expiresAt === 'string'
    && /^[A-Za-z0-9_-]{80,120}$/u.test(signature), 'domain_lease_invalid');
  const issued = Date.parse(assertion.issuedAt); const expires = Date.parse(assertion.expiresAt); const current = now();
  check(Number.isFinite(issued) && Number.isFinite(expires) && issued <= current + 30_000
    && issued >= current - 300_000 && expires > current && expires <= issued + 600_000, 'domain_lease_expired');
  let publicKey;
  try { publicKey = createPublicKey(publicKeyBytes); } catch { fail('domain_lease_public_key_invalid'); }
  const fingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' }));
  check(fingerprint === binding.domainLeaseVerifier.publicKeySha256
    && verify(null, Buffer.from(JSON.stringify(canonical(unsigned))), publicKey, Buffer.from(signature, 'base64url')),
  'domain_lease_signature_invalid');
  return Object.freeze({ kind: 'exclusive', allWritersExcluded: true, projectId: binding.projectId,
    leaseId: assertion.leaseId, expiresAt: assertion.expiresAt });
}

export function createStagingGoogleWebLiveAdapter({ binding, serviceCredential, userCredential,
  leaseBytes, leasePublicKeyBytes, fetchImpl = globalThis.fetch, runtimeReader = defaultRuntimeReader,
  now = Date.now, delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 10000, operationPolls = 4, operationPollDelayMs = 1000 } = {}) {
  check(plain(binding) && binding.projectId === serviceCredential?.projectId && binding.origin === TARGET
    && binding.displayName === STAGING_GOOGLE_WEB_DISPLAY_NAME && typeof runtimeReader === 'function'
    && typeof now === 'function' && typeof delay === 'function' && Number.isInteger(operationPolls)
    && operationPolls >= 1 && operationPolls <= 10 && Number.isInteger(operationPollDelayMs)
    && operationPollDelayMs >= 0 && operationPollDelayMs <= 5000, 'live_adapter_binding_invalid');
  const request = requestClient({ fetchImpl, timeoutMs });
  const serviceAuthorization = createServiceAuthorizer({ credential: serviceCredential, request, now });
  const serviceRequest = async (details) => request({ ...details, authorization: await serviceAuthorization() });
  const userAuthorization = userCredential?.authorization;
  const readAdapter = createStagingGoogleWebReadAdapter({ projectId: binding.projectId,
    projectNumber: binding.projectNumber, apiKey: binding.apiKey, origin: binding.origin,
    timeoutMs, transport: ({ method, service, resource, query, signal: _signal }) => serviceRequest({ method, service, resource, query }) });
  let acquiredLease;
  const pagedRaw = async (resource, field) => {
    const values = []; const tokens = new Set(); let pageToken = '';
    for (let page = 0; page < 100; page++) {
      const response = await serviceRequest({ method: 'GET', service: 'firebase', resource,
        query: { showDeleted: true, pageSize: 100, ...(pageToken ? { pageToken } : {}) } });
      check(Object.keys(response).every((key) => [field, 'nextPageToken'].includes(key))
        && (!Object.hasOwn(response, field) || Array.isArray(response[field])), 'other_app_inventory_invalid');
      values.push(...(response[field] ?? [])); check(values.length < 1000, 'other_app_inventory_invalid');
      pageToken = response.nextPageToken ?? ''; check(typeof pageToken === 'string', 'other_app_inventory_invalid');
      if (!pageToken) return values;
      check(!tokens.has(pageToken), 'other_app_inventory_invalid'); tokens.add(pageToken);
    }
    fail('other_app_inventory_invalid');
  };
  const providerRead = async () => {
    const value = await serviceRequest({ method: 'GET', service: 'identitytoolkit',
      resource: `/admin/v2/projects/${binding.projectId}/defaultSupportedIdpConfigs/google.com` });
    check(value.name === `projects/${binding.projectNumber}/defaultSupportedIdpConfigs/google.com`
      && value.enabled === true, 'google_provider_not_ready');
    return { googleEnabled: true, providerConfigDigest: digest(value) };
  };
  const rawConfig = async () => {
    const value = await serviceRequest({ method: 'GET', service: 'identitytoolkit',
      resource: `/admin/v2/projects/${binding.projectId}/config` });
    check(value.name === `projects/${binding.projectNumber}/config` && Array.isArray(value.authorizedDomains), 'auth_config_invalid');
    return value;
  };
  const otherApps = async () => {
    const [androidApps, iosApps] = await Promise.all([
      pagedRaw(`/v1beta1/projects/${binding.projectNumber}/androidApps`, 'apps'),
      pagedRaw(`/v1beta1/projects/${binding.projectNumber}/iosApps`, 'apps'),
    ]);
    return digest({ androidApps, iosApps });
  };
  const safe = (fn) => async (...args) => {
    try { return await fn(...args); }
    catch (error) { if (trusted.has(error)) throw error; fail('live_adapter_operation_failed'); }
  };
  return Object.freeze({
    readSnapshot: safe(async () => {
      // This first read verifies the exact project ID/number pair with Resource
      // Manager before any numeric Identity Toolkit resource is accepted.
      const project = await readAdapter.readProjectConfig();
      const [apps, services, key, provider, config, otherAppsDigest, runtime] = await Promise.all([
        readAdapter.readWebAppsInventory(), readAdapter.readRequiredAuthServices(), readAdapter.readApiKeyInventory(),
        providerRead(), rawConfig(), otherApps(), Promise.resolve(runtimeReader(binding.projectId)),
      ]);
      check(services.services.every((service) => service.state === 'ENABLED')
        && key.apiKey.webCompatible === true && runtime.backendProjectId === binding.projectId
        && runtime.authEnabled === true && runtime.emulatorEnabled === false, 'snapshot_prerequisite_invalid');
      return { complete: true, projectId: binding.projectId, projectNumber: binding.projectNumber,
        backendProjectId: runtime.backendProjectId, authEnabled: true, emulatorEnabled: false,
        googleEnabled: provider.googleEnabled, webApps: apps.webApps, webAppsInventory: apps.webAppsInventory,
        apiKey: key.apiKey, keyInventoryDigest: key.keyInventoryDigest, authorizedDomains: project.authorizedDomains,
        authConfigDigest: project.authConfigDigest, providerConfigDigest: provider.providerConfigDigest,
        otherAppsDigest, runtimeDigest: runtime.runtimeDigest, revision: digest(config) };
    }),
    createWebApp: safe(async (value) => {
      check(exact(value, ['projectId', 'apiKeyId', 'displayName']) && value.projectId === binding.projectId
        && value.apiKeyId === binding.apiKey.apiKeyId && value.displayName === STAGING_GOOGLE_WEB_DISPLAY_NAME
        && boundedText(userAuthorization, 20000), 'create_binding_invalid');
      const response = await request({ method: 'POST', service: 'firebase',
        resource: `/v1beta1/projects/${binding.projectId}/webApps`, authorization: userAuthorization,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: value.displayName, apiKeyId: value.apiKeyId }) });
      check(allowed(response, ['name', 'metadata', 'done', 'error', 'response']) && boundedText(response.name), 'create_response_invalid');
      return { name: response.name };
    }),
    readOperation: safe(async (value) => {
      check(exact(value, ['name', 'projectId']) && value.projectId === binding.projectId
        && /^operations\/[A-Za-z0-9_-]{1,200}$/u.test(value.name), 'operation_binding_invalid');
      for (let index = 0; index < operationPolls; index++) {
        const response = await serviceRequest({ method: 'GET', service: 'firebase', resource: `/v1beta1/${value.name}` });
        check(response.name === value.name && (response.done === undefined || typeof response.done === 'boolean'), 'operation_response_invalid');
        if (response.error) return { name: value.name, done: true, appId: '', failed: true };
        if (response.done === true) {
          const appId = response.response?.appId;
          check(boundedText(appId) && response.response.projectId === binding.projectId, 'operation_response_invalid');
          return { name: value.name, done: true, appId, failed: false };
        }
        if (index + 1 < operationPolls) await delay(operationPollDelayMs);
      }
      return { name: value.name, done: false, appId: '', failed: false };
    }),
    readWebApp: readAdapter.readWebApp,
    readSdkConfig: readAdapter.readSdkConfig,
    acquireDomainGuard: safe(async (value) => {
      check(exact(value, ['projectId', 'revision']) && value.projectId === binding.projectId
        && boundedText(value.revision, 256) && typeof leaseBytes === 'string' && typeof leasePublicKeyBytes === 'string',
      'domain_lease_missing');
      acquiredLease = verifyLease({ bytes: leaseBytes, publicKeyBytes: leasePublicKeyBytes,
        binding, revision: value.revision, now });
      return acquiredLease;
    }),
    patchAuthorizedDomains: safe(async (value) => {
      check(exact(value, ['projectId', 'updateMask', 'authorizedDomains', 'guard'])
        && value.projectId === binding.projectId && value.updateMask === 'authorizedDomains'
        && Array.isArray(value.authorizedDomains) && value.authorizedDomains.includes(HOST)
        && acquiredLease && digest(value.guard) === digest(acquiredLease)
        && Date.parse(acquiredLease.expiresAt) > now(), 'domain_patch_binding_invalid');
      await serviceRequest({ method: 'PATCH', service: 'identitytoolkit',
        resource: `/admin/v2/projects/${binding.projectId}/config`, query: { updateMask: 'authorizedDomains' },
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `projects/${binding.projectId}/config`, authorizedDomains: value.authorizedDomains }) });
    }),
  });
}

function parseArguments(argv) {
  const allowed = new Set(['--binding', '--journal', '--config', '--service-credential-file', '--service-credential-fd',
    '--user-credential-file', '--user-credential-fd', '--domain-lease-file', '--domain-lease-fd',
    '--domain-lease-public-key-file', '--domain-lease-public-key-fd']);
  const result = { execute: false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === '--execute') { check(result.execute === false, 'argument_invalid'); result.execute = true; continue; }
    check(allowed.has(name) && !Object.hasOwn(result, name.slice(2)), 'argument_invalid');
    const value = argv[++index]; check(boundedText(value) && !value.startsWith('--'), 'argument_invalid');
    result[name.slice(2)] = name.endsWith('-fd') ? Number(value) : value;
  }
  for (const required of ['binding', 'journal', 'config']) check(boundedText(result[required]), 'argument_invalid');
  return result;
}

const source = (args, prefix) => ({ ...(args[`${prefix}-file`] ? { file: args[`${prefix}-file`] } : {}),
  ...(args[`${prefix}-fd`] !== undefined ? { fd: args[`${prefix}-fd`] } : {}) });

export async function runStagingGoogleWebLiveCli(argv, dependencies = {}) {
  const args = parseArguments(argv);
  const binding = parseJson(readPrivateInput({ file: args.binding, code: 'binding_file_invalid' }), 'binding_file_invalid');
  const serviceCredential = parseServiceCredential(readPrivateInput({ ...source(args, 'service-credential'),
    code: 'service_credential_source_invalid' }), binding.projectId);
  let userCredential; let leaseBytes; let leasePublicKeyBytes;
  if (args.execute) {
    check(binding.gate?.decision === 'A PASS', 'accepted_gate_required');
    userCredential = parseFirebaseUserCredential(readPrivateInput({ ...source(args, 'user-credential'),
      code: 'user_credential_source_invalid' }), binding.firebaseAccountEmailSha256, dependencies.now ?? Date.now);
    leaseBytes = readPrivateInput({ ...source(args, 'domain-lease'), code: 'domain_lease_source_invalid' });
    leasePublicKeyBytes = readPrivateInput({ ...source(args, 'domain-lease-public-key'),
      code: 'domain_lease_public_key_source_invalid' });
  }
  const { fetchImpl, runtimeReader, now, delay, timeoutMs, operationPolls, operationPollDelayMs } = dependencies;
  check(Object.keys(dependencies).every((key) => ['fetchImpl', 'runtimeReader', 'now', 'delay', 'timeoutMs',
    'operationPolls', 'operationPollDelayMs'].includes(key)), 'cli_dependency_invalid');
  const adapter = createStagingGoogleWebLiveAdapter({ binding, serviceCredential, userCredential, leaseBytes,
    leasePublicKeyBytes, ...(fetchImpl ? { fetchImpl } : {}), ...(runtimeReader ? { runtimeReader } : {}),
    ...(now !== undefined ? { now } : {}), ...(delay !== undefined ? { delay } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}), ...(operationPolls !== undefined ? { operationPolls } : {}),
    ...(operationPollDelayMs !== undefined ? { operationPollDelayMs } : {}) });
  return runStagingGoogleWebPrerequisites({ binding, adapter, journalFile: args.journal,
    configFile: args.config, execute: args.execute, now: now ?? Date.now });
}

async function main() {
  try {
    const result = await runStagingGoogleWebLiveCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = stagingGoogleWebLiveCliErrorCode(error);
    process.stderr.write(`Staging Google Web prerequisite failed: ${code}.\n`); process.exitCode = 1;
  }
}

export function stagingGoogleWebLiveCliErrorCode(error) {
  return trusted.has(error) || isStagingGoogleWebPrerequisiteError(error)
    ? error.message : 'google_web_prerequisite_failed';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) await main();
