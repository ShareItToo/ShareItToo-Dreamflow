import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://localhost/apple-ownership-unit';
process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');

const {
  AppleOwnershipError,
  openAppleOwnershipValue,
  parseAppleOwnershipRequest,
  sealAppleOwnershipValue,
} = await import('../src/apple_ownership.js');
const { readAppleOwnershipConfiguration } = await import('../src/apple_ownership_config.js');
const {
  appleRevocationSecretFileInternals,
  readAppleOwnershipSecretConfiguration,
  readAppleRevocationConfiguration,
} = await import('../src/apple_revocation_secret_files.js');
const { createAppleRevocationProviderRing } = await import('../src/apple_revocation.js');

const requestId = crypto.randomBytes(32).toString('base64url');
const receipt = crypto.randomBytes(32).toString('base64url');
const deliveryId = crypto.randomBytes(32).toString('base64url');

function parse(value, raw = JSON.stringify(value)) {
  return parseAppleOwnershipRequest(Buffer.from(raw), value);
}

test('v2 request parser accepts only exact bounded acquire/status/session contracts', () => {
  assert.equal(parse({
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'acquire', requestId, authorizationCode: 'code-12345678' },
  }).appleAuth.operation, 'acquire');
  assert.equal(parse({
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'status', receipt },
  }).appleAuth.operation, 'status');
  assert.equal(parse({
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'session', receipt, deliveryId },
  }).appleAuth.operation, 'session');
  for (const candidate of [
    { idToken: 'x'.repeat(200), appleAuth: { version: 2, operation: 'status', receipt, extra: true } },
    { idToken: 'x'.repeat(200), appleAuth: { version: 2, operation: 'session', receipt, deliveryId: 'short' } },
    { idToken: 'x'.repeat(200), appleAuth: { version: 2, operation: 'acquire', requestId, authorizationCode: 'short' }, extra: true },
  ]) {
    assert.throws(() => parse(candidate), AppleOwnershipError);
  }
  assert.throws(
    () => parse({ idToken: 'x'.repeat(200), appleAuth: { version: 3, operation: 'status', receipt } }),
    (error) => error.status === 400 && error.code === 'apple_contract_version_unsupported',
  );
  assert.equal(parse({
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'acquire', requestId, authorizationCode: '!' },
  }).appleAuth.authorizationCode, '!');
  assert.equal(parse({
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'acquire', requestId, authorizationCode: 'x'.repeat(12_000) },
  }).appleAuth.authorizationCode.length, 12_000);
  assert.throws(
    () => parse({
      idToken: 'x'.repeat(200),
      appleAuth: { version: 2, operation: 'acquire', requestId, authorizationCode: 'x'.repeat(12_001) },
    }),
    (error) => error.code === 'invalid_apple_authorization_code',
  );
});

test('duplicate JSON keys and payloads above 32KiB fail closed before provider use', () => {
  const duplicate = `{"idToken":"${'x'.repeat(200)}","appleAuth":{"version":2,"operation":"status","receipt":"${receipt}","receipt":"${receipt}"}}`;
  assert.throws(
    () => parse({ idToken: 'x'.repeat(200), appleAuth: { version: 2, operation: 'status', receipt } }, duplicate),
    (error) => error.code === 'duplicate_json_key',
  );
  const oversized = Buffer.alloc(32 * 1024 + 1, 32);
  assert.throws(
    () => parseAppleOwnershipRequest(oversized, {}),
    (error) => error.status === 413,
  );
  let deeplyNested = 'leaf';
  for (let depth = 0; depth < 20; depth += 1) deeplyNested = [deeplyNested];
  const deepCandidate = {
    idToken: 'x'.repeat(200),
    appleAuth: { version: 2, operation: 'status', receipt },
    deeplyNested,
  };
  assert.throws(
    () => parseAppleOwnershipRequest(Buffer.from(JSON.stringify(deepCandidate)), deepCandidate),
    (error) => error.status === 400 && error.code === 'apple_ownership_json_too_deep',
  );
});

test('configuration is default-off and derives domain-separated keys only from a complete profile', () => {
  assert.deepEqual(readAppleOwnershipConfiguration({}, {
    appleRevocation: { enabled: false, encryptionKey: null }, firebaseProjectId: '',
  }), {
    configured: false, acquisitionEnabled: false, generation: '', profileDigest: '',
    firebaseProjectId: '', appleClientId: '', redirectUri: '', lookupKeyId: '',
    receiptKeyId: '', materialKeyId: '', lookupKey: null, receiptKey: null, materialKey: null,
    coordinationKey: null, coordinationKeyId: '', profiles: [], webTestUserIds: [],
  });
  const configuration = readAppleOwnershipConfiguration({
    APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
    APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v1',
    APPLE_OWNERSHIP_WEB_TEST_USER_IDS: 'synthetic-owner',
  }, {
    appleRevocation: {
      enabled: true, encryptionKey: Buffer.alloc(32, 4),
      clientId: 'com.shareittoo.synthetic', redirectUri: 'https://example.invalid/apple/callback',
    },
    firebaseProjectId: 'shareittoo-synthetic',
    coordinationKey: Buffer.alloc(32, 3),
  });
  assert.equal(configuration.configured, true);
  assert.equal(configuration.acquisitionEnabled, true);
  assert.deepEqual(configuration.webTestUserIds, ['synthetic-owner']);
  assert.notDeepEqual(configuration.lookupKey, configuration.receiptKey);
  assert.notDeepEqual(configuration.receiptKey, configuration.materialKey);
  assert.notDeepEqual(configuration.coordinationKey, configuration.lookupKey);
  assert.match(configuration.profileDigest, /^[a-f0-9]{64}$/u);
  assert.throws(() => readAppleOwnershipConfiguration({
    APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v1',
  }, {
    appleRevocation: {
      enabled: true, encryptionKey: Buffer.alloc(32, 4),
      clientId: 'com.shareittoo.synthetic', redirectUri: 'https://example.invalid/apple/callback',
    },
    firebaseProjectId: 'shareittoo-synthetic',
    coordinationKey: Buffer.alloc(32, 4),
  }), /distinct from every profile key/u);
  assert.throws(() => readAppleOwnershipConfiguration({
    APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
    APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v1',
  }, {
    appleRevocation: {
      enabled: true, encryptionKey: Buffer.alloc(32, 4),
      clientId: 'com.shareittoo.synthetic', redirectUri: 'https://example.invalid/apple/callback',
    },
    firebaseProjectId: 'shareittoo-synthetic',
    coordinationKey: Buffer.alloc(32, 3),
  }), /WEB_TEST_USER_IDS/u);
  const ring = readAppleOwnershipConfiguration({
    APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
    APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v2',
    APPLE_OWNERSHIP_WEB_TEST_USER_IDS: 'synthetic-owner',
  }, {
    appleRevocation: {
      enabled: true, encryptionKey: Buffer.alloc(32, 5),
      clientId: 'com.shareittoo.synthetic.v2', redirectUri: 'https://example.invalid/apple/v2',
    },
    firebaseProjectId: 'shareittoo-synthetic',
    coordinationKey: Buffer.alloc(32, 3),
    historicalProfiles: [{
      generation: 'synthetic-w4d-v1', firebaseProjectId: 'shareittoo-synthetic',
      appleRevocation: {
        enabled: true, encryptionKey: Buffer.alloc(32, 4),
        clientId: 'com.shareittoo.synthetic', redirectUri: 'https://example.invalid/apple/callback',
      },
    }],
  });
  assert.equal(ring.profiles.length, 2);
  assert.notEqual(ring.profiles[0].materialKeyId, ring.profiles[1].materialKeyId);
});

test('production historical profile manifest loads bounded owner-only secrets into a usable ring', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-ring-'));
  try {
    const writeSecret = (name, value) => {
      const target = path.join(directory, name);
      fs.writeFileSync(target, value, { mode: 0o600 });
      fs.chmodSync(target, 0o600);
      return target;
    };
    const currentPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const historicalPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const wrongCurvePair = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    const coordinationFile = writeSecret('coordination.key', Buffer.alloc(32, 3).toString('base64url'));
    const currentEncryptionFile = writeSecret('current.key', Buffer.alloc(32, 5).toString('base64url'));
    const currentPrivateKeyFile = writeSecret('current.pem', currentPair.privateKey.export({
      type: 'pkcs8', format: 'pem',
    }));
    const encryptionFile = writeSecret('historical.key', Buffer.alloc(32, 4).toString('base64url'));
    const privateKeyFile = writeSecret('historical.pem', historicalPair.privateKey.export({
      type: 'pkcs8', format: 'pem',
    }));
    const manifestFile = writeSecret('profiles.json', JSON.stringify({
      schemaVersion: 1,
      profiles: [{
        generation: 'synthetic-w4d-v1',
        firebaseProjectId: 'shareittoo-synthetic',
        clientId: 'com.shareittoo.synthetic.v1',
        teamId: 'TEAMID1234',
        keyId: 'KEYID1234',
        redirectUri: 'https://example.invalid/apple/v1',
        encryptionKeyFile: encryptionFile,
        privateKeyFile,
      }],
    }));
    const secrets = readAppleOwnershipSecretConfiguration({
      APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
      APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE: manifestFile,
    }, { deploymentEnvironment: 'production' });
    const currentEnvironment = {
      APPLE_REVOCATION_ENABLED: 'true',
      APPLE_REVOCATION_ENCRYPTION_KEY_FILE: currentEncryptionFile,
      APPLE_REVOCATION_PRIVATE_KEY_FILE: currentPrivateKeyFile,
      APPLE_REVOCATION_CLIENT_ID: 'com.shareittoo.synthetic.v2',
      APPLE_REVOCATION_TEAM_ID: 'TEAMID1234',
      APPLE_REVOCATION_KEY_ID: 'KEYID5678',
      APPLE_REVOCATION_REDIRECT_URI: 'https://example.invalid/apple/v2',
    };
    const currentConfiguration = readAppleRevocationConfiguration(currentEnvironment, {
      deploymentEnvironment: 'production',
      requireOwnershipFileSecrets: true,
    });
    assert.equal(currentConfiguration.credentialSource, 'file');
    const currentSec1File = writeSecret('current-sec1.pem', currentPair.privateKey.export({
      type: 'sec1', format: 'pem',
    }));
    assert.throws(() => readAppleRevocationConfiguration({
      ...currentEnvironment,
      APPLE_REVOCATION_PRIVATE_KEY_FILE: currentSec1File,
    }, {
      deploymentEnvironment: 'production', requireOwnershipFileSecrets: true,
    }), /PKCS8 private key/u);
    const currentWrongCurveFile = writeSecret('current-wrong-curve.pem', wrongCurvePair.privateKey.export({
      type: 'pkcs8', format: 'pem',
    }));
    assert.throws(() => readAppleRevocationConfiguration({
      ...currentEnvironment,
      APPLE_REVOCATION_PRIVATE_KEY_FILE: currentWrongCurveFile,
    }, {
      deploymentEnvironment: 'production', requireOwnershipFileSecrets: true,
    }), /P-256 EC private key/u);
    assert.throws(() => readAppleRevocationConfiguration({
      ...currentEnvironment,
      APPLE_REVOCATION_ENCRYPTION_KEY_FILE: '',
      APPLE_REVOCATION_PRIVATE_KEY_FILE: '',
      APPLE_REVOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64url'),
      APPLE_REVOCATION_PRIVATE_KEY: currentPair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }, {
      deploymentEnvironment: 'production',
      requireOwnershipFileSecrets: true,
    }), /requires APPLE_REVOCATION_ENCRYPTION_KEY_FILE and APPLE_REVOCATION_PRIVATE_KEY_FILE/u);
    assert.throws(() => readAppleRevocationConfiguration({
      ...currentEnvironment,
      APPLE_REVOCATION_PRIVATE_KEY_FILE: '',
      APPLE_REVOCATION_PRIVATE_KEY: currentPair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }, {
      deploymentEnvironment: 'staging',
      requireOwnershipFileSecrets: true,
    }), /requires APPLE_REVOCATION_ENCRYPTION_KEY_FILE and APPLE_REVOCATION_PRIVATE_KEY_FILE/u);
    assert.equal(readAppleRevocationConfiguration({
      ...currentEnvironment,
      APPLE_REVOCATION_ENCRYPTION_KEY_FILE: '',
      APPLE_REVOCATION_PRIVATE_KEY_FILE: '',
      APPLE_REVOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64url'),
      APPLE_REVOCATION_PRIVATE_KEY: currentPair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }, { deploymentEnvironment: 'production' }).enabled, true);
    assert.throws(() => readAppleOwnershipConfiguration({}, {
      appleRevocation: { enabled: false, encryptionKey: null },
      firebaseProjectId: '',
      coordinationKey: secrets.coordinationKey,
      historicalProfiles: secrets.historicalProfiles,
    }), /configuration is incomplete/u);
    const configuration = readAppleOwnershipConfiguration({
      APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
      APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v2',
      APPLE_OWNERSHIP_WEB_TEST_USER_IDS: 'synthetic-owner',
    }, {
      coordinationKey: secrets.coordinationKey,
      historicalProfiles: secrets.historicalProfiles,
      firebaseProjectId: 'shareittoo-synthetic',
      appleRevocation: currentConfiguration,
    });
    const ring = createAppleRevocationProviderRing(configuration);
    assert.equal(configuration.profiles.length, 2);
    assert.ok(ring.forProfile(configuration.profiles[0]));
    assert.ok(ring.forProfile(configuration.profiles[1]));
    const incompleteManifest = writeSecret('profiles-incomplete.json', JSON.stringify({
      schemaVersion: 1,
      profiles: [{
        generation: 'synthetic-w4d-v1', firebaseProjectId: 'shareittoo-synthetic',
        clientId: 'com.shareittoo.synthetic.v1', teamId: 'TEAMID1234',
        redirectUri: 'https://example.invalid/apple/v1',
        encryptionKeyFile: encryptionFile, privateKeyFile,
      }],
    }));
    assert.throws(() => readAppleOwnershipSecretConfiguration({
      APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
      APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE: incompleteManifest,
    }, { deploymentEnvironment: 'production' }), /invalid shape/u);
    const invalidEncryptionFile = writeSecret('historical-invalid.key', 'x'.repeat(32));
    const invalidSecretsManifest = writeSecret('profiles-invalid-secret.json', JSON.stringify({
      schemaVersion: 1,
      profiles: [{
        generation: 'synthetic-w4d-v1', firebaseProjectId: 'shareittoo-synthetic',
        clientId: 'com.shareittoo.synthetic.v1', teamId: 'TEAMID1234', keyId: 'KEYID1234',
        redirectUri: 'https://example.invalid/apple/v1',
        encryptionKeyFile: invalidEncryptionFile, privateKeyFile,
      }],
    }));
    assert.throws(() => readAppleOwnershipSecretConfiguration({
      APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
      APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE: invalidSecretsManifest,
    }, { deploymentEnvironment: 'production' }), /valid 32-byte key/u);
    for (const [name, keyFile, expected] of [
      ['profiles-sec1.json', writeSecret('historical-sec1.pem', historicalPair.privateKey.export({
        type: 'sec1', format: 'pem',
      })), /PKCS8 private key/u],
      ['profiles-wrong-curve.json', writeSecret(
        'historical-wrong-curve.pem',
        wrongCurvePair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      ), /P-256 EC private key/u],
    ]) {
      const invalidKeyManifest = writeSecret(name, JSON.stringify({
        schemaVersion: 1,
        profiles: [{
          generation: 'synthetic-w4d-v1', firebaseProjectId: 'shareittoo-synthetic',
          clientId: 'com.shareittoo.synthetic.v1', teamId: 'TEAMID1234', keyId: 'KEYID1234',
          redirectUri: 'https://example.invalid/apple/v1',
          encryptionKeyFile: encryptionFile, privateKeyFile: keyFile,
        }],
      }));
      assert.throws(() => readAppleOwnershipSecretConfiguration({
        APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
        APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE: invalidKeyManifest,
      }, { deploymentEnvironment: 'production' }), expected);
    }
    const coordinationHardlink = path.join(directory, 'coordination-hardlink.key');
    fs.linkSync(coordinationFile, coordinationHardlink);
    assert.throws(() => readAppleOwnershipSecretConfiguration({
      APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
    }, { deploymentEnvironment: 'production' }), /single-link/u);
    fs.unlinkSync(coordinationHardlink);
    const stableMetadata = {
      dev: 1, ino: 2, mode: 0o100600, nlink: 1,
      uid: typeof process.getuid === 'function' ? process.getuid() : 0,
      gid: 3, size: 64, mtimeMs: 4, ctimeMs: 5,
      isFile: () => true,
    };
    assert.throws(() => appleRevocationSecretFileInternals.assertStableBoundedRead(
      'TEST_SECRET', stableMetadata, stableMetadata, 129,
      { minimumBytes: 16, maximumBytes: 128, ownerOnly: true },
    ), /bounded regular file/u);
    assert.throws(() => appleRevocationSecretFileInternals.assertStableBoundedRead(
      'TEST_SECRET', stableMetadata, { ...stableMetadata, ctimeMs: 6 }, 64,
      { minimumBytes: 16, maximumBytes: 128, ownerOnly: true },
    ), /changed while it was being read/u);
    fs.chmodSync(manifestFile, 0o644);
    assert.throws(() => readAppleOwnershipSecretConfiguration({
      APPLE_OWNERSHIP_COORDINATION_KEY_FILE: coordinationFile,
      APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE: manifestFile,
    }, { deploymentEnvironment: 'production' }), /owner-only/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('owner-bound AES-GCM refuses changed owner, purpose, key id, or ciphertext', () => {
  const key = crypto.randomBytes(32);
  const aad = Buffer.from('v2\0material\0profile\0owner-a\0attempt-a');
  const sealed = sealAppleOwnershipValue('synthetic-refresh-token', key, 'material-key-v1', aad);
  const sealedParts = sealed.split('.');
  sealedParts[4] = `${sealedParts[4][0] === 'A' ? 'B' : 'A'}${sealedParts[4].slice(1)}`;
  const tampered = sealedParts.join('.');
  assert.equal(openAppleOwnershipValue(sealed, key, 'material-key-v1', aad), 'synthetic-refresh-token');
  for (const [candidate, keyId, associated] of [
    [sealed, 'material-key-v2', aad],
    [sealed, 'material-key-v1', Buffer.from('v2\0material\0profile\0owner-b\0attempt-a')],
    [tampered, 'material-key-v1', aad],
  ]) {
    assert.throws(
      () => openAppleOwnershipValue(candidate, key, keyId, associated),
      (error) => error.code === 'apple_ownership_material_unreadable',
    );
  }
});

test('current social route is ledger-first for v2 and blocks enrolled legacy before old exchange', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.post('/v1/auth/social'");
  const end = source.indexOf("app.get('/v1/payments/connect/return'", start);
  const route = source.slice(start, end);
  assert.ok(route.indexOf('parseAppleOwnershipRequest') < route.indexOf('normalizeAppleRevocationMaterial'));
  assert.ok(route.indexOf('acquireAppleOwnership') < route.indexOf('normalizeAppleRevocationMaterial'));
  assert.ok(route.indexOf('assertLegacyAppleOwnershipAllowed') < route.indexOf('normalizeAppleRevocationMaterial'));
  assert.match(route, /requireFreshToken: true/u);
  assert.match(source, /completeAppleMfaDelivery/u);
  assert.match(configSource, /const appleOwnershipProfileRequested = Boolean/u);
  assert.match(configSource, /requireOwnershipFileSecrets: appleOwnershipProfileRequested/u);
});

test('MFA completion keeps the delivery row as its sole Apple replacement lock', () => {
  const source = fs.readFileSync(new URL('../src/apple_ownership.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function completeAppleMfaDelivery');
  const end = source.indexOf('export async function drainAppleOwnershipCleanup', start);
  const completion = source.slice(start, end);
  assert.match(completion, /UPDATE apple_ownership_deliveries AS delivery/u);
  assert.match(completion, /SELECT \* FROM apple_ownership_attempts WHERE id=\$1/u);
  assert.doesNotMatch(completion, /apple_ownership_attempts[^']*FOR UPDATE/u);
});

test('migration is multi-material, fail-closed on down, and separates active reservations from cleanup', () => {
  const up = fs.readFileSync(new URL('../sql/migrations/106_apple_ownership_v2.up.sql', import.meta.url), 'utf8');
  const down = fs.readFileSync(new URL('../sql/migrations/106_apple_ownership_v2.down.sql', import.meta.url), 'utf8');
  assert.match(up, /CREATE TABLE apple_ownership_attempts/u);
  assert.match(up, /CREATE TABLE apple_ownership_materials/u);
  assert.match(up, /attempt_id UUID NOT NULL UNIQUE/u);
  assert.match(up, /'claimed', 'exchanging'/u);
  assert.match(up, /'cleanup_pending', 'active', 'revoking', 'cleanup_unknown', 'revoked'/u);
  assert.match(down, /apple_ownership_v2_obligations_present/u);
});
