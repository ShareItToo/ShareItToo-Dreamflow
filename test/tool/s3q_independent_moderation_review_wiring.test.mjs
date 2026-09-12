import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('independent review is claim-bound, human-only and correction-backed', () => {
  const migration = source(
    'backend/sql/migrations/045_independent_moderation_review_resolution.up.sql',
  );
  const rollback = source(
    'backend/sql/migrations/045_independent_moderation_review_resolution.down.sql',
  );
  const workflow = source('backend/src/moderation_decision_workflow.js');
  const correction = source(
    'backend/src/moderation_review_correction_workflow.js',
  );
  const app = source('backend/src/app.js');

  for (const marker of [
    'moderation_review_resolutions_append_only',
    'moderation_review_independent_reviewer_required',
    'moderation_review_requests_resolution_required',
    "automation_role TEXT NOT NULL CHECK (automation_role = 'none')",
    'correction_decision_id UUID UNIQUE',
    "expected_correction_idempotency_key TEXT",
    "correction_row.idempotency_key IS DISTINCT FROM\n            expected_correction_idempotency_key",
  ]) {
    assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.match(
    rollback,
    /rollback refused: independent moderation review evidence exists/u,
  );
  assert.match(workflow, /claimModerationReviewRequest/u);
  assert.match(workflow, /applyCorrection/u);
  assert.match(workflow, /moderation_review_correction_not_applied/u);
  assert.match(
    workflow,
    /review\.status IN \('submitted', 'in_review'\)/u,
  );
  assert.match(correction, /moderation_review_correction_human_only/u);
  assert.match(correction, /moderation_review_measure_state_changed/u);
  assert.match(correction, /newer\.created_at >= original\.created_at/u);
  assert.match(
    app,
    /\/v1\/admin\/moderation\/reviews\/:id\/claim[\s\S]*?requireAdminRole/u,
  );
  assert.match(
    app,
    /\/v1\/admin\/moderation\/reviews\/:id\/resolve[\s\S]*?applyModerationReviewCorrection/u,
  );
});

test('user, admin, export and retention surfaces carry exact review evidence', () => {
  const userScreen = source('lib/screens/moderation_decisions_screen.dart');
  const adminScreen = source('lib/screens/moderation_admin_screen.dart');
  const repository = source('lib/services/backend_repository.dart');
  const privacyExport = source('backend/src/privacy_export.js');
  const retention = source('backend/src/retention_inventory.js');

  assert.match(userScreen, /resolutionDetails/u);
  assert.match(userScreen, /Unabhängig und ausschließlich menschlich geprüft/u);
  assert.match(userScreen, /Prüfergebnis noch nicht vollständig bestätigt/u);
  assert.match(adminScreen, /Unabhängig übernehmen/u);
  assert.match(adminScreen, /resolveStaffModerationReview/u);
  assert.match(repository, /claimStaffModerationReview/u);
  assert.match(repository, /resolveStaffModerationReview/u);
  assert.match(privacyExport, /LEFT JOIN moderation_review_resolutions/u);
  assert.doesNotMatch(privacyExport, /request\.resolution[ ,]/u);
  assert.match(retention, /moderation_review_resolutions/u);
});
