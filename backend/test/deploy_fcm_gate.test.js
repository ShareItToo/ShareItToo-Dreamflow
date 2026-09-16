import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const backendRoot = resolve(import.meta.dirname, '..');
const deployScript = join(backendRoot, 'ops', 'deploy_release.sh');
const commit = 'a'.repeat(40);

async function dockerFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-fcm-test-'));
  const docker = join(root, 'docker');
  const capture = join(root, 'docker-calls.txt');
  await writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$DOCKER_CAPTURE"
if [[ "$*" == *org.opencontainers.image.revision* ]]; then
  printf '%s\\n' "$MOCK_COMMIT"
elif [[ "$*" == *org.opencontainers.image.version* ]]; then
  printf '%s\\n' '0.1.0-test'
elif [[ "$*" == *org.opencontainers.image.created* ]]; then
  printf '%s\\n' '2026-08-09T00:00:00Z'
else
  exit 97
fi
`, { mode: 0o700 });
  await chmod(docker, 0o700);
  return { root, capture };
}

test('production rejects the staging FCM flag before invoking Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = spawnSync('bash', [deployScript, 'production', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_FCM: '1',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging FCM override is forbidden for production/);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('staging FCM validates the secret before Compose can run', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_FCM: '1',
      FIREBASE_PROJECT_ID: 'shareittoo-staging',
      FIREBASE_SERVICE_ACCOUNT_HOST_FILE: join(fixture.root, 'missing.json'),
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FCM staging secret gate failed/);
  const calls = await readFile(fixture.capture, 'utf8');
  assert.equal(calls.includes(' compose '), false);
  assert.equal(calls.split('\n').filter(Boolean).length, 3);
});
