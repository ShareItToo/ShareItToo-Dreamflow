import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const flow = readFileSync('lib/screens/support_flow_screen.dart', 'utf8');
const cases = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const app = readFileSync('backend/src/app.js', 'utf8');
const domain = readFileSync('backend/src/support_case_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/043_support_dsa_notice_locator_completion.up.sql',
  'utf8',
);

test('SUP-113 records a Notice before exact-locator completeness review', () => {
  assert.match(flow, /Notice-ID/u);
  assert.match(flow, /auch ohne exakten Fundort absenden/u);
  assert.match(domain, /needs_clarification/u);
  assert.match(workflow, /newHumanReadableDsaNoticeNumber/u);
  assert.match(workflow, /dsaNoticeLocatorStatus/u);
});

test('SUP-114 provides a reporter-only, versioned locator completion path', () => {
  assert.match(app, /support\/cases\/:id\/dsa-locator/u);
  assert.match(repository, /completeSupportDsaNoticeLocator/u);
  assert.match(cases, /support_dsa_locator_follow_up/u);
  assert.match(cases, /expectedVersion/u);
  assert.match(workflow, /reporter_user_id = \$2/u);
  assert.match(workflow, /support_case_version_conflict/u);
  assert.match(migration, /support_dsa_notice_locator_amendments_append_only/u);
});

test('locator follow-up does not make or implement a moderation decision', () => {
  assert.match(cases, /entfernt keinen Inhalt automatisch/u);
  assert.match(workflow, /automation_used, visibility/u);
  assert.match(workflow, /false, 'user_visible'/u);
  assert.doesNotMatch(workflow, /removeContent/u);
});
