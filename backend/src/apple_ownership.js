import crypto from 'node:crypto';

const canonicalIdPattern = /^[A-Za-z0-9_-]{43}$/u;
const maximumJsonDepth = 16;
const publicStates = Object.freeze({
  claimed: 'pending',
  exchanging: 'pending',
  committed: 'ready',
  unknown: 'unresolved',
  cleanup_required: 'cleanup_required',
  closed: 'closed',
});

export class AppleOwnershipError extends Error {
  constructor(status, code, cause = undefined) {
    super(code, cause ? { cause } : undefined);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) {
  throw new AppleOwnershipError(status, code);
}

function requireConfiguration(configuration, { acquisition = false } = {}) {
  if (!configuration?.configured
      || !Buffer.isBuffer(configuration.lookupKey)
      || !Buffer.isBuffer(configuration.receiptKey)
      || !Buffer.isBuffer(configuration.materialKey)
      || !Buffer.isBuffer(configuration.coordinationKey)
      || configuration.coordinationKey.length !== 32) {
    fail(503, 'apple_ownership_unavailable');
  }
  if (acquisition && configuration.acquisitionEnabled !== true) {
    fail(503, 'apple_ownership_paused');
  }
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bounded(value, minimum, maximum) {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum
    ? value
    : '';
}

function requireCanonicalId(value, code) {
  if (!canonicalIdPattern.test(value ?? '')) fail(400, code);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) fail(400, code);
  return value;
}

function parseJsonString(source, cursor) {
  let index = cursor + 1;
  while (index < source.length) {
    if (source[index] === '"') return index + 1;
    if (source[index] === '\\') {
      index += 1;
      if (source[index] === 'u') index += 4;
    }
    index += 1;
  }
  fail(400, 'invalid_apple_ownership_request');
}

function rejectDuplicateJsonKeys(raw) {
  let cursor = 0;
  const whitespace = () => { while (/\s/u.test(raw[cursor] ?? '')) cursor += 1; };
  const consumeValue = (depth = 0) => {
    if (depth > maximumJsonDepth) fail(400, 'apple_ownership_json_too_deep');
    whitespace();
    if (raw[cursor] === '{') {
      cursor += 1;
      whitespace();
      const keys = new Set();
      if (raw[cursor] === '}') { cursor += 1; return; }
      while (cursor < raw.length) {
        whitespace();
        if (raw[cursor] !== '"') fail(400, 'invalid_apple_ownership_request');
        const end = parseJsonString(raw, cursor);
        let key;
        try { key = JSON.parse(raw.slice(cursor, end)); } catch { fail(400, 'invalid_apple_ownership_request'); }
        if (keys.has(key)) fail(400, 'duplicate_json_key');
        keys.add(key);
        cursor = end;
        whitespace();
        if (raw[cursor] !== ':') fail(400, 'invalid_apple_ownership_request');
        cursor += 1;
        consumeValue(depth + 1);
        whitespace();
        if (raw[cursor] === '}') { cursor += 1; return; }
        if (raw[cursor] !== ',') fail(400, 'invalid_apple_ownership_request');
        cursor += 1;
      }
      fail(400, 'invalid_apple_ownership_request');
    }
    if (raw[cursor] === '[') {
      cursor += 1;
      whitespace();
      if (raw[cursor] === ']') { cursor += 1; return; }
      while (cursor < raw.length) {
        consumeValue(depth + 1);
        whitespace();
        if (raw[cursor] === ']') { cursor += 1; return; }
        if (raw[cursor] !== ',') fail(400, 'invalid_apple_ownership_request');
        cursor += 1;
      }
      fail(400, 'invalid_apple_ownership_request');
    }
    if (raw[cursor] === '"') { cursor = parseJsonString(raw, cursor); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(raw.slice(cursor));
    if (!match) fail(400, 'invalid_apple_ownership_request');
    cursor += match[0].length;
  };
  consumeValue();
  whitespace();
  if (cursor !== raw.length) fail(400, 'invalid_apple_ownership_request');
}

export function parseAppleOwnershipRequest(rawBody, parsedBody) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '');
  if (raw.length === 0 || raw.length > 32 * 1024) fail(413, 'apple_ownership_request_too_large');
  rejectDuplicateJsonKeys(raw.toString('utf8'));
  if (!exactKeys(parsedBody, ['idToken', 'appleAuth'])
      || !bounded(parsedBody.idToken, 100, 12_000)) {
    fail(400, 'invalid_apple_ownership_request');
  }
  const auth = parsedBody.appleAuth;
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    fail(400, 'invalid_apple_ownership_request');
  }
  if (Object.hasOwn(auth, 'version') && auth.version !== 2) {
    fail(400, 'apple_contract_version_unsupported');
  }
  if (auth.version !== 2 || !bounded(auth.operation, 6, 10)) {
    fail(400, 'invalid_apple_ownership_request');
  }
  if (auth.operation === 'acquire') {
    if (!exactKeys(auth, ['version', 'operation', 'requestId', 'authorizationCode'])) {
      fail(400, 'invalid_apple_ownership_request');
    }
    requireCanonicalId(auth.requestId, 'invalid_apple_request_id');
    if (!bounded(auth.authorizationCode, 1, 12_000)) {
      fail(400, 'invalid_apple_authorization_code');
    }
  } else if (auth.operation === 'status') {
    const byRequest = exactKeys(auth, ['version', 'operation', 'requestId']);
    const byReceipt = exactKeys(auth, ['version', 'operation', 'receipt']);
    if (byRequest) requireCanonicalId(auth.requestId, 'invalid_apple_request_id');
    else if (byReceipt) requireCanonicalId(auth.receipt, 'invalid_apple_receipt');
    else fail(400, 'invalid_apple_ownership_request');
  } else if (auth.operation === 'session') {
    if (!exactKeys(auth, ['version', 'operation', 'receipt', 'deliveryId'])) {
      fail(400, 'invalid_apple_ownership_request');
    }
    requireCanonicalId(auth.receipt, 'invalid_apple_receipt');
    requireCanonicalId(auth.deliveryId, 'invalid_apple_delivery_id');
  } else {
    fail(400, 'invalid_apple_ownership_operation');
  }
  return Object.freeze({ idToken: parsedBody.idToken, appleAuth: Object.freeze({ ...auth }) });
}

function profiles(configuration) {
  return Array.isArray(configuration?.profiles) && configuration.profiles.length > 0
    ? configuration.profiles
    : [configuration];
}

function currentProfile(configuration) {
  return profiles(configuration).find((entry) => entry.profileDigest === configuration.profileDigest)
    ?? configuration;
}

function resolveProfile(configuration, attempt, { materialKeyId } = {}) {
  return profiles(configuration).find((entry) => (
    entry.generation === attempt.profile_generation
      && entry.profileDigest === attempt.profile_digest
      && (!attempt.receipt_key_id || entry.receiptKeyId === attempt.receipt_key_id)
      && (!materialKeyId || entry.materialKeyId === materialKeyId)
  )) ?? null;
}

function digest(profile, domain, value) {
  return crypto.createHmac('sha256', profile.lookupKey)
    .update(`v2/${domain}\0${value}`, 'utf8').digest('hex');
}

function coordinationDigest(configuration, domain, value) {
  if (!Buffer.isBuffer(configuration?.coordinationKey)
      || configuration.coordinationKey.length !== 32) {
    fail(503, 'apple_ownership_coordination_unavailable');
  }
  return crypto.createHmac('sha256', configuration.coordinationKey)
    .update(`v2/coordination/${domain}\0${value}`, 'utf8').digest('hex');
}

function aad(profile, purpose, owner, id) {
  return Buffer.from(`v2\0${purpose}\0${profile.profileDigest}\0${owner}\0${id}`, 'utf8');
}

export function sealAppleOwnershipValue(value, key, keyId, associatedData) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || !bounded(value, 1, 12_000)) {
    fail(503, 'apple_ownership_crypto_unavailable');
  }
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v2.${keyId}.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function openAppleOwnershipValue(sealed, key, keyId, associatedData) {
  const [version, actualKeyId, nonceValue, tagValue, ciphertextValue, extra] = String(sealed ?? '').split('.');
  if (version !== 'v2' || actualKeyId !== keyId || extra !== undefined) {
    fail(503, 'apple_ownership_material_unreadable');
  }
  try {
    const nonce = Buffer.from(nonceValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    const ciphertext = Buffer.from(ciphertextValue, 'base64url');
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('invalid');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(associatedData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof AppleOwnershipError) throw error;
    fail(503, 'apple_ownership_material_unreadable');
  }
}

async function transaction(database, operation) {
  const client = typeof database.connect === 'function' ? await database.connect() : database;
  const releases = client !== database;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (releases) client.release();
  }
}

function bindingDigest(profile, identity, userId, attempt) {
  const attemptId = bounded(attempt?.id, 1, 100);
  const claimDeadline = new Date(attempt?.claim_deadline ?? attempt?.claimDeadline);
  const recoveryDeadline = new Date(attempt?.recovery_deadline ?? attempt?.recoveryDeadline);
  if (!attemptId || Number.isNaN(claimDeadline.valueOf()) || Number.isNaN(recoveryDeadline.valueOf())) {
    fail(503, 'apple_ownership_binding_unavailable');
  }
  return digest(profile, 'binding', [
    '2',
    userId,
    identity.subject,
    identity.firebaseUserId,
    profile.firebaseProjectId,
    profile.appleClientId,
    profile.redirectUri,
    profile.generation,
    profile.profileDigest,
    attemptId,
    claimDeadline.toISOString(),
    recoveryDeadline.toISOString(),
  ].join('\0'));
}

function assertFreshAppleIdentity(identity, configuration, now = Date.now()) {
  if (identity?.provider !== 'apple'
      || !bounded(identity.subject, 1, 180)
      || !bounded(identity.firebaseUserId, 1, 180)
      || !profiles(configuration).some((entry) => identity.firebaseProjectId === entry.firebaseProjectId)) {
    fail(401, 'invalid_social_token');
  }
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(identity.tokenIssuedAt)
      || !Number.isSafeInteger(identity.tokenExpiresAt)
      || !Number.isSafeInteger(identity.tokenAuthTime)
      || nowSeconds - identity.tokenIssuedAt > 60
      || identity.tokenIssuedAt > nowSeconds + 60
      || identity.tokenExpiresAt <= nowSeconds
      || nowSeconds - identity.tokenAuthTime > 15 * 60
      || identity.tokenAuthTime > nowSeconds + 60) {
    fail(401, 'invalid_social_token');
  }
}

async function enrollmentFor(client, identity, configuration, { lock = false } = {}) {
  const result = await client.query(
    `SELECT enrollment.*,
            enrollment.private_use_confirmed_at AS enrollment_private_use_confirmed_at,
            account.account_status, account.deactivated_at,
            account.terms_accepted_at, account.privacy_accepted_at,
            account.minimum_age_confirmed_at, account.private_use_confirmed_at,
            account.email, account.profile, account.role, account.email_verified_at,
            account.created_at, account.updated_at
       FROM apple_ownership_enrollments AS enrollment
       JOIN auth_identities AS identity ON identity.user_id = enrollment.user_id
         AND identity.provider = 'apple'
       JOIN users AS account ON account.id = enrollment.user_id
      WHERE identity.provider_subject = $1
        AND identity.firebase_user_id = $2
        AND enrollment.provider_subject = $1
        AND enrollment.firebase_user_id = $2
        AND enrollment.firebase_project_id = $3${lock ? ' FOR UPDATE OF enrollment, identity, account' : ''}`,
    [identity.subject, identity.firebaseUserId, identity.firebaseProjectId],
  );
  const enrollment = result.rows[0];
  if (!enrollment) fail(403, 'apple_ownership_not_eligible');
  if (enrollment.account_status !== 'active' || enrollment.deactivated_at
      || !enrollment.terms_accepted_at || !enrollment.privacy_accepted_at
      || !enrollment.minimum_age_confirmed_at || !enrollment.private_use_confirmed_at
      || !enrollment.enrollment_private_use_confirmed_at
      || !enrollment.web_test_cohort_enrolled_at
      || !configuration.webTestUserIds?.includes(enrollment.user_id)) {
    fail(403, 'apple_ownership_not_eligible');
  }
  return enrollment;
}

function projection(row, receipt) {
  return Object.freeze({
    appleAuth: Object.freeze({
      version: 2,
      receipt,
      state: publicStates[row.state] ?? 'unresolved',
      expiresAt: new Date(row.recovery_deadline).toISOString(),
    }),
  });
}

async function recoverExpired(client) {
  await client.query(
    `UPDATE apple_ownership_attempts
        SET state = CASE WHEN state = 'claimed' THEN 'closed' ELSE 'unknown' END,
            provider_error_code = CASE WHEN state = 'exchanging' THEN 'exchange_deadline_elapsed' ELSE provider_error_code END,
            updated_at = now()
      WHERE (state = 'claimed' AND claim_deadline <= now())
         OR (state = 'exchanging' AND claim_deadline <= now())`,
  );
}

async function reserveAttempt(database, { identity, auth, configuration }) {
  const profile = currentProfile(configuration);
  const requestDigest = coordinationDigest(configuration, 'request', auth.requestId);
  const codeFingerprint = coordinationDigest(
    configuration, 'authorization-code', auth.authorizationCode,
  );
  return transaction(database, async (client) => {
    await recoverExpired(client);
    for (const lock of [`request:${requestDigest}`, `code:${codeFingerprint}`].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
    }
    const enrollment = await enrollmentFor(client, identity, configuration, { lock: true });
    const existingRequest = await client.query(
      'SELECT * FROM apple_ownership_attempts WHERE request_digest=$1 FOR UPDATE',
      [requestDigest],
    );
    if (existingRequest.rowCount) {
      if (existingRequest.rowCount !== 1) fail(409, 'apple_ownership_request_conflict');
      const existing = existingRequest.rows[0];
      const existingProfile = resolveProfile(configuration, existing);
      if (!existingProfile) fail(503, 'apple_ownership_profile_unavailable');
      if (existing.user_id !== enrollment.user_id
          || existing.code_fingerprint !== coordinationDigest(
            configuration, 'authorization-code', auth.authorizationCode,
          )
          || existing.binding_digest !== bindingDigest(
            existingProfile, identity, enrollment.user_id, existing,
          )) {
        fail(409, 'apple_ownership_request_conflict');
      }
      if (new Date(existing.recovery_deadline) <= new Date()) {
        fail(410, 'apple_ownership_receipt_expired');
      }
      return {
        attempt: existing,
        profile: existingProfile,
        receipt: openAppleOwnershipValue(
          existing.encrypted_receipt,
          existingProfile.receiptKey,
          existing.receipt_key_id,
          aad(existingProfile, 'receipt', existing.user_id, existing.id),
        ),
      };
    }
    const codeOwner = await client.query(
      'SELECT request_digest FROM apple_ownership_attempts WHERE code_fingerprint=$1',
      [codeFingerprint],
    );
    if (codeOwner.rowCount) fail(409, 'apple_authorization_code_reused');
    const unresolved = await client.query(
      `SELECT 1 FROM apple_ownership_attempts
        WHERE user_id = $1 AND state IN ('exchanging', 'unknown', 'cleanup_required') LIMIT 1`,
      [enrollment.user_id],
    );
    if (unresolved.rowCount) fail(409, 'apple_ownership_unresolved');
    const attemptId = crypto.randomUUID();
    const claimedAt = new Date((await client.query(
      'SELECT clock_timestamp() AS claimed_at',
    )).rows[0].claimed_at);
    const claimDeadline = new Date(claimedAt.valueOf() + 120 * 1000);
    const recoveryDeadline = new Date(claimedAt.valueOf() + 15 * 60 * 1000);
    const binding = bindingDigest(profile, identity, enrollment.user_id, {
      id: attemptId,
      claimDeadline,
      recoveryDeadline,
    });
    const receipt = crypto.randomBytes(32).toString('base64url');
    const encryptedReceipt = sealAppleOwnershipValue(
      receipt,
      profile.receiptKey,
      profile.receiptKeyId,
      aad(profile, 'receipt', enrollment.user_id, attemptId),
    );
    const inserted = await client.query(
      `INSERT INTO apple_ownership_attempts (
         id, user_id, request_digest, receipt_digest, receipt_key_id, encrypted_receipt,
         code_fingerprint, binding_digest, profile_generation, profile_digest, state,
         claim_deadline, recovery_deadline, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'claimed',
                 $11,$12,$13)
       RETURNING *`,
      [attemptId, enrollment.user_id, requestDigest, digest(profile, 'receipt', receipt),
        profile.receiptKeyId, encryptedReceipt, codeFingerprint, binding,
        profile.generation, profile.profileDigest, claimDeadline, recoveryDeadline, claimedAt],
    );
    return { attempt: inserted.rows[0], profile, receipt };
  });
}

async function claimExchange(database, attemptId) {
  return transaction(database, async (client) => {
    const result = await client.query(
      `UPDATE apple_ownership_attempts
          SET state='exchanging', exchange_started_at=now(), updated_at=now()
        WHERE id=$1 AND state='claimed' AND claim_deadline > now()
        RETURNING *`,
      [attemptId],
    );
    if (result.rowCount) return { won: true, attempt: result.rows[0] };
    const current = await client.query('SELECT * FROM apple_ownership_attempts WHERE id=$1', [attemptId]);
    return { won: false, attempt: current.rows[0] };
  });
}

function providerError(error) {
  const value = typeof error?.code === 'string' ? error.code.trim().toLowerCase() : '';
  return /^[a-z0-9_-]{1,80}$/u.test(value) ? value : 'exchange_outcome_unknown';
}

async function markUnknown(database, attemptId, code) {
  await database.query(
    `UPDATE apple_ownership_attempts
        SET state='unknown', provider_error_code=$2, exchange_finished_at=now(), updated_at=now()
      WHERE id=$1 AND state='exchanging'`,
    [attemptId, code],
  );
}

async function persistMaterial(database, { attempt, refreshToken, identity, configuration }) {
  const profile = resolveProfile(configuration, attempt);
  if (!profile) fail(503, 'apple_ownership_profile_unavailable');
  const materialId = crypto.randomUUID();
  const ciphertext = sealAppleOwnershipValue(
    refreshToken,
    profile.materialKey,
    profile.materialKeyId,
    aad(profile, 'material', attempt.user_id, attempt.id),
  );
  await transaction(database, async (client) => {
    const locked = await client.query(
      'SELECT state, binding_digest FROM apple_ownership_attempts WHERE id=$1 FOR UPDATE',
      [attempt.id],
    );
    if (!locked.rowCount || !['exchanging', 'unknown'].includes(locked.rows[0].state)
        || locked.rows[0].binding_digest !== attempt.binding_digest) {
      fail(409, 'apple_ownership_late_material_conflict');
    }
    await client.query(
      `INSERT INTO apple_ownership_materials (
         id, attempt_id, user_id, material_kind, material_key_id,
         material_ciphertext, binding_digest, state
       ) VALUES ($1,$2,$3,'refresh_token',$4,$5,$6,'cleanup_pending')
       ON CONFLICT (attempt_id) DO NOTHING`,
      [materialId, attempt.id, attempt.user_id, profile.materialKeyId,
        ciphertext, attempt.binding_digest],
    );
  });
  try {
    return await transaction(database, async (client) => {
      await enrollmentFor(client, identity, configuration, { lock: true });
      const material = await client.query(
        `UPDATE apple_ownership_materials
            SET state='active', updated_at=now()
          WHERE attempt_id=$1 AND user_id=$2 AND binding_digest=$3 AND state='cleanup_pending'
          RETURNING id`,
        [attempt.id, attempt.user_id, attempt.binding_digest],
      );
      if (material.rowCount !== 1) fail(409, 'apple_ownership_material_conflict');
      const completed = await client.query(
        `UPDATE apple_ownership_attempts
            SET state='committed', exchange_finished_at=now(), provider_error_code=NULL, updated_at=now()
          WHERE id=$1 AND state='exchanging' AND binding_digest=$2
          RETURNING *`,
        [attempt.id, attempt.binding_digest],
      );
      if (completed.rowCount !== 1) fail(409, 'apple_ownership_late_material_conflict');
      return completed.rows[0];
    });
  } catch (error) {
    await database.query(
      `UPDATE apple_ownership_attempts SET state='cleanup_required', updated_at=now()
        WHERE id=$1 AND state IN ('exchanging','unknown')`,
      [attempt.id],
    );
    throw error;
  }
}

export async function acquireAppleOwnership({
  database,
  identity,
  appleAuth,
  configuration,
  provider,
}) {
  requireConfiguration(configuration, { acquisition: true });
  assertFreshAppleIdentity(identity, configuration);
  const reserved = await reserveAttempt(database, { identity, auth: appleAuth, configuration });
  const claim = await claimExchange(database, reserved.attempt.id);
  if (!claim.won) return projection(claim.attempt, reserved.receipt);
  const exchangeProvider = typeof provider?.forProfile === 'function'
    ? provider.forProfile(reserved.profile)
    : (reserved.profile?.profileDigest === configuration.profileDigest ? provider : null);
  if (!exchangeProvider || typeof exchangeProvider.exchangeAuthorizationCode !== 'function') {
    await markUnknown(database, claim.attempt.id, 'apple_ownership_provider_unavailable');
    fail(503, 'apple_ownership_provider_unavailable');
  }
  let refreshToken;
  try {
    refreshToken = await exchangeProvider.exchangeAuthorizationCode({
      code: appleAuth.authorizationCode,
      expectedSubject: identity.subject,
    });
    if (!bounded(refreshToken, 8, 12_000)) throw new Error('invalid_provider_material');
  } catch (error) {
    await markUnknown(database, claim.attempt.id, providerError(error));
    fail(503, 'apple_ownership_exchange_unresolved');
  }
  const completed = await persistMaterial(database, {
    attempt: claim.attempt,
    refreshToken,
    identity,
    configuration,
  });
  refreshToken = null;
  return projection(completed, reserved.receipt);
}

async function locateAttempt(client, appleAuth, configuration, { lock = false } = {}) {
  const domain = appleAuth.requestId ? 'request' : 'receipt';
  const value = appleAuth.requestId ?? appleAuth.receipt;
  const lookup = appleAuth.requestId ? 'request_digest' : 'receipt_digest';
  const lookupDigests = appleAuth.requestId
    ? [coordinationDigest(configuration, domain, value)]
    : profiles(configuration).map((profile) => digest(profile, domain, value));
  const result = await client.query(
    `SELECT * FROM apple_ownership_attempts WHERE ${lookup}=ANY($1::text[])${lock ? ' FOR UPDATE' : ''}`,
    [lookupDigests],
  );
  if (result.rowCount !== 1) fail(404, 'apple_attempt_unavailable');
  const attempt = result.rows[0];
  const profile = resolveProfile(configuration, attempt);
  if (!profile) fail(404, 'apple_attempt_unavailable');
  return { attempt, profile };
}

async function verifyAttemptOwner(client, attempt, profile, identity, configuration, { lock = false } = {}) {
  const principal = await client.query(
    `SELECT user_id FROM auth_identities
      WHERE provider='apple' AND provider_subject=$1 AND firebase_user_id=$2`,
    [identity.subject, identity.firebaseUserId],
  );
  if (principal.rowCount !== 1 || principal.rows[0].user_id !== attempt.user_id) {
    fail(404, 'apple_attempt_unavailable');
  }
  const enrollment = await enrollmentFor(client, identity, configuration, { lock });
  if (attempt.binding_digest !== bindingDigest(profile, identity, enrollment.user_id, attempt)) {
    fail(404, 'apple_attempt_unavailable');
  }
  return enrollment;
}

function attemptReceipt(attempt, profile) {
  return openAppleOwnershipValue(
    attempt.encrypted_receipt,
    profile.receiptKey,
    attempt.receipt_key_id,
    aad(profile, 'receipt', attempt.user_id, attempt.id),
  );
}

export async function readAppleOwnershipStatus({ database, identity, appleAuth, configuration }) {
  requireConfiguration(configuration);
  assertFreshAppleIdentity(identity, configuration);
  return transaction(database, async (client) => {
    await recoverExpired(client);
    const located = await locateAttempt(client, appleAuth, configuration, { lock: true });
    const { attempt, profile } = located;
    if (new Date(attempt.recovery_deadline) <= new Date()) {
      fail(404, 'apple_attempt_unavailable');
    }
    await verifyAttemptOwner(client, attempt, profile, identity, configuration, { lock: true });
    const counted = await client.query(
      `UPDATE apple_ownership_attempts
          SET status_window_started_at = CASE
                WHEN status_window_started_at IS NULL OR status_window_started_at <= now() - interval '1 minute'
                  THEN now() ELSE status_window_started_at END,
              status_window_count = CASE
                WHEN status_window_started_at IS NULL OR status_window_started_at <= now() - interval '1 minute'
                  THEN 1 ELSE status_window_count + 1 END,
              updated_at=now()
        WHERE id=$1 AND (
          status_window_started_at IS NULL OR status_window_started_at <= now() - interval '1 minute'
          OR status_window_count < 30
        ) RETURNING *`,
      [attempt.id],
    );
    if (!counted.rowCount) fail(429, 'apple_ownership_status_rate_limited');
    return projection(counted.rows[0], attemptReceipt(attempt, profile));
  });
}

export async function deliverAppleOwnershipSession({
  database,
  identity,
  appleAuth,
  configuration,
  deliver,
}) {
  requireConfiguration(configuration, { acquisition: true });
  assertFreshAppleIdentity(identity, configuration);
  if (typeof deliver !== 'function') fail(503, 'apple_ownership_delivery_unavailable');
  return transaction(database, async (client) => {
    await recoverExpired(client);
    const { attempt, profile } = await locateAttempt(client, appleAuth, configuration, { lock: true });
    if (new Date(attempt.recovery_deadline) <= new Date()) fail(404, 'apple_attempt_unavailable');
    const enrollment = await verifyAttemptOwner(
      client, attempt, profile, identity, configuration, { lock: true },
    );
    if (attempt.state !== 'committed') {
      fail(409, attempt.state === 'unknown' ? 'apple_ownership_unresolved' : 'apple_ownership_not_ready');
    }
    const material = await client.query(
      `SELECT id FROM apple_ownership_materials
        WHERE attempt_id=$1 AND user_id=$2 AND state='active' FOR UPDATE`,
      [attempt.id, enrollment.user_id],
    );
    if (material.rowCount !== 1) fail(409, 'apple_ownership_cleanup_required');
    const deliveryDigest = digest(profile, 'delivery', appleAuth.deliveryId);
    const duplicate = await client.query(
      'SELECT 1 FROM apple_ownership_deliveries WHERE attempt_id=$1 AND delivery_digest=$2',
      [attempt.id, deliveryDigest],
    );
    if (duplicate.rowCount) fail(409, 'apple_session_delivery_uncertain');
    const previous = await client.query(
      `SELECT * FROM apple_ownership_deliveries
        WHERE attempt_id=$1 ORDER BY generation DESC FOR UPDATE`,
      [attempt.id],
    );
    const generation = previous.rowCount + 1;
    if (generation > 3) fail(409, 'apple_session_delivery_exhausted');
    for (const row of previous.rows.filter((entry) => !entry.superseded_at)) {
      if (row.session_id) {
        await client.query(
          `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),
             revoked_reason=COALESCE(revoked_reason,'apple_delivery_superseded')
           WHERE id=$1`, [row.session_id],
        );
        await client.query(
          `UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()),
             revoked_reason=COALESCE(revoked_reason,'apple_delivery_superseded')
           WHERE session_id=$1`, [row.session_id],
        );
      }
      if (row.mfa_challenge_id) {
        await client.query(
          'UPDATE auth_mfa_challenges SET consumed_at=COALESCE(consumed_at,now()) WHERE id=$1',
          [row.mfa_challenge_id],
        );
      }
    }
    await client.query(
      `UPDATE apple_ownership_deliveries SET superseded_at=COALESCE(superseded_at,now())
        WHERE attempt_id=$1 AND superseded_at IS NULL`,
      [attempt.id],
    );
    const deliveryId = crypto.randomUUID();
    await client.query(
      `INSERT INTO apple_ownership_deliveries
       (id,attempt_id,user_id,delivery_digest,generation,outcome)
       VALUES ($1,$2,$3,$4,$5,'pending')`,
      [deliveryId, attempt.id, enrollment.user_id, deliveryDigest, generation],
    );
    const result = await deliver({ client, user: enrollment, attemptId: attempt.id });
    if (result?.kind === 'session' && result.session?.sessionId) {
      await client.query(
        `UPDATE apple_ownership_deliveries
            SET outcome='session',session_id=$2,completed_at=now()
          WHERE id=$1 AND outcome='pending'`,
        [deliveryId, result.session.sessionId],
      );
      return Object.freeze({ ...projection(attempt, attemptReceipt(attempt, profile)), kind: 'session', session: result.session });
    }
    if (result?.kind === 'mfa' && result.challenge?.challengeId) {
      await client.query(
        `UPDATE apple_ownership_deliveries
            SET outcome='mfa',mfa_challenge_id=$2,completed_at=now()
          WHERE id=$1 AND outcome='pending'`,
        [deliveryId, result.challenge.challengeId],
      );
      return Object.freeze({ ...projection(attempt, attemptReceipt(attempt, profile)), kind: 'mfa', challenge: result.challenge });
    }
    fail(503, 'apple_ownership_delivery_unavailable');
  });
}

export async function assertLegacyAppleOwnershipAllowed(database, identity) {
  if (identity?.provider !== 'apple') return;
  const result = await database.query(
    `SELECT 1 FROM apple_ownership_enrollments AS enrollment
      JOIN auth_identities AS linked ON linked.user_id=enrollment.user_id
     WHERE linked.provider='apple' AND linked.provider_subject=$1 LIMIT 1`,
    [identity.subject],
  );
  if (result.rowCount) fail(426, 'apple_ownership_upgrade_required');
}

export async function prepareAppleOwnershipAccountDeletion(client, { userId }) {
  await client.query(
    `UPDATE apple_ownership_deliveries SET superseded_at=COALESCE(superseded_at,now())
      WHERE user_id=$1`,
    [userId],
  );
  const moved = await client.query(
    `UPDATE apple_ownership_materials SET state='cleanup_pending',updated_at=now()
      WHERE user_id=$1 AND state='active' RETURNING id`,
    [userId],
  );
  await client.query(
    `UPDATE apple_ownership_attempts AS attempt SET state='cleanup_required',updated_at=now()
      WHERE attempt.user_id=$1 AND attempt.state='committed'
        AND EXISTS (SELECT 1 FROM apple_ownership_materials material
          WHERE material.attempt_id=attempt.id AND material.state IN ('cleanup_pending','revoking','cleanup_unknown'))`,
    [userId],
  );
  const obligations = await client.query(
    `SELECT count(*)::int AS count FROM apple_ownership_attempts
      WHERE user_id=$1 AND state IN ('claimed','exchanging','unknown','cleanup_required')`,
    [userId],
  );
  return Object.freeze({ queued: moved.rowCount, unresolved: obligations.rows[0].count });
}

export async function completeAppleMfaDelivery(client, { challengeId, sessionId, configuration }) {
  if (!challengeId || !sessionId) return { linked: false };
  const result = await client.query(
    `UPDATE apple_ownership_deliveries AS delivery
        SET outcome='session',session_id=$2,completed_at=now()
      WHERE delivery.mfa_challenge_id=$1 AND delivery.outcome='mfa'
        AND delivery.superseded_at IS NULL
      RETURNING delivery.attempt_id`,
    [challengeId, sessionId],
  );
  if (result.rowCount) {
    requireConfiguration(configuration);
    const attempt = (await client.query(
      'SELECT * FROM apple_ownership_attempts WHERE id=$1 FOR UPDATE',
      [result.rows[0].attempt_id],
    )).rows[0];
    const profile = attempt && resolveProfile(configuration, attempt);
    if (!attempt || !profile || new Date(attempt.recovery_deadline) <= new Date()) {
      fail(409, 'apple_session_delivery_uncertain');
    }
    return { linked: true, ...projection(attempt, attemptReceipt(attempt, profile)) };
  }
  const known = await client.query(
    'SELECT superseded_at FROM apple_ownership_deliveries WHERE mfa_challenge_id=$1',
    [challengeId],
  );
  if (known.rowCount) fail(409, 'apple_delivery_superseded');
  return { linked: false };
}

export async function drainAppleOwnershipCleanup({
  database,
  configuration,
  provider,
  limit = 20,
} = {}) {
  if (!configuration?.configured || !provider) {
    return { revoked: 0, unresolved: 0 };
  }
  let revoked = 0;
  let unresolved = 0;
  for (let index = 0; index < limit; index += 1) {
    const claimed = await transaction(database, async (client) => {
      const result = await client.query(
        `UPDATE apple_ownership_materials AS material
            SET state='revoking',updated_at=now()
          WHERE material.id=(SELECT candidate.id FROM apple_ownership_materials candidate
            WHERE candidate.state='cleanup_pending' ORDER BY candidate.updated_at
            FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING material.*,
            (SELECT attempt.profile_generation FROM apple_ownership_attempts attempt
              WHERE attempt.id=material.attempt_id) AS profile_generation,
            (SELECT attempt.profile_digest FROM apple_ownership_attempts attempt
              WHERE attempt.id=material.attempt_id) AS profile_digest,
            (SELECT attempt.receipt_key_id FROM apple_ownership_attempts attempt
              WHERE attempt.id=material.attempt_id) AS receipt_key_id`,
      );
      return result.rows[0] ?? null;
    });
    if (!claimed) break;
    let value;
    try {
      const profile = resolveProfile(configuration, claimed, {
        materialKeyId: claimed.material_key_id,
      });
      const profileProvider = typeof provider.forProfile === 'function'
        ? provider.forProfile(profile)
        : (profile?.profileDigest === configuration.profileDigest ? provider : null);
      if (!profile || !profileProvider || typeof profileProvider.revoke !== 'function') {
        fail(503, 'apple_ownership_profile_unavailable');
      }
      value = openAppleOwnershipValue(
        claimed.material_ciphertext,
        profile.materialKey,
        claimed.material_key_id,
        aad(profile, 'material', claimed.user_id, claimed.attempt_id),
      );
      await profileProvider.revoke({
        kind: claimed.material_kind,
        value,
        operationKey: `sit_apple_ownership_revoke_${claimed.id}`,
      });
      await transaction(database, async (client) => {
        await client.query(
          `UPDATE apple_ownership_materials
              SET state='revoked',material_ciphertext=NULL,revoked_at=now(),updated_at=now(),cleanup_error_code=NULL
            WHERE id=$1 AND state='revoking'`, [claimed.id],
        );
        await client.query(
          `UPDATE apple_ownership_attempts SET state='closed',updated_at=now()
            WHERE id=$1 AND state='cleanup_required'
              AND NOT EXISTS (SELECT 1 FROM apple_ownership_materials
                WHERE attempt_id=$1 AND state<>'revoked')`, [claimed.attempt_id],
        );
      });
      revoked += 1;
    } catch (error) {
      await database.query(
        `UPDATE apple_ownership_materials
            SET state='cleanup_unknown',cleanup_error_code=$2,updated_at=now()
          WHERE id=$1 AND state='revoking'`,
        [claimed.id, providerError(error)],
      );
      await database.query(
        `UPDATE apple_ownership_attempts SET state='cleanup_required',updated_at=now()
          WHERE id=$1 AND state<>'closed'`, [claimed.attempt_id],
      );
      unresolved += 1;
    } finally {
      value = null;
    }
  }
  return { revoked, unresolved };
}

export function startAppleOwnershipCleanupWorker({
  database,
  configuration,
  provider,
  intervalMs = 5 * 60 * 1000,
  onError = (error) => console.error('[privacy] Apple ownership cleanup failed', providerError(error)),
} = {}) {
  if (!configuration?.configured) return () => {};
  const run = () => void drainAppleOwnershipCleanup({ database, configuration, provider }).catch(onError);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export const appleOwnershipInternals = Object.freeze({
  digest,
  coordinationDigest,
  bindingDigest,
  publicStates,
});
