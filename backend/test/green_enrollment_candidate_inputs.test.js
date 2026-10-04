import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildGreenEnrollmentCandidateInputs,
  GREEN_ENROLLMENT_EXACT_TTL_SECONDS,
} from '../ops/build_green_enrollment_candidate_inputs.mjs';

const now = Date.parse('2026-10-05T12:00:00.000Z');
const uid = process.getuid();
const gid = process.getgid();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const denied = /green_enrollment_candidate_inputs_denied/u;
const principal = '123e4567-e89b-42d3-a456-426614174000';
const existingRecipient = 'existing-approved@example.test';
const recipient = 'approved@example.test';
const credentialUserValue = ['relay', 'account'].join('-');
const credentialName = ['SMTP', '_PASS', 'WORD'].join('');
const credentialValue = ['runtime', 'fragment', 'only'].join('-');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function writePrivate(file, value) {
  const bytes = Buffer.isBuffer(value) ? value
    : Buffer.from(`${JSON.stringify(canonical(value))}\n`);
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function currentEnvironment() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0', PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    APP_PUBLIC_URL: 'http://shareittoo-staging-api:8080', MAIL_TRANSPORT: 'memory',
    SIT_STAGING_ALLOWED_USER_IDS: 'existing-one,existing-two',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'existing-one',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: existingRecipient,
    SMTP_HOST: 'protected-relay.internal', SMTP_PORT: '25', SMTP_SECURE: 'false',
    SMTP_REQUIRE_TLS: 'true', SMTP_USER: credentialUserValue, [credentialName]: credentialValue,
    MAIL_FROM: 'ShareItToo <sender@example.test>', MAIL_REPLY_TO: 'reply@example.test',
    APP_COMMIT: 'a'.repeat(40), APP_VERSION: '1.2.3+4',
    APP_BUILD_TIME: '2026-10-05T00:00:00Z',
  };
}

const envBytes = (environment) => Buffer.from(`${Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`).join('\n')}\n`);

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sit-green-inputs-')));
  fs.chmodSync(root, 0o700);
  const currentEnvironmentFile = path.join(root, 'current.env');
  const requestFile = path.join(root, 'request.json');
  const allowlistFile = path.join(root, 'allowlist.json');
  const runtimeIdentityFile = path.join(root, 'runtime-identity.json');
  const bundle = path.join(root, 'bundle');
  fs.mkdirSync(bundle, { mode: 0o700 });
  const output = path.join(root, 'output');
  fs.mkdirSync(output, { mode: 0o700 });
  const serverRecordFile = path.join(bundle, 'server-record.json');
  const registryFile = path.join(root, 'registry.json');
  const pretransitionOutputFile = path.join(output, 'pretransition.env');
  const activationOutputFile = path.join(output, 'activation.env');
  const tokenDigest = hash('synthetic-verifier');
  const record = {
    emailDigest: hash(`${tokenDigest}\n${recipient}`),
    expiresAt: new Date(now + GREEN_ENROLLMENT_EXACT_TTL_SECONDS * 1000).toISOString(),
    issuedAt: new Date(now).toISOString(), tokenDigest, userId: principal,
  };
  writePrivate(currentEnvironmentFile, envBytes(currentEnvironment()));
  writePrivate(requestFile, {
    email: recipient, ttlSeconds: GREEN_ENROLLMENT_EXACT_TTL_SECONDS, userId: principal,
  });
  writePrivate(allowlistFile, {
    allowedUserIds: ['existing-one', 'existing-two', principal],
    schema: 'sit-staging-access-allowlist', version: 1,
  });
  writePrivate(runtimeIdentityFile, {
    gid, schema: 'sit-staging-runtime-identity-readback', uid, version: 1,
  });
  writePrivate(serverRecordFile, {
    ...record, schema: 'sit-staging-password-invitation', version: 1,
  });
  writePrivate(registryFile, [record]);
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root, output, currentEnvironmentFile, requestFile, allowlistFile, runtimeIdentityFile,
    serverRecordFile, registryFile, pretransitionOutputFile, activationOutputFile,
  };
}

function run(input, changes = {}) {
  return buildGreenEnrollmentCandidateInputs({
    ...input, targetUid: uid, targetGid: gid, now: () => now,
    pretransitionScryptSalt: hash('pretransition-salt'),
    activationScryptSalt: hash('activation-salt'),
    ...changes,
  });
}

test('dry-run binds protected inputs and execute publishes exact no-leak env pair', async (t) => {
  const input = await fixture(t);
  const dry = run(input);
  assert.equal(dry.status, 'dry-run');
  assert.equal(dry.requiresPretransition, true);
  assert.equal(dry.ttlSeconds, 86400);
  assert.equal(dry.currentAccessCount, 2);
  assert.equal(dry.proposedAccessCount, 3);
  assert.equal(dry.currentRecipientCount, 1);
  assert.equal(dry.proposedRecipientCount, 2);
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  const created = run(input, { execute: true });
  assert.equal(created.status, 'created');
  for (const file of [input.pretransitionOutputFile, input.activationOutputFile]) {
    const metadata = fs.statSync(file);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(metadata.uid, uid);
    assert.equal(metadata.gid, gid);
  }
  const pretransition = await readFile(input.pretransitionOutputFile, 'utf8');
  const activation = await readFile(input.activationOutputFile, 'utf8');
  assert.match(pretransition, /SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED=false/u);
  assert.match(activation, /SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED=true/u);
  assert.match(activation,
    /SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE=\/run\/secrets\/staging-password-enrollment-registry\.json/u);
  assert.match(activation,
    new RegExp(`SIT_STAGING_ALLOWED_USER_IDS=existing-one,existing-two,${principal}`, 'u'));
  assert.match(activation,
    new RegExp(`SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS=existing-one,${principal}`, 'u'));
  assert.match(activation,
    new RegExp(`SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS=${existingRecipient},${recipient}`, 'u'));
  assert.doesNotMatch(`${pretransition}${activation}`, /APP_COMMIT|APP_VERSION|APP_BUILD_TIME/u);
  assert.match(pretransition, new RegExp(`NODE_ENV=production[\\s\\S]*${credentialName}=${credentialValue}`, 'u'));
  assert.doesNotMatch(JSON.stringify(created),
    new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
});

test('TTL policy and protected input permissions fail closed', async (t) => {
  const input = await fixture(t);
  fs.unlinkSync(input.requestFile);
  writePrivate(input.requestFile, { email: recipient, ttlSeconds: 3600, userId: principal });
  assert.throws(() => run(input), (error) => error.state === 'ttl-policy');
  fs.unlinkSync(input.requestFile);
  writePrivate(input.requestFile, {
    email: recipient, ttlSeconds: GREEN_ENROLLMENT_EXACT_TTL_SECONDS, userId: principal,
  });
  fs.chmodSync(input.requestFile, 0o640);
  assert.throws(() => run(input), denied);
});

test('post-open leaf replacement and parent substitution are rejected', async (t) => {
  const input = await fixture(t);
  let leafReplaced = false;
  let requestDescriptor;
  const leafFs = {
    ...fs,
    openSync(name, ...args) {
      const descriptor = fs.openSync(name, ...args);
      if (name === input.requestFile) requestDescriptor = descriptor;
      return descriptor;
    },
    fstatSync(descriptor, options) {
      const metadata = fs.fstatSync(descriptor, options);
      if (!leafReplaced && descriptor === requestDescriptor) {
        leafReplaced = true;
        const replacement = `${input.requestFile}.replacement`;
        writePrivate(replacement, {
          email: recipient, ttlSeconds: GREEN_ENROLLMENT_EXACT_TTL_SECONDS, userId: principal,
        });
        fs.renameSync(input.requestFile, `${input.requestFile}.original`);
        fs.renameSync(replacement, input.requestFile);
      }
      return metadata;
    },
  };
  assert.throws(() => run(input, { fileSystem: leafFs }), denied);

  const second = await fixture(t);
  t.after(() => rm(`${second.root}.original`, { recursive: true, force: true }));
  let parentChanged = false;
  const parentFs = {
    ...fs,
    lstatSync(name, options) {
      const metadata = fs.lstatSync(name, options);
      if (!parentChanged && name === second.root) {
        parentChanged = true;
        fs.renameSync(second.root, `${second.root}.original`);
        fs.mkdirSync(second.root, { mode: 0o700 });
      }
      return metadata;
    },
  };
  assert.throws(() => run(second, { fileSystem: parentFs }), denied);
});

test('second publication failure rolls back the first exact file without leakage', async (t) => {
  const input = await fixture(t);
  const failingFs = {
    ...fs,
    openSync(name, ...args) {
      if (name === input.activationOutputFile) {
        const error = new Error('synthetic private failure');
        error.code = 'EIO';
        throw error;
      }
      return fs.openSync(name, ...args);
    },
  };
  let observed;
  try { run(input, { execute: true, fileSystem: failingFs }); } catch (error) { observed = error; }
  assert.equal(observed.code, 'green_enrollment_candidate_inputs_denied');
  assert.equal(observed.state, 'green_enrollment_candidate_inputs_publication_unconfirmed');
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  assert.equal(fs.existsSync(input.activationOutputFile), false);
  assert.doesNotMatch(JSON.stringify(observed),
    new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
});

test('partial writes self-clean each output and durably roll back the pair', async (t) => {
  for (const failedOutput of ['pretransitionOutputFile', 'activationOutputFile']) {
    await t.test(failedOutput, async (subtest) => {
      const input = await fixture(subtest);
      const descriptors = new Map();
      let failed = false;
      const failingFs = {
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
          if (!failed && descriptors.get(descriptor) === input[failedOutput]) {
            failed = true;
            fs.writeSync(descriptor, bytes, offset, Math.min(7, length), position);
            throw new Error('synthetic partial write');
          }
          return fs.writeSync(descriptor, bytes, offset, length, position);
        },
      };
      let observed;
      try { run(input, { execute: true, fileSystem: failingFs }); } catch (error) { observed = error; }
      assert.equal(observed.code, 'green_enrollment_candidate_inputs_denied');
      assert.equal(observed.state, 'green_enrollment_candidate_inputs_publication_unconfirmed');
      assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
      assert.equal(fs.existsSync(input.activationOutputFile), false);
      assert.doesNotMatch(JSON.stringify(observed),
        new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
    });
  }
});

test('a substituted output is never deleted during failed self-cleanup', async (t) => {
  const input = await fixture(t);
  const descriptors = new Map();
  const replacementBytes = Buffer.from('foreign-replacement\n');
  let replaced = false;
  const substitutingFs = {
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
      if (!replaced && descriptors.get(descriptor) === input.activationOutputFile) {
        replaced = true;
        fs.writeSync(descriptor, bytes, offset, Math.min(7, length), position);
        fs.renameSync(input.activationOutputFile, `${input.activationOutputFile}.original`);
        writePrivate(input.activationOutputFile, replacementBytes);
        throw new Error('synthetic replacement race');
      }
      return fs.writeSync(descriptor, bytes, offset, length, position);
    },
  };
  let observed;
  try { run(input, { execute: true, fileSystem: substitutingFs }); } catch (error) { observed = error; }
  assert.equal(observed.state, 'rollback-unconfirmed');
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  assert.deepEqual(fs.readFileSync(input.activationOutputFile), replacementBytes);
  assert.doesNotMatch(JSON.stringify(observed),
    new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
});

test('cleanup unlink and parent fsync faults are rollback-unconfirmed and sanitized', async (t) => {
  for (const fault of ['unlink', 'parent-fsync']) {
    await t.test(fault, async (subtest) => {
      const input = await fixture(subtest);
      const descriptors = new Map();
      let partial = false;
      let removed = false;
      const failingFs = {
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
          if (!partial && descriptors.get(descriptor) === input.pretransitionOutputFile) {
            partial = true;
            fs.writeSync(descriptor, bytes, offset, Math.min(7, length), position);
            throw new Error('synthetic partial write');
          }
          return fs.writeSync(descriptor, bytes, offset, length, position);
        },
        unlinkSync(name) {
          if (name === input.pretransitionOutputFile) {
            if (fault === 'unlink') throw new Error('synthetic unlink fault');
            removed = true;
          }
          return fs.unlinkSync(name);
        },
        fsyncSync(descriptor) {
          if (fault === 'parent-fsync' && removed) throw new Error('synthetic parent fsync fault');
          return fs.fsyncSync(descriptor);
        },
      };
      let observed;
      try { run(input, { execute: true, fileSystem: failingFs }); } catch (error) { observed = error; }
      assert.equal(observed.state, 'rollback-unconfirmed');
      assert.equal(fs.existsSync(input.activationOutputFile), false);
      assert.equal(fs.existsSync(input.pretransitionOutputFile), fault === 'unlink');
      assert.doesNotMatch(JSON.stringify(observed),
        new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
    });
  }
});

test('close uncertainty self-cleans but remains rollback-unconfirmed', async (t) => {
  const input = await fixture(t);
  const descriptors = new Map();
  let failed = false;
  const failingFs = {
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
      if (!failed && name === input.pretransitionOutputFile) {
        failed = true;
        throw new Error('synthetic close response loss');
      }
      return result;
    },
  };
  let observed;
  try { run(input, { execute: true, fileSystem: failingFs }); } catch (error) { observed = error; }
  assert.equal(observed.state, 'rollback-unconfirmed');
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  assert.equal(fs.existsSync(input.activationOutputFile), false);
  assert.doesNotMatch(JSON.stringify(observed),
    new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
});

test('caller rollback requires durable parent fsync confirmation', async (t) => {
  const input = await fixture(t);
  let pretransitionRemoved = false;
  const failingFs = {
    ...fs,
    openSync(name, ...args) {
      if (name === input.activationOutputFile) throw new Error('synthetic second create fault');
      return fs.openSync(name, ...args);
    },
    unlinkSync(name) {
      if (name === input.pretransitionOutputFile) pretransitionRemoved = true;
      return fs.unlinkSync(name);
    },
    fsyncSync(descriptor) {
      if (pretransitionRemoved) throw new Error('synthetic rollback parent fsync fault');
      return fs.fsyncSync(descriptor);
    },
  };
  let observed;
  try { run(input, { execute: true, fileSystem: failingFs }); } catch (error) { observed = error; }
  assert.equal(observed.state, 'rollback-unconfirmed');
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  assert.equal(fs.existsSync(input.activationOutputFile), false);
  assert.doesNotMatch(JSON.stringify(observed),
    new RegExp(`${principal}|approved@example|protected-relay|${credentialValue}|${input.root}`, 'u'));
});

test('output parent mode drift after descriptor open fails before creation', async (t) => {
  const input = await fixture(t);
  let changed = false;
  const driftingFs = {
    ...fs,
    lstatSync(name, options) {
      const metadata = fs.lstatSync(name, options);
      if (!changed && name === input.output) {
        changed = true;
        fs.chmodSync(input.output, 0o750);
      }
      return metadata;
    },
  };
  let observed;
  try { run(input, { execute: true, fileSystem: driftingFs }); } catch (error) { observed = error; }
  fs.chmodSync(input.output, 0o700);
  assert.equal(observed.code, 'green_enrollment_candidate_inputs_denied');
  assert.equal(fs.existsSync(input.pretransitionOutputFile), false);
  assert.equal(fs.existsSync(input.activationOutputFile), false);
});
