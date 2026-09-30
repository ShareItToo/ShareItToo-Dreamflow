#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  prepareFixtureEnvRuntimeManifest,
  readFixtureEnvRuntimeManifest,
  runStagingWebFixtureEnvTransition,
  sanitizeFixtureEnvError,
} from './staging_web_fixture_env_transition.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(code) { throw Object.assign(new Error(code), { code }); }

export function readCleanFixtureEnvSource(run = execFileSync) {
  let status;
  let commit;
  try {
    status = run('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
    commit = run('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { fail('fixture_env_git_readback_failed'); }
  if (status !== '' || !/^[a-f0-9]{40}$/u.test(commit)) fail('fixture_env_source_not_clean');
  return commit;
}

export function readFixtureEnvBootstrapManifest(filePath, expectedSha256) {
  const bytes = readStablePrivateFile(filePath, {
    encoding: null, expectedMode: 0o600, expectedUid: process.getuid?.(), expectedGid: process.getgid?.(),
    minBytes: 1, maxBytes: 128 * 1024, code: 'fixture_env_bootstrap_metadata_invalid',
  });
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256 ?? '')
      || crypto.createHash('sha256').update(bytes).digest('hex') !== expectedSha256) fail('fixture_env_bootstrap_digest_invalid');
  return bytes;
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--prepare') {
    if (argv.length !== 5) fail('fixture_env_prepare_usage');
    const sourceCommit = readCleanFixtureEnvSource();
    const bootstrapManifestBytes = readFixtureEnvBootstrapManifest(argv[1], argv[2]);
    const result = await prepareFixtureEnvRuntimeManifest({
      bootstrapManifestBytes, bootstrapManifestSha256: argv[2], backupFile: argv[3], outputFile: argv[4], sourceCommit,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const execute = argv[0] === '--execute';
  if (argv.length !== (execute ? 3 : 0)) fail('fixture_env_usage');
  const sourceCommit = readCleanFixtureEnvSource();
  const manifest = readFixtureEnvRuntimeManifest(process.env.STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST ?? '',
    process.env.STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST_SHA256);
  const bootstrapManifestBytes = readFixtureEnvBootstrapManifest(
    process.env.STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST ?? '',
    process.env.STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST_SHA256,
  );
  const result = await runStagingWebFixtureEnvTransition({
    manifest,
    bootstrapManifestBytes,
    evidenceFile: process.env.STAGING_WEB_FIXTURE_ENV_EVIDENCE_FILE,
    execute,
    sourceCommit,
    confirmSource: execute ? argv[1] : undefined,
    confirmRun: execute ? argv[2] : undefined,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizeFixtureEnvError(error))}\n`);
    process.exitCode = 1;
  }
}
