import { createHash, createPrivateKey, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseServiceCredential, parseFirebaseUserCredential } from './staging_google_web_live_adapter.mjs';

const project = 'shareittoo-staging'; const number = '214007794438'; const appId = '1:214007794438:web:aefec13f9f030f46eaac87';
const origin = 'https://staging.shareittoo.com'; const allowedHosts = new Set(['oauth2.googleapis.com', 'cloudresourcemanager.googleapis.com',
  'accounts.google.com', 'openidconnect.googleapis.com', 'firebase.googleapis.com', 'apikeys.googleapis.com', 'identitytoolkit.googleapis.com', 'serviceusage.googleapis.com']);
const fail = () => { throw new Error('google_web_binding_v2_reader_denied'); };
const check = (v) => { if (!v) fail(); };
const plain = (v) => v !== null && Object.getPrototypeOf(v) === Object.prototype;
const hash = (v) => createHash('sha256').update(v).digest('hex');
const digest = (v) => hash(JSON.stringify(canonical(v)));
function canonical(v) { if (Array.isArray(v)) return v.map(canonical); if (plain(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])); return v; }
const b64 = (v) => Buffer.from(v).toString('base64url');

export function createGoogleWebBindingV2Readers({ serviceCredentialBytes, userCredentialBytes, fetchImpl = globalThis.fetch,
  execute = execFileSync, now = Date.now, firebaseAccountEmailSha256, runtimeContainerId,
  expectedRuntimeCommit, expectedRuntimeImageId, expectedRuntimeRepoDigest } = {}) {
  check(typeof serviceCredentialBytes === 'string' && typeof userCredentialBytes === 'string' && typeof fetchImpl === 'function'
    && typeof execute === 'function' && typeof now === 'function' && /^[a-f0-9]{64}$/u.test(firebaseAccountEmailSha256 ?? '')
    && /^[a-f0-9]{64}$/u.test(runtimeContainerId ?? '') && /^[a-f0-9]{40}$/u.test(expectedRuntimeCommit ?? '')
    && /^sha256:[a-f0-9]{64}$/u.test(expectedRuntimeImageId ?? '') && /^.+@sha256:[a-f0-9]{64}$/u.test(expectedRuntimeRepoDigest ?? ''));
  const svc = parseServiceCredential(serviceCredentialBytes, project);
  const user = parseFirebaseUserCredential(userCredentialBytes, firebaseAccountEmailSha256, now);
  const tokenState = { service: undefined }; const sources = new Set(); const cache = {};
  async function serviceToken() {
    if (tokenState.service && tokenState.service.exp > now() + 120000) return tokenState.service.value;
    const iat = Math.floor(now() / 1000); const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const c = b64(JSON.stringify({ iss: svc.clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: svc.tokenUri, iat, exp: iat + 3600 }));
    const assertion = `${h}.${c}.${sign('RSA-SHA256', Buffer.from(`${h}.${c}`), svc.privateKey).toString('base64url')}`;
    const response = await safeFetch(svc.tokenUri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() }, true);
    check(response.token_type === 'Bearer' && typeof response.access_token === 'string' && /^[\x21-\x7e]{1,16384}$/u.test(response.access_token)
      && Number.isFinite(response.expires_in) && response.expires_in >= 120 && response.expires_in <= 7200);
    tokenState.service = { value: response.access_token, exp: now() + response.expires_in * 1000 }; return response.access_token;
  }
  async function safeFetch(input, init, tokenExchange = false) {
    try {
      const u = new URL(input); check(u.protocol === 'https:' && allowedHosts.has(u.hostname) && !u.username && !u.password && !u.port && !u.hash);
      if (tokenExchange) {
        check(u.href === 'https://oauth2.googleapis.com/token' && init.method === 'POST' && typeof init.body === 'string'
          && init.body.length <= 16384 && plain(init.headers) && init.headers['content-type'] === 'application/x-www-form-urlencoded');
        const body = new URLSearchParams(init.body); check([...body.keys()].sort().join('|') === 'assertion|grant_type'
          && body.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
          && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(body.get('assertion') ?? ''));
      } else {
        check(init.method === 'GET' && !init.body && plain(init.headers)
          && Object.keys(init.headers).every((k) => ['accept', 'authorization'].includes(k)) && init.headers.accept === 'application/json'
          && (init.headers.authorization === undefined || /^Bearer [\x21-\x7e]{1,16384}$/u.test(init.headers.authorization)));
        const url = `${u.origin}${decodeURIComponent(u.pathname)}`;
        const exactGets = new Set(['https://accounts.google.com/.well-known/openid-configuration',
          'https://openidconnect.googleapis.com/v1/userinfo', `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,
          `https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}`,
          `https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}/config`,
          `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
          ...['google.com', 'facebook.com', 'apple.com'].map((p) => `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/${p}`),
          ...['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].map((s) => `https://serviceusage.googleapis.com/v1/projects/${number}/services/${s}`)]);
        const listMatch = /^(https:\/\/firebase\.googleapis\.com\/v1beta1\/projects\/214007794438\/(?:webApps|androidApps|iosApps)|https:\/\/apikeys\.googleapis\.com\/v2\/projects\/214007794438\/locations\/global\/keys)$/u.test(`${url}`);
        const keyMatch = /^https:\/\/apikeys\.googleapis\.com\/v2\/projects\/214007794438\/locations\/global\/keys\/[A-Za-z0-9_-]{1,200}(?:\/keyString)?$/u.test(url);
        check(exactGets.has(url) || listMatch || keyMatch);
        if (listMatch) check([...u.searchParams.keys()].sort().join('|') === 'pageSize|showDeleted'
          || [...u.searchParams.keys()].sort().join('|') === 'pageSize|pageToken|showDeleted');
        else check([...u.searchParams.keys()].length === 0);
        if (listMatch) check(u.searchParams.get('showDeleted') === 'true' && u.searchParams.get('pageSize') === '100'
          && (!u.searchParams.has('pageToken') || (u.searchParams.get('pageToken').length > 0 && u.searchParams.get('pageToken').length <= 4096)));
      }
      check(Object.keys(init).every((k) => ['method', 'headers', 'body', 'signal'].includes(k)));
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
        const response = await fetchImpl(u, { ...init, signal, redirect: 'error', credentials: 'omit' });
        check(response && typeof response.text === 'function');
        const absentProvider = new Set(['facebook.com', 'apple.com'].map((p) =>
          `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/${p}`));
        if (!tokenExchange && response.status === 404 && absentProvider.has(u.href)) {
          sources.add(u.href); return null;
        }
        check(response.status >= 200 && response.status < 300);
        const text = await response.text(); check(text.length <= 1024 * 1024); const value = JSON.parse(text); check(plain(value));
        if (!tokenExchange) sources.add(u.href); return value;
      } finally { clearTimeout(timer); }
    } catch { fail(); }
  }
  async function get(url, asUser = false) {
    const auth = asUser ? user.authorization : `Bearer ${await serviceToken()}`;
    return safeFetch(url, { method: 'GET', headers: { accept: 'application/json', authorization: auth } });
  }
  async function pages(base, field) {
    const all = []; const seen = new Set(); let token = '';
    for (let i = 0; i < 100; i++) {
      const u = new URL(base); u.searchParams.set('showDeleted', 'true'); u.searchParams.set('pageSize', '100'); if (token) u.searchParams.set('pageToken', token);
      const value = await get(u.href); check(Object.keys(value).every((k) => k === field || k === 'nextPageToken') && Array.isArray(value[field] ?? []));
      all.push(...(value[field] ?? [])); check(all.length < 1000); token = value.nextPageToken ?? ''; check(typeof token === 'string' && token.length <= 4096);
      if (!token) return all; check(!seen.has(token)); seen.add(token);
    } fail();
  }
  async function read(name) {
    try {
      sources.clear(); let value;
      if (name === 'serviceProjectIdentity') {
        const p = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);
        check(p.projectId === project && String(p.projectNumber) === number && p.lifecycleState === 'ACTIVE');
        value = { projectId: project, projectNumber: number, lifecycleState: p.lifecycleState,
          serviceAccountEmailSha256: hash(svc.clientEmail.toLowerCase()) };
      } else if (name === 'userAccountIdentity') {
        const d = await safeFetch('https://accounts.google.com/.well-known/openid-configuration', { method: 'GET', headers: { accept: 'application/json' } });
        check(d.issuer === 'https://accounts.google.com' && d.userinfo_endpoint === 'https://openidconnect.googleapis.com/v1/userinfo');
        const i = await get(d.userinfo_endpoint, true); check(i.email_verified === true && typeof i.sub === 'string'
          && hash(i.email.normalize('NFKC').trim().toLowerCase()) === firebaseAccountEmailSha256);
        const p = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`, true);
        check(p.projectId === project && String(p.projectNumber) === number && p.lifecycleState === 'ACTIVE');
        value = { projectId: project, projectNumber: number,
          firebaseAccountEmailSha256: hash(i.email.normalize('NFKC').trim().toLowerCase()),
          proofSha256: digest({ subjectSha256: hash(i.sub), accountEmailSha256: firebaseAccountEmailSha256,
            projectId: p.projectId, projectNumber: String(p.projectNumber), lifecycleState: p.lifecycleState }) };
      } else if (name === 'webApp') {
        const app = await get(`https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}`);
        check(app.appId === appId && app.projectId === project && app.state === 'ACTIVE' && typeof app.apiKeyId === 'string');
        cache.app = app; value = { appId, projectId: project, state: app.state, apiKeyId: app.apiKeyId, origin };
      } else if (name === 'sdkConfig') {
        const app = await get(`https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}`);
        const c = await get(`https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}/config`);
        check(c.projectId === project && String(c.projectNumber) === number && c.appId === appId && typeof c.apiKey === 'string'
          && c.authDomain === `${project}.firebaseapp.com`);
        cache.configuration = c;
        cache.configurationBinding = { projectId: c.projectId, messagingSenderId: String(c.messagingSenderId), appId: c.appId,
          apiKey: c.apiKey, authDomain: c.authDomain, backendProjectId: project, authorizedOrigin: origin };
        value = { projectId: project, projectNumber: number, appId, apiKeyId: app.apiKeyId, keyFingerprint: hash(c.apiKey),
          configurationSha256: hash(JSON.stringify(cache.configurationBinding)), origin };
      } else if (name === 'apiKeyInventory') {
        // This closure is used after app and SDK discovery so the selected key
        // is derived from authoritative app config, never from user input.
        const app = await get(`https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}`);
        const inventory = await pages(`https://apikeys.googleapis.com/v2/projects/${number}/locations/global/keys`, 'keys');
        const selected = inventory.find((k) => k.uid === app.apiKeyId && !k.deleteTime); check(selected);
        const detail = await get(`https://apikeys.googleapis.com/v2/${selected.name}`); check(detail.uid === selected.uid && detail.name === selected.name);
        const k = await get(`https://apikeys.googleapis.com/v2/${selected.name}/keyString`); check(typeof k.keyString === 'string');
        const refs = detail.restrictions?.browserKeyRestrictions?.allowedReferrers ?? [];
        const targets = detail.restrictions?.apiTargets;
        const unrestricted = new Set((targets ?? []).filter((x) => !Object.hasOwn(x, 'methods')).map((x) => x.service));
        const compatible = refs.includes(`${origin}/*`) && (!targets || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].every((s) => unrestricted.has(s)));
        value = { complete: true, apiKeyId: selected.uid, resourceName: selected.name, keyFingerprint: hash(k.keyString),
          restrictionsDigest: digest(detail.restrictions ?? {}), webCompatible: compatible };
        cache.key = value;
      } else if (name === 'providerSnapshot') {
        check(cache.key && cache.app);
        const [projectState, projectConfig, google, facebook, apple, serviceIdentityToolkit, serviceSecureToken,
          webApps, androidApps, iosApps, apiKeys] = await Promise.all([
          get(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`),
          get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`),
          get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`),
          get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/facebook.com`),
          get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/apple.com`),
          get(`https://serviceusage.googleapis.com/v1/projects/${number}/services/identitytoolkit.googleapis.com`),
          get(`https://serviceusage.googleapis.com/v1/projects/${number}/services/securetoken.googleapis.com`),
          pages(`https://firebase.googleapis.com/v1beta1/projects/${number}/webApps`, 'apps'),
          pages(`https://firebase.googleapis.com/v1beta1/projects/${number}/androidApps`, 'apps'),
          pages(`https://firebase.googleapis.com/v1beta1/projects/${number}/iosApps`, 'apps'),
          pages(`https://apikeys.googleapis.com/v2/projects/${number}/locations/global/keys`, 'keys')]);
        check(projectState.projectId === project && String(projectState.projectNumber) === number && projectState.lifecycleState === 'ACTIVE'
          && projectConfig.name === `projects/${number}/config` && Array.isArray(projectConfig.authorizedDomains)
          && projectConfig.authorizedDomains.includes('staging.shareittoo.com') && google.enabled === true
          && facebook?.enabled !== true && apple?.enabled !== true && serviceIdentityToolkit.state === 'ENABLED'
          && serviceSecureToken.state === 'ENABLED' && webApps.some((a) => a.appId === appId && a.state === 'ACTIVE'
            && a.apiKeyId === cache.key.apiKeyId));
        const selectedKey = apiKeys.find((k) => k.uid === cache.key.apiKeyId);
        check(selectedKey && !selectedKey.deleteTime && digest(selectedKey.restrictions ?? {}) === cache.key.restrictionsDigest);
        const snapshot = { complete: true, projectId: project, projectNumber: number, backendProjectId: project,
          authEnabled: true, emulatorEnabled: false, googleEnabled: true,
          webApps: webApps.map((a) => ({ appId: a.appId, projectId: project, state: a.state, apiKeyId: a.apiKeyId,
            displayName: a.displayName ?? '' })).sort((a, b) => a.appId.localeCompare(b.appId)),
          webAppsInventory: { showDeleted: true, exhausted: true, nextPageToken: '' },
          apiKey: { projectId: project, apiKeyId: cache.key.apiKeyId, keyFingerprint: cache.key.keyFingerprint,
            restrictionsDigest: cache.key.restrictionsDigest, exists: true, webCompatible: cache.key.webCompatible },
          keyInventoryDigest: digest(apiKeys), authorizedDomains: projectConfig.authorizedDomains,
          authConfigDigest: digest(Object.fromEntries(Object.entries(projectConfig).filter(([k]) => k !== 'authorizedDomains'))),
          providerConfigDigest: digest(google), otherAppsDigest: digest({ androidApps, iosApps }),
          runtimeDigest: cache.runtimeLegacyDigest,
          revision: digest(projectConfig) };
        const configuration = { projectId: cache.configuration.projectId, messagingSenderId: String(cache.configuration.messagingSenderId),
          appId: cache.configuration.appId, apiKey: cache.configuration.apiKey, authDomain: cache.configuration.authDomain,
          backendProjectId: project, authorizedOrigin: origin };
        cache.snapshot = snapshot; cache.configurationBinding = configuration;
        value = { complete: true, projectId: project, projectNumber: number, authEnabled: true, googleEnabled: true,
          facebookEnabled: false, appleEnabled: false, stagingAuthorized: true, webAppInventoryComplete: true,
          apiKeyInventoryComplete: true, snapshotSha256: digest(snapshot), configurationSha256: hash(JSON.stringify(configuration)) };
      } else if (name === 'runtime') {
        const containerId = runtimeContainerId;
        const fmt = '{{json .Id}}|{{json .Name}}|{{json .State.Running}}|{{json (index .Config.Labels "com.shareittoo.sit.green")}}|{{json (index .Config.Labels "org.opencontainers.image.revision")}}|{{json .Image}}';
        const opts = { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
        const inspect = () => execute('docker', ['inspect', containerId, '--format', fmt], opts).trim().split('|').map(JSON.parse);
        const before = inspect(); check(before.length === 6 && before[0] === containerId && before[1] === '/shareittoo-staging-api'
          && before[2] === true && before[3] === 'true' && before[4] === expectedRuntimeCommit && before[5] === expectedRuntimeImageId);
        const image = execute('docker', ['image', 'inspect', before[5], '--format', '{{json .Id}}|{{json .RepoDigests}}'], opts).trim().split('|').map(JSON.parse);
        const after = inspect(); check(JSON.stringify(before) === JSON.stringify(after) && image[0] === before[5]
          && Array.isArray(image[1]) && image[1].includes(expectedRuntimeRepoDigest));
        const probe = "const fs=require('node:fs');let s;try{const x=fs.lstatSync('/run/secrets/firebase-service-account.json');s={regular:x.isFile(),symlink:x.isSymbolicLink(),nonempty:x.size>0}}catch{s={regular:false,symlink:false,nonempty:false}};process.stdout.write(JSON.stringify({projectId:process.env.FIREBASE_PROJECT_ID??null,authEnabled:process.env.FIREBASE_AUTH_ENABLED??null,emulator:Object.prototype.hasOwnProperty.call(process.env,'FIREBASE_AUTH_EMULATOR_HOST')?process.env.FIREBASE_AUTH_EMULATOR_HOST:null,serviceCredential:s,appCommit:process.env.APP_COMMIT??null}))";
        const runtimeState = JSON.parse(execute('docker', ['exec', containerId, 'node', '-e', probe], opts));
        check(plain(runtimeState) && runtimeState.projectId === project && runtimeState.authEnabled === 'true'
          && runtimeState.emulator === null && runtimeState.appCommit === before[4] && plain(runtimeState.serviceCredential)
          && runtimeState.serviceCredential.regular === true && runtimeState.serviceCredential.symlink === false
          && runtimeState.serviceCredential.nonempty === true);
        const baseRuntimeDigest = digest(runtimeState); cache.runtimeLegacyDigest = baseRuntimeDigest;
        value = { containerId, name: before[1], running: true, green: true, revision: before[4], imageId: before[5],
          repoDigests: image[1], runtimeDigest: digest({ runtimeDigest: baseRuntimeDigest, containerId,
            runtimeCommit: before[4], runtimeImageId: before[5], runtimeRepoDigest: expectedRuntimeRepoDigest }) };
        cache.runtime = value;
        sources.add('docker://shareittoo-staging-api');
      } else fail();
      return { method: 'GET', value, sources: [...sources].sort() };
    } catch { fail(); }
  }
  return Object.freeze(Object.fromEntries(['serviceProjectIdentity', 'userAccountIdentity', 'webApp', 'sdkConfig', 'apiKeyInventory', 'runtime', 'providerSnapshot']
    .map((name) => [name, () => read(name)])));
}
