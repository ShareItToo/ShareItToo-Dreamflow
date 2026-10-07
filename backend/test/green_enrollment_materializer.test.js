import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION,
  materializeGreenEnrollmentInputs,
  runGreenEnrollmentMaterializerCli,
} from '../ops/materialize_green_enrollment_inputs.mjs';

const uid = process.getuid();
const gid = process.getgid();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const containerId = hash('synthetic-current-container');
const targetImage = `ghcr.io/shareittoo/api@sha256:${hash('synthetic-target-image')}`;
const principal = '123e4567-e89b-42d3-a456-426614174000';
const recipient = 'new-pilot@example.test';
const existingRecipient = 'existing-pilot@example.test';
const privateName = ['SMTP', '_PASS', 'WORD'].join('');
const privateValue = ['synthetic', 'runtime', 'fragment'].join('-');
const outputNames = ['current.env', 'request.json', 'allowlist.json', 'runtime-identity.json'];
const denied = /green_enrollment_materialization_denied/u;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function writePrivate(filePath, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(canonical(value))}\n`);
  fs.writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function environment() {
  return [
    'NODE_ENV=production',
    'DEPLOYMENT_ENVIRONMENT=test',
    'SIT_STAGING_ALLOWED_USER_IDS=existing-one,existing-two',
    'SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS=existing-one',
    `SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS=${existingRecipient}`,
    `${privateName}=${privateValue}`,
  ];
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sit-w12-materializer-')));
  fs.chmodSync(root, 0o700);
  const recipientFile = path.join(root, 'recipient.json');
  const destination = path.join(root, 'inputs');
  fs.mkdirSync(destination, { mode: 0o700 });
  writePrivate(recipientFile, { email: recipient });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { destination, recipientFile, root };
}

function makeCommand({ environmentEntries = environment(), calls = [], failAt = null } = {}) {
  return async (executable, args) => {
    calls.push({ executable, args: [...args] });
    if (failAt === calls.length) throw new Error('synthetic command response loss');
    let stdout;
    if (args[0] === 'container') {
      stdout = `${JSON.stringify({
        Config: { Env: environmentEntries }, Id: containerId,
        Name: '/shareittoo-staging-api', State: { Running: true },
      })}\n`;
    } else {
      stdout = `${JSON.stringify({ gid, uid })}\n`;
    }
    return { args, executable, status: 0, stdout };
  };
}

function input(fixtureInput, changes = {}) {
  return {
    containerId, targetImage, recipientFile: fixtureInput.recipientFile,
    destination: fixtureInput.destination,
    command: makeCommand(), randomUuidImpl: () => principal,
    operatorUid: uid, operatorGid: gid, requiredOwnerUid: uid,
    ...changes,
  };
}

function cliArguments(fixtureInput) {
  return [
    '--container-id', containerId, '--target-image', targetImage,
    '--recipient-file', fixtureInput.recipientFile, '--destination', fixtureInput.destination,
  ];
}

function assertAbsent(fixtureInput) {
  for (const name of outputNames) assert.equal(fs.existsSync(path.join(fixtureInput.destination, name)), false);
}

function assertSanitized(value, fixtureInput) {
  assert.doesNotMatch(JSON.stringify(value),
    new RegExp(`${principal}|new-pilot|existing-pilot|${privateValue}|${fixtureInput.root}`, 'u'));
}

test('default dry-run performs exact read-only collection and writes nothing', async (t) => {
  const fixtureInput = await fixture(t);
  const calls = [];
  const result = await materializeGreenEnrollmentInputs(input(fixtureInput, {
    command: makeCommand({ calls }),
  }));
  assert.equal(result.status, 'dry-run');
  assert.equal(result.ttlSeconds, 86400);
  assert.equal(result.fileCount, 4);
  assert.equal(result.currentAccessCount, 2);
  assert.equal(result.proposedAccessCount, 3);
  assert.equal(result.currentRecipientCount, 1);
  assert.equal(result.proposedRecipientCount, 2);
  assertAbsent(fixtureInput);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    executable: 'docker',
    args: ['container', 'inspect', '--format', '{{json .}}', containerId],
  });
  assert.deepEqual(calls[1].args.slice(0, 12), [
    'run', '--rm', '--network', 'none', '--read-only', '--user', 'shareittoo',
    '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--entrypoint',
  ]);
  assert.equal(calls.flatMap(({ args }) => args).includes(recipient), false);
  assert.equal(calls.flatMap(({ args }) => args).includes(principal), false);
  assertSanitized(result, fixtureInput);
});

test('execute requires exact confirmation and publishes the protected canonical set', async (t) => {
  const fixtureInput = await fixture(t);
  const argv = cliArguments(fixtureInput);
  const options = {
    command: makeCommand(), randomUuidImpl: () => principal,
    operatorUid: uid, operatorGid: gid, requiredOwnerUid: uid,
  };
  await assert.rejects(() => runGreenEnrollmentMaterializerCli([...argv, '--execute'], options), denied);
  await assert.rejects(() => runGreenEnrollmentMaterializerCli([
    ...argv, '--execute', '--confirm-execute', 'WRONG',
  ], options), denied);
  const result = await runGreenEnrollmentMaterializerCli([
    ...argv, '--execute', '--confirm-execute', GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION,
  ], options);
  assert.equal(result.status, 'created');
  for (const name of outputNames) {
    const metadata = fs.statSync(path.join(fixtureInput.destination, name));
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(metadata.uid, uid);
    assert.equal(metadata.gid, gid);
  }
  assert.equal(fs.readFileSync(path.join(fixtureInput.destination, 'current.env'), 'utf8'),
    `${environment().join('\n')}\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(
    path.join(fixtureInput.destination, 'request.json'), 'utf8',
  )), { email: recipient, ttlSeconds: 86400, userId: principal });
  assert.deepEqual(JSON.parse(fs.readFileSync(
    path.join(fixtureInput.destination, 'allowlist.json'), 'utf8',
  )), {
    allowedUserIds: ['existing-one', 'existing-two', principal],
    schema: 'sit-staging-access-allowlist', version: 1,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(
    path.join(fixtureInput.destination, 'runtime-identity.json'), 'utf8',
  )), { gid, schema: 'sit-staging-runtime-identity-readback', uid, version: 1 });
  assertSanitized(result, fixtureInput);
});

test('CLI rejects unknown, duplicate and relative path arguments before collection', async (t) => {
  const fixtureInput = await fixture(t);
  const argv = cliArguments(fixtureInput);
  let called = false;
  const options = {
    command: async () => { called = true; throw new Error('must not run'); },
    randomUuidImpl: () => principal, operatorUid: uid, operatorGid: gid, requiredOwnerUid: uid,
  };
  await assert.rejects(() => runGreenEnrollmentMaterializerCli(['--unknown'], options), denied);
  await assert.rejects(() => runGreenEnrollmentMaterializerCli([
    ...argv, '--container-id', containerId,
  ], options), denied);
  const relative = [...argv];
  relative[relative.indexOf('--destination') + 1] = 'relative';
  await assert.rejects(() => runGreenEnrollmentMaterializerCli(relative, options), denied);
  assert.equal(called, false);
});

test('command response loss and response drift are sanitized before any write', async (t) => {
  const fixtureInput = await fixture(t);
  for (const command of [
    makeCommand({ failAt: 1 }),
    async (executable, args) => ({ executable, args: [...args, 'drift'], status: 0, stdout: '{}' }),
  ]) {
    let observed;
    try { await materializeGreenEnrollmentInputs(input(fixtureInput, { command })); }
    catch (error) { observed = error; }
    assert.equal(observed.code, 'green_enrollment_materialization_denied');
    assertAbsent(fixtureInput);
    assertSanitized(observed, fixtureInput);
  }
});

test('partial writes self-clean and roll back every earlier output', async (t) => {
  for (const failedName of ['current.env', 'request.json']) {
    await t.test(failedName, async (subtest) => {
      const fixtureInput = await fixture(subtest);
      const descriptors = new Map();
      let failed = false;
      const fileSystem = {
        ...fs,
        openSync(name, ...args) {
          const descriptor = fs.openSync(name, ...args);
          descriptors.set(descriptor, name);
          return descriptor;
        },
        closeSync(descriptor) {
          try { return fs.closeSync(descriptor); } finally { descriptors.delete(descriptor); }
        },
        writeSync(descriptor, bytes, offset, length, position) {
          if (!failed && path.basename(descriptors.get(descriptor) ?? '') === failedName) {
            failed = true;
            fs.writeSync(descriptor, bytes, offset, Math.min(7, length), position);
            throw new Error('synthetic partial write');
          }
          return fs.writeSync(descriptor, bytes, offset, length, position);
        },
      };
      let observed;
      try {
        await materializeGreenEnrollmentInputs(input(fixtureInput, {
          execute: true, confirmation: GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION, fileSystem,
        }));
      } catch (error) { observed = error; }
      assert.equal(observed.state, 'publication-unconfirmed');
      assertAbsent(fixtureInput);
      assertSanitized(observed, fixtureInput);
    });
  }
});

test('recipient replacement after open is rejected without outputs', async (t) => {
  const fixtureInput = await fixture(t);
  let recipientDescriptor;
  let replaced = false;
  const fileSystem = {
    ...fs,
    openSync(name, ...args) {
      const descriptor = fs.openSync(name, ...args);
      if (name === fixtureInput.recipientFile) recipientDescriptor = descriptor;
      return descriptor;
    },
    fstatSync(descriptor, options) {
      const metadata = fs.fstatSync(descriptor, options);
      if (!replaced && descriptor === recipientDescriptor) {
        replaced = true;
        const replacement = `${fixtureInput.recipientFile}.replacement`;
        writePrivate(replacement, { email: recipient });
        fs.renameSync(fixtureInput.recipientFile, `${fixtureInput.recipientFile}.original`);
        fs.renameSync(replacement, fixtureInput.recipientFile);
      }
      return metadata;
    },
  };
  await assert.rejects(() => materializeGreenEnrollmentInputs(input(fixtureInput, {
    fileSystem,
  })), denied);
  assertAbsent(fixtureInput);
});

test('destination symlink is rejected rather than canonicalized', async (t) => {
  const fixtureInput = await fixture(t);
  const alias = path.join(fixtureInput.root, 'destination-alias');
  fs.symlinkSync(fixtureInput.destination, alias);
  await assert.rejects(() => materializeGreenEnrollmentInputs(input(fixtureInput, {
    destination: alias,
  })), denied);
  assertAbsent(fixtureInput);
});

test('O_EXCL create response loss never guesses ownership of the new pathname', async (t) => {
  const fixtureInput = await fixture(t);
  let lost = false;
  const fileSystem = {
    ...fs,
    openSync(name, ...args) {
      const descriptor = fs.openSync(name, ...args);
      if (!lost && path.basename(name) === 'request.json') {
        lost = true;
        fs.closeSync(descriptor);
        throw new Error('synthetic create response loss');
      }
      return descriptor;
    },
  };
  let observed;
  try {
    await materializeGreenEnrollmentInputs(input(fixtureInput, {
      execute: true, confirmation: GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION, fileSystem,
    }));
  } catch (error) { observed = error; }
  assert.equal(observed.state, 'rollback-unconfirmed');
  assert.equal(fs.existsSync(path.join(fixtureInput.destination, 'current.env')), false);
  const unresolved = fs.statSync(path.join(fixtureInput.destination, 'request.json'));
  assert.equal(unresolved.size, 0);
  assert.equal(unresolved.mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(fixtureInput.destination, 'allowlist.json')), false);
  assert.equal(fs.existsSync(path.join(fixtureInput.destination, 'runtime-identity.json')), false);
  assertSanitized(observed, fixtureInput);
});

test('rollback and close uncertainty are fail-closed without private output', async (t) => {
  for (const fault of ['rollback-unlink', 'close-response']) {
    await t.test(fault, async (subtest) => {
      const fixtureInput = await fixture(subtest);
      const descriptors = new Map();
      let partial = false;
      let closeFailed = false;
      const fileSystem = {
        ...fs,
        openSync(name, ...args) {
          const descriptor = fs.openSync(name, ...args);
          descriptors.set(descriptor, name);
          return descriptor;
        },
        closeSync(descriptor) {
          const name = descriptors.get(descriptor);
          descriptors.delete(descriptor);
          const result = fs.closeSync(descriptor);
          if (fault === 'close-response' && !closeFailed
              && path.basename(name ?? '') === 'current.env') {
            closeFailed = true;
            throw new Error('synthetic close response loss');
          }
          return result;
        },
        writeSync(descriptor, bytes, offset, length, position) {
          if (fault === 'rollback-unlink' && !partial
              && path.basename(descriptors.get(descriptor) ?? '') === 'request.json') {
            partial = true;
            fs.writeSync(descriptor, bytes, offset, Math.min(7, length), position);
            throw new Error('synthetic partial write');
          }
          return fs.writeSync(descriptor, bytes, offset, length, position);
        },
        unlinkSync(name) {
          if (fault === 'rollback-unlink' && path.basename(name) === 'current.env') {
            throw new Error('synthetic rollback unlink fault');
          }
          return fs.unlinkSync(name);
        },
      };
      let observed;
      try {
        await materializeGreenEnrollmentInputs(input(fixtureInput, {
          execute: true, confirmation: GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION, fileSystem,
        }));
      } catch (error) { observed = error; }
      assert.equal(observed.state, 'rollback-unconfirmed');
      assert.equal(fs.existsSync(path.join(fixtureInput.destination, 'request.json')), false);
      assertSanitized(observed, fixtureInput);
    });
  }
});

test('CLI process emits only sanitized JSON on argument failure', () => {
  const cliFile = fileURLToPath(new URL('../ops/materialize_green_enrollment_inputs.mjs', import.meta.url));
  const privateFragment = 'private-recipient@example.test';
  const result = spawnSync(process.execPath, [cliFile, '--unknown', privateFragment], {
    encoding: 'utf8', shell: false,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '{"status":"denied"}\n');
  assert.doesNotMatch(result.stderr, new RegExp(privateFragment, 'u'));
});
