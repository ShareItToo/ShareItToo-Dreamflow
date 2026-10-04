import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  readProtectedStagingPasswordEnrollmentRegistry,
  readStagingPasswordEnrollmentConfiguration,
} from '../src/staging_password_enrollment.js';

const now = Date.parse('2026-10-04T12:00:00.000Z');
const userId = 'synthetic-file-enrollment-principal';
const invitation = {
  emailDigest: '2'.repeat(64),
  expiresAt: new Date(now + 3_600_000).toISOString(),
  issuedAt: new Date(now).toISOString(),
  tokenDigest: '1'.repeat(64),
  userId,
};
const canonicalBytes = `${JSON.stringify([invitation])}\n`;
const stagingAccess = {
  enabled: true,
  valid: true,
  deploymentEnvironment: 'staging',
  allowedUserIds: [userId],
};
const denied = /staging_password_enrollment_unavailable/u;

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sit-password-registry-')));
  fs.chmodSync(directory, 0o700);
  const file = join(directory, 'registry.json');
  fs.writeFileSync(file, canonicalBytes, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, file };
}

function enabledFileEnvironment(file) {
  return {
    PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: file,
  };
}

test('staging consumes the canonical protected registry directly from a file', async (t) => {
  const { file } = await fixture(t);
  const records = readProtectedStagingPasswordEnrollmentRegistry(file);
  assert.deepEqual(records, [invitation]);

  const configuration = readStagingPasswordEnrollmentConfiguration(
    enabledFileEnvironment(file),
    { stagingAccess, now },
  );
  assert.equal(configuration.enabled, true);
  assert.equal(configuration.invitations.length, 1);
  assert.equal(configuration.invitations[0].userId, userId);
});

test('file presence never enables the default-off lane or reads the file', () => {
  assert.deepEqual(readStagingPasswordEnrollmentConfiguration({
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: '/does/not/exist/private.json',
  }), { enabled: false, invitations: [] });
});

test('staging rejects private invitation bytes in environment and ambiguous sources', async (t) => {
  const { file } = await fixture(t);
  const environment = enabledFileEnvironment(file);
  for (const changed of [
    {
      ...environment,
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: JSON.stringify([invitation]),
    },
    {
      ...environment,
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: '',
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: JSON.stringify([invitation]),
    },
    {
      ...environment,
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: '',
    },
  ]) assert.throws(() => readStagingPasswordEnrollmentConfiguration(changed, {
    stagingAccess,
    now,
  }), denied);
});

test('the live test environment label never grants synthetic secret-handling authority', () => {
  const liveFlags = {
    DEPLOYMENT_ENVIRONMENT: 'test',
    PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
    SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: JSON.stringify([invitation]),
  };
  const liveAccess = { ...stagingAccess, deploymentEnvironment: 'test' };
  assert.throws(() => readStagingPasswordEnrollmentConfiguration(liveFlags, {
    stagingAccess: liveAccess,
    now,
  }), denied);
});

test('registry reader rejects relative, symlinked, hard-linked, foreign-owner and permissive files', async (t) => {
  const { directory, file } = await fixture(t);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry('registry.json'), denied);

  const symlink = join(directory, 'registry-link.json');
  fs.symlinkSync(file, symlink);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(symlink), denied);

  const hardlink = join(directory, 'registry-hardlink.json');
  fs.linkSync(file, hardlink);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file), denied);
  fs.unlinkSync(hardlink);

  fs.chmodSync(file, 0o640);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file), denied);
  fs.chmodSync(file, 0o600);

  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file, {
    ownerUid: fs.statSync(file).uid + 1,
  }), denied);
});

test('registry reader rejects symlink path components and non-canonical or oversized bytes', async (t) => {
  const { directory, file } = await fixture(t);
  const alias = join(directory, 'alias');
  const nested = join(directory, 'nested');
  fs.mkdirSync(nested, { mode: 0o700 });
  const nestedFile = join(nested, 'registry.json');
  fs.renameSync(file, nestedFile);
  fs.symlinkSync(nested, alias);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(join(alias, 'registry.json')), denied);

  for (const bytes of [
    JSON.stringify([invitation]),
    ` ${canonicalBytes}`,
    `${canonicalBytes}\n`,
    canonicalBytes.replace('"userId"', '"userId":"foreign","userId"'),
    `${' '.repeat(65_537)}\n`,
  ]) {
    fs.writeFileSync(nestedFile, bytes);
    fs.chmodSync(nestedFile, 0o600);
    assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(nestedFile), denied);
  }
});

test('protected registry rejects duplicate email digests without claiming plaintext-email uniqueness', async (t) => {
  const { file } = await fixture(t);
  const second = {
    ...invitation,
    tokenDigest: '3'.repeat(64),
    userId: 'synthetic-file-enrollment-principal-2',
  };
  fs.writeFileSync(file, `${JSON.stringify([invitation, second])}\n`);
  fs.chmodSync(file, 0o600);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file), denied);
});

test('registry reader rejects descriptor metadata drift and exposes only the generic denial', async (t) => {
  const { file } = await fixture(t);
  let regularDescriptorReads = 0;
  const fileSystem = {
    ...fs,
    fstatSync(descriptor, options) {
      const value = fs.fstatSync(descriptor, options);
      if ((value.mode & 0o170000n) !== 0o100000n) return value;
      regularDescriptorReads += 1;
      if (regularDescriptorReads !== 2) return value;
      return { ...value, mtimeNs: value.mtimeNs + 1n };
    },
  };
  assert.throws(
    () => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }),
    (error) => error?.message === 'staging_password_enrollment_unavailable'
      && !error.message.includes(file)
      && !error.message.includes(userId),
  );
});

test('registry opens its non-following descriptor before inspecting leaf path metadata', async (t) => {
  const { file } = await fixture(t);
  let opened = false;
  let descriptorInspected = false;
  let registryDescriptor;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      if (name === file) {
        assert.notEqual(flags & fs.constants.O_NOFOLLOW, 0);
        registryDescriptor = descriptor;
        opened = true;
      }
      return descriptor;
    },
    fstatSync(descriptor, options) {
      if (descriptor === registryDescriptor) descriptorInspected = true;
      return fs.fstatSync(descriptor, options);
    },
    lstatSync(name, options) {
      if (name === file) {
        assert.equal(opened, true);
        assert.equal(descriptorInspected, true);
      }
      return fs.lstatSync(name, options);
    },
  };
  assert.deepEqual(readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), [invitation]);
});

test('leaf replacement after opening rejects before reading and closes every descriptor', async (t) => {
  const { file } = await fixture(t);
  const opened = [];
  const closed = [];
  let replaced = false;
  let reads = 0;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      opened.push(descriptor);
      if (name === file) {
        fs.renameSync(file, `${file}.retained`);
        fs.writeFileSync(file, canonicalBytes, { mode: 0o600 });
        replaced = true;
      }
      return descriptor;
    },
    readSync(...args) {
      reads += 1;
      return fs.readSync(...args);
    },
    closeSync(descriptor) {
      fs.closeSync(descriptor);
      closed.push(descriptor);
    },
  };
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), denied);
  assert.equal(replaced, true);
  assert.equal(reads, 0);
  assert.deepEqual(closed.toSorted(), opened.toSorted());
});

test('reader retains its chain and rejects parent substitution even when the name is restored', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sit-password-parent-race-')));
  const parent = join(root, 'private');
  const oldParent = `${parent}-old`;
  const replacement = `${parent}-replacement`;
  fs.mkdirSync(parent, { mode: 0o700 });
  const file = join(parent, 'registry.json');
  fs.writeFileSync(file, canonicalBytes, { mode: 0o600 });
  t.after(() => rm(root, { recursive: true, force: true }));
  let substituted = false;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      if (name !== file || substituted) return fs.openSync(name, flags, ...args);
      fs.renameSync(parent, oldParent);
      fs.mkdirSync(parent, { mode: 0o700 });
      fs.writeFileSync(file, canonicalBytes, { mode: 0o600 });
      const descriptor = fs.openSync(name, flags, ...args);
      fs.renameSync(parent, replacement);
      fs.renameSync(oldParent, parent);
      substituted = true;
      return descriptor;
    },
  };
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), denied);
  assert.equal(substituted, true);
});

test('reader rejects an ancestor symlink race before reading registry bytes', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sit-password-ancestor-race-')));
  const ancestor = join(root, 'ancestor');
  const oldAncestor = `${ancestor}-old`;
  const parent = join(ancestor, 'private');
  fs.mkdirSync(ancestor, { mode: 0o700 });
  fs.mkdirSync(parent, { mode: 0o700 });
  const file = join(parent, 'registry.json');
  fs.writeFileSync(file, canonicalBytes, { mode: 0o600 });
  t.after(() => rm(root, { recursive: true, force: true }));
  let raced = false;
  let reads = 0;
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      if (name === parent && !raced) {
        fs.renameSync(ancestor, oldAncestor);
        fs.symlinkSync(oldAncestor, ancestor, 'dir');
        raced = true;
      }
      return fs.openSync(name, flags, ...args);
    },
    readSync(...args) {
      reads += 1;
      return fs.readSync(...args);
    },
  };
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), denied);
  assert.equal(raced, true);
  assert.equal(reads, 0);
});

test('reader rejects immediate-parent rename-back and unsafe parent permissions', async (t) => {
  const { directory, file } = await fixture(t);
  let renamed = false;
  const fileSystem = {
    ...fs,
    readSync(...args) {
      if (!renamed) {
        const moved = `${directory}-moved`;
        fs.renameSync(directory, moved);
        fs.renameSync(moved, directory);
        renamed = true;
      }
      return fs.readSync(...args);
    },
  };
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), denied);
  assert.equal(renamed, true);

  fs.chmodSync(directory, 0o770);
  assert.throws(() => readProtectedStagingPasswordEnrollmentRegistry(file), denied);
  fs.chmodSync(directory, 0o700);
});

test('root-owned 0755 secrets parent is accepted while file ownership remains runtime-bound', async (t) => {
  const { directory, file } = await fixture(t);
  const descriptors = new Map();
  const rootParentStat = (value) => ({
    ...value,
    uid: 0n,
    mode: (value.mode & ~0o777n) | 0o755n,
  });
  const fileSystem = {
    ...fs,
    openSync(name, flags, ...args) {
      const descriptor = fs.openSync(name, flags, ...args);
      descriptors.set(descriptor, name);
      return descriptor;
    },
    fstatSync(descriptor, options) {
      const value = fs.fstatSync(descriptor, options);
      return descriptors.get(descriptor) === directory ? rootParentStat(value) : value;
    },
    lstatSync(name, options) {
      const value = fs.lstatSync(name, options);
      return name === directory ? rootParentStat(value) : value;
    },
  };
  assert.deepEqual(readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }), [invitation]);
});

test('successful reads fail closed if any retained descriptor cannot be closed', async (t) => {
  const { file } = await fixture(t);
  const opened = [];
  const closed = [];
  let failed = false;
  const fileSystem = {
    ...fs,
    openSync(...args) {
      const descriptor = fs.openSync(...args);
      opened.push(descriptor);
      return descriptor;
    },
    closeSync(descriptor) {
      fs.closeSync(descriptor);
      closed.push(descriptor);
      if (!failed) {
        failed = true;
        throw new Error('/private/close-error');
      }
    },
  };
  assert.throws(
    () => readProtectedStagingPasswordEnrollmentRegistry(file, { fileSystem }),
    (error) => error?.message === 'staging_password_enrollment_unavailable'
      && !error.message.includes(file),
  );
  assert.equal(failed, true);
  assert.deepEqual(closed.toSorted(), opened.toSorted());
});
