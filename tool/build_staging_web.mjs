#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanSource, confinedDirectory, profile, readGoogleWebConfig, sealArtifact, sha256, TARGET } from './staging_web_contract.mjs';

// Positional, exact inputs only: no arbitrary define/target/Flutter option forwarding.
const [sourceRoot, source, output, ...extra] = process.argv.slice(2);
let definesDirectory;
try {
  if (!sourceRoot || !source || !output || (extra.length && (extra.length !== 3 || extra[0] !== '--google-web-config'))) throw Error('usage: build_staging_web.mjs ABS_SOURCE_ROOT EXACT_HEAD ABS_NEW_ARTIFACT_DIR [--google-web-config ABS_PUBLIC_CONFIG_JSON REVIEWED_CONFIG_SHA256]');
  confinedDirectory(sourceRoot);
  cleanSource(sourceRoot, source);
  const googleWeb = extra.length ? readGoogleWebConfig(extra[1], extra[2]) : null;
  if (extra.length && (extra[1] === sourceRoot || extra[1].startsWith(`${sourceRoot}/`))) throw Error('google_web_config_must_be_outside_source');
  if (!path.isAbsolute(output) || path.normalize(output) !== output || fs.existsSync(output)) throw Error('artifact_output_must_be_new_absolute_directory');
  confinedDirectory(path.dirname(output));
  if (output.startsWith(`${sourceRoot}/`)) throw Error('artifact_output_must_be_outside_source');
  const version = fs.readFileSync(path.join(sourceRoot, 'pubspec.yaml'), 'utf8').match(/^version:\s*(\d+\.\d+\.\d+\+\d+)\s*$/m)?.[1];
  if (!version) throw Error('source_version_missing');
  const toolRoot = path.dirname(fileURLToPath(import.meta.url));
  const builderDigest = sha256(Buffer.concat(['build_staging_web.mjs', 'staging_web_contract.mjs'].map((name) => fs.readFileSync(path.join(toolRoot, name)))));
  const flutterVersion = JSON.parse(execFileSync('flutter', ['--version', '--machine'], { encoding: 'utf8' }));
  definesDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-staging-web-defines-')));
  const definesFile = path.join(definesDirectory, 'defines.json');
  fs.writeFileSync(definesFile, JSON.stringify(profile(source, version, googleWeb)), { mode: 0o600, flag: 'wx' });
  const flags = ['--release', '--pwa-strategy=none', '--no-web-resources-cdn', '--base-href=/',
    `--dart-define-from-file=${definesFile}`];
  execFileSync('bash', ['-c', 'set -euo pipefail; ROOT="$PWD"; source scripts/release_host_capacity_guard.sh; release_host_capacity_begin; flutter pub get --enforce-lockfile; flutter build web "$@"; bash scripts/p0a_web_smoke.sh; release_host_capacity_end', 'staging-web', ...flags], { cwd: sourceRoot, stdio: 'inherit' });
  cleanSource(sourceRoot, source);
  fs.mkdirSync(output, { mode: 0o755 });
  fs.cpSync(path.join(sourceRoot, 'build/web'), path.join(output, 'web'), { recursive: true, dereference: false });
  const manifestHash = sealArtifact({ directory: output, source, version,
    flutterVersion: { frameworkVersion: flutterVersion.frameworkVersion, frameworkRevision: flutterVersion.frameworkRevision, dartSdkVersion: flutterVersion.dartSdkVersion }, builderDigest, googleWeb });
  execFileSync('python3', [path.join(sourceRoot, 'tool/run_p0a_web_smoke.py'), '--web-root', path.join(output, 'web'), '--port', '0'], { stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  cleanSource(sourceRoot, source);
  console.log(JSON.stringify({ status: 'staging-web-build-passed', target: TARGET, source, version, manifestHash, output }));
} catch (error) {
  // Node/SDK parse and subprocess errors can quote input or command output.
  const code = typeof error.message === 'string' && /^(?:[a-z][a-z0-9_]*|usage: [A-Za-z0-9_.\[\] -]+)$/.test(error.message)
    ? error.message : 'build_operation_failed';
  console.error(`Staging Web build refused: ${code}`);
  process.exitCode = 1;
} finally {
  if (definesDirectory) fs.rmSync(definesDirectory, { recursive: true, force: true });
}
