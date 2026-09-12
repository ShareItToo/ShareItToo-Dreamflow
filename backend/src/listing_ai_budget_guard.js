import { ListingAiGatewayError } from './listing_ai_gateway.js';

export const listingAiBudgetGuardVersion = 'N14-2026-09-03.1';

function fail(code) {
  throw new ListingAiGatewayError(503, code);
}

function cents(value, code, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000) fail(code);
  return value;
}

function periodKey(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.getTime())) fail('listing_ai_budget_clock_invalid');
  return value.toISOString().slice(0, 7);
}

function reservation({ reservedCents, settleOperation, releaseOperation }) {
  let state = 'reserved';
  return Object.freeze({
    reservedCents,
    async settle(spentCents) {
      if (state !== 'reserved') fail('listing_ai_budget_reservation_already_closed');
      cents(spentCents, 'listing_ai_budget_settlement_invalid');
      if (spentCents > reservedCents) fail('listing_ai_budget_settlement_exceeds_reservation');
      await settleOperation(spentCents);
      state = 'settled';
    },
    async release() {
      if (state !== 'reserved') fail('listing_ai_budget_reservation_already_closed');
      await releaseOperation();
      state = 'released';
    },
  });
}

export function createMemoryListingAiBudgetGuard({ budgetCents }) {
  cents(budgetCents, 'listing_ai_budget_configuration_invalid');
  let spentCents = 0;
  let reservedCents = 0;
  return Object.freeze({
    version: listingAiBudgetGuardVersion,
    async reserve(requestedCents) {
      cents(requestedCents, 'listing_ai_budget_reservation_invalid', { minimum: 1 });
      if (spentCents + reservedCents + requestedCents > budgetCents) {
        fail('listing_ai_budget_exhausted');
      }
      reservedCents += requestedCents;
      return reservation({
        reservedCents: requestedCents,
        settleOperation: async (settledCents) => {
          reservedCents -= requestedCents;
          spentCents += settledCents;
        },
        releaseOperation: async () => {
          reservedCents -= requestedCents;
        },
      });
    },
  });
}

export function createPostgresListingAiBudgetGuard({
  client,
  provider = 'openai',
  budgetCents,
  now = () => new Date(),
} = {}) {
  if (!client || typeof client.query !== 'function' || provider !== 'openai') {
    fail('listing_ai_budget_store_invalid');
  }
  cents(budgetCents, 'listing_ai_budget_configuration_invalid', { minimum: 1 });
  return Object.freeze({
    version: listingAiBudgetGuardVersion,
    async reserve(requestedCents) {
      cents(requestedCents, 'listing_ai_budget_reservation_invalid', { minimum: 1 });
      const period = periodKey(now());
      await client.query(
        `INSERT INTO listing_ai_budget_aggregates (
           period_key, provider, budget_cents, spent_cents, reserved_cents, call_count
         ) VALUES ($1, $2, $3, 0, 0, 0)
         ON CONFLICT (period_key, provider) DO NOTHING`,
        [period, provider, budgetCents],
      );
      const held = await client.query(
        `UPDATE listing_ai_budget_aggregates
            SET reserved_cents = reserved_cents + $3,
                updated_at = now()
          WHERE period_key = $1
            AND provider = $2
            AND budget_cents = $4
            AND spent_cents + reserved_cents + $3 <= budget_cents
        RETURNING budget_cents`,
        [period, provider, requestedCents, budgetCents],
      );
      if (held.rowCount !== 1) {
        const state = await client.query(
          `SELECT budget_cents
             FROM listing_ai_budget_aggregates
            WHERE period_key = $1 AND provider = $2`,
          [period, provider],
        );
        if (state.rowCount === 1 && Number(state.rows[0].budget_cents) !== budgetCents) {
          fail('listing_ai_budget_configuration_mismatch');
        }
        fail('listing_ai_budget_exhausted');
      }
      return reservation({
        reservedCents: requestedCents,
        settleOperation: async (spent) => {
          const result = await client.query(
            `UPDATE listing_ai_budget_aggregates
                SET reserved_cents = reserved_cents - $3,
                    spent_cents = spent_cents + $4,
                    call_count = call_count + 1,
                    updated_at = now()
              WHERE period_key = $1
                AND provider = $2
                AND reserved_cents >= $3
            RETURNING budget_cents`,
            [period, provider, requestedCents, spent],
          );
          if (result.rowCount !== 1) fail('listing_ai_budget_settlement_failed');
        },
        releaseOperation: async () => {
          const result = await client.query(
            `UPDATE listing_ai_budget_aggregates
                SET reserved_cents = reserved_cents - $3,
                    updated_at = now()
              WHERE period_key = $1
                AND provider = $2
                AND reserved_cents >= $3
            RETURNING budget_cents`,
            [period, provider, requestedCents],
          );
          if (result.rowCount !== 1) fail('listing_ai_budget_release_failed');
        },
      });
    },
  });
}
