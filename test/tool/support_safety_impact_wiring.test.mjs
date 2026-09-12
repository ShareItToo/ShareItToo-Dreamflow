import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

const read = (file) => fs.readFile(path.join(root, file), 'utf8');

test('SUP-106 through SUP-112 safety review is permanently non-live and proportionate', async () => {
  const [app, rateLimitPolicy, workflow, decision, messageWorkflow, foundation, migration, rollback] = await Promise.all([
    read('backend/src/app.js'),
    read('backend/src/rate_limit_policy.js'),
    read('backend/src/support_safety_impact_workflow.js'),
    read('backend/src/support_decision_workflow.js'),
    read('backend/src/message_workflow.js'),
    read('backend/sql/migrations/001_b3_foundation.up.sql'),
    read('backend/sql/migrations/052_support_safety_impact_review.up.sql'),
    read('backend/sql/migrations/052_support_safety_impact_review.down.sql'),
  ]);

  assert.match(
    rateLimitPolicy,
    /supportIntake: Object\.freeze\(\{ windowMs: 15 \* 60_000, limit: 10 \}\)/u,
  );
  assert.match(
    rateLimitPolicy,
    /supportSafetyIntake: Object\.freeze\(\{ windowMs: 15 \* 60_000, limit: 30 \}\)/u,
  );
  assert.match(
    rateLimitPolicy,
    /skip: isProtectedSafetyRateLimitRequest/u,
  );
  assert.match(
    rateLimitPolicy,
    /isProtectedSupportSafetyIntake\(req\.body\)[\s\S]*supportSafetyIntakeLimiter/u,
  );
  assert.match(app, /\/v1\/admin\/support\/cases\/:id\/safety-impact-reviews/u);
  assert.match(app, /requireAdminRole, requireStaffElevation, supportSafetyImpactLimiter/u);

  assert.match(workflow, /SELECT id, status, is_active, moderation_status[\s\S]*FROM listings/u);
  assert.match(workflow, /SELECT id, workflow_status[\s\S]*FROM bookings/u);
  assert.doesNotMatch(workflow, /UPDATE\s+(?:listings|bookings|users)/iu);
  assert.doesNotMatch(workflow, /fetch\(|https?:|provider|authority.*send/iu);
  assert.match(workflow, /actionExecuted: false/u);
  assert.match(workflow, /externalDeliveryEnabled: false/u);

  assert.match(decision, /support_safety_impact_review_required/u);
  assert.match(decision, /support_safety_impact_review_stale/u);
  assert.match(decision, /support_safety_impact_proportional_scope_required/u);
  assert.match(decision, /`listing:\$\{caseRow\.linked_listing_id\}`/u);
  assert.match(decision, /currentBookingIds\.map\(\(id\) => `booking:\$\{id\}`\)/u);

  assert.match(messageWorkflow, /FROM user_blocks[\s\S]*AS blocked/u);
  assert.match(messageWorkflow, /contact_blocked/u);
  assert.match(app, /app\.post\('\/v1\/support\/cases'[\s\S]{0,180}supportIntakeRateLimiter/u);
  assert.match(foundation, /CREATE TRIGGER audit_log_append_only/u);
  assert.match(foundation, /BEFORE UPDATE OR DELETE ON audit_log/u);

  assert.match(migration, /support_safety_impact_active_admin_step_up_required/u);
  assert.match(migration, /support_safety_impact_reviews_append_only/u);
  assert.match(migration, /CHECK \(NOT action_executed\)/u);
  assert.match(migration, /CHECK \(NOT external_delivery_enabled\)/u);
  assert.match(rollback, /rollback blocked: support safety impact reviews exist/u);
});

test('engineering log call sites do not emit exception messages or raw error objects', async () => {
  const sourceDir = path.join(root, 'backend/src');
  const files = (await fs.readdir(sourceDir))
    .filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const source = await read(`backend/src/${file}`);
    const consoleCalls = source.match(/console\.(?:log|info|warn|error|debug)\([\s\S]{0,500}?\);/gu) ?? [];
    for (const call of consoleCalls) {
      assert.doesNotMatch(call, /error\?\.message|error\.message/iu, file);
      if (!/safeErrorLog|safeOperationalErrorCode|safeProviderCode|errorCode\(/u.test(call)) {
        assert.doesNotMatch(call, /,\s*error\s*\)/u, file);
      }
      assert.doesNotMatch(call, /,\s*failures\s*\)/u, file);
    }
  }
});
