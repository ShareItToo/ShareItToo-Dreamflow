#!/usr/bin/env node

// Read-only Firebase + exact Docker runtime collector for the V3 assembler.
// Service Usage states require a current protected Console readback; no
// Service Usage network reads are permitted. The only POST is OAuth JWT.
// Required: --service-usage-console-file ABS_OWNER_0600_CANONICAL_JSON
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseServiceCredential, readPrivateInput } from './staging_google_web_live_adapter.mjs';

const PROJECT_ID = 'shareittoo-staging';
const PROJECT_NUMBER = '214007794438';
const WEB_APP_ID = '1:214007794438:web:aefec13f9f030f46eaac87';
const ORIGIN = 'https://staging.shareittoo.com';
const APPROVED_OPERATOR_EMAIL_SHA256 = 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776';
const MAX_CONSOLE_PROOF_AGE_MS = 2 * 60 * 60 * 1000;
const SERVICE_USAGE_READBACKS = Object.freeze([
  Object.freeze({ serviceName: 'identitytoolkit.googleapis.com', state: 'ENABLED',
    consoleUrl: 'https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com/metrics?project=shareittoo-staging' }),
  Object.freeze({ serviceName: 'securetoken.googleapis.com', state: 'ENABLED',
    consoleUrl: 'https://console.cloud.google.com/apis/api/securetoken.googleapis.com/metrics?project=shareittoo-staging' }),
]);
const deny = () => { throw new Error('google_web_v3_producer_denied'); };
const plain = value => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value)
  && Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const hash = value => createHash('sha256').update(value).digest('hex');
const check = value => { if (!value) deny(); };

function parseArgs(argv) {
  const allowed = new Set(['--output-dir', '--service-account-file', '--runtime-container-id',
    '--source-commit', '--image-digest', '--service-usage-console-file']);
  if (!Array.isArray(argv) || argv.length !== allowed.size * 2) deny();
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    check(allowed.has(key) && !Object.hasOwn(result, key.slice(2)) && typeof value === 'string' && value.length > 0);
    result[key.slice(2)] = value;
  }
  check(Object.keys(result).sort().join('|') === [...allowed].map(key => key.slice(2)).sort().join('|'));
  check(/^[a-f0-9]{40}$/u.test(result['source-commit'])
    && /^sha256:[a-f0-9]{64}$/u.test(result['image-digest'])
    && /^[a-f0-9]{64}$/u.test(result['runtime-container-id']));
  return result;
}

function assertOutputDirectory(directory) {
  const stat = fs.lstatSync(directory);
  check(fs.realpathSync(directory) === directory && stat.isDirectory() && !stat.isSymbolicLink()
    && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700);
}

function readServiceUsageConsoleProof(text, currentTime) {
  let value;
  try { value = JSON.parse(text); } catch { deny(); }
  check(exact(value, ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'readAtUtc',
    'validUntilUtc', 'projectId', 'projectNumber', 'operatorAccountEmailSha256', 'services'])
    && JSON.stringify(value) === text
    && value.schemaVersion === 1 && value.kind === 'sit-google-web-service-usage-console-readback'
    && value.evidenceClass === 'direct-google-cloud-console-service-usage-readback'
    && value.syntheticFixture === false && value.projectId === PROJECT_ID
    && value.projectNumber === PROJECT_NUMBER
    && value.operatorAccountEmailSha256 === APPROVED_OPERATOR_EMAIL_SHA256);
  const timestamp = valueText => {
    check(typeof valueText === 'string');
    const ms = Date.parse(valueText);
    check(Number.isFinite(ms) && new Date(ms).toISOString() === valueText);
    return ms;
  };
  const readAt = timestamp(value.readAtUtc);
  const validUntil = timestamp(value.validUntilUtc);
  check(validUntil > readAt && validUntil - readAt <= MAX_CONSOLE_PROOF_AGE_MS
    && currentTime >= readAt && currentTime < validUntil);
  check(Array.isArray(value.services) && value.services.length === SERVICE_USAGE_READBACKS.length);
  for (let index = 0; index < SERVICE_USAGE_READBACKS.length; index++) {
    const actual = value.services[index]; const expected = SERVICE_USAGE_READBACKS[index];
    check(exact(actual, ['serviceName', 'state', 'consoleUrl'])
      && actual.serviceName === expected.serviceName && actual.state === expected.state
      && actual.consoleUrl === expected.consoleUrl);
  }
  return Object.freeze({
    readAtUtc: value.readAtUtc,
    validUntilUtc: value.validUntilUtc,
    sha256: hash(text),
  });
}

function writeInputs(directory, configuration, serviceReadback, serviceUsageBinding) {
  assertOutputDirectory(directory);
  const records = [['configuration.json', configuration], ['service-readback.json', serviceReadback],
    ['service-usage-binding.json', serviceUsageBinding]];
  const opened = [];
  try {
    for (const [name, value] of records) {
      const file = path.join(directory, name);
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC, 0o600);
      opened.push({ fd, file });
      const text = JSON.stringify(value);
      fs.writeFileSync(fd, text, { encoding: 'utf8' });
      fs.fsyncSync(fd);
      const stat = fs.fstatSync(fd);
      check(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600);
      const readback = fs.lstatSync(file);
      check(readback.isFile() && !readback.isSymbolicLink() && readback.dev === stat.dev && readback.ino === stat.ino
        && readback.nlink === 1 && readback.uid === process.getuid() && (readback.mode & 0o777) === 0o600);
    }
    const dirFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_CLOEXEC);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    return records.map(([name, value]) => ({ path: path.join(directory, name), sha256: hash(JSON.stringify(value)) }));
  } catch {
    for (const { fd, file } of opened) {
      try {
        const openedStat = fs.fstatSync(fd); const current = fs.lstatSync(file);
        if (current.isFile() && !current.isSymbolicLink() && current.dev === openedStat.dev && current.ino === openedStat.ino) {
          fs.unlinkSync(file);
        }
      } catch {}
    }
    deny();
  } finally {
    for (const { fd } of opened) { try { fs.closeSync(fd); } catch {} }
  }
}

export function requestClient({ fetchImpl, timeoutMs = 12000 }) {
  check(typeof fetchImpl === 'function' && Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000);
  const apiHosts = new Set(['cloudresourcemanager.googleapis.com', 'firebase.googleapis.com',
    'identitytoolkit.googleapis.com']);
  const optionalProviderReads = new Set([
    'https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/apple.com',
    'https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/facebook.com',
  ]);
  const apiPath = /^\/(?:v1\/projects\/shareittoo-staging|v1beta1\/projects\/214007794438\/webApps\/1:214007794438:web:aefec13f9f030f46eaac87(?:\/config)?|admin\/v2\/projects\/shareittoo-staging\/(?:config|defaultSupportedIdpConfigs\/(?:google|apple|facebook)\.com))$/u;
  return async ({ method, url, headers = {}, body }) => {
    const parsed = new URL(url);
    const oauth = parsed.href === 'https://oauth2.googleapis.com/token';
    check(parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && parsed.hash === ''
      && (oauth ? method === 'POST' && parsed.search === '' : method === 'GET' && apiHosts.has(parsed.hostname)
        && parsed.search === '' && apiPath.test(parsed.pathname)));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(parsed, { method, headers, ...(body === undefined ? {} : { body }),
        signal: controller.signal, redirect: 'error' });
      check(response && Number.isInteger(response.status));
      if (response.status === 404 && optionalProviderReads.has(parsed.href)) return { absent: true };
      check(response.status >= 200 && response.status < 300 && typeof response.text === 'function');
      const text = await response.text(); check(text.length <= 1024 * 1024);
      const value = text.length ? JSON.parse(text) : {};
      check(plain(value)); return value;
    } catch { deny(); } finally { clearTimeout(timer); }
  };
}

function makeAuthorizer(credential, request, now = Date.now) {
  let cache; let pending;
  return async () => {
    if (cache && cache.expiresAt > now() + 120000) return cache.token;
    if (!pending) pending = (async () => {
      const issued = Math.floor(now() / 1000);
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const header = encode({ alg: 'RS256', typ: 'JWT' });
      const claims = encode({ iss: credential.clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 });
      const assertion = `${header}.${claims}.${sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), credential.privateKey).toString('base64url')}`;
      const token = await request({ method: 'POST', url: 'https://oauth2.googleapis.com/token',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() });
      check(token.token_type === 'Bearer' && typeof token.access_token === 'string'
        && token.access_token.length > 0 && token.access_token.length <= 16384
        && Number.isFinite(token.expires_in) && token.expires_in >= 120 && token.expires_in <= 7200);
      cache = { token: `Bearer ${token.access_token}`, expiresAt: now() + token.expires_in * 1000 };
      return cache.token;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

function createApiReader({ credential, fetchImpl, now }) {
  const request = requestClient({ fetchImpl });
  const authorize = makeAuthorizer(credential, request, now);
  return async url => request({ method: 'GET', url, headers: { accept: 'application/json', authorization: await authorize() } });
}

function createDockerReader({ execute = execFileSync } = {}) {
  const opts = { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
  return ({ containerId, expectedCommit, expectedImageDigest }) => {
    const format = '{{json .Id}}|{{json .Name}}|{{json .State.Running}}|{{json .State.Paused}}|{{json (index .Config.Labels "com.shareittoo.sit.green")}}|{{json (index .Config.Labels "org.opencontainers.image.revision")}}|{{json .Image}}';
    const inspect = () => execute('docker', ['inspect', containerId, '--format', format], opts).trim().split('|').map(JSON.parse);
    let before; let image; let runtimeEnv; let after;
    try {
      before = inspect();
      check(before.length === 7 && before[0] === containerId && before[1] === '/shareittoo-staging-api'
        && before[2] === true && before[3] === false && before[4] === 'true'
        && before[5] === expectedCommit && before[6].startsWith('sha256:'));
      image = execute('docker', ['image', 'inspect', before[6], '--format', '{{json .Id}}|{{json .RepoDigests}}'], opts)
        .trim().split('|').map(JSON.parse);
      check(image.length === 2 && image[0] === before[6] && Array.isArray(image[1])
        && image[1].includes(`ghcr.io/shareittoo/shareittoo-api@${expectedImageDigest}`));
      const probe = "const fs=require('node:fs');let s;try{const x=fs.lstatSync('/run/secrets/firebase-service-account.json');s={regular:x.isFile(),symlink:x.isSymbolicLink(),nonempty:x.size>0}}catch{s={regular:false,symlink:false,nonempty:false}};process.stdout.write(JSON.stringify({projectId:process.env.FIREBASE_PROJECT_ID??null,authEnabled:process.env.FIREBASE_AUTH_ENABLED??null,emulator:Object.prototype.hasOwnProperty.call(process.env,'FIREBASE_AUTH_EMULATOR_HOST')?process.env.FIREBASE_AUTH_EMULATOR_HOST:null,serviceCredential:s,appCommit:process.env.APP_COMMIT??null}))";
      runtimeEnv = JSON.parse(execute('docker', ['exec', containerId, 'node', '-e', probe], opts));
      after = inspect();
    } catch { deny(); }
    check(JSON.stringify(before) === JSON.stringify(after) && exact(runtimeEnv,
      ['projectId', 'authEnabled', 'emulator', 'serviceCredential', 'appCommit'])
      && runtimeEnv.projectId === PROJECT_ID && runtimeEnv.authEnabled === 'true' && runtimeEnv.emulator === null
      && runtimeEnv.appCommit === expectedCommit && exact(runtimeEnv.serviceCredential, ['regular', 'symlink', 'nonempty'])
      && runtimeEnv.serviceCredential.regular === true && runtimeEnv.serviceCredential.symlink === false
      && runtimeEnv.serviceCredential.nonempty === true);
    return { service: '/shareittoo-staging-api', identity: hash(containerId), environment: 'staging', projectId: PROJECT_ID,
      green: true, running: true, commit: expectedCommit,
      image: `ghcr.io/shareittoo/shareittoo-api@${expectedImageDigest}` };
  };
}

export async function collectGoogleWebV3Inputs({ serviceAccountText, serviceUsageConsoleText,
  runtimeContainerId, sourceCommit, imageDigest, fetchImpl = globalThis.fetch, execute = execFileSync,
  now = () => new Date(), nowMs = Date.now } = {}) {
  try {
    check(/^[a-f0-9]{64}$/u.test(runtimeContainerId ?? '') && /^[a-f0-9]{40}$/u.test(sourceCommit ?? '')
      && /^sha256:[a-f0-9]{64}$/u.test(imageDigest ?? '') && typeof now === 'function' && typeof nowMs === 'function');
    const proofCheckedAt = now();
    check(proofCheckedAt instanceof Date && Number.isFinite(proofCheckedAt.getTime()));
    const serviceUsageProof = readServiceUsageConsoleProof(serviceUsageConsoleText, proofCheckedAt.getTime());
    const credential = parseServiceCredential(serviceAccountText, PROJECT_ID);
    const get = createApiReader({ credential, fetchImpl, now: nowMs });
    const runtime = createDockerReader({ execute })({ containerId: runtimeContainerId,
      expectedCommit: sourceCommit, expectedImageDigest: imageDigest });
    const [project, app, sdk, auth, google, apple, facebook] = await Promise.all([
      get('https://cloudresourcemanager.googleapis.com/v1/projects/shareittoo-staging'),
      get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}`),
      get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}/config`),
      get('https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/config'),
      get('https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/google.com'),
      get('https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/apple.com'),
      get('https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/facebook.com'),
    ]);
    const providerEnabled = (record, provider) => {
      if (exact(record, ['absent']) && record.absent === true) return false;
      check(record.name === `projects/${PROJECT_NUMBER}/defaultSupportedIdpConfigs/${provider}.com`
        && typeof record.enabled === 'boolean');
      return record.enabled;
    };
    const appleProviderEnabled = providerEnabled(apple, 'apple');
    const facebookProviderEnabled = providerEnabled(facebook, 'facebook');
    check(project.projectId === PROJECT_ID && String(project.projectNumber) === PROJECT_NUMBER
      && project.lifecycleState === 'ACTIVE' && app.appId === WEB_APP_ID && app.projectId === PROJECT_ID
      && app.state === 'ACTIVE' && sdk.projectId === PROJECT_ID && String(sdk.projectNumber) === PROJECT_NUMBER
      && sdk.messagingSenderId === PROJECT_NUMBER && sdk.appId === WEB_APP_ID
      && sdk.authDomain === `${PROJECT_ID}.firebaseapp.com` && /^AIza[A-Za-z0-9_-]{35}$/u.test(sdk.apiKey ?? '')
      && auth.name === `projects/${PROJECT_NUMBER}/config` && Array.isArray(auth.authorizedDomains)
      && auth.authorizedDomains.includes('staging.shareittoo.com')
      && google.name === `projects/${PROJECT_NUMBER}/defaultSupportedIdpConfigs/google.com` && google.enabled === true);
    const finalProofCheck = readServiceUsageConsoleProof(serviceUsageConsoleText, now().getTime());
    check(finalProofCheck.sha256 === serviceUsageProof.sha256
      && finalProofCheck.readAtUtc === serviceUsageProof.readAtUtc
      && finalProofCheck.validUntilUtc === serviceUsageProof.validUntilUtc);
    const readAt = now().toISOString();
    const configuration = { projectId: PROJECT_ID, messagingSenderId: PROJECT_NUMBER, appId: WEB_APP_ID,
      apiKey: sdk.apiKey, authDomain: `${PROJECT_ID}.firebaseapp.com`, backendProjectId: PROJECT_ID, authorizedOrigin: ORIGIN };
    const serviceReadback = { schemaVersion: 1, kind: 'sit-google-web-service-account-readback',
      evidenceClass: 'direct-firebase-management-identity-toolkit-and-runtime-readback', syntheticFixture: false,
      readAtUtc: readAt, validUntilUtc: new Date(Date.parse(readAt) + 30 * 60 * 1000).toISOString(),
      projectId: PROJECT_ID, projectState: 'ACTIVE', webAppId: WEB_APP_ID, webAppPresent: true,
      publicWebConfig: configuration, authorizedDomains: [...auth.authorizedDomains].sort(),
      googleProviderEnabled: true, appleProviderEnabled, facebookProviderEnabled,
      firebaseAuthEnabled: true, firebaseEmulatorEnabled: false, runtime };
    const serviceUsageBinding = { schemaVersion: 1, kind: 'sit-google-web-service-usage-binding',
      evidenceClass: 'direct-google-cloud-console-service-usage-binding', syntheticFixture: false,
      projectId: PROJECT_ID, projectNumber: PROJECT_NUMBER,
      readAtUtc: serviceUsageProof.readAtUtc, validUntilUtc: serviceUsageProof.validUntilUtc,
      consoleReadbackSha256: serviceUsageProof.sha256,
      serviceReadbackSha256: hash(JSON.stringify(serviceReadback)) };
    return Object.freeze({ configuration, serviceReadback, serviceUsageBinding });
  } catch { deny(); }
}

export async function runGoogleWebV3InputProducer(argv, dependencies = {}) {
  try {
    check(plain(dependencies) && Object.keys(dependencies).every(key => ['fetchImpl', 'execute', 'now', 'nowMs'].includes(key)));
    const args = parseArgs(argv);
    const result = await collectGoogleWebV3Inputs({
      serviceAccountText: readPrivateInput({ file: args['service-account-file'], maxBytes: 128 * 1024,
        code: 'google_web_v3_producer_denied' }), runtimeContainerId: args['runtime-container-id'],
      serviceUsageConsoleText: readPrivateInput({ file: args['service-usage-console-file'], maxBytes: 32 * 1024,
        code: 'google_web_v3_producer_denied' }),
      sourceCommit: args['source-commit'], imageDigest: args['image-digest'], ...dependencies,
    });
    return writeInputs(args['output-dir'], result.configuration, result.serviceReadback, result.serviceUsageBinding);
  } catch { deny(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputs = await runGoogleWebV3InputProducer(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify({ status: 'v3-inputs-created', outputs })}\n`);
  } catch { process.stderr.write('google_web_v3_producer_denied\n'); process.exitCode = 1; }
}
