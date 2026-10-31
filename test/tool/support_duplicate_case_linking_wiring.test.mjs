import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const domain = read('backend/src/support_duplicate_case_domain.js');
const workflow = read('backend/src/support_duplicate_case_workflow.js');
const supportWorkflow = read('backend/src/support_case_workflow.js');
const app = read('backend/src/app.js');
const up = read('backend/sql/migrations/053_support_duplicate_case_linking.up.sql');
const down = read('backend/sql/migrations/053_support_duplicate_case_linking.down.sql');
const privacy = read('backend/src/privacy_export.js');
const retention = read('backend/src/retention_inventory.js');

test('SUP-015 duplicate linking is exact, human-reviewed and non-automatic', () => {
  for (const marker of [
    'sameCoreFactsConfirmed',
    'sameParticipantsAndObjectsConfirmed',
    'sameDecisionQuestionConfirmed',
    'noSeparateDeadlineLossConfirmed',
    'privacyDsaSeparationConfirmed',
  ]) assert.match(domain, new RegExp(marker, 'u'));
  assert.match(domain, /privacy_security[\s\S]*moderation_content[\s\S]*legal_authority/u);
  assert.match(workflow, /automaticMergeAllowed: false/u);
  assert.match(workflow, /externalDeliveryAllowed: false/u);
  assert.doesNotMatch(workflow, /UPDATE support_cases|DELETE FROM support_cases|https?:\/\//iu);
  assert.match(app, /\/v1\/admin\/support\/cases\/:id\/duplicate-links/u);
  assert.match(app, /requireAdminRole, requireStaffElevation, supportDuplicateCaseLimiter/u);
});

test('duplicate history and closure remain append-only and user-visible', () => {
  assert.match(up, /CREATE TABLE support_case_links/u);
  assert.match(up, /support_case_links_append_only/u);
  assert.match(up, /automatic_merge_executed[\s\S]*CHECK \(NOT automatic_merge_executed\)/u);
  assert.match(up, /external_delivery_enabled[\s\S]*CHECK \(NOT external_delivery_enabled\)/u);
  assert.match(up, /case\.duplicate_link_recorded[\s\S]*visibility = 'user_visible'/u);
  assert.match(up, /support_duplicate_case_link_required/u);
  assert.match(supportWorkflow, /closureReason === 'duplicate_merged'/u);
  assert.match(supportWorkflow, /case\.duplicate_link_recorded/u);
  assert.match(down, /Refusing to drop retained support duplicate-case links/u);
});

test('duplicate links stay covered by privacy export and retention inventory', () => {
  assert.match(privacy, /support_case_links/u);
  assert.match(retention, /'support_case_links'/u);
});
