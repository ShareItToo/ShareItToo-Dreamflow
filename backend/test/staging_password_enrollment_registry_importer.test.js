import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  importStagingPasswordEnrollmentRegistry,
  StagingPasswordRegistryPublicationUnconfirmed,
} from '../ops/import_staging_password_enrollment_registry.mjs';
import {
  readProtectedStagingPasswordEnrollmentRegistry,
} from '../src/staging_password_enrollment.js';

const now = Date.parse('2026-10-05T12:00:00.000Z');
const operatorUid = process.getuid();
const operatorGid = process.getgid();
const denied = /staging_password_registry_import_failed/u;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
}

const bytes = (value) => Buffer.from(`${JSON.stringify(ordered(value))}\n`);

function invitation(index = 1, changes = {}) {
  return {
    tokenDigest: sha256(`synthetic-token-${index}`),
    emailDigest: sha256(`synthetic-email-${index}`),
    userId: `synthetic-import-principal-${index}`,
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    ...changes,
  };
}

function serverEnvelope(record) {
  return { schema: 'sit-staging-password-invitation', version: 1, ...record };
}

function writePrivate(file, value) {
  fs.writeFileSync(file, bytes(value), { flag: 'wx', mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function fixture(t, { record = invitation(), allowed = null } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sit-registry-import-')));
  fs.chmodSync(root, 0o700);
  const bundle = path.join(root, 'bundle');
  fs.mkdirSync(bundle, { mode: 0o700 });
  const serverRecordFile = path.join(bundle, 'server-record.json');
  const handoffFile = path.join(bundle, 'handoff.json');
  const allowlistFile = path.join(root, 'allowlist.json');
  const runtimeIdentityFile = path.join(root, 'runtime-identity.json');
  const outputFile = path.join(root, 'registry.json');
  writePrivate(serverRecordFile, serverEnvelope(record));
  writePrivate(handoffFile, {
    schema: 'sit-staging-password-handoff', version: 1,
    email: 'must-never-open@example.invalid', token: 'private-bearer-must-never-open',
    expiresAt: record.expiresAt,
  });
  writePrivate(allowlistFile, {
    schema: 'sit-staging-access-allowlist', version: 1,
    allowedUserIds: allowed ?? [record.userId],
  });
  writePrivate(runtimeIdentityFile, {
    schema: 'sit-staging-runtime-identity-readback', version: 1,
    uid: operatorUid, gid: operatorGid,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root, bundle, serverRecordFile, handoffFile, allowlistFile,
    runtimeIdentityFile, outputFile, record,
  };
}

function run(input, changes = {}) {
  return importStagingPasswordEnrollmentRegistry({
    serverRecordFile: input.serverRecordFile,
    allowlistFile: input.allowlistFile,
    runtimeIdentityFile: input.runtimeIdentityFile,
    outputFile: input.outputFile,
    targetUid: operatorUid,
    targetGid: operatorGid,
    execute: false,
    now: () => now,
    randomBytesImpl: () => Buffer.alloc(16, 7),
    ...changes,
  });
}

test('dry run and execute emit only aggregate evidence and never open handoff.json', async (t) => {
  const input = await fixture(t);
  const opened = [];
  const fileSystem = {
    ...fs,
    openSync(name, ...args) {
      opened.push(name);
      return fs.openSync(name, ...args);
    },
  };
  const dry = run(input, { fileSystem });
  assert.deepEqual(Object.keys(dry), ['status', 'count', 'contentSha256', 'pathSha256']);
  assert.equal(dry.status, 'dry-run');
  assert.equal(dry.count, 1);
  assert.equal(dry.pathSha256, sha256(input.outputFile));
  assert.equal(fs.existsSync(input.outputFile), false);

  const created = run(input, { execute: true, fileSystem });
  assert.deepEqual(created, { ...dry, status: 'created' });
  const expected = bytes([input.record]);
  assert.deepEqual(fs.readFileSync(input.outputFile), expected);
  assert.equal(created.contentSha256, sha256(expected));
  assert.deepEqual(readProtectedStagingPasswordEnrollmentRegistry(input.outputFile), [ordered(input.record)]);
  const metadata = fs.statSync(input.outputFile);
  assert.equal(metadata.mode & 0o777, 0o600);
  assert.equal(metadata.uid, operatorUid);
  assert.equal(metadata.gid, operatorGid);
  assert.equal(opened.includes(input.handoffFile), false);
  assert.deepEqual(fs.readdirSync(input.root).sort(), [
    'allowlist.json', 'bundle', 'registry.json', 'runtime-identity.json',
  ]);
  const serialized = JSON.stringify(created);
  for (const privateValue of [input.record.userId, input.record.tokenDigest,
    input.record.emailDigest, input.outputFile]) assert.equal(serialized.includes(privateValue), false);
});

test('optional merge requires and preserves the exact canonical base', async (t) => {
  const next = invitation(2);
  const input = await fixture(t, { record: next, allowed: [invitation(1).userId, next.userId] });
  const baseFile = path.join(input.root, 'base.json');
  const base = invitation(1);
  writePrivate(baseFile, [base]);
  const baseDigest = sha256(fs.readFileSync(baseFile));

  assert.throws(() => run(input, { baseFile }), denied);
  assert.throws(() => run(input, {
    baseFile, expectedBaseSha256: 'f'.repeat(64),
  }), denied);
  const result = run(input, {
    baseFile, expectedBaseSha256: baseDigest, execute: true,
  });
  assert.equal(result.count, 2);
  assert.deepEqual(readProtectedStagingPasswordEnrollmentRegistry(input.outputFile), [
    ordered(base), ordered(next),
  ]);
  assert.deepEqual(fs.readFileSync(baseFile), bytes([base]));
});

for (const duplicate of ['tokenDigest', 'emailDigest', 'userId']) {
  test(`merge rejects duplicate ${duplicate}`, async (t) => {
    const base = invitation(1);
    const next = invitation(2, { [duplicate]: base[duplicate] });
    const input = await fixture(t, {
      record: next,
      allowed: [...new Set([base.userId, next.userId])],
    });
    const baseFile = path.join(input.root, 'base.json');
    writePrivate(baseFile, [base]);
    assert.throws(() => run(input, {
      baseFile,
      expectedBaseSha256: sha256(fs.readFileSync(baseFile)),
    }), denied);
  });
}

test('expired, future, overlong and non-allowlisted records fail closed', async (t) => {
  for (const [index, changes] of [
    [10, { expiresAt: new Date(now).toISOString() }],
    [11, { issuedAt: new Date(now + 1).toISOString() }],
    [12, { expiresAt: new Date(now + 86_400_001).toISOString() }],
  ]) {
    await t.test(String(index), async (st) => {
      const control = await fixture(st, { record: invitation(index) });
      assert.equal(run(control).status, 'dry-run');
      const input = await fixture(st, { record: invitation(index, changes) });
      assert.throws(() => run(input), denied);
    });
  }
  const foreign = invitation(13);
  const input = await fixture(t, { record: foreign, allowed: ['different-principal'] });
  assert.throws(() => run(input), denied);
});

test('schema extras and runtime identity mismatch are rejected', async (t) => {
  const input = await fixture(t);
  fs.unlinkSync(input.serverRecordFile);
  writePrivate(input.serverRecordFile, { ...serverEnvelope(input.record), extra: true });
  assert.throws(() => run(input), denied);

  const identityMismatch = await fixture(t, { record: invitation(3) });
  assert.throws(() => run(identityMismatch, { targetUid: operatorUid + 1 }), denied);
  assert.throws(() => run(identityMismatch, { targetGid: operatorGid + 1 }), denied);

  const allowlistExtra = await fixture(t, { record: invitation(4) });
  fs.unlinkSync(allowlistExtra.allowlistFile);
  writePrivate(allowlistExtra.allowlistFile, {
    schema: 'sit-staging-access-allowlist', version: 1,
    allowedUserIds: [allowlistExtra.record.userId], extra: true,
  });
  assert.throws(() => run(allowlistExtra), denied);

  const identityExtra = await fixture(t, { record: invitation(5) });
  fs.unlinkSync(identityExtra.runtimeIdentityFile);
  writePrivate(identityExtra.runtimeIdentityFile, {
    schema: 'sit-staging-runtime-identity-readback', version: 1,
    uid: operatorUid, gid: operatorGid, extra: true,
  });
  assert.throws(() => run(identityExtra), denied);
});

test('protected input permissions, links and parent mode remain fail closed', async (t) => {
  const input = await fixture(t);
  fs.chmodSync(input.serverRecordFile, 0o640);
  assert.throws(() => run(input), denied);
  fs.chmodSync(input.serverRecordFile, 0o600);

  const alias = path.join(input.bundle, 'record-alias.json');
  fs.linkSync(input.serverRecordFile, alias);
  assert.throws(() => run(input), denied);
  fs.unlinkSync(alias);

  const original = `${input.serverRecordFile}.original`;
  fs.renameSync(input.serverRecordFile, original);
  fs.symlinkSync(original, input.serverRecordFile);
  assert.throws(() => run(input), denied);
  fs.unlinkSync(input.serverRecordFile);
  fs.renameSync(original, input.serverRecordFile);

  fs.chmodSync(input.bundle, 0o750);
  assert.throws(() => run(input), denied);
});

test('protected input ownership is bound even when descriptor and path metadata agree', async (t) => {
  const input = await fixture(t);
  const descriptors = new Map();
  const foreignOwner = (metadata) => ({ ...metadata, uid: metadata.uid + 1n });
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      descriptors.set(descriptor, name);
      return descriptor;
    },
    fstatSync(descriptor, options) {
      const metadata = fs.fstatSync(descriptor, options);
      return descriptors.get(descriptor) === input.serverRecordFile
        ? foreignOwner(metadata) : metadata;
    },
    lstatSync(name, options) {
      const metadata = fs.lstatSync(name, options);
      return name === input.serverRecordFile ? foreignOwner(metadata) : metadata;
    },
  };
  assert.throws(() => run(input, { fileSystem }), denied);
});

test('ancestor symlinks are rejected before invitation bytes are read', async (t) => {
  const input = await fixture(t);
  const alias = path.join(input.root, 'bundle-alias');
  fs.symlinkSync(input.bundle, alias, 'dir');
  let invitationReads = 0;
  const descriptors = new Map();
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      descriptors.set(descriptor, name);
      return descriptor;
    },
    readSync(descriptor, ...args) {
      if (descriptors.get(descriptor) === path.join(alias, 'server-record.json')) {
        invitationReads += 1;
      }
      return fs.readSync(descriptor, ...args);
    },
  };
  assert.throws(() => run(input, {
    serverRecordFile: path.join(alias, 'server-record.json'), fileSystem,
  }), denied);
  assert.equal(invitationReads, 0);
});

test('descriptor chain rejects parent substitution with rename-back and closes everything', async (t) => {
  const input = await fixture(t);
  const oldBundle = `${input.bundle}-old`;
  const replacement = `${input.bundle}-replacement`;
  const opened = [];
  const closed = [];
  let substituted = false;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      if (name === input.serverRecordFile && !substituted) {
        fs.renameSync(input.bundle, oldBundle);
        fs.mkdirSync(input.bundle, { mode: 0o700 });
        writePrivate(input.serverRecordFile, serverEnvelope(input.record));
        const descriptor = fs.openSync(name, flags, ...args);
        fs.renameSync(input.bundle, replacement);
        fs.renameSync(oldBundle, input.bundle);
        opened.push(descriptor);
        substituted = true;
        return descriptor;
      }
      const descriptor = fs.openSync(name, flags, ...args);
      opened.push(descriptor);
      return descriptor;
    },
    closeSync(descriptor) {
      fs.closeSync(descriptor);
      closed.push(descriptor);
    },
  };
  assert.throws(() => run(input, { fileSystem }), denied);
  assert.equal(substituted, true);
  assert.deepEqual(closed.toSorted(), opened.toSorted());
});

test('leaf replacement after descriptor open is rejected', async (t) => {
  const input = await fixture(t);
  const original = `${input.serverRecordFile}.original`;
  let replaced = false;
  let leafOpened = false;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      if (name === input.serverRecordFile) leafOpened = true;
      return descriptor;
    },
    lstatSync(name, ...args) {
      if (name === input.serverRecordFile && leafOpened && !replaced) {
        fs.renameSync(input.serverRecordFile, original);
        writePrivate(input.serverRecordFile, serverEnvelope(input.record));
        replaced = true;
      }
      return fs.lstatSync(name, ...args);
    },
  };
  assert.throws(() => run(input, { fileSystem }), denied);
  assert.equal(replaced, true);
});

test('successful content validation is rejected if a descriptor close fails', async (t) => {
  const input = await fixture(t);
  let failed = false;
  const fileSystem = {
    ...fs,
    closeSync(descriptor) {
      fs.closeSync(descriptor);
      if (!failed) {
        failed = true;
        throw new Error(`/private/${input.record.userId}`);
      }
    },
  };
  assert.throws(() => run(input, { fileSystem }), denied);
  assert.equal(failed, true);
});

test('a valid input changed between locked reads is rejected as drift', async (t) => {
  const original = invitation(20);
  const changed = invitation(21, { userId: original.userId });
  const control = await fixture(t, { record: changed });
  assert.equal(run(control).status, 'dry-run');

  const input = await fixture(t, { record: original });
  let changedAfterLock = false;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      if (name === `${input.outputFile}.import.lock` && !changedAfterLock) {
        fs.writeFileSync(input.serverRecordFile, bytes(serverEnvelope(changed)));
        fs.chmodSync(input.serverRecordFile, 0o600);
        changedAfterLock = true;
      }
      return descriptor;
    },
  };
  assert.throws(() => run(input, { execute: true, fileSystem }), denied);
  assert.equal(changedAfterLock, true);
  assert.equal(fs.existsSync(input.outputFile), false);
});

test('an expired base is rejected while an otherwise identical valid base is accepted', async (t) => {
  const base = invitation(30);
  const next = invitation(31);
  const input = await fixture(t, { record: next, allowed: [base.userId, next.userId] });
  const baseFile = path.join(input.root, 'base.json');
  writePrivate(baseFile, [base]);
  assert.equal(run(input, {
    baseFile, expectedBaseSha256: sha256(fs.readFileSync(baseFile)),
  }).status, 'dry-run');

  fs.unlinkSync(baseFile);
  writePrivate(baseFile, [{ ...base, expiresAt: new Date(now).toISOString() }]);
  assert.throws(() => run(input, {
    baseFile, expectedBaseSha256: sha256(fs.readFileSync(baseFile)),
  }), denied);
});

test('output parent must remain trusted and its close failure denies dry run', async (t) => {
  const unsafe = await fixture(t);
  const unsafeOutput = path.join(unsafe.root, 'unsafe-output');
  fs.mkdirSync(unsafeOutput, { mode: 0o750 });
  assert.throws(() => run(unsafe, {
    outputFile: path.join(unsafeOutput, 'registry.json'),
  }), denied);

  const closeFault = await fixture(t, { record: invitation(6) });
  const outputParent = path.join(closeFault.root, 'output');
  fs.mkdirSync(outputParent, { mode: 0o700 });
  const descriptors = new Map();
  let failed = false;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      descriptors.set(descriptor, name);
      return descriptor;
    },
    closeSync(descriptor) {
      fs.closeSync(descriptor);
      if (descriptors.get(descriptor) === outputParent && !failed) {
        failed = true;
        throw new Error('/private/output-parent-close');
      }
    },
  };
  assert.throws(() => run(closeFault, {
    outputFile: path.join(outputParent, 'registry.json'), fileSystem,
  }), denied);
  assert.equal(failed, true);
});

test('output and lock are no-replace and publication failure cleans owned temporary state', async (t) => {
  const occupied = await fixture(t);
  fs.writeFileSync(occupied.outputFile, 'preserve', { mode: 0o600 });
  assert.throws(() => run(occupied, { execute: true }), denied);
  assert.equal(fs.readFileSync(occupied.outputFile, 'utf8'), 'preserve');

  const locked = await fixture(t, { record: invitation(4) });
  const lock = `${locked.outputFile}.import.lock`;
  fs.writeFileSync(lock, 'preserve', { mode: 0o600 });
  assert.throws(() => run(locked, { execute: true }), denied);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'preserve');

  const failed = await fixture(t, { record: invitation(5) });
  const fileSystem = { ...fs, linkSync() { throw new Error('/private/link-failure'); } };
  assert.throws(() => run(failed, { execute: true, fileSystem }), denied);
  assert.equal(fs.existsSync(failed.outputFile), false);
  assert.deepEqual(fs.readdirSync(failed.root).filter((name) => name.includes('.import')), []);
});

test('post-publication fsync and close faults return only aggregate unconfirmed evidence', async (t) => {
  for (const fault of ['fsync', 'close']) {
    await t.test(fault, async (st) => {
      const input = await fixture(st, { record: invitation(fault === 'fsync' ? 40 : 41) });
      const descriptors = new Map();
      let injected = false;
      const fileSystem = {
        ...fs,
        openSync(name, flags, ...args) {
          const descriptor = fs.openSync(name, flags, ...args);
          descriptors.set(descriptor, name);
          return descriptor;
        },
        fsyncSync(descriptor) {
          if (fault === 'fsync' && descriptors.get(descriptor) === input.root
              && fs.existsSync(input.outputFile) && !injected) {
            injected = true;
            throw new Error(`/private/${input.record.userId}`);
          }
          return fs.fsyncSync(descriptor);
        },
        closeSync(descriptor) {
          fs.closeSync(descriptor);
          if (fault === 'close' && descriptors.get(descriptor) === input.root
              && fs.existsSync(input.outputFile) && !injected) {
            injected = true;
            throw new Error(`/private/${input.record.userId}`);
          }
        },
      };
      assert.throws(() => run(input, { execute: true, fileSystem }), (error) => {
        assert.equal(error instanceof StagingPasswordRegistryPublicationUnconfirmed, true);
        assert.deepEqual(Object.keys(error.result), [
          'status', 'count', 'contentSha256', 'pathSha256',
        ]);
        assert.equal(error.result.status, 'publication-unconfirmed');
        const serialized = JSON.stringify(error.result);
        return !serialized.includes(input.record.userId)
          && !serialized.includes(input.outputFile);
      });
      assert.equal(injected, true);
      assert.equal(fs.existsSync(input.outputFile), true);
      assert.equal(fs.existsSync(`${input.outputFile}.import.lock`), false);
    });
  }
});

test('CLI exits 2 with aggregate evidence when publication cannot be confirmed', async (t) => {
  const wallClock = Date.now();
  const record = invitation(50, {
    issuedAt: new Date(wallClock - 60_000).toISOString(),
    expiresAt: new Date(wallClock + 3_600_000).toISOString(),
  });
  const input = await fixture(t, { record });
  const preloader = `
    import fs from 'node:fs';
    const original = fs.fsyncSync.bind(fs);
    let injected = false;
    fs.fsyncSync = (descriptor) => {
      const outputIndex = process.argv.indexOf('--output');
      const output = process.argv[outputIndex + 1];
      if (!injected && outputIndex > 0 && fs.existsSync(output)) {
        injected = true;
        throw new Error('synthetic post-link fsync fault');
      }
      return original(descriptor);
    };
  `;
  const cli = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(preloader)}`,
    new URL('../ops/import_staging_password_enrollment_registry.mjs', import.meta.url).pathname,
    '--server-record', input.serverRecordFile,
    '--allowlist', input.allowlistFile,
    '--runtime-identity', input.runtimeIdentityFile,
    '--output', input.outputFile,
    '--target-uid', String(operatorUid),
    '--target-gid', String(operatorGid),
    '--execute',
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 2);
  assert.equal(cli.stderr, '');
  const result = JSON.parse(cli.stdout);
  assert.deepEqual(Object.keys(result), [
    'status', 'count', 'contentSha256', 'pathSha256',
  ]);
  assert.equal(result.status, 'publication-unconfirmed');
  assert.equal(result.count, 1);
  assert.equal(fs.existsSync(input.outputFile), true);
  assert.equal(fs.existsSync(`${input.outputFile}.import.lock`), false);
  for (const privateValue of [input.root, record.userId,
    record.tokenDigest, record.emailDigest]) {
    assert.equal(`${cli.stdout}${cli.stderr}`.includes(privateValue), false);
  }
});

test('CLI failure is sanitized and cannot expose paths or record values', async (t) => {
  const input = await fixture(t);
  fs.writeFileSync(input.serverRecordFile, input.record.userId, { mode: 0o600 });
  const cli = spawnSync(process.execPath, [
    new URL('../ops/import_staging_password_enrollment_registry.mjs', import.meta.url).pathname,
    '--server-record', input.serverRecordFile,
    '--allowlist', input.allowlistFile,
    '--runtime-identity', input.runtimeIdentityFile,
    '--output', input.outputFile,
    '--target-uid', String(operatorUid),
    '--target-gid', String(operatorGid),
  ], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.equal(cli.stderr, '{"status":"denied"}\n');
  for (const privateValue of [input.root, input.record.userId]) {
    assert.equal(`${cli.stdout}${cli.stderr}`.includes(privateValue), false);
  }
});
