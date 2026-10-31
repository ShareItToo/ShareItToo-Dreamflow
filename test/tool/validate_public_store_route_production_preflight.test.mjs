import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateProductionRoutePreflight,
} from '../../tool/validate_public_store_route_production_preflight.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(fs.readFileSync(path.join(
  root,
  'docs',
  'evidence',
  'b11',
  'public-store-route-production-preflight-20260813.json',
), 'utf8'));

test('saved production route preflight proves exact rollback and keeps launch gates closed', () => {
  assert.deepEqual(validateProductionRoutePreflight(evidence), {
    status: 'rolled-back-production-backend-incompatible',
    candidate: '2026081202',
    rollbackVerified: true,
    storeSubmissionAllowed: false,
  });
});

test('a partial rollback cannot be promoted', () => {
  const changed = structuredClone(evidence);
  changed.rollback.productionApiHealthy = false;
  assert.throws(
    () => validateProductionRoutePreflight(changed),
    /Rollback proof is missing/u,
  );
});

test('a public URL gate cannot be opened by documentation alone', () => {
  const changed = structuredClone(evidence);
  changed.gates.publicAccountDeletionUrlReady = true;
  assert.throws(
    () => validateProductionRoutePreflight(changed),
    /Gate must remain closed/u,
  );
});
