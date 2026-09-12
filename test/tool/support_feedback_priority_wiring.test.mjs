import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const screen = read('lib/screens/support_flow_screen.dart');
const domain = read('backend/src/support_case_domain.js');
const workflow = read('backend/src/support_case_workflow.js');
const up = read('backend/sql/migrations/054_support_feedback_priority.up.sql');
const down = read('backend/sql/migrations/054_support_feedback_priority.down.sql');
const privacy = read('backend/src/privacy_export.js');
const retention = read('backend/src/retention_inventory.js');

test('SUP-030 maps explicitly non-urgent feedback to P4 without escalation', () => {
  assert.match(domain, /feedback_or_improvement/u);
  assert.match(domain, /supportFeedbackContextVersion = 'sit_support_feedback_context_v1'/u);
  assert.match(domain, /priority = 'p4'/u);
  assert.match(domain, /support_feedback_urgent_route_required/u);
  assert.match(domain, /support_feedback_entity_link_not_allowed/u);
  assert.match(screen, /Feedback & Verbesserung/u);
  assert.match(screen, /nonUrgentConfirmed': true/u);
  assert.match(screen, /künstliche Eskalation/u);
});

test('P4 feedback context is exact, immutable and rollback guarded', () => {
  assert.match(up, /priority IN \('p0', 'p1', 'p2', 'p3', 'p4'\)/u);
  assert.match(up, /support_cases_feedback_context_shape_check/u);
  assert.match(up, /support_cases_feedback_route_check/u);
  assert.match(up, /support_feedback_context_immutable/u);
  assert.match(up, /linked_payment_id IS NULL/u);
  assert.match(up, /NOT safety_flag/u);
  assert.match(down, /Refusing to drop retained support feedback context/u);
});

test('feedback is auditable, exportable and remains in existing retention scope', () => {
  assert.match(workflow, /feedback_context/u);
  assert.match(workflow, /feedbackContextVersion/u);
  assert.match(privacy, /support_case\.feedback_context/u);
  assert.match(retention, /'support_cases'/u);
  assert.doesNotMatch(up, /production|external_delivery_enabled|https?:\/\//iu);
});
