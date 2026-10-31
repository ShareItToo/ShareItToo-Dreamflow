import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(testDir, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

test('private pilot V4 is explicitly bound to both deployment environments', () => {
  for (const composeFile of ['compose.staging.yml', 'compose.prod.yml']) {
    assert.match(
      source(composeFile),
      /PRIVATE_PILOT_V4_ENABLED: \$\{PRIVATE_PILOT_V4_ENABLED:-false\}/,
    );
    assert.match(
      source(composeFile),
      /PRIVATE_PILOT_ALLOWED_REGIONS: \$\{PRIVATE_PILOT_ALLOWED_REGIONS:-\}/,
    );
  }
});

test('isolated staging enables V4 while production remains fail-closed', () => {
  assert.match(
    source('.env.staging.example'),
    /^PRIVATE_PILOT_V4_ENABLED=true$/m,
  );
  assert.match(
    source('.env.example'),
    /^PRIVATE_PILOT_V4_ENABLED=false$/m,
  );
  assert.match(
    source('.env.staging.example'),
    /^PRIVATE_PILOT_ALLOWED_REGIONS=$/m,
  );
  assert.match(
    source('.env.example'),
    /^PRIVATE_PILOT_ALLOWED_REGIONS=$/m,
  );
});
