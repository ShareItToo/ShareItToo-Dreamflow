import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getRentalCart,
  putRentalCartProject,
  RentalCartError,
} from '../src/rental_cart_workflow.js';

function scriptedClient(steps) {
  return {
    async query(statement, values = []) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      if (step.assertValues) step.assertValues(values);
      return step.result;
    },
  };
}

test('an account without a server cart receives an explicit non-reservation cart', async () => {
  const client = scriptedClient([
    {
      pattern: /FROM rental_carts[\s\S]*WHERE user_id = \$1/u,
      result: { rowCount: 0, rows: [] },
    },
  ]);
  assert.deepEqual(await getRentalCart(client, 'user-1'), {
    schemaVersion: 1,
    revision: 0,
    reservationCreated: false,
    projects: [],
    items: [],
    createdAt: null,
    updatedAt: null,
  });
});

test('project upsert is account-bound, bounded, and idempotent by client project id', async () => {
  const cart = {
    id: 'cart-uuid',
    schema_version: 1,
    revision: 2,
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-20T10:01:00Z',
  };
  const client = scriptedClient([
    { pattern: /INSERT INTO rental_carts/u, result: { rowCount: 0, rows: [] } },
    { pattern: /FROM rental_carts[\s\S]*FOR UPDATE/u, result: { rowCount: 1, rows: [cart] } },
    { pattern: /FROM rental_cart_projects[\s\S]*client_project_id = \$2/u, result: { rowCount: 0, rows: [] } },
    { pattern: /count\(\*\).*rental_cart_projects/u, result: { rowCount: 1, rows: [{ count: 0 }] } },
    {
      pattern: /INSERT INTO rental_cart_projects[\s\S]*ON CONFLICT/u,
      assertValues(values) {
        assert.deepEqual(values, [
          cart.id,
          'project_1234',
          'Renovierung',
          JSON.stringify({ room: 'Küche' }),
          4,
        ]);
      },
      result: { rowCount: 1, rows: [] },
    },
    { pattern: /UPDATE rental_carts[\s\S]*revision = revision \+ 1/u, result: { rowCount: 1, rows: [] } },
    { pattern: /FROM rental_carts[\s\S]*WHERE user_id = \$1/u, result: { rowCount: 1, rows: [{ ...cart, revision: 3 }] } },
    {
      pattern: /FROM rental_cart_projects[\s\S]*ORDER BY/u,
      result: {
        rowCount: 1,
        rows: [{
          client_project_id: 'project_1234',
          title: 'Renovierung',
          answers: { room: 'Küche' },
          sort_order: 4,
          created_at: cart.created_at,
          updated_at: cart.updated_at,
        }],
      },
    },
    { pattern: /FROM rental_cart_items AS item/u, result: { rowCount: 0, rows: [] } },
  ]);
  const result = await putRentalCartProject(client, {
    actorId: 'user-1',
    clientProjectId: 'project_1234',
    raw: { title: 'Renovierung', answers: { room: 'Küche' }, sortOrder: 4 },
  });
  assert.equal(result.revision, 3);
  assert.equal(result.reservationCreated, false);
  assert.equal(result.projects[0].id, 'project_1234');
});

test('cart identifiers and project answers fail closed before database mutation', async () => {
  const never = { query: async () => assert.fail('database must not be called') };
  await assert.rejects(
    putRentalCartProject(never, {
      actorId: 'user-1',
      clientProjectId: 'short',
      raw: { title: 'Projekt' },
    }),
    (error) => error instanceof RentalCartError
      && error.code === 'invalid_rental_cart_project_id',
  );
  await assert.rejects(
    putRentalCartProject(never, {
      actorId: 'user-1',
      clientProjectId: 'project_1234',
      raw: { title: 'Projekt', answers: { note: 'x'.repeat(17_000) } },
    }),
    (error) => error instanceof RentalCartError
      && error.code === 'rental_cart_project_answers_too_large',
  );
});

test('G2 cart persistence cannot create a booking or availability hold', () => {
  const workflow = readFileSync(
    new URL('../src/rental_cart_workflow.js', import.meta.url),
    'utf8',
  );
  const migration = readFileSync(
    new URL('../sql/migrations/027_g2_persistent_rental_cart.up.sql', import.meta.url),
    'utf8',
  );
  const retention = readFileSync(
    new URL('../src/retention_inventory.js', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /reservationCreated: false/u);
  assert.match(workflow, /quoteBooking/u);
  assert.doesNotMatch(workflow, /createBooking/u);
  assert.doesNotMatch(migration, /REFERENCES bookings/u);
  assert.doesNotMatch(migration, /INSERT INTO bookings/u);
  assert.doesNotMatch(migration, /hold_expires_at/u);
  for (const dataset of [
    'rental_carts',
    'rental_cart_projects',
    'rental_cart_items',
  ]) {
    assert.match(retention, new RegExp(`'userIntent', '${dataset}'`, 'u'));
  }
});
