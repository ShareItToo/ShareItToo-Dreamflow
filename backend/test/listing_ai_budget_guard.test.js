import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryListingAiBudgetGuard,
  createPostgresListingAiBudgetGuard,
} from '../src/listing_ai_budget_guard.js';
import { ListingAiGatewayError } from '../src/listing_ai_gateway.js';

function fakePostgres(initial = null) {
  let state = initial == null ? null : { ...initial };
  return {
    get state() { return state == null ? null : { ...state }; },
    async query(text, values) {
      if (text.includes('INSERT INTO listing_ai_budget_aggregates')) {
        state ??= {
          budgetCents: values[2],
          spentCents: 0,
          reservedCents: 0,
          callCount: 0,
        };
        return { rowCount: 0, rows: [] };
      }
      if (text.includes('reserved_cents = reserved_cents +')) {
        const requested = values[2];
        const configured = values[3];
        if (state.budgetCents !== configured
            || state.spentCents + state.reservedCents + requested > state.budgetCents) {
          return { rowCount: 0, rows: [] };
        }
        state.reservedCents += requested;
        return { rowCount: 1, rows: [{ budget_cents: state.budgetCents }] };
      }
      if (text.includes('SELECT budget_cents')) {
        return state == null
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ budget_cents: state.budgetCents }] };
      }
      if (text.includes('spent_cents = spent_cents +')) {
        const reserved = values[2];
        const spent = values[3];
        if (state.reservedCents < reserved) return { rowCount: 0, rows: [] };
        state.reservedCents -= reserved;
        state.spentCents += spent;
        state.callCount += 1;
        return { rowCount: 1, rows: [{ budget_cents: state.budgetCents }] };
      }
      if (text.includes('reserved_cents = reserved_cents -')) {
        const reserved = values[2];
        if (state.reservedCents < reserved) return { rowCount: 0, rows: [] };
        state.reservedCents -= reserved;
        return { rowCount: 1, rows: [{ budget_cents: state.budgetCents }] };
      }
      throw new Error('unexpected query');
    },
  };
}

test('memory budget reservations serialize concurrent calls and settle exact estimates', async () => {
  const guard = createMemoryListingAiBudgetGuard({ budgetCents: 3 });
  const first = await guard.reserve(2);
  await assert.rejects(
    guard.reserve(2),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_budget_exhausted',
  );
  await first.settle(1);
  const second = await guard.reserve(2);
  await second.release();
  const third = await guard.reserve(2);
  await third.settle(2);
  await assert.rejects(
    guard.reserve(1),
    (error) => error.code === 'listing_ai_budget_exhausted',
  );
});

test('postgres budget guard atomically persists reserve, settle and call count', async () => {
  const client = fakePostgres();
  const guard = createPostgresListingAiBudgetGuard({
    client,
    budgetCents: 5,
    now: () => new Date('2026-09-03T10:00:00.000Z'),
  });
  const held = await guard.reserve(2);
  assert.deepEqual(client.state, {
    budgetCents: 5,
    spentCents: 0,
    reservedCents: 2,
    callCount: 0,
  });
  await held.settle(1);
  assert.deepEqual(client.state, {
    budgetCents: 5,
    spentCents: 1,
    reservedCents: 0,
    callCount: 1,
  });
});

test('postgres budget guard fails closed on configuration drift and exhaustion', async () => {
  const mismatchClient = fakePostgres({
    budgetCents: 4,
    spentCents: 0,
    reservedCents: 0,
    callCount: 0,
  });
  const mismatch = createPostgresListingAiBudgetGuard({
    client: mismatchClient,
    budgetCents: 5,
  });
  await assert.rejects(
    mismatch.reserve(2),
    (error) => error.code === 'listing_ai_budget_configuration_mismatch',
  );

  const exhaustedClient = fakePostgres({
    budgetCents: 5,
    spentCents: 4,
    reservedCents: 0,
    callCount: 4,
  });
  const exhausted = createPostgresListingAiBudgetGuard({
    client: exhaustedClient,
    budgetCents: 5,
  });
  await assert.rejects(
    exhausted.reserve(2),
    (error) => error.code === 'listing_ai_budget_exhausted',
  );
});
