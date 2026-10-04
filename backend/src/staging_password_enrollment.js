import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const digestPattern = /^[a-f0-9]{64}$/u;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const maximumLifetimeMs = 24 * 60 * 60 * 1000;
const maximumRegistryBytes = 64 * 1024;
const denyCode = 'staging_password_enrollment_unavailable';
const registryKeys = ['emailDigest', 'expiresAt', 'issuedAt', 'tokenDigest', 'userId'];

export class StagingPasswordEnrollmentError extends Error {
  constructor() {
    super(denyCode);
    this.code = denyCode;
  }
}

const deny = () => { throw new StagingPasswordEnrollmentError(); };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const emailDigest = (tokenDigest, email) => hash(`${tokenDigest}\n${email}`);
const validEmail = (email) => typeof email === 'string'
  && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  && email === email.trim().toLowerCase();

const fileType = (metadata) => metadata.mode & 0o170000n;
const regularFile = (metadata) => fileType(metadata) === 0o100000n;
const directory = (metadata) => fileType(metadata) === 0o040000n;
const sameFileMetadata = (left, right) => [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
].every((key) => left[key] === right[key]);

const sameDirectoryMetadata = (left, right, protectedParent) => protectedParent
  ? sameFileMetadata(left, right)
  : ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);

function openDirectoryChain(directoryPath, fileSystem, descriptors) {
  if (!path.isAbsolute(directoryPath) || path.normalize(directoryPath) !== directoryPath
      || directoryPath === path.parse(directoryPath).root) deny();
  const paths = [path.parse(directoryPath).root];
  for (const part of path.relative(paths[0], directoryPath).split(path.sep)) {
    paths.push(path.join(paths.at(-1), part));
  }
  return paths.map((directoryPathPart, index) => {
    const descriptor = fileSystem.openSync(directoryPathPart,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_DIRECTORY
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK
        | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const pathBefore = fileSystem.lstatSync(directoryPathPart, { bigint: true });
    const protectedParent = index === paths.length - 1;
    if (!directory(before)
        || !sameDirectoryMetadata(before, pathBefore, protectedParent)) deny();
    return { path: directoryPathPart, descriptor, before, protectedParent };
  });
}

function assertDirectoryChainUnchanged(directories, fileSystem) {
  for (const entry of directories) {
    if (!sameDirectoryMetadata(entry.before,
      fileSystem.fstatSync(entry.descriptor, { bigint: true }), entry.protectedParent)
        || !sameDirectoryMetadata(entry.before,
          fileSystem.lstatSync(entry.path, { bigint: true }), entry.protectedParent)) deny();
  }
}

// The runtime consumes invitation records through this descriptor boundary.
// It never copies file bytes into process.env, argv, rendered Compose output or logs.
export function readProtectedEnrollmentRegistry(filePath, {
  fileSystem = fs,
  ownerUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
} = {}) {
  const descriptors = [];
  let bytes;
  let result;
  let failure;
  try {
    if (typeof filePath !== 'string' || filePath.length < 1 || filePath.length > 4096
        || filePath.includes('\0') || !path.isAbsolute(filePath)
        || path.normalize(filePath) !== filePath
        || !Number.isSafeInteger(ownerUid) || ownerUid < 0) deny();
    const directories = openDirectoryChain(path.dirname(filePath), fileSystem, descriptors);
    const parent = directories.at(-1).before;
    if (parent.nlink < 1n || ![0n, BigInt(ownerUid)].includes(parent.uid)
        || (parent.mode & 0o022n) !== 0n) deny();
    const descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_NOFOLLOW
        | fileSystem.constants.O_NONBLOCK | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkBefore = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(before) || !sameFileMetadata(before, linkBefore)
        || before.nlink !== 1n || (before.mode & 0o777n) !== 0o600n
        || before.uid !== BigInt(ownerUid) || before.size < 3n
        || before.size > BigInt(maximumRegistryBytes)) deny();
    assertDirectoryChainUnchanged(directories, fileSystem);

    bytes = Buffer.alloc(Number(before.size));
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const count = fileSystem.readSync(descriptor, bytes, bytesRead,
        bytes.length - bytesRead, bytesRead);
      if (count <= 0) deny();
      bytesRead += count;
    }
    if (fileSystem.readSync(descriptor, Buffer.alloc(1), 0, 1, bytes.length) !== 0) deny();
    const after = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkAfter = fileSystem.lstatSync(filePath, { bigint: true });
    if (bytesRead !== Number(before.size) || !sameFileMetadata(before, after)
        || !sameFileMetadata(after, linkAfter)) deny();
    assertDirectoryChainUnchanged(directories, fileSystem);

    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const records = JSON.parse(text);
    if (!Array.isArray(records) || records.length < 1 || records.length > 20
        || records.some((record) => !record || typeof record !== 'object'
          || Array.isArray(record)
          || JSON.stringify(Object.keys(record)) !== JSON.stringify(registryKeys))
        || new Set(records.map((record) => record.emailDigest)).size !== records.length
        || `${JSON.stringify(records)}\n` !== text) deny();
    records.forEach(Object.freeze);
    result = Object.freeze(records);
  } catch (error) {
    failure = error instanceof StagingPasswordEnrollmentError
      ? error : new StagingPasswordEnrollmentError();
  } finally {
    bytes?.fill(0);
    let closeFailed = false;
    for (const descriptor of descriptors.reverse()) {
      try { fileSystem.closeSync(descriptor); } catch { closeFailed = true; }
    }
    if (closeFailed && failure === undefined) failure = new StagingPasswordEnrollmentError();
  }
  if (failure !== undefined) throw failure;
  return result;
}

// Backward-compatible public name for existing callers. New security-sensitive
// consumers use the semantically neutral reader name so a canonical verifier
// digest is not misclassified as raw credential material.
export const readProtectedStagingPasswordEnrollmentRegistry = readProtectedEnrollmentRegistry;

// Ops-only pure preparation: the caller owns protected storage and delivery.
// No CLI, account write, invitation delivery or provider call is introduced.
export function prepareStagingPasswordInvitation({ email, userId, now = Date.now() }) {
  if (!validEmail(email) || typeof userId !== 'string' || !principalPattern.test(userId)
      || !Number.isSafeInteger(now)) deny();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenDigest = hash(token);
  return {
    token,
    invitation: {
      tokenDigest,
      emailDigest: emailDigest(tokenDigest, email),
      userId,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + maximumLifetimeMs).toISOString(),
    },
  };
}

export function readStagingPasswordEnrollmentConfiguration(
  environment = process.env,
  { stagingAccess, now = Date.now() } = {},
) {
  const flag = environment.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED ?? 'false';
  const legacyRaw = environment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS ?? '';
  const filePath = environment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE ?? '';
  if (!['true', 'false'].includes(flag)) deny();
  if (typeof legacyRaw !== 'string' || legacyRaw !== ''
      || typeof filePath !== 'string' || filePath !== filePath.trim()) deny();
  if (flag === 'false') {
    return Object.freeze({ enabled: false, invitations: Object.freeze([]) });
  }
  if (!['staging', 'test'].includes(stagingAccess?.deploymentEnvironment)
      || stagingAccess.enabled !== true || stagingAccess.valid !== true
      || String(environment.STRIPE_LIVEMODE ?? '').trim().toLowerCase() === 'true'
      || String(environment.PRIVATE_PILOT_V4_ENABLED ?? '').trim().toLowerCase() !== 'true'
      || !Number.isSafeInteger(now)) deny();
  // DEPLOYMENT_ENVIRONMENT=test is used by the real staging runtime and never
  // grants synthetic authority. Enabled enrollment is file-only in every mode.
  if (filePath === '') deny();
  const invitations = readProtectedEnrollmentRegistry(filePath);
  if (!Array.isArray(invitations) || invitations.length < 1 || invitations.length > 20) deny();
  const tokens = new Set();
  const principals = new Set();
  const expectedKeys = registryKeys;
  for (const invitation of invitations) {
    if (!invitation || typeof invitation !== 'object'
        || JSON.stringify(Object.keys(invitation).sort()) !== JSON.stringify(expectedKeys)
        || typeof invitation.tokenDigest !== 'string' || !digestPattern.test(invitation.tokenDigest)
        || typeof invitation.emailDigest !== 'string' || !digestPattern.test(invitation.emailDigest)
        || typeof invitation.userId !== 'string' || !principalPattern.test(invitation.userId)
        || !stagingAccess.allowedUserIds.includes(invitation.userId)
        || tokens.has(invitation.tokenDigest) || principals.has(invitation.userId)) deny();
    const issued = Date.parse(invitation.issuedAt);
    const expiry = Date.parse(invitation.expiresAt);
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expiry)
        || new Date(issued).toISOString() !== invitation.issuedAt
        || new Date(expiry).toISOString() !== invitation.expiresAt
        || issued > now || expiry <= issued || expiry - issued > maximumLifetimeMs) deny();
    // Expired invitations deny only their lane; they never prevent restart.
    tokens.add(invitation.tokenDigest);
    principals.add(invitation.userId);
    Object.freeze(invitation);
  }
  return Object.freeze({ enabled: true, invitations: Object.freeze(invitations) });
}

export function resolveStagingPasswordEnrollment(configuration, {
  token, email, authorizationPresent = false, now = Date.now(),
}) {
  if (!configuration?.enabled || authorizationPresent || !validEmail(email) || !Number.isSafeInteger(now)
      || typeof token !== 'string' || !tokenPattern.test(token)) deny();
  const tokenDigest = hash(token);
  const invitation = configuration.invitations.find((entry) => entry.tokenDigest === tokenDigest);
  if (!invitation || Date.parse(invitation.issuedAt) > now
      || Date.parse(invitation.expiresAt) <= now
      || !crypto.timingSafeEqual(Buffer.from(invitation.emailDigest, 'hex'),
        Buffer.from(emailDigest(tokenDigest, email), 'hex'))) deny();
  return invitation;
}

// Must run in the account/session transaction. A duplicate never returns a
// credential or reissues mail; a lost success response is recovered by login.
export async function reserveStagingPasswordEnrollment(client, invitation) {
  const result = await client.query(
    `INSERT INTO staging_password_enrollment_redemptions (token_digest, expires_at)
     SELECT $1, $2::timestamptz WHERE $2::timestamptz > clock_timestamp()
     ON CONFLICT (token_digest) DO NOTHING RETURNING token_digest`,
    [invitation.tokenDigest, invitation.expiresAt],
  );
  if (result.rowCount !== 1) deny();
}

export async function pruneExpiredStagingPasswordEnrollments(client) {
  await client.query('DELETE FROM staging_password_enrollment_redemptions WHERE expires_at <= now()');
}
