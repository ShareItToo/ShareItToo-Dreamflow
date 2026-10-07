import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createStagingGoogleWebLiveAdapter, parseFirebaseUserCredential } from './staging_google_web_live_adapter.mjs';
import { googleWebReattestationDigest as digest, googleWebReattestationReadSources } from './staging_google_web_reattestation.mjs';

const deny = () => { throw new Error('google_web_read_only_adapter_denied'); };
const check = (value) => { if (!value) deny(); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const emailHash = (value) => {
  check(typeof value === 'string' && value.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value.normalize('NFKC').trim()));
  return hash(value.normalize('NFKC').trim().toLowerCase());
};

// Inventory is deny-by-default, including methods, hosts, exact resource binding,
// query keys and redirect handling. OAuth token exchange is the sole POST; it
// authenticates existing service credentials and never mutates provider config.
export function createGoogleWebReadOnlyFetch(binding, fetchImpl = globalThis.fetch) {
  check(typeof fetchImpl === 'function');
  const listPaths = new Set([
    ...['webApps', 'androidApps', 'iosApps'].map((kind) => `https://firebase.googleapis.com/v1beta1/projects/${binding.projectNumber}/${kind}`),
    `https://apikeys.googleapis.com/v2/projects/${binding.projectNumber}/locations/global/keys`,
  ]);
  const app = `https://firebase.googleapis.com/v1beta1/projects/${binding.projectNumber}/webApps/${binding.webAppId}`;
  const getPaths = new Set([
    'https://accounts.google.com/.well-known/openid-configuration',
    'https://openidconnect.googleapis.com/v1/userinfo',
    `https://cloudresourcemanager.googleapis.com/v1/projects/${binding.projectId}`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${binding.projectId}/config`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${binding.projectId}/defaultSupportedIdpConfigs/google.com`,
    ...['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].map((service) => `https://serviceusage.googleapis.com/v1/projects/${binding.projectNumber}/services/${service}`),
    app, `${app}/config`, `https://apikeys.googleapis.com/v2/${binding.apiKeyResourceName}`,
    `https://apikeys.googleapis.com/v2/${binding.apiKeyResourceName}/keyString`,
  ]);
  return async (input, init) => {
    try {
      const url = new URL(input); const resource = `${url.origin}${decodeURIComponent(url.pathname)}`;
      check(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port
        && plain(init) && typeof init.method === 'string'
        && Object.keys(init).every((key) => ['method', 'headers', 'body', 'signal', 'redirect', 'credentials'].includes(key))
        && plain(init.headers) && Object.keys(init.headers).every((key) => ['accept', 'authorization', 'content-type'].includes(key))
        && init.headers.accept === 'application/json');
      if (init.method === 'POST') {
        check(resource === 'https://oauth2.googleapis.com/token' && !url.search
          && typeof init.body === 'string' && init.body.length <= 16384
          && !Object.hasOwn(init.headers, 'authorization') && init.headers['content-type'] === 'application/x-www-form-urlencoded');
        const body = new URLSearchParams(init.body);
        check([...body.keys()].sort().join('|') === 'assertion|grant_type'
          && body.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
          && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(body.get('assertion') ?? ''));
      } else {
        check(init.method === 'GET' && init.body === undefined && (getPaths.has(resource) || listPaths.has(resource)));
        check(!Object.hasOwn(init.headers, 'content-type')
          && (resource === 'https://accounts.google.com/.well-known/openid-configuration'
            ? !Object.hasOwn(init.headers, 'authorization')
            : typeof init.headers.authorization === 'string' && /^Bearer [\x21-\x7e]{1,16384}$/u.test(init.headers.authorization)));
        if (listPaths.has(resource)) {
          check([...url.searchParams.keys()].every((key) => ['showDeleted', 'pageSize', 'pageToken'].includes(key))
            && [...url.searchParams.keys()].length === new Set(url.searchParams.keys()).size
            && url.searchParams.get('showDeleted') === 'true' && url.searchParams.get('pageSize') === '100'
            && (!url.searchParams.has('pageToken') || (url.searchParams.get('pageToken').length > 0 && url.searchParams.get('pageToken').length <= 4096)));
        } else check(!url.search);
      }
      return await fetchImpl(url, { ...init, redirect: 'error', credentials: 'omit' });
    } catch { deny(); }
  };
}

export function createGoogleWebRuntimeReader(binding, execute = execFileSync) {
  check(/^[a-f0-9]{64}$/u.test(binding.runtimeContainerId) && /^[a-f0-9]{40}$/u.test(binding.runtimeCommit));
  const format = '{{json .Id}}|{{json .Name}}|{{json .State.Running}}|{{json (index .Config.Labels "com.shareittoo.sit.green")}}|{{json (index .Config.Labels "org.opencontainers.image.revision")}}';
  const options = { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
  return (projectId) => {
    try {
      const inspect = () => {
        const parts = execute('docker', ['inspect', binding.runtimeContainerId, '--format', format], options).trim().split('|').map(JSON.parse);
        check(parts.length === 5 && parts[0] === binding.runtimeContainerId && parts[1] === '/shareittoo-staging-api'
          && parts[2] === true && parts[3] === 'true' && parts[4] === binding.runtimeCommit);
        return JSON.stringify(parts);
      };
      const before = inspect();
      const probe = "const fs=require('node:fs');let s;try{const x=fs.lstatSync('/run/secrets/firebase-service-account.json');s={regular:x.isFile(),symlink:x.isSymbolicLink(),nonempty:x.size>0}}catch{s={regular:false,symlink:false,nonempty:false}};process.stdout.write(JSON.stringify({projectId:process.env.FIREBASE_PROJECT_ID??null,authEnabled:process.env.FIREBASE_AUTH_ENABLED??null,emulator:Object.prototype.hasOwnProperty.call(process.env,'FIREBASE_AUTH_EMULATOR_HOST')?process.env.FIREBASE_AUTH_EMULATOR_HOST:null,serviceCredential:s,appCommit:process.env.APP_COMMIT??null}))";
      const value = JSON.parse(execute('docker', ['exec', binding.runtimeContainerId, 'node', '-e', probe], options));
      check(exact(value, ['projectId', 'authEnabled', 'emulator', 'serviceCredential', 'appCommit'])
        && value.projectId === projectId && projectId === binding.projectId && value.authEnabled === 'true'
        && value.emulator === null && value.appCommit === binding.runtimeCommit
        && exact(value.serviceCredential, ['regular', 'symlink', 'nonempty'])
        && value.serviceCredential.regular === true && value.serviceCredential.symlink === false
        && value.serviceCredential.nonempty === true && before === inspect());
      return { backendProjectId: projectId, authEnabled: true, emulatorEnabled: false, runtimeDigest: digest(value) };
    } catch { deny(); }
  };
}

export function createGoogleWebReattestationReaders({ binding, serviceCredential, userCredentialBytes,
  fetchImpl = globalThis.fetch, execute = execFileSync, now = Date.now } = {}) {
  check(typeof now === 'function' && typeof userCredentialBytes === 'string');
  binding = structuredClone(binding);
  // Validate the selected account/token before any remote read. Current identity
  // is then independently checked through userinfo, not accepted from this file.
  parseFirebaseUserCredential(userCredentialBytes, binding.firebaseAccountEmailSha256, now);
  const guardedFetch = createGoogleWebReadOnlyFetch(binding, fetchImpl);
  const runtimeReader = createGoogleWebRuntimeReader(binding, execute);
  const live = createStagingGoogleWebLiveAdapter({ binding: { ...binding, origin: 'https://staging.shareittoo.com',
    displayName: 'ShareItToo Staging Web' }, serviceCredential, fetchImpl: guardedFetch, runtimeReader, now });
  async function userGet(url, authorization) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await guardedFetch(url, { method: 'GET', headers: { ...(authorization ? { authorization } : {}), accept: 'application/json' }, signal: controller.signal });
      check(response.status >= 200 && response.status < 300);
      const text = await response.text(); check(text.length <= 1024 * 1024);
      const value = JSON.parse(text); check(plain(value)); return value;
    } finally { clearTimeout(timer); }
  }
  const functions = {
    readSnapshot: () => live.readSnapshot(),
    readWebApp: (request) => live.readWebApp(request),
    readSdkConfig: (request) => live.readSdkConfig(request),
    readAccountIdentity: async () => {
      const credential = parseFirebaseUserCredential(userCredentialBytes, binding.firebaseAccountEmailSha256, now);
      // Google OIDC discovery and Resource Manager projects.get are authoritative
      // identity/project surfaces; missing userinfo scope/claims fail closed.
      // https://developers.google.com/identity/openid-connect/openid-connect
      // https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/get
      const discovery = await userGet('https://accounts.google.com/.well-known/openid-configuration', undefined);
      check(discovery.issuer === 'https://accounts.google.com'
        && discovery.userinfo_endpoint === 'https://openidconnect.googleapis.com/v1/userinfo');
      const identity = await userGet(discovery.userinfo_endpoint, credential.authorization);
      check(identity.email_verified === true && typeof identity.sub === 'string' && identity.sub.length > 0
        && identity.sub.length <= 255 && emailHash(identity.email) === binding.firebaseAccountEmailSha256);
      const project = await userGet(`https://cloudresourcemanager.googleapis.com/v1/projects/${binding.projectId}`, credential.authorization);
      check(project.projectId === binding.projectId && project.projectNumber === binding.projectNumber && project.lifecycleState === 'ACTIVE');
      return { projectId: binding.projectId, projectNumber: binding.projectNumber,
        firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256, observedAtUtc: new Date(now()).toISOString(),
        proofSha256: digest({ subjectSha256: hash(identity.sub), accountEmailSha256: binding.firebaseAccountEmailSha256,
          projectId: project.projectId, projectNumber: project.projectNumber, lifecycleState: project.lifecycleState }) };
    },
  };
  return Object.freeze(Object.fromEntries(Object.entries(functions).map(([method, fn]) => [method, async (request) => {
    try { const value = await fn(request); return { value, observedAtUtc: new Date(now()).toISOString(),
      sources: googleWebReattestationReadSources(method, binding) }; } catch { deny(); }
  }])));
}
