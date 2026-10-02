// Dedicated insert-only seed. Never reuses or edits an existing pilot principal.
import crypto from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, writeFileSync, fsyncSync, lstatSync, readFileSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPasswordFile } from './provision_synthetic_sandbox_user.mjs';
import { readStablePrivateFile, writeExclusivePrivateFile } from './stable_private_file.mjs';
import { fixtureDigest, fixtureEnvironmentDigest, fixtureNotice, fixtureTarget, validateFixtureManifest,
  validateFixtureDatabase, validateFixtureEffectBoundary, validateFixturePhotoContent, readFixtureSnapshot,
  validateFixtureSnapshot } from './staging_web_fixture_preflight.mjs';
import { readStagingAccessConfiguration } from '../src/staging_access_gate.js';
import { readAdapterDependencies } from './staging_web_fixture_adapter.mjs';

export const dedicatedFixture = Object.freeze({
  owner: 'synthetic_web_catalog_owner_v1', renter: 'synthetic_web_catalog_renter_v1',
  listing: 'synthetic_web_catalog_listing_v1', upload: 'synthetic_web_catalog_placeholder_v1.webp',
  uploadId: '6b61b134-9576-44b4-a503-1e1707d633af', purpose: 'noncontractual_web_catalog_only_v1',
});
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const passwordBindingPattern = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/u;
const check = (v, code) => { if (!v) throw Object.assign(Error(code), { code }); };
const ids = [dedicatedFixture.owner, dedicatedFixture.renter];
const emails = ids.map((id) => `${id}@example.invalid`);
const digest = (manifest) => fixtureDigest({ sourceCommit: manifest.sourceCommit, sourceHashes: manifest.sourceHashes,
  runId: manifest.preflight.runId, photo: manifest.preflight.photo, scope: dedicatedFixture });

export function hashFixturePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200
    || !/\p{L}/u.test(password) || !/\d/u.test(password)) throw new Error('Invalid password');
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export function verifyFixturePassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const match = passwordBindingPattern.exec(encoded);
  if (!match) return false;
  const [, saltHex, hashHex] = match;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function buildFixtureBootstrapManifest({ source, environment, photo, passwords, runId, now = new Date() }) {
  const url = new URL(environment.DATABASE_URL);
  return { kind: 'sit-dedicated-web-fixture-bootstrap', schemaVersion: 2, operation: 'seed',
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: 104, ledgerDigest: source.ledgerDigest,
    passwordDigests: passwords.map(hashFixturePassword), preflight: { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1,
      target: fixtureTarget, createdAt: now.toISOString(), runId, runtimeCommit: environment.APP_COMMIT,
      environmentDigest: fixtureEnvironmentDigest(environment), snapshotDigest: '0'.repeat(64),
      availabilityDigest: fixtureDigest({ rules: [], blocks: [] }),
      database: { host: url.hostname, name: url.pathname.slice(1), user: decodeURIComponent(url.username) },
      roles: ids.map((userId, i) => ({ role: i ? 'renter' : 'owner', userId, syntheticMarker: runId })),
      listingId: dedicatedFixture.listing, uploadName: dedicatedFixture.upload, region: 'heilbronn',
      fixtureClass: 'synthetic_noncontractual_catalog_only', notice: fixtureNotice,
      realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
      photo: { ...photo, file: '/run/sit-fixture-input/photo.webp' } } };
}

export function readBootstrapPasswords(directory, options) {
  return ['owner.password', 'renter.password'].map((name) => readPasswordFile(resolve(directory, name), options));
}

export function validateFixtureBootstrap({ manifest: m, source, environment, passwords, execute = false,
  confirmSource, confirmRun, now, rehearsal }) {
  check(m?.kind === 'sit-dedicated-web-fixture-bootstrap' && m.schemaVersion === 2
    && ['seed', 'cleanup'].includes(m.operation), 'fixture_bootstrap_manifest_invalid');
  check(m.sourceCommit === source.commit && fixtureDigest(m.sourceHashes) === fixtureDigest(source.hashes)
    && source.schemaCount === 104 && m.schemaCount === 104 && m.ledgerDigest === source.ledgerDigest, 'fixture_bootstrap_source_drift');
  validateFixtureManifest(m.preflight, now, rehearsal);
  validateFixtureEffectBoundary(environment); validateFixtureDatabase(m.preflight, environment, rehearsal);
  check(['test', 'staging'].includes(environment.DEPLOYMENT_ENVIRONMENT) && environment.APP_COMMIT === m.preflight.runtimeCommit
    && fixtureEnvironmentDigest(environment) === m.preflight.environmentDigest, 'fixture_bootstrap_runtime_drift');
  const gate = readStagingAccessConfiguration(environment);
  check(gate.enabled && gate.valid && gate.publicListingConfigurationValid && gate.publicUploadConfigurationValid,
    'fixture_bootstrap_access_invalid');
  check(m.preflight.listingId === dedicatedFixture.listing && m.preflight.uploadName === dedicatedFixture.upload
    && fixtureDigest(m.preflight.roles) === fixtureDigest(ids.map((userId, i) => ({ userId, role: i ? 'renter' : 'owner', syntheticMarker: m.preflight.runId })))
    && m.preflight.photo.classification === 'synthetic_programmatic_placeholder'
    && m.preflight.photo.file === '/run/sit-fixture-input/photo.webp', 'fixture_bootstrap_scope_invalid');
  check(passwords?.length === 2 && passwords[0] !== passwords[1] && passwords.every((p) => typeof p === 'string'
    && p.length >= 32 && p.length <= 200 && !/\s/u.test(p) && /[A-Za-z]/u.test(p) && /[0-9]/u.test(p))
    && m.passwordDigests?.length === 2
    && passwords.every((password, index) => verifyFixturePassword(password, m.passwordDigests[index])),
  'fixture_bootstrap_password_binding');
  check(!environment.SIT_WEB_FIXTURE_EXECUTE && !environment.SIT_WEB_FIXTURE_CONFIRM
    && (execute === false ? confirmSource === undefined && confirmRun === undefined
      : execute === true && confirmSource === source.commit && confirmRun === m.preflight.runId), 'fixture_bootstrap_confirmation');
}

export function fixtureBootstrapHandoff(manifest, environment) {
  const gate = readStagingAccessConfiguration(environment);
  return { activationAllowed: false, expectedEnvironmentDigest: fixtureEnvironmentDigest(environment),
    proposed: { SIT_STAGING_ALLOWED_USER_IDS: [...ids, ...gate.allowedUserIds.filter((id) => !ids.includes(id))].join(','),
      SIT_STAGING_PUBLIC_LISTING_IDS: dedicatedFixture.listing, SIT_STAGING_PUBLIC_UPLOAD_NAMES: dedicatedFixture.upload,
      SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'false' },
    next: 'Separately reviewed runtime gate update, then fresh dedicated draft and adapter preflight; no publication or activation claim.' };
}

// Private persistent ownership receipt makes interrupted exact-file creation
// recoverable. No overwrite/rename, and never remove bytes/inodes we cannot own.
export function bootstrapFileStore(directory, manifest, { fault = () => {} } = {}) {
  const root = lstatSync(directory);
  check(resolve(directory) === directory && realpathSync(directory) === directory && root.isDirectory()
    && root.uid === process.getuid() && root.gid === process.getgid() && (root.mode & 0o002) === 0, 'fixture_bootstrap_media_root');
  const file = resolve(directory, dedicatedFixture.upload);
  const receipt = resolve(directory, '.sit-web-fixture-bootstrap.json');
  const scope = digest(manifest); const expected = manifest.preflight.photo;
  const stat = (path) => { try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const inspect = () => {
    const data = stat(file); const mark = stat(receipt);
    if (!data && !mark) return 'absent';
    if (!data && mark) {
      const saved = JSON.parse(readStablePrivateFile(receipt, { expectedUid: process.getuid(), expectedMode: 0o600 }));
      check(saved.scope === scope && saved.sha256 === expected.sha256 && Number.isInteger(saved.ino) && Number.isInteger(saved.dev),
        'fixture_bootstrap_file_collision');
      return 'receipt-only';
    }
    check(data && mark && data.isFile() && !data.isSymbolicLink() && data.uid === process.getuid()
      && (data.mode & 0o022) === 0, 'fixture_bootstrap_file_collision');
    const saved = JSON.parse(readStablePrivateFile(receipt, { expectedUid: process.getuid(), expectedMode: 0o600 }));
    check(saved.scope === scope && saved.ino === data.ino && saved.dev === data.dev
      && saved.sha256 === expected.sha256 && hash(readFileSync(file)) === expected.sha256 && data.size === expected.byteSize,
    'fixture_bootstrap_file_collision');
    return 'owned';
  };
  const remove = () => { const state = inspect(); if (state === 'absent') return; fault('before_remove');
    if (state === 'owned') unlinkSync(file); fault('after_file_remove'); unlinkSync(receipt); fault('after_remove'); };
  const create = (bytes) => {
    if (inspect() === 'owned') return false;
    check(inspect() === 'absent', 'fixture_bootstrap_file_recovery_required');
    let fd; let own; let receiptCreated = false;
    try {
      fault('before_create'); fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o640);
      own = fstatSync(fd); fault('after_create'); writeFileSync(fd, bytes); fsyncSync(fd); fault('after_write');
      writeExclusivePrivateFile(receipt, Buffer.from(JSON.stringify({ scope, ino: own.ino, dev: own.dev, sha256: expected.sha256 })), { mode: 0o600 });
      receiptCreated = true; fault('after_receipt'); check(inspect() === 'owned', 'fixture_bootstrap_file_readback'); return true;
    } catch (error) {
      if (own) {
        const current = stat(file);
        check(current?.ino === own.ino && current?.dev === own.dev && !current.isSymbolicLink(), 'fixture_bootstrap_file_recovery_required');
        const actual = readFileSync(file);
        check(actual.length <= bytes.length && actual.equals(bytes.subarray(0, actual.length)), 'fixture_bootstrap_file_recovery_required');
        unlinkSync(file); if (receiptCreated) unlinkSync(receipt);
      }
      throw error;
    } finally { if (fd !== undefined) closeSync(fd); }
  };
  return { inspect, create, remove };
}

async function audit(client, m, phase, metadata) {
  await client.query(`INSERT INTO audit_log (actor_role,action,resource_type,resource_id,request_id,metadata)
    VALUES ('system',$1,'staging_web_fixture_seed',$2,$3,$4::jsonb)`,
  [`staging_web_fixture_seed.${phase}`, dedicatedFixture.listing, m.preflight.runId, JSON.stringify(metadata)]);
}
const profile = (m, i) => ({ displayName: `Synthetic catalog ${i ? 'renter' : 'owner'}`, syntheticOnly: true,
  syntheticMarker: m.preflight.runId, syntheticPurpose: dedicatedFixture.purpose, emailVerified: true,
  legalAcknowledgements: { terms: true, privacy: true, minimumAge: true, privateUse: true },
  testOnlyNotice: fixtureNotice, bootstrapScope: digest(m) });
const noDependencies = (counts) => check(Object.values(counts).every((n) => n === 0), 'fixture_bootstrap_dependencies_present');
async function lockDedicatedRoots(client) {
  await client.query('SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [ids]);
  await client.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [dedicatedFixture.listing]);
  await client.query('SELECT id FROM uploads WHERE storage_name=$1 FOR UPDATE', [dedicatedFixture.upload]);
}

export async function runFixtureBootstrap(input) {
  validateFixtureBootstrap(input);
  const { manifest: m, client, source, environment, photoBytes, passwords, files, execute = false } = input;
  await validateFixturePhotoContent(m.preflight.photo, photoBytes);
  check((await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', ['sit-dedicated-web-fixture-bootstrap-v1'])).rows[0]?.locked,
    'fixture_bootstrap_concurrent');
  let created = false; let committing = false; let seedCommitted = false;
  const response = (status) => ({ status, runtimeActivated: false });
  try {
    await client.query(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE${execute ? '' : ' READ ONLY'}`);
    await client.query("SET LOCAL statement_timeout='5s'"); await client.query("SET LOCAL lock_timeout='2s'");
    const ledger = (await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    check(ledger.length === 104 && fixtureDigest(ledger) === source.ledgerDigest, 'fixture_bootstrap_schema_drift');
    if (execute) await lockDedicatedRoots(client);
    const snapshot = await readFixtureSnapshot(client, m.preflight, { withinTransaction: true });
    const collisions = (await client.query(`SELECT id FROM users WHERE email=ANY($1::text[]) AND NOT(id=ANY($2::text[]))
      UNION ALL SELECT id::text FROM uploads WHERE id=$3::uuid AND storage_name<>$4`, [emails, ids, dedicatedFixture.uploadId, dedicatedFixture.upload])).rows;
    check(collisions.length === 0, 'fixture_bootstrap_collision');
    const events = (await client.query(`SELECT action,metadata FROM audit_log
      WHERE resource_type='staging_web_fixture_seed' AND resource_id=$1 ORDER BY id`, [dedicatedFixture.listing])).rows;
    check(events.every((e) => e.metadata.scope === digest(m)), 'fixture_bootstrap_scope_collision');
    check(events.length <= 3 && events.every((e, i) => e.action === `staging_web_fixture_seed.${['seeded', 'hidden', 'cleaned'][i]}`),
      'fixture_bootstrap_audit_ambiguous');
    const seeded = events.find((e) => e.action === 'staging_web_fixture_seed.seeded');
    const empty = snapshot.users.length === 0 && snapshot.listing.length === 0 && snapshot.upload.length === 0;
    let state = files.inspect();
    if (m.operation === 'cleanup') {
      check(seeded && events.filter((e) => e.action === 'staging_web_fixture_seed.seeded').length === 1, 'fixture_bootstrap_cleanup_unowned');
      if (empty) {
        check(events.some((e) => e.action === 'staging_web_fixture_seed.cleaned'), 'fixture_bootstrap_partial_state');
        await client.query('ROLLBACK'); if (execute) files.remove(); return response(execute ? 'dedicated-seed-cleaned' : 'preflight-passed-no-mutation');
      }
      check(snapshot.users.length === 2 && snapshot.users.every((u, i) => ids.includes(u.id) && u.email === `${u.id}@example.invalid`
        && u.phone_e164 === null && fixtureDigest(u.profile) === fixtureDigest(profile(m, ids.indexOf(u.id))))
        && snapshot.listing[0]?.owner_id === dedicatedFixture.owner && snapshot.upload[0]?.id === dedicatedFixture.uploadId,
      'fixture_bootstrap_cleanup_foreign');
      if (!execute) { await client.query('ROLLBACK'); return response('preflight-passed-no-mutation'); }
      const previousHidden = events.filter((e) => e.action === 'staging_web_fixture_seed.hidden');
      check(previousHidden.length <= 1, 'fixture_bootstrap_partial_state');
      const pristine = previousHidden.length ? previousHidden[0].metadata.pristine
        : fixtureDigest(snapshot) === seeded.metadata.snapshotHash;
      let hiddenHash = previousHidden[0]?.metadata.afterHash;
      if (previousHidden.length) {
        check(fixtureDigest(snapshot) === previousHidden[0].metadata.afterHash, 'fixture_bootstrap_cleanup_foreign');
        await client.query('ROLLBACK');
      } else {
      await client.query("UPDATE listings SET is_active=false,status='paused',payload=payload||'{\"isActive\":false,\"status\":\"paused\"}'::jsonb WHERE id=$1", [dedicatedFixture.listing]);
      await client.query("UPDATE users SET password_hash=NULL,password_changed_at=now() WHERE id=ANY($1::text[])", [ids]);
      await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason=COALESCE(revoked_reason,'fixture_seed_cleanup') WHERE user_id=ANY($1::text[])", [ids]);
      await client.query("UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()),revoked_reason=COALESCE(revoked_reason,'fixture_seed_cleanup') WHERE user_id=ANY($1::text[])", [ids]);
      const checkpoint = await readFixtureSnapshot(client, m.preflight, { withinTransaction: true });
      hiddenHash = fixtureDigest(checkpoint);
      await audit(client, m, 'hidden', { scope: digest(m), pristine, afterHash: hiddenHash });
      committing = true; await client.query('COMMIT'); committing = false;
      }
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await lockDedicatedRoots(client);
      const hidden = await readFixtureSnapshot(client, m.preflight, { withinTransaction: true });
      check(fixtureDigest(hidden) === hiddenHash, 'fixture_bootstrap_cleanup_foreign');
      noDependencies(await readAdapterDependencies(client, m.preflight, hidden));
      const used = (await client.query(`SELECT (SELECT count(*) FROM refresh_tokens WHERE user_id=ANY($1::text[]))::int AS refresh,
        (SELECT count(*) FROM audit_log WHERE actor_id=ANY($1::text[]))::int AS activity`, [ids])).rows[0];
      check(pristine && hidden.sessions.length === 0 && hidden.identities.length === 0 && hidden.push.length === 0
        && used.refresh === 0 && used.activity === 0 && hidden.rules.length === 0 && hidden.blocks.length === 0,
      'fixture_bootstrap_used_seed_retained_hidden');
      check(state === 'owned', 'fixture_bootstrap_file_collision');
      await client.query('DELETE FROM uploads WHERE id=$1 AND owner_id=$2', [dedicatedFixture.uploadId, dedicatedFixture.owner]);
      await client.query('DELETE FROM listings WHERE id=$1 AND owner_id=$2', [dedicatedFixture.listing, dedicatedFixture.owner]);
      await client.query('DELETE FROM users WHERE id=ANY($1::text[])', [ids]);
      await audit(client, m, 'cleaned', { scope: digest(m) });
      committing = true; await client.query('COMMIT'); committing = false; files.remove();
      return response('dedicated-seed-cleaned');
    }
    if (!empty) {
      check(seeded && events.length === 1 && state === 'owned' && fixtureDigest(snapshot) === seeded.metadata.snapshotHash,
        'fixture_bootstrap_existing_not_exact');
      noDependencies(await readAdapterDependencies(client, m.preflight, snapshot));
      const refresh = (await client.query('SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id=ANY($1::text[])', [ids])).rows[0]?.count;
      check(refresh === 0 && snapshot.sessions.length === 0 && snapshot.identities.length === 0 && snapshot.push.length === 0,
        'fixture_bootstrap_used_seed');
      const hashes = (await client.query('SELECT id,password_hash FROM users WHERE id=ANY($1::text[])', [ids])).rows;
      for (let i = 0; i < ids.length; i++) check(await verifyFixturePassword(passwords[i], hashes.find((r) => r.id === ids[i])?.password_hash), 'fixture_bootstrap_password_drift');
      await client.query('ROLLBACK'); return response('dedicated-seed-already-prepared-runtime-blocked');
    }
    check(events.length === 0, 'fixture_bootstrap_run_retired');
    if (state === 'receipt-only' && execute) { files.remove(); state = 'absent'; }
    check(['absent', 'owned'].includes(state), 'fixture_bootstrap_file_recovery_required');
    if (!execute) { await client.query('ROLLBACK'); return response('preflight-passed-no-mutation'); }
    created = files.create(photoBytes);
    for (let i = 0; i < ids.length; i++) await client.query(`INSERT INTO users
      (id,email,password_hash,profile,role,account_status,email_verified_at,terms_accepted_at,privacy_accepted_at,
       minimum_age_confirmed_at,private_use_confirmed_at,private_marketplace_review_status,phone_e164)
      VALUES ($1,$2,$3,$4::jsonb,'user','active',now(),now(),now(),now(),now(),'clear',NULL)`,
    [ids[i], emails[i], await hashFixturePassword(passwords[i]), JSON.stringify(profile(m, i))]);
    await client.query(`INSERT INTO listings (id,owner_id,payload,is_active,catalog_version,status,currency,price_per_day_minor,
      title,description,category_id,subcategory,condition,location_text,city,country,min_days,max_days,protection_model)
      VALUES ($1,$2,$3::jsonb,true,1,'active','EUR',100,$4,$4,'cat3','Sonstiges','good','Synthetic test only','Heilbronn','Deutschland',1,30,'none')`,
    [dedicatedFixture.listing, dedicatedFixture.owner, JSON.stringify({ syntheticOnly: true, syntheticMarker: m.preflight.runId,
      syntheticPurpose: dedicatedFixture.purpose, title: fixtureNotice, description: fixtureNotice, photos: [], bookingAllowed: false, paymentAllowed: false }), fixtureNotice]);
    await client.query(`INSERT INTO uploads (id,owner_id,storage_name,mime_type,byte_size,purpose,visibility,listing_id,content_sha256,content_scan_status)
      VALUES ($1,$2,$3,'image/webp',$4,'listing_image','public',$5,$6,'passed')`,
    [dedicatedFixture.uploadId, dedicatedFixture.owner, dedicatedFixture.upload, photoBytes.length, dedicatedFixture.listing, hash(photoBytes)]);
    const after = await readFixtureSnapshot(client, m.preflight, { withinTransaction: true });
    validateFixtureSnapshot({ ...m.preflight, snapshotDigest: fixtureDigest(after) }, after);
    check(after.users.length === 2 && after.listing.length === 1 && after.upload.length === 1
      && after.users.every((u) => u.email === `${u.id}@example.invalid` && fixtureDigest(u.profile) === fixtureDigest(profile(m, ids.indexOf(u.id))))
      && after.listing[0].title === fixtureNotice && after.listing[0].description === fixtureNotice
      && after.listing[0].private_status_confirmed_at === null && after.listing[0].private_pilot_region_code === null
      && after.sessions.length === 0 && after.identities.length === 0 && after.push.length === 0, 'fixture_bootstrap_readback');
    const acknowledged = (await client.query(`SELECT count(*)::int AS count FROM users WHERE id=ANY($1::text[])
      AND terms_accepted_at IS NOT NULL AND privacy_accepted_at IS NOT NULL AND minimum_age_confirmed_at IS NOT NULL
      AND private_use_confirmed_at IS NOT NULL AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL`, [ids])).rows[0]?.count;
    check(acknowledged === 2, 'fixture_bootstrap_acknowledgement_readback');
    noDependencies(await readAdapterDependencies(client, m.preflight, after));
    await audit(client, m, 'seeded', { scope: digest(m), snapshotHash: fixtureDigest(after) });
    committing = true; await client.query('COMMIT'); committing = false; seedCommitted = true;
    check(files.inspect() === 'owned', 'fixture_bootstrap_file_readback');
    return response('dedicated-seed-prepared-runtime-blocked');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { throw Error('fixture_bootstrap_rollback_unknown_file_retained'); }
    if (committing) throw Error('fixture_bootstrap_commit_unknown_file_retained');
    if (seedCommitted) throw Error('fixture_bootstrap_committed_readback_failed_file_retained');
    if (created) files.remove();
    throw error;
  } finally {
    check((await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked', ['sit-dedicated-web-fixture-bootstrap-v1'])).rows[0]?.unlocked,
      'fixture_bootstrap_unlock_failed');
  }
}
