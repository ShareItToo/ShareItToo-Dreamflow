import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const sourceScript = new URL('../../backend/ops/deploy_release.sh', import.meta.url);

async function executable(path, content) {
  await writeFile(path, content);
  await chmod(path, 0o755);
}

test('failed MFA-enabled Staging rollout retains the MFA overlay during image rollback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backend = join(root, 'backend');
  const ops = join(backend, 'ops');
  const fakeBin = join(root, 'bin');
  const releases = join(root, 'releases');
  const state = join(root, 'docker-state');
  const log = join(root, 'docker-log');
  const composeFiles = join(root, 'compose-files');
  const keyFile = join(root, 'mfa-key');
  await Promise.all([
    mkdir(ops, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
    mkdir(releases, { recursive: true }),
  ]);
  await writeFile(keyFile, `${Buffer.alloc(32, 4).toString('base64url')}\n`, { mode: 0o600 });
  await chmod(keyFile, 0o600);
  await writeFile(join(ops, 'deploy_release.sh'), await readFile(sourceScript));
  await chmod(join(ops, 'deploy_release.sh'), 0o755);
  await writeFile(join(backend, 'compose.staging.yml'), 'services:\n  api:\n    image: placeholder\n');
  await writeFile(join(backend, 'compose.staging.pilot.yml'), 'services:\n  api:\n    environment: {}\n');
  await writeFile(join(backend, 'compose.staging.mfa.yml'), 'services:\n  api:\n    environment:\n      MFA_ENCRYPTION_KEY: ""\n      MFA_ENCRYPTION_KEY_FILE: /run/secrets/mfa-encryption-key\n');
  await writeFile(join(backend, '.env.staging'), 'POSTGRES_PASSWORD=test\nJWT_SECRET=test\n');
  await executable(join(ops, 'check_foreign_key_integrity.sh'), '#!/usr/bin/env bash\nexit 0\n');
  await executable(join(ops, 'validate_mfa_staging_secret.mjs'), '#!/usr/bin/env node\nprocess.stdout.write("MFA Staging secret gate: PASS\\n");\n');
  await executable(join(ops, 'validate_staging_deployment_readiness.mjs'), '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end", () => process.stdout.write("{\\"status\\":\\"ok\\"}\\n"));\n');
  await executable(join(fakeBin, 'curl'), `#!/usr/bin/env bash
url="\${*: -1}"
if [[ "$url" == */version ]]; then
  if [[ -f "\${DEPLOYED_STATE}" ]]; then printf '{"commit":"%s"}\n' "\${TARGET_COMMIT}"; else printf '{"commit":"%s"}\n' "\${PREVIOUS_COMMIT}"; fi
  exit 0
fi
if [[ "$url" == */health ]]; then printf '%s\n' '{"status":"ok","checks":{"mfa":{"configured":true,"credentialSource":"file"}}}'; exit 0; fi
exit 0
`);
  await executable(join(fakeBin, 'docker'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "\${DOCKER_LOG}"
if [[ "$1" == image && "$2" == inspect ]]; then
  case "$*" in
    *revision*) printf '%s\n' "\${TARGET_COMMIT}" ;;
    *version*) printf '0.1.0-%s\n' "\${TARGET_COMMIT:0:12}" ;;
    *created*) printf '2026-09-17T00:00:00Z\n' ;;
  esac
  exit 0
fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.Health* ]]; then printf 'healthy\n'; else printf 'sha256:previous-image\n'; fi
  exit 0
fi
if [[ "$1" == compose ]]; then
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == -f && -f "$argument" ]]; then cat "$argument" >> "\${COMPOSE_FILES}"; printf '\n---\n' >> "\${COMPOSE_FILES}"; fi
    previous="$argument"
  done
  count=0; [[ -f "\${DOCKER_STATE}" ]] && count=$(<"\${DOCKER_STATE}"); count=$((count + 1)); printf '%s' "$count" > "\${DOCKER_STATE}"
  [[ "$count" == 1 ]] && exit 42
  exit 0
fi
exit 1
`);

  const targetCommit = 'e'.repeat(40);
  const previousCommit = 'f'.repeat(40);
  const result = spawnSync(join(ops, 'deploy_release.sh'), ['staging', targetCommit], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      NODE_BINARY: process.execPath,
      TARGET_COMMIT: targetCommit,
      PREVIOUS_COMMIT: previousCommit,
      ENABLE_STAGING_MFA: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_MFA: targetCommit,
      MFA_ENCRYPTION_KEY_HOST_FILE: keyFile,
      IMAGE_REPOSITORY: 'registry.invalid/sit-api',
      HEALTH_URL: 'https://example.invalid/api',
      RELEASE_LOG_DIR: releases,
      DOCKER_STATE: state,
      DEPLOYED_STATE: join(root, 'deployed-state'),
      DOCKER_LOG: log,
      COMPOSE_FILES: composeFiles,
    },
  });

  assert.equal(result.status, 42);
  assert.match(result.stderr, /previous image restored and verified/u);
  const composeFileContents = await readFile(composeFiles, 'utf8');
  assert.ok((composeFileContents.match(/MFA_ENCRYPTION_KEY_FILE:\s*\/run\/secrets\/mfa-encryption-key/gu) ?? []).length >= 2);
  assert.doesNotMatch(composeFileContents, /MFA_ENCRYPTION_KEY_FILE:\s*""/u);
  const reports = await readdir(releases);
  assert.equal(reports.length, 1);
  assert.equal(JSON.parse(await readFile(join(releases, reports[0]), 'utf8')).status, 'passed');
});
