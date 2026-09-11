import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import sharp from 'sharp';

import { createEphemeralAcceptancePassword } from '../ops/ephemeral_acceptance_password.mjs';
import {
  r8ConcurrentPrivacyExportAccounts,
  r8MaximumConcurrentWorkers,
  r8SyntheticAccountCount,
} from '../../tool/r8_bounded_concurrency_contract.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

const r8SyntheticAccounts = Object.freeze(Array.from(
  { length: r8SyntheticAccountCount },
  (_, index) => Object.freeze({
    id: `r8-user-${String(index + 1).padStart(3, '0')}`,
    email: `r8-user-${String(index + 1).padStart(3, '0')}@example.invalid`,
    sessionId: `90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }),
));

async function mapWithBoundedConcurrency(values, maximumWorkers, operation) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(maximumWorkers, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function futureAcceptanceWindow({
  now = new Date(),
  daysAhead = 30,
  durationDays = 2,
} = {}) {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() + daysAhead);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + durationDays);
  return Object.freeze({
    start: start.toISOString(),
    end: end.toISOString(),
  });
}

function humanStatementDecision({
  facts,
  basis,
  reasoning,
  durationType = 'until_reversed',
  endsAt = null,
}) {
  return {
    facts,
    basis,
    reasoning,
    detectionMethod: 'human',
    statementOfReasons: {
      decisionGround: 'terms_violation',
      decisionOrigin: 'notice',
      territorialScope: 'Alle SIT-Oberflächen; keine geografische Teilbeschränkung.',
      durationType,
      endsAt,
      automationRole: 'none',
    },
  };
}

if (!databaseUrl) {
  test.skip('PostgreSQL foundation integration requires TEST_DATABASE_URL');
} else {
  test('migrations, concurrency guard, and private-resource boundaries work together', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.PAYMENT_TRANSPORT = 'memory';
    process.env.FIREBASE_PHONE_VERIFICATION_ENABLED = 'true';
    process.env.SUPPORT_LEGACY_MIGRATION_ENABLED = 'true';
    process.env.SUPPORT_EVIDENCE_INTAKE_ENABLED = 'true';
    process.env.PAYOUT_HOLD_HOURS = '0';
    process.env.SIT_LISTING_AI_PROVIDER = 'mock';
    process.env.SIT_LISTING_AI_MODEL = 'listing-ai-mock-v1';
    process.env.SIT_LISTING_AI_BUDGET_CENTS = '0';
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-b3-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
    const firebaseServiceAccountFile = path.join(
      uploadDir,
      'firebase-service-account.json',
    );
    const privateKeyBegin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
    const privateKeyEnd = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
    await fs.writeFile(firebaseServiceAccountFile, JSON.stringify({
      type: 'service_account',
      project_id: 'shareittoo-staging',
      private_key_id: 'a'.repeat(40),
      private_key: `${privateKeyBegin}\nsynthetic-test-material\n${privateKeyEnd}\n`,
      client_email:
        'synthetic-phone-test@shareittoo-staging.iam.gserviceaccount.com',
      client_id: '123456789012345678901',
      token_uri: 'https://oauth2.googleapis.com/token',
    }), { mode: 0o600 });
    process.env.FIREBASE_PROJECT_ID = 'shareittoo-staging';
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE = firebaseServiceAccountFile;

    const { Pool } = pg;
    const setupPool = new Pool({ connectionString: databaseUrl, max: 4 });
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const schema = await fs.readFile(path.resolve(currentDir, '../sql/schema.sql'), 'utf8');
    const { runMigrations } = await import('../src/migrations.js');

    let server;
    let s4jServer;
    let applicationPool;
    try {
      await setupPool.query(schema);
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      const migrationRows = await setupPool.query(
        `SELECT name, checksum FROM schema_migrations ORDER BY name`,
      );
      assert.deepEqual(migrationRows.rows.map((row) => row.name), [
        '001_b3_foundation.up.sql',
        '002_b4_auth_lifecycle.up.sql',
        '003_b4_phone_constraint_fix.up.sql',
        '004_b5_listing_catalog.up.sql',
        '005_b6_booking_workflow.up.sql',
        '006_b7_communications.up.sql',
        '007_b8_payments_and_ledger.up.sql',
        '008_b9_moderation_and_reviews.up.sql',
        '009_social_auth_providers.up.sql',
        '010_phone_verification.up.sql',
        '011_launch_without_deposit_or_protection.up.sql',
        '012_private_pilot_v4_foundation.up.sql',
        '013_secure_booking_confirmation_challenges.up.sql',
        '014_account_legal_holds.up.sql',
        '015_v51_contract_persistence.up.sql',
        '016_v51_booking_quotes.up.sql',
        '017_v51_contract_receipts.up.sql',
        '018_v51_withdrawal_and_refund_obligations.up.sql',
        '019_v51_condition_evidence.up.sql',
        '020_v51_financial_documents.up.sql',
        '021_firebase_identity_deletion_outbox.up.sql',
        '022_crashlytics_subject_deletion.up.sql',
        '023_v52_contract_binding.up.sql',
        '024_v52_actual_loss_resolution.up.sql',
        '025_v52_handover_return_evidence.up.sql',
        '026_v52_categories_moderation_operator.up.sql',
        '027_g2_persistent_rental_cart.up.sql',
        '028_g3b_booking_group_foundation.up.sql',
        '029_g3c_booking_group_quote_state.up.sql',
        '030_g3d_shared_handover_item_evidence.up.sql',
        '031_g5b_listing_sets.up.sql',
        '032_support_case_foundation.up.sql',
        '033_support_decision_approval_guard.up.sql',
        '034_support_user_action_deadline.up.sql',
        '035_support_final_decision_publication.up.sql',
        '036_support_closed_case_appeal_submission.up.sql',
        '037_support_break_glass_access.up.sql',
        '038_support_message_template_guard.up.sql',
        '039_support_deadline_watchdog.up.sql',
        '040_support_single_issue_intake.up.sql',
        '041_support_closed_account_access_guard.up.sql',
        '042_support_dsa_notice_intake.up.sql',
        '043_support_dsa_notice_locator_completion.up.sql',
        '044_moderation_statement_of_reasons.up.sql',
        '045_independent_moderation_review_resolution.up.sql',
        '046_support_article18_authority_referral_guard.up.sql',
        '047_support_privacy_rights_control_plane.up.sql',
        '048_support_privacy_incident_control_plane.up.sql',
        '049_support_product_safety_intake.up.sql',
        '050_support_legacy_history_import.up.sql',
        '051_support_evidence_security.up.sql',
        '052_support_safety_impact_review.up.sql',
        '053_support_duplicate_case_linking.up.sql',
        '054_support_feedback_priority.up.sql',
        '055_support_progress_updates.up.sql',
        '056_support_account_recovery_guard.up.sql',
        '057_account_recovery_session_integrity.up.sql',
        '058_moderation_account_measure_approval.up.sql',
        '059_support_message_content_block_audit.up.sql',
        '060_harassment_block_report_guard.up.sql',
        '061_booking_exact_address_reveal_guard.up.sql',
        '062_handover_exception_guard.up.sql',
        '063_return_calendar_deadline_guard.up.sql',
        '064_support_status_machine_v1_alignment.up.sql',
        '065_support_direct_decision_path.up.sql',
        '066_blue_ocean_listing_ai_foundation.up.sql',
        '067_blue_ocean_regional_price_engine_v2.up.sql',
        '068_blue_ocean_listing_workflow.up.sql',
        '069_regional_price_engine_r6_hardening.up.sql',
        '070_stage_a_non_binding_simulation_guard.up.sql',
        '071_stripe_connect_accounts_v2.up.sql',
        '072_dispute_transfer_recovery.up.sql',
        '073_listing_ai_on_device_provider.up.sql',
        '074_listing_ai_on_device_disclosure.up.sql',
      ]);
      assert.match(migrationRows.rows[0].checksum, /^[0-9a-f]{64}$/);
      assert.match(migrationRows.rows[2].checksum, /^[0-9a-f]{64}$/);
      assert.match(migrationRows.rows.at(-1).checksum, /^[0-9a-f]{64}$/);
      const n2Client = await setupPool.connect();
      try {
        await n2Client.query('BEGIN');
        await n2Client.query(
          `INSERT INTO users (id, email, profile, role, account_status)
           VALUES ('n2-owner-test', 'n2-owner-test@example.invalid', '{}'::jsonb, 'user', 'active')`,
        );
        const draftId = 'listing_ai_draft_12345678-1234-4123-8123-123456789abc';
        await n2Client.query(
          `INSERT INTO listing_ai_drafts (
             id, domain_version, schema_version, prompt_version, owner_id
           ) VALUES ($1, 'N2-2026-08-23.1', 'listing-ai-draft-v1',
                     'listing-ai-prompt-v1', 'n2-owner-test')`,
          [draftId],
        );
        const confirmations = Object.fromEntries([
          'ownership', 'item_identity', 'allowed_category', 'functionality',
          'condition', 'accessories', 'owner_price', 'duration_discounts',
          'availability', 'pickup_region', 'final_publication',
        ].map((key) => [key, false]));
        const version = await n2Client.query(
          `INSERT INTO listing_ai_draft_versions (
             draft_id, revision, generation_key, generation_mode,
             input_image_refs, fields, clarification_questions,
             owner_confirmations, payload_sha256
           ) VALUES ($1, 1, $2, 'manual_foundation', $3::jsonb, '{}'::jsonb,
                     '[]'::jsonb, $4::jsonb, $5)
           RETURNING id`,
          [
            draftId,
            'a'.repeat(64),
            JSON.stringify(['image_ref_00000001']),
            JSON.stringify(confirmations),
            'b'.repeat(64),
          ],
        );
        const draft = await n2Client.query(
          'SELECT current_revision FROM listing_ai_drafts WHERE id = $1',
          [draftId],
        );
        assert.equal(draft.rows[0].current_revision, 1);

        const onDeviceDraftId =
          'listing_ai_draft_22345678-1234-4123-8123-123456789abc';
        await n2Client.query(
          `INSERT INTO listing_ai_drafts (
             id, domain_version, schema_version, prompt_version, owner_id,
             disclosure_version, disclosure_accepted_at, image_preflight_status
           ) VALUES ($1, 'N2-2026-08-23.1', 'listing-ai-draft-v1',
                     'listing-ai-prompt-v1', 'n2-owner-test',
                     'listing-ai-on-device-disclosure-v1', now(), 'consumed')`,
          [onDeviceDraftId],
        );
        const onDeviceConsent = await n2Client.query(
          `SELECT disclosure_version, disclosure_accepted_at IS NOT NULL AS accepted
             FROM listing_ai_drafts WHERE id = $1`,
          [onDeviceDraftId],
        );
        assert.deepEqual(onDeviceConsent.rows[0], {
          disclosure_version: 'listing-ai-on-device-disclosure-v1',
          accepted: true,
        });

        const onDeviceDisclosureDown = await fs.readFile(
          path.resolve(
            currentDir,
            '../sql/migrations/074_listing_ai_on_device_disclosure.down.sql',
          ),
          'utf8',
        );
        await n2Client.query('SAVEPOINT n2_on_device_disclosure_rollback');
        await assert.rejects(
          n2Client.query(onDeviceDisclosureDown),
          (error) => error.code === 'P0001'
            && error.message
              === 'On-device listing AI disclosure rollback blocked: durable consent history exists',
        );
        await n2Client.query(
          'ROLLBACK TO SAVEPOINT n2_on_device_disclosure_rollback',
        );

        await n2Client.query('SAVEPOINT n2_unknown_disclosure');
        await assert.rejects(
          n2Client.query(
            `INSERT INTO listing_ai_drafts (
               id, domain_version, schema_version, prompt_version, owner_id,
               disclosure_version, disclosure_accepted_at, image_preflight_status
             ) VALUES ('listing_ai_draft_32345678-1234-4123-8123-123456789abc',
                       'N2-2026-08-23.1', 'listing-ai-draft-v1',
                       'listing-ai-prompt-v1', 'n2-owner-test',
                       'unreviewed-disclosure', now(), 'consumed')`,
          ),
          (error) => error.code === '23514'
            && error.constraint === 'listing_ai_drafts_consent_state_check',
        );
        await n2Client.query('ROLLBACK TO SAVEPOINT n2_unknown_disclosure');

        await n2Client.query(
          `INSERT INTO listing_ai_cost_ledger (
             draft_id, generation_key, provider, model, outcome
           ) VALUES ($1, $2, 'on_device', $3, 'succeeded')`,
          [
            draftId,
            'd'.repeat(64),
            'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1',
          ],
        );
        await n2Client.query(
          `INSERT INTO listing_ai_budget_aggregates (
             period_key, provider, budget_cents, spent_cents,
             reserved_cents, call_count
           ) VALUES ('2026-09', 'on_device', 0, 0, 0, 1)`,
        );

        await n2Client.query('SAVEPOINT n2_append_only');
        await assert.rejects(
          n2Client.query(
            `UPDATE listing_ai_draft_versions SET fields = '{"title": {}}'::jsonb
              WHERE id = $1`,
            [version.rows[0].id],
          ),
          (error) => error.code === '55000'
            && error.message === 'listing_ai_record_is_append_only',
        );
        await n2Client.query('ROLLBACK TO SAVEPOINT n2_append_only');

        await n2Client.query(
          `INSERT INTO listing_ai_analysis_derivatives (
             draft_id, image_reference, derivative_kind, storage_reference,
             expires_at
           ) VALUES ($1, 'image_ref_00000001', 'resized_analysis_copy',
                     'derivative_ref_00000001', now() + interval '1 hour')`,
          [draftId],
        );
        await n2Client.query(
          `UPDATE listing_ai_analysis_derivatives
              SET state = 'analysis_ready', updated_at = updated_at + interval '1 second'
            WHERE draft_id = $1`,
          [draftId],
        );
        const derivative = await n2Client.query(
          `SELECT state FROM listing_ai_analysis_derivatives WHERE draft_id = $1`,
          [draftId],
        );
        assert.equal(derivative.rows[0].state, 'analysis_ready');

        await n2Client.query('SAVEPOINT n2_derivative_delete');
        await assert.rejects(
          n2Client.query(
            'DELETE FROM listing_ai_analysis_derivatives WHERE draft_id = $1',
            [draftId],
          ),
          (error) => error.code === '55000'
            && error.message === 'listing_ai_derivative_delete_requires_purge',
        );
        await n2Client.query('ROLLBACK TO SAVEPOINT n2_derivative_delete');

        await n2Client.query('SAVEPOINT n2_coarse_region');
        await assert.rejects(
          n2Client.query(
            `INSERT INTO regional_market_observations (
               draft_id, coarse_region_key, category_id, subcategory,
               daily_price_minor, source_type, observed_at
             ) VALUES ($1, 'heilbronn_74072', 'cat8', 'Bohrmaschinen',
                       1200, 'synthetic_test', now())`,
            [draftId],
          ),
          (error) => error.code === '23514',
        );
        await n2Client.query('ROLLBACK TO SAVEPOINT n2_coarse_region');

        const n5Observation = await n2Client.query(
          `INSERT INTO regional_market_observations (
             draft_id, coarse_region_key, category_id, subcategory,
             daily_price_minor, source_type, observed_at,
             market_observation_version, brand_model_family, condition_class,
             market_actor_type, geography_bucket, state_code, country_code,
             distance_millikm, source_class, source_quality_basis_points,
             status_class, provenance_reference, reviewed,
             amount_includes_only_rent, synthetic, engine_eligible
           ) VALUES (
             $1, 'heilbronn_wave0', 'power_tools', 'Bohrmaschinen',
             1500, 'pilot_aggregate', now(),
             'regional-market-observation-v2', 'Bosch Professional', 'good',
             'private', 'heilbronn_wave0', 'DE-BW', 'DE', 5000,
             'completed_sit_rental', 10000, 'completed',
             'provenance_reference_00000001', true, true, false, true
           ) RETURNING engine_eligible, source_quality_basis_points`,
          [draftId],
        );
        assert.deepEqual(n5Observation.rows[0], {
          engine_eligible: true,
          source_quality_basis_points: 10000,
        });

        await n2Client.query('SAVEPOINT n5_synthetic_quality');
        await assert.rejects(
          n2Client.query(
            `INSERT INTO regional_market_observations (
               draft_id, coarse_region_key, category_id, subcategory,
               daily_price_minor, source_type, observed_at,
               market_observation_version, condition_class, market_actor_type,
               geography_bucket, state_code, country_code, distance_millikm,
               source_class, source_quality_basis_points, status_class,
               provenance_reference, reviewed, amount_includes_only_rent,
               synthetic, engine_eligible, exclusion_reason_code
             ) VALUES (
               $1, 'heilbronn_wave0', 'power_tools', 'Bohrmaschinen',
               1500, 'synthetic_test', now(),
               'regional-market-observation-v2', 'good', 'private',
               'heilbronn_wave0', 'DE-BW', 'DE', 5000,
               'synthetic_fixture', 10000, 'synthetic',
               'provenance_reference_00000002', true, true, true, false,
               'synthetic_zero_weight'
             )`,
            [draftId],
          ),
          (error) => error.code === '23514',
        );
        await n2Client.query('ROLLBACK TO SAVEPOINT n5_synthetic_quality');

        await n2Client.query(
          `INSERT INTO regional_price_engine_snapshots (
             draft_id, draft_version_id, engine_authority, engine_version,
             input_sha256, range_low_minor, recommended_daily_minor,
             range_high_minor, explanation, snapshot_payload,
             market_observation_version, fallback_anchor_minor,
             regional_weighted_median_minor,
             effective_observation_count_milli, geography_scope, confidence,
             fallback_share_basis_points, demand_factor_basis_points,
             duration_schedule, quote_preview, owner_selected_daily_minor,
             owner_override_applied, synthetic_learning_applied
           ) VALUES (
             $1, $2, 'SIT_REGIONAL_PRICE_ENGINE_V2', 'N5-2026-08-24.1',
             $3, 1400, 1500, 1600, 'Deterministic N5 integration fixture.',
             '{}'::jsonb, 'regional-market-observation-v2', 1700, 1500,
             1000, 'within_20_km', 'LOW', 8889, 10000,
             '{"enabled":true}'::jsonb, '{"simulation":true}'::jsonb,
             1600, true, false
           )`,
          [draftId, version.rows[0].id, 'c'.repeat(64)],
        );
        const {
          loadBlueOceanDraft,
          persistBlueOceanReview,
        } = await import('../src/blue_ocean_listing_store.js');
        const { reviewBlueOceanListingDraft } = await import(
          '../src/blue_ocean_listing_workflow.js'
        );
        const storedN6Draft = await loadBlueOceanDraft(n2Client, {
          draftId,
          ownerId: 'n2-owner-test',
        });
        const n6Confirmations = Object.fromEntries([
          'ownership', 'item_identity', 'allowed_category', 'functionality',
          'condition', 'accessories', 'owner_price', 'duration_discounts',
          'availability', 'pickup_region', 'final_publication',
        ].map((key) => [key, key !== 'final_publication']));
        const n6Review = reviewBlueOceanListingDraft({
          previousRevision: storedN6Draft.revision,
          generationKey: 'd'.repeat(64),
          editedFields: {
            title: 'Akku-Bohrschrauber',
            category: 'cat8',
            subcategory: 'Bohrmaschinen',
            brand: 'Testmarke',
            model: 'M-18',
            description: 'Voll funktionsfähiges N6 Integrations-Testgerät.',
            condition: 'good',
            accessories: ['Ladegerät'],
            projectTags: ['renovation'],
            useCases: ['bohren'],
            safetyNotes: 'Nur bestimmungsgemäß verwenden.',
            replacementValueMinor: 17_500,
            pickupRegion: 'heilbronn_wave0',
          },
          answeredClarificationIds: [],
          ownerConfirmations: n6Confirmations,
          pricing: {
            replacementValueBand: 'eur_100_250',
            ownerConfirmedReplacementValueBand: true,
            ownerConfirmedReplacementValueMinor: null,
            ownerDailyPriceMinor: 1_600,
            durationPricingEnabled: true,
          },
          previewDays: [1, 7],
          imagePreflightPassed: true,
          consentValid: true,
          generatedAt: new Date('2026-08-24T08:00:00.000Z'),
        });
        const persistedN6Review = await persistBlueOceanReview(n2Client, {
          ownerId: 'n2-owner-test',
          review: n6Review,
        });
        assert.equal(persistedN6Review.replayed, false);
        const n6StoredState = await n2Client.query(
          `SELECT draft.status, version.review_metadata,
                  snapshot.owner_selected_daily_minor
             FROM listing_ai_drafts AS draft
             JOIN listing_ai_draft_versions AS version
               ON version.draft_id = draft.id AND version.revision = 2
             JOIN regional_price_engine_snapshots AS snapshot
               ON snapshot.draft_version_id = version.id
            WHERE draft.id = $1`,
          [draftId],
        );
        assert.equal(n6StoredState.rows[0].status, 'review_ready');
        assert.equal(
          n6StoredState.rows[0].review_metadata.readiness.previewReady,
          true,
        );
        assert.equal(
          Number(n6StoredState.rows[0].owner_selected_daily_minor),
          1_600,
        );
        await n2Client.query('DELETE FROM listing_ai_drafts WHERE id = $1', [draftId]);
        const cascaded = await n2Client.query(
          `SELECT
             (SELECT count(*)::int FROM listing_ai_draft_versions WHERE draft_id = $1) AS versions,
             (SELECT count(*)::int FROM listing_ai_analysis_derivatives WHERE draft_id = $1) AS derivatives`,
          [draftId],
        );
        assert.deepEqual(cascaded.rows[0], { versions: 0, derivatives: 0 });
        await n2Client.query('ROLLBACK');
      } finally {
        n2Client.release();
      }
      const returnCalendarColumns = await setupPool.query(
        `SELECT column_name, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'v52_return_cases'
            AND column_name IN ('deadline_timezone', 'deadline_policy_version')
          ORDER BY column_name`,
      );
      assert.deepEqual(returnCalendarColumns.rows, [
        { column_name: 'deadline_policy_version', column_default: '1' },
        {
          column_name: 'deadline_timezone',
          column_default: "'Europe/Berlin'::text",
        },
      ]);
      const returnCalendarConstraints = await setupPool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE conrelid = 'v52_return_cases'::regclass
            AND conname IN (
              'v52_return_cases_response_calendar_check',
              'v52_return_cases_update_calendar_check'
            )
          ORDER BY conname`,
      );
      assert.equal(returnCalendarConstraints.rowCount, 2);
      assert.equal(
        returnCalendarConstraints.rows.every((row) =>
          row.definition.includes('deadline_policy_version')
            && row.definition.includes('AT TIME ZONE deadline_timezone')),
        true,
      );
      const rentalCartTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [['rental_cart_items', 'rental_cart_projects', 'rental_carts']],
      );
      assert.deepEqual(rentalCartTables.rows, [
        { table_name: 'rental_cart_items' },
        { table_name: 'rental_cart_projects' },
        { table_name: 'rental_carts' },
      ]);
      const bookingGroupTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [[
          'booking_group_appointment_commands',
          'booking_group_appointments',
          'booking_group_commands',
          'booking_group_position_booking_bindings',
          'booking_group_positions',
          'booking_group_quote_positions',
          'booking_group_quotes',
          'booking_group_state_events',
          'booking_groups',
        ]],
      );
      assert.deepEqual(bookingGroupTables.rows, [
        { table_name: 'booking_group_appointment_commands' },
        { table_name: 'booking_group_appointments' },
        { table_name: 'booking_group_commands' },
        { table_name: 'booking_group_position_booking_bindings' },
        { table_name: 'booking_group_positions' },
        { table_name: 'booking_group_quote_positions' },
        { table_name: 'booking_group_quotes' },
        { table_name: 'booking_group_state_events' },
        { table_name: 'booking_groups' },
      ]);
      const listingSetTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [['listing_set_version_members', 'listing_set_versions', 'listing_sets']],
      );
      assert.deepEqual(listingSetTables.rows, [
        { table_name: 'listing_set_version_members' },
        { table_name: 'listing_set_versions' },
        { table_name: 'listing_sets' },
      ]);
      const supportCaseTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [[
          'support_article18_assessments',
          'support_appeals',
          'support_break_glass_grants',
          'support_case_events',
          'support_case_links',
          'support_case_progress_updates',
          'support_cases',
          'support_decisions',
          'support_deadline_watchdog_state',
          'support_evidence',
          'support_evidence_access_grants',
          'support_evidence_files',
          'support_dsa_notice_locator_amendments',
          'support_messages',
          'support_policy_snapshots',
          'support_legacy_history_entries',
          'support_legacy_imports',
          'support_privacy_incident_containment_actions',
          'support_privacy_incidents',
        ]],
      );
      assert.deepEqual(supportCaseTables.rows, [
        { table_name: 'support_appeals' },
        { table_name: 'support_article18_assessments' },
        { table_name: 'support_break_glass_grants' },
        { table_name: 'support_case_events' },
        { table_name: 'support_case_links' },
        { table_name: 'support_case_progress_updates' },
        { table_name: 'support_cases' },
        { table_name: 'support_deadline_watchdog_state' },
        { table_name: 'support_decisions' },
        { table_name: 'support_dsa_notice_locator_amendments' },
        { table_name: 'support_evidence' },
        { table_name: 'support_evidence_access_grants' },
        { table_name: 'support_evidence_files' },
        { table_name: 'support_legacy_history_entries' },
        { table_name: 'support_legacy_imports' },
        { table_name: 'support_messages' },
        { table_name: 'support_policy_snapshots' },
        { table_name: 'support_privacy_incident_containment_actions' },
        { table_name: 'support_privacy_incidents' },
      ]);
      const accountSuspensionApprovalTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'moderation_account_suspension_proposals'`,
      );
      assert.deepEqual(accountSuspensionApprovalTables.rows, [{
        table_name: 'moderation_account_suspension_proposals',
      }]);
      const accountSuspensionMeasureColumns = await setupPool.query(
        `SELECT table_name, column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
            AND column_name = ANY($2::text[])
          ORDER BY table_name, column_name`,
        [[
          'moderation_decisions',
          'user_suspensions',
        ], [
          'account_suspension_proposal_id',
          'measure_status',
          'moderation_decision_id',
          'no_guilt_determination',
          'user_facing_measure_notice',
          'user_facing_notice',
        ]],
      );
      assert.deepEqual(accountSuspensionMeasureColumns.rows, [
        { table_name: 'moderation_decisions', column_name: 'account_suspension_proposal_id', is_nullable: 'YES' },
        { table_name: 'moderation_decisions', column_name: 'measure_status', is_nullable: 'NO' },
        { table_name: 'moderation_decisions', column_name: 'no_guilt_determination', is_nullable: 'NO' },
        { table_name: 'moderation_decisions', column_name: 'user_facing_measure_notice', is_nullable: 'YES' },
        { table_name: 'user_suspensions', column_name: 'account_suspension_proposal_id', is_nullable: 'YES' },
        { table_name: 'user_suspensions', column_name: 'measure_status', is_nullable: 'NO' },
        { table_name: 'user_suspensions', column_name: 'moderation_decision_id', is_nullable: 'YES' },
        { table_name: 'user_suspensions', column_name: 'no_guilt_determination', is_nullable: 'NO' },
        { table_name: 'user_suspensions', column_name: 'user_facing_notice', is_nullable: 'YES' },
      ]);
      const supportIntakeScopeColumn = await setupPool.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_cases'
            AND column_name = 'intake_scope_evidence'`,
      );
      assert.deepEqual(supportIntakeScopeColumn.rows, [{
        column_name: 'intake_scope_evidence',
        data_type: 'jsonb',
        is_nullable: 'YES',
      }]);
      const supportFeedbackContextColumn = await setupPool.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_cases'
            AND column_name = 'feedback_context'`,
      );
      assert.deepEqual(supportFeedbackContextColumn.rows, [{
        column_name: 'feedback_context',
        data_type: 'jsonb',
        is_nullable: 'YES',
      }]);
      const supportArticle18CandidateColumn = await setupPool.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_cases'
            AND column_name = 'article18_candidate_flag'`,
      );
      assert.equal(supportArticle18CandidateColumn.rows[0].column_name, 'article18_candidate_flag');
      assert.equal(supportArticle18CandidateColumn.rows[0].data_type, 'boolean');
      assert.equal(supportArticle18CandidateColumn.rows[0].is_nullable, 'NO');
      assert.match(supportArticle18CandidateColumn.rows[0].column_default, /false/u);
      const supportDsaNoticeColumns = await setupPool.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_cases'
            AND column_name = ANY($1::text[])
          ORDER BY column_name`,
        [[
          'dsa_notice_evidence',
          'dsa_notice_locator_kind',
          'dsa_notice_locator_status',
          'dsa_notice_number',
        ]],
      );
      assert.deepEqual(supportDsaNoticeColumns.rows, [
        {
          column_name: 'dsa_notice_evidence',
          data_type: 'jsonb',
          is_nullable: 'YES',
        },
        {
          column_name: 'dsa_notice_locator_kind',
          data_type: 'text',
          is_nullable: 'YES',
        },
        {
          column_name: 'dsa_notice_locator_status',
          data_type: 'text',
          is_nullable: 'YES',
        },
        {
          column_name: 'dsa_notice_number',
          data_type: 'text',
          is_nullable: 'YES',
        },
      ]);
      const supportDecisionColumns = await setupPool.query(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_decisions'
            AND column_name = ANY($1::text[])
          ORDER BY column_name`,
        [[
          'approval_payload_sha256',
          'approval_status',
          'communicated_by',
          'communication_payload_sha256',
          'implementation_reference',
          'implementation_verified_at',
          'payload_sha256',
          'user_facing_decision',
          'user_facing_effect',
          'user_facing_implementation_result',
        ]],
      );
      assert.deepEqual(supportDecisionColumns.rows, [
        { column_name: 'approval_payload_sha256', is_nullable: 'YES' },
        { column_name: 'approval_status', is_nullable: 'NO' },
        { column_name: 'communicated_by', is_nullable: 'YES' },
        { column_name: 'communication_payload_sha256', is_nullable: 'YES' },
        { column_name: 'implementation_reference', is_nullable: 'YES' },
        { column_name: 'implementation_verified_at', is_nullable: 'YES' },
        { column_name: 'payload_sha256', is_nullable: 'NO' },
        { column_name: 'user_facing_decision', is_nullable: 'YES' },
        { column_name: 'user_facing_effect', is_nullable: 'YES' },
        { column_name: 'user_facing_implementation_result', is_nullable: 'YES' },
      ]);
      const supportAppealColumns = await setupPool.query(
        `SELECT table_name, column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'support_cases' AND column_name = ANY($1::text[]))
              OR (table_name = 'support_appeals' AND column_name = ANY($2::text[]))
            )
          ORDER BY table_name, column_name`,
        [[
          'appeal_configured_at',
          'appeal_configured_by',
        ], [
          'human_readable_appeal_number',
          'next_update_at',
        ]],
      );
      assert.deepEqual(supportAppealColumns.rows, [
        { table_name: 'support_appeals', column_name: 'human_readable_appeal_number', is_nullable: 'YES' },
        { table_name: 'support_appeals', column_name: 'next_update_at', is_nullable: 'YES' },
        { table_name: 'support_cases', column_name: 'appeal_configured_at', is_nullable: 'YES' },
        { table_name: 'support_cases', column_name: 'appeal_configured_by', is_nullable: 'YES' },
      ]);
      const supportMessageColumns = await setupPool.query(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'support_messages'
            AND column_name = ANY($1::text[])
          ORDER BY column_name`,
        [[
          'approval_payload_sha256',
          'corrects_message_id',
          'lock_version',
          'message_title',
          'rendered_content_sha256',
          'review_outcome',
          'reviewed_by',
        ]],
      );
      assert.deepEqual(supportMessageColumns.rows, [
        { column_name: 'approval_payload_sha256', is_nullable: 'YES' },
        { column_name: 'corrects_message_id', is_nullable: 'YES' },
        { column_name: 'lock_version', is_nullable: 'NO' },
        { column_name: 'message_title', is_nullable: 'NO' },
        { column_name: 'rendered_content_sha256', is_nullable: 'NO' },
        { column_name: 'review_outcome', is_nullable: 'YES' },
        { column_name: 'reviewed_by', is_nullable: 'YES' },
      ]);
      const financialDocumentTables = await setupPool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [['financial_document_events', 'financial_documents']],
      );
      assert.deepEqual(financialDocumentTables.rows, [
        { table_name: 'financial_document_events' },
        { table_name: 'financial_documents' },
      ]);
      const confirmationChallengeColumns = await setupPool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'booking_confirmation_challenges'
          ORDER BY ordinal_position`,
      );
      assert.deepEqual(
        confirmationChallengeColumns.rows.map((row) => row.column_name),
        [
          'id',
          'booking_id',
          'segment',
          'presenter_role',
          'presenter_user_id',
          'verifier_user_id',
          'code_digest',
          'issued_at',
          'expires_at',
          'consumed_at',
          'revoked_at',
          'attempt_count',
          'locked_at',
          'metadata',
        ],
      );
      const launchTruthConstraints = await setupPool.query(
        `SELECT conname, convalidated
         FROM pg_constraint
         WHERE conname = ANY($1::text[])
         ORDER BY conname`,
        [[
          'bookings_launch_no_deposit_check',
          'deposit_charges_launch_disabled_check',
          'deposit_mandates_launch_disabled_check',
          'listings_launch_no_deposit_check',
          'listings_launch_no_protection_check',
          'payments_launch_no_deposit_check',
        ]],
      );
      assert.deepEqual(launchTruthConstraints.rows, [
        { conname: 'bookings_launch_no_deposit_check', convalidated: true },
        { conname: 'deposit_charges_launch_disabled_check', convalidated: true },
        { conname: 'deposit_mandates_launch_disabled_check', convalidated: true },
        { conname: 'listings_launch_no_deposit_check', convalidated: true },
        { conname: 'listings_launch_no_protection_check', convalidated: true },
        { conname: 'payments_launch_no_deposit_check', convalidated: true },
      ]);
      const launchTruthTriggers = await setupPool.query(
        `SELECT trigger.tgname, trigger.tgenabled
         FROM pg_trigger AS trigger
         WHERE trigger.tgname = ANY($1::text[])
           AND NOT trigger.tgisinternal
         ORDER BY trigger.tgname`,
        [[
          'deposit_charges_launch_insert_block',
          'deposit_charges_launch_update_block',
          'deposit_mandates_launch_insert_block',
          'deposit_mandates_launch_update_block',
          'ledger_entries_launch_deposit_insert_block',
          'ledger_transactions_launch_deposit_insert_block',
          'payment_commands_launch_deposit_insert_block',
        ]],
      );
      assert.deepEqual(launchTruthTriggers.rows, [
        { tgname: 'deposit_charges_launch_insert_block', tgenabled: 'O' },
        { tgname: 'deposit_charges_launch_update_block', tgenabled: 'O' },
        { tgname: 'deposit_mandates_launch_insert_block', tgenabled: 'O' },
        { tgname: 'deposit_mandates_launch_update_block', tgenabled: 'O' },
        { tgname: 'ledger_entries_launch_deposit_insert_block', tgenabled: 'O' },
        { tgname: 'ledger_transactions_launch_deposit_insert_block', tgenabled: 'O' },
        { tgname: 'payment_commands_launch_deposit_insert_block', tgenabled: 'O' },
      ]);

      await setupPool.query('TRUNCATE users CASCADE');
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status)
         VALUES
           ('owner', 'owner@example.com', '{}'::jsonb, 'user', 'active'),
           ('renter-a', 'renter-a@example.com', '{"displayName":"Renter A"}'::jsonb, 'user', 'active'),
           ('renter-b', 'renter-b@example.com', '{}'::jsonb, 'user', 'active'),
           ('outsider', 'outsider@example.com', '{}'::jsonb, 'user', 'active'),
           ('s4h-target', 's4h-target@example.com', '{}'::jsonb, 'user', 'active'),
           ('s4h-provisional', 's4h-provisional@example.com', '{}'::jsonb, 'user', 'active'),
           ('s4j-target', 's4j-target@example.com', '{}'::jsonb, 'user', 'active'),
           ('admin', 'admin@example.com', '{}'::jsonb, 'admin', 'active'),
           ('admin-reviewer', 'admin-reviewer@example.com', '{}'::jsonb, 'admin', 'active'),
           ('support', 'support@example.com', '{}'::jsonb, 'support', 'active'),
           ('suspended', 'suspended@example.com', '{}'::jsonb, 'user', 'suspended')`,
      );
      const supportPolicy = await setupPool.query(
        `INSERT INTO support_policy_snapshots (
           policy_type, version, effective_from, rule_values,
           source_document_ids, approval_reference, content_sha256
         ) VALUES (
           'support_decision_test', 'integration-v1', now() - interval '1 day',
           '{"mode":"simulation"}'::jsonb, ARRAY['integration-test'],
           'Technical integration test only', $1
         ) RETURNING id`,
        ['a'.repeat(64)],
      );
      const supportCase = await setupPool.query(
        `INSERT INTO support_cases (
           human_readable_case_number, case_type, case_subtype, status,
           priority, severity, source_channel, operating_mode,
           reporter_user_id, reporter_role, current_owner_id,
           current_owner_role, approval_level, waiting_on, next_action,
           next_update_at, user_facing_summary, internal_summary,
           policy_snapshot_id, idempotency_key, intake_scope_evidence
         ) VALUES (
           'SIT-BCDFGHJKLMNP', 'money_case', 'refund_request_or_review',
           'under_review', 'p1', 'high', 'internal', 'simulation',
           'owner', 'user', 'support', 'finance_owner',
           'red_explicit_decision', 'support_owner',
           'Verify the exact simulation-only proposal.', now() + interval '1 day',
           'Refund review in the internal test environment.',
           'No provider call or real money action is authorized.',
           $1, 'support-case-ledger-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         ) RETURNING id`,
        [supportPolicy.rows[0].id],
      );
      const p0BreakGlassCase = await setupPool.query(
        `INSERT INTO support_cases (
           human_readable_case_number, case_type, case_subtype, status,
           priority, severity, source_channel, operating_mode,
           reporter_user_id, reporter_role, affected_user_ids,
           current_owner_id, current_owner_role, approval_level, waiting_on,
           next_action, next_update_at, user_facing_summary, internal_summary,
           policy_snapshot_id, idempotency_key, intake_scope_evidence
         ) VALUES (
           'SIT-QRSTVWXYZ234', 'trust_safety', 'immediate_physical_danger',
           'under_review', 'p0', 'critical', 'internal', 'simulation',
           'owner', 'user', ARRAY['renter-a'], NULL, 'trust_safety_owner',
           'red_explicit_decision', 'trust_safety_owner',
           'Perform the bounded P0 simulation review.', now() + interval '15 minutes',
           'A critical internal test case is under review.',
           'Synthetic P0 case for break-glass integration only.',
           $1, 'support-break-glass-p0-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         ) RETURNING id`,
        [supportPolicy.rows[0].id],
      );
      const greenSupportCase = await setupPool.query(
        `INSERT INTO support_cases (
           human_readable_case_number, case_type, case_subtype, status,
           priority, severity, source_channel, operating_mode,
           reporter_user_id, reporter_role, current_owner_id,
           current_owner_role, approval_level, waiting_on, next_action,
           next_update_at, user_facing_summary, internal_summary,
           policy_snapshot_id, idempotency_key, intake_scope_evidence
         ) VALUES (
           'SIT-CDFGHJKLMNPQ', 'general_help', 'general_how_to',
           'under_review', 'p3', 'low', 'internal', 'simulation',
           'owner', 'user', 'support', 'general_support_owner',
           'green_automatic', 'support_owner',
           'Record the bounded reviewed information decision.',
           now() + interval '1 day',
           'A general internal test question is under review.',
           'No account, money or external action is authorized.',
           $1, 'support-green-direct-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         ) RETURNING id`,
        [supportPolicy.rows[0].id],
      );
      const directDecision = await setupPool.query(
        `INSERT INTO support_decisions (
           case_id, decision_code, decision_scope,
           confirmed_facts_considered, material_uncertainties,
           policy_snapshot_id, rule_reference, measure_type,
           affected_entity_ids, unaffected_areas,
           implementation_plan, automation_used, decided_by, approved_by,
           approved_at, approval_payload_sha256, user_facing_decision,
           user_facing_effect, user_facing_reason,
           user_facing_implementation_result, internal_reason, redress_route,
           implementation_status, idempotency_key, approval_status,
           approval_path, payload_sha256
         ) VALUES (
           $1, 'support.information_only', 'Only this internal green case.',
           '["The internal question is bounded."]'::jsonb, '[]'::jsonb,
           $2, 'Support Packet V1 direct-decision binding',
           'information_only', ARRAY['integration-green-case'],
           '["No account or payment state changes."]'::jsonb,
           'Record only the reviewed information result.', false,
           'admin', 'admin', now(), $3,
           'The internal review is complete.',
           'No account or payment state changes.',
           'The reviewed information answers the bounded question.',
           'The reviewed result is recorded in the internal test case.',
           'This is a single-reviewer internal database test.',
           'A separate human review remains available.', 'not_started',
           'support-green-direct-decision-integration', 'approved',
           'direct_single_reviewer', $3
         ) RETURNING id, approval_status, approval_path, approved_by, decided_by`,
        [greenSupportCase.rows[0].id, supportPolicy.rows[0].id, 'c'.repeat(64)],
      );
      assert.deepEqual(directDecision.rows[0], {
        id: directDecision.rows[0].id,
        approval_status: 'approved',
        approval_path: 'direct_single_reviewer',
        approved_by: 'admin',
        decided_by: 'admin',
      });
      const directlyDecidedCase = await setupPool.query(
        `UPDATE support_cases
            SET status = 'decided', decision_id = $2,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING status, decision_id`,
        [greenSupportCase.rows[0].id, directDecision.rows[0].id],
      );
      assert.deepEqual(directlyDecidedCase.rows[0], {
        status: 'decided',
        decision_id: directDecision.rows[0].id,
      });
      await assert.rejects(
        setupPool.query(
          `INSERT INTO support_decisions (
             case_id, decision_code, decision_scope,
             confirmed_facts_considered, material_uncertainties,
             policy_snapshot_id, rule_reference, measure_type,
             affected_entity_ids, unaffected_areas,
             implementation_plan, automation_used, decided_by, approved_by,
             approved_at, approval_payload_sha256, user_facing_decision,
             user_facing_effect, user_facing_reason,
             user_facing_implementation_result, internal_reason, redress_route,
             implementation_status, idempotency_key, approval_status,
             approval_path, payload_sha256
           ) VALUES (
             $1, 'support.no_measure', 'Invalid direct red decision probe.',
             '["The case is red."]'::jsonb, '[]'::jsonb, $2,
             'Support Packet V1 red boundary', 'no_measure', ARRAY[]::text[],
             '["No action is allowed."]'::jsonb,
             'Reject before any implementation.', false, 'admin', 'admin',
             now(), $3, 'No decision was made.', 'No effect is authorized.',
             'The red case requires a separate reviewer.',
             'No implementation occurred.', 'Negative database guard probe.',
             'Use the separate review path.', 'not_started',
             'support-red-direct-rejected-integration', 'approved',
             'direct_single_reviewer', $3
           )`,
          [supportCase.rows[0].id, supportPolicy.rows[0].id, 'd'.repeat(64)],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_direct_decision_path_invalid',
      );
      const supportDecision = await setupPool.query(
        `INSERT INTO support_decisions (
           case_id, decision_code, decision_scope,
           confirmed_facts_considered, material_uncertainties,
           policy_snapshot_id, rule_reference, measure_type, amount_minor,
           currency, affected_entity_ids, unaffected_areas,
           implementation_plan, automation_used, decided_by,
           user_facing_decision, user_facing_effect, user_facing_reason,
           user_facing_implementation_result, internal_reason, redress_route,
           implementation_status, idempotency_key, payload_sha256
         ) VALUES (
           $1, 'support.simulated_refund_review',
           'Only this internal integration-test case.',
           '["The database state is synthetic."]'::jsonb,
           '["No provider approval exists."]'::jsonb,
           $2, 'Support Packet V1 test binding',
           'simulated_refund_review', 100, 'EUR', ARRAY['integration-case'],
           '["No payment or account state changes."]'::jsonb,
           'Record only the verified internal simulation result.', false,
           'support', 'The internal review is complete.',
           'No account or payment state changes.',
           'The simulated review was recorded.',
           'The verified result was recorded in the internal test case.',
           'This is an internal database integration test.',
           'A separate human review remains available.', 'not_started',
           'support-decision-ledger-integration', $3
         ) RETURNING id, approval_status, approved_by, lock_version`,
        [supportCase.rows[0].id, supportPolicy.rows[0].id, 'b'.repeat(64)],
      );
      assert.deepEqual(supportDecision.rows[0], {
        id: supportDecision.rows[0].id,
        approval_status: 'pending',
        approved_by: null,
        lock_version: 1,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET decision_scope = 'Mutated after proposal creation.',
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_decision_payload_immutable',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET user_facing_effect = 'Changed after payload hashing.',
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_decision_payload_immutable',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET approval_status = 'approved', approved_by = 'admin',
                  approved_at = now(), approval_payload_sha256 = payload_sha256,
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_decision_case_not_pending_approval',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET decision_id = $2, lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportCase.rows[0].id, supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_case_decision_binding_invalid',
      );
      const pendingSupportCase = await setupPool.query(
        `UPDATE support_cases
            SET status = 'decision_pending_approval', decision_id = $2,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING status, decision_id, lock_version`,
        [supportCase.rows[0].id, supportDecision.rows[0].id],
      );
      assert.deepEqual(pendingSupportCase.rows[0], {
        status: 'decision_pending_approval',
        decision_id: supportDecision.rows[0].id,
        lock_version: 2,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET approval_status = 'approved', approved_by = decided_by,
                  approved_at = now(), approval_payload_sha256 = payload_sha256,
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.constraint === 'support_decisions_approval_truth_check',
      );
      const approvedSupportDecision = await setupPool.query(
        `UPDATE support_decisions
            SET approval_status = 'approved', approved_by = 'admin',
                approved_at = now(), approval_payload_sha256 = payload_sha256,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING approval_status, approved_by, approval_payload_sha256,
                    payload_sha256, lock_version`,
        [supportDecision.rows[0].id],
      );
      assert.equal(approvedSupportDecision.rows[0].approval_status, 'approved');
      assert.equal(approvedSupportDecision.rows[0].approved_by, 'admin');
      assert.equal(
        approvedSupportDecision.rows[0].approval_payload_sha256,
        approvedSupportDecision.rows[0].payload_sha256,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET approved_by = 'support', lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_decision_approval_final',
      );
      const decidedSupportCase = await setupPool.query(
        `UPDATE support_cases
            SET status = 'decided', lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING status, decision_id, lock_version`,
        [supportCase.rows[0].id],
      );
      assert.deepEqual(decidedSupportCase.rows[0], {
        status: 'decided',
        decision_id: supportDecision.rows[0].id,
        lock_version: 3,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET status = 'resolved', waiting_on = 'none',
                  next_action = NULL, next_update_at = NULL,
                  resolution_reference = 'Unverified implementation.',
                  resolved_at = now(), lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportCase.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_case_implementation_not_verified',
      );
      const implementedSupportDecision = await setupPool.query(
        `UPDATE support_decisions
            SET implementation_status = 'succeeded',
                implementation_reference = 'Verified internal simulation only.',
                implementation_verified_by = 'admin',
                implementation_verified_at = now(), implemented_at = now(),
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '2 seconds'
          WHERE id = $1
          RETURNING implementation_status, implementation_verified_by,
                    implementation_reference`,
        [supportDecision.rows[0].id],
      );
      assert.deepEqual(implementedSupportDecision.rows[0], {
        implementation_status: 'succeeded',
        implementation_verified_by: 'admin',
        implementation_reference: 'Verified internal simulation only.',
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET status = 'resolved', waiting_on = 'none',
                  next_action = NULL, next_update_at = NULL,
                  resolution_reference = 'Verified but not communicated.',
                  resolved_at = now(), lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportCase.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_case_decision_not_communicated',
      );
      const communicatedSupportDecision = await setupPool.query(
        `UPDATE support_decisions
            SET communicated_at = implemented_at + interval '1 second',
                communicated_by = 'admin',
                communication_payload_sha256 = payload_sha256,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '3 seconds'
          WHERE id = $1
          RETURNING communicated_at, communicated_by,
                    communication_payload_sha256, payload_sha256`,
        [supportDecision.rows[0].id],
      );
      assert.equal(communicatedSupportDecision.rows[0].communicated_by, 'admin');
      assert.equal(
        communicatedSupportDecision.rows[0].communication_payload_sha256,
        communicatedSupportDecision.rows[0].payload_sha256,
      );
      const resolvedSupportCase = await setupPool.query(
        `UPDATE support_cases
            SET status = 'resolved', waiting_on = 'none',
                next_action = NULL, next_update_at = NULL,
                resolution_reference = 'Verified internal simulation only.',
                resolved_at = now(), lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING status, resolution_reference, lock_version`,
        [supportCase.rows[0].id],
      );
      assert.deepEqual(resolvedSupportCase.rows[0], {
        status: 'resolved',
        resolution_reference: 'Verified internal simulation only.',
        lock_version: 4,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_decisions
              SET implementation_reference = 'Rewritten evidence.',
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportDecision.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_decision_implementation_evidence_immutable',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET status = 'closed', closure_reason = 'resolved_action_completed',
                  closed_at = now(), appeal_available = true,
                  appeal_deadline = now() + interval '21 days',
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportCase.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_appeal_configuration_required',
      );
      const closedSupportCase = await setupPool.query(
        `UPDATE support_cases
            SET status = 'closed', closure_reason = 'resolved_action_completed',
                closed_at = now(), appeal_available = true,
                appeal_deadline = now() + interval '21 days',
                appeal_configured_at = now(), appeal_configured_by = 'admin',
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING status, appeal_available, appeal_configured_by, lock_version`,
        [supportCase.rows[0].id],
      );
      assert.deepEqual(closedSupportCase.rows[0], {
        status: 'closed',
        appeal_available: true,
        appeal_configured_by: 'admin',
        lock_version: 5,
      });
      await assert.rejects(
        setupPool.query(
          `INSERT INTO support_appeals (
             original_decision_id, case_id, grounds, new_evidence_ids,
             submitted_by, idempotency_key, human_readable_appeal_number,
             next_update_at
           ) VALUES (
             $1, $2, 'Review with unsafe unbound evidence.',
             ARRAY[gen_random_uuid()], 'owner', 'support-appeal-invalid-evidence',
             'SIT-R-BCDFGHJKLMNP', now() + interval '1 hour'
           )`,
          [supportDecision.rows[0].id, supportCase.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_appeal_evidence_not_enabled',
      );
      const supportAppeal = await setupPool.query(
        `INSERT INTO support_appeals (
           original_decision_id, case_id, grounds, new_evidence_ids,
           submitted_by, idempotency_key, human_readable_appeal_number,
           next_update_at
         ) VALUES (
           $1, $2, 'Please perform the separate human review.', '{}',
           'owner', 'support-appeal-integration', 'SIT-R-CDFGHJKLMNPQ',
           now() + interval '1 hour'
         ) RETURNING id, status, human_readable_appeal_number`,
        [supportDecision.rows[0].id, supportCase.rows[0].id],
      );
      assert.equal(supportAppeal.rows[0].status, 'submitted');
      const appealBoundCase = await setupPool.query(
        `UPDATE support_cases
            SET appeal_available = false, appeal_id = $2,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1
          RETURNING appeal_available, appeal_id, status, lock_version`,
        [supportCase.rows[0].id, supportAppeal.rows[0].id],
      );
      assert.deepEqual(appealBoundCase.rows[0], {
        appeal_available: false,
        appeal_id: supportAppeal.rows[0].id,
        status: 'closed',
        lock_version: 6,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_appeals
              SET grounds = 'Rewritten appeal grounds.'
            WHERE id = $1`,
          [supportAppeal.rows[0].id],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_appeal_submission_immutable',
      );
      for (const statement of [
        `INSERT INTO deposit_mandates (
           booking_id, renter_id, status, maximum_amount_minor,
           currency, consent_version, consented_at
         ) VALUES ('retired-booking', 'renter-a', 'failed', 0, 'EUR', 'retired', now())`,
        `INSERT INTO deposit_charges (
           mandate_id, booking_id, dispute_id, idempotency_key,
           status, amount_minor, currency, reason
         ) VALUES (
           gen_random_uuid(), 'retired-booking', gen_random_uuid(),
           'retired-deposit-charge', 'failed', 1, 'EUR', 'retired'
         )`,
        `INSERT INTO payment_commands (
           idempotency_key, actor_id, command_type, request_hash
         ) VALUES ('retired-deposit-command', 'renter-a', 'deposit.setup', $1)`,
        `INSERT INTO ledger_transactions (
           idempotency_key, transaction_type, currency
         ) VALUES ('retired-deposit-ledger', 'deposit_charged', 'EUR')`,
        `INSERT INTO ledger_entries (
           transaction_id, account_code, debit_minor, credit_minor
         ) VALUES (gen_random_uuid(), 'deposit_hold', 1, 0)`,
      ]) {
        await assert.rejects(
          setupPool.query(statement, statement.includes('$1') ? ['a'.repeat(64)] : []),
          (error) => error?.code === '23514',
        );
      }
      await setupPool.query(
        `UPDATE users SET phone_e164 = '+4915212345678' WHERE id = 'owner'`,
      );
      await setupPool.query(
        `INSERT INTO listings (id, owner_id, payload, is_active)
         VALUES (
           'legacy-b4-rollback-listing', 'owner',
           '{"id":"legacy-b4-rollback-listing","ownerId":"owner","title":"Legacy B4 listing"}'::jsonb,
           true
         )`,
      );
      const legacyB4Listing = await setupPool.query(
        `SELECT catalog_version, is_active, status
         FROM listings WHERE id = 'legacy-b4-rollback-listing'`,
      );
      assert.deepEqual(legacyB4Listing.rows[0], {
        catalog_version: 0,
        is_active: true,
        status: 'active',
      });
      await assert.rejects(
        setupPool.query(`UPDATE users SET phone_e164 = '015212345678' WHERE id = 'owner'`),
        (error) => error?.code === '23514' && error?.constraint === 'users_phone_e164_check',
      );
      const legacyRefresh = await setupPool.query(
        `INSERT INTO refresh_tokens (
           user_id, token_hash, expires_at, user_agent
         ) VALUES (
           'owner', $1, now() + interval '1 day', 'Legacy rollback probe'
         )
         RETURNING id, session_id, family_id`,
        ['a'.repeat(64)],
      );
      assert.equal(legacyRefresh.rows[0].session_id, legacyRefresh.rows[0].id);
      assert.equal(legacyRefresh.rows[0].family_id, legacyRefresh.rows[0].id);
      const legacySession = await setupPool.query(
        `SELECT user_id, device_label FROM auth_sessions WHERE id = $1`,
        [legacyRefresh.rows[0].session_id],
      );
      assert.equal(legacySession.rows[0].user_id, 'owner');
      assert.equal(legacySession.rows[0].device_label, 'Legacy-App-Sitzung');
      const sessionIds = {
        owner: '11111111-1111-4111-8111-111111111111',
        'renter-a': '22222222-2222-4222-8222-222222222222',
        'renter-b': '33333333-3333-4333-8333-333333333333',
        outsider: '44444444-4444-4444-8444-444444444444',
        suspended: '55555555-5555-4555-8555-555555555555',
        admin: '66666666-6666-4666-8666-666666666666',
        'admin-reviewer': '88888888-8888-4888-8888-888888888888',
        support: '77777777-7777-4777-8777-777777777777',
      };
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES
           ($1, 'owner', 'Owner test'),
           ($2, 'renter-a', 'Renter A test'),
           ($3, 'renter-b', 'Renter B test'),
           ($4, 'outsider', 'Outsider test'),
           ($5, 'suspended', 'Suspended test'),
           ($6, 'admin', 'Admin test'),
           ($7, 'admin-reviewer', 'Independent reviewer test'),
           ($8, 'support', 'Support test')`,
        Object.values(sessionIds),
      );
      await setupPool.query(
        `INSERT INTO users (
           id, email, profile, role, account_status, email_verified_at
         )
         SELECT account.id, account.email, '{}'::jsonb, 'user', 'active', now()
           FROM unnest($1::text[], $2::text[]) AS account(id, email)`,
        [
          r8SyntheticAccounts.map((account) => account.id),
          r8SyntheticAccounts.map((account) => account.email),
        ],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         SELECT account.session_id::uuid, account.user_id,
                'R8 bounded concurrency synthetic session'
           FROM unnest($1::text[], $2::text[])
                AS account(session_id, user_id)`,
        [
          r8SyntheticAccounts.map((account) => account.sessionId),
          r8SyntheticAccounts.map((account) => account.id),
        ],
      );
      for (const account of r8SyntheticAccounts) {
        sessionIds[account.id] = account.sessionId;
      }
      const {
        liftUserSuspension,
        setUserSuspension,
      } = await import('../src/moderation_workflow.js');
      const {
        proposePermanentAccountSuspension,
        reviewPermanentAccountSuspensionProposal,
      } = await import('../src/moderation_account_measure_workflow.js');
      const runS4hCommand = async (command) => {
        const client = await setupPool.connect();
        try {
          await client.query('BEGIN');
          const result = await command(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
      await assert.rejects(
        runS4hCommand((client) => setUserSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-target',
          idempotencyKey: 's4h-unapproved-permanent-blocked',
          raw: {
            scope: 'account',
            reasonCode: 'controlled_permanent_measure',
          },
        })),
        (error) => error?.code === 'account_suspension_approval_required',
      );
      const accountProposalResult = await runS4hCommand((client) => (
        proposePermanentAccountSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-target',
          idempotencyKey: 's4h-permanent-proposal',
          raw: {
            reasonCode: 'controlled_permanent_measure',
            note: 'Controlled proposal; no live account or provider action.',
            decision: humanStatementDecision({
              facts: 'Controlled permanent-measure proposal fixture.',
              basis: 'Controlled four-eyes integration fixture.',
              reasoning: 'The fixture exercises an independently reviewed account restriction.',
            }),
          },
        })
      ));
      const accountProposal = accountProposalResult.proposal;
      assert.equal(accountProposal.status, 'pending');
      assert.equal(accountProposal.lockVersion, 1);
      assert.match(accountProposal.payloadSha256, /^[0-9a-f]{64}$/u);
      const proposalReplay = await runS4hCommand((client) => (
        proposePermanentAccountSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-target',
          idempotencyKey: 's4h-permanent-proposal',
          raw: {
            reasonCode: 'controlled_permanent_measure',
            note: 'Controlled proposal; no live account or provider action.',
            decision: humanStatementDecision({
              facts: 'Controlled permanent-measure proposal fixture.',
              basis: 'Controlled four-eyes integration fixture.',
              reasoning: 'The fixture exercises an independently reviewed account restriction.',
            }),
          },
        })
      ));
      assert.equal(proposalReplay.replayed, true);
      await assert.rejects(
        runS4hCommand((client) => proposePermanentAccountSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-target',
          idempotencyKey: 's4h-permanent-proposal',
          raw: {
            reasonCode: 'controlled_permanent_measure',
            note: 'Changed proposal content must not replay.',
            decision: humanStatementDecision({
              facts: 'Controlled permanent-measure proposal fixture.',
              basis: 'Controlled four-eyes integration fixture.',
              reasoning: 'The fixture exercises an independently reviewed account restriction.',
            }),
          },
        })),
        (error) => error?.code === 'account_suspension_proposal_idempotency_conflict',
      );
      assert.equal(
        (await setupPool.query(
          `SELECT account_status FROM users WHERE id = 's4h-target'`,
        )).rows[0].account_status,
        'active',
      );
      assert.equal(
        (await setupPool.query(
          `SELECT count(*)::int AS count FROM user_suspensions
            WHERE user_id = 's4h-target'`,
        )).rows[0].count,
        0,
      );
      await assert.rejects(
        runS4hCommand((client) => reviewPermanentAccountSuspensionProposal(client, {
          actor: { id: 'admin', role: 'admin' },
          proposalId: accountProposal.id,
          idempotencyKey: 's4h-proposer-review-forbidden',
          raw: {
            outcome: 'approved',
            expectedVersion: accountProposal.lockVersion,
            expectedPayloadSha256: accountProposal.payloadSha256,
          },
        })),
        (error) => error?.code === 'account_suspension_four_eyes_required',
      );
      await assert.rejects(
        runS4hCommand((client) => reviewPermanentAccountSuspensionProposal(client, {
          actor: { id: 'admin-reviewer', role: 'admin' },
          proposalId: accountProposal.id,
          idempotencyKey: 's4h-stale-payload-review',
          raw: {
            outcome: 'approved',
            expectedVersion: accountProposal.lockVersion,
            expectedPayloadSha256: '0'.repeat(64),
          },
        })),
        (error) => error?.code === 'account_suspension_proposal_payload_changed',
      );
      const approvedAccountMeasure = await runS4hCommand((client) => (
        reviewPermanentAccountSuspensionProposal(client, {
          actor: { id: 'admin-reviewer', role: 'admin' },
          proposalId: accountProposal.id,
          idempotencyKey: 's4h-independent-approval',
          raw: {
            outcome: 'approved',
            expectedVersion: accountProposal.lockVersion,
            expectedPayloadSha256: accountProposal.payloadSha256,
          },
        })
      ));
      assert.equal(approvedAccountMeasure.proposal.status, 'approved');
      assert.equal(approvedAccountMeasure.proposal.approvedBy, 'admin-reviewer');
      assert.equal(approvedAccountMeasure.suspension.measure_status, 'approved');
      assert.equal(approvedAccountMeasure.suspension.no_guilt_determination, true);
      assert.equal(approvedAccountMeasure.decision.measureStatus, 'approved');
      assert.equal(approvedAccountMeasure.decision.noGuiltDetermination, true);
      assert.equal(
        (await setupPool.query(
          `SELECT account_status FROM users WHERE id = 's4h-target'`,
        )).rows[0].account_status,
        'suspended',
      );
      const approvedReplay = await runS4hCommand((client) => (
        reviewPermanentAccountSuspensionProposal(client, {
          actor: { id: 'admin-reviewer', role: 'admin' },
          proposalId: accountProposal.id,
          idempotencyKey: 's4h-independent-approval',
          raw: {
            outcome: 'approved',
            expectedVersion: accountProposal.lockVersion,
            expectedPayloadSha256: accountProposal.payloadSha256,
          },
        })
      ));
      assert.equal(approvedReplay.replayed, true);
      assert.equal(approvedReplay.suspension.id, approvedAccountMeasure.suspension.id);
      await assert.rejects(
        setupPool.query(
          `UPDATE moderation_account_suspension_proposals
              SET payload = jsonb_set(payload, '{reasonCode}', '"mutated"'::jsonb),
                  lock_version = lock_version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [accountProposal.id],
        ),
        /account_suspension_proposal_payload_immutable/u,
      );
      await runS4hCommand((client) => liftUserSuspension(client, {
        actor: { id: 'admin-reviewer', role: 'admin' },
        suspensionId: approvedAccountMeasure.suspension.id,
        idempotencyKey: 's4h-lift-approved-fixture',
        raw: {
          reasonCode: 'controlled_fixture_complete',
          decision: humanStatementDecision({
            facts: 'The controlled approval fixture is complete.',
            basis: 'Controlled moderation reversal fixture.',
            reasoning: 'No test restriction is needed after the approval assertions.',
            durationType: 'not_applicable',
          }),
        },
      }));
      const rejectedProposal = await runS4hCommand((client) => (
        proposePermanentAccountSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-provisional',
          idempotencyKey: 's4h-rejected-proposal',
          raw: {
            reasonCode: 'controlled_rejected_measure',
            decision: humanStatementDecision({
              facts: 'Controlled rejected proposal fixture.',
              basis: 'Controlled four-eyes integration fixture.',
              reasoning: 'The independent reviewer can reject without account effect.',
            }),
          },
        })
      ));
      const rejectedReview = await runS4hCommand((client) => (
        reviewPermanentAccountSuspensionProposal(client, {
          actor: { id: 'admin-reviewer', role: 'admin' },
          proposalId: rejectedProposal.proposal.id,
          idempotencyKey: 's4h-independent-rejection',
          raw: {
            outcome: 'rejected',
            rejectionReason: 'The controlled fixture intentionally rejects this proposal.',
            expectedVersion: rejectedProposal.proposal.lockVersion,
            expectedPayloadSha256: rejectedProposal.proposal.payloadSha256,
          },
        })
      ));
      assert.equal(rejectedReview.proposal.status, 'rejected');
      assert.equal(rejectedReview.suspension, null);
      assert.equal(
        (await setupPool.query(
          `SELECT account_status FROM users WHERE id = 's4h-provisional'`,
        )).rows[0].account_status,
        'active',
      );
      const provisionalEndsAt = new Date(Date.now() + 30 * 60 * 1000);
      const provisionalAccountMeasure = await runS4hCommand((client) => (
        setUserSuspension(client, {
          actor: { id: 'admin', role: 'admin' },
          userId: 's4h-provisional',
          idempotencyKey: 's4h-provisional-account-measure',
          raw: {
            scope: 'account',
            provisional: true,
            endsAt: provisionalEndsAt.toISOString(),
            reasonCode: 'controlled_provisional_measure',
            note: 'Finite provisional account measure fixture.',
            decision: humanStatementDecision({
              facts: 'Controlled evidence requires a finite provisional review.',
              basis: 'Controlled provisional-measure integration fixture.',
              reasoning: 'The measure remains provisional while review is incomplete.',
              durationType: 'fixed',
              endsAt: provisionalEndsAt.toISOString(),
            }),
          },
        })
      ));
      assert.equal(provisionalAccountMeasure.suspension.measure_status, 'provisional');
      assert.equal(provisionalAccountMeasure.suspension.no_guilt_determination, true);
      assert.match(provisionalAccountMeasure.suspension.user_facing_notice, /vorläufig/u);
      assert.match(provisionalAccountMeasure.suspension.user_facing_notice, /keine Feststellung/u);
      assert.equal(provisionalAccountMeasure.decision.measureStatus, 'provisional');
      assert.equal(provisionalAccountMeasure.decision.noGuiltDetermination, true);
      assert.equal(
        provisionalAccountMeasure.decision.statementOfReasons.durationType,
        'fixed',
      );
      await runS4hCommand((client) => liftUserSuspension(client, {
        actor: { id: 'admin', role: 'admin' },
        suspensionId: provisionalAccountMeasure.suspension.id,
        idempotencyKey: 's4h-lift-provisional-fixture',
        raw: {
          reasonCode: 'controlled_fixture_complete',
          decision: humanStatementDecision({
            facts: 'The controlled provisional fixture is complete.',
            basis: 'Controlled moderation reversal fixture.',
            reasoning: 'The finite test restriction can now be lifted.',
            durationType: 'not_applicable',
          }),
        },
      }));
      await setupPool.query(
        `INSERT INTO refresh_tokens (
           user_id, token_hash, expires_at, user_agent, session_id, family_id
         ) VALUES (
           'renter-a', $1, now() + interval '1 day',
           'S4F account recovery test', $2, $2
         )`,
        ['b'.repeat(64), sessionIds['renter-a']],
      );
      const databaseSupportElevation = await setupPool.query(
        `INSERT INTO staff_elevations (
           user_id, session_id, token_hash, role, expires_at
         ) VALUES (
           'support', $1, $2, 'support', now() + interval '10 minutes'
         ) RETURNING id`,
        [sessionIds.support, '8'.repeat(64)],
      );
      const breakGlassInsertSql = `INSERT INTO support_break_glass_grants (
         case_id, actor_id, session_id, staff_elevation_id, token_hash,
         reason_code, justification, idempotency_key,
         created_at, expires_at, review_due_at
       ) VALUES (
         $1, 'support', $2, $3, $4,
         'p0_immediate_safety_response',
         'Immediate synthetic P0 access is required for the integration test.',
         $5, now(), now() + interval '5 minutes', now() + interval '5 minutes'
       ) RETURNING id, review_status, review_due_at`;
      await assert.rejects(
        setupPool.query(breakGlassInsertSql, [
          supportCase.rows[0].id,
          sessionIds.support,
          databaseSupportElevation.rows[0].id,
          '9'.repeat(64),
          'database-p1-break-glass-denied',
        ]),
        (error) => error?.message
          === 'Break-glass requires an active non-live P0 support case',
      );
      await assert.rejects(
        setupPool.query(breakGlassInsertSql, [
          p0BreakGlassCase.rows[0].id,
          sessionIds.admin,
          databaseSupportElevation.rows[0].id,
          'a'.repeat(64),
          'database-session-mismatch-denied',
        ]),
        (error) => error?.message
          === 'Break-glass requires the actor current active session',
      );
      const databaseBreakGlassGrant = await setupPool.query(
        breakGlassInsertSql,
        [
          p0BreakGlassCase.rows[0].id,
          sessionIds.support,
          databaseSupportElevation.rows[0].id,
          'b'.repeat(64),
          'database-valid-break-glass',
        ],
      );
      assert.equal(databaseBreakGlassGrant.rows[0].review_status, 'pending');
      assert.ok(databaseBreakGlassGrant.rows[0].review_due_at);
      await assert.rejects(
        setupPool.query(
          `UPDATE support_break_glass_grants
              SET justification = 'Rewritten justification is forbidden.'
            WHERE id = $1`,
          [databaseBreakGlassGrant.rows[0].id],
        ),
        (error) => error?.message === 'Break-glass grant core is immutable',
      );
      await setupPool.query(
        `UPDATE support_break_glass_grants SET last_used_at = now() WHERE id = $1`,
        [databaseBreakGlassGrant.rows[0].id],
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_break_glass_grants
              SET last_used_at = now() + interval '2 minutes'
            WHERE id = $1`,
          [databaseBreakGlassGrant.rows[0].id],
        ),
        (error) => error?.message === 'Break-glass use must occur inside the grant window',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_break_glass_grants
              SET review_status = 'completed', reviewed_by = 'admin',
                  reviewed_at = now(), review_outcome = 'appropriate',
                  review_notes = 'Independent review attempted before expiry.',
                  review_idempotency_key = 'database-early-review'
            WHERE id = $1`,
          [databaseBreakGlassGrant.rows[0].id],
        ),
        (error) => error?.message === 'Break-glass review completion is incomplete',
      );
      await assert.rejects(
        setupPool.query(
          'DELETE FROM support_break_glass_grants WHERE id = $1',
          [databaseBreakGlassGrant.rows[0].id],
        ),
        (error) => error?.code === '55000',
      );
      await setupPool.query(
         `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor,
           title, description, category_id, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, protection_model
         ) VALUES (
           'listing-1', 'owner',
           '{"id":"listing-1","ownerId":"owner","title":"Camera","description":"Camera for integration tests","categoryId":"cat3","subcategory":"Kameras","tags":["camera"],"pricePerDay":15,"priceRaw":15,"priceUnit":"day","currency":"EUR","deposit":null,"photos":["https://shareittoo.com/api/v1/uploads/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-full.webp"],"locationText":"Owner exact address","lat":52.5201,"lng":13.4051,"geohash":"private","condition":"good","minDays":1,"maxDays":30,"createdAt":"2026-08-08T20:00:00.000Z","isActive":true,"verificationStatus":"pending","city":"Berlin","country":"Deutschland","status":"active","timesLent":0,"protectionModel":"none"}'::jsonb,
           true, 1, 1, 'active', 'EUR', 1500,
           'Camera', 'Camera for integration tests', 'cat3', 'good',
           'Owner exact address', 'Berlin', 'Deutschland', 52.5201, 13.4051,
           1, 30, 'none'
         )`,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE listings
           SET security_deposit_minor = 1000,
               protection_model = 'standard'
           WHERE id = 'listing-1'`,
        ),
        (error) => error?.code === '23514'
          && ['listings_launch_no_deposit_check', 'listings_launch_no_protection_check']
            .includes(error?.constraint),
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE listings
           SET payload = jsonb_set(
             jsonb_set(payload, '{deposit}', '1000'::jsonb, true),
             '{protectionModel}',
             '"standard"'::jsonb,
             true
           )
           WHERE id = 'listing-1'`,
        ),
        (error) => error?.code === '23514'
          && ['listings_launch_no_deposit_check', 'listings_launch_no_protection_check']
            .includes(error?.constraint),
      );
      await setupPool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility,
           listing_id, content_sha256, content_scan_status
         ) VALUES (
           'owner', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-full.webp',
           'image/webp', 10, 'listing_image', 'public', 'listing-1', $1, 'passed'
         )`,
        ['b'.repeat(64)],
      );
      await setupPool.query(
        `UPDATE listings
         SET payload = jsonb_set(
               jsonb_set(payload, '{status}', '"paused"'::jsonb),
               '{isActive}', 'false'::jsonb
             ),
             is_active = false
         WHERE id = 'listing-1'`,
      );
      const quarantinedRollbackWrite = await setupPool.query(
        `SELECT catalog_version, catalog_revision, is_active
         FROM listings WHERE id = 'listing-1'`,
      );
      assert.deepEqual(quarantinedRollbackWrite.rows[0], {
        catalog_version: 0,
        catalog_revision: 1,
        is_active: false,
      });
      await setupPool.query(
        `UPDATE listings
         SET payload = jsonb_set(
               jsonb_set(payload, '{status}', '"active"'::jsonb),
               '{isActive}', 'true'::jsonb
             ),
             is_active = true,
             status = 'active',
             catalog_version = 1,
             catalog_revision = catalog_revision + 1
         WHERE id = 'listing-1'`,
      );
      const restoredForwardWrite = await setupPool.query(
        `SELECT catalog_version, catalog_revision, is_active
         FROM listings WHERE id = 'listing-1'`,
      );
      assert.deepEqual(restoredForwardWrite.rows[0], {
        catalog_version: 1,
        catalog_revision: 2,
        is_active: true,
      });

      const acceptanceWindow = futureAcceptanceWindow();
      for (const [id, renterId] of [['booking-a', 'renter-a'], ['booking-b', 'renter-b']]) {
        const payload = {
          id,
          itemId: 'listing-1',
          ownerId: 'owner',
          renterId,
          status: 'pending',
          start: acceptanceWindow.start,
          end: acceptanceWindow.end,
          createdAt: '2026-08-08T20:00:00.000Z',
        };
        await setupPool.query(
          `INSERT INTO rental_requests (
             id, item_id, owner_id, renter_id, status, payload, created_at
           ) VALUES ($1, 'listing-1', 'owner', $2, 'pending', $3::jsonb, $4)`,
          [id, renterId, JSON.stringify(payload), payload.createdAt],
        );
        await setupPool.query(
          `INSERT INTO bookings (
             id, listing_id, owner_id, renter_id, status, starts_at, ends_at,
             currency, quoted_total_minor
           ) VALUES (
             $1, 'listing-1', 'owner', $2, 'pending', $3, $4, 'EUR', 3000
           )`,
          [id, renterId, payload.start, payload.end],
        );
      }
      const rollbackBookings = await setupPool.query(
        `SELECT workflow_version, workflow_status, rental_start_date, rental_end_date
         FROM bookings WHERE id IN ('booking-a', 'booking-b') ORDER BY id`,
      );
      assert.deepEqual(rollbackBookings.rows.map((row) => row.workflow_version), [0, 0]);
      assert.deepEqual(rollbackBookings.rows.map((row) => row.workflow_status), ['requested', 'requested']);
      assert.ok(rollbackBookings.rows.every((row) => row.rental_start_date && row.rental_end_date));

      const first = await setupPool.connect();
      const second = await setupPool.connect();
      try {
        await first.query('BEGIN');
        await second.query('BEGIN');
        await first.query(`UPDATE bookings SET status = 'accepted' WHERE id = 'booking-a'`);
        const competingAcceptance = second.query(
          `UPDATE bookings SET status = 'accepted' WHERE id = 'booking-b'`,
        ).then(
          () => null,
          (error) => error,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        await first.query('COMMIT');
        assert.equal((await competingAcceptance)?.code, '23P01');
        await second.query('ROLLBACK');
      } finally {
        first.release();
        second.release();
      }
      await setupPool.query(`UPDATE bookings SET status = 'pending'`);
      await setupPool.query(
        `UPDATE bookings
         SET workflow_version = 1,
             workflow_status = 'requested',
             workflow_revision = workflow_revision + 1
         WHERE id IN ('booking-a', 'booking-b')`,
      );
      await setupPool.query(
        `UPDATE bookings SET simulation_only = true WHERE id = 'booking-a'`,
      );
      const stageASimulationRollback = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/070_stage_a_non_binding_simulation_guard.down.sql',
        ),
        'utf8',
      );
      const stageARollbackClient = await setupPool.connect();
      try {
        await stageARollbackClient.query('BEGIN');
        await assert.rejects(
          stageARollbackClient.query(stageASimulationRollback),
          /Stage A simulation rollback blocked: simulation bookings exist/u,
        );
        await stageARollbackClient.query('ROLLBACK');
      } finally {
        stageARollbackClient.release();
      }
      await assert.rejects(
        setupPool.query(
          `INSERT INTO payment_commands (
             idempotency_key, actor_id, command_type, request_hash, booking_id
           ) VALUES (
             'stage-a-simulation-payment-guard', 'renter-a', 'payment.checkout',
             $1, 'booking-a'
           )`,
          ['a'.repeat(64)],
        ),
        (error) => error?.code === '23514'
          && /stage_a_simulation_side_effect_forbidden/u.test(error.message),
      );
      await setupPool.query(
        `UPDATE bookings SET simulation_only = false WHERE id = 'booking-a'`,
      );

      await setupPool.query(
        `INSERT INTO stripe_connect_accounts (
           user_id, provider_account_id, country, default_currency,
           account_api_version, dashboard_type, fees_collector,
           losses_collector, recipient_transfers_status
         ) VALUES (
           'owner', 'acct_n25_v2_guard', 'DE', 'EUR',
           'v2', 'express', 'application', 'application', 'active'
         )`,
      );
      const connectV2 = await setupPool.query(
        `SELECT account_api_version, dashboard_type, fees_collector,
                losses_collector, recipient_transfers_status
         FROM stripe_connect_accounts
         WHERE user_id = 'owner'`,
      );
      assert.deepEqual(connectV2.rows[0], {
        account_api_version: 'v2',
        dashboard_type: 'express',
        fees_collector: 'application',
        losses_collector: 'application',
        recipient_transfers_status: 'active',
      });
      const connectV2Rollback = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/071_stripe_connect_accounts_v2.down.sql'),
        'utf8',
      );
      const connectRollbackClient = await setupPool.connect();
      try {
        await connectRollbackClient.query('BEGIN');
        await assert.rejects(
          connectRollbackClient.query(connectV2Rollback),
          /Stripe Accounts v2 rollback blocked: v2 connected accounts exist/u,
        );
        await connectRollbackClient.query('ROLLBACK');
      } finally {
        connectRollbackClient.release();
      }
      await setupPool.query(
        `DELETE FROM stripe_connect_accounts WHERE user_id = 'owner'`,
      );

      await setupPool.query(
        `INSERT INTO message_threads (
           id, request_id, item_id, user1_id, user2_id, payload
         ) VALUES (
           'thread-1', 'booking-a', 'listing-1', 'renter-a', 'owner', '{}'::jsonb
         )`,
      );
      const privateContents = Buffer.from('private-evidence');
      await fs.writeFile(path.join(uploadDir, 'private.png'), privateContents);
      await setupPool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility, thread_id
         ) VALUES (
           'owner', 'private.png', 'image/png', $1, 'handover_evidence', 'private', 'thread-1'
         )`,
        [privateContents.length],
      );

      const { createApp } = await import('../src/app.js');
      const { inTransaction, pool } = await import('../src/db.js');
      const { reconcileSupportDeadlinesWithClient } = await import(
        '../src/support_deadline_watchdog.js'
      );
      const { reconcilePrivacyRightsDeadlinesWithClient } = await import(
        '../src/support_privacy_rights_workflow.js'
      );
      const { reconcilePrivacyIncidentDeadlinesWithClient } = await import(
        '../src/support_privacy_incident_workflow.js'
      );
      const { drainNotificationOutbox } = await import('../src/notifications.js');
      const {
        applyProviderEvent,
        reconcileDisputeTransferRecoveries,
      } = await import('../src/payment_workflow.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      const { createSupportCase } = await import('../src/support_case_workflow.js');
      const { hashActionToken, hashPassword, signAccessToken } = await import('../src/security.js');
      applicationPool = pool;
      const adminPassword = createEphemeralAcceptancePassword();
      const reviewerPassword = createEphemeralAcceptancePassword();
      const supportPassword = createEphemeralAcceptancePassword();
      const renterAPassword = createEphemeralAcceptancePassword();
      const ownerPassword = createEphemeralAcceptancePassword();
      await setupPool.query(
        `UPDATE users SET password_hash = CASE id
                            WHEN 'admin' THEN $1
                            WHEN 'admin-reviewer' THEN $2
                            WHEN 'support' THEN $3
                            WHEN 'renter-a' THEN $4
                            ELSE $5
                          END,
                          email_verified_at = now()
         WHERE id IN ('admin', 'admin-reviewer', 'support', 'renter-a', 'owner')`,
        [
          await hashPassword(adminPassword),
          await hashPassword(reviewerPassword),
          await hashPassword(supportPassword),
          await hashPassword(renterAPassword),
          await hashPassword(ownerPassword),
        ],
      );
      const socialClaims = new Map();
      const phoneClaims = new Map();
      const deletedPhoneIdentities = [];
      const applicationOptions = {
        verifySocialToken: async (token) => {
          const identity = socialClaims.get(token);
          if (!identity) {
            const error = new Error('invalid_social_token');
            error.status = 401;
            error.code = 'invalid_social_token';
            throw error;
          }
          return identity;
        },
        verifyPhoneToken: async (token) => {
          const identity = phoneClaims.get(token);
          if (!identity) {
            const error = new Error('invalid_phone_verification_token');
            error.status = 401;
            error.code = 'invalid_phone_verification_token';
            throw error;
          }
          return identity;
        },
        deletePhoneIdentity: async (identity) => {
          deletedPhoneIdentities.push(identity.firebaseUserId);
        },
        screenBlueOceanListingImage: async () => ({
          localOcrText: '',
          visualScanCompleted: true,
          visualSignals: [],
        }),
      };
      let baseUrl;
      const restartApplicationServer = async () => {
        if (server) {
          await new Promise((resolve, reject) => server.close((error) => (
            error ? reject(error) : resolve()
          )));
        }
        server = http.createServer(createApp(applicationOptions));
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
      };
      await restartApplicationServer();
      const tokenFor = (id) => signAccessToken(
        { id, email: `${id}@example.com` },
        { sessionId: sessionIds[id] },
      );

      const ownerHeaders = {
        Authorization: `Bearer ${tokenFor('owner')}`,
        'Content-Type': 'application/json',
      };
      const catalogResponse = await fetch(
        `${baseUrl}/v1/listings?q=Camera&categories=cat3&conditions=good&lat=52.52&lng=13.405&radiusKm=10&sort=distance`,
      );
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json();
      assert.equal(catalog.listings.length, 1);
      assert.equal(catalog.listings[0].id, 'listing-1');
      assert.equal(catalog.listings[0].locationText, 'Berlin, Deutschland');
      assert.equal(catalog.listings[0].lat, 52.52);
      assert.equal(catalog.listings[0].lng, 13.41);
      assert.equal(catalog.listings[0].geohash, '');
      assert.equal(catalog.listings[0].approximateLocation, true);
      assert.deepEqual(catalog.listings[0].photos, [
        'https://shareittoo.com/api/v1/uploads/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-full.webp',
      ]);
      assert.equal(catalog.page.hasMore, false);

      const emptyCatalogResponse = await fetch(`${baseUrl}/v1/listings?q=does-not-exist`);
      assert.equal(emptyCatalogResponse.status, 200);
      assert.deepEqual((await emptyCatalogResponse.json()).listings, []);

      const renterAHeaders = {
        Authorization: `Bearer ${tokenFor('renter-a')}`,
        'Content-Type': 'application/json',
      };
      const renterBHeaders = {
        Authorization: `Bearer ${tokenFor('renter-b')}`,
        'Content-Type': 'application/json',
      };

      await restartApplicationServer();
      const r8CohortResults = await mapWithBoundedConcurrency(
        r8SyntheticAccounts,
        r8MaximumConcurrentWorkers,
        async (account, index) => {
          const headers = {
            Authorization: `Bearer ${tokenFor(account.id)}`,
            'Content-Type': 'application/json',
          };
          const cartItemId = `r8-cart-${String(index + 1).padStart(3, '0')}`;
          const supportIdempotencyKey = `r8-support-${String(index + 1).padStart(3, '0')}`;
          const [cartResponse, support, preflightResponse] = await Promise.all([
            fetch(`${baseUrl}/v1/rental-cart/items/${cartItemId}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                listingId: 'listing-1',
                startDate: '2026-11-10',
                endDate: '2026-11-12',
                sortOrder: 0,
              }),
            }),
            inTransaction((client) => createSupportCase(client, {
              actor: { id: account.id, role: 'user' },
              idempotencyKey: supportIdempotencyKey,
              operatingMode: 'simulation',
              raw: {
                caseType: 'general_help',
                caseSubType: 'app_error_or_display',
                summary: `R8 synthetischer Supportfall ${index + 1}.`,
                immediateDanger: false,
                safetyTriage: {
                  version: 'sit_support_safety_triage_v1',
                  packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
                  guidanceVersion: 'T-003@1.0.0',
                  immediateDanger: false,
                  guidanceShown: false,
                },
                issueScope: {
                  version: 'sit_support_single_issue_scope_v1',
                  singleIssueConfirmed: true,
                  separationGuidanceShown: false,
                },
              },
            }), { deadlockRetries: 2 }),
            fetch(`${baseUrl}/v1/account/deletion-preflight`, { headers }),
          ]);
          assert.equal(cartResponse.status, 200);
          assert.equal(preflightResponse.status, 200);
          const cart = (await cartResponse.json()).cart;
          const preflight = await preflightResponse.json();
          assert.deepEqual(cart.items.map((item) => item.id), [cartItemId]);
          assert.equal(cart.reservationCreated, false);
          assert.equal(support.replayed, false);
          assert.equal(support.supportCase.operatingMode, 'simulation');
          assert.equal(preflight.canDelete, true);
          assert.deepEqual(preflight.blockers, []);
          return {
            accountId: account.id,
            cartItemId,
            supportCaseId: support.supportCase.id,
          };
        },
      );
      assert.equal(r8CohortResults.length, r8SyntheticAccountCount);
      assert.equal(
        new Set(r8CohortResults.map((result) => result.supportCaseId)).size,
        r8SyntheticAccountCount,
      );
      const r8CohortDatabaseState = await setupPool.query(
        `SELECT
           (SELECT count(*)::int
              FROM rental_carts
             WHERE user_id = ANY($1::text[])) AS cart_count,
           (SELECT count(*)::int
              FROM rental_cart_items AS item
              JOIN rental_carts AS cart ON cart.id = item.cart_id
             WHERE cart.user_id = ANY($1::text[])) AS cart_item_count,
           (SELECT count(*)::int
              FROM support_cases
             WHERE reporter_user_id = ANY($1::text[])) AS support_case_count,
           (SELECT count(DISTINCT reporter_user_id)::int
              FROM support_cases
             WHERE reporter_user_id = ANY($1::text[])) AS support_reporter_count`,
        [r8SyntheticAccounts.map((account) => account.id)],
      );
      assert.deepEqual(r8CohortDatabaseState.rows[0], {
        cart_count: r8SyntheticAccountCount,
        cart_item_count: r8SyntheticAccountCount,
        support_case_count: r8SyntheticAccountCount,
        support_reporter_count: r8SyntheticAccountCount,
      });

      const r8PrivacyAccounts = r8SyntheticAccounts.slice(
        0,
        r8ConcurrentPrivacyExportAccounts,
      );
      await mapWithBoundedConcurrency(
        r8PrivacyAccounts,
        Math.min(6, r8MaximumConcurrentWorkers),
        async (account, index) => {
          const exported = await inTransaction(async (client) => {
            await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            return buildAccountExport(client, account.id);
          });
          assert.equal(exported.account.id, account.id);
          assert.deepEqual(
            exported.marketplace.rentalCart.items.map(
              (item) => item.client_item_id,
            ),
            [`r8-cart-${String(index + 1).padStart(3, '0')}`],
          );
          assert.deepEqual(
            exported.communication.support.cases.map(
              (supportCaseEntry) => supportCaseEntry.id,
            ),
            [r8CohortResults[index].supportCaseId],
          );
        },
      );
      await restartApplicationServer();

      const createSupportIntake = () => fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3b-support-intake-integration',
        },
        body: JSON.stringify({
          caseType: 'general_help',
          caseSubType: 'app_error_or_display',
          summary: 'Technischer Supportfall im kontrollierten Simulationsmodus.',
          linkedBookingId: 'booking-a',
          linkedListingId: 'listing-1',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: true,
          },
        }),
      });
      const supportIntakeResponse = await createSupportIntake();
      assert.equal(supportIntakeResponse.status, 201);
      assert.match(supportIntakeResponse.headers.get('cache-control'), /no-store/u);
      const supportIntake = await supportIntakeResponse.json();
      assert.equal(supportIntake.replayed, false);
      assert.match(supportIntake.supportCase.caseNumber, /^SIT-[A-Z0-9]+$/u);
      assert.equal(supportIntake.supportCase.status, 'received');
      assert.equal(supportIntake.supportCase.operatingMode, 'simulation');
      assert.equal(supportIntake.supportCase.timezone, 'Europe/Berlin');
      assert.ok(supportIntake.supportCase.nextUpdateAt);
      assert.ok(supportIntake.supportCase.nextUpdateDisplay);
      assert.equal('approvalLevel' in supportIntake.supportCase, false);
      const supportIntakeReplay = await createSupportIntake();
      assert.equal(supportIntakeReplay.status, 200);
      assert.equal((await supportIntakeReplay.json()).replayed, true);

      const feedbackContext = {
        version: 'sit_support_feedback_context_v1',
        feedbackKind: 'improvement_suggestion',
        productArea: 'app_experience',
        nonUrgentConfirmed: true,
      };
      const feedbackIntakeResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's4d-feedback-intake-integration',
        },
        body: JSON.stringify({
          caseType: 'general_help',
          caseSubType: 'feedback_or_improvement',
          summary: 'Nicht dringende Verbesserung für die App vorschlagen.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
          feedbackContext,
        }),
      });
      assert.equal(feedbackIntakeResponse.status, 201);
      const feedbackIntake = await feedbackIntakeResponse.json();
      assert.equal(feedbackIntake.supportCase.caseType, 'general_help');
      assert.equal(feedbackIntake.supportCase.caseSubType, 'feedback_or_improvement');
      assert.equal(feedbackIntake.supportCase.priority, 'p4');
      assert.equal(feedbackIntake.supportCase.linkedBookingId, null);
      assert.equal(feedbackIntake.supportCase.linkedListingId, null);
      assert.deepEqual(feedbackIntake.supportCase.feedbackContext, feedbackContext);
      assert.match(feedbackIntake.supportCase.nextAction, /Produktbereich/u);

      const persistedFeedback = await setupPool.query(
        `SELECT priority, severity, current_owner_role, approval_level,
                feedback_context, linked_booking_id, linked_listing_id,
                linked_payment_id, linked_refund_id, linked_payout_id,
                safety_flag, privacy_flag, dsa_flag, authority_flag,
                article18_candidate_flag, money_flag, account_takeover_flag
           FROM support_cases
          WHERE id = $1`,
        [feedbackIntake.supportCase.id],
      );
      assert.deepEqual(persistedFeedback.rows, [{
        priority: 'p4',
        severity: 'low',
        current_owner_role: 'general_support_owner',
        approval_level: 'green_automatic',
        feedback_context: feedbackContext,
        linked_booking_id: null,
        linked_listing_id: null,
        linked_payment_id: null,
        linked_refund_id: null,
        linked_payout_id: null,
        safety_flag: false,
        privacy_flag: false,
        dsa_flag: false,
        authority_flag: false,
        article18_candidate_flag: false,
        money_flag: false,
        account_takeover_flag: false,
      }]);
      const feedbackAudit = await setupPool.query(
        `SELECT metadata
           FROM audit_log
          WHERE action = 'support.case_created' AND resource_id = $1`,
        [feedbackIntake.supportCase.id],
      );
      assert.equal(feedbackAudit.rowCount, 1);
      assert.deepEqual(feedbackAudit.rows[0].metadata, {
        caseType: 'general_help',
        caseSubType: 'feedback_or_improvement',
        priority: 'p4',
        operatingMode: 'simulation',
        safetyTriageVersion: 'sit_support_safety_triage_v1',
        safetyGuidanceShown: false,
        issueScopeVersion: 'sit_support_single_issue_scope_v1',
        separationGuidanceShown: false,
        feedbackContextVersion: 'sit_support_feedback_context_v1',
        feedbackKind: 'improvement_suggestion',
        feedbackProductArea: 'app_experience',
        feedbackNonUrgentConfirmed: true,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET feedback_context = jsonb_set(
                feedback_context,
                '{productArea}',
                '"other"'::jsonb
              )
            WHERE id = $1`,
          [feedbackIntake.supportCase.id],
        ),
        (error) => error?.code === '55000'
          && error?.message === 'support_feedback_context_immutable',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases SET priority = 'p4' WHERE id = $1`,
          [supportIntake.supportCase.id],
        ),
        (error) => error?.code === '23514',
      );

      const linkedFeedbackResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's4d-feedback-linked-rejection',
        },
        body: JSON.stringify({
          caseType: 'general_help',
          caseSubType: 'feedback_or_improvement',
          summary: 'Feedback darf keine Buchung als Fallobjekt verknüpfen.',
          linkedBookingId: 'booking-a',
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
          feedbackContext,
        }),
      });
      assert.equal(linkedFeedbackResponse.status, 400);
      assert.equal(
        (await linkedFeedbackResponse.json()).error,
        'support_feedback_entity_link_not_allowed',
      );

      const legacyMigrationPayload = {
        schemaVersion: 1,
        source: {
          system: 'local_shared_preferences_message_threads_v1',
          thread: {
            id: 'legacy-support-thread-integration',
            threadType: 'support',
            user1Id: 'renter-a',
            user2Id: 'support',
            archivedForUserIds: [],
            createdAt: '2026-08-20T10:00:00.000',
            lastMessageAt: '2026-08-20T10:05:00.000Z',
            legacyStatus: 'open',
            messages: [
              {
                id: 'legacy-support-message-user',
                senderId: 'renter-a',
                text: 'Mein älterer lokaler Supportverlauf soll erhalten bleiben.',
                timestamp: '2026-08-20T10:00:00.000',
                isRead: true,
              },
              {
                id: 'legacy-support-message-support',
                senderId: 'support',
                text: 'Diese historische Antwort löst keine externe Nachricht aus.',
                timestamp: '2026-08-20T10:05:00.000Z',
                isRead: false,
              },
            ],
          },
        },
        intake: {
          caseType: 'general_help',
          caseSubType: 'app_error_or_display',
          summary: 'Ein vorhandener lokaler Supportverlauf soll geprüft werden.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: true,
          },
        },
      };
      const legacyPreviewResponse = await fetch(
        `${baseUrl}/v1/support/legacy-migrations/preview`,
        {
          method: 'POST',
          headers: renterAHeaders,
          body: JSON.stringify(legacyMigrationPayload),
        },
      );
      assert.equal(legacyPreviewResponse.status, 200);
      assert.match(legacyPreviewResponse.headers.get('cache-control'), /no-store/u);
      const legacyPreview = (await legacyPreviewResponse.json()).migration;
      assert.equal(legacyPreview.eligible, true);
      assert.equal(legacyPreview.dataMutation, false);
      assert.equal(legacyPreview.externalMessagesSent, false);
      assert.equal(legacyPreview.historyEntryCount, 2);
      assert.equal(legacyPreview.unresolvedLocalTimestampCount, 1);
      assert.equal('source' in legacyPreview, false);
      assert.doesNotMatch(JSON.stringify(legacyPreview), /älterer lokaler/u);

      const createLegacyImport = () => fetch(
        `${baseUrl}/v1/support/legacy-migrations`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 'legacy-support-import-integration',
          },
          body: JSON.stringify(legacyMigrationPayload),
        },
      );
      const legacyImportResponse = await createLegacyImport();
      assert.equal(legacyImportResponse.status, 201);
      assert.match(legacyImportResponse.headers.get('cache-control'), /no-store/u);
      const legacyImport = await legacyImportResponse.json();
      assert.equal(legacyImport.replayed, false);
      assert.equal(legacyImport.supportCase.status, 'acknowledged');
      assert.equal(legacyImport.supportCase.operatingMode, 'simulation');
      assert.match(legacyImport.migration.importId, /^[0-9a-f-]{36}$/u);
      assert.equal(legacyImport.migration.templateState, 'historical_disabled');
      assert.equal(
        legacyImport.migration.verificationState,
        'unverified_user_device_source',
      );
      assert.equal(legacyImport.migration.usableAsDecisionEvidence, false);
      assert.equal(legacyImport.migration.externalMessagesSent, false);
      const legacyReplayResponse = await createLegacyImport();
      assert.equal(legacyReplayResponse.status, 200);
      const legacyReplay = await legacyReplayResponse.json();
      assert.equal(legacyReplay.replayed, true);
      assert.equal(legacyReplay.supportCase.id, legacyImport.supportCase.id);
      assert.equal(legacyReplay.migration.importId, legacyImport.migration.importId);

      const changedLegacyPayload = structuredClone(legacyMigrationPayload);
      changedLegacyPayload.source.thread.messages[0].text += ' Verändert.';
      const changedLegacyResponse = await fetch(
        `${baseUrl}/v1/support/legacy-migrations`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 'legacy-support-import-changed-integration',
          },
          body: JSON.stringify(changedLegacyPayload),
        },
      );
      assert.equal(changedLegacyResponse.status, 409);
      assert.equal(
        (await changedLegacyResponse.json()).error,
        'support_legacy_source_changed_after_import',
      );

      const canonicalLegacyPayload = structuredClone(legacyMigrationPayload);
      canonicalLegacyPayload.source.thread.id = 'legacy-already-canonical-integration';
      canonicalLegacyPayload.source.thread.messages[0].id = 'legacy-canonical-message';
      canonicalLegacyPayload.source.thread.messages[0].text =
        `Support-Fall ${supportIntake.supportCase.caseNumber} ist bereits bestätigt.`;
      const canonicalLegacyPreviewResponse = await fetch(
        `${baseUrl}/v1/support/legacy-migrations/preview`,
        {
          method: 'POST',
          headers: renterAHeaders,
          body: JSON.stringify(canonicalLegacyPayload),
        },
      );
      assert.equal(canonicalLegacyPreviewResponse.status, 200);
      const canonicalLegacyPreview =
        (await canonicalLegacyPreviewResponse.json()).migration;
      assert.equal(canonicalLegacyPreview.eligible, false);
      assert.deepEqual(
        canonicalLegacyPreview.blockers,
        ['canonical_case_reference_present'],
      );

      const pausedLegacyPayload = structuredClone(legacyMigrationPayload);
      pausedLegacyPayload.source.thread.id = 'legacy-paused-support-integration';
      pausedLegacyPayload.source.thread.legacyStatus = 'paused';
      pausedLegacyPayload.source.thread.pausedMapping = 'waiting_for_user';
      pausedLegacyPayload.source.thread.pauseReason =
        'Eine konkret benannte Nutzerantwort war im Altverlauf noch offen.';
      pausedLegacyPayload.source.thread.messages.forEach((message, index) => {
        message.id = `legacy-paused-message-${index}`;
      });
      const pausedLegacyResponse = await fetch(
        `${baseUrl}/v1/support/legacy-migrations`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 'legacy-paused-import-integration',
          },
          body: JSON.stringify(pausedLegacyPayload),
        },
      );
      assert.equal(pausedLegacyResponse.status, 201);
      const pausedLegacyImport = await pausedLegacyResponse.json();
      assert.equal(pausedLegacyImport.supportCase.status, 'waiting_for_user');
      assert.equal(pausedLegacyImport.supportCase.waitingOn, 'reporter');

      const concurrentLegacyPayload = structuredClone(legacyMigrationPayload);
      concurrentLegacyPayload.source.thread.id = 'legacy-concurrent-support-integration';
      concurrentLegacyPayload.source.thread.messages.forEach((message, index) => {
        message.id = `legacy-concurrent-message-${index}`;
      });
      const concurrentLegacyResponses = await Promise.all([
        'legacy-concurrent-import-a',
        'legacy-concurrent-import-b',
      ].map((idempotencyKey) => fetch(
        `${baseUrl}/v1/support/legacy-migrations`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(concurrentLegacyPayload),
        },
      )));
      assert.deepEqual(
        concurrentLegacyResponses.map((response) => response.status).sort(),
        [200, 201],
      );
      const concurrentLegacyImports = await Promise.all(
        concurrentLegacyResponses.map((response) => response.json()),
      );
      assert.equal(
        concurrentLegacyImports[0].migration.importId,
        concurrentLegacyImports[1].migration.importId,
      );
      assert.equal(
        concurrentLegacyImports[0].supportCase.id,
        concurrentLegacyImports[1].supportCase.id,
      );

      const legacyHistoryResponse = await fetch(
        `${baseUrl}/v1/support/cases/${legacyImport.supportCase.id}/legacy-history`,
        { headers: renterAHeaders },
      );
      assert.equal(legacyHistoryResponse.status, 200);
      assert.match(legacyHistoryResponse.headers.get('cache-control'), /no-store/u);
      const legacyHistory = (await legacyHistoryResponse.json()).legacyHistory;
      assert.equal(legacyHistory.historyEntryCount, 2);
      assert.equal(legacyHistory.entries.length, 2);
      assert.equal(legacyHistory.entries[0].senderType, 'user');
      assert.equal(
        legacyHistory.entries[0].sourceTrust,
        'unverified_user_device_source',
      );
      assert.equal(legacyHistory.entries[0].occurredAt, null);
      assert.equal(
        legacyHistory.entries[0].timestampInterpretation,
        'unresolved_local_time',
      );
      assert.equal(legacyHistory.entries[1].senderType, 'support');
      assert.equal(legacyHistory.externalMessagesSent, false);
      const outsiderLegacyHistory = await fetch(
        `${baseUrl}/v1/support/cases/${legacyImport.supportCase.id}/legacy-history`,
        { headers: renterBHeaders },
      );
      assert.equal(outsiderLegacyHistory.status, 404);
      const legacyOriginEvent = await setupPool.query(
        `SELECT structured_payload, source_system
           FROM support_case_events
          WHERE case_id = $1 AND event_type = 'case.legacy_history_imported'`,
        [legacyImport.supportCase.id],
      );
      assert.equal(legacyOriginEvent.rowCount, 1);
      assert.equal(legacyOriginEvent.rows[0].source_system, 'sit-legacy-migration');
      assert.equal(legacyOriginEvent.rows[0].structured_payload.historyEntryCount, 2);
      assert.equal(legacyOriginEvent.rows[0].structured_payload.templateState,
        'historical_disabled');
      await assert.rejects(
        setupPool.query(
          `UPDATE support_legacy_history_entries
              SET rendered_content = 'verboten'
            WHERE case_id = $1`,
          [legacyImport.supportCase.id],
        ),
        /append-only/u,
      );
      const mySupportCasesResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        headers: renterAHeaders,
      });
      assert.equal(mySupportCasesResponse.status, 200);
      const mySupportCases = (await mySupportCasesResponse.json()).supportCases;
      assert.ok(mySupportCases.some((entry) => (
        entry.caseNumber === supportIntake.supportCase.caseNumber
        && entry.nextUpdateDisplay
        && entry.timezone === 'Europe/Berlin'
      )));
      const supportIntakeAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
          WHERE action = 'support.case_created' AND resource_id = $1`,
        [supportIntake.supportCase.id],
      );
      assert.equal(supportIntakeAudit.rowCount, 1);
      assert.deepEqual(supportIntakeAudit.rows[0].metadata, {
        caseType: 'general_help',
        caseSubType: 'app_error_or_display',
        priority: 'p3',
        operatingMode: 'simulation',
        safetyTriageVersion: 'sit_support_safety_triage_v1',
        safetyGuidanceShown: false,
        issueScopeVersion: 'sit_support_single_issue_scope_v1',
        separationGuidanceShown: true,
      });
      await assert.rejects(
        setupPool.query(
          `UPDATE audit_log SET action = 'forbidden.audit.rewrite'
            WHERE action = 'support.case_created' AND resource_id = $1`,
          [supportIntake.supportCase.id],
        ),
        /audit_log is append-only/u,
      );
      await assert.rejects(
        setupPool.query(
          `DELETE FROM audit_log
            WHERE action = 'support.case_created' AND resource_id = $1`,
          [supportIntake.supportCase.id],
        ),
        /audit_log is append-only/u,
      );
      const productSafetyIntakeResponse = await fetch(
        `${baseUrl}/v1/support/cases`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's3v-product-safety-intake',
          },
          body: JSON.stringify({
            caseType: 'trust_safety',
            caseSubType: 'dangerous_item_or_injury',
            summary: 'Gefährliches Produkt im gesonderten Weg melden.',
            linkedListingId: 'listing-1',
            immediateDanger: false,
            safetyTriage: {
              version: 'sit_support_safety_triage_v1',
              packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
              guidanceVersion: 'T-003@1.0.0',
              immediateDanger: false,
              guidanceShown: false,
            },
            issueScope: {
              version: 'sit_support_single_issue_scope_v1',
              singleIssueConfirmed: true,
              separationGuidanceShown: false,
            },
            productSafetyNotice: {
              version: 'sit_product_safety_intake_v1',
              contactPointVersion: 'sit_product_safety_contact_point_v1',
              issueKind: 'dangerous_product',
              productIdentification: 'Bohrmaschine Modell X',
              riskDescription:
                'Das Gehäuse wird beim Betrieb sehr heiß und riecht verschmort.',
              injuryOccurred: false,
              safetyGuidanceAcknowledged: true,
            },
          }),
        },
      );
      assert.equal(productSafetyIntakeResponse.status, 201);
      const productSafetyIntake = await productSafetyIntakeResponse.json();
      assert.match(
        productSafetyIntake.supportCase.productSafetyNoticeNumber,
        /^SIT-P-[A-HJ-NP-Z2-9]{12}$/u,
      );
      assert.equal(productSafetyIntake.supportCase.priority, 'p1');
      assert.equal(productSafetyIntake.supportCase.waitingOn,
        'trust_safety_owner');
      assert.ok(productSafetyIntake.supportCase.productSafetyTriageDueAt);
      assert.ok(productSafetyIntake.supportCase.productSafetyTriageDueDisplay);
      assert.equal('productSafetyEvidence' in productSafetyIntake.supportCase,
        false);
      const productSafetyStored = await setupPool.query(
        `SELECT current_owner_role, approval_level, safety_flag,
                authority_flag, product_safety_evidence,
                product_safety_triage_due_at <= created_at + INTERVAL '60 minutes'
                  AS rapid_triage
           FROM support_cases
          WHERE id = $1`,
        [productSafetyIntake.supportCase.id],
      );
      assert.deepEqual(productSafetyStored.rows[0], {
        current_owner_role: 'trust_safety_owner',
        approval_level: 'red_explicit_decision',
        safety_flag: true,
        authority_flag: true,
        product_safety_evidence: {
          version: 'sit_product_safety_intake_v1',
          contactPointVersion: 'sit_product_safety_contact_point_v1',
          issueKind: 'dangerous_product',
          productIdentification: 'Bohrmaschine Modell X',
          riskDescription:
            'Das Gehäuse wird beim Betrieb sehr heiß und riecht verschmort.',
          injuryOccurred: false,
          safetyGuidanceAcknowledged: true,
          sourceChannel: 'app',
          submittedAt: productSafetyStored.rows[0]
            .product_safety_evidence.submittedAt,
        },
        rapid_triage: true,
      });
      const privacyIntakeResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3s-privacy-access-intake',
        },
        body: JSON.stringify({
          caseType: 'privacy_security',
          caseSubType: 'access_or_copy_request',
          summary: 'Auskunft und sichere Kopie meiner Daten anfordern.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
          privacyRightsRequest: {
            version: 'sit_privacy_rights_request_v1',
            requestKind: 'access',
          },
        }),
      });
      assert.equal(privacyIntakeResponse.status, 201);
      const privacyIntake = await privacyIntakeResponse.json();
      const privacyBeforeIdentityResponse = await fetch(
        `${baseUrl}/v1/support/cases/${privacyIntake.supportCase.id}/privacy-rights`,
        { headers: renterAHeaders },
      );
      assert.equal(privacyBeforeIdentityResponse.status, 200);
      const privacyBeforeIdentity = (await privacyBeforeIdentityResponse.json())
        .privacyRightsRequest;
      assert.equal(privacyBeforeIdentity.requestKind, 'access');
      assert.equal(privacyBeforeIdentity.identityStatus, 'pending');
      assert.equal(privacyBeforeIdentity.disclosureAllowed, false);
      assert.equal(privacyBeforeIdentity.erasureExecutionAllowed, false);
      assert.equal(privacyBeforeIdentity.externalDeliveryEnabled, false);
      assert.equal(
        privacyBeforeIdentity.deadlinePolicyVersion,
        'gdpr-art12-conservative-calendar-month-v1',
      );
      assert.ok(
        new Date(privacyBeforeIdentity.responseDueAt)
          > new Date(privacyBeforeIdentity.receivedAt),
      );
      const wrongPrivacyIdentity = await fetch(
        `${baseUrl}/v1/support/cases/${privacyIntake.supportCase.id}/privacy-rights/identity-verification`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's3s-privacy-identity-wrong',
          },
          body: JSON.stringify({
            expectedVersion: privacyBeforeIdentity.version,
            currentPassword: createEphemeralAcceptancePassword(),
          }),
        },
      );
      assert.equal(wrongPrivacyIdentity.status, 401);
      const privacyIdentityResponse = await fetch(
        `${baseUrl}/v1/support/cases/${privacyIntake.supportCase.id}/privacy-rights/identity-verification`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's3s-privacy-identity-correct',
          },
          body: JSON.stringify({
            expectedVersion: privacyBeforeIdentity.version,
            currentPassword: renterAPassword,
          }),
        },
      );
      assert.equal(privacyIdentityResponse.status, 201);
      const privacyAfterIdentity = (await privacyIdentityResponse.json())
        .privacyRightsRequest;
      assert.equal(privacyAfterIdentity.identityStatus, 'verified');
      assert.equal(privacyAfterIdentity.processingStatus, 'under_review');
      assert.equal(
        privacyAfterIdentity.responseDueAt,
        privacyBeforeIdentity.responseDueAt,
      );
      const privacyIdentityStored = await setupPool.query(
        `SELECT verification_method, session_id, idempotency_key
           FROM support_privacy_identity_verifications
          WHERE privacy_request_id = $1`,
        [privacyAfterIdentity.id],
      );
      assert.equal(privacyIdentityStored.rowCount, 1);
      assert.equal(privacyIdentityStored.rows[0].verification_method, 'account_password');
      assert.equal(privacyIdentityStored.rows[0].session_id, sessionIds['renter-a']);
      assert.equal(
        privacyIdentityStored.rows[0].idempotency_key,
        'support.privacy_rights.identity.verify:s3s-privacy-identity-correct',
      );
      const privacyNearAt = new Date(
        new Date(privacyAfterIdentity.responseDueAt).getTime() - (24 * 60 * 60 * 1000),
      );
      const privacyDeadlineRun = await inTransaction((client) => (
        reconcilePrivacyRightsDeadlinesWithClient(client, { now: privacyNearAt })
      ));
      assert.equal(privacyDeadlineRun.deadlineNear, 1);
      assert.equal(privacyDeadlineRun.deadlineOverdue, 0);
      assert.equal(privacyDeadlineRun.externalNotificationsSent, 0);
      const privacyDeadlineReplay = await inTransaction((client) => (
        reconcilePrivacyRightsDeadlinesWithClient(client, { now: privacyNearAt })
      ));
      assert.equal(privacyDeadlineReplay.alertsCreated, 0);
      const privacyIncidentIntakeResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3t-wrong-recipient-incident-intake',
        },
        body: JSON.stringify({
          caseType: 'privacy_security',
          caseSubType: 'wrong_recipient_or_wrong_account',
          summary: 'Kontrollierten Versand an das falsche Testkonto als Datenschutzvorfall prüfen.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
        }),
      });
      assert.equal(privacyIncidentIntakeResponse.status, 201);
      const privacyIncidentIntake = await privacyIncidentIntakeResponse.json();
      const privacyIncidentStored = await setupPool.query(
        `SELECT * FROM support_privacy_incidents WHERE case_id = $1`,
        [privacyIncidentIntake.supportCase.id],
      );
      assert.equal(privacyIncidentStored.rowCount, 1);
      const privacyIncidentBeforeContainment = privacyIncidentStored.rows[0];
      assert.equal(privacyIncidentBeforeContainment.incident_version, 'sit_privacy_incident_v1');
      assert.equal(privacyIncidentBeforeContainment.containment_status, 'pending');
      assert.equal(privacyIncidentBeforeContainment.assessment_status, 'pending_human_assessment');
      assert.equal(privacyIncidentBeforeContainment.authority_notification_status, 'not_decided');
      assert.equal(privacyIncidentBeforeContainment.external_notifications_sent, false);
      assert.equal(
        new Date(privacyIncidentBeforeContainment.notification_deadline_at).getTime()
          - new Date(privacyIncidentBeforeContainment.breach_awareness_at).getTime(),
        72 * 60 * 60 * 1000,
      );
      assert.equal(
        new Date(privacyIncidentBeforeContainment.notification_deadline_at).getTime()
          - new Date(privacyIncidentBeforeContainment.reminder_at).getTime(),
        12 * 60 * 60 * 1000,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_privacy_incidents
              SET notification_deadline_at = notification_deadline_at + interval '1 hour',
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [privacyIncidentBeforeContainment.id],
        ),
        (error) => error?.code === '55000',
      );
      const privacyIncidentNearAt = new Date(
        new Date(privacyIncidentBeforeContainment.notification_deadline_at).getTime()
          - (6 * 60 * 60 * 1000),
      );
      const privacyIncidentDeadlineRun = await inTransaction((client) => (
        reconcilePrivacyIncidentDeadlinesWithClient(client, { now: privacyIncidentNearAt })
      ));
      assert.equal(privacyIncidentDeadlineRun.deadlineNear, 1);
      assert.equal(privacyIncidentDeadlineRun.deadlineOverdue, 0);
      assert.equal(privacyIncidentDeadlineRun.externalNotificationsSent, 0);
      const privacyIncidentDeadlineReplay = await inTransaction((client) => (
        reconcilePrivacyIncidentDeadlinesWithClient(client, { now: privacyIncidentNearAt })
      ));
      assert.equal(privacyIncidentDeadlineReplay.alertsCreated, 0);
      const article18IntakeResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3r-article18-candidate-intake',
        },
        body: JSON.stringify({
          caseType: 'trust_safety',
          caseSubType: 'threat_or_violence',
          summary: 'Konkrete Drohung gegen Leben oder körperliche Sicherheit prüfen.',
          immediateDanger: true,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: true,
            guidanceShown: true,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
        }),
      });
      assert.equal(article18IntakeResponse.status, 201);
      const article18Intake = await article18IntakeResponse.json();
      assert.equal(article18Intake.supportCase.priority, 'p0');
      assert.equal(article18Intake.supportCase.operatingMode, 'simulation');
      assert.equal('flags' in article18Intake.supportCase, false);
      const article18CandidateState = await setupPool.query(
        `SELECT safety_flag, authority_flag, article18_candidate_flag
           FROM support_cases WHERE id = $1`,
        [article18Intake.supportCase.id],
      );
      assert.deepEqual(article18CandidateState.rows[0], {
        safety_flag: true,
        authority_flag: true,
        article18_candidate_flag: true,
      });
      await assert.rejects(
        setupPool.query(
          `INSERT INTO support_cases (
             human_readable_case_number, case_type, case_subtype, status,
             priority, severity, source_channel, operating_mode,
             reporter_user_id, reporter_role, current_owner_role,
             approval_level, waiting_on, next_action, next_update_at,
             user_facing_summary, idempotency_key, intake_scope_evidence
           ) VALUES (
             'SIT-NPQRSTVWXYZ2', 'moderation_content',
             'illegal_content_notice', 'received', 'p2', 'moderate',
             'internal', 'simulation', 'renter-a', 'user',
             'moderation_owner', 'yellow_human_review', 'support_owner',
             'Review the synthetic notice.', now() + interval '4 hours',
             'Synthetic notice without required evidence.',
             'dsa-notice-missing-evidence-integration',
             '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
           )`,
        ),
        (error) => error?.code === '23514'
          && error?.message === 'support_dsa_notice_required',
      );
      await restartApplicationServer();
      const createDsaNotice = () => fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3n-dsa-notice-integration',
        },
        body: JSON.stringify({
          caseType: 'moderation_content',
          caseSubType: 'illegal_content_notice',
          summary: 'Konkreten mutmaßlich rechtswidrigen Inhalt prüfen.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
          dsaNotice: {
            version: 'sit_dsa_notice_intake_v1',
            contentType: 'listing',
            contentLocator: 'listing:listing-1',
            illegalityStatement:
              'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
            jurisdictionOrLegalBasis: 'Deutschland',
            goodFaithConfirmed: true,
          },
        }),
      });
      const dsaNoticeResponse = await createDsaNotice();
      assert.equal(dsaNoticeResponse.status, 201);
      const dsaNotice = await dsaNoticeResponse.json();
      assert.equal(dsaNotice.replayed, false);
      assert.equal(dsaNotice.supportCase.caseType, 'moderation_content');
      assert.equal(dsaNotice.supportCase.caseSubType, 'illegal_content_notice');
      assert.match(
        dsaNotice.supportCase.dsaNoticeNumber,
        /^SIT-N-[A-HJ-NP-Z2-9]{12}$/u,
      );
      assert.equal(dsaNotice.supportCase.dsaNoticeLocatorStatus, 'complete');
      assert.equal(dsaNotice.supportCase.dsaNoticeLocatorPrompt, null);
      assert.equal(dsaNotice.supportCase.dsaNoticeLocatorMaySubmit, false);
      assert.equal('dsaNoticeEvidence' in dsaNotice.supportCase, false);
      const dsaNoticeReplay = await createDsaNotice();
      assert.equal(dsaNoticeReplay.status, 200);
      assert.equal((await dsaNoticeReplay.json()).replayed, true);

      const storedDsaNotice = await setupPool.query(
        `SELECT dsa_notice_number, dsa_notice_evidence,
                dsa_notice_locator_status, dsa_notice_locator_kind
           FROM support_cases
          WHERE id = $1`,
        [dsaNotice.supportCase.id],
      );
      assert.equal(
        storedDsaNotice.rows[0].dsa_notice_number,
        dsaNotice.supportCase.dsaNoticeNumber,
      );
      assert.deepEqual(storedDsaNotice.rows[0].dsa_notice_evidence, {
        version: 'sit_dsa_notice_intake_v1',
        contentType: 'listing',
        contentLocator: 'listing:listing-1',
        illegalityStatement:
          'Diese konkrete Anzeige verletzt nach meiner Einschätzung geltendes Recht.',
        jurisdictionOrLegalBasis: 'Deutschland',
        goodFaithConfirmed: true,
        reporterName: 'Renter A',
        reporterEmail: 'renter-a@example.com',
        sourceChannel: 'app',
        submittedAt: storedDsaNotice.rows[0].dsa_notice_evidence.submittedAt,
      });
      assert.equal(storedDsaNotice.rows[0].dsa_notice_locator_status, 'complete');
      assert.equal(storedDsaNotice.rows[0].dsa_notice_locator_kind, 'listing_reference');
      assert.ok(Date.parse(
        storedDsaNotice.rows[0].dsa_notice_evidence.submittedAt,
      ));
      const dsaCreatedEvent = await setupPool.query(
        `SELECT structured_payload
           FROM support_case_events
          WHERE case_id = $1 AND event_type = 'case.created'`,
        [dsaNotice.supportCase.id],
      );
      assert.deepEqual(dsaCreatedEvent.rows[0].structured_payload.dsaNotice, {
        noticeNumber: dsaNotice.supportCase.dsaNoticeNumber,
        version: 'sit_dsa_notice_intake_v1',
        contentType: 'listing',
        locatorStatus: 'complete',
        locatorKind: 'listing_reference',
      });
      assert.equal(
        JSON.stringify(dsaCreatedEvent.rows[0].structured_payload)
          .includes('renter-a@example.com'),
        false,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET dsa_notice_evidence = jsonb_set(
                    dsa_notice_evidence,
                    '{goodFaithConfirmed}',
                    'false'::jsonb
                  )
            WHERE id = $1`,
          [dsaNotice.supportCase.id],
        ),
        (error) => error?.code === '55000'
          && error?.message === 'support_dsa_notice_immutable',
      );

      const incompleteDsaResponse = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 's3o-incomplete-dsa-notice-integration',
        },
        body: JSON.stringify({
          caseType: 'moderation_content',
          caseSubType: 'illegal_content_notice',
          summary: 'Meldung ohne bereits bekannten exakten Fundort aufnehmen.',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
          dsaNotice: {
            version: 'sit_dsa_notice_intake_v1',
            contentType: 'message',
            contentLocator: '',
            illegalityStatement:
              'Diese konkrete Nachricht verletzt nach meiner Einschätzung geltendes Recht.',
            jurisdictionOrLegalBasis: null,
            goodFaithConfirmed: true,
          },
        }),
      });
      assert.equal(incompleteDsaResponse.status, 201);
      const incompleteDsa = await incompleteDsaResponse.json();
      assert.match(
        incompleteDsa.supportCase.dsaNoticeNumber,
        /^SIT-N-[A-HJ-NP-Z2-9]{12}$/u,
      );
      assert.equal(
        incompleteDsa.supportCase.dsaNoticeLocatorStatus,
        'needs_clarification',
      );
      assert.equal(incompleteDsa.supportCase.dsaNoticeLocatorMaySubmit, true);
      assert.match(
        incompleteDsa.supportCase.dsaNoticeLocatorPrompt,
        /exakten Fundort/u,
      );
      assert.equal(incompleteDsa.supportCase.waitingOn, 'reporter');

      const otherReporterLocator = await fetch(
        `${baseUrl}/v1/support/cases/${incompleteDsa.supportCase.id}/dsa-locator`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': 's3o-locator-other-reporter-integration',
          },
          body: JSON.stringify({
            contentLocator: 'message:message-9',
            expectedVersion: incompleteDsa.supportCase.version,
          }),
        },
      );
      assert.equal(otherReporterLocator.status, 404);

      const incompleteLocatorResponse = await fetch(
        `${baseUrl}/v1/support/cases/${incompleteDsa.supportCase.id}/dsa-locator`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's3o-locator-inexact-integration',
          },
          body: JSON.stringify({
            contentLocator: 'die Nachricht oben',
            expectedVersion: incompleteDsa.supportCase.version,
          }),
        },
      );
      assert.equal(incompleteLocatorResponse.status, 422);
      assert.equal(
        (await incompleteLocatorResponse.json()).error,
        'support_dsa_notice_locator_exact_required',
      );

      const completeLocator = () => fetch(
        `${baseUrl}/v1/support/cases/${incompleteDsa.supportCase.id}/dsa-locator`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's3o-locator-complete-integration',
          },
          body: JSON.stringify({
            contentLocator: 'thread:thread-7:message:message-9',
            expectedVersion: incompleteDsa.supportCase.version,
          }),
        },
      );
      const completeLocatorResponse = await completeLocator();
      assert.equal(completeLocatorResponse.status, 201);
      const completedDsa = await completeLocatorResponse.json();
      assert.equal(completedDsa.replayed, false);
      assert.equal(completedDsa.supportCase.dsaNoticeLocatorStatus, 'complete');
      assert.equal(completedDsa.supportCase.dsaNoticeLocatorPrompt, null);
      assert.equal(completedDsa.supportCase.dsaNoticeLocatorMaySubmit, false);
      assert.equal(
        completedDsa.supportCase.version,
        incompleteDsa.supportCase.version + 1,
      );
      const completeLocatorReplay = await completeLocator();
      assert.equal(completeLocatorReplay.status, 200);
      assert.equal((await completeLocatorReplay.json()).replayed, true);

      const storedLocator = await setupPool.query(
        `SELECT content_locator, locator_kind
           FROM support_dsa_notice_locator_amendments
          WHERE case_id = $1`,
        [incompleteDsa.supportCase.id],
      );
      assert.deepEqual(storedLocator.rows, [{
        content_locator: 'thread:thread-7:message:message-9',
        locator_kind: 'message_reference',
      }]);
      const locatorEvent = await setupPool.query(
        `SELECT structured_payload
           FROM support_case_events
          WHERE case_id = $1 AND event_type = 'dsa_notice.locator_completed'`,
        [incompleteDsa.supportCase.id],
      );
      assert.deepEqual(locatorEvent.rows[0].structured_payload, {
        locatorStatus: 'complete',
        locatorKind: 'message_reference',
      });
      assert.equal(
        JSON.stringify(locatorEvent.rows[0].structured_payload)
          .includes('thread-7'),
        false,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET intake_scope_evidence = jsonb_set(
                    intake_scope_evidence,
                    '{separationGuidanceShown}',
                    'false'::jsonb
                  ),
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportIntake.supportCase.id],
        ),
        (error) => error?.code === '55000'
          && error?.message === 'support_issue_scope_immutable',
      );
      await setupPool.query(
        `UPDATE support_cases
            SET status = 'acknowledged',
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1`,
        [supportIntake.supportCase.id],
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_cases
              SET status = 'waiting_for_user',
                  waiting_on = 'reporter',
                  waiting_reason = 'Eine konkrete Angabe fehlt.',
                  next_action = 'Bitte ergänze die konkrete Angabe.',
                  next_update_at = now() + interval '2 hours',
                  evidence_due_at = NULL,
                  lock_version = lock_version + 1,
                  updated_at = updated_at + interval '1 second'
            WHERE id = $1`,
          [supportIntake.supportCase.id],
        ),
        (error) => error?.constraint === 'support_cases_user_action_deadline_state',
      );
      await setupPool.query(
        `UPDATE support_cases
            SET status = 'waiting_for_user',
                waiting_on = 'reporter',
                waiting_reason = 'Eine konkrete Angabe fehlt.',
                next_action = 'Bitte ergänze die konkrete Angabe.',
                next_update_at = now() + interval '2 hours',
                evidence_due_at = now() + interval '3 days',
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1`,
        [supportIntake.supportCase.id],
      );
      const waitingSupportResponse = await fetch(
        `${baseUrl}/v1/support/cases/${supportIntake.supportCase.id}`,
        { headers: renterAHeaders },
      );
      assert.equal(waitingSupportResponse.status, 200);
      const waitingSupportCase = (await waitingSupportResponse.json()).supportCase;
      assert.equal(waitingSupportCase.status, 'waiting_for_user');
      assert.ok(Date.parse(waitingSupportCase.userActionDueAt));
      assert.ok(waitingSupportCase.userActionDueDisplay);
      assert.ok(waitingSupportCase.nextUpdateDisplay);
      const disabledGroupRequest = await fetch(`${baseUrl}/v1/booking-groups`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'Idempotency-Key': 'g3c-disabled-route-probe',
        },
        body: JSON.stringify({
          listingIds: ['listing-1', 'unpublished-second-listing'],
          startDate: '2027-07-01',
          endDate: '2027-07-03',
        }),
      });
      assert.equal(disabledGroupRequest.status, 503);
      assert.equal((await disabledGroupRequest.json()).error, 'booking_groups_not_enabled');
      const phoneStatus = await fetch(`${baseUrl}/v1/auth/phone-verification/status`, {
        headers: ownerHeaders,
      });
      assert.equal(phoneStatus.status, 200);
      assert.deepEqual(await phoneStatus.json(), {
        available: true,
        provider: 'firebase-phone',
      });
      phoneClaims.set('phone-token-owner', {
        firebaseUserId: 'firebase-phone-owner',
        phoneNumber: '+4915212345678',
      });
      phoneClaims.set('phone-token-other', {
        firebaseUserId: 'firebase-phone-other',
        phoneNumber: '+491701234567',
      });
      const mismatchedPhone = await fetch(`${baseUrl}/v1/auth/phone-verification/confirm`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          phoneNumber: '+4915212345678',
          firebaseIdToken: 'phone-token-other',
        }),
      });
      assert.equal(mismatchedPhone.status, 422);
      assert.equal((await mismatchedPhone.json()).error, 'phone_verification_mismatch');

      const verifiedPhone = await fetch(`${baseUrl}/v1/auth/phone-verification/confirm`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          phoneNumber: '+4915212345678',
          firebaseIdToken: 'phone-token-owner',
        }),
      });
      assert.equal(verifiedPhone.status, 200);
      const verifiedPhonePayload = await verifiedPhone.json();
      assert.equal(verifiedPhonePayload.verified, true);
      assert.equal(verifiedPhonePayload.user.phone, '+4915212345678');
      assert.equal(verifiedPhonePayload.user.phoneVerified, true);
      assert.deepEqual(deletedPhoneIdentities, [
        'firebase-phone-other',
        'firebase-phone-owner',
      ]);

      phoneClaims.set('phone-token-renter-a', {
        firebaseUserId: 'firebase-phone-renter-a',
        phoneNumber: '+4915212345678',
      });
      const duplicateVerifiedPhone = await fetch(`${baseUrl}/v1/auth/phone-verification/confirm`, {
        method: 'POST',
        headers: renterAHeaders,
        body: JSON.stringify({
          phoneNumber: '+4915212345678',
          firebaseIdToken: 'phone-token-renter-a',
        }),
      });
      assert.equal(duplicateVerifiedPhone.status, 409);
      assert.equal((await duplicateVerifiedPhone.json()).error, 'phone_already_verified');
      assert.deepEqual(deletedPhoneIdentities, [
        'firebase-phone-other',
        'firebase-phone-owner',
        'firebase-phone-renter-a',
      ]);

      const phoneAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
         WHERE actor_id = 'owner' AND action = 'auth.phone_verified'`,
      );
      assert.equal(phoneAudit.rowCount, 1);
      assert.deepEqual(phoneAudit.rows[0].metadata, { provider: 'firebase-phone' });
      const availabilityRules = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        localStart: '00:00',
        localEnd: '23:59',
        isAvailable: true,
      }));
      const replaceAvailability = await fetch(`${baseUrl}/v1/listings/listing-1/availability`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          timezone: 'Europe/Berlin',
          minimumDays: 1,
          maximumDays: 30,
          noticeHours: 0,
          acceptanceWindowMinutes: 30,
          rules: availabilityRules,
          blocks: [{
            startDate: '2026-12-01',
            endDate: '2026-12-03',
            kind: 'maintenance',
            reason: 'Integration maintenance window',
          }],
        }),
      });
      assert.equal(replaceAvailability.status, 200);
      assert.ok((await replaceAvailability.json()).revision > 1);

      const availabilityResponse = await fetch(
        `${baseUrl}/v1/listings/listing-1/availability?from=2026-09-01&to=2026-12-10`,
      );
      assert.equal(availabilityResponse.status, 200);
      const availability = (await availabilityResponse.json()).availability;
      assert.equal(availability.timezone, 'Europe/Berlin');
      assert.equal(availability.rules.length, 7);
      assert.equal(availability.unavailable.filter((entry) => entry.type === 'block').length, 1);

      const rollbackPayload = {
        id: 'b5-rollback-booking',
        itemId: 'listing-1',
        ownerId: 'owner',
        renterId: 'renter-a',
        status: 'pending',
        start: '2026-12-10T10:00:00.000Z',
        end: '2026-12-12T10:00:00.000Z',
        createdAt: '2026-08-09T01:00:00.000Z',
      };
      await setupPool.query(
        `INSERT INTO rental_requests (
           id, item_id, owner_id, renter_id, status, payload, created_at
         ) VALUES (
           'b5-rollback-booking', 'listing-1', 'owner', 'renter-a',
           'pending', $1::jsonb, $2
         )`,
        [JSON.stringify(rollbackPayload), rollbackPayload.createdAt],
      );
      await setupPool.query(
        `INSERT INTO bookings (
           id, listing_id, owner_id, renter_id, status, starts_at, ends_at,
           currency, quoted_total_minor
         ) VALUES (
           'b5-rollback-booking', 'listing-1', 'owner', 'renter-a',
           'pending', $1, $2, 'EUR', 3000
         )`,
        [rollbackPayload.start, rollbackPayload.end],
      );
      const quarantinedBooking = await setupPool.query(
        `SELECT workflow_version FROM bookings WHERE id = 'b5-rollback-booking'`,
      );
      assert.equal(quarantinedBooking.rows[0].workflow_version, 0);
      const hiddenRollbackBooking = await fetch(`${baseUrl}/v1/rental-requests`, {
        headers: { Authorization: `Bearer ${tokenFor('renter-a')}` },
      });
      assert.equal(hiddenRollbackBooking.status, 200);
      assert.equal(
        (await hiddenRollbackBooking.json()).requests.some((entry) => entry.id === 'b5-rollback-booking'),
        false,
      );
      const revalidatedRollbackBooking = await fetch(
        `${baseUrl}/v1/bookings/b5-rollback-booking`,
        {
          method: 'PATCH',
          headers: { ...renterAHeaders, 'Idempotency-Key': 'revalidate-b5-rollback-booking' },
          body: JSON.stringify({
            itemId: 'listing-1',
            startDate: '2026-12-10',
            endDate: '2026-12-12',
          }),
        },
      );
      const revalidatedRollbackPayload = await revalidatedRollbackBooking.json();
      assert.equal(
        revalidatedRollbackBooking.status,
        200,
        JSON.stringify(revalidatedRollbackPayload),
      );
      const revalidatedBooking = revalidatedRollbackPayload.booking;
      assert.equal(revalidatedBooking.workflowVersion, 1);
      assert.equal(revalidatedBooking.workflowStatus, 'requested');
      assert.equal(revalidatedBooking.quote.totalMinor, 3300);

      const blockedCheck = await fetch(`${baseUrl}/v1/listings/listing-1/availability/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: '2026-12-01', endDate: '2026-12-02' }),
      });
      assert.equal(blockedCheck.status, 409);
      assert.equal((await blockedCheck.json()).reason, 'listing_period_blocked');

      const quotePayload = {
        itemId: 'listing-1',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        ownerDeliversAtDropoffChosen: false,
        ownerPicksUpAtReturnChosen: false,
      };
      const quoteResponse = await fetch(`${baseUrl}/v1/bookings/quote`, {
        method: 'POST',
        headers: renterAHeaders,
        body: JSON.stringify(quotePayload),
      });
      assert.equal(quoteResponse.status, 200);
      const quoted = await quoteResponse.json();
      assert.equal(quoted.quote.days, 2);
      assert.equal(quoted.quote.baseRentalMinor, 3000);
      assert.equal(quoted.quote.platformFeeMinor, 300);
      assert.equal(quoted.quote.totalMinor, 3300);
      assert.match(quoted.start, /T22:00:00\.000Z$/);
      assert.match(quoted.quoteId, /^quote_[0-9a-f-]{36}$/);
      assert.match(quoted.quoteHash, /^[0-9a-f]{64}$/);
      assert.ok(Date.parse(quoted.quotedAt) < Date.parse(quoted.expiresAt));
      const persistedQuote = await setupPool.query(
        `SELECT renter_id, listing_id, quote_hash, quote_payload, expires_at
           FROM booking_quotes
          WHERE id = $1`,
        [quoted.quoteId],
      );
      assert.equal(persistedQuote.rowCount, 1);
      assert.equal(persistedQuote.rows[0].renter_id, 'renter-a');
      assert.equal(persistedQuote.rows[0].listing_id, 'listing-1');
      assert.equal(persistedQuote.rows[0].quote_hash, quoted.quoteHash);
      assert.equal(persistedQuote.rows[0].quote_payload.totalMinor, 3300);

      const bookingCountBeforeGroup = (await setupPool.query(
        'SELECT count(*)::int AS count FROM bookings',
      )).rows[0].count;
      await setupPool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor, title, description,
           category_id, subcategory, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, availability_timezone,
           private_status_confirmed_at, private_pilot_region_code
         ) VALUES (
           'g3b-listing-2', 'owner',
           '{"id":"g3b-listing-2","ownerId":"owner","title":"Lens","description":"Lens for booking group integration tests","categoryId":"cat3","subcategory":"Objektive","condition":"good","city":"Berlin","country":"Deutschland","currency":"EUR","pricePerDay":12,"status":"active","isActive":true,"protectionModel":"none"}'::jsonb,
           true, 1, 1, 'active', 'EUR', 1200, 'Lens',
           'Lens for booking group integration tests', 'cat3', 'Objektive',
           'good', 'Owner exact address', 'Berlin', 'Deutschland', 52.5201,
           13.4051, 1, 30, 'Europe/Berlin', now(), 'berlin'
         )`,
      );
      await setupPool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, currency, price_per_day_minor, country
         ) VALUES (
           'g3b-foreign-listing', 'outsider',
            '{"id":"g3b-foreign-listing","ownerId":"outsider","title":"Foreign","currency":"EUR","country":"Deutschland"}'::jsonb,
           true, 'EUR', 1200, 'Deutschland'
         )`,
      );
      const bookingGroupId = 'booking_group_11111111-1111-4111-8111-111111111111';
      await setupPool.query(
        `INSERT INTO booking_groups (
           id, owner_id, renter_id, currency,
           rental_start_date, rental_end_date, rental_timezone, starts_at, ends_at,
           handover_location_key, handover_policy_version,
           legal_document_set_version, cancellation_policy_version,
           payment_configuration_key, compatibility_hash
         ) VALUES (
           $1, 'owner', 'renter-a', 'EUR',
           '2026-10-01', '2026-10-03', $2, $3, $4,
           $5, 'private_owner_pickup_v1',
           'G3L-DRAFT-2026-08-20.1', 'v52_private_cancellation',
           'disabled_test_only', $6
         )`,
        [bookingGroupId, quoted.timezone, quoted.start, quoted.end, 'a'.repeat(64), 'b'.repeat(64)],
      );
      await setupPool.query(
        `INSERT INTO booking_group_positions (
           id, booking_group_id, listing_id, quote_id, quote_hash, currency,
           rental_subtotal_minor, platform_fee_minor, total_minor,
           owner_payout_minor, security_deposit_minor, sort_order
         ) VALUES (
           'booking_group_position_22222222-2222-4222-8222-222222222222',
           $1, 'listing-1', $2, $3, 'EUR', 3000, 300, 3300, 3000, 0, 0
         )`,
        [bookingGroupId, quoted.quoteId, quoted.quoteHash],
      );
      const concurrentPositions = await Promise.allSettled([
        setupPool.query(
          `INSERT INTO booking_group_positions (
             id, booking_group_id, listing_id, sort_order
           ) VALUES (
             'booking_group_position_33333333-3333-4333-8333-333333333333',
             $1, 'g3b-listing-2', 1
           )`,
          [bookingGroupId],
        ),
        setupPool.query(
          `INSERT INTO booking_group_positions (
             id, booking_group_id, listing_id, sort_order
           ) VALUES (
             'booking_group_position_44444444-4444-4444-8444-444444444444',
             $1, 'g3b-listing-2', 1
           )`,
          [bookingGroupId],
        ),
      ]);
      assert.deepEqual(
        concurrentPositions.map((result) => result.status).sort(),
        ['fulfilled', 'rejected'],
      );
      assert.equal(
        concurrentPositions.find((result) => result.status === 'rejected').reason.code,
        '23505',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO booking_group_positions (
             id, booking_group_id, listing_id, sort_order
           ) VALUES (
             'booking_group_position_55555555-5555-4555-8555-555555555555',
             $1, 'g3b-foreign-listing', 2
           )`,
          [bookingGroupId],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'booking_group_position_owner_mismatch',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO booking_group_positions (
             id, booking_group_id, listing_id, quote_id, quote_hash, currency,
             rental_subtotal_minor, platform_fee_minor, total_minor,
             owner_payout_minor, security_deposit_minor, sort_order
           ) VALUES (
             'booking_group_position_66666666-6666-4666-8666-666666666666',
             $1, 'g3b-listing-2', $2, $3, 'EUR', 3000, 300, 3300, 3000, 0, 2
           )`,
          [bookingGroupId, quoted.quoteId, quoted.quoteHash],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'booking_group_position_quote_mismatch',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE booking_groups SET currency = 'USD' WHERE id = $1`,
          [bookingGroupId],
        ),
        (error) => error?.code === '55000',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE booking_group_positions SET sort_order = 5
            WHERE booking_group_id = $1 AND sort_order = 1`,
          [bookingGroupId],
        ),
        (error) => error?.code === '55000',
      );
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM booking_group_positions WHERE booking_group_id = $1',
        [bookingGroupId],
      )).rows[0].count, 2);
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM bookings',
      )).rows[0].count, bookingCountBeforeGroup);

      await setupPool.query(
        `UPDATE users
            SET private_use_confirmed_at = now(),
                private_marketplace_review_status = 'clear'
          WHERE id IN ('owner', 'renter-a')`,
      );
      await setupPool.query(
        `UPDATE listings
            SET subcategory = 'Kameras',
                private_status_confirmed_at = now(),
                private_pilot_region_code = 'berlin',
                availability_timezone = 'Europe/Berlin'
          WHERE id = 'listing-1'`,
      );
      const {
        acceptBookingGroupCounteroffer,
        decideBookingGroup,
        getBookingGroup,
        requestBookingGroup,
      } = await import('../src/booking_group_workflow.js');
      const runBookingGroupCommand = async (command) => {
        const client = await setupPool.connect();
        try {
          await client.query('BEGIN');
          const result = await command(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
      const groupActors = {
        owner: { id: 'owner', role: 'user' },
        renter: { id: 'renter-a', role: 'user' },
        outsider: { id: 'outsider', role: 'user' },
      };
      const groupRequest = {
        listingIds: ['listing-1', 'g3b-listing-2'],
        startDate: '2027-07-01',
        endDate: '2027-07-03',
      };
      const groupPrivateRegions = ['berlin'];
      const boundaryCountsBeforeG3c = (await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM bookings) AS bookings,
           (SELECT count(*)::int FROM rental_requests) AS rental_requests,
           (SELECT count(*)::int FROM listing_availability_blocks) AS availability_blocks,
           (SELECT count(*)::int FROM platform_contracts) AS contracts,
           (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];

      const requestCounterGroup = () => runBookingGroupCommand((client) => requestBookingGroup(client, {
        actor: groupActors.renter,
        raw: groupRequest,
        idempotencyKey: 'g3c-request-counter-path',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      const concurrentCounterRequests = await Promise.all([
        requestCounterGroup(),
        requestCounterGroup(),
      ]);
      const counterInitial = concurrentCounterRequests.find(
        (result) => result.replayed === false,
      );
      const counterInitialReplay = concurrentCounterRequests.find(
        (result) => result.replayed === true,
      );
      assert.equal(counterInitial.group.state, 'requested');
      assert.equal(counterInitial.group.positions.length, 2);
      assert.equal(counterInitial.quote.itemCount, 2);
      assert.equal(
        counterInitial.quote.totalMinor,
        counterInitial.quote.items.reduce((total, item) => total + item.totalMinor, 0),
      );
      assert.equal(counterInitial.replayed, false);
      assert.equal(counterInitialReplay.replayed, true);
      assert.equal(counterInitialReplay.group.id, counterInitial.group.id);

      await assert.rejects(
        runBookingGroupCommand((client) => decideBookingGroup(client, {
          actor: groupActors.outsider,
          bookingGroupId: counterInitial.group.id,
          raw: {
            action: 'accept_all',
            quoteId: counterInitial.quote.id,
            quoteHash: counterInitial.quote.quoteHash,
          },
          idempotencyKey: 'g3c-outsider-owner-decision',
          privatePilotAllowedRegions: groupPrivateRegions,
        })),
        (error) => error?.code === 'booking_group_owner_forbidden',
      );
      const counterDecision = await runBookingGroupCommand((client) => decideBookingGroup(client, {
        actor: groupActors.owner,
        bookingGroupId: counterInitial.group.id,
        raw: {
          action: 'counteroffer',
          quoteId: counterInitial.quote.id,
          quoteHash: counterInitial.quote.quoteHash,
          listingIds: ['listing-1'],
        },
        idempotencyKey: 'g3c-owner-counteroffer',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      assert.equal(counterDecision.state, 'counteroffered');
      assert.equal(counterDecision.quote.revision, 2);
      assert.equal(counterDecision.quote.predecessorQuoteId, counterInitial.quote.id);
      assert.equal(counterDecision.quote.itemCount, 1);
      assert.equal(counterDecision.quote.items[0].listingId, 'listing-1');
      assert.notEqual(counterDecision.quote.quoteHash, counterInitial.quote.quoteHash);
      const counterProjection = await runBookingGroupCommand((client) => getBookingGroup(client, {
        actorId: groupActors.renter.id,
        bookingGroupId: counterInitial.group.id,
      }));
      assert.equal(counterProjection.quote.id, counterDecision.quote.id);
      assert.equal(counterProjection.previousQuote.id, counterInitial.quote.id);
      assert.equal(counterProjection.previousQuote.totalMinor, counterInitial.quote.totalMinor);
      assert.equal(counterProjection.previousQuote.quoteHash, counterInitial.quote.quoteHash);
      const counterDecisionReplay = await runBookingGroupCommand((client) => decideBookingGroup(client, {
        actor: groupActors.owner,
        bookingGroupId: counterInitial.group.id,
        raw: {
          action: 'counteroffer',
          quoteId: counterInitial.quote.id,
          quoteHash: counterInitial.quote.quoteHash,
          listingIds: ['listing-1'],
        },
        idempotencyKey: 'g3c-owner-counteroffer',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      assert.equal(counterDecisionReplay.replayed, true);
      assert.equal(counterDecisionReplay.quote.id, counterDecision.quote.id);

      await assert.rejects(
        runBookingGroupCommand((client) => acceptBookingGroupCounteroffer(client, {
          actor: groupActors.renter,
          bookingGroupId: counterInitial.group.id,
          raw: {
            accepted: false,
            quoteId: counterDecision.quote.id,
            quoteHash: counterDecision.quote.quoteHash,
          },
          idempotencyKey: 'g3c-renter-refused-consent-probe',
        })),
        (error) => error?.code === 'explicit_booking_group_counteroffer_consent_required',
      );
      await assert.rejects(
        runBookingGroupCommand((client) => acceptBookingGroupCounteroffer(client, {
          actor: groupActors.renter,
          bookingGroupId: counterInitial.group.id,
          raw: {
            accepted: true,
            quoteId: counterInitial.quote.id,
            quoteHash: counterInitial.quote.quoteHash,
          },
          idempotencyKey: 'g3c-renter-stale-consent-probe',
        })),
        (error) => error?.code === 'booking_group_quote_changed',
      );
      const counterAccepted = await runBookingGroupCommand(
        (client) => acceptBookingGroupCounteroffer(client, {
          actor: groupActors.renter,
          bookingGroupId: counterInitial.group.id,
          raw: {
            accepted: true,
            quoteId: counterDecision.quote.id,
            quoteHash: counterDecision.quote.quoteHash,
          },
          idempotencyKey: 'g3c-renter-counteroffer-consent',
        }),
      );
      assert.equal(counterAccepted.state, 'counteroffer_accepted');
      const counterAcceptedReplay = await runBookingGroupCommand(
        (client) => acceptBookingGroupCounteroffer(client, {
          actor: groupActors.renter,
          bookingGroupId: counterInitial.group.id,
          raw: {
            accepted: true,
            quoteId: counterDecision.quote.id,
            quoteHash: counterDecision.quote.quoteHash,
          },
          idempotencyKey: 'g3c-renter-counteroffer-consent',
        }),
      );
      assert.equal(counterAcceptedReplay.replayed, true);

      const acceptedInitial = await runBookingGroupCommand((client) => requestBookingGroup(client, {
        actor: groupActors.renter,
        raw: groupRequest,
        idempotencyKey: 'g3c-request-accept-all-path',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      const acceptedAll = await runBookingGroupCommand((client) => decideBookingGroup(client, {
        actor: groupActors.owner,
        bookingGroupId: acceptedInitial.group.id,
        raw: {
          action: 'accept_all',
          quoteId: acceptedInitial.quote.id,
          quoteHash: acceptedInitial.quote.quoteHash,
        },
        idempotencyKey: 'g3c-owner-accept-all',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      assert.equal(acceptedAll.state, 'owner_accepted');
      assert.equal(acceptedAll.quote.itemCount, 2);

      const declinedInitial = await runBookingGroupCommand((client) => requestBookingGroup(client, {
        actor: groupActors.renter,
        raw: groupRequest,
        idempotencyKey: 'g3c-request-decline-all-path',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      const declinedAll = await runBookingGroupCommand((client) => decideBookingGroup(client, {
        actor: groupActors.owner,
        bookingGroupId: declinedInitial.group.id,
        raw: {
          action: 'decline_all',
          quoteId: declinedInitial.quote.id,
          quoteHash: declinedInitial.quote.quoteHash,
        },
        idempotencyKey: 'g3c-owner-decline-all',
        privatePilotAllowedRegions: groupPrivateRegions,
      }));
      assert.equal(declinedAll.state, 'declined');

      const counterEvents = await setupPool.query(
        `SELECT event_sequence, event_type, from_state, to_state, group_quote_id
           FROM booking_group_state_events
          WHERE booking_group_id = $1
          ORDER BY event_sequence`,
        [counterInitial.group.id],
      );
      assert.deepEqual(counterEvents.rows.map((row) => row.event_type), [
        'booking_group.requested',
        'booking_group.owner_counteroffered',
        'booking_group.renter_accepted_counteroffer',
      ]);
      assert.deepEqual(counterEvents.rows.map((row) => row.to_state), [
        'requested',
        'counteroffered',
        'counteroffer_accepted',
      ]);
      assert.equal(counterEvents.rows[1].group_quote_id, counterDecision.quote.id);
      assert.equal(counterEvents.rows[2].group_quote_id, counterDecision.quote.id);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM booking_group_commands
          WHERE booking_group_id IN ($1, $2, $3)`,
        [counterInitial.group.id, acceptedInitial.group.id, declinedInitial.group.id],
      )).rows[0].count, 7);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM audit_log
          WHERE resource_type = 'booking_group'
            AND resource_id IN ($1, $2, $3)`,
        [counterInitial.group.id, acceptedInitial.group.id, declinedInitial.group.id],
      )).rows[0].count, 7);
      assert.deepEqual((await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM bookings) AS bookings,
           (SELECT count(*)::int FROM rental_requests) AS rental_requests,
           (SELECT count(*)::int FROM listing_availability_blocks) AS availability_blocks,
           (SELECT count(*)::int FROM platform_contracts) AS contracts,
           (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0], boundaryCountsBeforeG3c);

      const {
        bindBookingGroupPositionToV52Booking,
        getBookingGroupHandoverReturn,
        scheduleBookingGroupAppointments,
      } = await import('../src/booking_group_handover_workflow.js');
      const g3dClient = await setupPool.connect();
      try {
        await g3dClient.query('BEGIN');
        const contractVersion = 'V5.2-G3D-INTEGRATION';
        const documentKeys = [
          'platform_terms',
          'private_rental_terms',
          'cancellation_refund',
          'handover_return_damage',
          'payment_payout',
          'community_safety',
          'reporting_moderation_review',
          'privacy',
          'imprint_withdrawal_shorttexts',
        ];
        const documentIds = new Map();
        const documentReferences = [];
        for (const documentKey of documentKeys) {
          const content = `Synthetic G3D integration document for ${documentKey}`;
          const contentSha256 = crypto.createHash('sha256').update(content).digest('hex');
          const inserted = await g3dClient.query(
            `INSERT INTO legal_document_snapshots (
               document_key, document_version, locale, content_type,
               content_text, content_sha256, effective_at
             ) VALUES ($1, $2, 'de', 'text/plain', $3, $4, now() - interval '1 minute')
             RETURNING id`,
            [documentKey, contractVersion, content, contentSha256],
          );
          documentIds.set(documentKey, inserted.rows[0].id);
          documentReferences.push({
            documentKey,
            documentVersion: contractVersion,
            contentSha256,
          });
        }
        const itemBindings = [];
        for (const [index, quoteItem] of acceptedInitial.quote.items.entries()) {
          const bookingId = `g3d-item-booking-${index + 1}`;
          const bookingPayload = {
            id: bookingId,
            itemId: quoteItem.listingId,
            ownerId: 'owner',
            renterId: 'renter-a',
            status: 'accepted',
            start: acceptedInitial.group.startsAt,
            end: acceptedInitial.group.endsAt,
          };
          await g3dClient.query(
            `INSERT INTO rental_requests (
               id, item_id, owner_id, renter_id, status, payload
             ) VALUES ($1, $2, 'owner', 'renter-a', 'accepted', $3::jsonb)`,
            [bookingId, quoteItem.listingId, JSON.stringify(bookingPayload)],
          );
          await g3dClient.query(
            `INSERT INTO bookings (
               id, listing_id, owner_id, renter_id, status, starts_at, ends_at,
               currency, rental_subtotal_minor, platform_fee_minor,
               owner_payout_minor, quoted_total_minor, security_deposit_minor,
               workflow_version, workflow_status
             ) VALUES (
               $1, $2, 'owner', 'renter-a', 'accepted', $3, $4,
               $5, $6, $7, $8, $9, 0, 1, 'accepted'
             )`,
            [
              bookingId, quoteItem.listingId,
              acceptedInitial.group.startsAt, acceptedInitial.group.endsAt,
              quoteItem.currency, quoteItem.rentalSubtotalMinor,
              quoteItem.platformFeeMinor, quoteItem.ownerPayoutMinor,
              quoteItem.totalMinor,
            ],
          );
          const persistedSingleQuote = (await g3dClient.query(
            `SELECT issued_at, expires_at FROM booking_quotes
              WHERE id = $1 AND quote_hash = $2`,
            [quoteItem.bookingQuoteId, quoteItem.bookingQuoteHash],
          )).rows[0];
          const acceptedAt = new Date(
            Math.min(
              Date.now(),
              new Date(persistedSingleQuote.expires_at).getTime() - 1_000,
            ),
          );
          assert.ok(acceptedAt >= new Date(persistedSingleQuote.issued_at));
          const sitAcceptance = `Synthetic explicit SIT acceptance ${bookingId}`;
          const contract = await g3dClient.query(
            `INSERT INTO platform_contracts (
               user_id, booking_id, quote_id, quote_hash, contract_version,
               platform_terms_snapshot_id, private_rental_terms_snapshot_id,
               cancellation_refund_snapshot_id,
               handover_return_damage_snapshot_id, payment_payout_snapshot_id,
               community_safety_snapshot_id,
               reporting_moderation_review_snapshot_id, privacy_snapshot_id,
               imprint_withdrawal_shorttexts_snapshot_id,
               sit_acceptance_wording, sit_acceptance_sha256,
               locale, client_build, accepted_at, idempotency_key
             ) VALUES (
               'renter-a', $1, $2, $3, $4,
               $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, 'de', 'g3d-integration', $16, $17
             ) RETURNING id`,
            [
              bookingId, quoteItem.bookingQuoteId, quoteItem.bookingQuoteHash,
              contractVersion,
              documentIds.get('platform_terms'),
              documentIds.get('private_rental_terms'),
              documentIds.get('cancellation_refund'),
              documentIds.get('handover_return_damage'),
              documentIds.get('payment_payout'),
              documentIds.get('community_safety'),
              documentIds.get('reporting_moderation_review'),
              documentIds.get('privacy'),
              documentIds.get('imprint_withdrawal_shorttexts'),
              sitAcceptance,
              crypto.createHash('sha256').update(sitAcceptance).digest('hex'),
              acceptedAt,
              `g3d-platform-contract-${index + 1}`,
            ],
          );
          for (const declarationType of [
            'private_terms_and_platform_terms',
            'early_performance_and_withdrawal',
          ]) {
            const wording = `Synthetic ${declarationType} for ${bookingId}`;
            await g3dClient.query(
              `INSERT INTO platform_contract_declarations (
                 contract_id, declaration_type, exact_wording, wording_sha256,
                 accepted_at, user_id, booking_id, document_version, locale,
                 client_build, quote_id, quote_hash, document_references
               ) VALUES (
                 $1, $2, $3, $4, $5, 'renter-a', $6, $7, 'de',
                 'g3d-integration', $8, $9, $10::jsonb
               )`,
              [
                contract.rows[0].id, declarationType, wording,
                crypto.createHash('sha256').update(wording).digest('hex'),
                acceptedAt, bookingId, contractVersion,
                quoteItem.bookingQuoteId, quoteItem.bookingQuoteHash,
                JSON.stringify(documentReferences),
              ],
            );
          }
          await g3dClient.query(
            `INSERT INTO message_threads (
               id, request_id, booking_id, item_id, user1_id, user2_id,
               payload, communication_version
             ) VALUES ($1, $2, $2, $3, 'renter-a', 'owner', '{}'::jsonb, 1)`,
            [`g3d-item-thread-${index + 1}`, bookingId, quoteItem.listingId],
          );
          itemBindings.push({
            bookingId,
            groupPositionId: quoteItem.groupPositionId,
            platformContractId: contract.rows[0].id,
          });
        }

        await assert.rejects(
          bindBookingGroupPositionToV52Booking(g3dClient, {
            actor: groupActors.outsider,
            bookingGroupId: acceptedInitial.group.id,
            groupPositionId: itemBindings[0].groupPositionId,
            bookingId: itemBindings[0].bookingId,
          }),
          (error) => error?.code === 'booking_group_forbidden',
        );
        const firstBinding = await bindBookingGroupPositionToV52Booking(g3dClient, {
          actor: groupActors.renter,
          bookingGroupId: acceptedInitial.group.id,
          groupPositionId: itemBindings[0].groupPositionId,
          bookingId: itemBindings[0].bookingId,
        });
        assert.equal(firstBinding.replayed, false);
        assert.equal((await bindBookingGroupPositionToV52Booking(g3dClient, {
          actor: groupActors.renter,
          bookingGroupId: acceptedInitial.group.id,
          groupPositionId: itemBindings[0].groupPositionId,
          bookingId: itemBindings[0].bookingId,
        })).replayed, true);
        await assert.rejects(
          scheduleBookingGroupAppointments(g3dClient, {
            actor: groupActors.renter,
            bookingGroupId: acceptedInitial.group.id,
            idempotencyKey: 'g3d-incomplete-binding-probe',
          }),
          (error) => error?.code === 'booking_group_item_bindings_incomplete',
        );
        await bindBookingGroupPositionToV52Booking(g3dClient, {
          actor: groupActors.renter,
          bookingGroupId: acceptedInitial.group.id,
          groupPositionId: itemBindings[1].groupPositionId,
          bookingId: itemBindings[1].bookingId,
        });
        const provisionalEndsAt = new Date(Date.now() + 60 * 60 * 1000);
        const suspension = await setUserSuspension(g3dClient, {
          actor: { id: 'admin', role: 'admin' },
          userId: 'renter-a',
          idempotencyKey: 'g3d-system-risk-hold-probe',
          raw: {
            scope: 'account',
            provisional: true,
            endsAt: provisionalEndsAt.toISOString(),
            reasonCode: 'g3d_system_risk_probe',
            note: 'Controlled provisional system-risk fixture',
            decision: humanStatementDecision({
              facts: 'Controlled evidence requires a temporary safety review.',
              basis: 'Controlled booking-group system-risk fixture.',
              reasoning: 'The finite restriction preserves the fixture while review remains open.',
              durationType: 'fixed',
              endsAt: provisionalEndsAt.toISOString(),
            }),
          },
        });
        await assert.rejects(
          scheduleBookingGroupAppointments(g3dClient, {
            actor: groupActors.owner,
            bookingGroupId: acceptedInitial.group.id,
            idempotencyKey: 'g3d-system-risk-hold-probe',
          }),
          (error) => error?.code === 'booking_group_system_risk_hold',
        );
        await g3dClient.query(
          `UPDATE user_suspensions SET lifted_at = now(), lifted_by = 'admin'
            WHERE id = $1`,
          [suspension.suspension.id],
        );
        const scheduled = await scheduleBookingGroupAppointments(g3dClient, {
          actor: groupActors.owner,
          bookingGroupId: acceptedInitial.group.id,
          idempotencyKey: 'g3d-schedule-shared-appointments',
        });
        assert.equal(scheduled.operationalState, 'ready');
        assert.deepEqual(scheduled.appointments.map((entry) => entry.type).sort(), [
          'pickup', 'return',
        ]);
        assert.ok(scheduled.appointments.every((entry) => entry.exactAddressDisclosed === false));
        assert.equal(
          JSON.stringify(scheduled).includes(acceptedInitial.group.handoverLocationKey),
          false,
        );
        assert.equal((await scheduleBookingGroupAppointments(g3dClient, {
          actor: groupActors.owner,
          bookingGroupId: acceptedInitial.group.id,
          idempotencyKey: 'g3d-schedule-shared-appointments',
        })).replayed, true);
        await g3dClient.query(
          `UPDATE bookings SET return_state = 'needsReview'
            WHERE id = $1`,
          [itemBindings[0].bookingId],
        );
        await g3dClient.query(
          `UPDATE bookings SET return_state = 'payoutEligible'
            WHERE id = $1`,
          [itemBindings[1].bookingId],
        );
        const handover = await getBookingGroupHandoverReturn(g3dClient, {
          actorId: 'renter-a',
          bookingGroupId: acceptedInitial.group.id,
        });
        assert.equal(handover.operationalState, 'ready');
        assert.equal(handover.groupNeedsReview, null);
        assert.equal(handover.itemReviewIsolation, true);
        assert.deepEqual(handover.items.map((item) => item.operationalState).sort(), [
          'independent', 'needs_review',
        ]);
        assert.deepEqual(handover.items.map((item) => item.chat.threadId).sort(), [
          'g3d-item-thread-1', 'g3d-item-thread-2',
        ]);
        assert.equal(JSON.stringify(handover).includes('Owner exact address'), false);
        assert.equal(
          JSON.stringify(handover).includes(acceptedInitial.group.handoverLocationKey),
          false,
        );
        await assert.rejects(
          g3dClient.query(
            `UPDATE booking_group_appointments SET scheduled_at = now()
              WHERE booking_group_id = $1`,
            [acceptedInitial.group.id],
          ),
          (error) => error?.code === '55000',
        );
        await g3dClient.query('ROLLBACK');
      } catch (error) {
        await g3dClient.query('ROLLBACK');
        throw error;
      } finally {
        g3dClient.release();
      }

      const quoteCountBeforeCart = (await setupPool.query(
        'SELECT count(*)::int AS count FROM booking_quotes WHERE renter_id = $1',
        ['renter-a'],
      )).rows[0].count;
      const projectResponse = await fetch(
        `${baseUrl}/v1/rental-cart/projects/project_move_1`,
        {
          method: 'PUT',
          headers: renterAHeaders,
          body: JSON.stringify({
            title: 'Umzug',
            answers: { roomCount: 3 },
            sortOrder: 0,
          }),
        },
      );
      assert.equal(projectResponse.status, 200);
      assert.equal((await projectResponse.json()).cart.reservationCreated, false);
      const cartItemRequest = () => fetch(
        `${baseUrl}/v1/rental-cart/items/cartitem_move_1`,
        {
          method: 'PUT',
          headers: renterAHeaders,
          body: JSON.stringify({
            listingId: 'listing-1',
            projectId: 'project_move_1',
            startDate: '2026-11-10',
            endDate: '2026-11-12',
            sortOrder: 0,
          }),
        },
      );
      const concurrentCartItemResponses = await Promise.all([
        cartItemRequest(),
        cartItemRequest(),
      ]);
      assert.deepEqual(
        concurrentCartItemResponses.map((response) => response.status),
        [200, 200],
      );
      const cartItemResponse = concurrentCartItemResponses[0];
      const rentalCart = (await cartItemResponse.json()).cart;
      assert.equal(rentalCart.reservationCreated, false);
      assert.equal(rentalCart.projects[0].id, 'project_move_1');
      assert.equal(rentalCart.items[0].id, 'cartitem_move_1');
      assert.equal(rentalCart.items[0].quoteStatus, 'current');
      assert.equal(rentalCart.items[0].quote.preview, true);
      assert.equal(rentalCart.items[0].quote.quoteId, null);
      const persistedCartItems = await setupPool.query(
        `SELECT count(*)::int AS count FROM rental_cart_items AS item
          JOIN rental_carts AS cart ON cart.id = item.cart_id
         WHERE cart.user_id = 'renter-a'`,
      );
      assert.equal(persistedCartItems.rows[0].count, 1);
      const quoteCountAfterCart = (await setupPool.query(
        'SELECT count(*)::int AS count FROM booking_quotes WHERE renter_id = $1',
        ['renter-a'],
      )).rows[0].count;
      assert.equal(quoteCountAfterCart, quoteCountBeforeCart);
      await restartApplicationServer();
      const cartRecheck = await fetch(`${baseUrl}/v1/rental-cart/recheck`, {
        method: 'POST',
        headers: renterAHeaders,
      });
      assert.equal(cartRecheck.status, 200);
      assert.equal((await cartRecheck.json()).cart.reservationCreated, false);

      const createHeaders = {
        ...renterAHeaders,
        'Idempotency-Key': 'create-b6-flow-integration',
      };
      const createB6 = () => fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({ ...quotePayload, id: 'b6-flow' }),
      });
      const createdB6Response = await createB6();
      assert.equal(createdB6Response.status, 201);
      const createdB6 = (await createdB6Response.json()).booking;
      assert.equal(createdB6.status, 'pending');
      assert.equal(createdB6.workflowStatus, 'requested');
      assert.equal(createdB6.quotedTotalRenter, 33);
      assert.equal(createdB6.ownerId, 'owner');
      assert.equal(createdB6.renterId, 'renter-a');
      await restartApplicationServer();
      const replayB6 = await createB6();
      assert.equal(replayB6.status, 200);
      assert.equal((await replayB6.json()).replayed, true);

      const rejectedLegacyCreation = await fetch(`${baseUrl}/v1/rental-requests/sync`, {
        method: 'PUT',
        headers: renterAHeaders,
        body: JSON.stringify({
          requests: [{
            id: 'legacy-b6-create',
            itemId: 'listing-1',
            status: 'pending',
            start: '2026-12-20T10:00:00.000Z',
            end: '2026-12-22T10:00:00.000Z',
          }],
        }),
      });
      assert.equal(rejectedLegacyCreation.status, 409);
      assert.equal(
        (await rejectedLegacyCreation.json()).error,
        'booking_creation_requires_idempotent_endpoint',
      );

      const duplicateB6 = await fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'create-b6-duplicate-integration' },
        body: JSON.stringify({ ...quotePayload, id: 'b6-flow-duplicate' }),
      });
      assert.equal(duplicateB6.status, 409);
      assert.equal((await duplicateB6.json()).error, 'duplicate_booking_request');

      const amendedB6 = await fetch(`${baseUrl}/v1/bookings/b6-flow`, {
        method: 'PATCH',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'amend-b6-flow-integration' },
        body: JSON.stringify({ ...quotePayload, endDate: '2026-10-04' }),
      });
      assert.equal(amendedB6.status, 200);
      const amendedBooking = (await amendedB6.json()).booking;
      assert.equal(amendedBooking.quote.days, 3);
      assert.equal(amendedBooking.quote.totalMinor, 4950);
      assert.equal(amendedBooking.workflowRevision, 2);

      const createConflict = await fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: { ...renterBHeaders, 'Idempotency-Key': 'create-b6-conflict-integration' },
        body: JSON.stringify({
          itemId: 'listing-1',
          id: 'b6-conflict',
          startDate: '2026-10-02',
          endDate: '2026-10-05',
        }),
      });
      assert.equal(createConflict.status, 201);

      const outsiderTransition = await fetch(`${baseUrl}/v1/bookings/b6-flow/transitions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'outsider-b6-transition',
        },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(outsiderTransition.status, 403);

      const acceptB6 = await fetch(`${baseUrl}/v1/bookings/b6-flow/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'accept-b6-flow-integration' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(acceptB6.status, 200);
      const acceptedB6 = (await acceptB6.json()).booking;
      assert.equal(acceptedB6.workflowStatus, 'accepted');
      const createB6Thread = await fetch(`${baseUrl}/v1/message-threads/booking/b6-flow`, {
        method: 'POST',
        headers: ownerHeaders,
      });
      assert.equal(createB6Thread.status, 201);
      const b6ThreadId = (await createB6Thread.json()).thread.id;

      const proposeB6FlowTime = await fetch(`${baseUrl}/v1/bookings/b6-flow/flow-time`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'propose-b6-flow-time-integration' },
        body: JSON.stringify({
          action: 'propose',
          segment: 'pickup',
          localDate: acceptedB6.startDate,
          localTime: '10:15',
          label: 'untrusted client label',
          timeIso: '2026-09-30T10:15:00.000Z',
        }),
      });
      const proposeB6FlowTimePayload = await proposeB6FlowTime.json();
      assert.equal(
        proposeB6FlowTime.status,
        201,
        JSON.stringify(proposeB6FlowTimePayload),
      );
      const proposedB6FlowTime = proposeB6FlowTimePayload.state;
      assert.equal(proposedB6FlowTime.handoverTimeRequested, 'Donnerstag, 10:15');
      assert.equal(proposedB6FlowTime.handoverTimeIso, '2026-10-01T08:15:00.000Z');
      const confirmB6FlowTime = await fetch(`${baseUrl}/v1/bookings/b6-flow/flow-time`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'confirm-b6-flow-time-integration' },
        body: JSON.stringify({ action: 'confirm', segment: 'pickup' }),
      });
      assert.equal(confirmB6FlowTime.status, 201);
      assert.equal((await confirmB6FlowTime.json()).state.handoverTimeConfirmed, true);
      const flowTimeMessages = await setupPool.query(
        `SELECT body FROM messages
          WHERE thread_id = $1 AND sender_type = 'system' AND body LIKE '📦%'
          ORDER BY created_at`,
        [b6ThreadId],
      );
      assert.deepEqual(flowTimeMessages.rows.map((row) => row.body), [
        '📦 Übergabezeit angefragt: Donnerstag, 10:15 Uhr',
        '📦 Übergabezeit bestätigt: Donnerstag, 10:15 Uhr',
      ]);

      const { getBookingAddressReveal } = await import(
        '../src/booking_address_reveal_workflow.js'
      );
      const deniedAddress = await getBookingAddressReveal(setupPool, {
        actor: { id: 'outsider', role: 'user' },
        bookingId: 'b6-flow',
        segment: 'pickup',
        requestId: 'integration-address-denied',
      });
      assert.equal(deniedAddress.denied, true);
      await setupPool.query(
        `UPDATE rental_requests
            SET payload = payload || jsonb_build_object(
              'handoverTimeRequested', 'Donnerstag, 18:00',
              'handoverTimeIso', '2026-10-01T16:00:00.000Z',
              'handoverTimeRequestedByUserId', 'owner',
              'handoverTimeConfirmed', true,
              'handoverTimeConfirmedByUserId', 'renter-a',
              'handoverTimeConfirmedAt', now()::text
            )
          WHERE id = 'b6-flow'`,
      );
      const earlyAddress = await getBookingAddressReveal(setupPool, {
        actor: { id: 'renter-a', role: 'user' },
        bookingId: 'b6-flow',
        segment: 'pickup',
        requestId: 'integration-address-early',
      });
      assert.equal(earlyAddress.visibility.result, 'hidden');
      assert.equal(earlyAddress.visibility.reason, 'safety_review_required');
      assert.equal(Object.hasOwn(earlyAddress.visibility, 'exactAddress'), false);
      await setupPool.query(
        `UPDATE bookings SET listing_id = 'g3b-listing-2' WHERE id = 'b6-flow'`,
      );
      await setupPool.query(
        `UPDATE rental_requests
            SET item_id = 'g3b-listing-2',
                payload = payload || '{"itemId":"g3b-listing-2"}'::jsonb
          WHERE id = 'b6-flow'`,
      );
      const earlyWindowAddress = await getBookingAddressReveal(setupPool, {
        actor: { id: 'renter-a', role: 'user' },
        bookingId: 'b6-flow',
        segment: 'pickup',
        requestId: 'integration-address-early-window',
      });
      assert.equal(earlyWindowAddress.visibility.reason, 'reveal_window_not_open');

      const nearAppointment = new Date(Date.now() + (60 * 60 * 1000));
      await setupPool.query(
        `UPDATE bookings
            SET rental_start_date = ($2::timestamptz AT TIME ZONE rental_timezone)::date
          WHERE id = $1`,
        ['b6-flow', nearAppointment.toISOString()],
      );
      await setupPool.query(
        `UPDATE rental_requests
            SET payload = payload || jsonb_build_object(
              'handoverTimeIso', $2::text,
              'handoverTimeConfirmedAt', now()::text
            )
          WHERE id = $1`,
        ['b6-flow', nearAppointment.toISOString()],
      );
      const revealedAddress = await getBookingAddressReveal(setupPool, {
        actor: { id: 'renter-a', role: 'user' },
        bookingId: 'b6-flow',
        segment: 'pickup',
        requestId: 'integration-address-revealed',
      });
      assert.equal(revealedAddress.visibility.result, 'revealed');
      assert.equal(revealedAddress.visibility.exactAddress, 'Owner exact address');
      const addressAudit = await setupPool.query(
        `SELECT action, metadata
           FROM audit_log
          WHERE request_id LIKE 'integration-address-%'
          ORDER BY request_id`,
      );
      assert.deepEqual(addressAudit.rows.map((row) => row.action).sort(), [
        'booking.exact_address_access_denied',
        'booking.exact_address_access_hidden',
        'booking.exact_address_access_hidden',
        'booking.exact_address_revealed',
      ].sort());
      assert.equal(
        addressAudit.rows.some((row) => JSON.stringify(row.metadata).includes('Owner exact address')),
        false,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO audit_log (
             actor_id, actor_role, action, resource_type, resource_id,
             request_id, metadata
           ) VALUES (
             'renter-a', 'user', 'booking.exact_address_revealed',
             'booking', 'b6-flow', 'integration-address-forged',
             '{"version":"v52_booking_address_reveal_v1","segment":"pickup","result":"revealed","reason":"counterparty_confirmed_window_open","workflowStatus":"accepted","appointmentAt":null,"revealFromAt":null,"safetyHold":false,"exactAddressReturned":true,"exactAddress":"forbidden"}'::jsonb
           )`,
        ),
        (error) => error?.code === '23514',
      );
      await setupPool.query(
        `UPDATE bookings
            SET listing_id = 'listing-1', rental_start_date = '2026-10-01'
          WHERE id = 'b6-flow'`,
      );
      await setupPool.query(
        `UPDATE rental_requests
            SET item_id = 'listing-1',
                payload = payload || '{"itemId":"listing-1"}'::jsonb
          WHERE id = 'b6-flow'`,
      );

      const conflictingAcceptance = await fetch(`${baseUrl}/v1/bookings/b6-conflict/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'accept-b6-conflict-integration' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(conflictingAcceptance.status, 409);
      assert.equal((await conflictingAcceptance.json()).error, 'booking_period_unavailable');

      const activateB6 = await fetch(`${baseUrl}/v1/bookings/b6-flow/transitions`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'activate-b6-flow-integration' },
        body: JSON.stringify({ status: 'running' }),
      });
      assert.equal(activateB6.status, 200);
      assert.equal((await activateB6.json()).booking.workflowStatus, 'active');

      const completeB6 = await fetch(`${baseUrl}/v1/bookings/b6-flow/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'complete-b6-flow-integration' },
        body: JSON.stringify({ status: 'completed' }),
      });
      assert.equal(completeB6.status, 200);
      const completedB6 = (await completeB6.json()).booking;
      assert.equal(completedB6.workflowStatus, 'completed');
      assert.equal(completedB6.status, 'completed');
      const b6Events = await setupPool.query(
        `SELECT from_status, to_status
         FROM booking_events WHERE booking_id = 'b6-flow'
           AND event_type NOT LIKE 'booking.flow_time.%'
         ORDER BY from_status NULLS FIRST, to_status`,
      );
      assert.deepEqual(
        b6Events.rows.map((row) => `${row.from_status ?? 'null'}->${row.to_status}`).sort(),
        [
          'null->requested',
          'requested->requested',
          'requested->accepted',
          'accepted->confirmed',
          'confirmed->active',
          'active->returned',
          'returned->completed',
        ].sort(),
      );

      const createExpiring = await fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: { ...renterBHeaders, 'Idempotency-Key': 'create-b6-expiring-integration' },
        body: JSON.stringify({
          itemId: 'listing-1',
          id: 'b6-expiring',
          startDate: '2026-11-01',
          endDate: '2026-11-03',
        }),
      });
      assert.equal(createExpiring.status, 201);
      const renterCannotAccept = await fetch(`${baseUrl}/v1/bookings/b6-expiring/transitions`, {
        method: 'POST',
        headers: { ...renterBHeaders, 'Idempotency-Key': 'renter-accept-b6-expiring' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(renterCannotAccept.status, 409);
      assert.equal((await renterCannotAccept.json()).error, 'invalid_status_transition');
      const acceptExpiring = await fetch(`${baseUrl}/v1/bookings/b6-expiring/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'owner-accept-b6-expiring' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(acceptExpiring.status, 200);
      await setupPool.query(
        `UPDATE bookings SET hold_expires_at = now() - interval '1 minute'
         WHERE id = 'b6-expiring'`,
      );
      const sweepResponse = await fetch(`${baseUrl}/v1/rental-requests`, {
        headers: { Authorization: `Bearer ${tokenFor('renter-b')}` },
      });
      assert.equal(sweepResponse.status, 200);
      const swept = (await sweepResponse.json()).requests.find((entry) => entry.id === 'b6-expiring');
      assert.equal(swept.workflowStatus, 'cancelled');
      assert.equal(swept.cancelledBy, 'system');
      assert.equal(swept.listingSnapshot.id, 'listing-1');
      assert.equal(swept.listingSnapshot.ownerId, 'owner');
      assert.equal(swept.listingSnapshot.title, 'Camera');
      assert.equal(swept.listingSnapshot.locationText, 'Berlin, Deutschland');
      assert.equal(swept.listingSnapshot.approximateLocation, true);
      assert.deepEqual(swept.listingSnapshot.photos, []);
      assert.equal(Number.isSafeInteger(swept.listingSnapshot.catalogRevision), true);
      assert.equal(swept.listingSnapshot.catalogRevision > 0, true);

      const listingImage = await sharp({
        create: {
          width: 960,
          height: 640,
          channels: 3,
          background: { r: 30, g: 90, b: 160 },
        },
      }).jpeg({ quality: 92 }).toBuffer();
      const uploadForm = new FormData();
      uploadForm.append('purpose', 'listing_image');
      uploadForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'camera.jpg');
      const listingUploadResponse = await fetch(`${baseUrl}/v1/uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('owner')}` },
        body: uploadForm,
      });
      assert.equal(listingUploadResponse.status, 201);
      const listingUpload = await listingUploadResponse.json();
      assert.match(listingUpload.url, /\/uploads\/[0-9a-f-]{36}-full\.webp$/);
      assert.match(listingUpload.thumbnailUrl, /\/uploads\/[0-9a-f-]{36}-thumb\.webp$/);
      assert.equal(listingUpload.width, 960);
      assert.equal(listingUpload.height, 640);
      const localMediaUrl = (remoteUrl) => (
        `${baseUrl}/v1/uploads/${encodeURIComponent(new URL(remoteUrl).pathname.split('/').at(-1))}`
      );
      const privateBeforeBinding = await fetch(localMediaUrl(listingUpload.url));
      assert.equal(privateBeforeBinding.status, 401);
      assert.equal((await privateBeforeBinding.json()).error, 'authentication_required');

      const blueOceanUploadForm = new FormData();
      blueOceanUploadForm.append('purpose', 'listing_image');
      blueOceanUploadForm.append(
        'file',
        new Blob([listingImage], { type: 'image/jpeg' }),
        'blue-ocean-camera.jpg',
      );
      const blueOceanUploadResponse = await fetch(`${baseUrl}/v1/uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('renter-a')}` },
        body: blueOceanUploadForm,
      });
      assert.equal(blueOceanUploadResponse.status, 201);
      const blueOceanUpload = await blueOceanUploadResponse.json();
      const blueOceanDraftId =
        'listing_ai_draft_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const blueOceanAnalyzeResponse = await fetch(
        `${baseUrl}/v1/blue-ocean/listing-drafts/analyze`,
        {
          method: 'POST',
          headers: renterAHeaders,
          body: JSON.stringify({
            draftId: blueOceanDraftId,
            generationKey: 'e'.repeat(64),
            photoUrls: [blueOceanUpload.url],
            consent: {
              explicitlyInitiated: true,
              accepted: true,
              disclosureVersion: 'listing-ai-image-disclosure-v1',
              disclosureText:
                'SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch veröffentlicht.',
            },
          }),
        },
      );
      assert.equal(blueOceanAnalyzeResponse.status, 201);
      const blueOceanAnalyze = await blueOceanAnalyzeResponse.json();
      assert.equal(blueOceanAnalyze.assistant.status, 'draft_ready');
      assert.equal(blueOceanAnalyze.assistant.autoPublishAllowed, false);
      assert.equal(blueOceanAnalyze.assistant.billedCostCents, 0);
      assert.equal(
        blueOceanAnalyze.assistant.revision.fields.category.value,
        'cat8',
      );
      const blueOceanCostLedger = await setupPool.query(
        `SELECT provider, model, input_units, output_units,
                estimated_cost_cents, billed_cost_cents, outcome
           FROM listing_ai_cost_ledger
          WHERE draft_id = $1 AND generation_key = $2`,
        [blueOceanDraftId, 'e'.repeat(64)],
      );
      assert.equal(blueOceanCostLedger.rowCount, 1);
      assert.deepEqual(blueOceanCostLedger.rows[0], {
        provider: 'mock',
        model: 'listing-ai-mock-v1',
        input_units: 0,
        output_units: 0,
        estimated_cost_cents: 0,
        billed_cost_cents: 0,
        outcome: 'mocked',
      });
      const blueOceanReviewConfirmations = Object.fromEntries([
        'ownership', 'item_identity', 'allowed_category', 'functionality',
        'condition', 'accessories', 'owner_price', 'duration_discounts',
        'availability', 'pickup_region', 'final_publication',
      ].map((key) => [key, key !== 'final_publication']));
      const blueOceanReviewResponse = await fetch(
        `${baseUrl}/v1/blue-ocean/listing-drafts/${encodeURIComponent(blueOceanDraftId)}/review`,
        {
          method: 'POST',
          headers: renterAHeaders,
          body: JSON.stringify({
            generationKey: 'f'.repeat(64),
            editedFields: {
              title: 'Akku-Bohrschrauber',
              category: 'cat8',
              subcategory: 'Bohrmaschinen',
              brand: 'Testmarke',
              model: 'M-18',
              description:
                'Voll funktionsfähiges Gerät für den geschlossenen N6 Test.',
              condition: 'good',
              accessories: ['Ladegerät'],
              projectTags: ['renovation'],
              useCases: ['bohren'],
              safetyNotes: 'Nur bestimmungsgemäß verwenden.',
              replacementValueMinor: 17_500,
              pickupRegion: 'heilbronn_wave0',
            },
            answeredClarificationIds:
              blueOceanAnalyze.assistant.revision.clarificationQuestions
                .map((entry) => entry.id),
            ownerConfirmations: blueOceanReviewConfirmations,
            pricing: {
              replacementValueBand: 'eur_100_250',
              ownerConfirmedReplacementValueBand: true,
              ownerConfirmedReplacementValueMinor: null,
              ownerDailyPriceMinor: 1_600,
              durationPricingEnabled: true,
            },
            previewDays: [1, 7],
          }),
        },
      );
      assert.equal(blueOceanReviewResponse.status, 201);
      const blueOceanReview = await blueOceanReviewResponse.json();
      assert.equal(
        blueOceanReview.assistant.recommendation.engineAuthority,
        'SIT_REGIONAL_PRICE_ENGINE_V2',
      );
      assert.equal(blueOceanReview.assistant.readiness.previewReady, true);
      assert.equal(blueOceanReview.assistant.readiness.readyToPublish, false);
      assert.deepEqual(
        blueOceanReview.assistant.readiness.missingConfirmations,
        ['final_publication'],
      );
      assert.ok(blueOceanReview.assistant.quotePreviews.every(
        (entry) => entry.simulation === true && entry.noRealMoney === true,
      ));
      await restartApplicationServer();
      const blueOceanPublishConfirmations = {
        ...blueOceanReviewConfirmations,
        final_publication: true,
      };
      const g5_failure_after_main_publication = {
        sourceListingId: 'synthetic-source-listing',
        suggestionId: 'synthetic-suggestion',
        outcome: 'new_standalone_listing',
      };
      const blueOceanPublishRequest = {
        explicitAction: 'Anzeige veröffentlichen',
        review: {
          generationKey: '7'.repeat(64),
          editedFields: {
            title: 'Akku-Bohrschrauber',
            category: 'cat8',
            subcategory: 'Bohrmaschinen',
            brand: 'Testmarke',
            model: 'M-18',
            description:
              'Voll funktionsfähiges Gerät für den geschlossenen N6 Test.',
            condition: 'good',
            accessories: ['Ladegerät'],
            projectTags: ['renovation'],
            useCases: ['bohren'],
            safetyNotes: 'Nur bestimmungsgemäß verwenden.',
            replacementValueMinor: 17_500,
            pickupRegion: 'heilbronn_wave0',
          },
          answeredClarificationIds:
            blueOceanAnalyze.assistant.revision.clarificationQuestions
              .map((entry) => entry.id),
          ownerConfirmations: blueOceanPublishConfirmations,
          pricing: {
            replacementValueBand: 'eur_100_250',
            ownerConfirmedReplacementValueBand: true,
            ownerConfirmedReplacementValueMinor: null,
            ownerDailyPriceMinor: 1_600,
            durationPricingEnabled: true,
          },
          previewDays: [1, 7],
        },
        listing: {
          id: 'new',
          ownerId: 'renter-a',
          title: 'Akku-Bohrschrauber',
          description:
            'Voll funktionsfähiges Gerät für den geschlossenen N6 Test.',
          categoryId: 'cat8',
          subcategory: 'Bohrmaschinen',
          tags: ['renovation', 'bohren'],
          pricePerDay: 16,
          priceRaw: 16,
          priceUnit: 'day',
          currency: 'EUR',
          deposit: null,
          photos: [blueOceanUpload.url],
          locationText: 'Test-Abholort Berlin',
          city: 'Berlin',
          country: 'Deutschland',
          lat: 52.52,
          lng: 13.405,
          geohash: 'private',
          condition: 'good',
          minDays: 1,
          maxDays: 30,
          handoverRadiusKm: 15,
          protectionModel: 'none',
          status: 'active',
          isActive: true,
          privateStatusConfirmed: true,
        },
        supplyEnrichmentLink: g5_failure_after_main_publication,
      };
      const sendBlueOceanPublish = () => fetch(
        `${baseUrl}/v1/blue-ocean/listing-drafts/${encodeURIComponent(blueOceanDraftId)}/publish`,
        {
          method: 'POST',
          headers: renterAHeaders,
          body: JSON.stringify(blueOceanPublishRequest),
        },
      );
      const concurrentBlueOceanPublishResponses = await Promise.all([
        sendBlueOceanPublish(),
        sendBlueOceanPublish(),
      ]);
      assert.deepEqual(
        concurrentBlueOceanPublishResponses
          .map((response) => response.status)
          .sort(),
        [201, 409],
      );
      const blueOceanPublishResponse = concurrentBlueOceanPublishResponses.find(
        (response) => response.status === 201,
      );
      const blockedConcurrentPublication = concurrentBlueOceanPublishResponses.find(
        (response) => response.status === 409,
      );
      assert.equal(
        (await blockedConcurrentPublication.json()).error,
        'blue_ocean_draft_closed',
      );
      assert.equal(blueOceanPublishResponse.status, 201);
      const blueOceanPublish = await blueOceanPublishResponse.json();
      assert.equal(blueOceanPublish.listing.ownerId, 'renter-a');
      assert.equal(blueOceanPublish.listing.pricePerDay, 16);
      assert.equal(
        blueOceanPublish.assistant.explicitOwnerActionVerified,
        true,
      );
      assert.equal(blueOceanPublish.assistant.autoPublishAllowed, false);
      assert.equal(blueOceanPublish.assistant.g5ContinuationLinked, false);
      assert.equal(blueOceanPublish.assistant.g5ContinuationStatus, 'failed');
      assert.equal(
        blueOceanPublish.assistant.g5ContinuationFailureCode,
        'listing_supply_enrichment_failed',
      );
      const blueOceanPublishReplayResponse = await sendBlueOceanPublish();
      assert.equal(blueOceanPublishReplayResponse.status, 200);
      assert.match(
        blueOceanPublishReplayResponse.headers.get('cache-control'),
        /no-store/u,
      );
      const blueOceanPublishReplay = await blueOceanPublishReplayResponse.json();
      assert.equal(blueOceanPublishReplay.listing.id, blueOceanPublish.listing.id);
      assert.equal(blueOceanPublishReplay.assistant.replayed, true);
      assert.equal(
        blueOceanPublishReplay.assistant.explicitOwnerActionVerified,
        true,
      );
      assert.equal(blueOceanPublishReplay.assistant.autoPublishAllowed, false);
      const blueOceanPublicationEvidence = await setupPool.query(
        `SELECT draft.status, draft.published_listing_id,
                receipt.explicit_action, receipt.readiness_state,
                upload.listing_id, upload.visibility AS upload_visibility
           FROM listing_ai_drafts AS draft
           JOIN listing_ai_publication_receipts AS receipt
             ON receipt.draft_id = draft.id
           JOIN uploads AS upload
             ON upload.listing_id = draft.published_listing_id
          WHERE draft.id = $1`,
        [blueOceanDraftId],
      );
      assert.equal(blueOceanPublicationEvidence.rowCount, 1);
      const main_listing_remains_published = blueOceanPublicationEvidence.rowCount === 1
        && blueOceanPublish.listing.id != null;
      assert.equal(main_listing_remains_published, true);
      assert.equal(blueOceanPublicationEvidence.rows[0].status, 'published');
      assert.equal(
        blueOceanPublicationEvidence.rows[0].explicit_action,
        'Anzeige veröffentlichen',
      );
      assert.equal(
        blueOceanPublicationEvidence.rows[0].readiness_state,
        'READY_TO_PUBLISH',
      );
      assert.equal(
        blueOceanPublicationEvidence.rows[0].upload_visibility,
        'public',
      );
      const blueOceanG5FailureAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
          WHERE action = 'listing.supply_enrichment_follow_up_failed'
            AND resource_id = $1`,
        [blueOceanPublish.listing.id],
      );
      assert.equal(blueOceanG5FailureAudit.rowCount, 1);
      assert.deepEqual(blueOceanG5FailureAudit.rows[0].metadata, {
        blueOceanDraftId,
        primaryListingBlocked: false,
        failureCode: 'listing_supply_enrichment_failed',
      });

      const lifecycleListing = {
        id: 'listing-lifecycle',
        ownerId: 'outsider',
        title: 'Bosch professional drill',
        description: 'A reliable professional drill for the complete listing lifecycle test.',
        categoryId: 'cat1',
        subcategory: 'Werkzeuge',
        tags: ['bohrer', 'bosch'],
        pricePerDay: 18,
        priceRaw: 18,
        priceUnit: 'day',
        currency: 'EUR',
        deposit: null,
        photos: [listingUpload.url],
        locationText: 'Exact owner address 12',
        city: 'Berlin',
        country: 'Deutschland',
        lat: 52.5205,
        lng: 13.4095,
        geohash: 'private-geohash',
        condition: 'good',
        minDays: 1,
        maxDays: 14,
        handoverRadiusKm: 15,
        protectionModel: 'none',
        status: 'active',
        isActive: true,
      };
      const createLifecycleListing = await fetch(`${baseUrl}/v1/listings`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(lifecycleListing),
      });
      assert.equal(createLifecycleListing.status, 201);
      const createdLifecycleListing = (await createLifecycleListing.json()).listing;
      assert.equal(createdLifecycleListing.id, 'listing-lifecycle');
      assert.equal(createdLifecycleListing.ownerId, 'owner');
      assert.equal(createdLifecycleListing.status, 'active');
      assert.equal(createdLifecycleListing.availabilityMode, 'calendar');
      assert.equal(createdLifecycleListing.catalogRevision, 1);

      const processedUpload = await setupPool.query(
        `SELECT mime_type, byte_size, thumbnail_mime_type, thumbnail_byte_size,
                image_width, image_height, content_sha256, content_scan_status,
                visibility, listing_id
         FROM uploads WHERE storage_name = $1`,
        [new URL(listingUpload.url).pathname.split('/').at(-1)],
      );
      assert.equal(processedUpload.rowCount, 1);
      assert.equal(processedUpload.rows[0].mime_type, 'image/webp');
      assert.equal(processedUpload.rows[0].thumbnail_mime_type, 'image/webp');
      assert.ok(processedUpload.rows[0].byte_size > 0);
      assert.ok(processedUpload.rows[0].thumbnail_byte_size > 0);
      assert.equal(processedUpload.rows[0].image_width, 960);
      assert.equal(processedUpload.rows[0].image_height, 640);
      assert.match(processedUpload.rows[0].content_sha256, /^[0-9a-f]{64}$/);
      assert.equal(processedUpload.rows[0].content_scan_status, 'passed');
      assert.equal(processedUpload.rows[0].visibility, 'public');
      assert.equal(processedUpload.rows[0].listing_id, 'listing-lifecycle');

      for (const mediaUrl of [listingUpload.url, listingUpload.thumbnailUrl]) {
        const publicMedia = await fetch(localMediaUrl(mediaUrl));
        assert.equal(publicMedia.status, 200);
        assert.equal(publicMedia.headers.get('content-type'), 'image/webp');
        assert.match(publicMedia.headers.get('cache-control'), /^public,/);
        assert.ok((await publicMedia.arrayBuffer()).byteLength > 0);
      }

      const lifecycleSearch = await fetch(
        `${baseUrl}/v1/listings?q=Bosch&categories=cat1&minPrice=17&maxPrice=19&lat=52.52&lng=13.41&radiusKm=5&sort=price_asc`,
      );
      assert.equal(lifecycleSearch.status, 200);
      const lifecycleCatalog = await lifecycleSearch.json();
      assert.equal(lifecycleCatalog.listings.length, 1);
      assert.equal(lifecycleCatalog.listings[0].id, 'listing-lifecycle');
      assert.equal(lifecycleCatalog.listings[0].locationText, 'Berlin, Deutschland');
      assert.equal(lifecycleCatalog.listings[0].lat, 52.52);
      assert.equal(lifecycleCatalog.listings[0].lng, 13.41);
      assert.equal(lifecycleCatalog.listings[0].geohash, '');

      const foreignEdit = await fetch(`${baseUrl}/v1/listings/listing-lifecycle`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...lifecycleListing, title: 'Foreign edit' }),
      });
      assert.equal(foreignEdit.status, 403);
      assert.equal((await foreignEdit.json()).error, 'listing_forbidden');

      const foreignCreate = await fetch(`${baseUrl}/v1/listings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...lifecycleListing, id: 'listing-foreign' }),
      });
      assert.equal(foreignCreate.status, 403);
      assert.equal((await foreignCreate.json()).error, 'listing_photo_forbidden');
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM listings WHERE id = 'listing-foreign'`,
      )).rows[0].count, 0);

      const missingListingRevision = await fetch(
        `${baseUrl}/v1/listings/listing-lifecycle`,
        {
          method: 'PUT',
          headers: ownerHeaders,
          body: JSON.stringify({
            ...lifecycleListing,
            title: 'Bosch edit without revision',
          }),
        },
      );
      assert.equal(missingListingRevision.status, 400);
      assert.equal(
        (await missingListingRevision.json()).error,
        'listing_revision_required',
      );

      const updateLifecycleListing = await fetch(`${baseUrl}/v1/listings/listing-lifecycle`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          ...lifecycleListing,
          ownerId: 'outsider',
          title: 'Bosch professional drill set',
          pricePerDay: 22,
          priceRaw: 22,
          catalogRevision: createdLifecycleListing.catalogRevision,
        }),
      });
      assert.equal(updateLifecycleListing.status, 200);
      const updatedLifecycleListing = (await updateLifecycleListing.json()).listing;
      assert.equal(updatedLifecycleListing.ownerId, 'owner');
      assert.equal(updatedLifecycleListing.title, 'Bosch professional drill set');
      assert.equal(updatedLifecycleListing.pricePerDay, 22);
      assert.equal(updatedLifecycleListing.catalogRevision, 2);

      const concurrentListingRevision = Number((await setupPool.query(
        `SELECT catalog_revision
           FROM listings
          WHERE id = 'listing-lifecycle'`,
      )).rows[0].catalog_revision);
      const concurrentListingEdit = (suffix) => fetch(
        `${baseUrl}/v1/listings/listing-lifecycle`,
        {
          method: 'PUT',
          headers: ownerHeaders,
          body: JSON.stringify({
            ...lifecycleListing,
            title: `Bosch concurrent edit ${suffix}`,
            pricePerDay: 22,
            priceRaw: 22,
            catalogRevision: concurrentListingRevision,
          }),
        },
      );
      const concurrentListingResponses = await Promise.all([
        concurrentListingEdit('alpha'),
        concurrentListingEdit('beta'),
      ]);
      assert.deepEqual(
        concurrentListingResponses.map((response) => response.status).sort(),
        [200, 409],
      );
      const staleListingResponse = concurrentListingResponses.find(
        (response) => response.status === 409,
      );
      assert.equal(
        (await staleListingResponse.json()).error,
        'listing_revision_conflict',
      );
      const concurrentListingRow = (await setupPool.query(
        `SELECT payload, catalog_revision
           FROM listings
          WHERE id = 'listing-lifecycle'`,
      )).rows[0];
      assert.equal(
        Number(concurrentListingRow.catalog_revision),
        concurrentListingRevision + 1,
      );
      assert.match(
        concurrentListingRow.payload.title,
        /^Bosch concurrent edit (?:alpha|beta)$/u,
      );

      await setupPool.query(
        `UPDATE listings
         SET payload = jsonb_set(payload, '{title}', '"B4 rollback title"'::jsonb)
         WHERE id = 'listing-lifecycle'`,
      );
      const quarantinedLifecycle = await setupPool.query(
        `SELECT catalog_version, catalog_revision, status, is_active
         FROM listings WHERE id = 'listing-lifecycle'`,
      );
      assert.equal(quarantinedLifecycle.rows[0].catalog_version, 0);
      assert.equal(quarantinedLifecycle.rows[0].status, 'active');
      assert.equal(quarantinedLifecycle.rows[0].is_active, true);
      assert.equal((await fetch(localMediaUrl(listingUpload.url))).status, 401);
      const quarantinedSearch = await fetch(`${baseUrl}/v1/listings?q=Bosch`);
      assert.equal(quarantinedSearch.status, 200);
      assert.deepEqual((await quarantinedSearch.json()).listings, []);

      const restoreQuarantinedLifecycle = await fetch(
        `${baseUrl}/v1/listings/listing-lifecycle`,
        {
          method: 'PUT',
          headers: ownerHeaders,
          body: JSON.stringify({
            ...lifecycleListing,
            title: 'Bosch restored after rollback',
            pricePerDay: 22,
            priceRaw: 22,
            catalogRevision: Number(quarantinedLifecycle.rows[0].catalog_revision),
          }),
        },
      );
      assert.equal(restoreQuarantinedLifecycle.status, 200);
      const restoredLifecycleRow = await setupPool.query(
        `SELECT catalog_version, catalog_revision
         FROM listings WHERE id = 'listing-lifecycle'`,
      );
      assert.equal(restoredLifecycleRow.rows[0].catalog_version, 1);
      assert.ok(
        restoredLifecycleRow.rows[0].catalog_revision
          > quarantinedLifecycle.rows[0].catalog_revision,
      );
      assert.equal((await fetch(localMediaUrl(listingUpload.url))).status, 200);

      const pauseLifecycleListing = await fetch(
        `${baseUrl}/v1/listings/listing-lifecycle/status`,
        {
          method: 'PATCH',
          headers: ownerHeaders,
          body: JSON.stringify({ status: 'paused' }),
        },
      );
      assert.equal(pauseLifecycleListing.status, 200);
      assert.equal((await pauseLifecycleListing.json()).listing.status, 'paused');
      const pausedSearch = await fetch(`${baseUrl}/v1/listings?q=Bosch`);
      assert.equal(pausedSearch.status, 200);
      assert.deepEqual((await pausedSearch.json()).listings, []);
      const pausedMedia = await fetch(localMediaUrl(listingUpload.url));
      assert.equal(pausedMedia.status, 401);
      const pausedMediaOwner = await fetch(localMediaUrl(listingUpload.url), {
        headers: { Authorization: `Bearer ${tokenFor('owner')}` },
      });
      assert.equal(pausedMediaOwner.status, 200);
      assert.equal(pausedMediaOwner.headers.get('cache-control'), 'private, no-store');
      const pausedBooking = await fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('renter-a')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'create-paused-booking-integration',
        },
        body: JSON.stringify({
          id: 'paused-booking',
          itemId: 'listing-lifecycle',
          startDate: '2026-12-20',
          endDate: '2026-12-22',
        }),
      });
      assert.equal(pausedBooking.status, 404);
      assert.equal((await pausedBooking.json()).error, 'listing_not_found');

      const reactivateLifecycleListing = await fetch(
        `${baseUrl}/v1/listings/listing-lifecycle/status`,
        {
          method: 'PATCH',
          headers: ownerHeaders,
          body: JSON.stringify({ status: 'active' }),
        },
      );
      assert.equal(reactivateLifecycleListing.status, 200);
      assert.equal((await reactivateLifecycleListing.json()).listing.status, 'active');
      assert.equal((await fetch(localMediaUrl(listingUpload.url))).status, 200);

      const deleteLifecycleListing = await fetch(`${baseUrl}/v1/listings/listing-lifecycle`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenFor('owner')}` },
      });
      assert.equal(deleteLifecycleListing.status, 204);
      const deletedSearch = await fetch(`${baseUrl}/v1/listings?q=Bosch`);
      assert.equal(deletedSearch.status, 200);
      assert.deepEqual((await deletedSearch.json()).listings, []);
      assert.equal((await fetch(localMediaUrl(listingUpload.url))).status, 401);

      const acceptRequest = (id) => fetch(`${baseUrl}/v1/bookings/${id}/transitions`, {
        method: 'POST',
        headers: {
          ...ownerHeaders,
          'Idempotency-Key': `accept-${id}-integration`,
        },
        body: JSON.stringify({
          status: 'accepted',
        }),
      });
      const acceptanceResponses = await Promise.all([
        acceptRequest('booking-a'),
        acceptRequest('booking-b'),
      ]);
      assert.deepEqual(acceptanceResponses.map((response) => response.status).sort(), [200, 409]);
      const conflictResponse = acceptanceResponses.find((response) => response.status === 409);
      assert.equal((await conflictResponse.json()).error, 'booking_period_unavailable');

      const acceptedIndex = acceptanceResponses.findIndex((response) => response.status === 200);
      const acceptedBookingId = acceptedIndex === 0 ? 'booking-a' : 'booking-b';
      const acceptedRenterId = acceptedIndex === 0 ? 'renter-a' : 'renter-b';
      const acceptedRenterHeaders = acceptedIndex === 0 ? renterAHeaders : renterBHeaders;

      const registerOwnerPush = await fetch(`${baseUrl}/v1/auth/devices/push`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          token: 'integration-owner-push-token',
          platform: 'android',
          locale: 'de-DE',
        }),
      });
      assert.equal(registerOwnerPush.status, 200);

      const createThread = await fetch(
        `${baseUrl}/v1/message-threads/booking/${acceptedBookingId}`,
        { method: 'POST', headers: acceptedRenterHeaders },
      );
      assert.equal(createThread.status, 201);
      const b7Thread = (await createThread.json()).thread;
      assert.equal(b7Thread.bookingId, acceptedBookingId);
      assert.equal(b7Thread.communicationVersion, 1);

      const sendMessage = () => fetch(
        `${baseUrl}/v1/message-threads/${b7Thread.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...acceptedRenterHeaders,
            'Idempotency-Key': 'b7-message-integration-0001',
          },
          body: JSON.stringify({ text: 'Treffen wir uns um 18 Uhr?' }),
        },
      );
      const firstMessage = await sendMessage();
      assert.equal(firstMessage.status, 201);
      const sentMessage = (await firstMessage.json()).message;
      assert.equal(sentMessage.senderId, acceptedRenterId);
      const replayedMessage = await sendMessage();
      assert.equal(replayedMessage.status, 200);
      assert.equal((await replayedMessage.json()).message.id, sentMessage.id);

      const outsiderMessages = await fetch(
        `${baseUrl}/v1/message-threads/${b7Thread.id}/messages`,
        { headers: { Authorization: `Bearer ${tokenFor('outsider')}` } },
      );
      assert.equal(outsiderMessages.status, 403);

      const markRead = await fetch(
        `${baseUrl}/v1/message-threads/${b7Thread.id}/read`,
        { method: 'POST', headers: ownerHeaders },
      );
      assert.equal(markRead.status, 200);
      assert.ok((await markRead.json()).readCount >= 1);

      const report = await fetch(`${baseUrl}/v1/messages/${sentMessage.id}/reports`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ reasonCode: 'integration_probe', details: 'B7 report path' }),
      });
      assert.equal(report.status, 201);

      const block = await fetch(`${baseUrl}/v1/user-blocks/${acceptedRenterId}`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({ reasonCode: 'integration_probe' }),
      });
      assert.equal(block.status, 204);
      const blockedMessage = await fetch(
        `${baseUrl}/v1/message-threads/${b7Thread.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...acceptedRenterHeaders,
            'Idempotency-Key': 'b7-message-integration-blocked',
          },
          body: JSON.stringify({ text: 'Diese Nachricht muss blockiert werden.' }),
        },
      );
      assert.equal(blockedMessage.status, 403);
      assert.equal((await blockedMessage.json()).error, 'contact_blocked');
      const blockedSafetySupport = await fetch(`${baseUrl}/v1/support/cases`, {
        method: 'POST',
        headers: {
          ...acceptedRenterHeaders,
          'Idempotency-Key': 's4b-blocked-user-safety-support',
        },
        body: JSON.stringify({
          caseType: 'active_rental',
          caseSubType: 'unsafe_product_or_injury',
          summary: 'Sicherheitskanal bleibt trotz gesperrtem Direktkontakt erreichbar.',
          linkedBookingId: acceptedBookingId,
          linkedListingId: 'listing-1',
          immediateDanger: false,
          safetyTriage: {
            version: 'sit_support_safety_triage_v1',
            packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
            guidanceVersion: 'T-003@1.0.0',
            immediateDanger: false,
            guidanceShown: false,
          },
          issueScope: {
            version: 'sit_support_single_issue_scope_v1',
            singleIssueConfirmed: true,
            separationGuidanceShown: false,
          },
        }),
      });
      assert.equal(blockedSafetySupport.status, 201);
      assert.equal(
        (await blockedSafetySupport.json()).supportCase.caseSubType,
        'unsafe_product_or_injury',
      );
      assert.equal((await fetch(`${baseUrl}/v1/user-blocks/${acceptedRenterId}`, {
        method: 'DELETE',
        headers: ownerHeaders,
      })).status, 204);

      for (let drain = 0; drain < 10; drain += 1) {
        if (await drainNotificationOutbox({ limit: 100 }) === 0) break;
      }
      const ownerNotifications = await fetch(`${baseUrl}/v1/notifications?limit=100`, {
        headers: ownerHeaders,
      });
      assert.equal(ownerNotifications.status, 200);
      const messageNotifications = (await ownerNotifications.json()).notifications
        .filter((notification) => notification.kind === 'message_received'
          && notification.threadId === b7Thread.id);
      assert.equal(messageNotifications.length, 1);
      const messageOutbox = await setupPool.query(
        `SELECT channel, status, attempt_count
         FROM notification_outbox
         WHERE event_key = $1
         ORDER BY channel`,
        [`message:${sentMessage.id}`],
      );
      assert.deepEqual(messageOutbox.rows.map((row) => row.channel), ['in_app', 'push']);
      assert.ok(messageOutbox.rows.every((row) => ['sent', 'suppressed'].includes(row.status)));
      assert.ok(messageOutbox.rows.every((row) => row.attempt_count === 1));

      const deleteCurrentSessionPush = () => fetch(
        `${baseUrl}/v1/auth/devices/push/current`,
        { method: 'DELETE', headers: ownerHeaders },
      );
      const firstPushCleanup = await deleteCurrentSessionPush();
      assert.equal(firstPushCleanup.status, 200);
      assert.equal((await firstPushCleanup.json()).deletedCount, 1);
      const repeatedPushCleanup = await deleteCurrentSessionPush();
      assert.equal(repeatedPushCleanup.status, 200);
      assert.equal((await repeatedPushCleanup.json()).deletedCount, 0);

      const deepLinkFallback = await fetch(
        `${baseUrl}/v1/open/booking/${acceptedBookingId}`,
      );
      assert.equal(deepLinkFallback.status, 200);
      assert.match(await deepLinkFallback.text(), /In der App öffnen/);

      const listingFallback = await fetch(
        `${baseUrl}/v1/open/listing/listing-1`,
      );
      assert.equal(listingFallback.status, 200);
      assert.match(await listingFallback.text(), /Anzeige öffnen/);

      const profileFallback = await fetch(
        `${baseUrl}/v1/open/profile/owner`,
      );
      assert.equal(profileFallback.status, 200);
      assert.match(await profileFallback.text(), /Profil öffnen/);

      const adminHeaders = {
        Authorization: `Bearer ${tokenFor('admin')}`,
        'Content-Type': 'application/json',
      };
      const missingStepUp = await fetch(`${baseUrl}/v1/admin/overview`, { headers: adminHeaders });
      assert.equal(missingStepUp.status, 401);
      assert.equal((await missingStepUp.json()).error, 'staff_step_up_required');
      const missingPilotCockpitStepUp = await fetch(
        `${baseUrl}/v1/admin/pilot-cockpit?from=2026-01-01&to=2027-01-01`,
        { headers: adminHeaders },
      );
      assert.equal(missingPilotCockpitStepUp.status, 401);
      assert.equal(
        (await missingPilotCockpitStepUp.json()).error,
        'staff_step_up_required',
      );
      const adminElevation = await fetch(`${baseUrl}/v1/admin/step-up`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ currentPassword: adminPassword }),
      });
      assert.equal(adminElevation.status, 200);
      adminHeaders['X-Admin-Step-Up'] = (await adminElevation.json()).elevation.token;
      const duplicateCasePair = await setupPool.query(
        `INSERT INTO support_cases (
           human_readable_case_number, case_type, case_subtype, status,
           priority, severity, source_channel, operating_mode,
           reporter_user_id, reporter_role, affected_user_ids,
           current_owner_id, current_owner_role, approval_level, waiting_on,
           next_action, next_update_at, user_facing_summary, internal_summary,
           policy_snapshot_id, resolution_reference, idempotency_key,
           intake_scope_evidence
         ) VALUES (
           'SIT-BCDFGHJKLMN2', 'general_help', 'app_error_or_display',
           'resolved', 'p3', 'low', 'internal', 'simulation',
           'renter-a', 'user', ARRAY['owner'], 'admin',
           'general_support_owner', 'green_automatic', 'none',
           NULL, NULL,
           'Der gleiche technische Testhinweis wurde bereits geprüft.',
           'Synthetic duplicate-case integration evidence only.',
           $1, 'Im führenden Testfall weiterbearbeitet.',
           's4c-duplicate-case-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         ), (
           'SIT-CDFGHJKLMN23', 'general_help', 'app_error_or_display',
           'under_review', 'p3', 'low', 'internal', 'simulation',
           'renter-a', 'user', ARRAY['owner'], 'admin',
           'general_support_owner', 'green_automatic', 'support_owner',
           'Den führenden technischen Testfall weiter prüfen.',
           now() + interval '1 day',
           'Der führende technische Testfall wird weiter geprüft.',
           'Synthetic leading-case integration evidence only.',
           $1, NULL, 's4c-leading-case-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         )
         RETURNING id, human_readable_case_number, status, lock_version`,
        [supportPolicy.rows[0].id],
      );
      const duplicateCase = duplicateCasePair.rows.find(
        (row) => row.human_readable_case_number === 'SIT-BCDFGHJKLMN2',
      );
      const leadingCase = duplicateCasePair.rows.find(
        (row) => row.human_readable_case_number === 'SIT-CDFGHJKLMN23',
      );
      const duplicateCloseWithoutLink = await fetch(
        `${baseUrl}/v1/admin/support/cases/${duplicateCase.id}/status`,
        {
          method: 'PATCH',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's4c-duplicate-close-without-link',
          },
          body: JSON.stringify({
            status: 'closed',
            expectedVersion: Number(duplicateCase.lock_version),
            reason: 'Duplikatschließung ohne belegte Verknüpfung ablehnen.',
            closureReason: 'duplicate_merged',
            appealAvailable: false,
          }),
        },
      );
      assert.equal(duplicateCloseWithoutLink.status, 409);
      assert.equal(
        (await duplicateCloseWithoutLink.json()).error,
        'support_duplicate_case_link_required',
      );
      const duplicateLinkRequest = () => fetch(
        `${baseUrl}/v1/admin/support/cases/${duplicateCase.id}/duplicate-links`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's4c-duplicate-link-integration',
          },
          body: JSON.stringify({
            leadingCaseId: leadingCase.id,
            duplicateExpectedVersion: Number(duplicateCase.lock_version),
            leadingExpectedVersion: Number(leadingCase.lock_version),
            sameCoreFactsConfirmed: true,
            sameParticipantsAndObjectsConfirmed: true,
            sameDecisionQuestionConfirmed: true,
            noSeparateDeadlineLossConfirmed: true,
            privacyDsaSeparationConfirmed: true,
          }),
        },
      );
      const duplicateLinkResponse = await duplicateLinkRequest();
      assert.equal(duplicateLinkResponse.status, 201);
      const duplicateLink = await duplicateLinkResponse.json();
      assert.equal(duplicateLink.replayed, false);
      assert.equal(
        duplicateLink.link.duplicateCaseNumber,
        duplicateCase.human_readable_case_number,
      );
      assert.equal(
        duplicateLink.link.leadingCaseNumber,
        leadingCase.human_readable_case_number,
      );
      assert.equal(duplicateLink.link.humanReviewed, true);
      assert.equal(duplicateLink.link.automaticMergeExecuted, false);
      assert.equal(duplicateLink.link.externalDeliveryEnabled, false);
      assert.match(duplicateLink.link.snapshotSha256, /^[0-9a-f]{64}$/u);
      const duplicateLinkReplayResponse = await duplicateLinkRequest();
      assert.equal(duplicateLinkReplayResponse.status, 200);
      assert.equal((await duplicateLinkReplayResponse.json()).replayed, true);
      const storedDuplicateLink = await setupPool.query(
        `SELECT assessment_snapshot, automatic_merge_executed,
                external_delivery_enabled
           FROM support_case_links WHERE id = $1`,
        [duplicateLink.link.id],
      );
      assert.equal(storedDuplicateLink.rows[0].automatic_merge_executed, false);
      assert.equal(storedDuplicateLink.rows[0].external_delivery_enabled, false);
      assert.equal(
        storedDuplicateLink.rows[0].assessment_snapshot.leadingCaseNumber,
        leadingCase.human_readable_case_number,
      );
      assert.doesNotMatch(
        JSON.stringify(storedDuplicateLink.rows[0].assessment_snapshot),
        /summary|address|amount|email/iu,
      );
      const duplicateLinkEvent = await setupPool.query(
        `SELECT visibility, structured_payload
           FROM support_case_events
          WHERE case_id = $1
            AND event_type = 'case.duplicate_link_recorded'`,
        [duplicateCase.id],
      );
      assert.deepEqual(duplicateLinkEvent.rows[0], {
        visibility: 'user_visible',
        structured_payload: {
          relationType: 'duplicate_of',
          leadingCaseNumber: leadingCase.human_readable_case_number,
          duplicateClosurePending: true,
          separateDeadlineLost: false,
          automaticMergeExecuted: false,
          externalDeliveryEnabled: false,
        },
      });
      assert.deepEqual(
        (await setupPool.query(
          `SELECT human_readable_case_number, status, lock_version
             FROM support_cases
            WHERE id = ANY($1::uuid[])
            ORDER BY human_readable_case_number`,
          [[duplicateCase.id, leadingCase.id]],
        )).rows,
        [
          {
            human_readable_case_number: duplicateCase.human_readable_case_number,
            status: 'resolved',
            lock_version: Number(duplicateCase.lock_version),
          },
          {
            human_readable_case_number: leadingCase.human_readable_case_number,
            status: 'under_review',
            lock_version: Number(leadingCase.lock_version),
          },
        ],
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_case_links
              SET external_delivery_enabled = true
            WHERE id = $1`,
          [duplicateLink.link.id],
        ),
        /append-only/u,
      );
      await assert.rejects(
        setupPool.query('DELETE FROM support_case_links WHERE id = $1', [duplicateLink.link.id]),
        /append-only/u,
      );
      const duplicateCloseResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${duplicateCase.id}/status`,
        {
          method: 'PATCH',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's4c-duplicate-close-after-link',
          },
          body: JSON.stringify({
            status: 'closed',
            expectedVersion: Number(duplicateCase.lock_version),
            reason: 'Geprüften Duplikatfall mit sichtbarer Führungsreferenz schließen.',
            closureReason: 'duplicate_merged',
            appealAvailable: false,
          }),
        },
      );
      assert.equal(duplicateCloseResponse.status, 200);
      const closedDuplicateCase = (await duplicateCloseResponse.json()).supportCase;
      assert.equal(closedDuplicateCase.status, 'closed');
      assert.equal(closedDuplicateCase.closureReason, 'duplicate_merged');
      assert.equal(closedDuplicateCase.version, Number(duplicateCase.lock_version) + 1);
      assert.deepEqual(
        (await setupPool.query(
          'SELECT status, lock_version FROM support_cases WHERE id = $1',
          [leadingCase.id],
        )).rows,
        [{ status: 'under_review', lock_version: Number(leadingCase.lock_version) }],
      );
      const safetyListingBefore = await setupPool.query(
        `SELECT status, is_active, moderation_status
           FROM listings WHERE id = 'listing-1'`,
      );
      const safetyImpactResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${productSafetyIntake.supportCase.id}/safety-impact-reviews`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's4b-product-safety-impact-review',
          },
          body: JSON.stringify({
            expectedVersion: productSafetyIntake.supportCase.version,
            scopeReviewed: true,
            proportionalityBoundaryConfirmed: true,
            noAutomatedActionConfirmed: true,
          }),
        },
      );
      assert.equal(safetyImpactResponse.status, 201);
      const safetyImpact = await safetyImpactResponse.json();
      assert.equal(safetyImpact.review.humanReviewed, true);
      assert.equal(safetyImpact.review.decisionRequired, true);
      assert.equal(safetyImpact.review.proportionalityRequired, true);
      assert.equal(safetyImpact.review.actionExecuted, false);
      assert.equal(safetyImpact.review.externalDeliveryEnabled, false);
      assert.match(safetyImpact.review.snapshotSha256, /^[0-9a-f]{64}$/u);
      const safetyImpactStored = await setupPool.query(
        `SELECT impact_snapshot, action_executed, external_delivery_enabled
           FROM support_safety_impact_reviews WHERE id = $1`,
        [safetyImpact.review.id],
      );
      assert.equal(safetyImpactStored.rows[0].action_executed, false);
      assert.equal(safetyImpactStored.rows[0].external_delivery_enabled, false);
      assert.doesNotMatch(
        JSON.stringify(safetyImpactStored.rows[0].impact_snapshot),
        /owner|renter|address|amount/iu,
      );
      assert.deepEqual(
        (await setupPool.query(
          `SELECT status, is_active, moderation_status
             FROM listings WHERE id = 'listing-1'`,
        )).rows,
        safetyListingBefore.rows,
      );
      await assert.rejects(
        setupPool.query(
          'UPDATE support_safety_impact_reviews SET action_executed = true WHERE id = $1',
          [safetyImpact.review.id],
        ),
        /append-only/u,
      );
      await assert.rejects(
        setupPool.query(
          'DELETE FROM support_safety_impact_reviews WHERE id = $1',
          [safetyImpact.review.id],
        ),
        /append-only/u,
      );
      const legacyRollbackPreviewResponse = await fetch(
        `${baseUrl}/v1/admin/support/legacy-migrations/${legacyImport.migration.importId}/rollback-preview`,
        { headers: adminHeaders },
      );
      assert.equal(legacyRollbackPreviewResponse.status, 200);
      assert.match(
        legacyRollbackPreviewResponse.headers.get('cache-control'),
        /no-store/u,
      );
      const legacyRollbackPreview =
        (await legacyRollbackPreviewResponse.json()).rollback;
      assert.equal(legacyRollbackPreview.dryRun, true);
      assert.equal(legacyRollbackPreview.dataMutation, false);
      assert.equal(legacyRollbackPreview.featureDisableSafe, true);
      assert.equal(legacyRollbackPreview.historyPreservedOnFeatureDisable, true);
      assert.equal(legacyRollbackPreview.destructiveSchemaRollbackAllowed, false);
      assert.equal(
        legacyRollbackPreview.requiredAction,
        'disable_support_legacy_migration_and_keep_append_only_archive',
      );
      assert.equal(legacyRollbackPreview.historyEntryCount, 2);
      assert.equal(legacyRollbackPreview.externalMessagesSent, false);
      const privacyQueueResponse = await fetch(
        `${baseUrl}/v1/admin/support/privacy-rights`,
        { headers: adminHeaders },
      );
      assert.equal(privacyQueueResponse.status, 200);
      const privacyQueuePayload = await privacyQueueResponse.json();
      assert.equal(privacyQueuePayload.disclosureEnabled, false);
      assert.equal(privacyQueuePayload.erasureExecutionEnabled, false);
      assert.equal(privacyQueuePayload.externalDeliveryEnabled, false);
      assert.ok(privacyQueuePayload.privacyRightsRequests.some(
        (entry) => entry.id === privacyAfterIdentity.id
          && entry.activeLegalHoldCount === 0
          && entry.identityStatus === 'verified',
      ));
      const privacyIncidentQueueResponse = await fetch(
        `${baseUrl}/v1/admin/support/privacy-incidents`,
        { headers: adminHeaders },
      );
      assert.equal(privacyIncidentQueueResponse.status, 200);
      const privacyIncidentQueue = await privacyIncidentQueueResponse.json();
      assert.equal(privacyIncidentQueue.humanAssessmentRequired, true);
      assert.equal(privacyIncidentQueue.externalNotificationEnabled, false);
      assert.ok(privacyIncidentQueue.privacyIncidents.some((entry) => (
        entry.id === privacyIncidentBeforeContainment.id
          && entry.breachAwarenessAt
          && entry.notificationDeadlineAt
          && entry.externalNotificationsSent === false
      )));
      const privacyContainmentResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${privacyIncidentIntake.supportCase.id}/privacy-incident/containment-actions`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3t-privacy-incident-contained',
          },
          body: JSON.stringify({
            expectedVersion: 1,
            actionCode: 'test_recipient_access_restricted',
            outcome: 'successful',
            containmentStatus: 'contained',
            actionReference: 'test-access-control-incident-001',
          }),
        },
      );
      assert.equal(privacyContainmentResponse.status, 201);
      const privacyContainment = await privacyContainmentResponse.json();
      assert.equal(privacyContainment.incident.containmentStatus, 'contained');
      assert.equal(privacyContainment.incident.version, 2);
      assert.equal(privacyContainment.incident.externalNotificationsSent, false);
      const privacyContainmentReplay = await fetch(
        `${baseUrl}/v1/admin/support/cases/${privacyIncidentIntake.supportCase.id}/privacy-incident/containment-actions`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3t-privacy-incident-contained',
          },
          body: JSON.stringify({
            expectedVersion: 1,
            actionCode: 'test_recipient_access_restricted',
            outcome: 'successful',
            containmentStatus: 'contained',
            actionReference: 'test-access-control-incident-001',
          }),
        },
      );
      assert.equal(privacyContainmentReplay.status, 200);
      assert.equal((await privacyContainmentReplay.json()).replayed, true);
      await assert.rejects(
        setupPool.query(
          `UPDATE support_privacy_incident_containment_actions
              SET action_reference = 'tampered-reference'
            WHERE incident_id = $1`,
          [privacyIncidentBeforeContainment.id],
        ),
        (error) => error?.code === '55000',
      );
      const forbiddenPrivacyExtension = await fetch(
        `${baseUrl}/v1/admin/support/cases/${privacyIntake.supportCase.id}/privacy-rights/deadline-extension`,
        {
          method: 'POST',
          headers: {
            ...ownerHeaders,
            'Idempotency-Key': 's3s-privacy-extension-forbidden',
          },
          body: JSON.stringify({
            expectedVersion: privacyAfterIdentity.version,
            userFacingReason:
              'Diese nicht autorisierte Verlängerung darf nicht gespeichert werden.',
          }),
        },
      );
      assert.equal(forbiddenPrivacyExtension.status, 403);
      const privacyExtensionResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${privacyIntake.supportCase.id}/privacy-rights/deadline-extension`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3s-privacy-extension-recorded',
          },
          body: JSON.stringify({
            expectedVersion: privacyAfterIdentity.version,
            userFacingReason:
              'Die Anfrage umfasst mehrere getrennte Systeme; wir benötigen zusätzliche Prüfzeit.',
          }),
        },
      );
      assert.equal(privacyExtensionResponse.status, 201);
      const privacyAfterExtension = (await privacyExtensionResponse.json())
        .privacyRightsRequest;
      assert.equal(privacyAfterExtension.extensionRecorded, true);
      assert.ok(
        new Date(privacyAfterExtension.responseDueAt)
          > new Date(privacyAfterIdentity.responseDueAt),
      );
      assert.equal(privacyAfterExtension.disclosureAllowed, false);
      const privacyExtensionEvent = await setupPool.query(
        `SELECT visibility, transition_reason, structured_payload
           FROM support_case_events
          WHERE case_id = $1
            AND event_type = 'support.privacy_rights.deadline_extended'`,
        [privacyIntake.supportCase.id],
      );
      assert.equal(privacyExtensionEvent.rowCount, 1);
      assert.equal(privacyExtensionEvent.rows[0].visibility, 'user_visible');
      assert.match(
        privacyExtensionEvent.rows[0].transition_reason,
        /zusätzliche Prüfzeit/u,
      );
      assert.equal(
        privacyExtensionEvent.rows[0].structured_payload.externalNotificationSent,
        false,
      );
      const ownerPilotCockpit = await fetch(
        `${baseUrl}/v1/admin/pilot-cockpit?from=2026-01-01&to=2027-01-01`,
        { headers: ownerHeaders },
      );
      assert.equal(ownerPilotCockpit.status, 403);
      assert.equal((await ownerPilotCockpit.json()).error, 'admin_role_required');
      const invalidPilotCockpitPeriod = await fetch(
        `${baseUrl}/v1/admin/pilot-cockpit?from=2027-01-01&to=2026-01-01`,
        { headers: adminHeaders },
      );
      assert.equal(invalidPilotCockpitPeriod.status, 400);
      assert.equal(
        (await invalidPilotCockpitPeriod.json()).error,
        'invalid_pilot_cockpit_period',
      );
      const pilotCockpitWrite = await fetch(`${baseUrl}/v1/admin/pilot-cockpit`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ from: '2026-01-01', to: '2027-01-01' }),
      });
      assert.equal(pilotCockpitWrite.status, 404);
      const connectOnboarding = await fetch(`${baseUrl}/v1/payments/connect/onboarding`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'b8-connect-owner-integration' },
        body: JSON.stringify({ country: 'DE', currency: 'EUR' }),
      });
      assert.equal(connectOnboarding.status, 201);
      const connectPayload = await connectOnboarding.json();
      assert.equal(connectPayload.account.ready, true);
      assert.equal(connectPayload.providerMode, 'memory');
      assert.match(connectPayload.onboardingUrl, /^http/);
      const connectStatus = await fetch(`${baseUrl}/v1/payments/connect/status`, { headers: ownerHeaders });
      assert.equal(connectStatus.status, 200);
      assert.equal((await connectStatus.json()).account.ready, true);

      const connectedProviderAccountId = (await setupPool.query(
        `SELECT provider_account_id FROM stripe_connect_accounts WHERE user_id = 'owner'`,
      )).rows[0].provider_account_id;
      const lateLegacyAccountEvent = {
        id: 'evt_n25_late_legacy_account',
        object: 'event',
        type: 'account.updated',
        created: 1799539000,
        livemode: false,
        data: { object: {
          id: connectedProviderAccountId,
          object: 'account',
          details_submitted: true,
          payouts_enabled: true,
          capabilities: { transfers: 'active' },
          requirements: {},
        } },
      };
      assert.equal((await applyProviderEvent(
        lateLegacyAccountEvent,
        Buffer.from(JSON.stringify(lateLegacyAccountEvent)),
      )).status, 'processed');
      assert.equal((await setupPool.query(
        `SELECT account_api_version FROM stripe_connect_accounts WHERE user_id = 'owner'`,
      )).rows[0].account_api_version, 'v2');

      const v2AccountEvent = (
        id,
        created,
        lossesCollector,
        payoutsStatus = 'active',
      ) => ({
        id,
        object: 'v2.core.event',
        type: 'v2.core.account[defaults].updated',
        created: new Date(created * 1000).toISOString(),
        livemode: false,
        data: { object: {
          id: connectedProviderAccountId,
          object: 'v2.core.account',
          applied_configurations: ['recipient'],
          dashboard: 'express',
          configuration: { recipient: { applied: true, capabilities: { stripe_balance: {
            payouts: {
              status: payoutsStatus,
              status_details: payoutsStatus === 'active'
                ? []
                : [{ code: 'payouts_requirements_past_due' }],
            },
            stripe_transfers: { status: 'active', status_details: [] },
          } } } },
          defaults: {
            currency: 'eur',
            responsibilities: {
              fees_collector: 'application',
              losses_collector: lossesCollector,
            },
          },
          identity: { country: 'DE', entity_type: 'individual' },
          requirements: { entries: [] },
          future_requirements: { entries: [] },
          livemode: false,
        } },
      });
      const responsibilityDrift = v2AccountEvent(
        'evt_n25_responsibility_drift',
        1799539100,
        'stripe',
      );
      assert.equal((await applyProviderEvent(
        responsibilityDrift,
        Buffer.from(JSON.stringify(responsibilityDrift)),
      )).status, 'processed');
      const driftedConnectStatus = await fetch(
        `${baseUrl}/v1/payments/connect/status`,
        { headers: ownerHeaders },
      );
      assert.equal(driftedConnectStatus.status, 200);
      assert.equal((await driftedConnectStatus.json()).account.ready, false);

      const responsibilityRestored = v2AccountEvent(
        'evt_n25_responsibility_restored',
        1799539200,
        'application',
      );
      assert.equal((await applyProviderEvent(
        responsibilityRestored,
        Buffer.from(JSON.stringify(responsibilityRestored)),
      )).status, 'processed');
      const restoredConnectStatus = await fetch(
        `${baseUrl}/v1/payments/connect/status`,
        { headers: ownerHeaders },
      );
      assert.equal(restoredConnectStatus.status, 200);
      assert.equal((await restoredConnectStatus.json()).account.ready, true);

      const payoutsBlocked = v2AccountEvent(
        'evt_n25_payouts_blocked',
        1799539250,
        'application',
        'restricted',
      );
      assert.equal((await applyProviderEvent(
        payoutsBlocked,
        Buffer.from(JSON.stringify(payoutsBlocked)),
      )).status, 'processed');
      const payoutBlockedConnectStatus = await fetch(
        `${baseUrl}/v1/payments/connect/status`,
        { headers: ownerHeaders },
      );
      assert.equal(payoutBlockedConnectStatus.status, 200);
      assert.equal((await payoutBlockedConnectStatus.json()).account.ready, false);
      assert.equal((await setupPool.query(
        `SELECT payouts_enabled FROM stripe_connect_accounts WHERE user_id = 'owner'`,
      )).rows[0].payouts_enabled, false);

      const payoutsRestored = v2AccountEvent(
        'evt_n25_payouts_restored',
        1799539300,
        'application',
      );
      assert.equal((await applyProviderEvent(
        payoutsRestored,
        Buffer.from(JSON.stringify(payoutsRestored)),
      )).status, 'processed');
      const payoutRestoredConnectStatus = await fetch(
        `${baseUrl}/v1/payments/connect/status`,
        { headers: ownerHeaders },
      );
      assert.equal(payoutRestoredConnectStatus.status, 200);
      assert.equal((await payoutRestoredConnectStatus.json()).account.ready, true);

      const b8ListingRow = (await setupPool.query(
        `SELECT payload, catalog_revision FROM listings WHERE id = 'listing-1'`,
      )).rows[0];
      const b8ListingPayload = b8ListingRow.payload;
      const b8ListingUpdate = await fetch(`${baseUrl}/v1/listings/listing-1`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          ...b8ListingPayload,
          catalogRevision: Number(b8ListingRow.catalog_revision),
          deposit: 60,
          protectionModel: 'standard',
        }),
      });
      assert.equal(b8ListingUpdate.status, 200);
      const neutralizedListing = (await b8ListingUpdate.json()).listing;
      assert.equal(neutralizedListing.deposit, null);
      assert.equal(neutralizedListing.protectionModel, 'none');
      assert.equal((await setupPool.query(
        `SELECT security_deposit_minor FROM listings WHERE id = 'listing-1'`,
      )).rows[0].security_deposit_minor, null);
      const b8Create = await fetch(`${baseUrl}/v1/bookings`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b8-create-payment-booking' },
        body: JSON.stringify({
          id: 'b8-payment-flow', itemId: 'listing-1',
          startDate: '2027-01-10', endDate: '2027-01-12',
        }),
      });
      assert.equal(b8Create.status, 201);
      assert.equal((await b8Create.json()).booking.quote.securityDepositMinor, 0);
      const b8Accept = await fetch(`${baseUrl}/v1/bookings/b8-payment-flow/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'b8-accept-payment-booking' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      assert.equal(b8Accept.status, 200);

      const b8CheckoutRequest = () => fetch(`${baseUrl}/v1/bookings/b8-payment-flow/payment/checkout`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b8-checkout-payment-booking' },
        body: '{}',
      });
      const b8Checkout = await b8CheckoutRequest();
      assert.equal(b8Checkout.status, 201);
      const b8CheckoutPayload = await b8Checkout.json();
      assert.equal(b8CheckoutPayload.payment.status, 'created');
      assert.equal(b8CheckoutPayload.payment.amountMinor, 3300);
      assert.equal(b8CheckoutPayload.payment.ownerPayoutMinor, 3000);
      assert.equal(b8CheckoutPayload.payment.platformFeeMinor, 300);
      assert.match(b8CheckoutPayload.checkoutUrl, /^http/);
      const b8CheckoutReplay = await b8CheckoutRequest();
      assert.equal(b8CheckoutReplay.status, 200);
      assert.equal((await b8CheckoutReplay.json()).replayed, true);

      const b8TitleDriftUpdate = await fetch(`${baseUrl}/v1/listings/listing-1`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          ...neutralizedListing,
          title: 'Geaenderter Titel nach Checkout',
          catalogRevision: Number(neutralizedListing.catalogRevision),
        }),
      });
      assert.equal(b8TitleDriftUpdate.status, 200);
      const b8ChangedListing = (await b8TitleDriftUpdate.json()).listing;

      const b8CheckoutAfterClientRestart = await fetch(
        `${baseUrl}/v1/bookings/b8-payment-flow/payment/checkout`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 'b8-checkout-payment-booking-after-restart',
          },
          body: '{}',
        },
      );
      assert.equal(b8CheckoutAfterClientRestart.status, 200);
      const b8RestartPayload = await b8CheckoutAfterClientRestart.json();
      assert.equal(b8RestartPayload.replayed, true);
      assert.equal(b8RestartPayload.checkoutUrl, b8CheckoutPayload.checkoutUrl);
      assert.equal(b8RestartPayload.payment.id, b8CheckoutPayload.payment.id);
      const b8TitleRestore = await fetch(`${baseUrl}/v1/listings/listing-1`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          ...b8ChangedListing,
          title: 'Camera',
          catalogRevision: Number(b8ChangedListing.catalogRevision),
        }),
      });
      assert.equal(b8TitleRestore.status, 200);

      const paymentId = b8CheckoutPayload.payment.id;
      const providerBinding = (await setupPool.query(
        `SELECT provider_payment_id, provider_customer_id, transfer_group
         FROM payments WHERE id = $1`,
        [paymentId],
      )).rows[0];
      const amountMismatchEvent = {
        id: 'evt_memory_b8_amount_mismatch',
        object: 'event',
        type: 'payment_intent.succeeded',
        created: 1799539200,
        livemode: false,
        data: { object: {
          id: providerBinding.provider_payment_id,
          object: 'payment_intent',
          status: 'succeeded',
          amount: 3299,
          amount_received: 3299,
          currency: 'eur',
          customer: providerBinding.provider_customer_id,
          transfer_group: providerBinding.transfer_group,
          metadata: { sit_payment_id: paymentId, sit_booking_id: 'b8-payment-flow' },
        } },
      };
      const amountMismatchRaw = Buffer.from(JSON.stringify(amountMismatchEvent));
      await assert.rejects(
        applyProviderEvent(amountMismatchEvent, amountMismatchRaw),
        (error) => error?.code === 'provider_amount_mismatch',
      );
      await assert.rejects(
        applyProviderEvent(amountMismatchEvent, amountMismatchRaw),
        (error) => error?.code === 'provider_amount_mismatch',
      );
      const failedProviderEvent = await setupPool.query(
        `SELECT status, processing_attempts FROM payment_provider_events
         WHERE provider_event_id = $1`,
        [amountMismatchEvent.id],
      );
      assert.deepEqual(failedProviderEvent.rows[0], { status: 'failed', processing_attempts: 2 });

      const bindingMismatchEvent = {
        ...amountMismatchEvent,
        id: 'evt_memory_b8_binding_mismatch',
        data: { object: {
          ...amountMismatchEvent.data.object,
          amount: 3300,
          amount_received: 3300,
          metadata: {
            sit_payment_id: paymentId,
            sit_booking_id: 'different-booking',
          },
        } },
      };
      await assert.rejects(
        applyProviderEvent(
          bindingMismatchEvent,
          Buffer.from(JSON.stringify(bindingMismatchEvent)),
        ),
        (error) => error?.code === 'provider_payment_binding_mismatch',
      );

      const simulateRequiresAction = await fetch(`${baseUrl}/v1/payments/${paymentId}/simulate`, {
        method: 'POST', headers: renterAHeaders,
        body: JSON.stringify({ scenario: 'requires_action' }),
      });
      assert.equal(simulateRequiresAction.status, 200);
      const deterministicEvent = () => fetch(`${baseUrl}/v1/payments/${paymentId}/simulate`, {
        method: 'POST', headers: renterAHeaders,
        body: JSON.stringify({ scenario: 'succeeded', duplicate: true }),
      });
      const firstProviderSuccess = await deterministicEvent();
      assert.equal(firstProviderSuccess.status, 200);
      assert.equal((await firstProviderSuccess.json()).duplicate, false);
      const duplicateProviderSuccess = await deterministicEvent();
      assert.equal(duplicateProviderSuccess.status, 200);
      assert.equal((await duplicateProviderSuccess.json()).duplicate, true);

      const b8PaymentState = await fetch(`${baseUrl}/v1/bookings/b8-payment-flow/payment`, { headers: renterAHeaders });
      assert.equal(b8PaymentState.status, 200);
      const b8Paid = await b8PaymentState.json();
      assert.equal(b8Paid.bookingStatus, 'confirmed');
      assert.deepEqual(b8Paid.quote, {
        amountMinor: 3300,
        rentalSubtotalMinor: 3000,
        platformFeeMinor: 300,
        ownerPayoutMinor: 3000,
        currency: 'EUR',
      });
      assert.equal(Object.hasOwn(b8Paid, 'depositConsentVersion'), false);
      assert.equal(b8Paid.payment.status, 'captured');
      assert.equal(b8Paid.payment.capturedMinor, 3300);

      const capturedProviderPayment = await setupPool.query(
        'SELECT provider_charge_id FROM payments WHERE id = $1',
        [paymentId],
      );
      const providerDisputeObject = {
        id: 'dp_memory_b8_chargeback',
        object: 'dispute',
        charge: capturedProviderPayment.rows[0].provider_charge_id,
        amount: 3300,
        currency: 'eur',
        reason: 'fraudulent',
        status: 'under_review',
        evidence_details: { due_by: 1800000000 },
      };
      for (const [suffix, type, status] of [
        ['created', 'charge.dispute.created', 'under_review'],
        ['withdrawn', 'charge.dispute.funds_withdrawn', 'under_review'],
        ['reinstated', 'charge.dispute.funds_reinstated', 'won'],
      ]) {
        const disputeEvent = {
          id: `evt_memory_b8_dispute_${suffix}`,
          object: 'event', type, created: 1799539300, livemode: false,
          data: { object: { ...providerDisputeObject, status } },
        };
        assert.equal((await applyProviderEvent(
          disputeEvent,
          Buffer.from(JSON.stringify(disputeEvent)),
        )).status, 'processed');
      }
      const providerDisputeLedger = await setupPool.query(
        `SELECT transaction_type FROM ledger_transactions
         WHERE provider_reference = $1 ORDER BY created_at, transaction_type`,
        [providerDisputeObject.id],
      );
      assert.deepEqual(
        providerDisputeLedger.rows.map((row) => row.transaction_type).sort(),
        ['chargeback', 'chargeback_reversed'],
      );
      await setupPool.query(
        `UPDATE disputes SET status = 'closed', resolved_at = now()
         WHERE provider_dispute_id = $1`,
        [providerDisputeObject.id],
      );
      await setupPool.query(
        `UPDATE bookings SET workflow_status = 'confirmed', workflow_revision = workflow_revision + 1
         WHERE id = 'b8-payment-flow'`,
      );

      const disabledDeposit = await fetch(`${baseUrl}/v1/bookings/b8-payment-flow/deposit/setup`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b8-deposit-setup-booking' },
        body: '{}',
      });
      assert.equal(disabledDeposit.status, 404);

      const b8Activate = await fetch(`${baseUrl}/v1/bookings/b8-payment-flow/transitions`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b8-activate-payment-booking' },
        body: JSON.stringify({ status: 'active' }),
      });
      assert.equal(b8Activate.status, 200);
      const b8Complete = await fetch(`${baseUrl}/v1/bookings/b8-payment-flow/transitions`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'b8-complete-payment-booking' },
        body: JSON.stringify({ status: 'completed' }),
      });
      assert.equal(b8Complete.status, 200);

      await setupPool.query(
        `UPDATE disputes SET provider_status = 'lost'
         WHERE provider_dispute_id = $1`,
        [providerDisputeObject.id],
      );
      const blockedChargebackPayout = await fetch(`${baseUrl}/v1/payments/${paymentId}/payout-release`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-blocked-chargeback-payout' },
        body: '{}',
      });
      assert.equal(blockedChargebackPayout.status, 409);
      assert.equal((await blockedChargebackPayout.json()).error, 'payout_blocked_by_dispute');
      await setupPool.query(
        `UPDATE disputes SET provider_status = 'won'
         WHERE provider_dispute_id = $1`,
        [providerDisputeObject.id],
      );

      const payoutRelease = await fetch(`${baseUrl}/v1/payments/${paymentId}/payout-release`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-release-owner-payout' },
        body: '{}',
      });
      assert.equal(payoutRelease.status, 201);
      const payoutPayload = await payoutRelease.json();
      assert.equal(payoutPayload.payout.status, 'paid');
      assert.equal(payoutPayload.payout.amountMinor, 3000);

      const paidOutDisputeObject = {
        id: 'dp_memory_b8_paid_transfer_chargeback',
        object: 'dispute',
        charge: capturedProviderPayment.rows[0].provider_charge_id,
        amount: 1650,
        currency: 'eur',
        reason: 'fraudulent',
        status: 'under_review',
        evidence_details: { due_by: 1800000100 },
      };
      const paidOutDisputeCreated = {
        id: 'evt_memory_b8_paid_transfer_dispute_created',
        object: 'event',
        type: 'charge.dispute.created',
        created: 1799539400,
        livemode: false,
        data: { object: paidOutDisputeObject },
      };
      const paidOutDisputeWithdrawn = {
        ...paidOutDisputeCreated,
        id: 'evt_memory_b8_paid_transfer_dispute_withdrawn',
        type: 'charge.dispute.funds_withdrawn',
      };
      assert.equal((await applyProviderEvent(
        paidOutDisputeCreated,
        Buffer.from(JSON.stringify(paidOutDisputeCreated)),
      )).status, 'processed');
      assert.equal((await applyProviderEvent(
        paidOutDisputeWithdrawn,
        Buffer.from(JSON.stringify(paidOutDisputeWithdrawn)),
      )).status, 'processed');

      const uncertainReversalProvider = {
        async findTransferReversal() {
          return null;
        },
        async reverseTransfer() {
          const error = new Error('Synthetic provider transport timeout.');
          error.status = 503;
          error.code = 'stripe_transport_timeout';
          error.details = { providerStatus: 0 };
          throw error;
        },
      };
      const uncertainPaidTransferRecovery = await reconcileDisputeTransferRecoveries({
        provider: uncertainReversalProvider,
        now: new Date(Date.now() + 1_000),
      });
      assert.deepEqual(uncertainPaidTransferRecovery, {
        scheduled: 1,
        deferred: 0,
        needsReview: 0,
        recovered: 0,
        retryable: 0,
        uncertain: 1,
        manualReview: 0,
        cancelled: 0,
      });
      const uncertainTransfer = await setupPool.query(
        `SELECT recovery.status, recovery.needs_review,
                dispute.transfer_recovery_state,
                dispute.transfer_recovery_needs_review
           FROM dispute_transfer_recoveries AS recovery
           JOIN disputes AS dispute ON dispute.id = recovery.dispute_id
          WHERE dispute.provider_dispute_id = $1`,
        [paidOutDisputeObject.id],
      );
      assert.deepEqual(uncertainTransfer.rows[0], {
        status: 'uncertain',
        needs_review: true,
        transfer_recovery_state: 'needs_review',
        transfer_recovery_needs_review: true,
      });

      const paidTransferRecovery = await reconcileDisputeTransferRecoveries({
        now: new Date(Date.now() + 32_000),
      });
      assert.deepEqual(paidTransferRecovery, {
        scheduled: 0,
        deferred: 0,
        needsReview: 0,
        recovered: 1,
        retryable: 0,
        uncertain: 0,
        manualReview: 0,
        cancelled: 0,
      });
      const recoveredTransfer = await setupPool.query(
        `SELECT recovery.status, recovery.amount_minor, recovery.recovered_minor,
                recovery.needs_review, recovery.provider_reversal_id,
                dispute.transfer_recovery_state,
                dispute.transfer_recovery_needs_review
           FROM dispute_transfer_recoveries AS recovery
           JOIN disputes AS dispute ON dispute.id = recovery.dispute_id
          WHERE dispute.provider_dispute_id = $1`,
        [paidOutDisputeObject.id],
      );
      const {
        provider_reversal_id: recoveredProviderReversalId,
        ...recoveredTransferShape
      } = recoveredTransfer.rows[0];
      assert.deepEqual(recoveredTransferShape, {
        status: 'succeeded',
        amount_minor: '1500',
        recovered_minor: '1500',
        needs_review: false,
        transfer_recovery_state: 'recovered',
        transfer_recovery_needs_review: false,
      });
      assert.match(recoveredProviderReversalId, /^trr_memory_/u);
      const paidTransferRecoveryReplay = await reconcileDisputeTransferRecoveries();
      assert.deepEqual(paidTransferRecoveryReplay, {
        scheduled: 0,
        deferred: 0,
        needsReview: 0,
        recovered: 0,
        retryable: 0,
        uncertain: 0,
        manualReview: 0,
        cancelled: 0,
      });
      assert.equal((await applyProviderEvent(
        paidOutDisputeWithdrawn,
        Buffer.from(JSON.stringify(paidOutDisputeWithdrawn)),
      )).duplicate, true);
      const recoveredPayoutState = await setupPool.query(
        `SELECT payout.status, payout.reversed_minor, payment.transferred_minor
           FROM payouts AS payout
           JOIN payments AS payment ON payment.id = payout.payment_id
          WHERE payout.payment_id = $1`,
        [paymentId],
      );
      assert.deepEqual(recoveredPayoutState.rows[0], {
        status: 'paid',
        reversed_minor: '1500',
        transferred_minor: '1500',
      });
      const paidOutDisputeReinstated = {
        ...paidOutDisputeCreated,
        id: 'evt_memory_b8_paid_transfer_dispute_reinstated',
        type: 'charge.dispute.funds_reinstated',
        data: { object: { ...paidOutDisputeObject, status: 'won' } },
      };
      assert.equal((await applyProviderEvent(
        paidOutDisputeReinstated,
        Buffer.from(JSON.stringify(paidOutDisputeReinstated)),
      )).status, 'processed');
      const recoveryReinstatementLedger = await setupPool.query(
        `SELECT transaction_type FROM ledger_transactions
          WHERE payment_id = $1
            AND transaction_type IN (
              'chargeback_owner_transfer_recovered',
              'chargeback_owner_recovery_reinstated'
            )
          ORDER BY transaction_type`,
        [paymentId],
      );
      assert.deepEqual(
        recoveryReinstatementLedger.rows.map((row) => row.transaction_type),
        ['chargeback_owner_recovery_reinstated', 'chargeback_owner_transfer_recovered'],
      );
      const reinstatedDisputeHold = await setupPool.query(
        `SELECT dispute.status, booking.workflow_status
           FROM disputes AS dispute
           JOIN bookings AS booking ON booking.id = dispute.booking_id
          WHERE dispute.provider_dispute_id = $1`,
        [paidOutDisputeObject.id],
      );
      assert.deepEqual(reinstatedDisputeHold.rows[0], {
        status: 'investigating',
        workflow_status: 'disputed',
      });
      // Funds being reinstated does not replace the separate, human dispute
      // closure. Only that closure may re-open ordinary payout/refund handling.
      await setupPool.query(
        `UPDATE disputes SET status = 'closed', resolved_at = now()
          WHERE provider_dispute_id = $1`,
        [paidOutDisputeObject.id],
      );
      await setupPool.query(
        `UPDATE bookings SET workflow_status = 'completed',
             workflow_revision = workflow_revision + 1
          WHERE id = 'b8-payment-flow'`,
      );

      const partialRefundAfterPayout = await fetch(`${baseUrl}/v1/payments/${paymentId}/refunds`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-partial-refund-after-owner-payout' },
        body: JSON.stringify({ amountMinor: 1650, reason: 'integration_partial_refund' }),
      });
      assert.equal(partialRefundAfterPayout.status, 201);
      const partialRefundPayload = await partialRefundAfterPayout.json();
      assert.equal(partialRefundPayload.payment.status, 'partially_refunded');
      const partiallyReversedPayout = await setupPool.query(
        `SELECT status, reversed_minor FROM payouts WHERE payment_id = $1`,
        [paymentId],
      );
      assert.equal(partiallyReversedPayout.rows[0].status, 'reversed');
      assert.equal(partiallyReversedPayout.rows[0].reversed_minor, '3000');

      // A reinstated recovery creates a compensating owner payable, but it
      // cannot pay automatically: the human dispute closure above is the
      // separate authorization that allows this fresh, residual payout.
      const payoutAfterHumanDisputeClosure = await fetch(`${baseUrl}/v1/payments/${paymentId}/payout-release`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-no-duplicate-payout-after-partial-refund' },
        body: '{}',
      });
      assert.equal(payoutAfterHumanDisputeClosure.status, 201);
      const payoutAfterHumanDisputeClosurePayload = await payoutAfterHumanDisputeClosure.json();
      assert.equal(payoutAfterHumanDisputeClosurePayload.payout.amountMinor, 1500);
      const payoutAfterHumanDisputeClosureReplay = await fetch(`${baseUrl}/v1/payments/${paymentId}/payout-release`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-no-duplicate-payout-after-partial-refund' },
        body: '{}',
      });
      assert.equal(payoutAfterHumanDisputeClosureReplay.status, 200);
      assert.equal((await payoutAfterHumanDisputeClosureReplay.json()).replayed, true);

      const refundAfterPayout = await fetch(`${baseUrl}/v1/payments/${paymentId}/refunds`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b8-final-refund-after-owner-payout' },
        body: JSON.stringify({ amountMinor: 1650, reason: 'integration_final_refund' }),
      });
      assert.equal(refundAfterPayout.status, 201);
      const refundPayload = await refundAfterPayout.json();
      assert.equal(refundPayload.refund.status, 'succeeded');
      assert.equal(refundPayload.payment.status, 'refunded');
      const reversedPayouts = await setupPool.query(
        `SELECT status, amount_minor, reversed_minor
           FROM payouts WHERE payment_id = $1 ORDER BY created_at, id`,
        [paymentId],
      );
      assert.deepEqual(reversedPayouts.rows, [
        { status: 'reversed', amount_minor: '3000', reversed_minor: '3000' },
        { status: 'reversed', amount_minor: '1500', reversed_minor: '1500' },
      ]);

      const ledgerBalance = await setupPool.query(
        `SELECT transaction_id, sum(debit_minor)::bigint AS debit, sum(credit_minor)::bigint AS credit
         FROM ledger_entries GROUP BY transaction_id ORDER BY transaction_id`,
      );
      assert.ok(ledgerBalance.rowCount >= 4);
      assert.ok(ledgerBalance.rows.every((row) => row.debit === row.credit));
      await assert.rejects(
        setupPool.query('UPDATE ledger_entries SET debit_minor = debit_minor + 1 WHERE id = (SELECT min(id) FROM ledger_entries)'),
        (error) => error?.code === '55000',
      );
      const providerEvents = await setupPool.query(
        `SELECT count(*)::int AS count FROM payment_provider_events
         WHERE event_type = 'payment_intent.succeeded' AND status = 'processed'`,
      );
      assert.equal(providerEvents.rows[0].count, 1);
      const paymentDeepLink = await fetch(`${baseUrl}/v1/open/payment/b8-payment-flow`);
      assert.equal(paymentDeepLink.status, 200);
      assert.match(await paymentDeepLink.text(), /Zahlung öffnen/);

      const supportHeaders = {
        Authorization: `Bearer ${tokenFor('support')}`,
        'Content-Type': 'application/json',
      };
      const supportElevation = await fetch(`${baseUrl}/v1/admin/step-up`, {
        method: 'POST',
        headers: supportHeaders,
        body: JSON.stringify({ currentPassword: supportPassword }),
      });
      assert.equal(supportElevation.status, 200);
      supportHeaders['X-Admin-Step-Up'] = (await supportElevation.json()).elevation.token;
      const supportCannotListArticle18Candidates = await fetch(
        `${baseUrl}/v1/admin/support/article-18/candidates`,
        { headers: supportHeaders },
      );
      assert.equal(supportCannotListArticle18Candidates.status, 403);
      assert.equal(
        (await supportCannotListArticle18Candidates.json()).error,
        'admin_role_required',
      );
      const article18CandidateQueue = await fetch(
        `${baseUrl}/v1/admin/support/article-18/candidates`,
        { headers: adminHeaders },
      );
      assert.equal(article18CandidateQueue.status, 200);
      assert.match(article18CandidateQueue.headers.get('cache-control'), /no-store/u);
      const article18QueuePayload = await article18CandidateQueue.json();
      assert.equal(article18QueuePayload.externalDeliveryEnabled, false);
      assert.ok(article18QueuePayload.candidates.some((entry) => (
        entry.caseId === article18Intake.supportCase.id
        && entry.article18Candidate === true
        && entry.priority === 'p0'
        && entry.latestAssessment === null
      )));

      const createArticle18Assessment = () => fetch(
        `${baseUrl}/v1/admin/support/cases/${article18Intake.supportCase.id}/article-18-assessments`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3r-article18-assessment-integration',
          },
          body: JSON.stringify({
            determination: 'reporting_path_required',
            routingBasis: 'concerned_member_state_identified',
            factualBasis:
              'Verified synthetic integration facts require guarded authority-path preparation.',
            evidenceReferences: ['support-evidence:synthetic-article18-1'],
            concernedMemberStates: ['DE'],
            informationScope: ['case_reference', 'evidence_digest'],
            reviewerAuthorizationEvidenceRef:
              'integration:qualified-owner-evidence',
            humanReviewed: true,
            automationRole: 'none',
            noAutomatedDispatchConfirmed: true,
          }),
        },
      );
      const article18AssessmentResponse = await createArticle18Assessment();
      assert.equal(article18AssessmentResponse.status, 201);
      assert.match(article18AssessmentResponse.headers.get('cache-control'), /no-store/u);
      const article18Assessment = await article18AssessmentResponse.json();
      assert.equal(article18Assessment.assessment.humanReviewed, true);
      assert.equal(article18Assessment.assessment.automationRole, 'none');
      assert.equal(article18Assessment.assessment.externalDeliveryAllowed, false);
      assert.equal(
        article18Assessment.assessment.externalDeliveryStatus,
        'disabled_not_configured',
      );
      const article18AssessmentReplay = await createArticle18Assessment();
      assert.equal(article18AssessmentReplay.status, 200);
      assert.equal((await article18AssessmentReplay.json()).replayed, true);

      const supportCannotDispatchArticle18 = await fetch(
        `${baseUrl}/v1/admin/support/article-18-assessments/${article18Assessment.assessment.id}/dispatch`,
        {
          method: 'POST',
          headers: supportHeaders,
          body: '{}',
        },
      );
      assert.equal(supportCannotDispatchArticle18.status, 403);
      assert.equal(
        (await supportCannotDispatchArticle18.json()).error,
        'admin_role_required',
      );
      const adminCannotDispatchArticle18 = await fetch(
        `${baseUrl}/v1/admin/support/article-18-assessments/${article18Assessment.assessment.id}/dispatch`,
        {
          method: 'POST',
          headers: adminHeaders,
          body: '{}',
        },
      );
      assert.equal(adminCannotDispatchArticle18.status, 503);
      assert.equal(
        (await adminCannotDispatchArticle18.json()).error,
        'support_article18_external_dispatch_disabled',
      );
      const article18Event = await setupPool.query(
        `SELECT structured_payload FROM support_case_events
          WHERE case_id = $1
            AND event_type = 'support.article18_assessment_recorded'`,
        [article18Intake.supportCase.id],
      );
      assert.equal(article18Event.rowCount, 1);
      assert.equal(article18Event.rows[0].structured_payload.externalDeliveryAllowed, false);
      assert.equal(
        Object.hasOwn(article18Event.rows[0].structured_payload, 'factualBasis'),
        false,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE support_article18_assessments
              SET factual_basis = 'Forbidden mutation of restricted evidence.'
            WHERE id = $1`,
          [article18Assessment.assessment.id],
        ),
        (error) => error?.code === '55000',
      );
      await setupPool.query(
        `UPDATE support_cases
            SET current_owner_id = 'admin',
                current_owner_role = 'trust_safety_owner',
                lock_version = lock_version + 1,
                updated_at = GREATEST(now(), updated_at + interval '1 microsecond')
          WHERE id = $1`,
        [article18Intake.supportCase.id],
      );
      await setupPool.query(
        `UPDATE support_cases
            SET current_owner_id = 'support',
                current_owner_role = 'general_support_owner',
                lock_version = lock_version + 1,
                updated_at = GREATEST(now(), updated_at + interval '1 microsecond')
          WHERE id = $1`,
        [supportIntake.supportCase.id],
      );
      const validEvidenceBytes = await sharp({
        create: {
          width: 96,
          height: 72,
          channels: 3,
          background: { r: 24, g: 90, b: 180 },
        },
      }).jpeg({ quality: 95 }).toBuffer();
      await restartApplicationServer();
      const createEvidenceUpload = ({
        idempotencyKey,
        bytes = validEvidenceBytes,
        mimeType = 'image/jpeg',
        fileName = 'synthetic-evidence.jpg',
        description = 'Synthetischer Bildnachweis für den kontrollierten Integrationstest.',
      }) => {
        const form = new FormData();
        form.append('description', description);
        form.append('purpose', 'Dokumentation des gemeldeten synthetischen Zustands.');
        form.append('claimedEventTime', '2026-08-20T12:30:00.000Z');
        form.append('thirdPartyData', 'false');
        form.append('file', new Blob([bytes], { type: mimeType }), fileName);
        return fetch(
          `${baseUrl}/v1/support/cases/${supportIntake.supportCase.id}/evidence`,
          {
            method: 'POST',
            headers: {
              Authorization: renterAHeaders.Authorization,
              'Idempotency-Key': idempotencyKey,
            },
            body: form,
          },
        );
      };
      const evidenceUploadResponse = await createEvidenceUpload({
        idempotencyKey: 's4a-support-evidence-upload',
        fileName: '\"><img src=x onerror=alert(1)>.jpg',
      });
      assert.equal(evidenceUploadResponse.status, 201);
      assert.match(evidenceUploadResponse.headers.get('cache-control'), /no-store/u);
      const evidenceUpload = await evidenceUploadResponse.json();
      assert.equal(evidenceUpload.replayed, false);
      assert.equal(evidenceUpload.evidence.scanStatus, 'pending');
      assert.equal(evidenceUpload.evidence.previewAvailable, false);
      assert.equal(evidenceUpload.externalScannerTraffic, false);
      assert.equal(evidenceUpload.externalAiUsed, false);
      assert.equal(Object.hasOwn(evidenceUpload.evidence, 'fileName'), false);
      assert.equal(Object.hasOwn(evidenceUpload.evidence, 'originalStorageName'), false);
      const evidenceReplayResponse = await createEvidenceUpload({
        idempotencyKey: 's4a-support-evidence-upload',
        fileName: 'ignored-replay-name.jpg',
      });
      assert.equal(evidenceReplayResponse.status, 200);
      const evidenceReplay = await evidenceReplayResponse.json();
      assert.equal(evidenceReplay.replayed, true);
      assert.equal(evidenceReplay.evidence.id, evidenceUpload.evidence.id);
      const evidenceRowsAfterReplay = await setupPool.query(
        `SELECT count(*)::int AS count
           FROM support_evidence_files
          WHERE evidence_id = $1`,
        [evidenceUpload.evidence.id],
      );
      assert.equal(evidenceRowsAfterReplay.rows[0].count, 1);

      const executableBytes = Buffer.alloc(512);
      executableBytes.write('MZ', 0, 'ascii');
      executableBytes.write('This program cannot be run in DOS mode', 78, 'ascii');
      const spoofedExecutableResponse = await createEvidenceUpload({
        idempotencyKey: 's4a-support-evidence-executable',
        bytes: executableBytes,
        fileName: 'spoofed.jpg',
      });
      assert.equal(spoofedExecutableResponse.status, 415);
      assert.equal(
        (await spoofedExecutableResponse.json()).error,
        'support_evidence_mime_not_allowed',
      );
      const xssDescriptionResponse = await createEvidenceUpload({
        idempotencyKey: 's4a-support-evidence-xss',
        description: '<img src=x onerror=alert(1)>',
      });
      assert.equal(xssDescriptionResponse.status, 400);
      assert.equal(
        (await xssDescriptionResponse.json()).error,
        'support_evidence_description_invalid',
      );

      const malwareFixture = Buffer.from([
        'X5O!P%@AP',
        '[4\\PZX54(P^)7CC)7}$',
        'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
      ].join('-'), 'ascii');
      const quarantinedResponse = await createEvidenceUpload({
        idempotencyKey: 's4a-support-evidence-quarantine',
        bytes: malwareFixture,
        fileName: 'synthetic-malware-test.jpg',
      });
      assert.equal(quarantinedResponse.status, 201);
      const quarantined = await quarantinedResponse.json();
      assert.equal(quarantined.evidence.scanStatus, 'quarantined');
      assert.equal(quarantined.evidence.previewAvailable, false);
      const quarantinedGrant = await fetch(
        `${baseUrl}/v1/support/evidence/${quarantined.evidence.id}/access-grants`,
        {
          method: 'POST',
          headers: renterAHeaders,
        },
      );
      assert.equal(quarantinedGrant.status, 409);
      assert.equal(
        (await quarantinedGrant.json()).error,
        'support_evidence_preview_unavailable',
      );

      const scanEvidence = () => fetch(
        `${baseUrl}/v1/admin/support/evidence/${evidenceUpload.evidence.id}/scan-results`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's4a-support-evidence-clean-scan',
          },
          body: JSON.stringify({
            result: 'clean',
            expectedOriginalSha256: evidenceUpload.evidence.originalSha256,
            scanReference: 'internal-test-fixture-clean-001',
          }),
        },
      );
      const scanEvidenceResponse = await scanEvidence();
      assert.equal(scanEvidenceResponse.status, 201);
      assert.equal((await scanEvidenceResponse.json()).externalProviderTraffic, false);
      const scanEvidenceReplay = await scanEvidence();
      assert.equal(scanEvidenceReplay.status, 200);
      assert.equal((await scanEvidenceReplay.json()).replayed, true);

      const listedEvidenceResponse = await fetch(
        `${baseUrl}/v1/support/cases/${supportIntake.supportCase.id}/evidence`,
        { headers: renterAHeaders },
      );
      assert.equal(listedEvidenceResponse.status, 200);
      const listedEvidence = await listedEvidenceResponse.json();
      const listedCleanEvidence = listedEvidence.evidence.find(
        (entry) => entry.id === evidenceUpload.evidence.id,
      );
      assert.equal(listedCleanEvidence.previewAvailable, true);
      assert.equal(Object.hasOwn(listedCleanEvidence, 'previewStorageName'), false);
      assert.equal(Object.hasOwn(listedCleanEvidence, 'fileName'), false);
      const outsiderEvidenceList = await fetch(
        `${baseUrl}/v1/support/cases/${supportIntake.supportCase.id}/evidence`,
        { headers: renterBHeaders },
      );
      assert.equal(outsiderEvidenceList.status, 404);

      const issueEvidenceGrant = () => fetch(
        `${baseUrl}/v1/support/evidence/${evidenceUpload.evidence.id}/access-grants`,
        {
          method: 'POST',
          headers: renterAHeaders,
        },
      );
      const firstEvidenceGrantResponse = await issueEvidenceGrant();
      assert.equal(firstEvidenceGrantResponse.status, 201);
      const firstEvidenceGrant = (await firstEvidenceGrantResponse.json()).grant;
      assert.equal(firstEvidenceGrant.sessionBound, true);
      assert.equal(firstEvidenceGrant.bearerTransferable, false);
      const forwardedEvidenceGrant = await fetch(
        `${baseUrl}/v1/support/evidence/${evidenceUpload.evidence.id}/preview`,
        {
          headers: {
            ...renterBHeaders,
            'X-Support-Evidence-Grant': firstEvidenceGrant.accessToken,
          },
        },
      );
      assert.equal(forwardedEvidenceGrant.status, 403);
      await setupPool.query(
        `UPDATE support_evidence_access_grants AS access_grant
            SET created_at = now() - interval '3 minutes',
                expires_at = now() - interval '1 minute'
           FROM support_evidence_files AS evidence_file
          WHERE access_grant.evidence_file_id = evidence_file.id
            AND evidence_file.evidence_id = $1
            AND access_grant.subject_user_id = 'renter-a'`,
        [evidenceUpload.evidence.id],
      );
      const expiredEvidenceGrant = await fetch(
        `${baseUrl}/v1/support/evidence/${evidenceUpload.evidence.id}/preview`,
        {
          headers: {
            ...renterAHeaders,
            'X-Support-Evidence-Grant': firstEvidenceGrant.accessToken,
          },
        },
      );
      assert.equal(expiredEvidenceGrant.status, 403);

      const freshEvidenceGrantResponse = await issueEvidenceGrant();
      assert.equal(freshEvidenceGrantResponse.status, 201);
      const freshEvidenceGrant = (await freshEvidenceGrantResponse.json()).grant;
      const evidencePreviewResponse = await fetch(
        `${baseUrl}/v1/support/evidence/${evidenceUpload.evidence.id}/preview`,
        {
          headers: {
            ...renterAHeaders,
            'X-Support-Evidence-Grant': freshEvidenceGrant.accessToken,
          },
        },
      );
      assert.equal(evidencePreviewResponse.status, 200);
      assert.equal(evidencePreviewResponse.headers.get('content-type'), 'image/webp');
      assert.match(evidencePreviewResponse.headers.get('cache-control'), /no-store/u);
      assert.equal(evidencePreviewResponse.headers.get('x-content-type-options'), 'nosniff');
      const evidencePreviewBytes = Buffer.from(await evidencePreviewResponse.arrayBuffer());
      const evidenceFile = (await setupPool.query(
        `SELECT original_storage_name, preview_storage_name,
                original_sha256, preview_sha256
           FROM support_evidence_files
          WHERE evidence_id = $1`,
        [evidenceUpload.evidence.id],
      )).rows[0];
      assert.equal(
        crypto.createHash('sha256').update(evidencePreviewBytes).digest('hex'),
        evidenceFile.preview_sha256,
      );
      assert.equal(
        evidencePreviewResponse.headers.get('x-sit-evidence-sha256'),
        evidenceFile.preview_sha256,
      );
      const storedOriginal = await fs.readFile(path.join(uploadDir, evidenceFile.original_storage_name));
      assert.equal(
        crypto.createHash('sha256').update(storedOriginal).digest('hex'),
        evidenceFile.original_sha256,
      );
      assert.notEqual(evidenceFile.preview_sha256, evidenceFile.original_sha256);
      await assert.rejects(
        setupPool.query(
          `UPDATE support_evidence_files
              SET original_sha256 = $2
            WHERE evidence_id = $1`,
          [evidenceUpload.evidence.id, '0'.repeat(64)],
        ),
        (error) => error?.code === 'P0001'
          && error?.message === 'support evidence source and preview are immutable',
      );
      const evidenceRetentionResponse = await fetch(
        `${baseUrl}/v1/admin/privacy/retention-inventory`,
        { headers: adminHeaders },
      );
      assert.equal(evidenceRetentionResponse.status, 200);
      const evidenceRetentionInventory = (await evidenceRetentionResponse.json()).inventory;
      assert.ok(evidenceRetentionInventory.categories
        .find((entry) => entry.category === 'communications')
        .datasets.some((entry) => entry.dataset === 'support_case_links'));
      assert.ok(evidenceRetentionInventory.categories
        .find((entry) => entry.category === 'moderation')
        .datasets.some((entry) => entry.dataset === 'support_evidence_files'));
      assert.ok(evidenceRetentionInventory.categories
        .find((entry) => entry.category === 'securityAudit')
        .datasets.some((entry) => entry.dataset === 'support_evidence_access_grants'));
      assert.ok(evidenceRetentionInventory.categories
        .find((entry) => entry.category === 'transactions')
        .datasets.some((entry) => entry.dataset === 'dispute_transfer_recoveries'));

      const supportTemplateCatalog = await fetch(
        `${baseUrl}/v1/admin/support/message-templates`,
        { headers: supportHeaders },
      );
      assert.equal(supportTemplateCatalog.status, 200);
      const supportTemplates = (await supportTemplateCatalog.json()).templates;
      assert.equal(supportTemplates.length, 55);
      assert.equal(supportTemplates.find((entry) => entry.id === 'T-001').genericDraftAvailable, true);
      assert.equal(supportTemplates.find((entry) => entry.id === 'T-043').genericDraftAvailable, false);
      assert.equal(supportTemplates.find((entry) => entry.id === 'T-035').genericDraftAvailable, false);
      assert.ok(supportTemplates.every((entry) => !Object.hasOwn(entry, 'body')));

      await restartApplicationServer();
      const compromisedEmailResetToken =
        'compromised-email-reset-token-that-must-be-invalidated-1234567890';
      const preexistingResetToken = await setupPool.query(
        `INSERT INTO auth_action_tokens (
           user_id, kind, token_hash, expires_at
         ) VALUES (
           'renter-a', 'reset_password', $1, now() + interval '30 minutes'
         ) RETURNING id`,
        [hashActionToken(compromisedEmailResetToken)],
      );
      const accountTakeoverIntakeResponse = await fetch(
        `${baseUrl}/v1/support/cases`,
        {
          method: 'POST',
          headers: {
            ...renterAHeaders,
            'Idempotency-Key': 's4f-account-takeover-intake',
          },
          body: JSON.stringify({
            caseType: 'trust_safety',
            caseSubType: 'account_takeover',
            summary: 'Moegliche Kontouebernahme sicher und getrennt pruefen.',
            accountTakeover: true,
            immediateDanger: false,
            safetyTriage: {
              version: 'sit_support_safety_triage_v1',
              packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
              guidanceVersion: 'T-003@1.0.0',
              immediateDanger: false,
              guidanceShown: false,
            },
            issueScope: {
              version: 'sit_support_single_issue_scope_v1',
              singleIssueConfirmed: true,
              separationGuidanceShown: false,
            },
          }),
        },
      );
      assert.equal(accountTakeoverIntakeResponse.status, 201);
      const accountTakeoverIntake = await accountTakeoverIntakeResponse.json();
      assert.equal(accountTakeoverIntake.supportCase.priority, 'p0');
      const invalidatedResetToken = await setupPool.query(
        `SELECT consumed_at FROM auth_action_tokens WHERE id = $1`,
        [preexistingResetToken.rows[0].id],
      );
      assert.ok(invalidatedResetToken.rows[0].consumed_at);
      const compromisedResetReuse = await fetch(
        `${baseUrl}/v1/auth/password-reset/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: compromisedEmailResetToken,
            password: createEphemeralAcceptancePassword(),
          }),
        },
      );
      assert.equal(compromisedResetReuse.status, 400);
      const compromisedEmailResetRequest = await fetch(
        `${baseUrl}/v1/auth/password-reset/request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'renter-a@example.com' }),
        },
      );
      assert.equal(compromisedEmailResetRequest.status, 202);
      assert.deepEqual(await compromisedEmailResetRequest.json(), { accepted: true });
      const activeCompromisedEmailResetTokens = await setupPool.query(
        `SELECT count(*)::int AS count
           FROM auth_action_tokens
          WHERE user_id = 'renter-a'
            AND kind = 'reset_password'
            AND consumed_at IS NULL`,
      );
      assert.equal(activeCompromisedEmailResetTokens.rows[0].count, 0);
      const blockedCompromisedEmailAudit = await setupPool.query(
        `SELECT metadata
           FROM audit_log
          WHERE action = 'auth.password_reset_email_blocked_account_takeover'
            AND resource_id = 'renter-a'
          ORDER BY id DESC LIMIT 1`,
      );
      assert.deepEqual(blockedCompromisedEmailAudit.rows[0].metadata, {
        channel: 'email',
        reason: 'active_p0_account_takeover_case',
        resetTokenIssued: false,
        externalMessageSent: false,
      });
      await setupPool.query(
        `UPDATE support_cases
            SET current_owner_id = 'support',
                lock_version = lock_version + 1,
                updated_at = GREATEST(
                  clock_timestamp(),
                  updated_at + interval '1 microsecond'
                )
          WHERE id = $1`,
        [accountTakeoverIntake.supportCase.id],
      );

      const accountRecoveryBypass = await fetch(
        `${baseUrl}/v1/admin/support/cases/${accountTakeoverIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-account-recovery-bypass',
          },
          body: JSON.stringify({
            templateId: 'T-035',
            recipientUserId: 'renter-a',
            variables: {
              first_name: 'Walid',
              secure_recovery_channel: 'E-Mail',
              temporary_account_effect: 'Freigabe erteilt',
            },
          }),
        },
      );
      assert.equal(accountRecoveryBypass.status, 409);
      assert.equal(
        (await accountRecoveryBypass.json()).error,
        'support_account_recovery_workflow_required',
      );

      const accountRecoveryDraftResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${accountTakeoverIntake.supportCase.id}/account-recovery-guidance`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-account-recovery-guidance',
          },
          body: JSON.stringify({ recipientUserId: 'renter-a' }),
        },
      );
      const accountRecoveryDraft = await accountRecoveryDraftResponse.json();
      assert.equal(accountRecoveryDraftResponse.status, 201, accountRecoveryDraft.error);
      assert.equal(accountRecoveryDraft.message.templateId, 'T-035');
      assert.equal(accountRecoveryDraft.message.sendStatus, 'pending_approval');
      assert.match(accountRecoveryDraft.message.content, /Konto > Sicherheit/u);
      assert.match(accountRecoveryDraft.message.content, /E-Mail-Kanal allein wird nicht akzeptiert/u);
      const storedAccountRecovery = await setupPool.query(
        `SELECT structured_variables
           FROM support_messages
          WHERE id = $1`,
        [accountRecoveryDraft.message.id],
      );
      assert.equal(
        storedAccountRecovery.rows[0].structured_variables.compromised_channel_used,
        false,
      );
      assert.equal(
        storedAccountRecovery.rows[0].structured_variables.password_or_pin_requested,
        false,
      );
      assert.equal(
        storedAccountRecovery.rows[0].structured_variables.recovery_action_executed,
        false,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO support_messages (
             id, case_id, sender_type, sender_id, recipient_user_id,
             message_type, message_title, template_id, template_version, locale,
             rendered_content, rendered_content_sha256, structured_variables,
             approval_level, send_status, notification_ids,
             ai_disclosure_included, human_handoff_available,
             idempotency_key, lock_version, created_at
           )
           SELECT gen_random_uuid(), case_id, sender_type, sender_id,
                  recipient_user_id, message_type, message_title, template_id,
                  template_version, locale, rendered_content,
                  rendered_content_sha256,
                  jsonb_set(
                    structured_variables,
                    '{secure_recovery_channel}',
                    to_jsonb('reported email channel'::text)
                  ),
                  approval_level, send_status, notification_ids,
                  ai_disclosure_included, human_handoff_available,
                  idempotency_key || '-forged-binding', lock_version, created_at
             FROM support_messages
            WHERE id = $1`,
          [accountRecoveryDraft.message.id],
        ),
        (error) => error?.code === 'P0001'
          && error?.message === 'Account recovery guidance binding is invalid',
      );

      const accountRecoveryReviewResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${accountTakeoverIntake.supportCase.id}/messages/${accountRecoveryDraft.message.id}/review`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 'http-account-recovery-review',
          },
          body: JSON.stringify({
            outcome: 'approved',
            expectedVersion: accountRecoveryDraft.message.version,
            expectedPayloadSha256:
              accountRecoveryDraft.message.renderedContentSha256,
            reviewNotes:
              'Kompromittierter Kanal, In-App-Reauthentifizierung und Nicht-Aktion wurden geprueft.',
          }),
        },
      );
      assert.equal(accountRecoveryReviewResponse.status, 200);
      const accountRecoveryReview = await accountRecoveryReviewResponse.json();
      const accountRecoveryPublicationResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${accountTakeoverIntake.supportCase.id}/messages/${accountRecoveryDraft.message.id}/publication`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-account-recovery-publication',
          },
          body: JSON.stringify({
            expectedVersion: accountRecoveryReview.message.version,
            expectedPayloadSha256:
              accountRecoveryReview.message.renderedContentSha256,
          }),
        },
      );
      assert.equal(accountRecoveryPublicationResponse.status, 200);
      const accountRecoveryPublication =
        await accountRecoveryPublicationResponse.json();
      assert.equal(accountRecoveryPublication.message.sendStatus, 'sent');
      assert.equal(accountRecoveryPublication.message.externalMessageSent, false);

      const greenMessageRequest = () => fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-green-message',
          },
          body: JSON.stringify({
            templateId: 'T-007',
            recipientUserId: 'renter-a',
            publishNow: true,
            variables: {
              first_name: 'Walid',
              evidence_request_list: 'Bitte ergänze die genaue App-Version.',
            },
          }),
        },
      );
      const greenMessageResponse = await greenMessageRequest();
      assert.equal(greenMessageResponse.status, 201);
      assert.match(greenMessageResponse.headers.get('cache-control'), /no-store/u);
      const greenMessage = await greenMessageResponse.json();
      assert.equal(greenMessage.message.sendStatus, 'sent');
      assert.equal(greenMessage.message.approvalLevel, 'green_automatic');
      assert.equal(greenMessage.message.externalMessageSent, false);
      assert.doesNotMatch(greenMessage.message.content, /\{\{|\}\}/u);
      assert.equal((await greenMessageRequest()).status, 200);

      const sensitiveMessage = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-sensitive-message',
          },
          body: JSON.stringify({
            templateId: 'T-007',
            recipientUserId: 'renter-a',
            variables: {
              first_name: 'Walid',
              evidence_request_list: 'API-Key: sk_live_1234567890',
            },
          }),
        },
      );
      assert.equal(sensitiveMessage.status, 400);
      const sensitiveRequestId = sensitiveMessage.headers.get('x-request-id');
      assert.equal(
        (await sensitiveMessage.json()).error,
        'support_message_sensitive_content_blocked',
      );
      const sensitiveMessageAudit = await setupPool.query(
        `SELECT actor_id, actor_role, resource_type, resource_id, request_id,
                metadata
           FROM audit_log
          WHERE action = 'support.message_content_blocked'
            AND request_id = $1`,
        [sensitiveRequestId],
      );
      assert.deepEqual(sensitiveMessageAudit.rows, [{
        actor_id: 'support',
        actor_role: 'support',
        resource_type: 'support_case',
        resource_id: supportIntake.supportCase.id,
        request_id: sensitiveRequestId,
        metadata: {
          reasonCode: 'support_message_sensitive_content_blocked',
          contentClass: 'secret',
          blockedField: 'evidence_request_list',
          templateId: 'T-007',
          detectionVersion: 'sit_support_content_guard_v1',
          inputStored: false,
          messageCreated: false,
          externalMessageSent: false,
        },
      }]);
      assert.doesNotMatch(
        JSON.stringify(sensitiveMessageAudit.rows[0]),
        /sk_live_1234567890/u,
      );
      const personalDataMessage = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-personal-data-message',
          },
          body: JSON.stringify({
            templateId: 'T-007',
            recipientUserId: 'renter-a',
            variables: {
              first_name: 'Walid',
              evidence_request_list: 'Kontakt: gegenpartei@example.test',
            },
          }),
        },
      );
      assert.equal(personalDataMessage.status, 400);
      const personalDataRequestId = personalDataMessage.headers.get('x-request-id');
      assert.equal(
        (await personalDataMessage.json()).error,
        'support_message_sensitive_content_blocked',
      );
      const personalDataMessageAudit = await setupPool.query(
        `SELECT metadata
           FROM audit_log
          WHERE action = 'support.message_content_blocked'
            AND request_id = $1`,
        [personalDataRequestId],
      );
      assert.equal(personalDataMessageAudit.rowCount, 1);
      assert.equal(
        personalDataMessageAudit.rows[0].metadata.contentClass,
        'personal_data',
      );
      assert.equal(personalDataMessageAudit.rows[0].metadata.inputStored, false);
      assert.doesNotMatch(
        JSON.stringify(personalDataMessageAudit.rows[0]),
        /gegenpartei@example\.test/u,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO audit_log (
             actor_id, actor_role, action, resource_type, resource_id,
             request_id, metadata
           ) VALUES (
             'support', 'support', 'support.message_content_blocked',
             'support_case', $1, 'forged-sensitive-audit',
             $2::jsonb
           )`,
          [
            supportIntake.supportCase.id,
            JSON.stringify({
              reasonCode: 'support_message_sensitive_content_blocked',
              contentClass: 'secret',
              blockedField: 'evidence_request_list',
              templateId: 'T-007',
              detectionVersion: 'sit_support_content_guard_v1',
              inputStored: true,
              messageCreated: false,
              externalMessageSent: false,
              rawValue: 'must-never-be-stored',
            }),
          ],
        ),
        (error) => error?.code === '23514',
      );

      const redMessage = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-red-message',
          },
          body: JSON.stringify({
            templateId: 'T-043',
            recipientUserId: 'renter-a',
            variables: {},
          }),
        },
      );
      assert.equal(redMessage.status, 409);
      assert.equal(
        (await redMessage.json()).error,
        'support_message_red_template_requires_decision_workflow',
      );

      const progressTemplateBypass = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-progress-bypass',
          },
          body: JSON.stringify({
            templateId: 'T-008',
            recipientUserId: 'renter-a',
            variables: {},
          }),
        },
      );
      assert.equal(progressTemplateBypass.status, 409);
      assert.equal(
        (await progressTemplateBypass.json()).error,
        'support_progress_update_workflow_required',
      );

      const progressCaseBeforeDraft = await setupPool.query(
        `SELECT lock_version, next_update_at
           FROM support_cases
          WHERE id = $1`,
        [supportIntake.supportCase.id],
      );
      const proposedNextUpdateAt = new Date(
        new Date(progressCaseBeforeDraft.rows[0].next_update_at).getTime()
          + (60 * 60 * 1000),
      ).toISOString();
      const yellowDraftResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/progress-updates`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-yellow-progress',
          },
          body: JSON.stringify({
            expectedVersion: Number(progressCaseBeforeDraft.rows[0].lock_version),
            recipientUserId: 'renter-a',
            firstName: 'Walid',
            progressSinceLastUpdate: 'Die technischen Eingangsdaten wurden geprüft.',
            openCheck: 'Die genaue Ursache der Anzeige wird noch abgeglichen.',
            userActionOrNoAction: 'Du musst aktuell nichts weiter tun.',
            provisionalImpactStatement:
              'Die bisherige vorläufige Auswirkung bleibt unverändert.',
            nextAction: 'Serverprotokoll und App-Version miteinander abgleichen.',
            nextUpdateAt: proposedNextUpdateAt,
          }),
        },
      );
      const yellowDraft = await yellowDraftResponse.json();
      assert.equal(yellowDraftResponse.status, 201, yellowDraft.error);
      assert.equal(yellowDraft.message.sendStatus, 'pending_approval');
      assert.equal(yellowDraft.message.approvalLevel, 'yellow_human_review');
      assert.equal(yellowDraft.progressUpdate.templateId, 'T-008');
      assert.equal(yellowDraft.progressUpdate.wasOverdue, false);
      assert.equal(yellowDraft.progressUpdate.proposalStatus, 'pending_review');

      const yellowReviewResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages/${yellowDraft.message.id}/review`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 'http-support-yellow-review',
          },
          body: JSON.stringify({
            outcome: 'approved',
            expectedVersion: yellowDraft.message.version,
            expectedPayloadSha256: yellowDraft.message.renderedContentSha256,
            reviewNotes: 'Wortlaut und bestätigte Falldaten wurden unabhängig geprüft.',
          }),
        },
      );
      assert.equal(yellowReviewResponse.status, 200);
      const yellowReview = await yellowReviewResponse.json();
      assert.equal(yellowReview.message.sendStatus, 'approved');
      assert.equal(yellowReview.message.reviewOutcome, 'approved');

      const directProgressPublication = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages/${yellowDraft.message.id}/publication`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-progress-direct-publication',
          },
          body: JSON.stringify({
            expectedVersion: yellowReview.message.version,
            expectedPayloadSha256: yellowReview.message.renderedContentSha256,
          }),
        },
      );
      assert.equal(directProgressPublication.status, 409);
      assert.equal(
        (await directProgressPublication.json()).error,
        'support_progress_update_publication_required',
      );

      const yellowPublishRequest = () => fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/progress-updates/${yellowDraft.progressUpdate.id}/publication`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-yellow-publication',
          },
          body: JSON.stringify({
            expectedProgressVersion:
              yellowDraft.progressUpdate.proposalVersion + 1,
            expectedMessageVersion: yellowReview.message.version,
            expectedPayloadSha256: yellowReview.message.renderedContentSha256,
          }),
        },
      );
      const yellowPublishResponse = await yellowPublishRequest();
      assert.equal(yellowPublishResponse.status, 200);
      const yellowPublish = await yellowPublishResponse.json();
      assert.equal(yellowPublish.message.sendStatus, 'sent');
      assert.equal(yellowPublish.message.externalMessageSent, false);
      assert.equal(yellowPublish.progressUpdate.proposalStatus, 'published');
      assert.equal(yellowPublish.supportCase.nextUpdateAt, proposedNextUpdateAt);
      const yellowPublishReplay = await yellowPublishRequest();
      assert.equal(yellowPublishReplay.status, 200);
      assert.equal((await yellowPublishReplay.json()).replayed, true);

      const overdueCaseState = await setupPool.query(
        `UPDATE support_cases
            SET next_update_at = GREATEST(
                  created_at + interval '1 millisecond',
                  clock_timestamp() - interval '1 millisecond'
                ),
                lock_version = lock_version + 1,
                updated_at = GREATEST(
                  clock_timestamp(),
                  updated_at + interval '1 microsecond'
                )
          WHERE id = $1
          RETURNING lock_version`,
        [supportIntake.supportCase.id],
      );
      const overdueNextUpdateAt = new Date(Date.now() + (2 * 60 * 60 * 1000))
        .toISOString();
      const overdueDraftResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/progress-updates`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-overdue-progress',
          },
          body: JSON.stringify({
            expectedVersion: Number(overdueCaseState.rows[0].lock_version),
            recipientUserId: 'renter-a',
            firstName: 'Walid',
            progressSinceLastUpdate:
              'Die Serverereignisse wurden weiter eingegrenzt.',
            openCheck: 'Die letzte Abweichung muss noch reproduziert werden.',
            userActionOrNoAction: 'Du musst im Moment nichts weiter tun.',
            provisionalImpactStatement:
              'Die bisherige vorläufige Auswirkung bleibt unverändert.',
            nextAction: 'Abweichung mit einem isolierten Test reproduzieren.',
            nextUpdateAt: overdueNextUpdateAt,
          }),
        },
      );
      assert.equal(overdueDraftResponse.status, 201);
      const overdueDraft = await overdueDraftResponse.json();
      assert.equal(overdueDraft.progressUpdate.templateId, 'T-010');
      assert.equal(overdueDraft.progressUpdate.wasOverdue, true);
      assert.match(overdueDraft.message.content, /kam nicht rechtzeitig/u);
      assert.match(overdueDraft.message.content, /Das tut uns leid/u);

      const overdueReviewResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages/${overdueDraft.message.id}/review`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 'http-support-overdue-review',
          },
          body: JSON.stringify({
            outcome: 'approved',
            expectedVersion: overdueDraft.message.version,
            expectedPayloadSha256: overdueDraft.message.renderedContentSha256,
            reviewNotes: 'Verspätung, Fortschritt und neuer Zeitpunkt wurden geprüft.',
          }),
        },
      );
      assert.equal(overdueReviewResponse.status, 200);
      const overdueReview = await overdueReviewResponse.json();
      const overduePublishResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/progress-updates/${overdueDraft.progressUpdate.id}/publication`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-overdue-publication',
          },
          body: JSON.stringify({
            expectedProgressVersion:
              overdueDraft.progressUpdate.proposalVersion + 1,
            expectedMessageVersion: overdueReview.message.version,
            expectedPayloadSha256: overdueReview.message.renderedContentSha256,
          }),
        },
      );
      assert.equal(overduePublishResponse.status, 200);
      const overduePublish = await overduePublishResponse.json();
      assert.equal(overduePublish.progressUpdate.proposalStatus, 'published');
      assert.equal(overduePublish.supportCase.nextUpdateAt, overdueNextUpdateAt);

      const correctionResponse = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}/messages`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-support-green-correction',
          },
          body: JSON.stringify({
            templateId: 'T-007',
            recipientUserId: 'renter-a',
            correctsMessageId: greenMessage.message.id,
            publishNow: true,
            variables: {
              first_name: 'Walid',
              evidence_request_list: 'Korrektur: Bitte ergänze App- und Betriebssystemversion.',
            },
          }),
        },
      );
      assert.equal(correctionResponse.status, 201);
      const correction = await correctionResponse.json();
      assert.equal(correction.message.correctedMessageId, greenMessage.message.id);
      await assert.rejects(
        setupPool.query(
          'UPDATE support_messages SET rendered_content = $2 WHERE id = $1',
          [greenMessage.message.id, 'Unzulässige nachträgliche Änderung'],
        ),
        (error) => error?.code === 'P0001'
          && error?.message === 'Support message payload is immutable',
      );
      const userMessageDetailResponse = await fetch(
        `${baseUrl}/v1/support/cases/${supportIntake.supportCase.id}`,
        { headers: renterAHeaders },
      );
      assert.equal(userMessageDetailResponse.status, 200);
      const userMessageDetail = await userMessageDetailResponse.json();
      assert.equal(userMessageDetail.messages.length, 4);
      assert.ok(userMessageDetail.messages.every((message) => (
        message.externalMessageSent === false
        && !Object.hasOwn(message, 'renderedContentSha256')
        && !Object.hasOwn(message, 'structuredVariables')
      )));
      assert.ok(userMessageDetail.messages.some((message) => (
        message.correctedMessageId === greenMessage.message.id
      )));
      await setupPool.query(
        `UPDATE support_cases
            SET current_owner_id = NULL,
                lock_version = lock_version + 1,
                updated_at = updated_at + interval '1 second'
          WHERE id = $1`,
        [supportIntake.supportCase.id],
      );
      await setupPool.query(
        `UPDATE support_cases
            SET created_at = now() - interval '2 hours',
                next_update_at = now() - interval '1 hour',
                lock_version = lock_version + 1,
                updated_at = GREATEST(
                  clock_timestamp(),
                  updated_at + interval '1 microsecond'
                )
          WHERE id = $1`,
        [p0BreakGlassCase.rows[0].id],
      );
      const watchdogFirst = await reconcileSupportDeadlinesWithClient(setupPool, {
        now: new Date(),
      });
      assert.equal(watchdogFirst.p0WithoutOwner, 1);
      assert.equal(watchdogFirst.nextUpdateOverdue, 1);
      assert.equal(watchdogFirst.alertsCreated, 2);
      const watchdogReplay = await reconcileSupportDeadlinesWithClient(setupPool, {
        now: new Date(),
      });
      assert.equal(watchdogReplay.alertsCreated, 0);
      const operationalAlertsResponse = await fetch(
        `${baseUrl}/v1/admin/support/operational-alerts`,
        { headers: adminHeaders },
      );
      assert.equal(operationalAlertsResponse.status, 200);
      assert.match(operationalAlertsResponse.headers.get('cache-control'), /no-store/u);
      const operationalAlerts = await operationalAlertsResponse.json();
      assert.equal(operationalAlerts.externalNotificationsSent, 0);
      assert.equal(operationalAlerts.alerts.length, 2);
      assert.ok(operationalAlerts.alerts.every((alert) => (
        alert.caseId === p0BreakGlassCase.rows[0].id
        && alert.externalNotificationSent === false
        && !Object.hasOwn(alert, 'structuredPayload')
      )));
      const supportMetricsForbidden = await fetch(
        `${baseUrl}/v1/admin/support/operational-metrics`,
        { headers: supportHeaders },
      );
      assert.equal(supportMetricsForbidden.status, 403);
      const supportMetricsResponse = await fetch(
        `${baseUrl}/v1/admin/support/operational-metrics`,
        { headers: adminHeaders },
      );
      assert.equal(supportMetricsResponse.status, 200);
      assert.match(supportMetricsResponse.headers.get('cache-control'), /no-store/u);
      const supportMetrics = (await supportMetricsResponse.json()).metrics;
      assert.equal(supportMetrics.definitionVersion, 'support-operational-metrics-v1');
      assert.equal(supportMetrics.privacy.aggregateOnly, true);
      assert.equal(supportMetrics.privacy.containsPersonalData, false);
      assert.equal(supportMetrics.privacy.externalAnalyticsSent, false);
      assert.ok(supportMetrics.lateUpdateRate.activeCases >= 1);
      assert.ok(
        supportMetrics.lateUpdateRate.activeCases
          >= supportMetrics.lateUpdateRate.overdueActiveCases,
      );
      assert.equal(JSON.stringify(supportMetrics).includes('caseNumber'), false);
      assert.equal(JSON.stringify(supportMetrics).includes('userId'), false);
      const unassignedP0WithoutGrant = await fetch(
        `${baseUrl}/v1/admin/support/cases/${p0BreakGlassCase.rows[0].id}`,
        { headers: supportHeaders },
      );
      assert.equal(unassignedP0WithoutGrant.status, 404);
      assert.equal(
        (await unassignedP0WithoutGrant.json()).error,
        'support_case_not_found',
      );
      const breakGlassWithoutReason = await fetch(
        `${baseUrl}/v1/admin/support/cases/${p0BreakGlassCase.rows[0].id}/break-glass`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-break-glass-missing-reason',
          },
          body: '{}',
        },
      );
      assert.equal(breakGlassWithoutReason.status, 400);
      assert.equal(
        (await breakGlassWithoutReason.json()).error,
        'support_break_glass_reason_required',
      );
      const nonP0BreakGlass = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportCase.rows[0].id}/break-glass`,
        {
          method: 'POST',
          headers: {
            ...supportHeaders,
            'Idempotency-Key': 'http-break-glass-non-p0',
          },
          body: JSON.stringify({
            reasonCode: 'p0_incident_containment',
            justification: 'This closed non-P0 case must remain unavailable.',
          }),
        },
      );
      assert.equal(nonP0BreakGlass.status, 404);
      assert.equal(
        (await nonP0BreakGlass.json()).error,
        'support_break_glass_unavailable',
      );
      const breakGlassHeaders = {
        ...supportHeaders,
        'Idempotency-Key': 'http-break-glass-valid',
      };
      const createBreakGlass = () => fetch(
        `${baseUrl}/v1/admin/support/cases/${p0BreakGlassCase.rows[0].id}/break-glass`,
        {
          method: 'POST',
          headers: breakGlassHeaders,
          body: JSON.stringify({
            reasonCode: 'p0_immediate_safety_response',
            justification: 'Immediate synthetic P0 case access is required for this integration test.',
          }),
        },
      );
      const breakGlassResponse = await createBreakGlass();
      assert.equal(breakGlassResponse.status, 201);
      assert.match(breakGlassResponse.headers.get('cache-control'), /no-store/u);
      const breakGlass = await breakGlassResponse.json();
      assert.equal(breakGlass.replayed, false);
      assert.equal(breakGlass.grant.caseId, p0BreakGlassCase.rows[0].id);
      assert.equal(breakGlass.grant.reviewStatus, 'pending');
      assert.equal(typeof breakGlass.token, 'string');
      assert.equal(breakGlass.token.length, 43);
      const breakGlassReplayResponse = await createBreakGlass();
      assert.equal(breakGlassReplayResponse.status, 200);
      const breakGlassReplay = await breakGlassReplayResponse.json();
      assert.equal(breakGlassReplay.replayed, true);
      assert.equal(breakGlassReplay.token, breakGlass.token);
      const p0WithGrant = await fetch(
        `${baseUrl}/v1/admin/support/cases/${p0BreakGlassCase.rows[0].id}`,
        { headers: { ...supportHeaders, 'X-Support-Break-Glass': breakGlass.token } },
      );
      assert.equal(p0WithGrant.status, 200);
      assert.equal(
        (await p0WithGrant.json()).supportCase.id,
        p0BreakGlassCase.rows[0].id,
      );
      const crossCaseBreakGlass = await fetch(
        `${baseUrl}/v1/admin/support/cases/${supportIntake.supportCase.id}`,
        { headers: { ...supportHeaders, 'X-Support-Break-Glass': breakGlass.token } },
      );
      assert.equal(crossCaseBreakGlass.status, 404);
      const supportCannotReviewBreakGlass = await fetch(
        `${baseUrl}/v1/admin/support/break-glass/reviews`,
        { headers: supportHeaders },
      );
      assert.equal(supportCannotReviewBreakGlass.status, 403);
      assert.equal(
        (await supportCannotReviewBreakGlass.json()).error,
        'admin_role_required',
      );
      const pendingBreakGlassReviews = await fetch(
        `${baseUrl}/v1/admin/support/break-glass/reviews?status=pending`,
        { headers: adminHeaders },
      );
      assert.equal(pendingBreakGlassReviews.status, 200);
      const pendingBreakGlass = (await pendingBreakGlassReviews.json()).reviews;
      assert.ok(pendingBreakGlass.some((entry) => entry.id === breakGlass.grant.id));
      const earlyBreakGlassReview = await fetch(
        `${baseUrl}/v1/admin/support/break-glass/grants/${breakGlass.grant.id}/review`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 'http-break-glass-review-too-early',
          },
          body: JSON.stringify({
            outcome: 'appropriate',
            notes: 'The independent review cannot complete before the access window expires.',
          }),
        },
      );
      assert.equal(earlyBreakGlassReview.status, 409);
      assert.equal(
        (await earlyBreakGlassReview.json()).error,
        'support_break_glass_review_not_due',
      );
      const breakGlassAudit = await setupPool.query(
        `SELECT action FROM audit_log
          WHERE resource_id = $1
            AND action IN (
              'support.break_glass_grant_denied',
              'support.break_glass_grant_created',
              'support.break_glass_case_accessed'
            )
          ORDER BY action`,
        [p0BreakGlassCase.rows[0].id],
      );
      assert.deepEqual(
        [...new Set(breakGlassAudit.rows.map((row) => row.action))],
        [
          'support.break_glass_case_accessed',
          'support.break_glass_grant_created',
          'support.break_glass_grant_denied',
        ],
      );
      const supportPilotCockpit = await fetch(
        `${baseUrl}/v1/admin/pilot-cockpit?from=2026-01-01&to=2027-01-01`,
        { headers: supportHeaders },
      );
      assert.equal(supportPilotCockpit.status, 403);
      assert.equal((await supportPilotCockpit.json()).error, 'admin_role_required');
      const pilotCockpitResponse = await fetch(
        `${baseUrl}/v1/admin/pilot-cockpit?from=2026-01-01&to=2027-01-01`,
        { headers: adminHeaders },
      );
      assert.equal(pilotCockpitResponse.status, 200);
      assert.match(pilotCockpitResponse.headers.get('cache-control'), /private/u);
      assert.match(pilotCockpitResponse.headers.get('cache-control'), /no-store/u);
      const pilotCockpit = (await pilotCockpitResponse.json()).cockpit;
      assert.equal(pilotCockpit.access.role, 'admin');
      assert.equal(pilotCockpit.access.readOnly, true);
      assert.equal(pilotCockpit.currencyAggregation, 'separate-no-fx');
      assert.equal(pilotCockpit.profitability, 'undetermined');
      assert.equal(pilotCockpit.privacy.aggregateOnly, true);
      assert.equal(pilotCockpit.privacy.containsUserIdentity, false);
      assert.equal(pilotCockpit.projectFunnel.reservationOrHoldCreatedByCart, false);
      assert.equal(pilotCockpit.founderIndependence.totalMinutes.value, null);
      assert.equal(
        pilotCockpit.operationalDelegation.state,
        'hold-external-role-assignments',
      );
      assert.equal(pilotCockpit.operationalDelegation.processes.length, 4);
      assert.equal(
        pilotCockpit.operationalDelegation.reportingSeparation.blended,
        false,
      );
      assert.doesNotMatch(
        JSON.stringify(pilotCockpit),
        /owner@example\.com|renter-a@example\.com|admin@example\.com/u,
      );
      const supportUsers = await fetch(`${baseUrl}/v1/admin/users`, { headers: supportHeaders });
      assert.equal(supportUsers.status, 200);
      assert.ok((await supportUsers.json()).users.every((user) => !Object.hasOwn(user, 'email')));

      s4jServer = http.createServer(createApp());
      await new Promise((resolve) => s4jServer.listen(0, '127.0.0.1', resolve));
      const s4jBaseUrl = `http://127.0.0.1:${s4jServer.address().port}`;

      const genericHarassmentReport = await fetch(`${s4jBaseUrl}/v1/reports`, {
        method: 'POST',
        headers: {
          ...renterBHeaders,
          'Idempotency-Key': 's4j-generic-path-blocked',
        },
        body: JSON.stringify({
          targetType: 'user',
          targetId: 's4j-target',
          reasonCode: 'harassment',
        }),
      });
      assert.equal(genericHarassmentReport.status, 409);
      assert.equal(
        (await genericHarassmentReport.json()).error,
        'harassment_requires_block_report_path',
      );

      const acuteHarassmentReport = await fetch(
        `${s4jBaseUrl}/v1/reports/harassment-block`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': 's4j-acute-safety-path',
          },
          body: JSON.stringify({
            targetUserId: 's4j-target',
            immediateDanger: true,
          }),
        },
      );
      assert.equal(acuteHarassmentReport.status, 409);
      assert.equal(
        (await acuteHarassmentReport.json()).error,
        'immediate_danger_requires_safety_path',
      );

      const clientOwnedPriority = await fetch(
        `${s4jBaseUrl}/v1/reports/harassment-block`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': 's4j-client-priority-blocked',
          },
          body: JSON.stringify({
            targetUserId: 's4j-target',
            immediateDanger: false,
            priority: 'urgent',
          }),
        },
      );
      assert.equal(clientOwnedPriority.status, 400);
      assert.equal(
        (await clientOwnedPriority.json()).error,
        'invalid_harassment_block_report_fields',
      );

      const rolledBackHarassmentReport = await fetch(
        `${s4jBaseUrl}/v1/reports/harassment-block`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': 's4j-atomic-rollback',
          },
          body: JSON.stringify({
            targetUserId: 'suspended',
            immediateDanger: false,
          }),
        },
      );
      assert.equal(rolledBackHarassmentReport.status, 404);
      assert.equal((await rolledBackHarassmentReport.json()).error, 'user_not_found');
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM reports
          WHERE reporter_id = 'renter-b'
            AND target_type = 'user'
            AND target_id = 'suspended'`,
      )).rows[0].count, 0);

      const createHarassmentBlockReport = (
        idempotencyKey = 's4j-non-acute-atomic',
      ) => fetch(
        `${s4jBaseUrl}/v1/reports/harassment-block`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            targetUserId: 's4j-target',
            immediateDanger: false,
            details: 'Kontrollierter nicht-akuter Integrationsfall.',
            reference: 'S4J-SUP-094',
          }),
        },
      );
      const harassmentResponse = await createHarassmentBlockReport();
      assert.equal(harassmentResponse.status, 201);
      assert.equal(harassmentResponse.headers.get('cache-control'), 'private, no-store');
      const harassmentResult = await harassmentResponse.json();
      assert.equal(harassmentResult.report.reasonCode, 'harassment');
      assert.equal(harassmentResult.report.priority, 'normal');
      assert.equal(harassmentResult.report.status, 'open');
      assert.deepEqual(harassmentResult.protection, {
        directContactBlocked: true,
        neutralReviewRequired: true,
        guiltDetermined: false,
        moderationAccountMeasureTaken: false,
        externalActionTaken: false,
      });
      const harassmentPersistence = await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM reports
             WHERE reporter_id = 'renter-b'
               AND target_type = 'user'
               AND target_id = 's4j-target'
               AND reason_code = 'harassment') AS reports,
           (SELECT count(*)::int FROM user_blocks
             WHERE blocker_id = 'renter-b'
               AND blocked_id = 's4j-target'
               AND unblocked_at IS NULL) AS blocks,
           (SELECT count(*)::int FROM audit_log
             WHERE actor_id = 'renter-b'
               AND action = 'report.harassment_blocked_for_reporter') AS receipts`,
      );
      assert.deepEqual(harassmentPersistence.rows[0], {
        reports: 1,
        blocks: 1,
        receipts: 1,
      });
      const harassmentAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
          WHERE actor_id = 'renter-b'
            AND action = 'report.harassment_blocked_for_reporter'`,
      );
      assert.deepEqual(harassmentAudit.rows[0].metadata, {
        reasonCode: 'harassment',
        immediateDanger: false,
        directContactBlocked: true,
        neutralReviewRequired: true,
        guiltDetermined: false,
        moderationAccountMeasureTaken: false,
        externalActionTaken: false,
        requestFingerprint: harassmentAudit.rows[0].metadata.requestFingerprint,
      });
      assert.match(
        harassmentAudit.rows[0].metadata.requestFingerprint,
        /^[0-9a-f]{64}$/u,
      );

      const replayedHarassmentResponse = await createHarassmentBlockReport();
      assert.equal(replayedHarassmentResponse.status, 200);
      assert.equal((await replayedHarassmentResponse.json()).replayed, true);
      const semanticHarassmentReplay = await createHarassmentBlockReport(
        's4j-non-acute-semantic-replay',
      );
      assert.equal(semanticHarassmentReplay.status, 200);
      assert.equal((await semanticHarassmentReplay.json()).replayed, true);
      assert.deepEqual((await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM reports
             WHERE reporter_id = 'renter-b'
               AND target_id = 's4j-target'
               AND reason_code = 'harassment') AS reports,
           (SELECT count(*)::int FROM user_blocks
             WHERE blocker_id = 'renter-b'
               AND blocked_id = 's4j-target'
               AND unblocked_at IS NULL) AS blocks,
           (SELECT count(*)::int FROM audit_log
             WHERE actor_id = 'renter-b'
               AND action = 'report.harassment_blocked_for_reporter') AS receipts`,
      )).rows[0], { reports: 1, blocks: 1, receipts: 1 });

      const conflictingHarassmentReplay = await fetch(
        `${s4jBaseUrl}/v1/reports/harassment-block`,
        {
          method: 'POST',
          headers: {
            ...renterBHeaders,
            'Idempotency-Key': 's4j-non-acute-atomic',
          },
          body: JSON.stringify({
            targetUserId: 's4j-target',
            immediateDanger: false,
            details: 'Abweichender Payload.',
            reference: 'S4J-SUP-094',
          }),
        },
      );
      assert.equal(conflictingHarassmentReplay.status, 409);
      assert.equal(
        (await conflictingHarassmentReplay.json()).error,
        'harassment_block_report_idempotency_conflict',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO audit_log (
             actor_id, actor_role, action, resource_type, resource_id,
             request_id, metadata
           ) VALUES (
             'renter-b', 'user', 'report.harassment_blocked_for_reporter',
             'report', $1, 'report.harassment_block:s4j-forged', $2::jsonb
           )`,
          [
            harassmentResult.report.id,
            JSON.stringify({
              reasonCode: 'harassment',
              immediateDanger: false,
              directContactBlocked: false,
              neutralReviewRequired: true,
              guiltDetermined: false,
              moderationAccountMeasureTaken: false,
              externalActionTaken: false,
              requestFingerprint: 'a'.repeat(64),
            }),
          ],
        ),
        (error) => error?.code === '23514'
          && error?.message === 'harassment block-report audit must remain exact and neutral',
      );

      const reportEvidenceForm = new FormData();
      reportEvidenceForm.append('purpose', 'report_evidence');
      reportEvidenceForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'evidence.jpg');
      const reportEvidenceResponse = await fetch(`${baseUrl}/v1/uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('renter-a')}` },
        body: reportEvidenceForm,
      });
      assert.equal(reportEvidenceResponse.status, 201);
      const reportEvidence = await reportEvidenceResponse.json();
      const createB9Report = await fetch(`${baseUrl}/v1/reports`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b9-create-listing-report' },
        body: JSON.stringify({
          targetType: 'listing',
          targetId: 'listing-1',
          reasonCode: 'suspected_misrepresentation',
          priority: 'high',
          details: 'Controlled B9 moderation evidence',
          evidenceUploadIds: [reportEvidence.id],
        }),
      });
      assert.equal(createB9Report.status, 201);
      const b9Report = (await createB9Report.json()).report;
      assert.equal(b9Report.status, 'open');
      const activeReportReplay = await fetch(`${baseUrl}/v1/reports`, {
        method: 'POST',
        headers: { ...renterAHeaders, 'Idempotency-Key': 'b9-create-listing-report-replay' },
        body: JSON.stringify({
          targetType: 'listing', targetId: 'listing-1',
          reasonCode: 'suspected_misrepresentation', priority: 'high',
        }),
      });
      assert.equal(activeReportReplay.status, 200);
      assert.equal((await activeReportReplay.json()).replayed, true);

      const supportTriage = await fetch(`${baseUrl}/v1/admin/reports/${b9Report.id}`, {
        method: 'PATCH',
        headers: { ...supportHeaders, 'Idempotency-Key': 'b9-support-triage' },
        body: JSON.stringify({ status: 'triaged', assignedTo: 'support', note: 'Evidence received' }),
      });
      assert.equal(supportTriage.status, 200);
      const forbiddenSupportAction = await fetch(`${baseUrl}/v1/admin/reports/${b9Report.id}`, {
        method: 'PATCH',
        headers: { ...supportHeaders, 'Idempotency-Key': 'b9-support-action-forbidden' },
        body: JSON.stringify({ status: 'actioned', resolution: { outcome: 'hidden' } }),
      });
      assert.equal(forbiddenSupportAction.status, 409);
      assert.equal((await forbiddenSupportAction.json()).error, 'invalid_report_transition');
      const adminInvestigate = await fetch(`${baseUrl}/v1/admin/reports/${b9Report.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-admin-investigate' },
        body: JSON.stringify({ status: 'investigating', assignedTo: 'admin', note: 'Admin verification' }),
      });
      assert.equal(adminInvestigate.status, 200);
      const adminAction = await fetch(`${baseUrl}/v1/admin/reports/${b9Report.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-admin-action' },
        body: JSON.stringify({
          status: 'actioned',
          reasonCode: 'documented_policy_violation',
          resolution: { outcome: 'listing_temporarily_hidden' },
          decision: {
            facts: 'Controlled integration evidence confirms the report target and policy breach.',
            basis: 'Controlled marketplace moderation policy fixture.',
            reasoning: 'The verified fixture requires a temporary reversible listing restriction.',
            detectionMethod: 'human',
          },
        }),
      });
      assert.equal(adminAction.status, 200);
      assert.equal((await adminAction.json()).report.status, 'actioned');

      const reportDetails = await fetch(`${baseUrl}/v1/admin/reports/${b9Report.id}`, { headers: adminHeaders });
      assert.equal(reportDetails.status, 200);
      const reportDetailsPayload = (await reportDetails.json()).report;
      assert.equal(reportDetailsPayload.evidence.length, 1);
      assert.ok(reportDetailsPayload.events.length >= 4);
      const staffEvidence = await fetch(`${baseUrl}/v1/admin/evidence/${reportEvidence.id}`, { headers: adminHeaders });
      assert.equal(staffEvidence.status, 200);
      assert.equal(staffEvidence.headers.get('cache-control'), 'private, no-store');
      assert.ok((await staffEvidence.arrayBuffer()).byteLength > 0);

      const hideListing = await fetch(`${baseUrl}/v1/admin/listings/listing-1/moderation`, {
        method: 'PATCH',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-hide-listing' },
        body: JSON.stringify({
          status: 'hidden', reportId: b9Report.id,
          reasonCode: 'documented_policy_violation', note: 'Temporary reversible measure',
          decision: humanStatementDecision({
            facts: 'Controlled listing evidence confirms the documented policy violation.',
            basis: 'Controlled marketplace listing policy fixture.',
            reasoning: 'The verified fixture requires a temporary, reversible visibility restriction.',
          }),
        }),
      });
      assert.equal(hideListing.status, 200);
      assert.equal((await hideListing.json()).status, 'hidden');
      assert.deepEqual((await fetch(`${baseUrl}/v1/listings?q=Camera`).then((response) => response.json())).listings, []);
      const ownerCannotRepublish = await fetch(`${baseUrl}/v1/listings/listing-1/status`, {
        method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ status: 'active' }),
      });
      assert.equal(ownerCannotRepublish.status, 404);
      const restoreListing = await fetch(`${baseUrl}/v1/admin/listings/listing-1/moderation`, {
        method: 'PATCH',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-restore-listing' },
        body: JSON.stringify({
          status: 'active', reportId: b9Report.id,
          reasonCode: 'verification_completed', note: 'Restriction reversed',
          decision: humanStatementDecision({
            facts: 'Controlled follow-up verification confirms the temporary restriction can end.',
            basis: 'Controlled marketplace verification-completion fixture.',
            reasoning: 'The follow-up fixture supports restoring the listing to its prior active state.',
            durationType: 'not_applicable',
          }),
        }),
      });
      assert.equal(restoreListing.status, 200);
      assert.equal((await restoreListing.json()).status, 'active');
      assert.equal((await fetch(`${baseUrl}/v1/listings?q=Camera`).then((response) => response.json())).listings.length, 1);

      const ownerReportOutsider = await fetch(`${baseUrl}/v1/reports`, {
        method: 'POST',
        headers: { ...ownerHeaders, 'Idempotency-Key': 'b9-owner-report-outsider' },
        body: JSON.stringify({ targetType: 'user', targetId: 'outsider', reasonCode: 'controlled_scope_probe' }),
      });
      assert.equal(ownerReportOutsider.status, 201);
      const outsiderReportId = (await ownerReportOutsider.json()).report.id;
      const suspendBooking = await fetch(`${baseUrl}/v1/admin/users/outsider/suspensions`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-suspend-outsider-booking' },
        body: JSON.stringify({
          scope: 'booking', reportId: outsiderReportId,
          reasonCode: 'controlled_scope_probe', note: 'Temporary integration restriction',
          decision: humanStatementDecision({
            facts: 'Controlled account evidence confirms the booking-scope integration condition.',
            basis: 'Controlled booking-scope moderation fixture.',
            reasoning: 'The fixture requires a temporary booking-only restriction for the test subject.',
          }),
        }),
      });
      assert.equal(suspendBooking.status, 201);
      const suspension = (await suspendBooking.json()).suspension;
      const suspendedQuote = await fetch(`${baseUrl}/v1/bookings/quote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: 'listing-1', startDate: '2027-02-01', endDate: '2027-02-03' }),
      });
      assert.equal(suspendedQuote.status, 403);
      assert.equal((await suspendedQuote.json()).error, 'action_blocked_by_moderation');
      const liftBooking = await fetch(`${baseUrl}/v1/admin/suspensions/${suspension.id}/lift`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Idempotency-Key': 'b9-lift-outsider-booking' },
        body: JSON.stringify({
          reasonCode: 'controlled_probe_complete',
          decision: humanStatementDecision({
            facts: 'Controlled follow-up evidence confirms the booking-scope probe is complete.',
            basis: 'Controlled moderation-reversal fixture.',
            reasoning: 'The completed probe no longer supports keeping the temporary restriction.',
            durationType: 'not_applicable',
          }),
        }),
      });
      assert.equal(liftBooking.status, 200);
      assert.equal((await fetch(`${baseUrl}/v1/bookings/quote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: 'listing-1', startDate: '2027-02-01', endDate: '2027-02-03' }),
      })).status, 200);

      const ownerDecisionResponse = await fetch(
        `${baseUrl}/v1/moderation/decisions`,
        { headers: ownerHeaders },
      );
      assert.equal(ownerDecisionResponse.status, 200);
      assert.equal(ownerDecisionResponse.headers.get('cache-control'), 'private, no-store');
      const ownerDecisions = (await ownerDecisionResponse.json()).decisions;
      const listingStatements = ownerDecisions
        .filter((decision) => decision.targetType === 'listing')
        .map((decision) => decision.statementOfReasons);
      assert.equal(listingStatements.length, 2);
      assert.deepEqual(
        new Set(listingStatements.map((statement) => statement.durationType)),
        new Set(['until_reversed', 'not_applicable']),
      );
      assert.ok(listingStatements.every((statement) =>
        statement.version === 'sit_dsa_statement_of_reasons_v1'
          && statement.humanReviewed === true
          && statement.reviewChannel === 'authenticated_in_app'));

      const outsiderDecisionResponse = await fetch(
        `${baseUrl}/v1/moderation/decisions`,
        { headers: { Authorization: `Bearer ${tokenFor('outsider')}` } },
      );
      assert.equal(outsiderDecisionResponse.status, 200);
      assert.equal(
        outsiderDecisionResponse.headers.get('cache-control'),
        'private, no-store',
      );
      const outsiderDecisions = (await outsiderDecisionResponse.json()).decisions;
      const suspensionDecision = outsiderDecisions.find(
        (decision) => decision.measureType === 'scope_suspension',
      );
      assert.ok(suspensionDecision);
      const requestDecisionReview = await fetch(
        `${baseUrl}/v1/moderation/decisions/${suspensionDecision.id}/review`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenFor('outsider')}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': 's3p-review-suspension-decision',
          },
          body: JSON.stringify({
            reason: 'Controlled request for a fresh human review.',
          }),
        },
      );
      assert.equal(requestDecisionReview.status, 201);
      assert.equal(
        requestDecisionReview.headers.get('cache-control'),
        'private, no-store',
      );
      assert.equal(
        (await requestDecisionReview.json()).reviewRequest.status,
        'submitted',
      );

      const hideForIndependentReview = await fetch(
        `${baseUrl}/v1/admin/listings/listing-1/moderation`,
        {
          method: 'PATCH',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3q-hide-listing-for-review',
          },
          body: JSON.stringify({
            status: 'hidden',
            reasonCode: 'controlled_independent_review_probe',
            note: 'Controlled restriction for independent review.',
            decision: humanStatementDecision({
              facts: 'Controlled listing evidence triggered the independent-review fixture.',
              basis: 'Controlled independent-review integration fixture.',
              reasoning: 'The fixture temporarily hides the listing for a reversible review test.',
            }),
          }),
        },
      );
      assert.equal(hideForIndependentReview.status, 200);
      const restrictedDecision = (await hideForIndependentReview.json()).decision;
      const requestListingReview = await fetch(
        `${baseUrl}/v1/moderation/decisions/${restrictedDecision.id}/review`,
        {
          method: 'POST',
          headers: {
            ...ownerHeaders,
            'Idempotency-Key': 's3q-review-listing-decision',
          },
          body: JSON.stringify({
            reason: 'Controlled request to verify and reverse the fixture restriction.',
          }),
        },
      );
      assert.equal(requestListingReview.status, 201);
      const listingReview = (await requestListingReview.json()).reviewRequest;

      const supportReviewQueue = await fetch(
        `${baseUrl}/v1/admin/moderation/reviews`,
        { headers: supportHeaders },
      );
      assert.equal(supportReviewQueue.status, 403);
      assert.equal((await supportReviewQueue.json()).error, 'admin_role_required');
      const issuerClaim = await fetch(
        `${baseUrl}/v1/admin/moderation/reviews/${listingReview.id}/claim`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Idempotency-Key': 's3q-issuer-claim-forbidden',
          },
        },
      );
      assert.equal(issuerClaim.status, 409);
      assert.equal(
        (await issuerClaim.json()).error,
        'moderation_review_independent_reviewer_required',
      );

      const reviewerHeaders = {
        Authorization: `Bearer ${tokenFor('admin-reviewer')}`,
        'Content-Type': 'application/json',
      };
      const reviewerElevation = await fetch(`${baseUrl}/v1/admin/step-up`, {
        method: 'POST',
        headers: reviewerHeaders,
        body: JSON.stringify({ currentPassword: reviewerPassword }),
      });
      assert.equal(reviewerElevation.status, 200);
      reviewerHeaders['X-Admin-Step-Up'] =
        (await reviewerElevation.json()).elevation.token;

      const reviewerQueue = await fetch(
        `${baseUrl}/v1/admin/moderation/reviews`,
        { headers: reviewerHeaders },
      );
      assert.equal(reviewerQueue.status, 200);
      const queuedListingReview = (await reviewerQueue.json()).reviewRequests
        .find((review) => review.id === listingReview.id);
      assert.equal(queuedListingReview.canClaim, true);
      assert.equal(
        queuedListingReview.originalDecision.measureState,
        'hidden',
      );
      const claimListingReview = await fetch(
        `${baseUrl}/v1/admin/moderation/reviews/${listingReview.id}/claim`,
        {
          method: 'POST',
          headers: {
            ...reviewerHeaders,
            'Idempotency-Key': 's3q-independent-claim',
          },
        },
      );
      assert.equal(claimListingReview.status, 201);
      assert.equal(
        (await claimListingReview.json()).reviewRequest.status,
        'in_review',
      );
      const resolveListingReview = await fetch(
        `${baseUrl}/v1/admin/moderation/reviews/${listingReview.id}/resolve`,
        {
          method: 'POST',
          headers: {
            ...reviewerHeaders,
            'Idempotency-Key': 's3q-independent-resolution',
          },
          body: JSON.stringify({
            status: 'reversed',
            userFacingReason:
              'Die erneute menschliche Prüfung bestätigt die Wiederherstellung der Anzeige.',
            correction: {
              targetStatus: 'active',
              reasonCode: 'controlled_independent_review_correction',
              note: 'Controlled independent correction.',
              decision: humanStatementDecision({
                facts: 'The independent human review found the fixture restriction unsupported.',
                basis: 'Controlled independent-review integration fixture.',
                reasoning: 'The listing must be restored because the controlled restriction was intentionally reversible.',
                durationType: 'not_applicable',
              }),
            },
          }),
        },
      );
      assert.equal(resolveListingReview.status, 200);
      const resolvedListingReview = await resolveListingReview.json();
      assert.equal(resolvedListingReview.measureChanged, true);
      assert.equal(resolvedListingReview.correction.targetState, 'active');
      assert.equal(
        resolvedListingReview.reviewRequest.resolutionDetails.independent,
        true,
      );
      assert.equal(
        resolvedListingReview.reviewRequest.resolutionDetails.automationRole,
        'none',
      );
      assert.equal(
        (await setupPool.query(
          `SELECT moderation_status FROM listings WHERE id = 'listing-1'`,
        )).rows[0].moderation_status,
        'active',
      );
      const ownerReviewedDecisions = await fetch(
        `${baseUrl}/v1/moderation/decisions`,
        { headers: ownerHeaders },
      );
      const reviewedOriginalDecision =
        (await ownerReviewedDecisions.json()).decisions
          .find((decision) => decision.id === restrictedDecision.id);
      assert.equal(reviewedOriginalDecision.reviewRequest.status, 'reversed');
      assert.equal(
        reviewedOriginalDecision.reviewRequest.resolutionDetails.measureChanged,
        true,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE moderation_review_resolutions
              SET user_facing_reason = 'Mutated resolution'
            WHERE review_request_id = $1`,
          [listingReview.id],
        ),
        /append-only/u,
      );

      await assert.rejects(
        setupPool.query(
          `INSERT INTO moderation_decisions (
             recipient_user_id, target_type, target_id, measure_type,
             measure_state, facts, basis, reasoning, detection_method,
             review_available, review_deadline_at, issued_by, idempotency_key
           ) VALUES (
             'owner', 'listing', 'listing-1', 'listing_restriction',
             'hidden', 'Missing Statement probe', 'Controlled basis',
             'Controlled reasoning', 'human', true, now() + interval '6 months',
             'admin', 'moderation.decision:s3p-missing-statement-probe'
           )`,
        ),
        /moderation_statement_of_reasons_required/u,
      );
      const immutableStatement = await setupPool.query(
        `SELECT moderation_decision_id
           FROM moderation_statements_of_reasons
          ORDER BY created_at LIMIT 1`,
      );
      assert.equal(immutableStatement.rowCount, 1);
      await assert.rejects(
        setupPool.query(
          `UPDATE moderation_statements_of_reasons
              SET territorial_scope = 'Mutated scope'
            WHERE moderation_decision_id = $1`,
          [immutableStatement.rows[0].moderation_decision_id],
        ),
        /append-only/u,
      );

      assert.equal((await fetch(`${baseUrl}/v1/user-blocks/owner`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reasonCode: 'controlled_block_probe' }),
      })).status, 204);
      const blockQuote = await fetch(`${baseUrl}/v1/bookings/quote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: 'listing-1', startDate: '2027-03-01', endDate: '2027-03-03' }),
      });
      assert.equal(blockQuote.status, 409);
      assert.equal((await blockQuote.json()).error, 'booking_blocked_by_user_block');
      assert.equal((await fetch(`${baseUrl}/v1/user-blocks/owner`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenFor('outsider')}` },
      })).status, 204);

      const renterReview = await fetch(`${baseUrl}/v1/bookings/b6-flow/reviews`, {
        method: 'POST',
        headers: renterAHeaders,
        body: JSON.stringify({
          direction: 'renter_to_owner',
          criteria: [
            { key: 'communication', stars: 5, note: 'Clear' },
            { key: 'reliability', stars: 4 },
            { key: 'article_as_described', stars: 5 },
            { key: 'handover_return', stars: 4 },
          ],
        }),
      });
      assert.equal(renterReview.status, 201);
      assert.equal((await renterReview.json()).review.rating, 4.5);
      const ownerReview = await fetch(`${baseUrl}/v1/bookings/b6-flow/reviews`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          direction: 'owner_to_renter',
          criteria: [
            { key: 'communication', stars: 4 },
            { key: 'reliability', stars: 5 },
            { key: 'article_as_described', stars: 4 },
            { key: 'handover_return', stars: 5 },
          ],
        }),
      });
      assert.equal(ownerReview.status, 201);
      const duplicateReview = await fetch(`${baseUrl}/v1/bookings/b6-flow/reviews`, {
        method: 'POST',
        headers: renterAHeaders,
        body: JSON.stringify({
          direction: 'renter_to_owner',
          criteria: [
            { key: 'communication', stars: 5 }, { key: 'reliability', stars: 4 },
            { key: 'article_as_described', stars: 5 }, { key: 'handover_return', stars: 4 },
          ],
        }),
      });
      assert.equal(duplicateReview.status, 200);
      assert.equal((await duplicateReview.json()).replayed, true);
      const ownerPublicReviews = await fetch(`${baseUrl}/v1/users/owner/reviews`);
      assert.equal(ownerPublicReviews.status, 200);
      assert.equal((await ownerPublicReviews.json()).reviews[0].rating, 4.5);
      const outsiderReview = await fetch(`${baseUrl}/v1/bookings/b6-flow/reviews`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenFor('outsider')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ direction: 'owner_to_renter', criteria: [] }),
      });
      assert.equal(outsiderReview.status, 400);

      const b9Overview = await fetch(`${baseUrl}/v1/admin/overview`, { headers: adminHeaders });
      assert.equal(b9Overview.status, 200);
      assert.ok((await b9Overview.json()).overview.activeReports >= 2);
      const moderationAudit = await fetch(`${baseUrl}/v1/admin/audit?limit=500`, { headers: adminHeaders });
      assert.equal(moderationAudit.status, 200);
      assert.ok((await moderationAudit.json()).audit.some((entry) => entry.action === 'moderation.listing_status_changed'));
      await assert.rejects(
        setupPool.query('UPDATE moderation_case_events SET note = \'tampered\' WHERE report_id = $1', [b9Report.id]),
        (error) => error?.code === '55000',
      );

      await setupPool.query(
        `INSERT INTO messages (
           id, thread_id, sender_id, sender_type, body, is_read, created_at
         ) VALUES
           ('s3t-location-owner', 'thread-1', 'owner', 'user', $1, false, now()),
           ('s3t-location-renter', 'thread-1', 'renter-a', 'user', $2, false,
             now() + interval '1 millisecond')`,
        [
          '📍 LOCATION_SHARE|Übergabe|52.501|13.401|https://maps.example/owner|handover|Eigenweg 7, 10115 Berlin|Owner',
          '📍 LOCATION_SHARE|Rückgabe|52.502|13.402|https://maps.example/renter|return|Fremdweg 9, 10117 Berlin|Renter A',
        ],
      );
      const legacyGetExport = await fetch(`${baseUrl}/v1/account/export`, {
        headers: ownerHeaders,
      });
      assert.equal(legacyGetExport.status, 404);
      await restartApplicationServer();
      const forgedExportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ currentPassword: ownerPassword, userId: 'renter-a' }),
      });
      assert.equal(forgedExportResponse.status, 400);
      assert.equal((await forgedExportResponse.json()).error, 'account_export_request_invalid');
      const wrongPasswordExportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          currentPassword: createEphemeralAcceptancePassword(),
        }),
      });
      assert.equal(wrongPasswordExportResponse.status, 401);
      assert.equal((await wrongPasswordExportResponse.json()).error, 'invalid_credentials');
      const exportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: 'POST',
        headers: {
          ...ownerHeaders,
          'X-Request-ID': 'b10-owner-export',
        },
        body: JSON.stringify({ currentPassword: ownerPassword }),
      });
      assert.equal(exportResponse.status, 200);
      assert.equal(exportResponse.headers.get('x-request-id'), 'b10-owner-export');
      assert.match(exportResponse.headers.get('cache-control'), /private/);
      assert.match(exportResponse.headers.get('cache-control'), /no-store/);
      assert.match(
        exportResponse.headers.get('content-disposition'),
        /shareittoo-data-export\.json/,
      );
      const accountExport = await exportResponse.json();
      assert.equal(accountExport.schemaVersion, '1.0');
      assert.equal(accountExport.accountId, 'owner');
      assert.equal(accountExport.data.account.email, 'owner@example.com');
      assert.ok(accountExport.data.marketplace.listings.some((entry) => entry.id === 'listing-1'));
      assert.ok(accountExport.data.marketplace.bookings.some((entry) => entry.id === 'b6-flow'));
      assert.ok(accountExport.data.marketplace.bookingGroups.groups.some(
        (entry) => entry.id === acceptedInitial.group.id && entry.my_role === 'owner',
      ));
      assert.ok(accountExport.data.marketplace.bookingGroups.stateEvents.some(
        (entry) => entry.booking_group_id === acceptedInitial.group.id,
      ));
      assert.equal(
        accountExport.data.marketplace.bookingGroups.itemEvidenceRemainsInV52BookingRecords,
        true,
      );
      assert.equal(
        accountExport.data.marketplace.bookingQuotes.some((entry) => entry.id === quoted.quoteId),
        false,
      );
      assert.ok(accountExport.data.communication.messageThreads.some((entry) => entry.id === b7Thread.id));
      const ownerLocationMessages = accountExport.data.communication.messages.filter(
        (entry) => entry.id.startsWith('s3t-location-'),
      );
      assert.match(
        ownerLocationMessages.find((entry) => entry.id === 's3t-location-owner').body,
        /Eigenweg 7/u,
      );
      const ownerReceivedLocation = ownerLocationMessages.find(
        (entry) => entry.id === 's3t-location-renter',
      ).body;
      assert.match(ownerReceivedLocation, /THIRD_PARTY_EXACT_LOCATION_OMITTED/u);
      assert.doesNotMatch(ownerReceivedLocation, /Fremdweg|52\.502|13\.402|maps\.example/u);
      assert.equal(
        accountExport.data.communication.privacyExportMinimization
          .thirdPartyStructuredLocationsOmitted,
        1,
      );
      assert.ok(accountExport.data.trustAndSafety.reviews.some((entry) => entry.relationship === 'submitted'));
      assert.ok(accountExport.data.financialActivity.disputeTransferRecoveries.some((entry) => (
        entry.status === 'succeeded'
          && entry.amount_minor === '1500'
          && entry.recovered_minor === '1500'
          && entry.needs_review === false
      )));
      assert.ok(accountExport.data.auditEvents.some((entry) => (
        entry.action === 'account.data_exported'
          && entry.request_id === 'b10-owner-export'
      )));
      await restartApplicationServer();
      const renterExportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: 'POST',
        headers: {
          ...renterAHeaders,
          'X-Request-ID': 'b10-renter-export',
        },
        body: JSON.stringify({ currentPassword: renterAPassword }),
      });
      assert.equal(renterExportResponse.status, 200);
      const renterExport = await renterExportResponse.json();
      assert.equal(renterExport.accountId, 'renter-a');
      assert.ok(renterExport.data.marketplace.bookingGroups.groups.some(
        (entry) => entry.id === acceptedInitial.group.id && entry.my_role === 'renter',
      ));
      assert.ok(
        renterExport.data.marketplace.bookingQuotes.some((entry) => entry.id === quoted.quoteId),
      );
      assert.equal(renterExport.data.marketplace.rentalCart.reservationCreated, false);
      assert.equal(
        renterExport.data.communication.support.legacyHistoryVerificationState,
        'unverified_user_device_source',
      );
      assert.equal(
        renterExport.data.communication.support.legacyHistoryUsableAsDecisionEvidence,
        false,
      );
      const exportedFeedbackCase =
        renterExport.data.communication.support.cases.find(
          (entry) => entry.id === feedbackIntake.supportCase.id,
        );
      assert.deepEqual(exportedFeedbackCase.feedback_context, feedbackContext);
      assert.equal(exportedFeedbackCase.priority, 'p4');
      assert.equal(
        renterExport.data.communication.support.progressUpdates.filter(
          (entry) => entry.case_id === supportIntake.supportCase.id
            && entry.proposal_status === 'published',
        ).length,
        2,
      );
      assert.ok(renterExport.data.communication.support.progressUpdates.every(
        (entry) => !Object.hasOwn(entry, 'next_action')
          && !Object.hasOwn(entry, 'proposed_by')
          && !Object.hasOwn(entry, 'reviewed_by')
          && !Object.hasOwn(entry, 'published_by'),
      ));
      assert.ok(renterExport.data.communication.support.duplicateCaseLinks.some(
        (entry) => entry.duplicate_case_number === duplicateCase.human_readable_case_number
          && entry.leading_case_number === leadingCase.human_readable_case_number
          && entry.relation_type === 'duplicate_of'
          && /^[0-9a-f]{64}$/u.test(entry.snapshot_sha256),
      ));
      assert.ok(renterExport.data.communication.support.legacyImports.some(
        (entry) => entry.id === legacyImport.migration.importId,
      ));
      assert.ok(renterExport.data.communication.support.submittedEvidenceFiles.some(
        (entry) => entry.evidence_id === evidenceUpload.evidence.id
          && entry.scan_status === 'clean'
          && entry.external_ai_used === false,
      ));
      assert.equal(
        renterExport.data.communication.support.evidenceOriginalsAreNeverPublic,
        true,
      );
      assert.equal(
        renterExport.data.communication.support.evidenceExternalAiUsed,
        false,
      );
      assert.ok(renterExport.data.communication.support.submittedEvidenceFiles.every(
        (entry) => !Object.hasOwn(entry, 'original_storage_name')
          && !Object.hasOwn(entry, 'preview_storage_name'),
      ));
      assert.equal(
        renterExport.data.communication.support.legacyHistory.length,
        6,
      );
      const renterOwnerLocation = renterExport.data.communication.messages.find(
        (entry) => entry.id === 's3t-location-owner',
      ).body;
      assert.match(renterOwnerLocation, /THIRD_PARTY_EXACT_LOCATION_OMITTED/u);
      assert.doesNotMatch(renterOwnerLocation, /Eigenweg|52\.501|13\.401|maps\.example/u);
      assert.match(
        renterExport.data.communication.messages.find(
          (entry) => entry.id === 's3t-location-renter',
        ).body,
        /Fremdweg 9/u,
      );
      assert.equal(
        renterExport.data.marketplace.rentalCart.items[0].client_item_id,
        'cartitem_move_1',
      );
      const serializedExport = JSON.stringify(accountExport);
      for (const forbiddenField of [
        'password_hash', 'token_hash', 'provider_payment_id',
        'provider_payment_method_id', 'provider_customer_id',
        'provider_checkout_session_id', 'staff_note', 'resolution',
      ]) {
        assert.equal(serializedExport.includes(forbiddenField), false, forbiddenField);
      }

      const outsiderHeaders = { Authorization: `Bearer ${tokenFor('outsider')}` };
      const rentalResponse = await fetch(`${baseUrl}/v1/rental-requests`, { headers: outsiderHeaders });
      assert.equal(rentalResponse.status, 200);
      assert.deepEqual((await rentalResponse.json()).requests, []);

      const threadResponse = await fetch(`${baseUrl}/v1/message-threads`, { headers: outsiderHeaders });
      assert.equal(threadResponse.status, 200);
      assert.deepEqual((await threadResponse.json()).threads, []);

      const forbiddenUpload = await fetch(`${baseUrl}/v1/uploads/private.png`, { headers: outsiderHeaders });
      assert.equal(forbiddenUpload.status, 403);
      assert.equal((await forbiddenUpload.json()).error, 'upload_forbidden');

      const ownerUpload = await fetch(`${baseUrl}/v1/uploads/private.png`, {
        headers: { Authorization: `Bearer ${tokenFor('owner')}` },
      });
      assert.equal(ownerUpload.status, 200);
      assert.deepEqual(Buffer.from(await ownerUpload.arrayBuffer()), privateContents);

      const suspendedResponse = await fetch(`${baseUrl}/v1/rental-requests`, {
        headers: { Authorization: `Bearer ${tokenFor('suspended')}` },
      });
      assert.equal(suspendedResponse.status, 401);
      assert.equal((await suspendedResponse.json()).error, 'account_not_active');

      await restartApplicationServer();
      const initialPassword = createEphemeralAcceptancePassword();
      const nextPassword = createEphemeralAcceptancePassword();
      const emailChangePassword = createEphemeralAcceptancePassword();
      const recoveryPassword = createEphemeralAcceptancePassword();
      const recoveryNextPassword = createEphemeralAcceptancePassword();
      const recoveryPeerPassword = createEphemeralAcceptancePassword();
      await setupPool.query(
        `INSERT INTO users (
           id, email, password_hash, profile, role, account_status,
           email_verified_at, terms_accepted_at, privacy_accepted_at,
           minimum_age_confirmed_at
         ) VALUES
         (
           'auth-user', 'auth-user@example.com', $1, '{"displayName":"Auth User"}'::jsonb,
           'user', 'active', now(), now(), now(), now()
         ),
         (
           'email-user', 'email-old@example.com', $2, '{"displayName":"Email User"}'::jsonb,
           'user', 'active', now(), now(), now(), now()
         ),
         (
           'recovery-user', 'recovery-user@example.com', $3,
           '{"displayName":"Recovery User"}'::jsonb,
           'user', 'active', now(), now(), now(), now()
         ),
         (
           'recovery-peer', 'recovery-peer@example.com', $4,
           '{"displayName":"Recovery Peer"}'::jsonb,
           'user', 'active', now(), now(), now(), now()
         )`,
        [
          await hashPassword(initialPassword),
          await hashPassword(emailChangePassword),
          await hashPassword(recoveryPassword),
          await hashPassword(recoveryPeerPassword),
        ],
      );

      const login = (password) => fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SIT integration test',
        },
        body: JSON.stringify({ email: 'auth-user@example.com', password }),
      });

      const loginRecoveryAccount = (email, password) => fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SIT S4G account recovery integration test',
        },
        body: JSON.stringify({ email, password }),
      });

      const recoveryLoginOneResponse = await loginRecoveryAccount(
        'recovery-user@example.com',
        recoveryPassword,
      );
      assert.equal(recoveryLoginOneResponse.status, 200);
      const recoverySessionOne = await recoveryLoginOneResponse.json();
      const recoveryLoginTwoResponse = await loginRecoveryAccount(
        'recovery-user@example.com',
        recoveryPassword,
      );
      assert.equal(recoveryLoginTwoResponse.status, 200);
      const recoverySessionTwo = await recoveryLoginTwoResponse.json();
      const recoveryPeerLoginResponse = await loginRecoveryAccount(
        'recovery-peer@example.com',
        recoveryPeerPassword,
      );
      assert.equal(recoveryPeerLoginResponse.status, 200);
      const recoveryPeerSession = await recoveryPeerLoginResponse.json();

      for (const [session, tokenSuffix] of [
        [recoverySessionOne, 'one'],
        [recoverySessionTwo, 'two'],
      ]) {
        const pushRegistration = await fetch(`${baseUrl}/v1/auth/devices/push`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: `synthetic-s4g-push-${tokenSuffix}`,
            platform: 'android',
            locale: 'de-DE',
          }),
        });
        assert.equal(pushRegistration.status, 200);
      }

      const { createActionToken } = await import('../src/account_actions.js');
      const recoveryToken = await inTransaction((client) => createActionToken(client, {
        userId: 'recovery-user',
        kind: 'reset_password',
      }));
      const recoveryConfirmRequest = () => fetch(
        `${baseUrl}/v1/auth/password-reset/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: recoveryToken,
            password: recoveryNextPassword,
          }),
        },
      );
      const concurrentRecoveryResponses = await Promise.all([
        recoveryConfirmRequest(),
        recoveryConfirmRequest(),
      ]);
      assert.deepEqual(
        concurrentRecoveryResponses.map((response) => response.status).sort(),
        [200, 400],
      );
      const recoveryConfirm = concurrentRecoveryResponses.find(
        (response) => response.status === 200,
      );
      assert.equal(recoveryConfirm.status, 200);
      assert.deepEqual(await recoveryConfirm.json(), { changed: true });
      const recoveryReuse = concurrentRecoveryResponses.find(
        (response) => response.status === 400,
      );
      assert.equal(recoveryReuse.status, 400);
      assert.equal((await recoveryReuse.json()).error, 'invalid_or_expired_reset_link');

      for (const oldSession of [recoverySessionOne, recoverySessionTwo]) {
        const oldAccess = await fetch(`${baseUrl}/v1/auth/me`, {
          headers: {
            Authorization: `Bearer ${oldSession.accessToken}`,
          },
        });
        assert.equal(oldAccess.status, 401);
      }
      const unaffectedPeerAccess = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${recoveryPeerSession.accessToken}`,
        },
      });
      assert.equal(unaffectedPeerAccess.status, 200);

      const recoverySessionState = await setupPool.query(
        `SELECT revoked_reason, count(*)::int AS count
           FROM auth_sessions
          WHERE user_id = 'recovery-user'
          GROUP BY revoked_reason`,
      );
      assert.deepEqual(recoverySessionState.rows, [{
        revoked_reason: 'password_reset',
        count: 2,
      }]);
      const recoveryRefreshState = await setupPool.query(
        `SELECT revoked_reason, count(*)::int AS count
           FROM refresh_tokens
          WHERE user_id = 'recovery-user'
          GROUP BY revoked_reason`,
      );
      assert.deepEqual(recoveryRefreshState.rows, [{
        revoked_reason: 'password_reset',
        count: 2,
      }]);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM push_devices WHERE user_id = 'recovery-user'`,
      )).rows[0].count, 0);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM auth_sessions
          WHERE user_id = 'recovery-peer' AND revoked_at IS NULL`,
      )).rows[0].count, 1);

      const recoveryAudit = await setupPool.query(
        `SELECT metadata
           FROM audit_log
          WHERE action = 'auth.password_reset'
            AND resource_id = 'recovery-user'
          ORDER BY id DESC LIMIT 1`,
      );
      assert.deepEqual(recoveryAudit.rows[0].metadata, {
        scope: 'target_account_only',
        actionTokenId: recoveryAudit.rows[0].metadata.actionTokenId,
        revokedSessionCount: 2,
        revokedRefreshTokenCount: 2,
        deletedPushDeviceCount: 2,
        replacementSessionIssued: false,
      });
      assert.match(recoveryAudit.rows[0].metadata.actionTokenId, /^[0-9a-f-]{36}$/u);
      assert.equal(JSON.stringify(recoveryAudit.rows[0].metadata).includes(recoveryToken), false);

      assert.equal((await loginRecoveryAccount(
        'recovery-user@example.com',
        recoveryPassword,
      )).status, 401);
      const recoveryFreshLoginResponse = await loginRecoveryAccount(
        'recovery-user@example.com',
        recoveryNextPassword,
      );
      assert.equal(recoveryFreshLoginResponse.status, 200);
      const recoveryFreshSession = await recoveryFreshLoginResponse.json();
      assert.notEqual(recoveryFreshSession.sessionId, recoverySessionOne.sessionId);
      assert.notEqual(recoveryFreshSession.sessionId, recoverySessionTwo.sessionId);

      const expiredRecoveryToken =
        'expired-recovery-token-that-is-long-enough-for-s4g-testing-1234567890';
      const expiredRecoveryRow = await setupPool.query(
        `INSERT INTO auth_action_tokens (
           user_id, kind, token_hash, created_at, expires_at
         ) VALUES (
           'recovery-user', 'reset_password', $1,
           now() - interval '30 minutes', now() - interval '1 second'
         ) RETURNING id`,
        [hashActionToken(expiredRecoveryToken)],
      );
      const expiredRecoveryAttempt = await fetch(
        `${baseUrl}/v1/auth/password-reset/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: expiredRecoveryToken,
            password: createEphemeralAcceptancePassword(),
          }),
        },
      );
      assert.equal(expiredRecoveryAttempt.status, 400);
      await assert.rejects(
        setupPool.query(
          `UPDATE auth_action_tokens SET token_hash = $2 WHERE id = $1`,
          [expiredRecoveryRow.rows[0].id, 'f'.repeat(64)],
        ),
        (error) => error?.code === '55000'
          && error?.message === 'auth_action_token_identity_immutable',
      );

      await restartApplicationServer();
      const firstLogin = await login(initialPassword);
      assert.equal(firstLogin.status, 200);
      const firstSession = await firstLogin.json();
      assert.match(firstSession.sessionId, /^[0-9a-f-]{36}$/);

      const sessionsResponse = await fetch(`${baseUrl}/v1/auth/sessions`, {
        headers: { Authorization: `Bearer ${firstSession.accessToken}` },
      });
      assert.equal(sessionsResponse.status, 200);
      const sessions = (await sessionsResponse.json()).sessions;
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].isThisDevice, true);

      const rotatedResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: firstSession.refreshToken }),
      });
      assert.equal(rotatedResponse.status, 200);
      const rotatedSession = await rotatedResponse.json();
      assert.equal(rotatedSession.sessionId, firstSession.sessionId);
      assert.notEqual(rotatedSession.refreshToken, firstSession.refreshToken);

      const reuseResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: firstSession.refreshToken }),
      });
      assert.equal(reuseResponse.status, 401);
      assert.equal((await reuseResponse.json()).error, 'refresh_token_reuse_detected');

      const revokedAccess = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${rotatedSession.accessToken}` },
      });
      assert.equal(revokedAccess.status, 401);

      await restartApplicationServer();
      const emailLogin = (email, password) => fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SIT email lifecycle test',
        },
        body: JSON.stringify({ email, password }),
      });
      const emailLoginResponse = await emailLogin(
        'email-old@example.com',
        emailChangePassword,
      );
      assert.equal(emailLoginResponse.status, 200);
      const emailSession = await emailLoginResponse.json();
      const emailChangeRequest = await fetch(`${baseUrl}/v1/auth/email-change/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${emailSession.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newEmail: 'email-new@example.com',
          currentPassword: emailChangePassword,
        }),
      });
      assert.equal(emailChangeRequest.status, 202);
      assert.deepEqual(await emailChangeRequest.json(), { accepted: true });
      const emailChangeAction = await setupPool.query(
        `SELECT id, payload FROM auth_action_tokens
         WHERE user_id = 'email-user' AND kind = 'change_email' AND consumed_at IS NULL`,
      );
      assert.equal(emailChangeAction.rowCount, 1);
      assert.deepEqual(emailChangeAction.rows[0].payload, { newEmail: 'email-new@example.com' });
      const knownEmailChangeToken = 'email-change-token-that-is-long-enough-for-testing-1234567890';
      await setupPool.query(
        'UPDATE auth_action_tokens SET token_hash = $2 WHERE id = $1',
        [emailChangeAction.rows[0].id, hashActionToken(knownEmailChangeToken)],
      );
      const emailChangeConfirm = await fetch(
        `${baseUrl}/v1/auth/email-change/confirm?token=${encodeURIComponent(knownEmailChangeToken)}`,
      );
      assert.equal(emailChangeConfirm.status, 200);
      assert.match(await emailChangeConfirm.text(), /E-Mail-Adresse geändert/);
      const emailSessionAfterChange = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${emailSession.accessToken}` },
      });
      assert.equal(emailSessionAfterChange.status, 401);
      assert.equal((await emailLogin(
        'email-old@example.com',
        emailChangePassword,
      )).status, 401);
      const newEmailLogin = await emailLogin(
        'email-new@example.com',
        emailChangePassword,
      );
      assert.equal(newEmailLogin.status, 200);
      const changedEmailUser = await setupPool.query(
        `SELECT email, email_verified_at FROM users WHERE id = 'email-user'`,
      );
      assert.equal(changedEmailUser.rows[0].email, 'email-new@example.com');
      assert.ok(changedEmailUser.rows[0].email_verified_at);
      const emailAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
         WHERE actor_id = 'email-user' AND action = 'auth.email_changed'
         ORDER BY id DESC LIMIT 1`,
      );
      assert.match(emailAudit.rows[0].metadata.newEmailHash, /^[0-9a-f]{64}$/);
      assert.doesNotMatch(JSON.stringify(emailAudit.rows[0].metadata), /email-new@example\.com/);

      const distributedEmailLogin = (email, password, sourceAddress) => fetch(
        `${baseUrl}/v1/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': sourceAddress,
            'User-Agent': 'SIT distributed credential attack integration test',
          },
          body: JSON.stringify({ email, password }),
        },
      );
      for (let attempt = 0; attempt < 10; attempt += 1) {
        // Distinct sources are the security scenario here: account lockout must
        // still stop a distributed attack that cannot be contained by one IP bucket.
        const failure = await distributedEmailLogin(
          'email-new@example.com',
          createEphemeralAcceptancePassword(),
          `203.0.114.${attempt + 1}`,
        );
        assert.equal(failure.status, 401);
        assert.equal((await failure.json()).error, 'invalid_credentials');
      }
      const lockedUser = await setupPool.query(
        `SELECT failed_login_attempts, login_locked_until
         FROM users WHERE id = 'email-user'`,
      );
      assert.equal(lockedUser.rows[0].failed_login_attempts, 10);
      assert.ok(new Date(lockedUser.rows[0].login_locked_until) > new Date());
      assert.equal((await emailLogin(
        'email-new@example.com',
        emailChangePassword,
        '203.0.114.20',
      )).status, 401);
      await setupPool.query(
        `UPDATE users
         SET failed_login_attempts = 0, login_locked_until = NULL
         WHERE id = 'email-user'`,
      );

      await restartApplicationServer();
      const secondLogin = await login(initialPassword);
      assert.equal(secondLogin.status, 200);
      const passwordSession = await secondLogin.json();
      const passwordChange = await fetch(`${baseUrl}/v1/auth/password/change`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${passwordSession.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: nextPassword,
        }),
      });
      assert.equal(passwordChange.status, 204);

      const accessAfterPasswordChange = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${passwordSession.accessToken}` },
      });
      assert.equal(accessAfterPasswordChange.status, 401);
      assert.equal((await login(initialPassword)).status, 401);

      const thirdLogin = await login(nextPassword);
      assert.equal(thirdLogin.status, 200);
      const deletionSession = await thirdLogin.json();
      const erasedStorageName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
      const erasedThumbnailStorageName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp';
      await fs.writeFile(path.join(uploadDir, erasedStorageName), Buffer.from('private-profile-image'));
      await fs.writeFile(
        path.join(uploadDir, erasedThumbnailStorageName),
        Buffer.from('private-profile-thumbnail'),
      );
      await setupPool.query(
        `INSERT INTO listings (id, owner_id, payload, is_active, status)
         VALUES (
           'auth-user-listing', 'auth-user',
           '{"id":"auth-user-listing","ownerId":"auth-user","title":"Private title","description":"Call me at +49123456789","photos":["private-photo-url"],"status":"paused","isActive":false}'::jsonb,
           false, 'paused'
         )`,
      );
      await setupPool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility, listing_id,
           thumbnail_storage_name, thumbnail_mime_type, thumbnail_byte_size
         ) VALUES (
           'auth-user', $1, 'image/webp', $2, 'profile_image', 'public', 'auth-user-listing',
           $3, 'image/webp', $4
         )`,
        [
          erasedStorageName,
          Buffer.byteLength('private-profile-image'),
          erasedThumbnailStorageName,
          Buffer.byteLength('private-profile-thumbnail'),
        ],
      );
      await setupPool.query(
        `INSERT INTO notification_preferences (user_id)
         VALUES ('auth-user')
         ON CONFLICT (user_id) DO NOTHING`,
      );
      await setupPool.query(
        `INSERT INTO notifications (
           event_key, user_id, category, kind, priority, title, body, payload
         ) VALUES (
           'account-deletion-notification', 'auth-user', 'system',
           'account_deletion_test', 1, 'Private title', 'Private body',
           '{"private":"value"}'::jsonb
         )`,
      );
      const deletionOutbox = await setupPool.query(
        `INSERT INTO notification_outbox (
           event_key, user_id, channel, kind, payload, status, provider_message_id
         ) VALUES (
           'account-deletion-outbox', 'auth-user', 'push',
           'account_deletion_test', '{"private":"value"}'::jsonb,
           'retry', 'provider-private-reference'
         )
         RETURNING id`,
      );
      await setupPool.query(
        `INSERT INTO notification_delivery_attempts (
           outbox_id, attempt_number, channel, outcome, provider,
           provider_message_id, metadata
         ) VALUES ($1, 1, 'push', 'retry', 'fcm', 'provider-private-reference', '{}')`,
        [deletionOutbox.rows[0].id],
      );
      await setupPool.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id)
         VALUES ('auth-user', 'email-user')`,
      );
      const deletionSupportCase = await setupPool.query(
        `INSERT INTO support_cases (
           human_readable_case_number, case_type, case_subtype, status,
           priority, severity, source_channel, operating_mode,
           reporter_user_id, reporter_role, current_owner_id,
           current_owner_role, approval_level, waiting_on, next_action,
           next_update_at, user_facing_summary, internal_summary,
           policy_snapshot_id, idempotency_key, intake_scope_evidence
         ) VALUES (
           'SIT-23456789BCDF', 'general_help', 'app_error_or_display',
           'under_review', 'p3', 'low', 'internal', 'simulation',
           'auth-user', 'user', 'support', 'general_support_owner',
           'green_automatic', 'support_owner',
           'Continue the controlled internal support review.',
           now() + interval '1 day',
           'The internal support case remains under review.',
           'Synthetic account-deletion retention test only.',
           $1, 'support-account-deletion-retention-integration',
           '{"version":"sit_support_single_issue_scope_v1","singleIssueConfirmed":true,"separationGuidanceShown":false}'::jsonb
         ) RETURNING id`,
        [supportPolicy.rows[0].id],
      );
      const deletionHeaders = {
        Authorization: `Bearer ${deletionSession.accessToken}`,
        'Content-Type': 'application/json',
      };
      const deletionCart = await fetch(
        `${baseUrl}/v1/rental-cart/items/cartitem_delete_1`,
        {
          method: 'PUT',
          headers: deletionHeaders,
          body: JSON.stringify({
            listingId: 'listing-1',
            startDate: '2026-11-20',
            endDate: '2026-11-22',
          }),
        },
      );
      assert.equal(deletionCart.status, 200);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM rental_carts WHERE user_id = 'auth-user'`,
      )).rows[0].count, 1);
      const deletionPreflight = await fetch(`${baseUrl}/v1/account/deletion-preflight`, {
        headers: deletionHeaders,
      });
      assert.equal(deletionPreflight.status, 200);
      assert.deepEqual(await deletionPreflight.json(), {
        canDelete: true,
        blockers: [],
        retainedRecords: [{
          id: 'support_case_records',
          label: 'Supportfall und zugehörige Fallnachweise bleiben kontrolliert gespeichert',
          count: 1,
        }],
      });

      const wrongDeletion = await fetch(`${baseUrl}/v1/account/deletion`, {
        method: 'POST',
        headers: deletionHeaders,
        body: JSON.stringify({ currentPassword: createEphemeralAcceptancePassword() }),
      });
      assert.equal(wrongDeletion.status, 401);
      const deletion = await fetch(`${baseUrl}/v1/account/deletion`, {
        method: 'POST',
        headers: deletionHeaders,
        body: JSON.stringify({ currentPassword: nextPassword }),
      });
      assert.equal(deletion.status, 200);
      assert.deepEqual(await deletion.json(), { deleted: true });
      assert.equal((await login(nextPassword)).status, 401);
      const erasedUser = await setupPool.query(
        `SELECT email, password_hash, account_status, deactivated_at, personal_data_erased_at, profile
         FROM users WHERE id = 'auth-user'`,
      );
      assert.match(erasedUser.rows[0].email, /^deleted\+[0-9a-f-]+@anonymized\.invalid$/);
      assert.equal(erasedUser.rows[0].password_hash, null);
      assert.equal(erasedUser.rows[0].account_status, 'closed');
      assert.ok(erasedUser.rows[0].deactivated_at);
      assert.ok(erasedUser.rows[0].personal_data_erased_at);
      assert.equal(erasedUser.rows[0].profile.displayName, 'Gelöschter Nutzer');
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM auth_sessions WHERE user_id = 'auth-user'`,
      )).rows[0].count, 0);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM uploads WHERE owner_id = 'auth-user'`,
      )).rows[0].count, 0);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM rental_carts WHERE user_id = 'auth-user'`,
      )).rows[0].count, 0);
      for (const table of ['notification_preferences', 'notifications', 'message_reads']) {
        assert.equal((await setupPool.query(
          `SELECT count(*)::int AS count FROM ${table} WHERE user_id = 'auth-user'`,
        )).rows[0].count, 0);
      }
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM user_blocks
         WHERE blocker_id = 'auth-user' OR blocked_id = 'auth-user'`,
      )).rows[0].count, 0);
      const retainedSupportCase = await setupPool.query(
        `SELECT reporter_user_id, status
           FROM support_cases WHERE id = $1`,
        [deletionSupportCase.rows[0].id],
      );
      assert.deepEqual(retainedSupportCase.rows, [{
        reporter_user_id: 'auth-user',
        status: 'under_review',
      }]);
      const deletedSupportAccess = await fetch(`${baseUrl}/v1/support/cases`, {
        headers: { Authorization: `Bearer ${deletionSession.accessToken}` },
      });
      assert.equal(deletedSupportAccess.status, 401);
      await assert.rejects(
        setupPool.query(
          `INSERT INTO support_messages (
             case_id, sender_type, sender_id, recipient_user_id,
             message_type, message_title, template_id, template_version,
             rendered_content, rendered_content_sha256, structured_variables,
             approval_level, send_status, idempotency_key
           ) VALUES (
             $1, 'support', 'support', 'auth-user',
             'support_template', 'Closed account test', 'T-001', '1.0.0',
             'This message must not be recorded for a closed account.',
             encode(digest('This message must not be recorded for a closed account.', 'sha256'), 'hex'),
             '{}'::jsonb, 'green_automatic', 'draft',
             'support-closed-account-integration'
           )`,
          [deletionSupportCase.rows[0].id],
        ),
        /Support message recipient account must be active/u,
      );
      const deletionAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
          WHERE action = 'account.deleted' AND resource_id = 'auth-user'
          ORDER BY id DESC LIMIT 1`,
      );
      assert.ok(
        deletionAudit.rows[0].metadata.retained.includes(
          'pseudonymous_support_case_records',
        ),
      );
      const scrubbedOutbox = await setupPool.query(
        `SELECT status, payload, provider_message_id, locked_at, locked_by, last_error_code
         FROM notification_outbox WHERE id = $1`,
        [deletionOutbox.rows[0].id],
      );
      assert.deepEqual(scrubbedOutbox.rows[0], {
        status: 'suppressed',
        payload: {},
        provider_message_id: null,
        locked_at: null,
        locked_by: null,
        last_error_code: 'account_deleted',
      });
      await assert.rejects(fs.access(path.join(uploadDir, erasedStorageName)), { code: 'ENOENT' });
      await assert.rejects(
        fs.access(path.join(uploadDir, erasedThumbnailStorageName)),
        { code: 'ENOENT' },
      );
      const erasedListing = await setupPool.query(
        `SELECT is_active, payload FROM listings WHERE id = 'auth-user-listing'`,
      );
      assert.equal(erasedListing.rows[0].is_active, false);
      assert.equal(erasedListing.rows[0].payload.description, undefined);
      assert.deepEqual(erasedListing.rows[0].payload.photos, []);
      assert.equal(erasedListing.rows[0].payload.status, 'ended');

      for (let pageView = 0; pageView < 5; pageView += 1) {
        const deletionPage = await fetch(`${baseUrl}/v1/account-deletion`);
        assert.equal(deletionPage.status, 200);
        const deletionPageBody = await deletionPage.text();
        assert.match(deletionPageBody, /Konto löschen/);
        assert.match(deletionPageBody, /data-sit-compliance-status="operational"/);
      }
      const compliance = await fetch(`${baseUrl}/v1/public/compliance`);
      assert.equal(compliance.status, 200);
      assert.deepEqual(await compliance.json(), {
        status: 'draft',
        submissionReady: false,
        pages: {
          support: 'draft',
          privacy: 'draft',
          consumerDispute: 'draft',
          productSafety: 'draft',
          accountDeletion: 'operational',
        },
      });
      for (const page of ['support', 'privacy']) {
        const response = await fetch(`${baseUrl}/v1/public/${page}`);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('x-sit-compliance-status'), 'draft');
        assert.match(await response.text(), new RegExp(`data-sit-public-page="${page}"`));
      }
      const unknownDeletionRequest = await fetch(`${baseUrl}/v1/account-deletion/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'unknown@example.com' }),
      });
      assert.equal(unknownDeletionRequest.status, 202);
      assert.match(await unknownDeletionRequest.text(), /Anfrage erhalten/);

      await restartApplicationServer();
      const registrationBody = {
        email: 'new-account@example.com',
        password: createEphemeralAcceptancePassword(),
        displayName: 'New Account',
        termsAccepted: true,
        privacyAccepted: true,
        minimumAgeConfirmed: true,
      };
      const register = () => fetch(`${baseUrl}/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationBody),
      });
      const registration = await register();
      assert.equal(registration.status, 202);
      assert.deepEqual(await registration.json(), { accepted: true });
      const duplicateRegistration = await register();
      assert.equal(duplicateRegistration.status, 202);
      assert.deepEqual(await duplicateRegistration.json(), { accepted: true });

      const unavailableRegistrationBody = {
        ...registrationBody,
        email: 'verification-delivery-unavailable@example.com',
      };
      applicationOptions.deliverVerification = async () => {
        const error = new Error('synthetic_verification_delivery_unavailable');
        error.code = 'mail_delivery_failed';
        throw error;
      };
      await restartApplicationServer();
      const unavailableRegistration = await fetch(`${baseUrl}/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(unavailableRegistrationBody),
      });
      assert.equal(unavailableRegistration.status, 503);
      assert.equal(
        (await unavailableRegistration.json()).error,
        'verification_delivery_unavailable',
      );

      applicationOptions.deliverVerification = undefined;
      await restartApplicationServer();
      const recoveredRegistration = await fetch(`${baseUrl}/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(unavailableRegistrationBody),
      });
      assert.equal(recoveredRegistration.status, 202);
      assert.deepEqual(await recoveredRegistration.json(), { accepted: true });

      const unverifiedLogin = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: registrationBody.email,
          password: registrationBody.password,
        }),
      });
      assert.equal(unverifiedLogin.status, 403);
      assert.equal((await unverifiedLogin.json()).error, 'email_verification_required');

      const socialRequest = (token, consents = false) =>
        fetch(`${baseUrl}/v1/auth/social`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SIT social auth integration test',
          },
          body: JSON.stringify({
            idToken: token,
            termsAccepted: consents,
            privacyAccepted: consents,
            minimumAgeConfirmed: consents,
          }),
        });
      socialClaims.set('google-new', {
        provider: 'google',
        subject: 'firebase-google-new',
        firebaseUserId: 'firebase-user-google-new',
        email: 'social-google@example.com',
        emailVerified: true,
        displayName: 'Google Member',
      });
      const socialMissingConsents = await socialRequest('google-new');
      assert.equal(socialMissingConsents.status, 400);
      assert.equal(
        (await socialMissingConsents.json()).error,
        'social_registration_consents_required',
      );
      const socialRegistration = await socialRequest(
        'google-new',
        true,
      );
      assert.equal(socialRegistration.status, 200);
      const socialSession = await socialRegistration.json();
      assert.equal(socialSession.user.email, 'social-google@example.com');
      assert.equal(socialSession.user.emailVerified, true);
      assert.match(socialSession.sessionId, /^[0-9a-f-]{36}$/);
      const passwordlessExportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${socialSession.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: createEphemeralAcceptancePassword(),
        }),
      });
      assert.equal(passwordlessExportResponse.status, 409);
      assert.equal(
        (await passwordlessExportResponse.json()).error,
        'account_export_password_verification_unavailable',
      );
      const socialIdentity = await setupPool.query(
        `SELECT provider, provider_subject, firebase_user_id, email_verified
         FROM auth_identities WHERE user_id = $1`,
        [socialSession.user.id],
      );
      assert.deepEqual(socialIdentity.rows, [{
        provider: 'google',
        provider_subject: 'firebase-google-new',
        firebase_user_id: 'firebase-user-google-new',
        email_verified: true,
      }]);
      const repeatSocialLogin = await socialRequest(
        'google-new',
        false,
      );
      assert.equal(repeatSocialLogin.status, 200);
      assert.equal((await repeatSocialLogin.json()).user.id, socialSession.user.id);

      socialClaims.set('facebook-existing', {
        provider: 'facebook',
        subject: 'firebase-facebook-existing',
        firebaseUserId: 'firebase-user-facebook-existing',
        email: 'social-google@example.com',
        emailVerified: false,
        displayName: 'Facebook Existing',
      });
      const unsafeFacebookLink = await socialRequest(
        'facebook-existing',
        true,
      );
      assert.equal(unsafeFacebookLink.status, 409);
      assert.equal(
        (await unsafeFacebookLink.json()).error,
        'social_account_link_requires_reauthentication',
      );

      socialClaims.set('facebook-delivery-unavailable', {
        provider: 'facebook',
        subject: 'firebase-facebook-delivery-unavailable',
        firebaseUserId: 'firebase-user-facebook-delivery-unavailable',
        email: 'social-delivery-unavailable@example.com',
        emailVerified: false,
        displayName: 'Facebook Delivery Unavailable',
      });
      applicationOptions.deliverVerification = async () => {
        const error = new Error('synthetic_social_verification_delivery_unavailable');
        error.code = 'mail_delivery_failed';
        throw error;
      };
      await restartApplicationServer();
      const unavailableFacebookRegistration = await socialRequest(
        'facebook-delivery-unavailable',
        true,
      );
      assert.equal(unavailableFacebookRegistration.status, 503);
      assert.equal(
        (await unavailableFacebookRegistration.json()).error,
        'verification_delivery_unavailable',
      );
      applicationOptions.deliverVerification = undefined;
      await restartApplicationServer();

      socialClaims.set('facebook-new', {
        provider: 'facebook',
        subject: 'firebase-facebook-new',
        firebaseUserId: 'firebase-user-facebook-new',
        email: 'social-facebook@example.com',
        emailVerified: false,
        displayName: 'Facebook Member',
      });
      const facebookRegistration = await socialRequest(
        'facebook-new',
        true,
      );
      assert.equal(facebookRegistration.status, 202);
      assert.deepEqual(await facebookRegistration.json(), {
        accepted: true,
        verificationEmailSent: true,
        email: 'social-facebook@example.com',
      });
      const facebookAccount = await setupPool.query(
        `SELECT account.id, account.email_verified_at, identity.email_verified
         FROM users AS account
         JOIN auth_identities AS identity ON identity.user_id = account.id
         WHERE account.email = 'social-facebook@example.com'`,
      );
      assert.equal(facebookAccount.rowCount, 1);
      assert.equal(facebookAccount.rows[0].email_verified_at, null);
      assert.equal(facebookAccount.rows[0].email_verified, false);
      await setupPool.query(
        `UPDATE users
         SET email_verified_at = now(),
             profile = jsonb_set(profile, '{emailVerified}', 'true'::jsonb, true)
         WHERE id = $1`,
        [facebookAccount.rows[0].id],
      );
      const verifiedFacebookLogin = await socialRequest(
        'facebook-new',
        false,
      );
      assert.equal(verifiedFacebookLogin.status, 200);
      assert.equal(
        (await verifiedFacebookLogin.json()).user.id,
        facebookAccount.rows[0].id,
      );

      const s4lAppointment = new Date(Date.now() - (5 * 60 * 1000));
      const s4lRentalStart = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(s4lAppointment);
      const s4lRentalEnd = new Date(
        new Date(`${s4lRentalStart}T12:00:00.000Z`).getTime()
          + (24 * 60 * 60 * 1000),
      ).toISOString().slice(0, 10);
      await setupPool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor,
           title, description, category_id, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, protection_model
         ) VALUES (
           's4l-listing', 'owner',
           '{"id":"s4l-listing","ownerId":"owner","title":"S4L handover fixture","description":"Dedicated date-independent handover-exception fixture","categoryId":"cat3","subcategory":"Kameras","pricePerDay":10,"priceRaw":10,"priceUnit":"day","currency":"EUR","deposit":null,"photos":[],"locationText":"Owner exact address","lat":52.5201,"lng":13.4051,"geohash":"private","condition":"good","minDays":1,"maxDays":30,"createdAt":"2026-08-08T20:00:00.000Z","isActive":true,"verificationStatus":"pending","city":"Berlin","country":"Deutschland","status":"active","timesLent":0,"protectionModel":"none"}'::jsonb,
           true, 1, 1, 'active', 'EUR', 1000,
           'S4L handover fixture',
           'Dedicated date-independent handover-exception fixture',
           'cat3', 'good', 'Owner exact address', 'Berlin', 'Deutschland',
           52.5201, 13.4051, 1, 30, 'none'
         )`,
      );
      await setupPool.query(
        `INSERT INTO rental_requests (
           id, item_id, owner_id, renter_id, status, payload
         ) VALUES (
           's4l-handover', 's4l-listing', 'owner', 'renter-a', 'accepted',
           jsonb_build_object(
             'status', 'accepted',
             'workflowStatus', 'accepted',
             'itemId', 's4l-listing',
             'handoverTimeIso', $1::text,
             'handoverTimeRequestedByUserId', 'owner',
             'handoverTimeConfirmed', true,
             'handoverTimeConfirmedByUserId', 'renter-a',
             'handoverTimeConfirmedAt', ($1::timestamptz - interval '1 hour')::text
           )
         )`,
        [s4lAppointment.toISOString()],
      );
      await setupPool.query(
        `INSERT INTO bookings (
           id, listing_id, owner_id, renter_id, status, starts_at, ends_at,
           currency, quoted_total_minor, security_deposit_minor,
           workflow_status, workflow_version, workflow_revision,
           rental_start_date, rental_end_date, rental_timezone, quoted_days,
           price_per_day_minor, base_rental_minor, discount_minor,
           rental_subtotal_minor, platform_fee_minor, delivery_fee_minor,
           pickup_fee_minor, express_fee_minor, owner_payout_minor,
           quote_version, quote_breakdown, requested_at, accepted_at
         ) VALUES (
           's4l-handover', 's4l-listing', 'owner', 'renter-a', 'accepted',
           $1::timestamptz, $1::timestamptz + interval '1 day',
           'EUR', 1000, 0, 'accepted', 1, 1,
           $2::date, $3::date, 'Europe/Berlin', 1,
           1000, 1000, 0, 1000, 0, 0, 0, 0, 1000,
           1, '{"source":"s4l_integration"}'::jsonb, now(), now()
         )`,
        [s4lAppointment.toISOString(), s4lRentalStart, s4lRentalEnd],
      );
      await setupPool.query(
        `INSERT INTO message_threads (
           id, request_id, booking_id, item_id, user1_id, user2_id,
           payload, communication_version
         ) VALUES (
           's4l-thread', 's4l-handover', 's4l-handover', 's4l-listing',
           'renter-a', 'owner', '{}'::jsonb, 1
         )`,
      );
      await setupPool.query(
        `INSERT INTO messages (
           id, thread_id, sender_id, sender_type, body, created_at,
           client_message_id, attachments, message_version
         ) VALUES (
           's4l-contact', 's4l-thread', 'renter-a', 'user',
           'Ich bin am bestätigten Treffpunkt. Bist du unterwegs?',
           $1::timestamptz + interval '1 minute',
           's4l-contact-client', '[]'::jsonb, 1
         )`,
        [s4lAppointment.toISOString()],
      );

      const { reportHandoverException } = await import(
        '../src/handover_exception_workflow.js'
      );
      const reportS4l = async (idempotencyKey, body) => {
        const client = await setupPool.connect();
        try {
          await client.query('BEGIN');
          const result = await reportHandoverException(client, {
            actor: { id: 'renter-a', role: 'user' },
            bookingId: 's4l-handover',
            idempotencyKey,
            raw: {
            details: 'Kontrollierte beobachtbare Fakten für den S4L-Integrationstest.',
            immediateDanger: false,
            safeAbortGuidanceAcknowledged: false,
            doNotPayGuidanceAcknowledged: false,
            contactAttemptAcknowledged: false,
            ...body,
            },
          });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
      const itemMismatch = await reportS4l('s4l-item-mismatch', {
        kind: 'item_mismatch',
        safeAbortGuidanceAcknowledged: true,
      });
      assert.equal(itemMismatch.supportCase.caseType, 'active_handover');
      assert.equal(itemMismatch.supportCase.caseSubType, 'item_not_as_listed');
      assert.equal(itemMismatch.supportCase.priority, 'p1');
      assert.equal(itemMismatch.exceptionReceipt.moneyOutcomeDecided, false);
      assert.equal(itemMismatch.exceptionReceipt.guiltDetermined, false);

      const deposit = await reportS4l('s4l-deposit-request', {
        kind: 'offplatform_deposit_request',
        doNotPayGuidanceAcknowledged: true,
      });
      assert.equal(deposit.supportCase.caseType, 'trust_safety');
      assert.equal(
        deposit.supportCase.caseSubType,
        'offplatform_deposit_request',
      );
      assert.equal(deposit.supportCase.priority, 'p1');
      assert.equal(deposit.exceptionReceipt.trustSafetyReviewRequired, true);
      assert.equal(deposit.exceptionReceipt.accountMeasureTaken, false);

      const noShow = await reportS4l('s4l-party-no-show', {
        kind: 'party_no_show',
        contactAttemptAcknowledged: true,
      });
      assert.equal(noShow.supportCase.caseType, 'cancellation_no_show');
      assert.equal(noShow.supportCase.caseSubType, 'handover_no_show');
      assert.equal(noShow.supportCase.priority, 'p1');
      assert.equal(noShow.exceptionReceipt.contactAttemptCount, 1);
      assert.equal(noShow.exceptionReceipt.bookingStatusChanged, false);

      const s4lBookingTruth = await setupPool.query(
        `SELECT status, workflow_status FROM bookings WHERE id = 's4l-handover'`,
      );
      assert.deepEqual(s4lBookingTruth.rows[0], {
        status: 'accepted',
        workflow_status: 'accepted',
      });
      const s4lAudit = await setupPool.query(
        `SELECT metadata FROM audit_log
          WHERE action = 'booking.handover_exception_reported'
          ORDER BY request_id`,
      );
      assert.equal(s4lAudit.rowCount, 3);
      assert.equal(
        s4lAudit.rows.some((row) => JSON.stringify(row.metadata).includes(
          'Kontrollierte beobachtbare Fakten',
        )),
        false,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO audit_log (
             actor_id, actor_role, action, resource_type, resource_id,
             request_id, metadata
           ) SELECT
             'renter-a', 'user', 'booking.handover_exception_reported',
             'booking', 's4l-handover', 'booking.handover_exception:s4l-forged',
             metadata || '{"moneyOutcomeDecided":true}'::jsonb
           FROM audit_log
           WHERE action = 'booking.handover_exception_reported'
           LIMIT 1`,
        ),
        (error) => error?.code === '23514',
      );

      const handoverExceptionDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/062_handover_exception_guard.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(handoverExceptionDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === '062 rollback refused: handover exception evidence exists',
      );

      const supportDuplicateCaseDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/053_support_duplicate_case_linking.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(supportDuplicateCaseDown),
        (error) => error?.code === 'P0001'
          && error?.message === 'Refusing to drop retained support duplicate-case links',
      );

      const supportFeedbackPriorityDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/054_support_feedback_priority.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(supportFeedbackPriorityDown),
        (error) => error?.code === 'P0001'
          && error?.message === 'Refusing to drop retained support feedback context',
      );

      const supportProgressUpdatesDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/055_support_progress_updates.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(supportProgressUpdatesDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'Cannot roll back support progress updates while retained update evidence exists',
      );

      const supportAccountRecoveryDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/056_support_account_recovery_guard.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(supportAccountRecoveryDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'Cannot roll back account recovery guidance while retained message evidence exists',
      );

      const accountRecoverySessionIntegrityDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/057_account_recovery_session_integrity.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(accountRecoverySessionIntegrityDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'Cannot roll back account recovery session integrity while reset-token evidence exists',
      );

      const supportMessageContentBlockAuditDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/059_support_message_content_block_audit.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(supportMessageContentBlockAuditDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'cannot roll back support message content-block guard while audit evidence exists',
      );

      const harassmentBlockReportDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/060_harassment_block_report_guard.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(harassmentBlockReportDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'cannot roll back harassment block-report guard while audit evidence exists',
      );

      const bookingAddressRevealDown = await fs.readFile(
        path.resolve(
          currentDir,
          '../sql/migrations/061_booking_exact_address_reveal_guard.down.sql',
        ),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(bookingAddressRevealDown),
        (error) => error?.code === 'P0001'
          && error?.message
            === 'cannot roll back booking address reveal guard while audit evidence exists',
      );

      const g3bDown = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/028_g3b_booking_group_foundation.down.sql'),
        'utf8',
      );
      const g3bUp = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/028_g3b_booking_group_foundation.up.sql'),
        'utf8',
      );
      const g3cDown = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/029_g3c_booking_group_quote_state.down.sql'),
        'utf8',
      );
      const g3cUp = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/029_g3c_booking_group_quote_state.up.sql'),
        'utf8',
      );
      const g3dDown = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/030_g3d_shared_handover_item_evidence.down.sql'),
        'utf8',
      );
      const g3dUp = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/030_g3d_shared_handover_item_evidence.up.sql'),
        'utf8',
      );
      const g5bDown = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/031_g5b_listing_sets.down.sql'),
        'utf8',
      );
      const g5bUp = await fs.readFile(
        path.resolve(currentDir, '../sql/migrations/031_g5b_listing_sets.up.sql'),
        'utf8',
      );
      await setupPool.query(
        `INSERT INTO booking_group_appointment_commands (
           idempotency_key, actor_id, booking_group_id, request_hash
         ) VALUES ('g3d-rollback-block-probe', 'owner', $1, $2)`,
        [acceptedInitial.group.id, 'd'.repeat(64)],
      );
      await assert.rejects(
        setupPool.query(g3dDown),
        (error) => error?.code === 'P0001'
          && error?.message === 'G3D rollback blocked: booking group handover data exists',
      );
      await assert.rejects(
        setupPool.query(g3cDown),
        (error) => error?.code === 'P0001'
          && error?.message === 'G3C rollback blocked: booking group quote or state data exists',
      );
      await assert.rejects(
        setupPool.query(g3bDown),
        (error) => error?.code === 'P0001'
          && error?.message === 'G3B rollback blocked: booking group data exists',
      );
      await setupPool.query(
        `TRUNCATE
           booking_group_appointments,
           booking_group_appointment_commands,
           booking_group_position_booking_bindings,
           booking_group_commands,
           booking_group_state_events,
           booking_group_quote_positions,
           booking_group_quotes,
           booking_group_positions,
           booking_groups`,
      );
      await setupPool.query(g3dDown);
      await setupPool.query(g3cDown);
      await setupPool.query(g3bDown);
      await setupPool.query(g5bDown);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'booking_group_appointment_commands', 'booking_group_appointments',
              'booking_group_commands', 'booking_group_position_booking_bindings',
              'booking_group_positions',
              'booking_group_quote_positions', 'booking_group_quotes',
              'booking_group_state_events', 'booking_groups'
            )`,
      )).rows[0].count, 0);
      await setupPool.query(g3bUp);
      await setupPool.query(g3cUp);
      await setupPool.query(g3dUp);
      await setupPool.query(g5bUp);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'booking_group_appointment_commands', 'booking_group_appointments',
              'booking_group_commands', 'booking_group_position_booking_bindings',
              'booking_group_positions',
              'booking_group_quote_positions', 'booking_group_quotes',
              'booking_group_state_events', 'booking_groups'
            )`,
      )).rows[0].count, 9);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'listing_set_version_members', 'listing_set_versions', 'listing_sets'
            )`,
      )).rows[0].count, 3);

      await restartApplicationServer();
      const limitedAttempts = [];
      for (let attempt = 0; attempt < 9; attempt += 1) {
        limitedAttempts.push(await fetch(`${baseUrl}/v1/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'unknown@example.com', password: createEphemeralAcceptancePassword() }),
        }));
      }
      assert.equal(limitedAttempts.at(-1).status, 429);
      assert.equal((await limitedAttempts.at(-1).json()).error, 'rate_limit_exceeded');
    } finally {
      if (s4jServer) {
        await new Promise((resolve, reject) => s4jServer.close((error) => (
          error ? reject(error) : resolve()
        )));
      }
      if (server) {
        await new Promise((resolve, reject) => server.close((error) => (
          error ? reject(error) : resolve()
        )));
      }
      if (applicationPool) await applicationPool.end();
      await setupPool.end();
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });
}
