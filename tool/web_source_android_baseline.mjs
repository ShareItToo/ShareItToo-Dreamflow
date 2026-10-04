#!/usr/bin/env node

// Local source-reuse evidence only. Never a candidate, CI or release gate.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const baselineName = 'sit-web-source-android-baseline-v1.json';
const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
  });
}

// Positive allowlist: all Dart (including Web-named Dart), native platforms,
// assets, dependency/toolchain files and unreviewed paths require Android.
export function androidUnaffectedPath(path) {
  return /^(?:docs|test|backend|web)\//u.test(path) || path === 'AGENTS.md';
}

function paths(value) {
  return value.split('\0').filter(Boolean);
}

export function changedPaths(root, base) {
  return [...new Set([
    ...paths(git(root, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', `${base}..HEAD`, '--'])),
    ...paths(git(root, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', '--cached', 'HEAD', '--'])),
    ...paths(git(root, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', '--'])),
    ...paths(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ])].sort();
}

function baselinePath(root) {
  return resolve(root, git(root, ['rev-parse', '--git-path', baselineName]).trim());
}

function readRegularJson(path) {
  return JSON.parse(readRegularBytes(path).toString('utf8'));
}

function readRegularBytes(path) {
  let fd;
  try {
    if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error('safe-open-unavailable');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new Error('not-regular-file');
    return readFileSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function localInputs(root) {
  // Git diffs omit protected/generated native inputs. Keep their byte bindings
  // private in the worktree Git directory; never print contents or digests.
  const ignored = paths(git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--',
    'lib', 'assets', 'android/app/src']));
  const inputs = [...new Set([...ignored, 'android/app/google-services.json',
    'android/local.properties', 'android/key.properties'])].sort();
  return inputs.map((path) => {
    try {
      return [path, createHash('sha256').update(readRegularBytes(resolve(root, path))).digest('hex')];
    } catch (error) {
      if (error.code === 'ENOENT') return [path, null];
      throw error;
    }
  });
}

function validAudit(audit, head) {
  return audit?.schemaVersion === 1
    && audit.kind === 'sit-48h-r11-android-security-permission-surface'
    && audit.status === 'verified-local-merged-debug-artifact-ci-pending'
    && audit.source?.implementationHead === head
    && audit.artifact?.buildType === 'debug'
    && audit.artifact.applicationId === 'com.shareittoo.app'
    && audit.artifact.minSdk === 24
    && Number.isSafeInteger(audit.artifact.bytes) && audit.artifact.bytes > 0
    && digest.test(audit.artifact.sha256);
}

export function androidBuildDecision(root, env = process.env) {
  if (env.SIT_WEB_SOURCE_GATE !== '1'
      || !['false', '0'].includes(env.CI ?? 'false')
      || (env.SIT_ALLOW_CANDIDATE_ROLLOVER ?? '0') !== '0') {
    return { build: true, reason: 'strict-mode' };
  }
  try {
    const record = readRegularJson(baselinePath(root));
    if (record.schemaVersion !== 1 || record.kind !== 'local-web-source-android-baseline'
        || !sha.test(record.sourceHead) || !validAudit(record.audit, record.sourceHead)) {
      throw new Error('invalid-baseline');
    }
    git(root, ['merge-base', '--is-ancestor', record.sourceHead, 'HEAD']);
    if (JSON.stringify(record.localInputs) !== JSON.stringify(localInputs(root))) {
      return { build: true, reason: 'local-android-inputs-changed' };
    }
    const changed = changedPaths(root, record.sourceHead);
    const impacted = changed.filter((path) => !androidUnaffectedPath(path));
    return {
      build: impacted.length > 0,
      reason: impacted.length ? 'android-or-unknown-source-impact' : 'retained-android-source-unchanged',
      sourceHead: record.sourceHead, impacted,
    };
  } catch {
    return { build: true, reason: 'missing-or-invalid-baseline' };
  }
}

export function retainAndroidBaseline(root, sourceHead, auditPath) {
  if (!sha.test(sourceHead) || git(root, ['rev-parse', 'HEAD']).trim() !== sourceHead
      || changedPaths(root, sourceHead).some((path) => !androidUnaffectedPath(path))) {
    throw new Error('android-source-not-clean-and-stable');
  }
  const audit = readRegularJson(auditPath);
  if (!validAudit(audit, sourceHead)) throw new Error('android-audit-binding-invalid');
  const target = baselinePath(root);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({
    schemaVersion: 1, kind: 'local-web-source-android-baseline', sourceHead, audit, localInputs: localInputs(root),
  }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, target);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'decide' && args.length === 0) {
    const result = androidBuildDecision(process.cwd());
    console.error(`Android source reuse: ${result.reason}; currentCandidateReady=false.`);
    console.log(result.build ? 'build' : 'skip');
  } else if (mode === 'retain' && args.length === 2) {
    try {
      retainAndroidBaseline(process.cwd(), ...args);
      console.log('Android baseline retained locally for future Web source gates; not release proof.');
    } catch {
      // Strict builds do not depend on this optional local optimization cache.
      console.log('Android baseline not retained: source/audit binding unavailable; future Web gate builds Android.');
    }
  } else {
    console.error('Usage: web_source_android_baseline.mjs decide | retain <source-head> <audit-file>');
    process.exitCode = 1;
  }
}
