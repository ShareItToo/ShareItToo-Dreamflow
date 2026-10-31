import crypto from 'node:crypto';
import { bindFacebookWebReadiness } from '../../tool/staging_facebook_web_readiness.mjs';

// Official v26 Application and Roles references verified 2026-10-31.
// App mode and OAuth redirect settings are NOT documented Application fields.
export const FACEBOOK_V2_SOURCE_CLOSURE = Object.freeze([
  'backend/ops/staging_facebook_web_readiness_v2.mjs',
  'backend/ops/staging_facebook_web_readiness_v2_cli.mjs',
  'backend/ops/staging_facebook_web_readiness_writer.mjs',
  'tool/staging_facebook_web_readiness.mjs',
]);
const PROJECT = 'shareittoo-staging';
const NUMBER = '214007794438';
const WEB_APP = '1:214007794438:web:aefec13f9f030f46eaac87';
const ORIGIN = 'https://staging.shareittoo.com';
const CALLBACK = `https://${PROJECT}.firebaseapp.com/__/auth/handler`;
export const FACEBOOK_V2_SOURCES = Object.freeze([
  'https://openidconnect.googleapis.com/v1/userinfo',
  `https://firebase.googleapis.com/v1beta1/projects/${NUMBER}/webApps/${WEB_APP}/config`,
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/facebook.com`,
  'https://graph.facebook.com/v26.0/{app-id}?fields=id,name,app_domains',
  'https://graph.facebook.com/v26.0/{app-id}/roles',
]);
const HOUR = 3600000;
const shaPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[1-9][0-9]{5,24}$/u;
const fail = (ok, code) => { if (!ok) throw new Error(`facebook_v2_${code}`); };
export const facebookV2Hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const facebookV2Digest = (value) => facebookV2Hash(JSON.stringify(value));
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, keys, code) => fail(plain(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|'), code);
const timestamp = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().replace('.000Z', 'Z') === v;
const utc = (n) => new Date(Math.floor(n / 1000) * 1000).toISOString().replace('.000Z', 'Z');
function windowValid(start, end, now, code) {
  fail(timestamp(start) && timestamp(end) && Number.isFinite(now)
    && Date.parse(start) <= now && now < Date.parse(end)
    && Date.parse(end) > Date.parse(start) && Date.parse(end) - Date.parse(start) <= HOUR, code);
}
function hashes(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 100
    && values.every((v) => typeof v === 'string' && shaPattern.test(v))
    && JSON.stringify([...new Set(values)].sort()) === JSON.stringify(values);
}
export function validateFacebookV2Source(source) {
  exact(source, ['sourceCommit', 'files', 'inventorySha256'], 'source');
  fail(/^[a-f0-9]{40}$/u.test(source.sourceCommit) && Array.isArray(source.files)
    && source.inventorySha256 === facebookV2Digest(source.files)
    && JSON.stringify(source.files.map((v) => v.relativePath)) === JSON.stringify(FACEBOOK_V2_SOURCE_CLOSURE), 'source');
  for (const entry of source.files) {
    exact(entry, ['relativePath', 'gitBlob', 'currentByteSha256'], 'source');
    fail(/^[a-f0-9]{40}$/u.test(entry.gitBlob) && shaPattern.test(entry.currentByteSha256), 'source');
  }
}
const dashboardKeys = ['schemaVersion', 'kind', 'syntheticFixture', 'source', 'appIdSha256',
  'observerIdentitySha256', 'observationEvidenceSha256', 'observedAtUtc', 'validUntilUtc',
  'mode', 'origin', 'callbackUrl', 'clientOAuthLogin', 'webOAuthLogin', 'strictMode',
  'enforceHttps', 'publicProfileAccess', 'emailAccess', 'expectedRoleUserSha256'];
export function validateFacebookV2Dashboard(d, now) {
  exact(d, dashboardKeys, 'dashboard_shape');
  fail(d.schemaVersion === 2 && d.kind === 'sit-facebook-web-dashboard-readback'
    && typeof d.syntheticFixture === 'boolean' && d.source === 'meta-app-dashboard'
    && shaPattern.test(d.appIdSha256) && shaPattern.test(d.observerIdentitySha256)
    && shaPattern.test(d.observationEvidenceSha256), 'dashboard_shape');
  windowValid(d.observedAtUtc, d.validUntilUtc, now, 'dashboard_time');
  fail(d.mode === 'development', 'dashboard_mode');
  fail(d.origin === ORIGIN && d.callbackUrl === CALLBACK, 'dashboard_redirect');
  fail(['clientOAuthLogin', 'webOAuthLogin', 'strictMode', 'enforceHttps'].every((k) => d[k] === true), 'dashboard_oauth');
  fail(['publicProfileAccess', 'emailAccess'].every((k) => ['standard', 'advanced'].includes(d[k])), 'dashboard_permissions');
  fail(hashes(d.expectedRoleUserSha256), 'dashboard_roles');
}

/** Dashboard input is independently observed and hash-bound, never inferred from Graph. */
export async function collectFacebookWebV2({ dashboard, dashboardSha256, googleAccessToken,
  metaAppAccessToken, source, fetchImpl = globalThis.fetch, now = Date.now }) {
  validateFacebookV2Source(source);
  validateFacebookV2Dashboard(dashboard, now());
  fail(facebookV2Digest(dashboard) === dashboardSha256, 'dashboard_digest');
  fail([googleAccessToken, metaAppAccessToken].every((v) => typeof v === 'string' && /^[\x21-\x7e]{16,16384}$/u.test(v)), 'credential');
  const startedAtUtc = utc(now());
  const reads = []; let metaId; let providerSecret;
  async function get(index, token) {
    fail(index === reads.length && index < FACEBOOK_V2_SOURCES.length, 'source_denied');
    const template = FACEBOOK_V2_SOURCES[index];
    fail(index < 4 || idPattern.test(metaId ?? ''), 'source_denied');
    const url = new URL(template.replace('{app-id}', metaId ?? ''));
    const started = utc(now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let value;
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        redirect: 'error', credentials: 'omit', signal: controller.signal });
      fail(response?.status === 200 && typeof response.text === 'function', 'transport');
      const raw = await response.text();
      fail(Buffer.byteLength(raw) <= 131072, 'response_size');
      fail(![googleAccessToken, metaAppAccessToken, ...(providerSecret ? [providerSecret] : [])].some((v) => raw.includes(v)), 'credential_echo');
      value = JSON.parse(raw);
      fail(plain(value), 'response_shape');
    } catch (error) {
      if (/^facebook_v2_[a-z_]+$/u.test(error?.message ?? '')) throw error;
      throw new Error('facebook_v2_transport');
    } finally { clearTimeout(timer); }
    reads.push({ source: template, method: 'GET', status: 200, startedAtUtc: started, endedAtUtc: utc(now()) });
    return value;
  }
  const identity = await get(0, googleAccessToken);
  fail(identity.email_verified === true && typeof identity.sub === 'string' && identity.sub.length >= 8, 'collector_identity');
  const collectorIdentitySha256 = facebookV2Hash(identity.sub);
  const f = await get(1, googleAccessToken);
  fail(f.projectId === PROJECT && String(f.projectNumber) === NUMBER && f.appId === WEB_APP
    && f.messagingSenderId === NUMBER && f.authDomain === `${PROJECT}.firebaseapp.com`
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(f.apiKey ?? ''), 'firebase_app');
  const auth = await get(2, googleAccessToken);
  fail(Array.isArray(auth.authorizedDomains) && auth.authorizedDomains.includes('staging.shareittoo.com'), 'firebase_domain');
  const provider = await get(3, googleAccessToken);
  fail(provider.enabled === true && idPattern.test(provider.clientId ?? '')
    && typeof provider.clientSecret === 'string' && provider.clientSecret.length >= 16, 'provider');
  metaId = provider.clientId; providerSecret = provider.clientSecret;
  fail(facebookV2Hash(metaId) === dashboard.appIdSha256, 'dashboard_app');
  const app = await get(4, metaAppAccessToken);
  fail(app.id === metaId && Array.isArray(app.app_domains) && app.app_domains.includes('staging.shareittoo.com'), 'meta_app');
  const roles = await get(5, metaAppAccessToken);
  // No next-page traversal: partial role evidence fails closed, never expands GET scope.
  fail(Array.isArray(roles.data) && roles.data.length > 0 && roles.data.length <= 1000
    && (roles.paging === undefined || (plain(roles.paging) && !Object.hasOwn(roles.paging, 'next'))), 'roles_page');
  const matched = new Set();
  for (const row of roles.data) {
    fail(plain(row) && row.app_id === metaId && idPattern.test(row.user ?? '')
      && ['administrators', 'developers', 'testers', 'insights users'].includes(row.role), 'roles_app');
    if (row.role !== 'insights users') matched.add(facebookV2Hash(row.user));
  }
  fail(dashboard.expectedRoleUserSha256.every((h) => matched.has(h)), 'roles_missing');
  validateFacebookV2Dashboard(dashboard, now());
  const collectedAtUtc = utc(now());
  const validUntilUtc = utc(Math.min(Date.parse(dashboard.validUntilUtc), Date.parse(collectedAtUtc) + HOUR));
  const configuration = { projectId: PROJECT, messagingSenderId: NUMBER, appId: WEB_APP,
    apiKey: f.apiKey, authDomain: f.authDomain, backendProjectId: PROJECT, authorizedOrigin: ORIGIN };
  const proof = { appIdSha256: dashboard.appIdSha256, appDomainVerified: true,
    rolesVerified: true, roleUserSha256: dashboard.expectedRoleUserSha256,
    firebaseProviderEnabled: true, firebaseAuthorizedOriginVerified: true };
  const candidate = { schemaVersion: 2, kind: 'sit-facebook-web-readiness-candidate',
    syntheticFixture: dashboard.syntheticFixture, status: 'pending-independent-review', source,
    configuration, configurationSha256: facebookV2Digest(configuration), dashboard,
    dashboardSha256, proof, proofSha256: facebookV2Digest(proof), collectorIdentitySha256,
    startedAtUtc, collectedAtUtc, validUntilUtc };
  const journal = { schemaVersion: 2, kind: 'sit-facebook-web-read-register',
    syntheticFixture: dashboard.syntheticFixture, appIdSha256: dashboard.appIdSha256,
    candidateSha256: facebookV2Digest(candidate), reads };
  validateFacebookV2Candidate(candidate, journal, now());
  return { candidate, journal };
}

export function validateFacebookV2Candidate(c, j, now) {
  exact(c, ['schemaVersion', 'kind', 'syntheticFixture', 'status', 'source', 'configuration', 'configurationSha256',
    'dashboard', 'dashboardSha256', 'proof', 'proofSha256', 'collectorIdentitySha256', 'startedAtUtc', 'collectedAtUtc', 'validUntilUtc'], 'candidate_shape');
  validateFacebookV2Source(c.source); validateFacebookV2Dashboard(c.dashboard, now);
  fail(c.schemaVersion === 2 && c.kind === 'sit-facebook-web-readiness-candidate'
    && c.syntheticFixture === c.dashboard.syntheticFixture && c.status === 'pending-independent-review'
    && shaPattern.test(c.collectorIdentitySha256) && c.dashboardSha256 === facebookV2Digest(c.dashboard)
    && c.proofSha256 === facebookV2Digest(c.proof), 'candidate_binding');
  windowValid(c.startedAtUtc, c.validUntilUtc, now, 'candidate_time');
  fail(timestamp(c.collectedAtUtc) && Date.parse(c.collectedAtUtc) >= Date.parse(c.startedAtUtc)
    && Date.parse(c.collectedAtUtc) <= now && Date.parse(c.validUntilUtc) <= Date.parse(c.dashboard.validUntilUtc), 'candidate_time');
  exact(c.configuration, ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain', 'backendProjectId', 'authorizedOrigin'], 'configuration');
  fail(c.configuration.projectId === PROJECT && c.configuration.messagingSenderId === NUMBER
    && c.configuration.appId === WEB_APP && c.configuration.authDomain === `${PROJECT}.firebaseapp.com`
    && c.configuration.backendProjectId === PROJECT && c.configuration.authorizedOrigin === ORIGIN
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(c.configuration.apiKey)
    && c.configurationSha256 === facebookV2Digest(c.configuration), 'configuration');
  exact(c.proof, ['appIdSha256', 'appDomainVerified', 'rolesVerified', 'roleUserSha256', 'firebaseProviderEnabled', 'firebaseAuthorizedOriginVerified'], 'proof');
  fail(c.proof.appIdSha256 === c.dashboard.appIdSha256 && ['appDomainVerified', 'rolesVerified', 'firebaseProviderEnabled', 'firebaseAuthorizedOriginVerified'].every((k) => c.proof[k] === true)
    && JSON.stringify(c.proof.roleUserSha256) === JSON.stringify(c.dashboard.expectedRoleUserSha256), 'proof');
  exact(j, ['schemaVersion', 'kind', 'syntheticFixture', 'appIdSha256', 'candidateSha256', 'reads'], 'journal_shape');
  fail(j.schemaVersion === 2 && j.kind === 'sit-facebook-web-read-register' && j.syntheticFixture === c.syntheticFixture
    && j.appIdSha256 === c.dashboard.appIdSha256 && j.candidateSha256 === facebookV2Digest(c)
    && Array.isArray(j.reads) && j.reads.length === FACEBOOK_V2_SOURCES.length, 'journal_binding');
  let previousEnd = Date.parse(c.startedAtUtc);
  for (const [i, read] of j.reads.entries()) {
    exact(read, ['source', 'method', 'status', 'startedAtUtc', 'endedAtUtc'], 'journal_read');
    fail(read.source === FACEBOOK_V2_SOURCES[i] && read.method === 'GET' && read.status === 200
      && timestamp(read.startedAtUtc) && timestamp(read.endedAtUtc)
      && Date.parse(read.startedAtUtc) >= previousEnd && Date.parse(read.endedAtUtc) >= Date.parse(read.startedAtUtc)
      && Date.parse(read.endedAtUtc) <= Date.parse(c.collectedAtUtc), 'journal_read');
    previousEnd = Date.parse(read.endedAtUtc);
  }
}

export function composeFacebookWebV2({ candidate: c, journal: j, decision: d, now = Date.now() }) {
  validateFacebookV2Candidate(c, j, now);
  exact(d, ['schemaVersion', 'kind', 'syntheticFixture', 'decision', 'candidateSha256', 'journalSha256',
    'reviewerIdentitySha256', 'reviewEvidenceSha256', 'decidedAtUtc', 'validUntilUtc'], 'decision_shape');
  windowValid(d.decidedAtUtc, d.validUntilUtc, now, 'decision_time');
  fail(d.schemaVersion === 2 && d.kind === 'sit-facebook-web-independent-decision'
    && d.syntheticFixture === c.syntheticFixture && d.decision === 'approved'
    && d.candidateSha256 === facebookV2Digest(c) && d.journalSha256 === facebookV2Digest(j)
    && shaPattern.test(d.reviewerIdentitySha256) && shaPattern.test(d.reviewEvidenceSha256)
    && ![c.collectorIdentitySha256, c.dashboard.observerIdentitySha256].includes(d.reviewerIdentitySha256)
    && Date.parse(d.decidedAtUtc) >= Date.parse(c.collectedAtUtc)
    && Date.parse(d.decidedAtUtc) >= Date.parse(c.dashboard.observedAtUtc)
    && Date.parse(d.validUntilUtc) <= Date.parse(c.validUntilUtc), 'decision_binding');
  const readiness = { schemaVersion: 1, provider: 'facebook', platform: 'web', origin: ORIGIN,
    backendFirebaseProjectId: PROJECT, webAppConfigSha256: c.configurationSha256,
    callbackUrl: CALLBACK, firebaseProviderEnabled: true, metaAppMode: 'development',
    audience: 'app_roles_only', audienceVerified: true,
    providerReadbackSha256: facebookV2Digest({ candidateSha256: facebookV2Digest(c), journalSha256: facebookV2Digest(j), decisionSha256: facebookV2Digest(d) }),
    observedAtUtc: c.startedAtUtc, validUntilUtc: d.validUntilUtc };
  const envelope = { schemaVersion: 1, kind: 'sit-facebook-web-release-readiness',
    evidenceClass: c.syntheticFixture ? 'synthetic-fixture' : 'verified-external', syntheticFixture: c.syntheticFixture,
    configuration: c.configuration, configurationSha256: c.configurationSha256,
    readiness, readinessSha256: facebookV2Digest(readiness) };
  const evidenceSha256 = facebookV2Digest(envelope);
  if (!c.syntheticFixture) bindFacebookWebReadiness(envelope, evidenceSha256, { now: new Date(now) });
  return { envelope, evidenceSha256 };
}
