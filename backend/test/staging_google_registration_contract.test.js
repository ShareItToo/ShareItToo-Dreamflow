import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const appSource = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const migrationSource = await fs.readFile(
  new URL('../sql/migrations/095_staging_google_registration_replays.up.sql', import.meta.url),
  'utf8',
);

test('social HTTP contract gates fresh claims, replay, ownership, and fixed staging IDs', () => {
  assert.match(appSource, /requireFreshToken:\s*config\.stagingGoogleRegistration\.enabled/u);
  assert.match(appSource, /resolveStagingGoogleRegistration\(config\.stagingGoogleRegistration, identity\)/u);
  assert.match(appSource, /reserveStagingGoogleRegistrationReplay\(client/u);
  assert.match(appSource, /const userId = stagingGoogleRegistration\?\.userId \?\? crypto\.randomUUID\(\)/u);
  assert.match(appSource, /staging_google_identity_conflict/u);
  assert.match(appSource, /metadata:\s*\{\s*method:\s*'federated',\s*provider:\s*identity\.provider\s*\}/u);
  assert.doesNotMatch(appSource, /metadata:.*tokenDigest/u);
  assert.ok(
    appSource.indexOf('const linked = await pool.query(')
      < appSource.indexOf('resolveStagingGoogleRegistration(config.stagingGoogleRegistration, identity)'),
  );
  assert.ok(
    appSource.indexOf('reserveStagingGoogleRegistrationReplay(client')
      > appSource.indexOf('UPDATE auth_identities'),
  );
});

test('replay migration stores only bounded digests and expiry, with a durable conflict key', () => {
  assert.match(migrationSource, /token_digest CHAR\(64\) PRIMARY KEY/u);
  assert.match(migrationSource, /identity_digest CHAR\(64\) NOT NULL/u);
  assert.match(migrationSource, /expires_at TIMESTAMPTZ NOT NULL/u);
  assert.match(migrationSource, /CHECK \(token_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migrationSource, /CREATE INDEX .*expires_at/u);
  assert.doesNotMatch(migrationSource, /email|uid|token[^_]/iu);
});
