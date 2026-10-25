import crypto from 'node:crypto';

const GRAPH_VERSION = 'v23.0';
// The current official Meta application-field reference could not be verified
// (developers.facebook.com returned 429 during this review). Do not issue a
// speculative Graph request or turn undocumented fields into readiness.
export const META_GRAPH_READBACK_CONTRACT_VERIFIED = false;
const PROJECT = 'shareittoo-staging';
const PROJECT_NUMBER = '214007794438';
const APP_ID = '1:214007794438:web:aefec13f9f030f46eaac87';
const ORIGIN = 'https://staging.shareittoo.com';
const FIXED_READS = Object.freeze([
  'https://openidconnect.googleapis.com/v1/userinfo',
  `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${APP_ID}/config`,
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/facebook.com`,
]);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (value, code = 'facebook_web_collector_not_verified') => {
  if (!value) throw new Error(code);
};
const plain = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : plain(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => hash(JSON.stringify(canonical(value)));

export function facebookWebReadSources(metaAppId) {
  check(typeof metaAppId === 'string' && /^[1-9][0-9]{5,24}$/u.test(metaAppId));
  return Object.freeze([...FIXED_READS,
    `https://graph.facebook.com/${GRAPH_VERSION}/${metaAppId}?fields=id,name,app_domains,app_mode,oauth_redirect_uris`].sort());
}

/** Read-only collection. Credential bytes are only used as Authorization headers
 * and never become URLs, evidence fields, errors, or console output. */
export function createFacebookWebReadOnlyCollector({ googleAccessToken, metaAppAccessToken,
  fetchImpl = globalThis.fetch, now = Date.now, sourceSnapshot } = {}) {
  check(typeof googleAccessToken === 'string' && /^[\x21-\x7e]{16,16384}$/u.test(googleAccessToken));
  check(typeof metaAppAccessToken === 'string' && /^[\x21-\x7e]{16,16384}$/u.test(metaAppAccessToken));
  check(typeof fetchImpl === 'function' && typeof now === 'function');
  const register = [];
  async function get(url, token) {
    check(FIXED_READS.includes(url) || /^https:\/\/graph\.facebook\.com\/v23\.0\/[1-9][0-9]{5,24}\?fields=id,name,app_domains,app_mode,oauth_redirect_uris$/u.test(url), 'facebook_web_collector_source_denied');
    const parsed = new URL(url);
    check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash);
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(parsed, { method: 'GET', headers: {
        accept: 'application/json', authorization: `Bearer ${token}`,
      }, redirect: 'error', credentials: 'omit', signal: controller.signal });
      check(response && response.status === 200 && typeof response.text === 'function');
      const text = await response.text();
      check(Buffer.byteLength(text) <= 131072);
      check(!text.includes(token), 'facebook_web_collector_credential_echo');
      const value = JSON.parse(text);
      check(plain(value));
      const endedAt = now();
      register.push(Object.freeze({ method: 'GET', source: url, status: 200,
        startedAtUtc: new Date(startedAt).toISOString().replace('.000Z', 'Z'),
        endedAtUtc: new Date(endedAt).toISOString().replace('.000Z', 'Z') }));
      // Never return raw response text; callers keep only allow-listed fields.
      return value;
    } catch {
      throw new Error('facebook_web_collector_not_verified');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ async collect() {
    const identity = await get('https://openidconnect.googleapis.com/v1/userinfo', googleAccessToken);
    check(identity.email_verified === true && typeof identity.sub === 'string' && identity.sub.length >= 8
      && typeof identity.email === 'string' && identity.email.length <= 320);
    const firebaseUrl = FIXED_READS.find((url) => {
      const parsed = new URL(url);
      return parsed.hostname === 'firebase.googleapis.com' && parsed.pathname === `/v1beta1/projects/${PROJECT_NUMBER}/webApps/${APP_ID}/config`;
    });
    const authUrl = FIXED_READS.find((url) => url.endsWith('/admin/v2/projects/shareittoo-staging/config'));
    const providerUrl = FIXED_READS.find((url) => url.endsWith('/defaultSupportedIdpConfigs/facebook.com'));
    const firebase = await get(firebaseUrl, googleAccessToken);
    const authConfig = await get(authUrl, googleAccessToken);
    const provider = await get(providerUrl, googleAccessToken);
    check(provider.enabled === true && typeof provider.clientId === 'string'
      && /^[1-9][0-9]{5,24}$/u.test(provider.clientId)
      && typeof provider.clientSecret === 'string' && provider.clientSecret.length >= 16);
    check(META_GRAPH_READBACK_CONTRACT_VERIFIED, 'facebook_web_collector_not_verified');
    const graphUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${provider.clientId}?fields=id,name,app_domains,app_mode,oauth_redirect_uris`;
    const meta = await get(graphUrl, metaAppAccessToken);
    check(firebase.projectId === PROJECT && String(firebase.projectNumber) === PROJECT_NUMBER
      && firebase.appId === APP_ID && typeof firebase.apiKey === 'string'
      && /^[A-Za-z0-9_-]{20,128}$/u.test(firebase.apiKey)
      && firebase.authDomain === `${PROJECT}.firebaseapp.com`
      && String(firebase.messagingSenderId) === PROJECT_NUMBER);
    check(new Set(authConfig.authorizedDomains ?? []).has('staging.shareittoo.com'));
    check(provider.clientId === meta.id);
    check(meta.id === provider.clientId && meta.app_mode === 'development'
      && Array.isArray(meta.app_domains) && new Set(meta.app_domains).has('staging.shareittoo.com')
      && Array.isArray(meta.oauth_redirect_uris)
      && new Set(meta.oauth_redirect_uris).has(`https://${PROJECT}.firebaseapp.com/__/auth/handler`));
    // Development-mode audience is restricted to app roles. If Graph does not
    // expose and verify this mode/redirect configuration, collection fails closed.
    const configuration = { projectId: firebase.projectId,
      messagingSenderId: String(firebase.messagingSenderId), appId: firebase.appId,
      apiKey: firebase.apiKey, authDomain: firebase.authDomain,
      backendProjectId: PROJECT, authorizedOrigin: ORIGIN };
    // lgtm[js/insufficient-password-hash] Firebase Web API keys are public client configuration identifiers, not authenticators. This SHA-256 is solely an exact configuration-integrity digest.
    const configurationSha256 = hash(JSON.stringify(configuration));
    const collectedAtUtc = new Date(Math.floor(now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const validUntilUtc = new Date(Date.parse(collectedAtUtc) + 60 * 60 * 1000)
      .toISOString().replace('.000Z', 'Z');
    const readback = { projectId: PROJECT, projectNumber: PROJECT_NUMBER,
      appId: APP_ID, firebaseProviderEnabled: provider.enabled,
      metaAppMode: meta.app_mode, metaDomains: [...meta.app_domains].sort(),
      callbackUriVerified: true,
      firebaseAuthorizedDomains: [...authConfig.authorizedDomains].sort(),
      collectorIdentitySha256: hash(identity.sub),
      sourceRegister: register };
    const candidate = { schemaVersion: 1, kind: 'sit-facebook-web-readiness-candidate',
      status: 'pending-independent-review', syntheticFixture: false,
      metaAppId: provider.clientId,
      configuration, configurationSha256,
      readiness: { provider: 'facebook', platform: 'web', origin: ORIGIN,
        backendFirebaseProjectId: PROJECT, webAppConfigSha256: configurationSha256,
        callbackUrl: `https://${PROJECT}.firebaseapp.com/__/auth/handler`,
        firebaseProviderEnabled: true, metaAppMode: 'development',
        audience: 'app_roles_only', audienceVerified: true,
        providerReadbackSha256: digest(readback), observedAtUtc: collectedAtUtc,
        validUntilUtc },
      sourceCommit: sourceSnapshot?.sourceCommit,
      sourceInventory: sourceSnapshot?.files,
      sourceInventorySha256: sourceSnapshot?.inventorySha256,
      collectorIdentitySha256: hash(identity.sub), sourceRegisterSha256: hash(JSON.stringify(register)),
      collectedAtUtc, validUntilUtc };
    return Object.freeze({ candidate, journal: Object.freeze({ schemaVersion: 1,
      kind: 'sit-facebook-web-read-register', metaAppId: provider.clientId, collectedAtUtc, validUntilUtc,
      sourceCommit: sourceSnapshot?.sourceCommit, sourceInventorySha256: sourceSnapshot?.inventorySha256,
      collectorIdentitySha256: hash(identity.sub), sources: Object.freeze(register.slice()) }) });
  } });
}
