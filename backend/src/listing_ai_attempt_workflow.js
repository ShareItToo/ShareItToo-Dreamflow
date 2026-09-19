import crypto from 'node:crypto';

export class ListingAiAttemptError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, details) {
  throw new ListingAiAttemptError(status, code, details);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function listingAiAttemptHashes({
  draftId, ownerId, generationKey, model, consent, images, maxCostCents,
}) {
  const imageSha256 = sha256(JSON.stringify(images.map((entry) => ({
    imageReference: entry.imageReference,
    sha256: entry.sha256,
    byteSize: entry.byteSize,
  }))));
  const consentSha256 = sha256(canonical(consent));
  const payloadSha256 = sha256(canonical({
    draftId, ownerId, generationKey, model, consent, images, maxCostCents,
  }));
  return Object.freeze({
    requestSha256: sha256(canonical({ payloadSha256, imageSha256, consentSha256, model, maxCostCents })),
    payloadSha256,
    imageSha256,
    consentSha256,
  });
}

function rowView(row) {
  return Object.freeze({
    attemptId: row.id,
    draftId: row.draft_id,
    ownerId: row.owner_id,
    generationKey: row.generation_key,
    requestSha256: row.request_sha256,
    status: row.status,
    providerCallCount: Number(row.provider_call_count),
    estimatedCostCents: row.estimated_cost_cents == null ? null : Number(row.estimated_cost_cents),
    billedCostCents: row.billed_cost_cents == null ? null : Number(row.billed_cost_cents),
    result: row.result,
  });
}

function assertAttemptCost({ maxCostCents, maxCallCount }) {
  if (!Number.isSafeInteger(maxCostCents) || maxCostCents < 1 || maxCostCents > 10_000
      || !Number.isSafeInteger(maxCallCount) || maxCallCount < 1 || maxCallCount > 5) {
    fail(400, 'listing_ai_attempt_cost_bound_invalid');
  }
}

const attemptSelect = `id, draft_id, owner_id, generation_key, request_sha256,
  status, provider_call_count, estimated_cost_cents, billed_cost_cents, result`;

export async function claimListingAiAttempt(client, {
  draftId, ownerId, generationKey, model, consent, images,
  maxCostCents, maxCallCount, budgetCents, leaseMs = 30_000,
}) {
  if (!client || typeof client.query !== 'function') fail(500, 'listing_ai_attempt_store_invalid');
  assertAttemptCost({ maxCostCents, maxCallCount });
  if (!Number.isSafeInteger(budgetCents) || budgetCents < maxCostCents) fail(503, 'listing_ai_budget_exhausted');
  const hashes = listingAiAttemptHashes({
    draftId, ownerId, generationKey, model, consent, images, maxCostCents,
  });
  const inserted = await client.query(
    `INSERT INTO listing_ai_analysis_attempts (
       draft_id, owner_id, generation_key, request_sha256,
       payload_sha256, image_sha256, model, consent_sha256, max_cost_cents,
       status, reserved_cost_cents, reserved_call_count, lease_expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               'reserved', $9, $10, now() + ($11 * interval '1 millisecond'))
     ON CONFLICT (draft_id, generation_key) DO NOTHING
     RETURNING ${attemptSelect}`,
    [draftId, ownerId, generationKey, hashes.requestSha256, hashes.payloadSha256,
      hashes.imageSha256, model, hashes.consentSha256, maxCostCents, maxCallCount, leaseMs],
  );
  if (inserted.rowCount === 1) {
    const row = inserted.rows[0];
    const reservation = await client.query(
      `INSERT INTO listing_ai_budget_reservations
        (attempt_id, provider, reserved_cents, reserved_calls, status)
       VALUES ($1, 'openai', $2, $3, 'active') RETURNING attempt_id`,
      [row.id, maxCostCents, maxCallCount],
    );
    if (reservation.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_failed');
    const held = await client.query(
      `UPDATE listing_ai_budget_aggregates
          SET reserved_cents = reserved_cents + $1,
              reserved_calls = reserved_calls + $2, updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai'
          AND budget_cents = $3
          AND spent_cents + reserved_cents + $1 <= budget_cents
        RETURNING budget_cents`,
      [maxCostCents, maxCallCount, budgetCents],
    );
    if (held.rowCount !== 1) fail(503, 'listing_ai_budget_exhausted');
    return Object.freeze({ ...rowView(row), claimed: true, replayed: false });
  }
  const existing = await client.query(
    `SELECT ${attemptSelect}, payload_sha256, image_sha256, model, consent_sha256,
            max_cost_cents, lease_expires_at, egress_started_at
       FROM listing_ai_analysis_attempts
      WHERE draft_id = $1 AND generation_key = $2 FOR UPDATE`,
    [draftId, generationKey],
  );
  if (existing.rowCount !== 1) fail(503, 'listing_ai_attempt_readback_failed');
  const row = existing.rows[0];
  if (row.owner_id !== ownerId || row.request_sha256 !== hashes.requestSha256
      || row.payload_sha256 !== hashes.payloadSha256 || row.image_sha256 !== hashes.imageSha256
      || row.model !== model || row.consent_sha256 !== hashes.consentSha256
      || Number(row.max_cost_cents) !== maxCostCents) {
    fail(409, 'listing_ai_attempt_payload_conflict');
  }
  if (row.status === 'unknown') return Object.freeze({ ...rowView(row), claimed: false, retryBlocked: true });
  if (row.status === 'succeeded') return Object.freeze({ ...rowView(row), claimed: false, replayed: true });
  if (row.status === 'reserved'
      && row.egress_started_at == null
      && row.lease_expires_at != null
      && new Date(row.lease_expires_at).getTime() <= Date.now()) {
    const oldReservation = await client.query(
      `UPDATE listing_ai_budget_reservations
          SET status = 'released', updated_at = now()
        WHERE attempt_id = $1 AND status = 'active'
        RETURNING reserved_cents, reserved_calls`,
      [row.id],
    );
    if (oldReservation.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_missing');
    const released = await client.query(
      `UPDATE listing_ai_budget_aggregates
          SET reserved_cents = reserved_cents - $1,
              reserved_calls = reserved_calls - $2, updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai'
          AND reserved_cents >= $1 AND reserved_calls >= $2`,
      [oldReservation.rows[0].reserved_cents, oldReservation.rows[0].reserved_calls],
    );
    if (released.rowCount !== 1) fail(503, 'listing_ai_budget_release_failed');
    const replacement = await client.query(
      `UPDATE listing_ai_budget_reservations
          SET status = 'active', consumed_cents = 0, consumed_calls = 0, updated_at = now()
        WHERE attempt_id = $1 AND status = 'released'
          AND consumed_cents = 0 AND consumed_calls = 0 RETURNING attempt_id`,
      [row.id],
    );
    if (replacement.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_failed');
    const held = await client.query(
      `UPDATE listing_ai_budget_aggregates
          SET reserved_cents = reserved_cents + $1, reserved_calls = reserved_calls + $2,
              updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai' AND budget_cents = $3
          AND spent_cents + reserved_cents + $1 <= budget_cents RETURNING budget_cents`,
      [maxCostCents, maxCallCount, budgetCents],
    );
    if (held.rowCount !== 1) fail(503, 'listing_ai_budget_exhausted');
    const refreshed = await client.query(
      `UPDATE listing_ai_analysis_attempts
          SET lease_expires_at = now() + ($3 * interval '1 millisecond'), updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND status = 'reserved'
        RETURNING ${attemptSelect}`,
      [row.id, ownerId, leaseMs],
    );
    if (refreshed.rowCount !== 1) fail(503, 'listing_ai_attempt_claim_lost');
    return Object.freeze({ ...rowView(refreshed.rows[0]), claimed: true, replayed: false });
  }
  if (row.status === 'reserved' || row.status === 'egress_started') {
    return Object.freeze({ ...rowView(row), claimed: false, pending: true });
  }
  if (row.status === 'failed') {
    const retry = await client.query(
      `UPDATE listing_ai_analysis_attempts
          SET status = 'reserved', provider_call_count = 0,
              estimated_cost_cents = NULL, billed_cost_cents = NULL,
              result = '{}'::jsonb, lease_expires_at = now() + ($3 * interval '1 millisecond'),
              updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND status = 'failed'
        RETURNING ${attemptSelect}`,
      [row.id, ownerId, leaseMs],
    );
    if (retry.rowCount !== 1) fail(503, 'listing_ai_attempt_claim_lost');
    const reservation = await client.query(
      `UPDATE listing_ai_budget_reservations
          SET status = 'active', consumed_cents = 0, consumed_calls = 0, updated_at = now()
        WHERE attempt_id = $1 AND status = 'released'
          AND consumed_cents = 0 AND consumed_calls = 0 RETURNING attempt_id`,
      [row.id],
    );
    if (reservation.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_failed');
    const held = await client.query(
      `UPDATE listing_ai_budget_aggregates
          SET reserved_cents = reserved_cents + $1, reserved_calls = reserved_calls + $2,
              updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai' AND budget_cents = $3
          AND spent_cents + reserved_cents + $1 <= budget_cents
        RETURNING budget_cents`,
      [maxCostCents, maxCallCount, budgetCents],
    );
    if (held.rowCount !== 1) fail(503, 'listing_ai_budget_exhausted');
    return Object.freeze({ ...rowView(retry.rows[0]), claimed: true, replayed: false });
  }
  fail(409, 'listing_ai_attempt_state_invalid');
}

export async function markListingAiAttemptEgressStarted(client, { attemptId, ownerId }) {
  const result = await client.query(
    `UPDATE listing_ai_analysis_attempts
        SET status = 'egress_started', egress_started_at = now(), updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'reserved'
      RETURNING ${attemptSelect}`,
    [attemptId, ownerId],
  );
  if (result.rowCount !== 1) fail(409, 'listing_ai_attempt_egress_marker_conflict');
  return rowView(result.rows[0]);
}

async function finalize(client, {
  attemptId, ownerId, status, providerCallCount, estimatedCostCents, billedCostCents, result,
}) {
  const current = await client.query(
    `SELECT ${attemptSelect}, draft_id, generation_key, model
       FROM listing_ai_analysis_attempts WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
    [attemptId, ownerId],
  );
  if (current.rowCount !== 1) fail(503, 'listing_ai_attempt_readback_failed');
  const currentRow = current.rows[0];
  const sameFinal = currentRow.status === status
    && Number(currentRow.provider_call_count) === providerCallCount
    && (currentRow.estimated_cost_cents == null
      ? estimatedCostCents == null
      : Number(currentRow.estimated_cost_cents) === estimatedCostCents)
    && (currentRow.billed_cost_cents == null
      ? billedCostCents == null
      : Number(currentRow.billed_cost_cents) === billedCostCents)
    && canonical(currentRow.result) === canonical(result ?? {});
  if (sameFinal) return rowView(currentRow);
  if (currentRow.status !== 'egress_started') fail(409, 'listing_ai_attempt_finalize_conflict');
  const reservation = await client.query(
    `SELECT reserved_cents, reserved_calls, status
       FROM listing_ai_budget_reservations WHERE attempt_id = $1 FOR UPDATE`,
    [attemptId],
  );
  if (reservation.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_missing');
  const held = reservation.rows[0];
  if (status === 'unknown') {
    const unknown = await client.query(
      `UPDATE listing_ai_analysis_attempts
          SET status = 'unknown', provider_call_count = $3,
              estimated_cost_cents = $4, billed_cost_cents = $5,
              result = $6::jsonb, updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND status = 'egress_started'
        RETURNING ${attemptSelect}`,
      [attemptId, ownerId, providerCallCount, estimatedCostCents, billedCostCents, JSON.stringify(result ?? {})],
    );
    if (unknown.rowCount !== 1) fail(409, 'listing_ai_attempt_finalize_conflict');
    const unknownReason = String(result?.reasonCode ?? '').includes('timeout')
      ? 'timed_out'
      : (String(result?.reasonCode ?? '').includes('schema') ? 'schema_rejected' : 'failed');
    await client.query(
      `INSERT INTO listing_ai_cost_ledger (
         draft_id, generation_key, provider, model,
         input_units, output_units, estimated_cost_cents,
         billed_cost_cents, outcome
       ) VALUES ($1, $2, 'openai', $3, 0, 0, $4, NULL, $5)
       ON CONFLICT (provider, generation_key) DO NOTHING`,
      [currentRow.draft_id, currentRow.generation_key, currentRow.model,
        Number.isSafeInteger(estimatedCostCents) ? estimatedCostCents : Number(held.reserved_cents), unknownReason],
    );
    await client.query(
      `UPDATE listing_ai_budget_reservations
          SET status = 'unknown', consumed_cents = reserved_cents,
              consumed_calls = reserved_calls, updated_at = now()
        WHERE attempt_id = $1 AND status = 'active'`, [attemptId],
    );
    const charged = await client.query(
      `UPDATE listing_ai_budget_aggregates
          SET reserved_cents = reserved_cents - $1,
              reserved_calls = reserved_calls - $2,
              spent_cents = spent_cents + $1,
              call_count = call_count + $2,
              updated_at = now()
        WHERE period_key = 'lifetime' AND provider = 'openai'
          AND reserved_cents >= $1 AND reserved_calls >= $2
          AND spent_cents + $1 <= budget_cents RETURNING budget_cents`,
      [Number(held.reserved_cents), Number(held.reserved_calls)],
    );
    if (charged.rowCount !== 1) fail(503, 'listing_ai_budget_settlement_failed');
    return rowView(unknown.rows[0]);
  }
  const spent = Number.isSafeInteger(estimatedCostCents) ? estimatedCostCents : 0;
  const updated = await client.query(
    `UPDATE listing_ai_analysis_attempts
        SET status = $3, provider_call_count = $4, estimated_cost_cents = $5,
            billed_cost_cents = $6, result = $7::jsonb, updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'egress_started'
      RETURNING ${attemptSelect}`,
    [attemptId, ownerId, status, providerCallCount, spent, billedCostCents, JSON.stringify(result ?? {})],
  );
  if (updated.rowCount !== 1) fail(409, 'listing_ai_attempt_finalize_conflict');
  const settled = await client.query(
    `UPDATE listing_ai_budget_aggregates
        SET reserved_cents = reserved_cents - $1, reserved_calls = reserved_calls - $2,
            spent_cents = spent_cents + $3, call_count = call_count + $4, updated_at = now()
      WHERE period_key = 'lifetime' AND provider = 'openai'
        AND reserved_cents >= $1 AND reserved_calls >= $2
        AND spent_cents + $3 <= budget_cents RETURNING budget_cents`,
    [Number(held.reserved_cents), Number(held.reserved_calls), spent, providerCallCount],
  );
  if (settled.rowCount !== 1) fail(503, 'listing_ai_budget_settlement_failed');
  await client.query(
    `UPDATE listing_ai_budget_reservations SET status = 'settled', updated_at = now()
      WHERE attempt_id = $1 AND status = 'active'`, [attemptId],
  );
  return rowView(updated.rows[0]);
}

export function markListingAiAttemptSucceeded(client, input) {
  return finalize(client, { ...input, status: 'succeeded' });
}

export function markListingAiAttemptUnknown(client, input) {
  return finalize(client, { ...input, status: 'unknown' });
}

export async function markListingAiAttemptFailed(client, { attemptId, ownerId, result }) {
  const existing = await client.query(
    `SELECT ${attemptSelect} FROM listing_ai_analysis_attempts
      WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [attemptId, ownerId],
  );
  if (existing.rowCount !== 1) fail(503, 'listing_ai_attempt_readback_failed');
  if (existing.rows[0].status === 'failed'
      && canonical(existing.rows[0].result) === canonical(result ?? {})) {
    return rowView(existing.rows[0]);
  }
  if (existing.rows[0].status !== 'reserved') fail(409, 'listing_ai_attempt_finalize_conflict');
  const updated = await client.query(
    `UPDATE listing_ai_analysis_attempts
        SET status = 'failed', provider_call_count = 0, estimated_cost_cents = 0,
            billed_cost_cents = 0, result = $3::jsonb, updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'reserved'
      RETURNING ${attemptSelect}`,
    [attemptId, ownerId, JSON.stringify(result ?? {})],
  );
  if (updated.rowCount !== 1) fail(409, 'listing_ai_attempt_finalize_conflict');
  const reservation = await client.query(
      `UPDATE listing_ai_budget_reservations SET status = 'released', updated_at = now()
      WHERE attempt_id = $1 AND status = 'active'
        AND consumed_cents = 0 AND consumed_calls = 0
      RETURNING reserved_cents, reserved_calls`, [attemptId],
  );
  if (reservation.rowCount !== 1) fail(503, 'listing_ai_attempt_reservation_missing');
  const released = await client.query(
    `UPDATE listing_ai_budget_aggregates
        SET reserved_cents = reserved_cents - $1, reserved_calls = reserved_calls - $2,
            updated_at = now()
      WHERE period_key = 'lifetime' AND provider = 'openai'
        AND reserved_cents >= $1 AND reserved_calls >= $2`,
    [reservation.rows[0].reserved_cents, reservation.rows[0].reserved_calls],
  );
  if (released.rowCount !== 1) fail(503, 'listing_ai_budget_release_failed');
  return rowView(updated.rows[0]);
}
