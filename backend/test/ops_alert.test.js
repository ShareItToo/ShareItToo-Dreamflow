import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('critical alerts use SMTP without putting the password in curl arguments', async () => {
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-alert-test-'));
  try {
    const envFile = path.join(temporaryDir, 'service.env');
    const stateDir = path.join(temporaryDir, 'state');
    const fakeBin = path.join(temporaryDir, 'bin');
    const argumentCapture = path.join(temporaryDir, 'arguments.txt');
    const configCapture = path.join(temporaryDir, 'config.txt');
    const countCapture = path.join(temporaryDir, 'count.txt');
    await fs.mkdir(fakeBin);
    await fs.writeFile(envFile, [
      'MAIL_TRANSPORT=smtp',
      'SMTP_HOST=smtp.example.com',
      'SMTP_PORT=587',
      'SMTP_SECURE=false',
      'SMTP_REQUIRE_TLS=true',
      'SMTP_USER=alerts@example.com',
      'MAIL_FROM=ShareItToo <alerts@example.com>',
      'ALERT_EMAIL_TO=contact@example.com',
      '',
    ].join('\n'));
    const fakeCurl = path.join(fakeBin, 'curl');
    await fs.writeFile(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >"$ALERT_CAPTURE_ARGS"
cp "$2" "$ALERT_CAPTURE_CONFIG"
printf 'called\\n' >>"$ALERT_CAPTURE_COUNT"
`);
    await fs.chmod(fakeCurl, 0o755);
    const fakeDocker = path.join(fakeBin, 'docker');
    await fs.writeFile(fakeDocker, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${ALERT_FAKE_DOCKER_EMPTY:-false}" != true ]]; then
  printf 'SMTP_PASSWORD=super-secret-password\\n'
fi
`);
    await fs.chmod(fakeDocker, 0o755);

    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const script = path.resolve(currentDir, '../ops/alert.sh');
    const environment = {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ALERT_ENV_FILE: envFile,
      ALERT_STATE_DIR: stateDir,
      ALERT_COOLDOWN_SECONDS: '3600',
      ALERT_CAPTURE_ARGS: argumentCapture,
      ALERT_CAPTURE_CONFIG: configCapture,
      ALERT_CAPTURE_COUNT: countCapture,
    };

    const first = await run('bash', [script, 'shareittoo-health.service'], { env: environment });
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /alert delivered/);
    assert.equal((await fs.readFile(argumentCapture, 'utf8')).includes('super-secret-password'), false);
    assert.match(await fs.readFile(configCapture, 'utf8'), /super-secret-password/);
    assert.equal(await fs.readFile(countCapture, 'utf8'), 'called\n');

    const second = await run('bash', [script, 'shareittoo-health.service'], { env: environment });
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /suppressed by cooldown/);
    assert.equal(await fs.readFile(countCapture, 'utf8'), 'called\n');

    const relayEnvFile = path.join(temporaryDir, 'relay.env');
    await fs.writeFile(relayEnvFile, [
      'MAIL_TRANSPORT=smtp',
      'SMTP_HOST=smtp-relay.example.com',
      'SMTP_PORT=587',
      'SMTP_SECURE=false',
      'SMTP_REQUIRE_TLS=true',
      'MAIL_FROM=ShareItToo <contact@example.com>',
      'ALERT_EMAIL_TO=contact@example.com',
      '',
    ].join('\n'));
    const relay = await run('bash', [script, 'shareittoo-relay-test.service'], {
      env: {
        ...environment,
        ALERT_ENV_FILE: relayEnvFile,
        ALERT_STATE_DIR: path.join(temporaryDir, 'relay-state'),
        ALERT_FAKE_DOCKER_EMPTY: 'true',
      },
    });
    assert.equal(relay.code, 0, relay.stderr);
    assert.match(relay.stdout, /alert delivered/);
    assert.doesNotMatch(await fs.readFile(configCapture, 'utf8'), /^user\s*=/m);
    assert.match(await fs.readFile(configCapture, 'utf8'), /mail-from = "contact@example.com"/);
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});
