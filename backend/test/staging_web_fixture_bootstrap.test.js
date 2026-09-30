import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, symlinkSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { programmaticPlaceholder } from './fixtures/programmatic_placeholder.mjs';
import { bootstrapFileStore, buildFixtureBootstrapManifest, dedicatedFixture,
  hashFixturePassword, verifyFixturePassword, validateFixtureBootstrap,
  fixtureBootstrapHandoff } from '../ops/staging_web_fixture_bootstrap.mjs';
import { fixtureEnvironmentDigest } from '../ops/staging_web_fixture_preflight.mjs';

test('isolated bootstrap password helper preserves the runtime scrypt contract', async () => {
  const accepted = ['SyntheticBootstrap', 'Password', '-1234567890'].join('');
  const encoded = await hashFixturePassword(accepted);
  assert.match(encoded, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/u);
  assert.equal(await verifyFixturePassword(accepted, encoded), true);
  assert.equal(await verifyFixturePassword(`${accepted}-incorrect`, encoded), false);
});

test('bootstrap source does not import the config-bound runtime security module', () => {
  const source = readFileSync(new URL('../ops/staging_web_fixture_bootstrap.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /src\/security\.js/u);
});

async function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'sit-fixture-seed-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const media = await programmaticPlaceholder();
  const source = { commit: 'a'.repeat(40), hashes: { source: 'b'.repeat(64) }, schemaCount: 98, ledgerDigest: 'c'.repeat(64) };
  const environment = { DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: 'd'.repeat(40),
    DATABASE_URL: 'postgres://shareittoo_green@sit-green-postgres-20260918011528-wp254/shareittoo_green',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: 'old-untouched-owner,old-untouched-renter',
    SIT_STAGING_PUBLIC_LISTING_IDS: 'old-listing', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'old.webp',
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'disabled', PUSH_TRANSPORT: 'disabled' };
  const passwords = ['SyntheticOwnerPassword-OnlyForLocalTests-123', 'SyntheticRenterPassword-OnlyForLocalTests-456'];
  const manifest = buildFixtureBootstrapManifest({ source, environment, photo: media.photo, passwords, runId: 'web-fixture-bootstrap-test' });
  return { directory, source, environment, passwords, manifest, photoBytes: media.bytes };
}
test('dedicated scope preserves current gate; handoff is private, disabled and not runtime truth', async (t) => {
  const f = await fixture(t); const before = structuredClone(f.environment); validateFixtureBootstrap(f);
  const handoff = fixtureBootstrapHandoff(f.manifest, f.environment);
  assert.deepEqual(f.environment, before); assert.equal(handoff.activationAllowed, false);
  assert.equal(handoff.proposed.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED, 'false');
  assert.equal(handoff.proposed.SIT_STAGING_ALLOWED_USER_IDS, `${dedicatedFixture.owner},${dedicatedFixture.renter},${before.SIT_STAGING_ALLOWED_USER_IDS}`);
  assert.equal(f.manifest.preflight.roles.length, 2);
});
for (const [name, change] of Object.entries({
  production: (f) => { f.environment.DEPLOYMENT_ENVIRONMENT = 'production'; },
  foreignDB: (f) => { f.environment.DATABASE_URL = 'postgres://someone@localhost/foreign'; },
  mail: (f) => { f.environment.MAIL_TRANSPORT = 'smtp'; },
  payment: (f) => { f.environment.PAYMENT_TRANSPORT = 'stripe'; },
  flags: (f) => { f.environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED = 'true'; },
  source: (f) => { f.source.commit = 'e'.repeat(40); },
  passwords: (f) => { f.passwords[1] = f.passwords[0]; },
  owner: (f) => { f.manifest.preflight.roles[0].userId = 'old-untouched-owner'; },
  listing: (f) => { f.manifest.preflight.listingId = 'old-listing'; },
  execute: (f) => { f.execute = true; },
  oneConfirm: (f) => { f.execute = true; f.confirmSource = f.source.commit; },
  stale: (f) => { f.manifest.preflight.createdAt = '2020-01-01'; },
})) test(`bootstrap rejects ${name}`, async (t) => {
  const f = await fixture(t); change(f); f.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(f.environment);
  assert.throws(() => validateFixtureBootstrap(f)); assert.deepEqual(readdirSync(f.directory), []);
});
for (const stage of ['before_create', 'after_create', 'after_write', 'after_receipt']) test(`file fault ${stage} removes only its own new file`, async (t) => {
  const f = await fixture(t); const files = bootstrapFileStore(f.directory, f.manifest, { fault: (at) => { if (at === stage) throw Error('injected'); } });
  assert.throws(() => files.create(f.photoBytes), /injected/u); assert.deepEqual(readdirSync(f.directory), []);
});
test('exclusive exact file replay, receipt-only recovery and foreign content/inodes fail closed', async (t) => {
  const f = await fixture(t); const file = join(f.directory, dedicatedFixture.upload);
  const files = bootstrapFileStore(f.directory, f.manifest);
  assert.equal(files.inspect(), 'absent'); assert.equal(files.create(f.photoBytes), true); assert.equal(files.create(f.photoBytes), false);
  const interrupted = bootstrapFileStore(f.directory, f.manifest, { fault: (at) => { if (at === 'after_file_remove') throw Error('injected'); } });
  assert.throws(() => interrupted.remove(), /injected/u); assert.equal(files.inspect(), 'receipt-only'); files.remove();
  assert.equal(files.inspect(), 'absent'); files.create(f.photoBytes);
  writeFileSync(file, 'foreign replacement bytes');
  assert.throws(() => files.remove(), /file_collision/u); assert.equal(readFileSync(file, 'utf8'), 'foreign replacement bytes');
});
test('foreign existing exact bytes without ownership receipt and symlinks cannot be adopted', async (t) => {
  const f = await fixture(t); const path = join(f.directory, dedicatedFixture.upload);
  writeFileSync(path, f.photoBytes); chmodSync(path, 0o600);
  const files = bootstrapFileStore(f.directory, f.manifest);
  assert.throws(() => files.create(f.photoBytes), /file_collision/u); assert.deepEqual(readFileSync(path), f.photoBytes);
  rmSync(path); symlinkSync('foreign.webp', path);
  assert.throws(() => files.inspect(), /file_collision/u);
});
test('foreign bytes introduced during a failed copy are preserved, never rolled back blindly', async (t) => {
  const f = await fixture(t); const path = join(f.directory, dedicatedFixture.upload);
  const files = bootstrapFileStore(f.directory, f.manifest, { fault: (at) => {
    if (at === 'after_write') { writeFileSync(path, 'foreign bytes'); throw Error('injected'); }
  } });
  assert.throws(() => files.create(f.photoBytes), /recovery_required/u);
  assert.equal(readFileSync(path, 'utf8'), 'foreign bytes');
});
