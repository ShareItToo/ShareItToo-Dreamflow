import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'sql',
  'migrations',
);

async function readMigration(name) {
  return readFile(join(migrationsDirectory, name), 'utf8');
}

test('migration 092 permits only paired canonical listing AI consent values', async () => {
  const up = await readMigration('092_listing_ai_mock_disclosure.up.sql');

  assert.match(up, /disclosure_version IS NULL AND disclosure_accepted_at IS NULL/u);
  assert.match(up, /'listing-ai-image-disclosure-v1'/u);
  assert.match(up, /'listing-ai-on-device-disclosure-v1'/u);
  assert.match(up, /'listing-ai-mock-disclosure-v1'/u);
  assert.match(up, /disclosure_accepted_at IS NOT NULL/u);
  assert.equal((up.match(/listing-ai-[a-z-]+-disclosure-v1/gu) ?? []).length, 3);
});

test('migration 092 down is fail-closed and restores the prior constraint', async () => {
  const down = await readMigration('092_listing_ai_mock_disclosure.down.sql');

  assert.match(down, /WHERE disclosure_version = 'listing-ai-mock-disclosure-v1'/u);
  assert.match(down, /Mock listing AI disclosure rollback blocked/u);
  assert.match(down, /'listing-ai-image-disclosure-v1'/u);
  assert.match(down, /'listing-ai-on-device-disclosure-v1'/u);
  assert.doesNotMatch(down, /\b(?:DELETE|UPDATE)\s+listing_ai_drafts\b/iu);
  assert.doesNotMatch(down, /DROP\s+TABLE/iu);
  assert.equal((down.match(/listing-ai-[a-z-]+-disclosure-v1/gu) ?? []).length, 3);
});
