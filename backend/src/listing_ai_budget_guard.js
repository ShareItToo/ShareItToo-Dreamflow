import { ListingAiGatewayError } from './listing_ai_gateway.js';

export const listingAiBudgetGuardVersion = 'N14-2026-09-03.1';
export const listingAiLifetimeBudgetPeriod = 'lifetime';
export const listingAiRunMaxCalls = 5;

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

export function createMemoryListingAiBudgetGuard({ budgetCents, maxCallCount = Number.POSITIVE_INFINITY } = {}) {
  cents(budgetCents, 'listing_ai_budget_configuration_invalid');
  if (maxCallCount !== Number.POSITIVE_INFINITY
      && (!Number.isSafeInteger(maxCallCount) || maxCallCount < 1 || maxCallCount > listingAiRunMaxCalls)) {
    fail('listing_ai_budget_call_limit_invalid');
  }
  let spentCents = 0;
  let reservedCents = 0;
  let callCount = 0;
  let reservedCalls = 0;
  return Object.freeze({
    version: listingAiBudgetGuardVersion,
    async reserve(requestedCents, _options = {}) {
      cents(requestedCents, 'listing_ai_budget_reservation_invalid', { minimum: 1 });
      if (spentCents + reservedCents + requestedCents > budgetCents
          || (Number.isFinite(maxCallCount) && callCount + reservedCalls + 1 > maxCallCount)) {
        fail('listing_ai_budget_exhausted');
      }
      reservedCents += requestedCents;
      reservedCalls += 1;
      return reservation({
        reservedCents: requestedCents,
        settleOperation: async (settledCents) => {
          reservedCents -= requestedCents;
          spentCents += settledCents;
          reservedCalls -= 1;
          callCount += 1;
        },
        releaseOperation: async () => {
          reservedCents -= requestedCents;
          reservedCalls -= 1;
        },
      });
    },
  });
}

export function createPostgresListingAiBudgetGuard({
  client,
  provider = 'openai',
  budgetCents,
  maxCallCount = Number.POSITIVE_INFINITY,
  now = () => new Date(),
} = {}) {
  if (!client || typeof client.query !== 'function' || provider !== 'openai') {
    fail('listing_ai_budget_store_invalid');
  }
  cents(budgetCents, 'listing_ai_budget_configuration_invalid', { minimum: 1 });
  if (maxCallCount !== Number.POSITIVE_INFINITY
      && (!Number.isSafeInteger(maxCallCount) || maxCallCount < 1 || maxCallCount > listingAiRunMaxCalls)) {
    fail('listing_ai_budget_call_limit_invalid');
  }
  return Object.freeze({
    version: listingAiBudgetGuardVersion,
    async reserve(requestedCents, { attemptId = null } = {}) {
      cents(requestedCents, 'listing_ai_budget_reservation_invalid', { minimum: 1 });
      if (attemptId !== null) {
        const tx = typeof client.totalCount === 'number' && typeof client.connect === 'function'
          ? await client.connect()
          : client;
        let began = false;
        let committed = false;
        try {
          if (tx !== client) {
            await tx.query('BEGIN');
            began = true;
          }
          const marker = await tx.query(
            `UPDATE listing_ai_analysis_attempts
                SET status = 'egress_started', egress_started_at = now(), updated_at = now()
              WHERE id = $1 AND status = 'reserved'
              RETURNING id`,
            [attemptId],
          );
          if (marker.rowCount !== 1) {
            const current = await tx.query(
              `SELECT status FROM listing_ai_analysis_attempts WHERE id = $1 FOR UPDATE`,
              [attemptId],
            );
            if (current.rowCount !== 1 || current.rows[0].status !== 'egress_started') {
              fail('listing_ai_attempt_egress_marker_conflict');
            }
          }
          const held = await tx.query(
            `UPDATE listing_ai_budget_reservations
                SET consumed_cents = consumed_cents + $2,
                    consumed_calls = consumed_calls + 1,
                    updated_at = now()
              WHERE attempt_id = $1 AND provider = 'openai' AND status = 'active'
                AND consumed_cents + $2 <= reserved_cents
                AND consumed_calls + 1 <= reserved_calls
              RETURNING reserved_cents`,
            [attemptId, requestedCents],
          );
          if (held.rowCount !== 1) fail('listing_ai_budget_exhausted');
          if (began) {
            await tx.query('COMMIT');
            committed = true;
          }
        } catch (error) {
          if (began && !committed) {
            try { await tx.query('ROLLBACK'); } catch { /* preserve primary failure */ }
          }
          if (error?.code === 'listing_ai_attempt_egress_marker_conflict'
              || error?.code === 'listing_ai_budget_exhausted') throw error;
          throw new ListingAiGatewayError(503, 'listing_ai_attempt_reservation_commit_unknown');
        } finally {
          if (tx !== client) tx.release();
        }
        let state = 'reserved';
        const close = async (release) => {
          if (state !== 'reserved') fail('listing_ai_budget_reservation_already_closed');
          if (release) {
            const result = await client.query(
              `UPDATE listing_ai_budget_reservations
                  SET consumed_cents = consumed_cents - $2,
                      consumed_calls = consumed_calls - 1,
                      updated_at = now()
                WHERE attempt_id = $1 AND status = 'active'
                  AND consumed_cents >= $2 AND consumed_calls >= 1`,
              [attemptId, requestedCents],
            );
            if (result.rowCount !== 1) fail('listing_ai_budget_release_failed');
          }
          state = release ? 'released' : 'settled';
        };
        return Object.freeze({
          reservedCents: requestedCents,
          async settle(spentCents) {
            cents(spentCents, 'listing_ai_budget_settlement_invalid');
            if (spentCents > requestedCents) fail('listing_ai_budget_settlement_exceeds_reservation');
            await close(false);
          },
          async release() { await close(true); },
        });
      }
      // The external allowance is lifetime-scoped. `now` is only retained as
      // a validation seam; it must never choose a monthly bucket.
      periodKey(now());
      const period = listingAiLifetimeBudgetPeriod;
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
                reserved_calls = reserved_calls + 1,
                updated_at = now()
          WHERE period_key = $1
            AND provider = $2
            AND budget_cents = $4
            AND spent_cents + reserved_cents + $3 <= budget_cents
            ${Number.isFinite(maxCallCount) ? 'AND call_count + reserved_calls + 1 <= $5' : ''}
        RETURNING budget_cents`,
        Number.isFinite(maxCallCount)
          ? [period, provider, requestedCents, budgetCents, maxCallCount]
          : [period, provider, requestedCents, budgetCents],
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
                    reserved_calls = reserved_calls - 1,
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
                reserved_calls = reserved_calls - 1,
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
