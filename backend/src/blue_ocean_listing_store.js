import {
  createListingAiDraftRevision,
  listingAiDraftDomainVersion,
  listingAiDraftSchemaVersion,
  listingAiPromptVersion,
} from './listing_ai_draft_domain.js';

export class BlueOceanListingStoreError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, details) {
  throw new BlueOceanListingStoreError(status, code, details);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function exactZeroCostProvider(value) {
  if (!['mock', 'on_device'].includes(value)) {
    fail(500, 'blue_ocean_zero_cost_provider_invalid');
  }
  return value;
}

async function persistZeroCostGenerationLedger(client, {
  draftId,
  generationKey,
  provider,
  model,
  result,
}) {
  // The paid adapter deliberately reports billedCostCents as unknown until
  // provider reconciliation. The current NOT NULL ledger must not turn that
  // unknown value into a fabricated zero; its separate activation remains a
  // later provider gate. Mock and on-device results are exact zero-cost truth.
  if (provider === 'openai') return;
  const exactProvider = exactZeroCostProvider(provider);
  if (result?.paidCallPerformed !== false
      || result?.estimatedCostCents !== 0
      || result?.billedCostCents !== 0) {
    fail(500, 'blue_ocean_zero_cost_ledger_mismatch');
  }
  const outcome = exactProvider === 'mock' ? 'mocked' : 'succeeded';
  const exactModel = typeof model === 'string' && model.length > 0 && model.length <= 200
    ? model
    : null;
  if (exactProvider === 'on_device' && exactModel === null) {
    fail(500, 'blue_ocean_zero_cost_model_invalid');
  }
  const inserted = await client.query(
    `INSERT INTO listing_ai_cost_ledger (
       draft_id, generation_key, provider, model,
       input_units, output_units, estimated_cost_cents,
       billed_cost_cents, outcome
     ) VALUES ($1, $2, $3, $4, 0, 0, 0, 0, $5)
     ON CONFLICT (provider, generation_key) DO NOTHING
     RETURNING draft_id, generation_key, provider, model,
               input_units, output_units, estimated_cost_cents,
               billed_cost_cents, outcome`,
    [draftId, generationKey, exactProvider, exactModel, outcome],
  );
  const row = inserted.rowCount === 1
    ? inserted.rows[0]
    : (await client.query(
      `SELECT draft_id, generation_key, provider, model,
              input_units, output_units, estimated_cost_cents,
              billed_cost_cents, outcome
         FROM listing_ai_cost_ledger
        WHERE provider = $1 AND generation_key = $2`,
      [exactProvider, generationKey],
    )).rows[0];
  if (!row
      || row.draft_id !== draftId
      || row.generation_key !== generationKey
      || row.provider !== exactProvider
      || (row.model ?? null) !== exactModel
      || Number(row.input_units) !== 0
      || Number(row.output_units) !== 0
      || Number(row.estimated_cost_cents) !== 0
      || Number(row.billed_cost_cents) !== 0
      || row.outcome !== outcome) {
    fail(409, 'blue_ocean_zero_cost_ledger_conflict');
  }
}

function revisionFromRow(row) {
  if (!row) fail(404, 'blue_ocean_draft_not_found');
  return createListingAiDraftRevision({
    draftId: row.draft_id,
    ownerId: row.owner_id,
    revision: row.revision,
    imageReferences: parseJson(row.input_image_refs, []),
    fields: parseJson(row.fields, {}),
    clarificationQuestions: parseJson(row.clarification_questions, []),
    ownerConfirmations: parseJson(row.owner_confirmations, {}),
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    generationMode: row.generation_mode,
    generatedAt: row.version_created_at,
  });
}

export async function loadBlueOceanDraft(client, { draftId, ownerId, lock = false }) {
  const result = await client.query(
    `SELECT draft.id AS draft_id, draft.owner_id, draft.status,
            draft.current_revision, draft.schema_version, draft.prompt_version,
            draft.disclosure_version, draft.disclosure_accepted_at,
            draft.image_preflight_status, draft.published_listing_id,
            version.id AS draft_version_id, version.revision,
            version.generation_key, version.generation_mode,
            version.input_image_refs, version.fields,
            version.clarification_questions, version.owner_confirmations,
            version.payload_sha256, version.review_metadata,
            version.created_at AS version_created_at
       FROM listing_ai_drafts AS draft
       LEFT JOIN LATERAL (
         SELECT * FROM listing_ai_draft_versions
          WHERE draft_id = draft.id
          ORDER BY revision DESC, id DESC
          LIMIT 1
       ) AS version ON true
      WHERE draft.id = $1 AND draft.owner_id = $2
      ${lock ? 'FOR UPDATE OF draft' : ''}`,
    [draftId, ownerId],
  );
  if (!result.rowCount) fail(404, 'blue_ocean_draft_not_found');
  const row = result.rows[0];
  return Object.freeze({
    row,
    revision: row.revision == null ? null : revisionFromRow(row),
    reviewMetadata: parseJson(row.review_metadata, {}),
  });
}

export async function persistBlueOceanGeneratedDraft(client, {
  ownerId,
  generationKey,
  provider,
  model,
  result,
}) {
  if (result?.status !== 'draft_ready') fail(409, 'blue_ocean_generated_draft_required');
  const revision = result.revision;
  await client.query(
    `INSERT INTO listing_ai_drafts (
       id, domain_version, schema_version, prompt_version, owner_id,
       disclosure_version, disclosure_accepted_at, image_preflight_status
     ) VALUES ($1, $2, $3, $4, $5, $6, now(), 'consumed')
     ON CONFLICT (id) DO NOTHING`,
    [
      revision.draftId,
      listingAiDraftDomainVersion,
      listingAiDraftSchemaVersion,
      listingAiPromptVersion,
      ownerId,
      result.disclosureVersion,
    ],
  );
  const draft = await client.query(
    `SELECT owner_id, status, current_revision
       FROM listing_ai_drafts WHERE id = $1 FOR UPDATE`,
    [revision.draftId],
  );
  if (!draft.rowCount || draft.rows[0].owner_id !== ownerId) {
    fail(403, 'blue_ocean_draft_forbidden');
  }
  const existing = await client.query(
    `SELECT id, payload_sha256 FROM listing_ai_draft_versions
      WHERE draft_id = $1 AND generation_key = $2`,
    [revision.draftId, generationKey],
  );
  if (existing.rowCount) {
    if (existing.rows[0].payload_sha256 !== revision.payloadSha256) {
      fail(409, 'blue_ocean_generation_idempotency_conflict');
    }
    await persistZeroCostGenerationLedger(client, {
      draftId: revision.draftId,
      generationKey,
      provider,
      model,
      result,
    });
    return Object.freeze({ draftVersionId: existing.rows[0].id, replayed: true });
  }
  if (draft.rows[0].status !== 'editing' || draft.rows[0].current_revision !== 0) {
    fail(409, 'blue_ocean_draft_generation_conflict');
  }
  const inserted = await client.query(
    `INSERT INTO listing_ai_draft_versions (
       draft_id, revision, generation_key, generation_mode,
       input_image_refs, fields, clarification_questions,
       owner_confirmations, payload_sha256, review_metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
               $8::jsonb, $9, $10::jsonb, $11::timestamptz)
     RETURNING id`,
    [
      revision.draftId,
      revision.revision,
      generationKey,
      revision.generationMode,
      JSON.stringify(revision.imageReferences),
      JSON.stringify(revision.fields),
      JSON.stringify(revision.clarificationQuestions),
      JSON.stringify(revision.ownerConfirmations),
      revision.payloadSha256,
      JSON.stringify({
        imageReview: result.imageReview,
        disclosureVersion: result.disclosureVersion,
        providerCallCount: result.providerCallCount,
        paidCallPerformed: result.paidCallPerformed,
        estimatedCostCents: result.estimatedCostCents,
        billedCostCents: result.billedCostCents,
        autoPublishAllowed: false,
      }),
      revision.generatedAt,
    ],
  );
  await persistZeroCostGenerationLedger(client, {
    draftId: revision.draftId,
    generationKey,
    provider,
    model,
    result,
  });
  return Object.freeze({ draftVersionId: inserted.rows[0].id, replayed: false });
}

export async function persistBlueOceanReview(client, {
  ownerId,
  review,
}) {
  const draft = await loadBlueOceanDraft(client, {
    draftId: review.revision.draftId,
    ownerId,
    lock: true,
  });
  if (draft.row.status === 'published' || draft.row.status === 'discarded') {
    fail(409, 'blue_ocean_draft_closed');
  }
  const existing = await client.query(
    `SELECT id, payload_sha256 FROM listing_ai_draft_versions
      WHERE draft_id = $1 AND generation_key = $2`,
    [review.revision.draftId, review.generationKey],
  );
  if (existing.rowCount) {
    if (existing.rows[0].payload_sha256 !== review.revision.payloadSha256) {
      fail(409, 'blue_ocean_generation_idempotency_conflict');
    }
    return Object.freeze({ draftVersionId: existing.rows[0].id, replayed: true });
  }
  if (review.revision.revision !== draft.row.current_revision + 1) {
    fail(409, 'blue_ocean_draft_revision_conflict');
  }
  const inserted = await client.query(
    `INSERT INTO listing_ai_draft_versions (
       draft_id, revision, generation_key, generation_mode,
       input_image_refs, fields, clarification_questions,
       owner_confirmations, payload_sha256, review_metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
               $8::jsonb, $9, $10::jsonb, $11::timestamptz)
     RETURNING id`,
    [
      review.revision.draftId,
      review.revision.revision,
      review.generationKey,
      review.revision.generationMode,
      JSON.stringify(review.revision.imageReferences),
      JSON.stringify(review.revision.fields),
      JSON.stringify(review.revision.clarificationQuestions),
      JSON.stringify(review.revision.ownerConfirmations),
      review.revision.payloadSha256,
      JSON.stringify({
        readiness: review.readiness,
        priceReviewVersion: review.priceReviewVersion,
        priceMode: review.priceMode,
        priceNotice: review.priceNotice,
        priceInputSha256: review.priceInputSha256,
        recommendation: review.recommendation,
        selection: review.selection,
        durationSchedule: review.durationSchedule,
        quotePreviews: review.quotePreviews,
        paidCallPerformed: false,
        autoPublishAllowed: false,
      }),
      review.revision.generatedAt,
    ],
  );
  if (review.recommendation != null) {
    const options = review.recommendation.ownerOptions.map((entry) => entry.dailyPriceMinor);
    await client.query(
      `INSERT INTO regional_price_engine_snapshots (
       draft_id, draft_version_id, engine_authority, engine_version,
       input_sha256, range_low_minor, recommended_daily_minor,
       range_high_minor, explanation, snapshot_payload,
       market_observation_version, fallback_anchor_minor,
       regional_weighted_median_minor, effective_observation_count_milli,
       geography_scope, confidence, fallback_share_basis_points,
       demand_factor_basis_points, duration_schedule, quote_preview,
       owner_selected_daily_minor, owner_override_applied,
       synthetic_learning_applied
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb,
       $21, $22, false
     )`,
    [
      review.revision.draftId,
      inserted.rows[0].id,
      review.recommendation.engineAuthority,
      review.recommendation.engineVersion,
      review.priceInputSha256,
      Math.min(...options),
      review.recommendation.recommendedDailyMinor,
      Math.max(...options),
      review.recommendation.explanation,
      JSON.stringify({
        recommendation: review.recommendation,
        selection: review.selection,
        readiness: review.readiness,
      }),
      review.recommendation.observationVersion,
      review.recommendation.fallbackAnchorMinor,
      review.recommendation.regionalWeightedMedianMinor,
      review.recommendation.effectiveObservationCountMilli,
      review.recommendation.geographyScope,
      review.recommendation.confidence,
      review.recommendation.fallbackShareBasisPoints,
      review.recommendation.demandFactorBasisPoints,
      JSON.stringify(review.durationSchedule),
      JSON.stringify({ previews: review.quotePreviews }),
      review.selection.ownerSelectedDailyMinor,
      review.selection.ownerOverrideApplied,
      ],
    );
  }
  await client.query(
    `UPDATE listing_ai_drafts
        SET status = $2, updated_at = now()
      WHERE id = $1`,
    [review.revision.draftId, review.readiness.previewReady ? 'review_ready' : 'editing'],
  );
  return Object.freeze({ draftVersionId: inserted.rows[0].id, replayed: false });
}

export async function markBlueOceanDraftPublished(client, {
  ownerId,
  draftId,
  draftVersionId,
  listingId,
  payloadSha256,
}) {
  const updated = await client.query(
    `UPDATE listing_ai_drafts
        SET status = 'published', published_listing_id = $3,
            published_at = now(), updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'review_ready'
      RETURNING id`,
    [draftId, ownerId, listingId],
  );
  if (!updated.rowCount) fail(409, 'blue_ocean_draft_not_review_ready');
  await client.query(
    `INSERT INTO listing_ai_publication_receipts (
       draft_id, draft_version_id, listing_id, owner_id, explicit_action,
       readiness_state, revision_payload_sha256
     ) VALUES ($1, $2, $3, $4, 'Anzeige veröffentlichen',
               'READY_TO_PUBLISH', $5)`,
    [draftId, draftVersionId, listingId, ownerId, payloadSha256],
  );
}
