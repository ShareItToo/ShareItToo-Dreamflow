import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  FACEBOOK_WEB_PROFILE,
  FACEBOOK_WEB_TARGET,
  facebookWebFields,
  validateFacebookWebBinding,
} from './staging_facebook_web_readiness.mjs';
import {
  STAGING_ENROLLMENT_WEB_PROFILE,
  STAGING_ENROLLMENT_WEB_PROFILE_V2,
  STAGING_ENROLLMENT_WEB_TARGET,
  passwordEnrollmentWebReadinessVersion,
  validatePasswordEnrollmentWebBinding,
} from './staging_password_enrollment_web_readiness.mjs';

export const TARGET = 'https://staging.shareittoo.com';
export const DEPLOY_ROOT = '/docker/shareittoo/staging-web';
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };
const hashPattern = /^[a-f0-9]{64}$/;
const sourcePattern = /^[a-f0-9]{40}$/;
export const GOOGLE_WEB_PROFILE = 'staging-google-web-v1';
const googleFields = {
  projectId: 'SIT_FIREBASE_PROJECT_ID',
  messagingSenderId: 'SIT_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'SIT_FIREBASE_WEB_APP_ID',
  apiKey: 'SIT_FIREBASE_WEB_API_KEY',
  authDomain: 'SIT_FIREBASE_WEB_AUTH_DOMAIN',
  backendProjectId: 'SIT_FIREBASE_WEB_BACKEND_PROJECT_ID',
  authorizedOrigin: 'SIT_FIREBASE_WEB_AUTHORIZED_ORIGIN',
};
// This is a public SDK configuration, never a service account or OAuth secret.
// Its independently reviewed digest is an input, not approval created here.
export function bindGoogleWebConfig(config, digest) {
  requireThat(config && Object.getPrototypeOf(config) === Object.prototype &&
    Object.keys(config).sort().join(',') === Object.keys(googleFields).sort().join(',') &&
    Object.values(config).every((value) => typeof value === 'string'), 'google_web_config_shape');
  const canonical = Object.fromEntries(Object.keys(googleFields).map((key) => [key, config[key]]));
  requireThat(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) &&
    /^[0-9]{6,20}$/.test(config.messagingSenderId) &&
    new RegExp(`^1:${config.messagingSenderId}:web:[a-f0-9]{16,64}$`).test(config.appId) &&
    /^AIza[A-Za-z0-9_-]{35}$/.test(config.apiKey) &&
    config.authDomain === `${config.projectId}.firebaseapp.com` &&
    config.backendProjectId === config.projectId && config.authorizedOrigin === TARGET, 'google_web_config_invalid');
  requireThat(hashPattern.test(digest) && sha256(JSON.stringify(canonical)) === digest, 'google_web_config_digest_mismatch');
  return { config: canonical, digest };
}
export function readGoogleWebConfig(file, digest) {
  requireThat(path.isAbsolute(file) && path.normalize(file) === file, 'google_web_config_path');
  confinedDirectory(path.dirname(file));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    requireThat(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o600 && stat.size <= 4096, 'google_web_config_file');
    const bytes = fs.readFileSync(fd);
    requireThat(bytes.length === stat.size, 'google_web_config_file');
    let value;
    try { value = JSON.parse(bytes); } catch { throw Error('google_web_config_json'); }
    return bindGoogleWebConfig(value, digest);
  } finally { fs.closeSync(fd); }
}
function sameFirebaseWebApp(googleWeb, facebookWeb) {
  return googleWeb.config.projectId === facebookWeb.config.projectId &&
    googleWeb.config.messagingSenderId === facebookWeb.config.messagingSenderId &&
    googleWeb.config.appId === facebookWeb.config.appId &&
    googleWeb.config.apiKey === facebookWeb.config.apiKey &&
    googleWeb.config.authDomain === facebookWeb.config.authDomain;
}

export function profile(source, version, googleWeb = null, facebookWeb = null, passwordEnrollment = null) {
  requireThat(TARGET === FACEBOOK_WEB_TARGET, 'facebook_web_target_mismatch');
  requireThat(TARGET === STAGING_ENROLLMENT_WEB_TARGET, 'password_enrollment_web_target_mismatch');
  const result = {
    SIT_BACKEND_ENABLED: 'true', SIT_API_BASE_URL: `${TARGET}/api/v1`,
    SIT_APP_COMMIT: source, SIT_BUILD_NUMBER: version.split('+')[1],
    SIT_CLIENT_BUILD: version, SIT_RELEASE_CHANNEL: 'internal', SIT_BUNDLE_ID: 'com.shareittoo.app',
    SIT_BLUE_OCEAN_LISTING_ASSISTANT: 'false', SIT_STAGE_A_NON_BINDING_PILOT: 'false',
    SIT_STAGE_A_PILOT_ID: '',
    SIT_SYNTHETIC_CLONE_BOOKING_LANE: 'false', SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: 'false',
    SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED: 'false', SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED: 'false',
    SIT_PLANNER_TECHNICAL_UI_ENABLED: 'false', SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED: 'false',
    SIT_LISTING_SETS_TECHNICAL_UI_ENABLED: 'false', SIT_SOCIAL_GOOGLE_ENABLED: 'false',
    SIT_SOCIAL_APPLE_ENABLED: 'false', SIT_SOCIAL_FACEBOOK_ENABLED: 'false',
    SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED: 'false',
  };
  if (googleWeb !== null) {
    requireThat(googleWeb && Object.keys(googleWeb).sort().join(',') === 'config,digest', 'google_web_binding_shape');
    const bound = bindGoogleWebConfig(googleWeb.config, googleWeb.digest);
    result.SIT_SOCIAL_GOOGLE_ENABLED = 'true';
    result.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED = 'true';
    for (const [key, define] of Object.entries(googleFields)) result[define] = bound.config[key];
    result.SIT_FIREBASE_WEB_CONFIG_SHA256 = bound.digest;
    googleWeb = bound;
  }
  if (facebookWeb !== null) {
    const bound = validateFacebookWebBinding(facebookWeb);
    if (googleWeb !== null) {
      requireThat(sameFirebaseWebApp(googleWeb, bound), 'facebook_google_web_app_mismatch');
    }
    result.SIT_SOCIAL_FACEBOOK_ENABLED = 'true';
    result.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED = 'true';
    for (const [key, define] of Object.entries(facebookWebFields)) {
      result[define] = bound.config[key];
    }
    result.SIT_FACEBOOK_WEB_CONFIG_SHA256 = bound.configDigest;
    result.SIT_FACEBOOK_WEB_READINESS_JSON = bound.readinessJson;
    result.SIT_FACEBOOK_WEB_READINESS_SHA256 = bound.readinessDigest;
  }
  if (passwordEnrollment !== null) {
    const bound = validatePasswordEnrollmentWebBinding(passwordEnrollment, {
      expectedSource: source,
      expectedVersion: version,
    });
    result.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED = 'true';
    result.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_JSON = bound.readinessJson;
    result.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_SHA256 = bound.readinessDigest;
  }
  return result;
}
export function cleanSource(root, expected) {
  confinedDirectory(root);
  requireThat(sourcePattern.test(expected), 'source_sha_invalid');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  requireThat(git('rev-parse', '--show-toplevel') === fs.realpathSync(root), 'source_root_mismatch');
  requireThat(git('rev-parse', 'HEAD') === expected, 'source_head_mismatch');
  requireThat(git('status', '--porcelain', '--untracked-files=all') === '', 'source_dirty');
}
// Every component is checked, including parents: realpath alone would accept an alias.
export function confinedDirectory(directory) {
  requireThat(path.isAbsolute(directory) && path.normalize(directory) === directory && directory !== '/', 'path_unsafe');
  let cursor = '/';
  for (const part of directory.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'path_symlink_or_not_directory');
  }
  return directory;
}
export function inventory(directory) {
  confinedDirectory(directory);
  const files = {};
  const directories = [];
  const stat = (file) => fs.lstatSync(file, { bigint: true });
  const fstat = (fd) => fs.fstatSync(fd, { bigint: true });
  const same = (a, b) => ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => a[key] === b[key]);
  const unchanged = (expected, actual) => requireThat(same(expected, actual), 'artifact_inventory_changed');
  const checkDirectories = () => {
    for (const entry of directories) {
      unchanged(entry.stat, fstat(entry.fd));
      unchanged(entry.stat, stat(entry.file));
    }
  };
  function readFile(file, expected) {
    // Never re-open a checked pathname for the actual read. NONBLOCK also
    // prevents a raced FIFO from blocking before its descriptor is rejected.
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      unchanged(expected, fstat(fd));
      checkDirectories();
      unchanged(expected, stat(file));
      requireThat(expected.size <= BigInt(Number.MAX_SAFE_INTEGER), 'artifact_inventory_changed');
      const digest = crypto.createHash('sha256'); const buffer = Buffer.alloc(64 * 1024);
      const size = Number(expected.size); let offset = 0;
      while (offset < size) {
        const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
        requireThat(count > 0, 'artifact_inventory_changed');
        digest.update(buffer.subarray(0, count)); offset += count;
      }
      requireThat(fs.readSync(fd, buffer, 0, 1, size) === 0, 'artifact_inventory_changed');
      unchanged(expected, fstat(fd));
      unchanged(expected, stat(file));
      checkDirectories();
      return digest.digest('hex');
    } finally { fs.closeSync(fd); }
  }
  function visit(relative, expected) {
    const file = path.join(directory, relative);
    requireThat(expected.isDirectory() && !expected.isSymbolicLink(), 'artifact_special_file');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      unchanged(expected, fstat(fd));
      directories.push({ file, fd, stat: expected });
      try {
        checkDirectories();
        const names = fs.readdirSync(file).sort();
        checkDirectories();
        for (const name of names) {
          requireThat(/^[A-Za-z0-9_.@+-]+$/.test(name) && name !== '.' && name !== '..', 'artifact_path_unsafe');
          checkDirectories();
          const key = relative ? `${relative}/${name}` : name;
          const child = path.join(directory, key); const observed = stat(child);
          if (observed.isDirectory()) visit(key, observed);
          else {
            requireThat(observed.isFile() && !observed.isSymbolicLink() && observed.nlink === 1n, 'artifact_special_file');
            files[key] = readFile(child, observed);
          }
        }
        checkDirectories();
      } finally { directories.pop(); }
    } finally { fs.closeSync(fd); }
  }
  try {
    visit('', stat(directory));
  } catch (error) {
    // Filesystem exceptions can contain paths. Do not publish partial inventory.
    if (['artifact_inventory_changed', 'artifact_special_file', 'artifact_path_unsafe'].includes(error.message)) throw error;
    throw Error('artifact_inventory_changed');
  }
  return files;
}

// Staging owns this origin's Flutter caches only, never application/user storage.
export const retirementWorker = `self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
if(self.location.origin!=='${TARGET}')return;
for(const key of ['flutter-app-cache','flutter-temp-cache','flutter-app-manifest'])await caches.delete(key);
await self.registration.unregister();
})()));
`;
// Immutable v1 bytes remain valid only for an existing current/rollback artifact.
export const stagingBootstrap = `(async()=>{
try {
if(location.origin!=='${TARGET}')throw Error('staging_origin_required');
await Promise.race([(async()=>{
if('serviceWorker' in navigator){
for(const registration of await navigator.serviceWorker.getRegistrations()){
const worker=registration.active||registration.waiting||registration.installing;
if(worker && new URL(worker.scriptURL).pathname==='/flutter_service_worker.js')await registration.unregister();
}
}
if('caches' in window)for(const key of ['flutter-app-cache','flutter-temp-cache','flutter-app-manifest'])await caches.delete(key);
})(),new Promise((_,reject)=>setTimeout(()=>reject(Error('cache_retirement_timeout')),8000))]);
if(navigator.serviceWorker?.controller){
if(sessionStorage.getItem('sit-staging-worker-retirement')==='reloaded')throw Error('stale_worker_still_controls_page');
sessionStorage.setItem('sit-staging-worker-retirement','reloaded'); location.reload(); return;
}
sessionStorage.removeItem('sit-staging-worker-retirement');
const script=document.createElement('script');script.src='/flutter_bootstrap.js';document.body.appendChild(script);
}catch(_){document.body.textContent='Staging konnte den Offline-Cache nicht sicher entfernen. Bitte diesen Tab schließen und Staging erneut öffnen.';}
})();
`;

// Serialized into the sealed Staging bootstrap, never into Production or Dart.
function monitorStagingRelease(expected) {
  if (location.origin !== 'https://staging.shareittoo.com' || !expected ||
      Object.keys(expected).sort().join(',') !== 'profileDigest,source,version' ||
      typeof expected.source !== 'string' || !/^[a-f0-9]{40}$/.test(expected.source) ||
      typeof expected.version !== 'string' || !/^\d+\.\d+\.\d+\+\d+$/.test(expected.version) ||
      typeof expected.profileDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expected.profileDigest)) return;
  let timer = null; let inFlight = false; let notified = false;
  let lastAttempt = -Infinity; let failures = 0;
  const visible = () => document.visibilityState === 'visible';
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  function schedule() {
    clearTimer();
    if (!notified && visible() && failures < 3) timer = setTimeout(check, 300000);
  }
  function notify() {
    notified = true; clearTimer();
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', visibilityChanged);
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.setAttribute('aria-atomic', 'true');
    notice.textContent = 'Neue sichere Staging-Version verfügbar. Eingaben sichern und Seite manuell neu laden';
    Object.assign(notice.style, { position: 'fixed', top: '12px', left: '12px', right: '12px',
      zIndex: '2147483647', padding: '16px', background: '#fff', color: '#111',
      border: '2px solid #333', borderRadius: '8px', font: '16px/1.5 sans-serif',
      maxHeight: '40vh', overflow: 'auto' });
    document.body.appendChild(notice);
  }
  async function check() {
    if (notified || inFlight || !visible() || Date.now() - lastAttempt < 30000) return;
    clearTimer(); inFlight = true; lastAttempt = Date.now();
    const controller = new AbortController(); let deadline;
    try {
      const info = await Promise.race([
        (async () => {
          const response = await fetch('/staging-release.json', {
            cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
          });
          if (!response.ok || response.status !== 200 || response.redirected ||
              response.url !== `${location.origin}/staging-release.json` ||
              response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw Error('release_response_invalid');
          const text = await response.text();
          if (text.length > 4096) throw Error('release_response_oversized');
          const value = JSON.parse(text);
          if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'profileDigest,source,target,version' ||
              value.target !== location.origin || typeof value.source !== 'string' || !/^[a-f0-9]{40}$/.test(value.source) ||
              typeof value.version !== 'string' || !/^\d+\.\d+\.\d+\+\d+$/.test(value.version) ||
              typeof value.profileDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.profileDigest)) throw Error('release_identity_invalid');
          return value;
        })(),
        new Promise((_, reject) => { deadline = setTimeout(() => {
          controller.abort(); reject(Error('release_check_timeout'));
        }, 8000); }),
      ]);
      failures = 0;
      if (visible() && (info.source !== expected.source || info.version !== expected.version ||
          info.profileDigest !== expected.profileDigest)) notify();
    } catch (_) {
      failures += 1; // Three automatic attempts maximum; focus/resume can retry later.
    } finally {
      clearTimeout(deadline); inFlight = false; schedule();
    }
  }
  function visibilityChanged() { if (visible()) { void check(); schedule(); } else clearTimer(); }
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', visibilityChanged);
  void check();
}

export function stagingBootstrapFor(source, version, googleWeb = null, facebookWeb = null, passwordEnrollment = null) {
  requireThat(sourcePattern.test(source), 'source_sha_invalid');
  requireThat(/^\d+\.\d+\.\d+\+\d+$/.test(version), 'build_identity_invalid');
  const identity = { source, version, profileDigest: sha256(JSON.stringify(profile(source, version, googleWeb, facebookWeb, passwordEnrollment))) };
  return stagingBootstrap.replace('document.body.appendChild(script);',
    `document.body.appendChild(script);\n(${monitorStagingRelease.toString()})(${JSON.stringify(identity)});`);
}

export function sealArtifact({ directory, source, version, flutterVersion, builderDigest, googleWeb = null, facebookWeb = null, passwordEnrollment = null }) {
  requireThat(sourcePattern.test(source) && /^\d+\.\d+\.\d+\+\d+$/.test(version), 'build_identity_invalid');
  if (facebookWeb !== null) {
    validateFacebookWebBinding(facebookWeb, { freshAt: new Date() });
  }
  if (passwordEnrollment !== null) {
    passwordEnrollment = validatePasswordEnrollmentWebBinding(passwordEnrollment, {
      expectedSource: source,
      expectedVersion: version,
      freshAt: new Date(),
    });
  }
  const passwordEnrollmentVersion = passwordEnrollment === null
    ? null : passwordEnrollmentWebReadinessVersion(passwordEnrollment);
  const artifactSchemaVersion = passwordEnrollmentVersion === 2
    ? 5 : passwordEnrollment ? 4 : facebookWeb ? 3 : googleWeb ? 2 : 1;
  const buildProfile = profile(source, version, googleWeb, facebookWeb, passwordEnrollment);
  const web = path.join(directory, 'web');
  const index = path.join(web, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  const tag = '<script src="flutter_bootstrap.js" async></script>';
  requireThat(html.split(tag).length === 2, 'bootstrap_template_drift');
  fs.writeFileSync(index, html.replace(tag, '<script src="staging_bootstrap.js"></script>'));
  fs.writeFileSync(path.join(web, 'staging_bootstrap.js'), stagingBootstrapFor(source, version, googleWeb, facebookWeb, passwordEnrollment));
  fs.writeFileSync(path.join(web, 'flutter_service_worker.js'), retirementWorker);
  fs.writeFileSync(path.join(web, 'staging-release.json'), `${JSON.stringify({ target: TARGET, source, version, profileDigest: sha256(JSON.stringify(buildProfile)) })}\n`);
  const manifest = { schemaVersion: artifactSchemaVersion, bootstrapContractVersion: 2,
    ...(passwordEnrollment ? {
      profileContractVersion: passwordEnrollmentVersion === 2
        ? STAGING_ENROLLMENT_WEB_PROFILE_V2 : STAGING_ENROLLMENT_WEB_PROFILE,
      ...(googleWeb ? { googleWebConfigDigest: googleWeb.digest } : {}),
      ...(facebookWeb ? {
        facebookWebConfigDigest: facebookWeb.configDigest,
        facebookWebReadinessDigest: facebookWeb.readinessDigest,
        facebookWebEvidenceDigest: facebookWeb.evidenceDigest,
        facebookWebValidatedAtUtc: facebookWeb.validatedAtUtc,
      } : {}),
      passwordEnrollmentReadinessDigest: passwordEnrollment.readinessDigest,
      passwordEnrollmentEvidenceDigest: passwordEnrollment.evidenceDigest,
      passwordEnrollmentValidatedAtUtc: passwordEnrollment.validatedAtUtc,
    } : facebookWeb ? {
      profileContractVersion: FACEBOOK_WEB_PROFILE,
      ...(googleWeb ? { googleWebConfigDigest: googleWeb.digest } : {}),
      facebookWebConfigDigest: facebookWeb.configDigest,
      facebookWebReadinessDigest: facebookWeb.readinessDigest,
      facebookWebEvidenceDigest: facebookWeb.evidenceDigest,
      facebookWebValidatedAtUtc: facebookWeb.validatedAtUtc,
    } : googleWeb ? {
      profileContractVersion: GOOGLE_WEB_PROFILE,
      googleWebConfigDigest: googleWeb.digest,
    } : {}),
    target: TARGET, api: `${TARGET}/api/v1`, source, version,
    sourceClean: true, mode: 'release', pwaStrategy: 'none', resourcesCdn: false,
    flutterVersion, builderDigest, profile: buildProfile, files: inventory(web) };
  fs.writeFileSync(path.join(directory, 'staging-web-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  const manifestSha = sha256(fs.readFileSync(path.join(directory, 'staging-web-manifest.json')));
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${manifestSha}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([file, hash]) => `${hash}  web/${file}\n`).join('')}`, { flag: 'wx', mode: 0o644 });
  validateArtifact(directory, manifestSha, source);
  return manifestSha;
}
export function validateArtifact(directory, expectedHash, expectedSource, { mode = 'candidate' } = {}) {
  requireThat(['candidate', 'current', 'rollback'].includes(mode), 'artifact_validation_mode_invalid');
  confinedDirectory(directory);
  requireThat(hashPattern.test(expectedHash), 'manifest_hash_required');
  requireThat(JSON.stringify(fs.readdirSync(directory).sort()) === JSON.stringify(['SHA256SUMS', 'staging-web-manifest.json', 'web']), 'artifact_outer_inventory');
  for (const name of ['SHA256SUMS', 'staging-web-manifest.json']) {
    const stat = fs.lstatSync(path.join(directory, name));
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'manifest_special_file');
  }
  const bytes = fs.readFileSync(path.join(directory, 'staging-web-manifest.json'));
  requireThat(sha256(bytes) === expectedHash, 'manifest_hash_mismatch');
  const m = JSON.parse(bytes);
  let googleWeb = null;
  let facebookWeb = null;
  let passwordEnrollment = null;
  const providerMetadata = Object.keys(m).filter((key) => [
    'profileContractVersion',
    'googleWebConfigDigest',
    'facebookWebConfigDigest',
    'facebookWebReadinessDigest',
    'facebookWebEvidenceDigest',
    'facebookWebValidatedAtUtc',
    'passwordEnrollmentReadinessDigest',
    'passwordEnrollmentEvidenceDigest',
    'passwordEnrollmentValidatedAtUtc',
  ].includes(key)).sort();
  if ([4, 5].includes(m.schemaVersion)) {
    const passwordEnrollmentVersion = m.schemaVersion === 5 ? 2 : 1;
    const googleEnabled = m.profile?.SIT_SOCIAL_GOOGLE_ENABLED === 'true';
    const facebookEnabled = m.profile?.SIT_SOCIAL_FACEBOOK_ENABLED === 'true';
    const expectedKeys = [
      'schemaVersion',
      'bootstrapContractVersion',
      'profileContractVersion',
      ...(googleEnabled ? ['googleWebConfigDigest'] : []),
      ...(facebookEnabled ? [
        'facebookWebConfigDigest',
        'facebookWebReadinessDigest',
        'facebookWebEvidenceDigest',
        'facebookWebValidatedAtUtc',
      ] : []),
      'passwordEnrollmentReadinessDigest',
      'passwordEnrollmentEvidenceDigest',
      'passwordEnrollmentValidatedAtUtc',
      'target',
      'api',
      'source',
      'version',
      'sourceClean',
      'mode',
      'pwaStrategy',
      'resourcesCdn',
      'flutterVersion',
      'builderDigest',
      'profile',
      'files',
    ].sort();
    requireThat(m.profileContractVersion === (passwordEnrollmentVersion === 2
      ? STAGING_ENROLLMENT_WEB_PROFILE_V2 : STAGING_ENROLLMENT_WEB_PROFILE)
      && m.bootstrapContractVersion === 2
      && JSON.stringify(Object.keys(m).sort()) === JSON.stringify(expectedKeys)
      && m.profile?.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED ===
        (googleEnabled || facebookEnabled ? 'true' : 'false'),
    'artifact_password_enrollment_web_contract');
    requireThat(JSON.stringify(providerMetadata) === JSON.stringify([
      ...(facebookEnabled ? [
        'facebookWebConfigDigest',
        'facebookWebEvidenceDigest',
        'facebookWebReadinessDigest',
        'facebookWebValidatedAtUtc',
      ] : []),
      ...(googleEnabled ? ['googleWebConfigDigest'] : []),
      'passwordEnrollmentEvidenceDigest',
      'passwordEnrollmentReadinessDigest',
      'passwordEnrollmentValidatedAtUtc',
      'profileContractVersion',
    ].sort()), 'artifact_password_enrollment_web_contract');
    if (facebookEnabled) {
      facebookWeb = validateFacebookWebBinding({
        config: Object.fromEntries(Object.entries(facebookWebFields)
          .map(([key, define]) => [key, m.profile?.[define]])),
        configDigest: m.facebookWebConfigDigest,
        readinessJson: m.profile?.SIT_FACEBOOK_WEB_READINESS_JSON,
        readinessDigest: m.facebookWebReadinessDigest,
        evidenceDigest: m.facebookWebEvidenceDigest,
        validatedAtUtc: m.facebookWebValidatedAtUtc,
      }, { freshAt: mode === 'candidate' ? new Date() : null });
    }
    if (googleEnabled) {
      googleWeb = bindGoogleWebConfig(Object.fromEntries(Object.entries(googleFields)
        .map(([key, define]) => [key, m.profile?.[define]])), m.googleWebConfigDigest);
    }
    if (googleEnabled && facebookEnabled) {
      requireThat(sameFirebaseWebApp(googleWeb, facebookWeb), 'facebook_google_web_app_mismatch');
    }
    passwordEnrollment = validatePasswordEnrollmentWebBinding({
      readinessJson: m.profile?.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_JSON,
      readinessDigest: m.passwordEnrollmentReadinessDigest,
      evidenceDigest: m.passwordEnrollmentEvidenceDigest,
      validatedAtUtc: m.passwordEnrollmentValidatedAtUtc,
    }, {
      expectedSource: m.source,
      expectedVersion: m.version,
      freshAt: mode === 'candidate' ? new Date() : null,
    });
    requireThat(
      passwordEnrollmentWebReadinessVersion(passwordEnrollment) === passwordEnrollmentVersion,
      'artifact_password_enrollment_web_contract',
    );
  } else if (m.schemaVersion === 3) {
    const expectedKeys = [
      'schemaVersion',
      'bootstrapContractVersion',
      'profileContractVersion',
      ...(m.profile?.SIT_SOCIAL_GOOGLE_ENABLED === 'true' ? ['googleWebConfigDigest'] : []),
      'facebookWebConfigDigest',
      'facebookWebReadinessDigest',
      'facebookWebEvidenceDigest',
      'facebookWebValidatedAtUtc',
      'target',
      'api',
      'source',
      'version',
      'sourceClean',
      'mode',
      'pwaStrategy',
      'resourcesCdn',
      'flutterVersion',
      'builderDigest',
      'profile',
      'files',
    ].sort();
    requireThat(m.profileContractVersion === FACEBOOK_WEB_PROFILE
      && m.bootstrapContractVersion === 2
      && JSON.stringify(Object.keys(m).sort()) === JSON.stringify(expectedKeys),
    'artifact_facebook_web_contract');
    const googleEnabled = m.profile?.SIT_SOCIAL_GOOGLE_ENABLED === 'true';
    const expectedMetadata = [
      'profileContractVersion',
      ...(googleEnabled ? ['googleWebConfigDigest'] : []),
      'facebookWebConfigDigest',
      'facebookWebReadinessDigest',
      'facebookWebEvidenceDigest',
      'facebookWebValidatedAtUtc',
    ].sort();
    requireThat(JSON.stringify(providerMetadata) === JSON.stringify(expectedMetadata),
      'artifact_facebook_web_contract');
    facebookWeb = validateFacebookWebBinding({
      config: Object.fromEntries(Object.entries(facebookWebFields)
        .map(([key, define]) => [key, m.profile?.[define]])),
      configDigest: m.facebookWebConfigDigest,
      readinessJson: m.profile?.SIT_FACEBOOK_WEB_READINESS_JSON,
      readinessDigest: m.facebookWebReadinessDigest,
      evidenceDigest: m.facebookWebEvidenceDigest,
      validatedAtUtc: m.facebookWebValidatedAtUtc,
    }, { freshAt: mode === 'candidate' ? new Date() : null });
    if (googleEnabled) {
      googleWeb = bindGoogleWebConfig(Object.fromEntries(Object.entries(googleFields)
        .map(([key, define]) => [key, m.profile?.[define]])), m.googleWebConfigDigest);
      requireThat(sameFirebaseWebApp(googleWeb, facebookWeb), 'facebook_google_web_app_mismatch');
    }
  } else if (m.schemaVersion === 2) {
    requireThat(m.profileContractVersion === GOOGLE_WEB_PROFILE && m.bootstrapContractVersion === 2, 'artifact_google_web_contract');
    requireThat(JSON.stringify(providerMetadata) === JSON.stringify([
      'googleWebConfigDigest', 'profileContractVersion',
    ]), 'artifact_google_web_contract');
    googleWeb = bindGoogleWebConfig(Object.fromEntries(Object.entries(googleFields).map(([key, define]) => [key, m.profile?.[define]])), m.googleWebConfigDigest);
  } else requireThat(providerMetadata.length === 0, 'artifact_provider_web_contract');
  const legacy = !Object.hasOwn(m, 'bootstrapContractVersion');
  requireThat(legacy ? mode !== 'candidate' : m.bootstrapContractVersion === 2, 'artifact_bootstrap_contract');
  requireThat([1, 2, 3, 4, 5].includes(m.schemaVersion) && m.target === TARGET && m.api === `${TARGET}/api/v1` && m.sourceClean === true &&
    m.mode === 'release' && m.pwaStrategy === 'none' && m.resourcesCdn === false &&
    sourcePattern.test(m.source) && (!expectedSource || m.source === expectedSource) &&
    /^\d+\.\d+\.\d+\+\d+$/.test(m.version) && hashPattern.test(m.builderDigest), 'artifact_identity_mismatch');
  requireThat(JSON.stringify(m.profile) === JSON.stringify(profile(m.source, m.version, googleWeb, facebookWeb, passwordEnrollment)), 'artifact_profile_mismatch');
  const actual = inventory(path.join(directory, 'web'));
  requireThat(JSON.stringify(actual) === JSON.stringify(m.files), 'artifact_integrity_mismatch');
  for (const required of ['index.html', 'main.dart.js', 'manifest.json', 'flutter_bootstrap.js']) requireThat(actual[required], 'artifact_required_file_missing');
  requireThat(fs.readFileSync(path.join(directory, 'web/staging_bootstrap.js'), 'utf8') === (legacy ? stagingBootstrap : stagingBootstrapFor(m.source, m.version, googleWeb, facebookWeb, passwordEnrollment)) &&
    fs.readFileSync(path.join(directory, 'web/flutter_service_worker.js'), 'utf8') === retirementWorker &&
    fs.readFileSync(path.join(directory, 'web/index.html'), 'utf8').includes('<script src="staging_bootstrap.js"></script>'), 'artifact_cache_contract');
  requireThat(fs.readFileSync(path.join(directory, 'web/staging-release.json'), 'utf8') === `${JSON.stringify({ target: TARGET, source: m.source, version: m.version, profileDigest: sha256(JSON.stringify(m.profile)) })}\n`, 'artifact_served_identity');
  const sums = `${expectedHash}  staging-web-manifest.json\n${Object.entries(m.files).map(([file, hash]) => `${hash}  web/${file}\n`).join('')}`;
  requireThat(fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8') === sums, 'artifact_checksums_mismatch');
  return m;
}
function currentRelease(root, expectedHash) {
  requireThat(hashPattern.test(expectedHash), 'current_hash_required');
  const current = path.join(root, 'current');
  requireThat(fs.lstatSync(current).isSymbolicLink(), 'current_not_symlink');
  const target = fs.readlinkSync(current);
  requireThat(target === `releases/${expectedHash}/web`, 'current_binding_mismatch');
  validateArtifact(path.join(root, 'releases', expectedHash), expectedHash, undefined, { mode: 'current' });
  return target;
}
function switchLink(root, name, target) {
  const temporary = path.join(root, `.switch-${crypto.randomUUID()}`);
  try {
    fs.symlinkSync(target, temporary);
    fs.renameSync(temporary, path.join(root, name));
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function deploy({ root, target, artifact, manifestHash, sourceRoot, source, currentHash, execute = false, rollback = false, verify = () => { throw Error('deployment_readback_required'); }, fault = () => {} }) {
  requireThat(target === TARGET, 'deployment_target_forbidden');
  confinedDirectory(root);
  requireThat(path.basename(root) === 'staging-web', 'deployment_root_forbidden');
  requireThat((fs.statSync(root).mode & 0o022) === 0, 'deployment_root_writable');
  requireThat(fs.statSync(root).uid === process.getuid(), 'deployment_root_owner');
  confinedDirectory(path.join(root, 'releases'));
  requireThat((fs.statSync(path.join(root, 'releases')).mode & 0o022) === 0 && fs.statSync(path.join(root, 'releases')).uid === process.getuid(), 'releases_permissions');
  cleanSource(sourceRoot, source);
  const validationMode = rollback ? 'rollback' : 'candidate';
  validateArtifact(artifact, manifestHash, source, { mode: validationMode });
  const previous = currentRelease(root, currentHash);
  requireThat(currentHash !== manifestHash, 'deployment_already_current');
  const destination = path.join(root, 'releases', manifestHash);
  const checkDestination = () => {
    if (rollback) {
      requireThat(fs.lstatSync(path.join(root, 'previous')).isSymbolicLink() && fs.readlinkSync(path.join(root, 'previous')) === `releases/${manifestHash}/web`, 'rollback_pointer_mismatch');
      validateArtifact(destination, manifestHash, source, { mode: 'rollback' });
    } else requireThat(!fs.existsSync(destination), 'release_collision');
  };
  checkDestination();
  if (!execute) return { status: 'preflight-passed-no-mutation', source, manifestHash, currentHash };
  const lock = path.join(root, '.deployment-lock');
  fs.mkdirSync(lock, { mode: 0o700 });
  let switched = false;
  try {
    requireThat(currentRelease(root, currentHash) === previous, 'current_changed');
    checkDestination();
    if (!rollback) fs.cpSync(artifact, destination, { recursive: true, errorOnExist: true, force: false });
    validateArtifact(destination, manifestHash, source, { mode: validationMode });
    fault('copied');
    // Write recovery pointer BEFORE atomic current replacement; never delete old releases.
    switchLink(root, 'previous', previous);
    fault('previous');
    requireThat(currentRelease(root, currentHash) === previous, 'current_changed');
    switchLink(root, 'current', `releases/${manifestHash}/web`);
    switched = true;
    fault('switched');
    currentRelease(root, manifestHash);
    verify({ source, manifestHash, directory: destination });
    fault('verified');
    return { status: 'deployed', source, manifestHash, previousHash: currentHash };
  } catch (error) {
    if (switched) {
      try {
        fault('rollback');
        switchLink(root, 'current', previous);
        currentRelease(root, currentHash);
      } catch { throw new Error('rollback_failed_manual_recovery_required'); }
    }
    throw error;
  } finally { fs.rmdirSync(lock); }
}
