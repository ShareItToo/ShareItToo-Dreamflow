import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const integrationSource = fs.readFileSync(
  path.resolve(currentDirectory, 'postgres_foundation.integration.test.js'),
  'utf8',
);

test('parallel acceptance scenario derives one safely future shared booking window', () => {
  assert.match(
    integrationSource,
    /function futureAcceptanceWindow\(\{[\s\S]+?daysAhead = 30,[\s\S]+?durationDays = 2,[\s\S]+?\}\s*=\s*\{\}\)\s*\{/u,
  );
  assert.match(
    integrationSource,
    /const acceptanceWindow = futureAcceptanceWindow\(\);[\s\S]+?start: acceptanceWindow\.start,[\s\S]+?end: acceptanceWindow\.end,/u,
  );
  assert.doesNotMatch(
    integrationSource,
    /start:\s*'2026-09-10T10:00:00\.000Z'/u,
  );
});
