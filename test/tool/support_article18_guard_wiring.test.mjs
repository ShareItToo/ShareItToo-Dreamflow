import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../backend/src/app.js', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../backend/src/support_article18_workflow.js', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../backend/sql/migrations/046_support_article18_authority_referral_guard.up.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../../backend/sql/migrations/046_support_article18_authority_referral_guard.down.sql', import.meta.url),
  'utf8',
);
const privacyExport = readFileSync(
  new URL('../../backend/src/privacy_export.js', import.meta.url),
  'utf8',
);
const retention = readFileSync(
  new URL('../../backend/src/retention_inventory.js', import.meta.url),
  'utf8',
);

test('SUP-121 wiring exposes only an admin and step-up guarded internal preparation path', () => {
  assert.match(
    app,
    /const supportArticle18Limiter = rateLimit\(\{[^\n]*limit: 5/u,
  );
  assert.match(
    app,
    /\/v1\/admin\/support\/cases\/:id\/article-18-assessments[\s\S]*requireAdminRole[\s\S]*requireStaffElevation[\s\S]*supportArticle18Limiter/u,
  );
  assert.match(
    app,
    /\/v1\/admin\/support\/article-18\/candidates[\s\S]*requireAdminRole[\s\S]*requireStaffElevation/u,
  );
  assert.match(workflow, /humanReviewed: true/u);
  assert.match(workflow, /automationRole: 'none'/u);
  assert.match(workflow, /externalDeliveryAllowed: false/u);
  assert.doesNotMatch(workflow, /\bfetch\s*\(|axios|nodemailer|firebase|webhook/iu);
});

test('SUP-122 dispatch route denies normal agents and stays disabled for admins', () => {
  assert.match(
    app,
    /article-18-assessments\/:id\/dispatch[\s\S]*requireAdminRole[\s\S]*requireStaffElevation[\s\S]*supportArticle18Limiter/u,
  );
  assert.match(workflow, /support_article18_dispatch_admin_required/u);
  assert.match(workflow, /support_article18_external_dispatch_disabled/u);
  assert.match(migration, /external_delivery_allowed BOOLEAN NOT NULL DEFAULT false/u);
  assert.match(migration, /CHECK \(NOT external_delivery_allowed\)/u);
  assert.match(migration, /external_delivery_status = 'disabled_not_configured'/u);
  assert.match(
    migration,
    /char_length\(reviewer_authorization_evidence_ref\) BETWEEN 12 AND 300/u,
  );
  assert.doesNotMatch(migration, /\{11,299\}/u);
});

test('restricted assessment evidence is retention-inventoried but omitted from automatic self-service export', () => {
  assert.match(retention, /'support_article18_assessments'/u);
  assert.doesNotMatch(privacyExport, /support_article18_assessments/u);
  assert.match(migration, /support_article18_assessments_append_only/u);
  assert.match(migration, /sit_reject_support_audit_mutation/u);
});

test('rollback refuses to discard Article 18 assessment evidence', () => {
  assert.match(
    rollback,
    /IF EXISTS \(SELECT 1 FROM support_article18_assessments\)[\s\S]*Cannot roll back support Article 18 guard/u,
  );
});
