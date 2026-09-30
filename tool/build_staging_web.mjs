#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanSource, confinedDirectory, profile, sealArtifact, sha256, TARGET } from './staging_web_contract.mjs';

// Positional, exact inputs only: no arbitrary define/target/Flutter option forwarding.
const [sourceRoot, source, output, ...extra] = process.argv.slice(2);
try {
  if (!sourceRoot || !source || !output || extra.length) throw Error('usage: build_staging_web.mjs ABS_SOURCE_ROOT EXACT_HEAD ABS_NEW_ARTIFACT_DIR');
  confinedDirectory(sourceRoot);
  cleanSource(sourceRoot, source);
  if (!path.isAbsolute(output) || path.normalize(output) !== output || fs.existsSync(output)) throw Error('artifact_output_must_be_new_absolute_directory');
  confinedDirectory(path.dirname(output));
  if (output.startsWith(`${sourceRoot}/`)) throw Error('artifact_output_must_be_outside_source');
  const version = fs.readFileSync(path.join(sourceRoot, 'pubspec.yaml'), 'utf8').match(/^version:\s*(\d+\.\d+\.\d+\+\d+)\s*$/m)?.[1];
  if (!version) throw Error('source_version_missing');
  const toolRoot = path.dirname(fileURLToPath(import.meta.url));
  const builderDigest = sha256(Buffer.concat(['build_staging_web.mjs', 'staging_web_contract.mjs'].map((name) => fs.readFileSync(path.join(toolRoot, name)))));
  const flutterVersion = JSON.parse(execFileSync('flutter', ['--version', '--machine'], { encoding: 'utf8' }));
  const flags = ['--release', '--pwa-strategy=none', '--no-web-resources-cdn', '--base-href=/',
    ...Object.entries(profile(source, version)).map(([key, value]) => `--dart-define=${key}=${value}`)];
  execFileSync('bash', ['-c', 'set -euo pipefail; ROOT="$PWD"; source scripts/release_host_capacity_guard.sh; release_host_capacity_begin; flutter pub get --enforce-lockfile; flutter build web "$@"; bash scripts/p0a_web_smoke.sh; release_host_capacity_end', 'staging-web', ...flags], { cwd: sourceRoot, stdio: 'inherit' });
  cleanSource(sourceRoot, source);
  fs.mkdirSync(output, { mode: 0o755 });
  fs.cpSync(path.join(sourceRoot, 'build/web'), path.join(output, 'web'), { recursive: true, dereference: false });
  const manifestHash = sealArtifact({ directory: output, source, version,
    flutterVersion: { frameworkVersion: flutterVersion.frameworkVersion, frameworkRevision: flutterVersion.frameworkRevision, dartSdkVersion: flutterVersion.dartSdkVersion }, builderDigest });
  execFileSync('python3', [path.join(sourceRoot, 'tool/run_p0a_web_smoke.py'), '--web-root', path.join(output, 'web'), '--port', '0'], { stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  cleanSource(sourceRoot, source);
  console.log(JSON.stringify({ status: 'staging-web-build-passed', target: TARGET, source, version, manifestHash, output }));
} catch (error) {
  console.error(`Staging Web build refused: ${error.message}`);
  process.exitCode = 1;
}
