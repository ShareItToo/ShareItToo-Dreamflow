import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from
  'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const sourceScript = new URL('../../backend/ops/deploy_release.sh', import.meta.url);
const sourceStagingReadinessValidator = new URL(
  '../../backend/ops/validate_staging_deployment_readiness.mjs',
  import.meta.url,
);

async function executable(path, content) {
  await writeFile(path, content);
  await chmod(path, 0o755);
}

test('a failed production rollout restores and verifies the previous exact image', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const backend = join(root, 'backend');
  const ops = join(backend, 'ops');
  const fakeBin = join(root, 'bin');
  const releases = join(root, 'releases');
  const state = join(root, 'docker-state');
  const log = join(root, 'docker-log');
  const composeFiles = join(root, 'compose-files');
  await Promise.all([
    mkdir(ops, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
    mkdir(releases, { recursive: true }),
  ]);
  await cp(sourceScript, join(ops, 'deploy_release.sh'));
  await chmod(join(ops, 'deploy_release.sh'), 0o755);
  await writeFile(join(backend, 'compose.prod.yml'), 'services:\n  api:\n    image: placeholder\n');
  await writeFile(join(backend, '.env'), 'POSTGRES_PASSWORD=test\nJWT_SECRET=test\n');
  await executable(join(ops, 'backup.sh'), '#!/usr/bin/env bash\nexit 0\n');
  await executable(
    join(ops, 'check_foreign_key_integrity.sh'),
    '#!/usr/bin/env bash\nexit 0\n',
  );

  await executable(join(fakeBin, 'curl'), `#!/usr/bin/env bash
case "\${*: -1}" in
  */version) printf '{"commit":"%s"}\\n' "\${PREVIOUS_COMMIT}" ;;
  */health) exit 0 ;;
  *) exit 0 ;;
esac
`);
  await executable(join(fakeBin, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "\${DOCKER_LOG}"
if [[ "$1" == image && "$2" == inspect ]]; then
  if [[ "$3" == *"\${TARGET_COMMIT}"* ]]; then
    case "$*" in
      *revision*) printf '%s\\n' "\${TARGET_COMMIT}" ;;
      *version*) printf '0.1.0-%s\\n' "\${TARGET_COMMIT:0:12}" ;;
      *created*) printf '2026-08-13T00:00:00Z\\n' ;;
    esac
  else
    case "$*" in
      *version*) printf '0.1.0-previous\\n' ;;
      *created*) printf '2026-08-12T00:00:00Z\\n' ;;
    esac
  fi
  exit 0
fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.Health* ]]; then
    printf 'healthy\\n'
  else
    printf 'sha256:previous-image\\n'
  fi
  exit 0
fi
if [[ "$1" == compose ]]; then
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == -f && -f "$argument" ]]; then
      printf '%s\n' "$(<"$argument")" >> "\${COMPOSE_FILES}"
    fi
    previous="$argument"
  done
  count=0
  [[ -f "\${DOCKER_STATE}" ]] && count=$(<"\${DOCKER_STATE}")
  count=$((count + 1))
  printf '%s' "$count" > "\${DOCKER_STATE}"
  [[ "$count" == 1 ]] && exit 42
  exit 0
fi
exit 1
`);

  const targetCommit = 'a'.repeat(40);
  const previousCommit = 'b'.repeat(40);
  const result = spawnSync(join(ops, 'deploy_release.sh'),
    ['production', targetCommit], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TARGET_COMMIT: targetCommit,
        PREVIOUS_COMMIT: previousCommit,
        CONFIRM_PRODUCTION_DEPLOY: targetCommit,
        IMAGE_REPOSITORY: 'registry.invalid/sit-api',
        HEALTH_URL: 'https://example.invalid/api',
        RELEASE_LOG_DIR: releases,
        DOCKER_STATE: state,
        DOCKER_LOG: log,
        COMPOSE_FILES: composeFiles,
      },
    });

  assert.equal(result.status, 42);
  assert.match(result.stderr, /previous image restored and verified/);
  const dockerLog = await readFile(log, 'utf8');
  assert.equal((dockerLog.match(/compose /g) ?? []).length, 2);
  assert.match(dockerLog, /sha256:previous-image/);
  const composeFileContents = await readFile(composeFiles, 'utf8');
  assert.match(
    composeFileContents,
    new RegExp(`image: "registry\\.invalid/sit-api:${targetCommit}"`, 'u'),
  );
  const reports = await readdir(releases);
  assert.equal(reports.length, 1);
  const report = JSON.parse(await readFile(join(releases, reports[0]), 'utf8'));
  assert.equal(report.status, 'passed');
  assert.equal(report.failedCommit, targetCommit);
  assert.equal(report.restoredCommit, previousCommit);
  assert.equal(report.restoredImageId, 'sha256:previous-image');
});

test('a Staging rollout records but does not hide a noncritical synthetic support backlog', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-staging-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const backend = join(root, 'backend');
  const ops = join(backend, 'ops');
  const fakeBin = join(root, 'bin');
  const releases = join(root, 'releases');
  const deployedState = join(root, 'deployed-state');
  await Promise.all([
    mkdir(ops, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
    mkdir(releases, { recursive: true }),
  ]);
  await Promise.all([
    cp(sourceScript, join(ops, 'deploy_release.sh')),
    cp(sourceStagingReadinessValidator, join(
      ops,
      'validate_staging_deployment_readiness.mjs',
    )),
  ]);
  await chmod(join(ops, 'deploy_release.sh'), 0o755);
  await writeFile(join(backend, 'compose.staging.yml'), 'services:\n  api:\n    image: placeholder\n');
  await writeFile(join(backend, '.env.staging'), 'POSTGRES_PASSWORD=test\nJWT_SECRET=test\n');
  await executable(
    join(ops, 'check_foreign_key_integrity.sh'),
    '#!/usr/bin/env bash\nexit 0\n',
  );

  await executable(join(fakeBin, 'curl'), `#!/usr/bin/env bash
url="\${*: -1}"
if [[ "$url" == */version ]]; then
  if [[ -f "\${DEPLOYED_STATE}" ]]; then
    printf '{"commit":"%s"}\\n' "\${TARGET_COMMIT}"
  else
    printf '{"commit":"%s"}\\n' "\${PREVIOUS_COMMIT}"
  fi
  exit 0
fi
if [[ "$url" == */health/ready ]]; then
  output=''
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == --output ]]; then output="$argument"; fi
    previous="$argument"
  done
  printf '%s\\n' '{"status":"degraded","service":"shareittoo-api","checks":{"database":"ok","mail":"ok","notifications":{"pending":0,"dead":0},"payments":{"failedEvents":0,"unbalanced":0,"recoveryPending":0,"recoveryNeedsReview":0},"supportDeadlines":{"status":"degraded","stale":false,"lastErrorCode":null,"p0WithoutOwner":0,"nextUpdateOverdue":1,"criticalNextUpdateOverdue":0,"privacyDeadlineNear":0,"privacyDeadlineOverdue":0,"privacyIncidentDeadlineNear":0,"privacyIncidentDeadlineOverdue":0}}}' > "$output"
  printf '503'
  exit 0
fi
exit 1
`);
  await executable(join(fakeBin, 'docker'), `#!/usr/bin/env bash
if [[ "$1" == image && "$2" == inspect ]]; then
  case "$*" in
    *revision*) printf '%s\\n' "\${TARGET_COMMIT}" ;;
    *version*) printf '0.1.0-%s\\n' "\${TARGET_COMMIT:0:12}" ;;
    *created*) printf '2026-09-06T00:00:00Z\\n' ;;
  esac
  exit 0
fi
if [[ "$1" == inspect ]]; then
  printf 'sha256:previous-image\\n'
  exit 0
fi
if [[ "$1" == compose ]]; then
  : > "\${DEPLOYED_STATE}"
  exit 0
fi
exit 1
`);

  const targetCommit = 'c'.repeat(40);
  const previousCommit = 'd'.repeat(40);
  const result = spawnSync(join(ops, 'deploy_release.sh'),
    ['staging', targetCommit], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TARGET_COMMIT: targetCommit,
        PREVIOUS_COMMIT: previousCommit,
        IMAGE_REPOSITORY: 'registry.invalid/sit-api',
        HEALTH_URL: 'https://example.invalid/api',
        RELEASE_LOG_DIR: releases,
        DEPLOYED_STATE: deployedState,
      },
    });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Deployment verified/u);
  const reports = await readdir(releases);
  assert.equal(reports.length, 1);
  const report = JSON.parse(await readFile(join(releases, reports[0]), 'utf8'));
  assert.equal(report.environment, 'staging');
  assert.equal(report.commit, targetCommit);
  assert.deepEqual(report.stagingReadiness, {
    status: 'passed',
    state: 'noncritical_support_deadline_overdue',
    noncriticalNextUpdateOverdue: 1,
  });
});

test('an on-device Staging rollout reads the nested readiness boundary and rolls back a mismatch', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-staging-on-device-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const backend = join(root, 'backend');
  const ops = join(backend, 'ops');
  const fakeBin = join(root, 'bin');
  const releases = join(root, 'releases');
  const deployedState = join(root, 'deployed-state');
  const composeCount = join(root, 'compose-count');
  await Promise.all([
    mkdir(ops, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
    mkdir(releases, { recursive: true }),
  ]);
  await Promise.all([
    cp(sourceScript, join(ops, 'deploy_release.sh')),
    cp(sourceStagingReadinessValidator, join(
      ops,
      'validate_staging_deployment_readiness.mjs',
    )),
  ]);
  await chmod(join(ops, 'deploy_release.sh'), 0o755);
  await Promise.all([
    writeFile(join(backend, 'compose.staging.yml'), 'services:\n  api:\n    image: placeholder\n'),
    writeFile(join(backend, 'compose.staging.pilot.yml'), 'services:\n  api:\n    environment:\n      SIT_LISTING_AI_PROVIDER: on_device\n'),
    writeFile(join(backend, '.env.staging'), 'POSTGRES_PASSWORD=test\nJWT_SECRET=test\n'),
  ]);
  await executable(
    join(ops, 'check_foreign_key_integrity.sh'),
    '#!/usr/bin/env bash\nexit 0\n',
  );

  await executable(join(fakeBin, 'curl'), `#!/usr/bin/env bash
url="\${*: -1}"
if [[ "$url" == */version ]]; then
  if [[ -f "\${DEPLOYED_STATE}" ]]; then
    printf '{"commit":"%s"}\\n' "\${TARGET_COMMIT}"
  else
    printf '{"commit":"%s"}\\n' "\${PREVIOUS_COMMIT}"
  fi
  exit 0
fi
if [[ "$url" == */health/ready ]]; then
  output=''
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == --output ]]; then output="$argument"; fi
    previous="$argument"
  done
  printf '{"status":"ok","service":"shareittoo-api","checks":{"database":"ok","mail":"ok","notifications":{"pending":0,"dead":0},"payments":{"failedEvents":0,"unbalanced":0,"recoveryPending":0,"recoveryNeedsReview":0},"supportDeadlines":{"status":"ok","stale":false,"lastErrorCode":null,"p0WithoutOwner":0,"nextUpdateOverdue":0,"criticalNextUpdateOverdue":0,"privacyDeadlineNear":0,"privacyDeadlineOverdue":0,"privacyIncidentDeadlineNear":0,"privacyIncidentDeadlineOverdue":0},"listingAi":{"status":"enabled","provider":"%s","model":"mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1","promptVersion":"listing-ai-prompt-v1","schemaVersion":"listing-ai-draft-v1","budgetCents":0,"externalProviderExecutionAllowed":false,"automaticPublicationAllowed":false}}}\\n' "\${LISTING_AI_PROVIDER:-on_device}" > "$output"
  printf '200'
  exit 0
fi
if [[ "$url" == */health ]]; then exit 0; fi
exit 1
`);
  await executable(join(fakeBin, 'docker'), `#!/usr/bin/env bash
if [[ "$1" == image && "$2" == inspect ]]; then
  case "$*" in
    *revision*) printf '%s\\n' "\${TARGET_COMMIT}" ;;
    *version*) printf '0.1.0-%s\\n' "\${TARGET_COMMIT:0:12}" ;;
    *created*) printf '2026-09-11T00:00:00Z\\n' ;;
  esac
  exit 0
fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.Health* ]]; then
    printf 'healthy\\n'
  else
    printf 'sha256:previous-image\\n'
  fi
  exit 0
fi
if [[ "$1" == compose ]]; then
  count=0
  [[ -f "\${COMPOSE_COUNT}" ]] && count=$(<"\${COMPOSE_COUNT}")
  printf '%s' "$((count + 1))" > "\${COMPOSE_COUNT}"
  : > "\${DEPLOYED_STATE}"
  exit 0
fi
exit 1
`);

  const targetCommit = 'e'.repeat(40);
  const result = spawnSync(join(ops, 'deploy_release.sh'),
    ['staging', targetCommit], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TARGET_COMMIT: targetCommit,
        PREVIOUS_COMMIT: 'f'.repeat(40),
        IMAGE_REPOSITORY: 'registry.invalid/sit-api',
        HEALTH_URL: 'https://example.invalid/api',
        RELEASE_LOG_DIR: releases,
        DEPLOYED_STATE: deployedState,
        COMPOSE_COUNT: composeCount,
        SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      },
    });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Deployment verified/u);
  const reports = await readdir(releases);
  assert.equal(reports.length, 1);
  const report = JSON.parse(await readFile(join(releases, reports[0]), 'utf8'));
  assert.equal(report.stagingListingAi, true);

  await Promise.all([
    rm(deployedState, { force: true }),
    rm(composeCount, { force: true }),
  ]);

  const mismatch = spawnSync(join(ops, 'deploy_release.sh'),
    ['staging', targetCommit], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TARGET_COMMIT: targetCommit,
        PREVIOUS_COMMIT: 'f'.repeat(40),
        IMAGE_REPOSITORY: 'registry.invalid/sit-api',
        HEALTH_URL: 'https://example.invalid/api',
        RELEASE_LOG_DIR: releases,
        DEPLOYED_STATE: deployedState,
        COMPOSE_COUNT: composeCount,
        SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
        LISTING_AI_PROVIDER: 'mock',
      },
    });

  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /previous image restored and verified/u);
  assert.equal(await readFile(composeCount, 'utf8'), '2');
  const reportsAfterMismatch = await readdir(releases);
  assert.equal(reportsAfterMismatch.length, 2);
  const rollbackName = reportsAfterMismatch.find((name) => name.includes('-rollback-'));
  assert.ok(rollbackName);
  const rollback = JSON.parse(await readFile(join(releases, rollbackName), 'utf8'));
  assert.equal(rollback.status, 'passed');
  assert.equal(rollback.failedCommit, targetCommit);
});
