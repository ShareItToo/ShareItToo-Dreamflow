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
// `caddy adapt --config /dev/stdin` records only its input filename in a
// generated file_server `hide` entry. A live reload from the mounted file
// records `/etc/caddy/Caddyfile`; no other path or config difference is ignored.
export function normalizedCaddyConfig(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => key === 'hide' && item === '/dev/stdin'
      ? '/etc/caddy/Caddyfile'
      : normalizedCaddyConfig(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) =>
      [childKey, normalizedCaddyConfig(child, childKey)]));
  }
  return value;
}
function ownedDirectory(directory, mode) {
  confinedDirectory(directory);
  const stat = fs.statSync(directory);
  check(stat.uid === process.getuid() && (mode ? (stat.mode & 0o777) === mode : (stat.mode & 0o022) === 0), 'directory_permissions');
  return stat;
}
const sameFile = (a, b) => ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
const fileStat = file => fs.lstatSync(file, { bigint: true });
function fileIo(action) {
  try { return action(); } catch (error) {
    if (/^bootstrap_[a-z_]+$/.test(error?.message)) throw error;
    throw Error('bootstrap_file_operation_failed');
  }
}
function permissions(stat, mode, expected) {
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.uid === BigInt(process.getuid())
    && (stat.mode & 0o7777n) === BigInt(mode), 'file_permissions');
  if (expected) check(stat.ino === BigInt(expected.inode) && stat.dev === BigInt(expected.device)
    && stat.uid === BigInt(expected.uid) && stat.gid === BigInt(expected.gid), 'host_file_identity');
}
function descriptorState(file, fd, mode, expected, parent) {
  const currentParent = ownedDirectory(path.dirname(file), mode === 0o600 ? 0o700 : undefined);
  check(['dev', 'ino', 'uid', 'gid', 'mode'].every(key => parent[key] === currentParent[key]), 'file_parent_changed');
  const stat = fs.fstatSync(fd, { bigint: true }); permissions(stat, mode, expected);
  check(sameFile(stat, fileStat(file)), 'file_identity_changed');
  return stat;
}
function readDescriptor(file, fd, mode, expected, parent) {
  const before = descriptorState(file, fd, mode, expected, parent);
  // Match the server adapter's 8 MiB command ceiling; never allocate a raced size.
  check(before.size <= 8n * 1024n * 1024n, 'file_size_limit');
  const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
    check(count > 0, 'file_changed'); offset += count;
  }
  check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0
    && sameFile(before, descriptorState(file, fd, mode, expected, parent)), 'file_changed');
  return bytes;
}
function withFile(file, mode, expected, flags, action) {
  return fileIo(() => {
    const parent = ownedDirectory(path.dirname(file), mode === 0o600 ? 0o700 : undefined);
    const before = fileStat(file); permissions(before, mode, expected);
    const fd = fs.openSync(file, flags | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      check(sameFile(before, descriptorState(file, fd, mode, expected, parent)), 'file_changed');
      return action(fd, parent, before);
    } finally { fs.closeSync(fd); }
  });
}
export function privateFile(file) {
  return withFile(file, 0o600, null, fs.constants.O_RDONLY,
    (fd, parent) => readDescriptor(file, fd, 0o600, null, parent));
}
export function mountDigest(mounts) {
  const selected = mounts.map(({ Type, Source, Destination, RW, Mode }) => ({ Type, Source, Destination, RW, Mode }));
  return sha256(canonicalJson(selected.sort((a, b) => a.Destination.localeCompare(b.Destination))));
}
function hostFile(file, expected) {
  return withFile(file, 0o644, expected, fs.constants.O_RDONLY,
    (fd, parent) => readDescriptor(file, fd, 0o644, expected, parent));
}
function replaceDescriptor(file, fd, mode, expected, parent, content, before, afterTruncate = () => {}) {
  check(sameFile(before, descriptorState(file, fd, mode, expected, parent)), 'file_changed');
  fs.ftruncateSync(fd, 0); afterTruncate();
  check(descriptorState(file, fd, mode, expected, parent).size === 0n, 'file_changed');
  const bytes = Buffer.from(content); let offset = 0;
  while (offset < bytes.length) {
    const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
    check(count > 0, 'file_write_failed'); offset += count;
  }
  fs.fsyncSync(fd);
  check(readDescriptor(file, fd, mode, expected, parent).equals(bytes), 'config_write_readback');
}
// An existing read-only Docker FILE bind requires preserving this exact inode.
function installInPlace(file, content, expected, previous, afterTruncate = () => {}) {
  return withFile(file, 0o644, expected, fs.constants.O_RDWR, (fd, parent, before) => {
    check(readDescriptor(file, fd, 0o644, expected, parent).equals(Buffer.from(previous)), 'host_file_content_changed');
    replaceDescriptor(file, fd, 0o644, expected, parent, content, before, afterTruncate);
  });
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
    check(canonicalJson(normalizedCaddyConfig(adapter.activeConfig())) === canonicalJson(normalizedCaddyConfig(active)), 'active_config_readback');
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
  let journalFd; let journalIdentity; let journalParent; let journalState; let journalBytes = Buffer.alloc(0);
  const journal = { schemaVersion: 1, status: 'started', source: m.source, artifactHash: m.artifactHash, gatewayConfigHash: m.gatewayConfigHash, candidateConfigHash: m.candidateConfigHash };
  function record(status) {
    fileIo(() => {
      journal.status = status;
      if (!journalCreated) {
        journalParent = ownedDirectory(backupDirectory, 0o700);
        journalFd = fs.openSync(evidencePath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
        journalCreated = true;
        const stat = fs.fstatSync(journalFd, { bigint: true });
        journalIdentity = { inode: stat.ino, device: stat.dev, uid: stat.uid, gid: stat.gid };
        journalState = descriptorState(evidencePath, journalFd, 0o600, journalIdentity, journalParent);
      }
      check(sameFile(journalState, descriptorState(evidencePath, journalFd, 0o600, journalIdentity, journalParent))
        && readDescriptor(evidencePath, journalFd, 0o600, journalIdentity, journalParent).equals(journalBytes), 'journal_changed');
      const bytes = Buffer.from(`${JSON.stringify(journal)}\n`);
      replaceDescriptor(evidencePath, journalFd, 0o600, journalIdentity, journalParent, bytes, journalState);
      journalBytes = bytes;
      journalState = descriptorState(evidencePath, journalFd, 0o600, journalIdentity, journalParent);
    });
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
    installInPlace(config, candidate, m.hostFile, backup, () => fault('config-install'));
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
        const activeNow = canonicalJson(normalizedCaddyConfig(adapter.activeConfig()));
        check([canonicalJson(normalizedCaddyConfig(oldActive)), canonicalJson(normalizedCaddyConfig(newActive))].includes(activeNow), 'rollback_foreign_active_config');
        const currentConfig = hostFile(config, m.hostFile);
        const candidateBytes = Buffer.from(candidate);
        const ownInterruptedWrite = currentConfig.equals(backup) ||
          (currentConfig.length <= candidateBytes.length && candidateBytes.subarray(0, currentConfig.length).equals(currentConfig));
        check(ownInterruptedWrite && (!configWriteCompleted || currentConfig.equals(candidateBytes)), 'rollback_foreign_config');
        fault('rollback');
        installInPlace(config, backup, m.hostFile, currentConfig);
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
  } finally {
    try { fileIo(() => { if (journalFd !== undefined) fs.closeSync(journalFd); }); }
    catch (error) { if (!recoveryFailed) throw error; } // Preserve the hard manual-recovery result.
    if (!recoveryFailed) fileIo(() => fs.rmdirSync(lock));
  }
}
