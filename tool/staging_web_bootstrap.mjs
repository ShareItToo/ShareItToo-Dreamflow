import fs from 'node:fs';
import path from 'node:path';
import { cleanSource, confinedDirectory, sha256, TARGET, validateArtifact } from './staging_web_contract.mjs';

const check = (value, code) => { if (!value) throw Error(`bootstrap_${code}`); };
const exists = (file) => { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const hash = /^[a-f0-9]{64}$/;
export const GATEWAY_BODY = 'ShareItToo staging gateway';
export const WEB_HANDLER = '\thandle {\n\t\theader Cache-Control "no-store"\n\t\theader X-Content-Type-Options "nosniff"\n\t\theader X-Frame-Options "DENY"\n\t\theader Referrer-Policy "strict-origin-when-cross-origin"\n\t\theader Permissions-Policy "camera=(self), microphone=(self), geolocation=(self)"\n\t\t# Existing /docker/shareittoo -> /app read-only mount; Production stays /app/current.\n\t\troot * /app/staging-web/current\n\t\tencode zstd gzip\n\t\ttry_files {path} /index.html\n\t\tfile_server\n\t}';
export function gatewayFromCandidate(candidate) {
  const parts = candidate.split('staging.shareittoo.com {');
  check(parts.length === 2 && parts[1].endsWith(`${WEB_HANDLER}\n}\n`) && candidate.split(WEB_HANDLER).length === 2, 'candidate_route_contract');
  return candidate.replace(WEB_HANDLER, `\thandle {\n\t\theader Cache-Control "no-store"\n\t\trespond "${GATEWAY_BODY}" 200\n\t}`);
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function ownedDirectory(directory, mode) {
  confinedDirectory(directory);
  const stat = fs.statSync(directory);
  check(stat.uid === process.getuid() && (mode ? (stat.mode & 0o777) === mode : (stat.mode & 0o022) === 0), 'directory_permissions');
}
export function privateFile(file) {
  ownedDirectory(path.dirname(file), 0o700);
  const stat = fs.lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600, 'private_file_permissions');
  return fs.readFileSync(file);
}
export function mountDigest(mounts) {
  const selected = mounts.map(({ Type, Source, Destination, RW, Mode }) => ({ Type, Source, Destination, RW, Mode }));
  return sha256(canonicalJson(selected.sort((a, b) => a.Destination.localeCompare(b.Destination))));
}
function hostFile(file, expected) {
  const stat = fs.lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === expected.uid && stat.gid === expected.gid && (stat.mode & 0o777) === 0o644 && stat.ino === expected.inode && stat.dev === expected.device, 'host_file_identity');
  return fs.readFileSync(file);
}
// An existing read-only Docker FILE bind requires preserving this exact inode.
function installInPlace(file, content, expected, afterTruncate = () => {}) {
  hostFile(file, expected);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    check(stat.ino === expected.inode && stat.dev === expected.device, 'host_file_raced');
    fs.ftruncateSync(fd, 0);
    afterTruncate();
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  check(sha256(hostFile(file, expected)) === sha256(content), 'config_write_readback');
}

/** Server adapter is mandatory. Tests inject it; the CLI binds actual commands. */
export function bootstrap({ hostRoot, manifest: m, sourceRoot, artifact, adapter, execute = false, fault = () => {} }) {
  check(m.schemaVersion === 1 && m.target === TARGET && /^web-bootstrap-[a-z0-9-]{1,64}$/.test(m.runId), 'manifest_identity');
  for (const field of ['artifactHash', 'gatewayConfigHash', 'candidateConfigHash', 'mountsHash', 'imageId', 'containerId']) check(hash.test(m[field]), 'manifest_hash');
  check(m.containerName === 'shareittoo-web' && /^caddy:2\.\d+-alpine$/.test(m.image) && /^v2\.\d+\.\d+$/.test(m.version), 'runtime_contract');
  check(Number.isSafeInteger(m.hostFile.inode) && Number.isSafeInteger(m.hostFile.device) && m.hostFile.uid === process.getuid() && m.hostFile.gid === process.getgid(), 'host_file_manifest');
  ownedDirectory(hostRoot);
  cleanSource(sourceRoot, m.source);
  validateArtifact(artifact, m.artifactHash, m.source);
  const config = path.join(hostRoot, 'Caddyfile');
  const root = path.join(hostRoot, 'staging-web');
  const backupDirectory = path.join(hostRoot, 'backups', 'staging-web-bootstrap');
  const backupPath = path.join(backupDirectory, `Caddyfile.${m.gatewayConfigHash}.backup`);
  const evidencePath = path.join(backupDirectory, `${m.runId}.json`);
  const backup = privateFile(backupPath);
  const candidate = fs.readFileSync(path.join(sourceRoot, 'backend/ops/Caddyfile'), 'utf8');
  check(sha256(backup) === m.gatewayConfigHash && sha256(candidate) === m.candidateConfigHash && Buffer.from(gatewayFromCandidate(candidate)).equals(backup), 'config_binding');
  check(!exists(evidencePath), 'evidence_collision');
  const destination = path.join(root, 'releases', m.artifactHash);
  const current = path.join(root, 'current');
  const linkTarget = `releases/${m.artifactHash}/web`;
  function absentWeb() {
    if (exists(root)) ownedDirectory(root);
    if (exists(path.join(root, 'releases'))) ownedDirectory(path.join(root, 'releases'));
    check(!exists(current) && !exists(path.join(root, 'previous')) && !exists(destination), 'existing_web_state');
    check(!exists(path.join(root, '.deployment-lock')), 'deployment_locked');
  }
  function runtime() {
    const state = adapter.inspect();
    check(state.id === m.containerId && state.name === m.containerName && state.image === m.image && state.imageId === `sha256:${m.imageId}` && state.running === true && state.version === m.version, 'runtime_drift');
    check(Array.isArray(state.args) && !state.args.some((arg) => /^--watch(?:=|$)/.test(arg)), 'config_watch_forbidden');
    check(mountDigest(state.mounts) === m.mountsHash, 'mount_drift');
    for (const [Source, Destination] of [[hostRoot, '/app'], [config, '/etc/caddy/Caddyfile']]) {
      const mounts = state.mounts.filter((entry) => entry.Destination === Destination);
      check(mounts.length === 1 && mounts[0].Type === 'bind' && mounts[0].Source === Source && mounts[0].RW === false && mounts[0].Mode === 'ro', 'required_readonly_mount');
    }
    check(!state.mounts.some((entry) => entry.Destination.startsWith('/app/')), 'shadow_mount');
  }
  function configReadback(content, active) {
    runtime();
    check(sha256(hostFile(config, m.hostFile)) === sha256(content) && sha256(adapter.mountedConfig()) === sha256(content), 'config_readback');
    check(canonicalJson(adapter.activeConfig()) === canonicalJson(active), 'active_config_readback');
  }
  function gatewayReadback() { check(Buffer.from(adapter.fetch('/')).equals(Buffer.from(GATEWAY_BODY)), 'gateway_readback'); }
  absentWeb();
  runtime();
  adapter.validate(backup);
  adapter.validate(Buffer.from(candidate));
  const oldActive = adapter.adapt(backup);
  const newActive = adapter.adapt(Buffer.from(candidate));
  configReadback(backup, oldActive);
  gatewayReadback();
  if (!execute) return { status: 'bootstrap-preflight-passed-no-mutation', source: m.source, artifactHash: m.artifactHash, gatewayConfigHash: m.gatewayConfigHash };

  // Same lock as ordinary deployment: no concurrent switch/recovery is allowed.
  if (!exists(root)) fs.mkdirSync(root, { mode: 0o755 });
  const lock = path.join(root, '.deployment-lock');
  fs.mkdirSync(lock, { mode: 0o700 });
  let configTouched = false;
  let configWriteCompleted = false;
  let currentCreated = false;
  let recoveryFailed = false;
  let journalCreated = false;
  const journal = { schemaVersion: 1, status: 'started', source: m.source, artifactHash: m.artifactHash, gatewayConfigHash: m.gatewayConfigHash, candidateConfigHash: m.candidateConfigHash };
  function record(status) {
    journal.status = status;
    if (!journalCreated) {
      fs.writeFileSync(evidencePath, `${JSON.stringify(journal)}\n`, { flag: 'wx', mode: 0o600 });
      journalCreated = true;
    } else {
      privateFile(evidencePath);
      fs.writeFileSync(evidencePath, `${JSON.stringify(journal)}\n`);
    }
  }
  try {
    check(!exists(current) && !exists(path.join(root, 'previous')) && !exists(destination), 'state_changed');
    check(sha256(privateFile(backupPath)) === m.gatewayConfigHash, 'backup_changed');
    configReadback(backup, oldActive);
    record('copying');
    cleanSource(sourceRoot, m.source);
    if (!exists(path.join(root, 'releases'))) fs.mkdirSync(path.join(root, 'releases'), { mode: 0o755 });
    fault('copy');
    ownedDirectory(root);
    ownedDirectory(path.join(root, 'releases'));
    check(!exists(destination) && !exists(current), 'state_changed');
    fs.cpSync(artifact, destination, { recursive: true, errorOnExist: true, force: false });
    validateArtifact(destination, m.artifactHash, m.source);
    fault('copied');
    fs.symlinkSync(linkTarget, current); // atomic creation; never replace an existing pointer
    currentCreated = true;
    configReadback(backup, oldActive);
    cleanSource(sourceRoot, m.source);
    record('installing-config');
    configTouched = true;
    installInPlace(config, candidate, m.hostFile, () => fault('config-install'));
    configWriteCompleted = true;
    fault('config-installed');
    check(sha256(adapter.mountedConfig()) === m.candidateConfigHash, 'mounted_candidate_readback');
    adapter.validate(Buffer.from(candidate));
    record('reloading');
    fault('reload');
    adapter.reload();
    fault('reloaded');
    configReadback(candidate, newActive);
    fault('readback');
    for (const name of ['index.html', 'staging_bootstrap.js', 'flutter_service_worker.js', 'staging-release.json']) {
      check(sha256(adapter.fetch(`/${name}?artifact=${m.artifactHash}`)) === sha256(fs.readFileSync(path.join(destination, 'web', name))), 'web_readback');
    }
    fault('verified');
    record('bootstrap-passed');
    return { ...journal };
  } catch (error) {
    try {
      runtime();
      check(sha256(privateFile(backupPath)) === m.gatewayConfigHash, 'backup_changed');
      if (configTouched) {
        const activeNow = canonicalJson(adapter.activeConfig());
        check([canonicalJson(oldActive), canonicalJson(newActive)].includes(activeNow), 'rollback_foreign_active_config');
        const currentConfig = hostFile(config, m.hostFile);
        const candidateBytes = Buffer.from(candidate);
        const ownInterruptedWrite = currentConfig.equals(backup) ||
          (currentConfig.length <= candidateBytes.length && candidateBytes.subarray(0, currentConfig.length).equals(currentConfig));
        check(ownInterruptedWrite && (!configWriteCompleted || currentConfig.equals(candidateBytes)), 'rollback_foreign_config');
        fault('rollback');
        installInPlace(config, backup, m.hostFile);
        adapter.validate(backup);
        adapter.reload();
      }
      configReadback(backup, oldActive);
      gatewayReadback();
      if (currentCreated) {
        check(fs.lstatSync(current).isSymbolicLink() && fs.readlinkSync(current) === linkTarget, 'rollback_pointer_changed');
        fs.unlinkSync(current);
      }
      if (journalCreated) record('failed-gateway-restored');
    } catch {
      recoveryFailed = true; // Retain lock and backup; operator must inspect interrupted state.
      try { if (journalCreated) record('rollback-failed-manual-recovery-required'); } catch { /* Never mask the hard failure. */ }
      throw Error('bootstrap_rollback_failed_manual_recovery_required');
    }
    throw error;
  } finally { if (!recoveryFailed) fs.rmdirSync(lock); }
}
