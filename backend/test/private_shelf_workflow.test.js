import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPrivateShelfTechnicalAccess,
  normalizePrivateShelfItem,
  privateShelfDigest,
  PrivateShelfError,
} from '../src/private_shelf_workflow.js';

test('private shelf input is minimal, exact and carries no location or public-offer fields', () => {
  assert.deepEqual(normalizePrivateShelfItem({
    title: 'Bohrmaschine',
    categoryKey: 'tools.drills',
    condition: 'good',
  }), {
    title: 'Bohrmaschine',
    categoryKey: 'tools.drills',
    condition: 'good',
  });
  for (const extra of ['address', 'latitude', 'longitude', 'price', 'isPublic']) {
    assert.throws(() => normalizePrivateShelfItem({
      title: 'Bohrmaschine', categoryKey: 'tools.drills', condition: 'good', [extra]: 'forbidden',
    }), (error) => error instanceof PrivateShelfError
      && error.code === 'invalid_private_shelf_item_fields');
  }
});

test('private shelf technical gate is fail-closed and keeps public, AI and resolution disabled', () => {
  const accepted = {
    planner: {
      enabled: true,
      publicReleaseAllowed: false,
      externalGenerativeAiAllowed: false,
      inventoryResolutionAllowed: false,
    },
  };
  assert.equal(assertPrivateShelfTechnicalAccess(accepted), true);
  for (const [key, value] of [
    ['publicReleaseAllowed', true],
    ['externalGenerativeAiAllowed', true],
    ['inventoryResolutionAllowed', true],
  ]) {
    assert.throws(() => assertPrivateShelfTechnicalAccess({
      planner: { ...accepted.planner, [key]: value },
    }), (error) => error instanceof PrivateShelfError && error.status === 404);
  }
});

test('private shelf digest is canonical and changes with the request', () => {
  const first = privateShelfDigest({ command: 'create', payload: { title: 'A', quantity: 1 } });
  assert.equal(first, privateShelfDigest({ payload: { quantity: 1, title: 'A' }, command: 'create' }));
  assert.notEqual(first, privateShelfDigest({ command: 'create', payload: { title: 'B', quantity: 1 } }));
  assert.match(first, /^[a-f0-9]{64}$/u);
});
