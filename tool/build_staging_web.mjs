#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanSource, confinedDirectory, profile, sealArtifact, sha256, TARGET } from './staging_web_contract.mjs';
import { readGoogleWebReadiness } from './staging_google_web_readiness.mjs';
import { readAppleWebReadiness } from './staging_apple_web_readiness.mjs';
import { readFacebookWebReadiness } from './staging_facebook_web_readiness.mjs';
import { readPasswordEnrollmentWebReadiness } from './staging_password_enrollment_web_readiness.mjs';

// Positional, exact inputs only: no arbitrary define/target/Flutter option forwarding.
const [sourceRoot, source, output, ...extra] = process.argv.slice(2);
let definesDirectory;
try {
  const usage = 'usage: build_staging_web.mjs ABS_SOURCE_ROOT EXACT_HEAD ABS_NEW_ARTIFACT_DIR [--google-web-readiness ABS_ELIGIBLE_READINESS_JSON VERIFIED_EVIDENCE_SHA256] [--apple-web-readiness ABS_ELIGIBLE_READINESS_JSON VERIFIED_EVIDENCE_SHA256] [--facebook-web-readiness ABS_PUBLIC_READINESS_JSON REVIEWED_EVIDENCE_SHA256] [--password-enrollment-readiness ABS_RUNTIME_READINESS_JSON VERIFIED_EVIDENCE_SHA256]';
  if (!sourceRoot || !source || !output) throw Error(usage);
  const inputs = new Map();
  for (let index = 0; index < extra.length; index += 3) {
    const flag = extra[index];
    if (index + 2 >= extra.length || !['--google-web-readiness', '--apple-web-readiness', '--facebook-web-readiness', '--password-enrollment-readiness'].includes(flag)
      || inputs.has(flag)) {
      throw Error(usage);
    }
    inputs.set(flag, { file: extra[index + 1], digest: extra[index + 2] });
  }
  confinedDirectory(sourceRoot);
  cleanSource(sourceRoot, source);
  const googleInput = inputs.get('--google-web-readiness');
  const appleInput = inputs.get('--apple-web-readiness');
  const facebookInput = inputs.get('--facebook-web-readiness');
  const passwordEnrollmentInput = inputs.get('--password-enrollment-readiness');
  for (const [input, code] of [
    [googleInput, 'google_web_readiness_must_be_outside_source'],
    [appleInput, 'apple_web_readiness_must_be_outside_source'],
    [facebookInput, 'facebook_web_readiness_must_be_outside_source'],
    [passwordEnrollmentInput, 'password_enrollment_web_readiness_must_be_outside_source'],
  ]) {
    if (input && (input.file === sourceRoot || input.file.startsWith(`${sourceRoot}/`))) throw Error(code);
  }
  const version = fs.readFileSync(path.join(sourceRoot, 'pubspec.yaml'), 'utf8').match(/^version:\s*(\d+\.\d+\.\d+\+\d+)\s*$/m)?.[1];
  if (!version) throw Error('source_version_missing');
  const googleWeb = googleInput
    ? readGoogleWebReadiness(googleInput.file, googleInput.digest,
      { expectedSource: source }) : null;
  const appleWeb = appleInput
    ? readAppleWebReadiness(appleInput.file, appleInput.digest,
      { expectedSource: source }) : null;
  const facebookWeb = facebookInput
    ? readFacebookWebReadiness(facebookInput.file, facebookInput.digest) : null;
  const passwordEnrollment = passwordEnrollmentInput
    ? readPasswordEnrollmentWebReadiness(
      passwordEnrollmentInput.file,
      passwordEnrollmentInput.digest,
      { expectedSource: source, expectedVersion: version },
    ) : null;
  if (!path.isAbsolute(output) || path.normalize(output) !== output || fs.existsSync(output)) throw Error('artifact_output_must_be_new_absolute_directory');
  confinedDirectory(path.dirname(output));
  if (output.startsWith(`${sourceRoot}/`)) throw Error('artifact_output_must_be_outside_source');
  const toolRoot = path.dirname(fileURLToPath(import.meta.url));
  const builderDigest = sha256(Buffer.concat([
    'build_staging_web.mjs',
    'staging_web_contract.mjs',
    'staging_google_web_readiness.mjs',
    'staging_apple_web_readiness.mjs',
    'staging_facebook_web_readiness.mjs',
    'staging_password_enrollment_web_readiness.mjs',
  ].map((name) => fs.readFileSync(path.join(toolRoot, name)))));
  const flutterVersion = JSON.parse(execFileSync('flutter', ['--version', '--machine'], { encoding: 'utf8' }));
  definesDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-staging-web-defines-')));
  const definesFile = path.join(definesDirectory, 'defines.json');
  fs.writeFileSync(definesFile, JSON.stringify(profile(source, version, googleWeb, facebookWeb, passwordEnrollment, appleWeb)), { mode: 0o600, flag: 'wx' });
  const flags = ['--release', '--pwa-strategy=none', '--no-web-resources-cdn', '--base-href=/',
    `--dart-define-from-file=${definesFile}`];
  execFileSync('bash', ['-c', 'set -euo pipefail; ROOT="$PWD"; source scripts/release_host_capacity_guard.sh; release_host_capacity_begin; flutter pub get --enforce-lockfile; flutter build web "$@"; bash scripts/p0a_web_smoke.sh; release_host_capacity_end', 'staging-web', ...flags], { cwd: sourceRoot, stdio: 'inherit' });
  cleanSource(sourceRoot, source);
  fs.mkdirSync(output, { mode: 0o755 });
  fs.cpSync(path.join(sourceRoot, 'build/web'), path.join(output, 'web'), { recursive: true, dereference: false });
  const manifestHash = sealArtifact({ directory: output, source, version,
    flutterVersion: { frameworkVersion: flutterVersion.frameworkVersion, frameworkRevision: flutterVersion.frameworkRevision, dartSdkVersion: flutterVersion.dartSdkVersion }, builderDigest, googleWeb, facebookWeb, passwordEnrollment, appleWeb });
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
