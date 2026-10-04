import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STAGING_ENROLLMENT_WEB_PROFILE =
  'staging-password-enrollment-composite-web-v1';
export const STAGING_ENROLLMENT_WEB_PROFILE_V2 =
  'staging-password-enrollment-composite-web-v2';
export const STAGING_ENROLLMENT_WEB_TARGET =
  'https://staging.shareittoo.com';

const envelopeKeys = Object.freeze([
  'schemaVersion',
  'kind',
  'evidenceClass',
  'syntheticFixture',
  'readiness',
  'readinessSha256',
]);
const readinessKeysV1 = Object.freeze([
  'sourceCommit',
  'sourceVersion',
  'deploymentEnvironment',
  'apiBaseUrl',
  'publicBaseUrl',
  'appPublicUrl',
  'returnOrigin',
  'passwordEnrollmentEnabled',
  'invitationCount',
  'invitationConfigurationSha256',
  'accessGateEnabled',
  'accessGateValid',
  'allowedUserCount',
  'allowedUserIdsSha256',
  'invitationPrincipalMatchCount',
  'unmatchedInvitationPrincipalCount',
  'privatePilotEnabled',
  'realPaymentsEnabled',
  'mailTransport',
  'mailerStatus',
  'recipientGateEnabled',
  'allowedRecipientCount',
  'allowedRecipientEmailsSha256',
  'invitationRecipientMatchCount',
  'unmatchedInvitationRecipientCount',
  'invitationRecipientBindingSha256',
  'smtpConfigurationSha256',
  'runtimeReadbackSha256',
  'mailReadbackSha256',
  'observedAtUtc',
  'validUntilUtc',
]);
const readinessKeysV2 = Object.freeze([
  'sourceCommit',
  'sourceVersion',
  'targetEnvironment',
  'runtimeDeploymentEnvironment',
  'apiBaseUrl',
  'publicBaseUrl',
  'appPublicUrl',
  'returnOrigin',
  'passwordEnrollmentEnabled',
  'invitationCount',
  'invitationConfigurationSha256',
  'invitationRegistrySha256',
  'accessGateEnabled',
  'accessGateValid',
  'allowedUserCount',
  'allowedUserIdsSha256',
  'invitationPrincipalMatchCount',
  'unmatchedInvitationPrincipalCount',
  'notificationAllowedUserCount',
  'notificationAllowedUserIdsSha256',
  'invitationNotificationUserMatchCount',
  'unmatchedInvitationNotificationUserCount',
  'privatePilotEnabled',
  'realPaymentsEnabled',
  'mailTransport',
  'mailerStatus',
  'recipientGateEnabled',
  'allowedRecipientCount',
  'allowedRecipientEmailsSha256',
  'invitationRecipientMatchCount',
  'unmatchedInvitationRecipientCount',
  'invitationRecipientBindingSha256',
  'runtimeConfigurationSha256',
  'smtpConfigurationSha256',
  'runtimeReadbackSha256',
  'mailReadbackSha256',
  'observedAtUtc',
  'validUntilUtc',
]);
const bindingKeys = Object.freeze([
  'readinessJson',
  'readinessDigest',
  'evidenceDigest',
  'validatedAtUtc',
]);
const hashPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const versionPattern = /^\d+\.\d+\.\d+\+\d+$/u;
const maximumEvidenceAgeMs = 2 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requireThat = (condition, code) => {
  if (!condition) throw new Error(code);
};

function exactObject(value, keys, code) {
  requireThat(
    value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype
      && Object.keys(value).length === keys.length
      && Object.keys(value).every((key) => keys.includes(key)),
    code,
  );
}

function ordered(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function canonicalUtc(value, code) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  requireThat(!Number.isNaN(date.getTime()), code);
  if (value instanceof Date) date.setUTCMilliseconds(0);
  const canonical = date.toISOString().replace('.000Z', 'Z');
  requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(canonical), code);
  if (!(value instanceof Date)) requireThat(value === canonical, code);
  return canonical;
}

function sameStat(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key]);
}

function sameDirectoryStat(left, right, protectedRoot) {
  return protectedRoot ? sameStat(left, right)
    : ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);
}

function openDirectoryChain(directory, descriptors) {
  requireThat(
    path.isAbsolute(directory)
      && path.normalize(directory) === directory
      && directory !== '/',
    'password_enrollment_web_readiness_path',
  );
  const directories = ['/'];
  for (const part of directory.split('/').filter(Boolean)) {
    directories.push(path.join(directories.at(-1), part));
  }
  return directories.map((file, index) => {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
      | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    requireThat(
      before.isDirectory() && sameDirectoryStat(before, fs.lstatSync(file, { bigint: true }),
        index === directories.length - 1),
      'password_enrollment_web_readiness_path',
    );
    return { file, fd, before };
  });
}

function assertDirectoryChainUnchanged(directories) {
  for (const [index, { file, fd, before }] of directories.entries()) {
    // The immediate owner-only parent is the protected evidence root. Shared
    // ancestors may gain unrelated children without changing the path binding.
    const protectedRoot = index === directories.length - 1;
    requireThat(
      sameDirectoryStat(before, fs.fstatSync(fd, { bigint: true }), protectedRoot)
        && sameDirectoryStat(before, fs.lstatSync(file, { bigint: true }), protectedRoot),
      'password_enrollment_web_readiness_changed',
    );
  }
}

function canonicalEnvelope(evidence) {
  exactObject(
    evidence,
    envelopeKeys,
    'password_enrollment_web_readiness_shape',
  );
  const readinessKeys = evidence.schemaVersion === 2 ? readinessKeysV2 : readinessKeysV1;
  exactObject(
    evidence.readiness,
    readinessKeys,
    'password_enrollment_web_readiness_shape',
  );
  return ordered({
    ...evidence,
    readiness: ordered(evidence.readiness, readinessKeys),
  }, envelopeKeys);
}

function readinessSchemaVersion(readiness) {
  if (readiness !== null && typeof readiness === 'object' && !Array.isArray(readiness)
      && Object.hasOwn(readiness, 'targetEnvironment')) return 2;
  return 1;
}

export function passwordEnrollmentWebReadinessVersion(binding) {
  exactObject(
    binding,
    bindingKeys,
    'password_enrollment_web_binding_shape',
  );
  let readiness;
  try {
    readiness = JSON.parse(binding.readinessJson);
  } catch {
    throw new Error('password_enrollment_web_readiness_json');
  }
  const schemaVersion = readinessSchemaVersion(readiness);
  exactObject(
    readiness,
    schemaVersion === 2 ? readinessKeysV2 : readinessKeysV1,
    'password_enrollment_web_readiness_shape',
  );
  return schemaVersion;
}

export function bindPasswordEnrollmentWebReadiness(
  evidence,
  evidenceDigest,
  {
    now = new Date(),
    expectedSource = null,
    expectedVersion = null,
  } = {},
) {
  const canonical = canonicalEnvelope(evidence);
  const canonicalJson = JSON.stringify(canonical);
  requireThat(
    JSON.stringify(evidence) === canonicalJson,
    'password_enrollment_web_readiness_canonical',
  );
  requireThat(
    hashPattern.test(evidenceDigest ?? '')
      && sha256(canonicalJson) === evidenceDigest,
    'password_enrollment_web_evidence_digest_mismatch',
  );
  requireThat(
    [1, 2].includes(canonical.schemaVersion)
      && canonical.kind === 'sit-staging-password-enrollment-web-readiness'
      && canonical.evidenceClass === 'verified-runtime'
      && canonical.syntheticFixture === false,
    'password_enrollment_web_evidence_class',
  );

  const readiness = canonical.readiness;
  const readinessJson = JSON.stringify(readiness);
  requireThat(
    hashPattern.test(canonical.readinessSha256)
      && sha256(readinessJson) === canonical.readinessSha256,
    'password_enrollment_web_readiness_digest_mismatch',
  );
  const observedAtUtc = canonicalUtc(
    readiness.observedAtUtc,
    'password_enrollment_web_readiness_time',
  );
  const validUntilUtc = canonicalUtc(
    readiness.validUntilUtc,
    'password_enrollment_web_readiness_time',
  );
  const validatedAtUtc = canonicalUtc(
    now,
    'password_enrollment_web_readiness_clock',
  );
  const observed = Date.parse(observedAtUtc);
  const validUntil = Date.parse(validUntilUtc);
  const validatedAt = Date.parse(validatedAtUtc);
  const commonDigests = [
    readiness.invitationConfigurationSha256,
    readiness.allowedUserIdsSha256,
    readiness.allowedRecipientEmailsSha256,
    readiness.invitationRecipientBindingSha256,
    readiness.smtpConfigurationSha256,
    readiness.runtimeReadbackSha256,
    readiness.mailReadbackSha256,
  ];
  const commonValid = sourcePattern.test(readiness.sourceCommit)
      && versionPattern.test(readiness.sourceVersion)
      && (expectedSource === null || readiness.sourceCommit === expectedSource)
      && (expectedVersion === null || readiness.sourceVersion === expectedVersion)
      && readiness.apiBaseUrl === `${STAGING_ENROLLMENT_WEB_TARGET}/api/v1`
      && readiness.publicBaseUrl === `${STAGING_ENROLLMENT_WEB_TARGET}/api/v1`
      && readiness.appPublicUrl === STAGING_ENROLLMENT_WEB_TARGET
      && readiness.returnOrigin === STAGING_ENROLLMENT_WEB_TARGET
      && readiness.passwordEnrollmentEnabled === true
      && Number.isInteger(readiness.invitationCount)
      && readiness.invitationCount >= 1
      && readiness.invitationCount <= 20
      && readiness.accessGateEnabled === true
      && readiness.accessGateValid === true
      && Number.isInteger(readiness.allowedUserCount)
      && readiness.allowedUserCount >= readiness.invitationCount
      && readiness.allowedUserCount <= 100
      && readiness.invitationPrincipalMatchCount === readiness.invitationCount
      && readiness.unmatchedInvitationPrincipalCount === 0
      && readiness.privatePilotEnabled === true
      && readiness.realPaymentsEnabled === false
      && readiness.mailTransport === 'smtp'
      && readiness.mailerStatus === 'ok'
      && readiness.recipientGateEnabled === true
      && Number.isInteger(readiness.allowedRecipientCount)
      && readiness.allowedRecipientCount >= readiness.invitationCount
      && readiness.allowedRecipientCount <= 100
      && readiness.invitationRecipientMatchCount === readiness.invitationCount
      && readiness.unmatchedInvitationRecipientCount === 0
      && commonDigests.every((value) => typeof value === 'string'
        && hashPattern.test(value))
      && validUntil > observed
      && validUntil - observed <= maximumEvidenceAgeMs
      && validatedAt >= observed
      && validatedAt - observed <= maximumEvidenceAgeMs
      && validatedAt < validUntil;
  const versionValid = canonical.schemaVersion === 1
    ? readiness.deploymentEnvironment === 'staging'
    : readiness.targetEnvironment === 'staging-green'
      && readiness.runtimeDeploymentEnvironment === 'test'
      && Number.isInteger(readiness.notificationAllowedUserCount)
      && readiness.notificationAllowedUserCount >= readiness.invitationCount
      && readiness.notificationAllowedUserCount <= 100
      && readiness.invitationNotificationUserMatchCount === readiness.invitationCount
      && readiness.unmatchedInvitationNotificationUserCount === 0
      && [
        readiness.invitationRegistrySha256,
        readiness.notificationAllowedUserIdsSha256,
        readiness.runtimeConfigurationSha256,
      ].every((value) => typeof value === 'string' && hashPattern.test(value));
  requireThat(
    commonValid && versionValid,
    'password_enrollment_web_readiness_invalid',
  );

  return Object.freeze({
    readinessJson,
    readinessDigest: canonical.readinessSha256,
    evidenceDigest,
    validatedAtUtc,
  });
}

export function validatePasswordEnrollmentWebBinding(
  binding,
  {
    expectedSource = null,
    expectedVersion = null,
    freshAt = null,
  } = {},
) {
  exactObject(
    binding,
    bindingKeys,
    'password_enrollment_web_binding_shape',
  );
  const validatedAtUtc = canonicalUtc(
    binding.validatedAtUtc,
    'password_enrollment_web_binding_time',
  );
  let readiness;
  try {
    readiness = JSON.parse(binding.readinessJson);
  } catch {
    throw new Error('password_enrollment_web_readiness_json');
  }
  const schemaVersion = passwordEnrollmentWebReadinessVersion(binding);
  const evidence = ordered({
    schemaVersion,
    kind: 'sit-staging-password-enrollment-web-readiness',
    evidenceClass: 'verified-runtime',
    syntheticFixture: false,
    readiness,
    readinessSha256: binding.readinessDigest,
  }, envelopeKeys);
  const rebound = bindPasswordEnrollmentWebReadiness(
    evidence,
    binding.evidenceDigest,
    {
      now: new Date(validatedAtUtc),
      expectedSource,
      expectedVersion,
    },
  );
  requireThat(
    JSON.stringify(rebound) === JSON.stringify(binding),
    'password_enrollment_web_binding_mismatch',
  );
  if (freshAt !== null) {
    bindPasswordEnrollmentWebReadiness(evidence, binding.evidenceDigest, {
      now: freshAt,
      expectedSource,
      expectedVersion,
    });
  }
  return rebound;
}

export function readPasswordEnrollmentWebReadiness(
  file,
  evidenceDigest,
  {
    now = new Date(),
    expectedSource = null,
    expectedVersion = null,
  } = {},
) {
  requireThat(
    typeof file === 'string'
      && path.isAbsolute(file)
      && path.normalize(file) === file,
    'password_enrollment_web_readiness_path',
  );
  const parent = path.dirname(file);
  const descriptors = [];
  let fd;
  try {
    const directories = openDirectoryChain(parent, descriptors);
    const parentBefore = directories.at(-1).before;
    requireThat(
      parentBefore.isDirectory()
        && parentBefore.nlink >= 1n
        && parentBefore.uid === BigInt(process.getuid())
        && (parentBefore.mode & 0o7777n) === 0o700n,
      'password_enrollment_web_readiness_parent',
    );
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY
        | fs.constants.O_NOFOLLOW
        | fs.constants.O_NONBLOCK,
    );
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    requireThat(
      before.isFile()
        && before.nlink === 1n
        && before.uid === BigInt(process.getuid())
        && (before.mode & 0o7777n) === 0o600n
        && before.size >= 2n
        && before.size <= 16384n,
      'password_enrollment_web_readiness_file',
    );
    requireThat(
      sameStat(before, fs.lstatSync(file, { bigint: true })),
      'password_enrollment_web_readiness_changed',
    );
    assertDirectoryChainUnchanged(directories);
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        fd,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      requireThat(count > 0, 'password_enrollment_web_readiness_changed');
      offset += count;
    }
    requireThat(
      fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0,
      'password_enrollment_web_readiness_changed',
    );
    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(file, { bigint: true });
    requireThat(
      BigInt(bytes.length) === before.size
        && sameStat(before, after)
        && sameStat(before, pathAfter),
      'password_enrollment_web_readiness_changed',
    );
    assertDirectoryChainUnchanged(directories);
    requireThat(
      hashPattern.test(evidenceDigest ?? '')
        && sha256(bytes) === evidenceDigest,
      'password_enrollment_web_evidence_digest_mismatch',
    );
    const raw = bytes.toString('utf8');
    let evidence;
    try {
      evidence = JSON.parse(raw);
    } catch {
      throw new Error('password_enrollment_web_readiness_json');
    }
    requireThat(
      JSON.stringify(evidence) === raw,
      'password_enrollment_web_readiness_canonical',
    );
    return bindPasswordEnrollmentWebReadiness(evidence, evidenceDigest, {
      now,
      expectedSource,
      expectedVersion,
    });
  } catch (error) {
    if (/^password_enrollment_web_[a-z_]+$/u.test(error?.message ?? '')) {
      throw error;
    }
    throw new Error('password_enrollment_web_readiness_file');
  } finally {
    let closeFailed = false;
    for (const descriptor of descriptors.reverse()) {
      try {
        fs.closeSync(descriptor);
      } catch {
        closeFailed = true;
      }
    }
    requireThat(!closeFailed, 'password_enrollment_web_readiness_file');
  }
}
