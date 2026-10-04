import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  TARGET,
  bindGoogleWebConfig,
  profile,
  sealArtifact,
  sha256,
  stagingBootstrapFor,
  validateArtifact,
} from '../../tool/staging_web_contract.mjs';
import {
  bindFacebookWebReadiness,
  facebookWebFields,
} from '../../tool/staging_facebook_web_readiness.mjs';
import {
  STAGING_ENROLLMENT_WEB_PROFILE,
  bindPasswordEnrollmentWebReadiness,
  readPasswordEnrollmentWebReadiness,
  validatePasswordEnrollmentWebBinding,
} from '../../tool/staging_password_enrollment_web_readiness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'a'.repeat(40);
const version = '1.0.0+2026092905';
const runClock = new Date();
runClock.setUTCMilliseconds(0);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isoAt(offsetMs) {
  return new Date(runClock.getTime() + offsetMs).toISOString().replace('.000Z', 'Z');
}

function readiness(overrides = {}) {
  return {
    sourceCommit: source,
    sourceVersion: version,
    deploymentEnvironment: 'staging',
    apiBaseUrl: `${TARGET}/api/v1`,
    publicBaseUrl: `${TARGET}/api/v1`,
    appPublicUrl: TARGET,
    returnOrigin: TARGET,
    passwordEnrollmentEnabled: true,
    invitationCount: 2,
    invitationConfigurationSha256: digest('invitation configuration'),
    accessGateEnabled: true,
    accessGateValid: true,
    allowedUserCount: 6,
    allowedUserIdsSha256: digest('allowed user ids'),
    invitationPrincipalMatchCount: 2,
    unmatchedInvitationPrincipalCount: 0,
    privatePilotEnabled: true,
    realPaymentsEnabled: false,
    mailTransport: 'smtp',
    mailerStatus: 'ok',
    recipientGateEnabled: true,
    allowedRecipientCount: 3,
    allowedRecipientEmailsSha256: digest('allowed recipient emails'),
    invitationRecipientMatchCount: 2,
    unmatchedInvitationRecipientCount: 0,
    invitationRecipientBindingSha256: digest('invitation recipient binding'),
    smtpConfigurationSha256: digest('smtp configuration'),
    runtimeReadbackSha256: digest('runtime readback'),
    mailReadbackSha256: digest('mail readback'),
    observedAtUtc: isoAt(-30 * 60 * 1000),
    validUntilUtc: isoAt(30 * 60 * 1000),
    ...overrides,
  };
}

function handoff({ value = readiness(), top = {} } = {}) {
  const envelope = {
    schemaVersion: 1,
    kind: 'sit-staging-password-enrollment-web-readiness',
    evidenceClass: 'verified-runtime',
    syntheticFixture: false,
    readiness: value,
    readinessSha256: digest(JSON.stringify(value)),
    ...top,
  };
  const bytes = JSON.stringify(envelope);
  return { envelope, bytes, evidenceDigest: digest(bytes) };
}

function binding(options = {}, now = runClock) {
  const evidence = handoff(options);
  return bindPasswordEnrollmentWebReadiness(
    evidence.envelope,
    evidence.evidenceDigest,
    { now, expectedSource: source, expectedVersion: version },
  );
}

function socialConfig(overrides = {}) {
  return {
    projectId: 'synthetic-sit-fixture',
    messagingSenderId: '123456789012',
    appId: `1:123456789012:web:${'a'.repeat(32)}`,
    apiKey: ['AI', 'za', 'x'.repeat(35)].join(''),
    authDomain: 'synthetic-sit-fixture.firebaseapp.com',
    backendProjectId: 'synthetic-sit-fixture',
    authorizedOrigin: TARGET,
    ...overrides,
  };
}

function googleBinding(publicConfig = socialConfig()) {
  return bindGoogleWebConfig(
    publicConfig,
    digest(JSON.stringify(publicConfig)),
  );
}

function facebookHandoff(publicConfig = socialConfig()) {
  const configurationSha256 = digest(JSON.stringify(publicConfig));
  const value = {
    schemaVersion: 1,
    provider: 'facebook',
    platform: 'web',
    origin: publicConfig.authorizedOrigin,
    backendFirebaseProjectId: publicConfig.backendProjectId,
    webAppConfigSha256: configurationSha256,
    callbackUrl: `https://${publicConfig.authDomain}/__/auth/handler`,
    firebaseProviderEnabled: true,
    metaAppMode: 'development',
    audience: 'app_roles_only',
    audienceVerified: true,
    providerReadbackSha256: digest('test-only Facebook readback'),
    observedAtUtc: isoAt(-30 * 60 * 1000),
    validUntilUtc: isoAt(30 * 60 * 1000),
  };
  const envelope = {
    schemaVersion: 1,
    kind: 'sit-facebook-web-release-readiness',
    evidenceClass: 'verified-external',
    syntheticFixture: false,
    configuration: publicConfig,
    configurationSha256,
    readiness: value,
    readinessSha256: digest(JSON.stringify(value)),
  };
  const bytes = JSON.stringify(envelope);
  return { envelope, bytes, evidenceDigest: digest(bytes) };
}

function facebookBinding(publicConfig = socialConfig(), now = runClock) {
  const evidence = facebookHandoff(publicConfig);
  return bindFacebookWebReadiness(
    evidence.envelope,
    evidence.evidenceDigest,
    { now },
  );
}

function temp(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(
    path.join(os.tmpdir(), 'sit-password-enrollment-profile-'),
  ));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function makeArtifact(t, {
  passwordEnrollment = binding(),
  googleWeb = null,
  facebookWeb = null,
} = {}) {
  const directory = temp(t);
  fs.mkdirSync(path.join(directory, 'web'));
  for (const [name, bytes] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'test-only compiled output',
    'manifest.json': '{}',
    'flutter_bootstrap.js': 'bootstrap();',
  })) fs.writeFileSync(path.join(directory, 'web', name), bytes);
  const hash = sealArtifact({
    directory,
    source,
    version,
    flutterVersion: { frameworkVersion: 'test-only' },
    builderDigest: 'b'.repeat(64),
    googleWeb,
    facebookWeb,
    passwordEnrollment,
  });
  return { directory, hash };
}

function rewriteManifest(directory, mutate) {
  const file = path.join(directory, 'staging-web-manifest.json');
  const value = JSON.parse(fs.readFileSync(file));
  mutate(value);
  fs.writeFileSync(file, JSON.stringify(value));
  return sha256(fs.readFileSync(file));
}

test('password enrollment Web profile is default-off and exact-readiness opt-in only', () => {
  const off = profile(source, version);
  assert.equal(Object.hasOwn(off, 'SIT_WEB_PASSWORD_ENROLLMENT_ENABLED'), false);
  assert.ok(Object.keys(off).every((key) => !key.startsWith('SIT_WEB_PASSWORD_ENROLLMENT_READINESS_')));

  const passwordEnrollment = binding();
  const enabled = profile(source, version, null, null, passwordEnrollment);
  assert.equal(enabled.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED, 'true');
  assert.equal(
    enabled.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_JSON,
    passwordEnrollment.readinessJson,
  );
  assert.equal(
    enabled.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_SHA256,
    passwordEnrollment.readinessDigest,
  );
  assert.equal(enabled.SIT_SOCIAL_GOOGLE_ENABLED, 'false');
  assert.equal(enabled.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(enabled.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(enabled.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'false');
  assert.deepEqual(validatePasswordEnrollmentWebBinding(passwordEnrollment, {
    expectedSource: source,
    expectedVersion: version,
  }), passwordEnrollment);
});

test('password profile composes with Google, Facebook or both without weakening provider gates', () => {
  const passwordEnrollment = binding();
  const googleWeb = googleBinding();
  const facebookWeb = facebookBinding();
  for (const [google, facebook] of [
    [googleWeb, null],
    [null, facebookWeb],
    [googleWeb, facebookWeb],
  ]) {
    const enabled = profile(
      source,
      version,
      google,
      facebook,
      passwordEnrollment,
    );
    assert.equal(enabled.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED, 'true');
    assert.equal(enabled.SIT_SOCIAL_GOOGLE_ENABLED, google ? 'true' : 'false');
    assert.equal(enabled.SIT_SOCIAL_FACEBOOK_ENABLED, facebook ? 'true' : 'false');
    assert.equal(enabled.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'true');
  }
});

test('composite profile preserves same-Firebase-app identity enforcement', () => {
  const other = socialConfig({
    projectId: 'synthetic-sit-other',
    authDomain: 'synthetic-sit-other.firebaseapp.com',
    backendProjectId: 'synthetic-sit-other',
  });
  assert.throws(
    () => profile(
      source,
      version,
      googleBinding(),
      facebookBinding(other),
      binding(),
    ),
    /facebook_google_web_app_mismatch/,
  );
});

test('partial, stale and mismatched readiness is rejected even when rehashed', () => {
  const cases = [
    { override: { passwordEnrollmentEnabled: false } },
    { override: { accessGateEnabled: false } },
    { override: { accessGateValid: false } },
    { override: { invitationPrincipalMatchCount: 1 } },
    { override: { unmatchedInvitationPrincipalCount: 1 } },
    { override: { privatePilotEnabled: false } },
    { override: { realPaymentsEnabled: true } },
    { override: { mailTransport: 'memory' } },
    { override: { mailerStatus: 'unverified' } },
    { override: { recipientGateEnabled: false } },
    { override: { invitationRecipientMatchCount: 1 } },
    { override: { unmatchedInvitationRecipientCount: 1 } },
    { override: { appPublicUrl: 'https://shareittoo.com' } },
    { override: { returnOrigin: 'https://shareittoo.com' } },
    { override: { publicBaseUrl: TARGET } },
    { override: { sourceCommit: 'b'.repeat(40) } },
    { override: { sourceVersion: '1.0.0+1' } },
  ];
  for (const { override } of cases) {
    const evidence = handoff({ value: readiness(override) });
    assert.throws(() => bindPasswordEnrollmentWebReadiness(
      evidence.envelope,
      evidence.evidenceDigest,
      { now: runClock, expectedSource: source, expectedVersion: version },
    ), /password_enrollment_web_readiness_invalid/);
  }

  const missing = readiness();
  delete missing.mailReadbackSha256;
  const missingEvidence = handoff({ value: missing });
  assert.throws(() => bindPasswordEnrollmentWebReadiness(
    missingEvidence.envelope,
    missingEvidence.evidenceDigest,
    { now: runClock, expectedSource: source, expectedVersion: version },
  ), /password_enrollment_web_readiness_shape/);

  for (const value of [
    readiness({ observedAtUtc: isoAt(-3 * 60 * 60 * 1000), validUntilUtc: isoAt(-60 * 60 * 1000) }),
    readiness({ observedAtUtc: isoAt(-30 * 60 * 1000), validUntilUtc: isoAt(3 * 60 * 60 * 1000) }),
  ]) {
    const stale = handoff({ value });
    assert.throws(() => bindPasswordEnrollmentWebReadiness(
      stale.envelope,
      stale.evidenceDigest,
      { now: runClock, expectedSource: source, expectedVersion: version },
    ), /password_enrollment_web_readiness_invalid/);
  }
});

test('evidence class, canonical bytes and nested digests are mandatory', () => {
  for (const top of [
    { evidenceClass: 'synthetic' },
    { syntheticFixture: true },
    { extra: true },
  ]) {
    const evidence = handoff({ top });
    assert.throws(() => bindPasswordEnrollmentWebReadiness(
      evidence.envelope,
      evidence.evidenceDigest,
      { now: runClock, expectedSource: source, expectedVersion: version },
    ));
  }
  const evidence = handoff();
  evidence.envelope.readinessSha256 = 'b'.repeat(64);
  assert.throws(() => bindPasswordEnrollmentWebReadiness(
    evidence.envelope,
    digest(JSON.stringify(evidence.envelope)),
    { now: runClock, expectedSource: source, expectedVersion: version },
  ), /password_enrollment_web_readiness_digest_mismatch/);
});

test('strict readiness reader requires canonical owner-only stable bytes and exact digest', (t) => {
  const root = temp(t);
  const evidence = handoff();
  const file = path.join(root, 'password-enrollment-readiness.json');
  fs.writeFileSync(file, evidence.bytes, { mode: 0o600 });
  assert.deepEqual(readPasswordEnrollmentWebReadiness(file, evidence.evidenceDigest, {
    now: runClock,
    expectedSource: source,
    expectedVersion: version,
  }), binding());
  assert.throws(() => readPasswordEnrollmentWebReadiness(file, 'b'.repeat(64), {
    now: runClock,
    expectedSource: source,
    expectedVersion: version,
  }), /password_enrollment_web_evidence_digest_mismatch/);
  fs.chmodSync(file, 0o644);
  assert.throws(() => readPasswordEnrollmentWebReadiness(file, evidence.evidenceDigest, {
    now: runClock,
    expectedSource: source,
    expectedVersion: version,
  }), /password_enrollment_web_readiness_file/);
  fs.chmodSync(file, 0o600);
  const alias = path.join(root, 'alias.json');
  fs.symlinkSync(file, alias);
  assert.throws(() => readPasswordEnrollmentWebReadiness(alias, evidence.evidenceDigest, {
    now: runClock,
    expectedSource: source,
    expectedVersion: version,
  }), /password_enrollment_web_readiness_file/);
});

for (const variant of [
  'short-read', 'initial-hardlink', 'initial-parent-mode', 'initial-ancestor-symlink',
  'ancestor-replacement', 'ancestor-symlink', 'ancestor-rename-back', 'ancestor-mode',
  'ancestor-open-replacement', 'ancestor-open-symlink', 'parent-open-replacement',
  'ancestor-sibling', 'parent-symlink', 'parent-rename-back', 'parent-mode', 'file-hardlink', 'file-mode',
  'file-replacement', 'file-growth', 'file-truncate', 'open-error', 'read-error', 'close-error',
]) {
  test(`readiness descriptor chain handles ${variant} and closes every opened descriptor`, (t) => {
    const root = temp(t);
    const ancestor = path.join(root, 'ancestor');
    const parent = path.join(ancestor, 'private');
    fs.mkdirSync(ancestor, { mode: 0o700 });
    fs.mkdirSync(parent, { mode: 0o700 });
    const file = path.join(parent, 'readiness.json');
    const evidence = handoff();
    fs.writeFileSync(file, evidence.bytes, { flag: 'wx', mode: 0o600 });
    if (variant === 'initial-hardlink') fs.linkSync(file, path.join(parent, 'linked'));
    if (variant === 'initial-parent-mode') fs.chmodSync(parent, 0o750);
    if (variant === 'initial-ancestor-symlink') {
      fs.renameSync(ancestor, `${ancestor}-old`);
      fs.symlinkSync(`${ancestor}-old`, ancestor, 'dir');
    }
    const open = fs.openSync; const read = fs.readSync; const close = fs.closeSync;
    const opened = []; const closed = [];
    let mutated = false; let mutationCompleted = false; let closeFailed = false; let reads = 0;
    t.mock.method(fs, 'openSync', (name, flags, ...args) => {
      if (name === ancestor && variant === 'open-error') throw Error('/private/untrusted-open');
      if (!mutationCompleted && ((name === parent && variant.startsWith('ancestor-open-'))
        || (name === file && variant === 'parent-open-replacement'))) {
        const replaced = variant === 'parent-open-replacement' ? parent : ancestor;
        fs.renameSync(replaced, `${replaced}-old`);
        if (variant === 'ancestor-open-symlink') fs.symlinkSync(`${replaced}-old`, replaced, 'dir');
        else {
          fs.mkdirSync(replaced, { mode: 0o700 });
          if (replaced === ancestor) fs.mkdirSync(parent, { mode: 0o700 });
          const replacement = open(file, 'wx', 0o600);
          try { fs.writeFileSync(replacement, evidence.bytes); } finally { close(replacement); }
        }
        mutationCompleted = true;
      }
      assert.ok(flags & fs.constants.O_NOFOLLOW);
      assert.ok(flags & fs.constants.O_NONBLOCK);
      const fd = open(name, flags, ...args); opened.push(fd); return fd;
    });
    t.mock.method(fs, 'closeSync', (fd) => {
      close(fd); closed.push(fd);
      if (variant === 'close-error' && !closeFailed) {
        closeFailed = true; throw Error('/private/untrusted-close');
      }
    });
    t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
      reads += 1;
      if (!mutated) {
        mutated = true;
        if (['ancestor-replacement', 'ancestor-symlink', 'ancestor-rename-back'].includes(variant)) {
          fs.renameSync(ancestor, `${ancestor}-old`);
          if (variant === 'ancestor-symlink') fs.symlinkSync(`${ancestor}-old`, ancestor, 'dir');
          if (variant === 'ancestor-rename-back') fs.renameSync(`${ancestor}-old`, ancestor);
          if (variant === 'ancestor-replacement') {
            fs.mkdirSync(ancestor, { mode: 0o700 }); fs.mkdirSync(parent, { mode: 0o700 });
            const replacement = open(file, 'wx', 0o600);
            try { fs.writeFileSync(replacement, evidence.bytes); } finally { close(replacement); }
          }
        }
        if (variant === 'ancestor-mode') fs.chmodSync(ancestor, 0o750);
        if (variant === 'ancestor-sibling') fs.mkdirSync(path.join(ancestor, 'unrelated-child'));
        if (variant === 'parent-symlink') {
          fs.renameSync(parent, `${parent}-old`); fs.symlinkSync(`${parent}-old`, parent, 'dir');
        }
        if (variant === 'parent-rename-back') {
          fs.renameSync(parent, `${parent}-old`); fs.renameSync(`${parent}-old`, parent);
        }
        if (variant === 'parent-mode') fs.chmodSync(parent, 0o750);
        if (variant === 'file-hardlink') fs.linkSync(file, path.join(parent, 'linked'));
        if (variant === 'file-mode') fs.chmodSync(file, 0o640);
        if (variant === 'file-replacement') {
          fs.renameSync(file, `${file}-old`);
          const replacement = open(file, 'wx', 0o600);
          try { fs.writeFileSync(replacement, evidence.bytes); } finally { close(replacement); }
        }
        if (variant === 'file-growth') {
          const writable = open(file, 'a');
          try { fs.writeSync(writable, ' '); } finally { close(writable); }
        }
        if (variant === 'file-truncate') {
          const writable = open(file, 'r+');
          try { fs.ftruncateSync(writable, 1); } finally { close(writable); }
        }
        mutationCompleted = true;
        if (variant === 'read-error') throw Error('/private/untrusted-read');
      }
      return read(fd, buffer, offset, variant === 'short-read' ? Math.min(7, length) : length, position);
    });
    const consume = () => readPasswordEnrollmentWebReadiness(file, evidence.evidenceDigest, {
      now: runClock, expectedSource: source, expectedVersion: version,
    });
    // A completed shared-ancestor rename-back after opening all descriptors
    // cannot substitute the protected parent/file or their exact bound bytes.
    if (['short-read', 'ancestor-sibling', 'ancestor-rename-back'].includes(variant)) {
      assert.deepEqual(consume(), binding());
    }
    else assert.throws(consume, (error) => /^password_enrollment_web_readiness_[a-z_]+$/u.test(error.message));
    assert.deepEqual(closed.toSorted(), opened.toSorted());
    assert.ok(opened.length > 0);
    if (/^(?:ancestor|parent|file)-/u.test(variant)) assert.equal(mutationCompleted, true);
    if (variant.includes('-open-')) assert.equal(reads, 0);
    if (variant === 'close-error') assert.equal(closeFailed, true);
  });
}

test('schema v4 artifact binds readiness, source and served release identity', (t) => {
  const passwordEnrollment = binding();
  const artifact = makeArtifact(t, { passwordEnrollment });
  const manifest = validateArtifact(artifact.directory, artifact.hash, source);
  assert.equal(manifest.schemaVersion, 4);
  assert.equal(manifest.profileContractVersion, STAGING_ENROLLMENT_WEB_PROFILE);
  assert.equal(manifest.passwordEnrollmentReadinessDigest, passwordEnrollment.readinessDigest);
  assert.equal(manifest.passwordEnrollmentEvidenceDigest, passwordEnrollment.evidenceDigest);
  assert.equal(manifest.passwordEnrollmentValidatedAtUtc, passwordEnrollment.validatedAtUtc);
  const release = JSON.parse(fs.readFileSync(
    path.join(artifact.directory, 'web/staging-release.json'),
  ));
  assert.equal(release.source, source);
  assert.equal(release.version, version);
  assert.equal(release.profileDigest, sha256(JSON.stringify(manifest.profile)));
  assert.equal(
    fs.readFileSync(path.join(artifact.directory, 'web/staging_bootstrap.js'), 'utf8'),
    stagingBootstrapFor(source, version, null, null, passwordEnrollment),
  );
});

test('schema v4 conditionally binds Google, Facebook and all-provider composites', (t) => {
  const passwordEnrollment = binding();
  const googleWeb = googleBinding();
  const facebookWeb = facebookBinding();
  for (const [google, facebook] of [
    [googleWeb, null],
    [null, facebookWeb],
    [googleWeb, facebookWeb],
  ]) {
    const artifact = makeArtifact(t, {
      passwordEnrollment,
      googleWeb: google,
      facebookWeb: facebook,
    });
    const manifest = validateArtifact(artifact.directory, artifact.hash, source);
    assert.equal(manifest.schemaVersion, 4);
    assert.equal(Object.hasOwn(manifest, 'googleWebConfigDigest'), google !== null);
    assert.equal(Object.hasOwn(manifest, 'facebookWebConfigDigest'), facebook !== null);
    assert.equal(manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, google ? 'true' : 'false');
    assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, facebook ? 'true' : 'false');
    assert.equal(manifest.profile.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED, 'true');
  }
});

test('baseline schema versions 1-3 remain unchanged when password enrollment is absent', (t) => {
  const googleWeb = googleBinding();
  const facebookWeb = facebookBinding();
  const cases = [
    { expected: 1, options: { passwordEnrollment: null } },
    { expected: 2, options: { passwordEnrollment: null, googleWeb } },
    { expected: 3, options: { passwordEnrollment: null, facebookWeb } },
    { expected: 3, options: { passwordEnrollment: null, googleWeb, facebookWeb } },
  ];
  for (const { expected, options } of cases) {
    const artifact = makeArtifact(t, options);
    assert.equal(
      validateArtifact(artifact.directory, artifact.hash, source).schemaVersion,
      expected,
    );
  }
});

test('schema v4 rejects a fully rehashed cross-app provider substitution', (t) => {
  const artifact = makeArtifact(t, {
    googleWeb: googleBinding(),
    facebookWeb: facebookBinding(),
  });
  const otherConfig = socialConfig({
    projectId: 'synthetic-sit-other',
    authDomain: 'synthetic-sit-other.firebaseapp.com',
    backendProjectId: 'synthetic-sit-other',
  });
  const otherFacebook = facebookBinding(otherConfig);
  const hash = rewriteManifest(artifact.directory, (manifest) => {
    for (const [key, define] of Object.entries(facebookWebFields)) {
      manifest.profile[define] = otherFacebook.config[key];
    }
    manifest.profile.SIT_FACEBOOK_WEB_CONFIG_SHA256 = otherFacebook.configDigest;
    manifest.profile.SIT_FACEBOOK_WEB_READINESS_JSON = otherFacebook.readinessJson;
    manifest.profile.SIT_FACEBOOK_WEB_READINESS_SHA256 = otherFacebook.readinessDigest;
    manifest.facebookWebConfigDigest = otherFacebook.configDigest;
    manifest.facebookWebReadinessDigest = otherFacebook.readinessDigest;
    manifest.facebookWebEvidenceDigest = otherFacebook.evidenceDigest;
    manifest.facebookWebValidatedAtUtc = otherFacebook.validatedAtUtc;
  });
  assert.throws(
    () => validateArtifact(artifact.directory, hash, source),
    /facebook_google_web_app_mismatch/,
  );
});

test('artifact sealing rechecks freshness before changing Web bytes', (t) => {
  const evidence = handoff({ value: readiness({
    observedAtUtc: isoAt(-3 * 60 * 60 * 1000),
    validUntilUtc: isoAt(-2 * 60 * 60 * 1000),
  }) });
  const previouslyValid = bindPasswordEnrollmentWebReadiness(
    evidence.envelope,
    evidence.evidenceDigest,
    {
      now: new Date(runClock.getTime() - 150 * 60 * 1000),
      expectedSource: source,
      expectedVersion: version,
    },
  );
  const directory = temp(t);
  fs.mkdirSync(path.join(directory, 'web'));
  const index = path.join(directory, 'web/index.html');
  fs.writeFileSync(index, '<script src="flutter_bootstrap.js" async></script>');
  assert.throws(() => sealArtifact({
    directory,
    source,
    version,
    flutterVersion: { frameworkVersion: 'test-only' },
    builderDigest: 'b'.repeat(64),
    passwordEnrollment: previouslyValid,
  }), /password_enrollment_web_readiness_invalid/);
  assert.equal(
    fs.readFileSync(index, 'utf8'),
    '<script src="flutter_bootstrap.js" async></script>',
  );
  assert.deepEqual(fs.readdirSync(directory), ['web']);
});

for (const variant of [
  'flagOff',
  'readinessJson',
  'readinessDigest',
  'evidenceDigest',
  'validatedAt',
  'source',
  'version',
  'contractVersion',
  'schemaDowngrade',
  'extraProviderMetadata',
  'googleDigest',
  'facebookConfigDigest',
  'facebookReadinessDigest',
  'facebookEvidenceDigest',
  'facebookValidatedAt',
]) {
  test(`rehashed v4 manifest rejects composite binding drift: ${variant}`, (t) => {
    const artifact = makeArtifact(t, {
      googleWeb: googleBinding(),
      facebookWeb: facebookBinding(),
    });
    const hash = rewriteManifest(artifact.directory, (manifest) => {
      if (variant === 'flagOff') manifest.profile.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED = 'false';
      if (variant === 'readinessJson') manifest.profile.SIT_WEB_PASSWORD_ENROLLMENT_READINESS_JSON = '{}';
      if (variant === 'readinessDigest') manifest.passwordEnrollmentReadinessDigest = 'b'.repeat(64);
      if (variant === 'evidenceDigest') manifest.passwordEnrollmentEvidenceDigest = 'b'.repeat(64);
      if (variant === 'validatedAt') manifest.passwordEnrollmentValidatedAtUtc = '2020-01-01T00:00:00Z';
      if (variant === 'source') manifest.source = 'b'.repeat(40);
      if (variant === 'version') manifest.version = '1.0.0+1';
      if (variant === 'contractVersion') manifest.profileContractVersion = 'future';
      if (variant === 'schemaDowngrade') manifest.schemaVersion = 3;
      if (variant === 'extraProviderMetadata') manifest.unexpectedProviderDigest = 'b'.repeat(64);
      if (variant === 'googleDigest') manifest.googleWebConfigDigest = 'b'.repeat(64);
      if (variant === 'facebookConfigDigest') manifest.facebookWebConfigDigest = 'b'.repeat(64);
      if (variant === 'facebookReadinessDigest') manifest.facebookWebReadinessDigest = 'b'.repeat(64);
      if (variant === 'facebookEvidenceDigest') manifest.facebookWebEvidenceDigest = 'b'.repeat(64);
      if (variant === 'facebookValidatedAt') manifest.facebookWebValidatedAtUtc = '2020-01-01T00:00:00Z';
    });
    assert.throws(() => validateArtifact(artifact.directory, hash, source));
  });
}

test('actual builder composes protected Google, Facebook and password inputs', (t) => {
  const root = temp(t);
  const checkout = path.join(root, 'source');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(checkout);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(checkout, 'pubspec.yaml'), `version: ${version}\n`);
  fs.writeFileSync(path.join(checkout, '.gitignore'), 'build/\n');
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const exactSource = git('rev-parse', 'HEAD');
  const evidence = handoff({ value: readiness({ sourceCommit: exactSource }) });
  const evidenceFile = path.join(root, 'password-enrollment-readiness.json');
  fs.writeFileSync(evidenceFile, evidence.bytes, { mode: 0o600 });
  const publicConfig = socialConfig();
  const googleFile = path.join(root, 'google-web-config.json');
  fs.writeFileSync(googleFile, JSON.stringify(publicConfig), { mode: 0o600 });
  const facebookEvidence = facebookHandoff(publicConfig);
  const facebookFile = path.join(root, 'facebook-web-readiness.json');
  fs.writeFileSync(facebookFile, facebookEvidence.bytes, { mode: 0o600 });
  const definitionsLog = path.join(root, 'definition-path');
  const program = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]);
if(name==='flutter')console.log(JSON.stringify({frameworkVersion:'test-only',frameworkRevision:'test-only',dartSdkVersion:'test-only'}));
if(name==='bash'){
const file=process.argv.find(x=>x.startsWith('--dart-define-from-file=')).split('=')[1];
const value=JSON.parse(fs.readFileSync(file));
if((fs.statSync(file).mode&511)!==384||value.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED!=='true'||value.SIT_SOCIAL_GOOGLE_ENABLED!=='true'||value.SIT_SOCIAL_FACEBOOK_ENABLED!=='true')process.exit(3);
fs.writeFileSync(process.env.SIT_TEST_DEFINES_LOG,file);fs.mkdirSync('build/web',{recursive:true});
for(const [entry,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>','main.dart.js':'test-only compiled','manifest.json':'{}','flutter_bootstrap.js':'bootstrap();'}))fs.writeFileSync(path.join('build/web',entry),text);
}\n`;
  for (const name of ['flutter', 'bash', 'python3']) {
    fs.writeFileSync(path.join(bin, name), program, { mode: 0o755 });
  }
  const output = path.join(root, 'artifact');
  const args = [
    path.join(repo, 'tool/build_staging_web.mjs'),
    checkout,
    exactSource,
    output,
    '--google-web-config',
    googleFile,
    googleBinding(publicConfig).digest,
    '--facebook-web-readiness',
    facebookFile,
    facebookEvidence.evidenceDigest,
    '--password-enrollment-readiness',
    evidenceFile,
    evidence.evidenceDigest,
  ];
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SIT_TEST_DEFINES_LOG: definitionsLog,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout.trim());
  const manifest = validateArtifact(output, summary.manifestHash, exactSource);
  assert.equal(manifest.schemaVersion, 4);
  assert.equal(manifest.profile.SIT_WEB_PASSWORD_ENROLLMENT_ENABLED, 'true');
  assert.equal(manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'true');
  assert.equal(fs.existsSync(fs.readFileSync(definitionsLog, 'utf8')), false);

  const rejectedOutput = path.join(root, 'rejected');
  const rejected = spawnSync(process.execPath, [
    ...args.slice(0, 3), rejectedOutput, ...args.slice(4, -1),
    'b'.repeat(64),
  ], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /password_enrollment_web_evidence_digest_mismatch/);
  assert.equal(fs.existsSync(rejectedOutput), false);
});
