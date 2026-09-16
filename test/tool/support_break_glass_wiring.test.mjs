import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const workflow = readFileSync('backend/src/support_break_glass_workflow.js', 'utf8');
const supportCaseWorkflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/037_support_break_glass_access.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/037_support_break_glass_access.down.sql',
  'utf8',
);

test('break-glass routes require active auth, strong step-up and independent admin review', () => {
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/cases\/:id\/break-glass', requireAuth, requireActiveAccount, requireStaffElevation, supportBreakGlassGrantLimiter/u,
  );
  assert.match(app, /'X-Support-Break-Glass'/u);
  assert.match(app, /req\.staffElevation\.id/u);
  assert.match(app, /req\.get\('X-Support-Break-Glass'\)/u);
  assert.match(
    app,
    /app\.get\('\/v1\/admin\/support\/break-glass\/reviews', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/break-glass\/grants\/:id\/review', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation, supportBreakGlassReviewLimiter/u,
  );
  assert.match(app, /const supportBreakGlassGrantLimiter = rateLimit\([^;]+limit: 5/u);
  assert.match(app, /const supportBreakGlassReviewLimiter = rateLimit\([^;]+limit: 5/u);
});

test('break-glass stays P0-only, case-bound, short-lived and non-live', () => {
  assert.match(workflow, /caseRow\.priority !== 'p0'/u);
  assert.match(workflow, /grantLifetimeMs = 5 \* 60 \* 1000/u);
  assert.match(workflow, /support_case\.priority = 'p0'/u);
  assert.match(workflow, /support_case\.status NOT IN \('resolved', 'closed'\)/u);
  assert.match(workflow, /support_case\.operating_mode IN \('simulation', 'internal_testing'\)/u);
  assert.match(workflow, /staff_elevation_id = \$4/u);
  assert.match(supportCaseWorkflow, /support\.break_glass_case_accessed/u);
  assert.doesNotMatch(workflow, /support_break_glass_grants AS grant\b/u);
  assert.doesNotMatch(privacyExport, /support_break_glass_grants AS grant\b/u);
  assert.doesNotMatch(
    workflow,
    /publishTo|sendEmail|sendPush|refundPayment|releasePayout|paymentProvider|fetch\(/u,
  );
});

test('database independently enforces P0, step-up, immutable grants and mandatory review', () => {
  assert.match(migration, /target_case\.priority <> 'p0'/u);
  assert.match(migration, /creation time must match database time/u);
  assert.match(migration, /target_case\.current_owner_id = NEW\.actor_id/u);
  assert.match(migration, /target_elevation\.expires_at < NEW\.expires_at/u);
  assert.match(migration, /expires_at <= created_at \+ interval '5 minutes'/u);
  assert.match(migration, /review_due_at = expires_at/u);
  assert.match(migration, /reviewer\.role <> 'admin'/u);
  assert.match(migration, /review_staff_elevation_id UUID,/u);
  assert.doesNotMatch(migration, /staff_elevation_id UUID[^\n]*REFERENCES staff_elevations/u);
  assert.doesNotMatch(migration, /session_id UUID[^\n]*REFERENCES auth_sessions/u);
  assert.match(migration, /reviewer_elevation\.role <> 'admin'/u);
  assert.match(migration, /NEW\.reviewed_by = NEW\.actor_id/u);
  assert.match(migration, /reviewed_at > clock_timestamp\(\) \+ interval '30 seconds'/u);
  assert.match(migration, /Break-glass grant core is immutable/u);
  assert.match(migration, /revoked_at = reviewed_at/u);
  assert.match(migration, /revocation requires completed independent review/u);
  assert.match(migration, /support_break_glass_delete_guard/u);
  assert.match(rollback, /IF EXISTS \(SELECT 1 FROM support_break_glass_grants\)/u);
});
