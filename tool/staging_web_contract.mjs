import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const TARGET = 'https://staging.shareittoo.com';
export const DEPLOY_ROOT = '/docker/shareittoo/staging-web';
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };
const hashPattern = /^[a-f0-9]{64}$/;
const sourcePattern = /^[a-f0-9]{40}$/;
export function profile(source, version) {
  return {
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
  function visit(relative) {
    for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
      requireThat(/^[A-Za-z0-9_.@+-]+$/.test(name) && name !== '.' && name !== '..', 'artifact_path_unsafe');
      const key = relative ? `${relative}/${name}` : name;
      const file = path.join(directory, key);
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(key);
      else {
        requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'artifact_special_file');
        files[key] = sha256(fs.readFileSync(file));
      }
    }
  }
  visit('');
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
export function sealArtifact({ directory, source, version, flutterVersion, builderDigest }) {
  requireThat(sourcePattern.test(source) && /^\d+\.\d+\.\d+\+\d+$/.test(version), 'build_identity_invalid');
  const web = path.join(directory, 'web');
  const index = path.join(web, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  const tag = '<script src="flutter_bootstrap.js" async></script>';
  requireThat(html.split(tag).length === 2, 'bootstrap_template_drift');
  fs.writeFileSync(index, html.replace(tag, '<script src="staging_bootstrap.js"></script>'));
  fs.writeFileSync(path.join(web, 'staging_bootstrap.js'), stagingBootstrap);
  fs.writeFileSync(path.join(web, 'flutter_service_worker.js'), retirementWorker);
  fs.writeFileSync(path.join(web, 'staging-release.json'), `${JSON.stringify({ target: TARGET, source, version, profileDigest: sha256(JSON.stringify(profile(source, version))) })}\n`);
  const manifest = { schemaVersion: 1, target: TARGET, api: `${TARGET}/api/v1`, source, version,
    sourceClean: true, mode: 'release', pwaStrategy: 'none', resourcesCdn: false,
    flutterVersion, builderDigest, profile: profile(source, version), files: inventory(web) };
  fs.writeFileSync(path.join(directory, 'staging-web-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  const manifestSha = sha256(fs.readFileSync(path.join(directory, 'staging-web-manifest.json')));
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${manifestSha}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([file, hash]) => `${hash}  web/${file}\n`).join('')}`, { flag: 'wx', mode: 0o644 });
  validateArtifact(directory, manifestSha, source);
  return manifestSha;
}
export function validateArtifact(directory, expectedHash, expectedSource) {
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
  requireThat(m.schemaVersion === 1 && m.target === TARGET && m.api === `${TARGET}/api/v1` && m.sourceClean === true &&
    m.mode === 'release' && m.pwaStrategy === 'none' && m.resourcesCdn === false &&
    sourcePattern.test(m.source) && (!expectedSource || m.source === expectedSource) &&
    /^\d+\.\d+\.\d+\+\d+$/.test(m.version) && hashPattern.test(m.builderDigest), 'artifact_identity_mismatch');
  requireThat(JSON.stringify(m.profile) === JSON.stringify(profile(m.source, m.version)), 'artifact_profile_mismatch');
  const actual = inventory(path.join(directory, 'web'));
  requireThat(JSON.stringify(actual) === JSON.stringify(m.files), 'artifact_integrity_mismatch');
  for (const required of ['index.html', 'main.dart.js', 'manifest.json', 'flutter_bootstrap.js']) requireThat(actual[required], 'artifact_required_file_missing');
  requireThat(fs.readFileSync(path.join(directory, 'web/staging_bootstrap.js'), 'utf8') === stagingBootstrap &&
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
  validateArtifact(path.join(root, 'releases', expectedHash), expectedHash);
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
  validateArtifact(artifact, manifestHash, source);
  const previous = currentRelease(root, currentHash);
  requireThat(currentHash !== manifestHash, 'deployment_already_current');
  const destination = path.join(root, 'releases', manifestHash);
  const checkDestination = () => {
    if (rollback) {
      requireThat(fs.lstatSync(path.join(root, 'previous')).isSymbolicLink() && fs.readlinkSync(path.join(root, 'previous')) === `releases/${manifestHash}/web`, 'rollback_pointer_mismatch');
      validateArtifact(destination, manifestHash, source);
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
    validateArtifact(destination, manifestHash, source);
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
