import crypto from 'node:crypto';

const generationPattern = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const projectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const clientPattern = /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u;

function value(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : '';
}

function derive(baseKey, generation, purpose) {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    baseKey,
    Buffer.from(`shareittoo/apple-ownership/${generation}`, 'utf8'),
    Buffer.from(`v2/${purpose}`, 'utf8'),
    32,
  ));
}

function digestProfile(profile) {
  return crypto.createHash('sha256').update(JSON.stringify(profile), 'utf8').digest('hex');
}

function readAllowlist(env, explicit) {
  const source = explicit ?? value(env, 'APPLE_OWNERSHIP_WEB_TEST_USER_IDS').split(',');
  const values = source.map((entry) => String(entry).trim()).filter(Boolean);
  if (values.some((entry) => entry.length > 180 || /[\s,*]/u.test(entry))
      || new Set(values).size !== values.length) {
    throw new Error('APPLE_OWNERSHIP_WEB_TEST_USER_IDS is invalid');
  }
  return Object.freeze(values);
}

function buildProfile({ generation, firebaseProjectId, appleRevocation }) {
  if (!generationPattern.test(generation)) {
    throw new Error('APPLE_OWNERSHIP_CONFIG_GENERATION is invalid');
  }
  if (!projectPattern.test(firebaseProjectId)) {
    throw new Error('Apple ownership Firebase project is invalid');
  }
  if (!clientPattern.test(appleRevocation?.clientId ?? '')) {
    throw new Error('Apple ownership client ID is invalid');
  }
  if (!Buffer.isBuffer(appleRevocation?.encryptionKey)
      || appleRevocation.encryptionKey.length !== 32) {
    throw new Error('Apple ownership encryption key is invalid');
  }
  let redirect;
  try {
    redirect = new URL(appleRevocation.redirectUri);
  } catch {
    throw new Error('Apple ownership redirect URI is invalid');
  }
  if (redirect.protocol !== 'https:') throw new Error('Apple ownership redirect URI is invalid');
  const identity = Object.freeze({
    generation,
    firebaseProjectId,
    appleClientId: appleRevocation.clientId,
    redirectUri: redirect.href,
  });
  const profileDigest = digestProfile(identity);
  return Object.freeze({
    ...identity,
    profileDigest,
    lookupKeyId: `apple-ownership-lookup-${generation}`,
    receiptKeyId: `apple-ownership-receipt-${generation}`,
    materialKeyId: `apple-ownership-material-${generation}`,
    lookupKey: derive(appleRevocation.encryptionKey, generation, 'lookup'),
    receiptKey: derive(appleRevocation.encryptionKey, generation, 'receipt'),
    materialKey: derive(appleRevocation.encryptionKey, generation, 'material'),
    providerConfiguration: Object.freeze({ ...appleRevocation }),
  });
}

export function readAppleOwnershipConfiguration(env, {
  appleRevocation,
  firebaseProjectId,
  coordinationKey,
  historicalProfiles = [],
  webTestUserIds,
} = {}) {
  const acquisitionEnabled = value(env, 'APPLE_OWNERSHIP_ACQUISITION_ENABLED').toLowerCase() === 'true';
  const generation = value(env, 'APPLE_OWNERSHIP_CONFIG_GENERATION');
  const configured = Boolean(
    appleRevocation?.enabled
      && Buffer.isBuffer(appleRevocation.encryptionKey)
      && generation
      && firebaseProjectId
      && Buffer.isBuffer(coordinationKey)
      && coordinationKey.length === 32
      && appleRevocation.clientId
      && appleRevocation.redirectUri,
  );
  if (!configured) {
    if (acquisitionEnabled || generation || historicalProfiles.length > 0) {
      throw new Error('Apple ownership configuration is incomplete');
    }
    return Object.freeze({
      configured: false,
      acquisitionEnabled: false,
      generation: '',
      profileDigest: '',
      firebaseProjectId: '',
      appleClientId: '',
      redirectUri: '',
      lookupKeyId: '',
      receiptKeyId: '',
      materialKeyId: '',
      lookupKey: null,
      receiptKey: null,
      materialKey: null,
      coordinationKey: null,
      coordinationKeyId: '',
      profiles: Object.freeze([]),
      webTestUserIds: Object.freeze([]),
    });
  }
  const current = buildProfile({
    generation,
    firebaseProjectId,
    appleRevocation,
  });
  const historical = historicalProfiles.map((entry) => buildProfile(entry));
  const profiles = Object.freeze([current, ...historical]);
  if (profiles.some((entry) => crypto.timingSafeEqual(
    entry.providerConfiguration.encryptionKey,
    coordinationKey,
  ))) {
    throw new Error('Apple ownership coordination key must be distinct from every profile key');
  }
  if (new Set(profiles.map((entry) => entry.generation)).size !== profiles.length
      || new Set(profiles.map((entry) => entry.profileDigest)).size !== profiles.length
      || new Set(profiles.map((entry) => entry.lookupKeyId)).size !== profiles.length
      || new Set(profiles.map((entry) => entry.receiptKeyId)).size !== profiles.length
      || new Set(profiles.map((entry) => entry.materialKeyId)).size !== profiles.length) {
    throw new Error('Apple ownership profile ring contains duplicate identities');
  }
  const allowlist = readAllowlist(env, webTestUserIds);
  if (acquisitionEnabled && allowlist.length === 0) {
    throw new Error('APPLE_OWNERSHIP_WEB_TEST_USER_IDS is required while acquisition is enabled');
  }
  return Object.freeze({
    configured: true,
    acquisitionEnabled,
    ...current,
    coordinationKey: Buffer.from(coordinationKey),
    coordinationKeyId: `apple-ownership-coordination-${crypto.createHash('sha256')
      .update(coordinationKey).digest('hex').slice(0, 16)}`,
    profiles,
    webTestUserIds: allowlist,
  });
}
