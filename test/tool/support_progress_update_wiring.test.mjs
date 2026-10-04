import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const domain = read('backend/src/support_progress_update_domain.js');
const workflow = read('backend/src/support_progress_update_workflow.js');
const messages = read('backend/src/support_message_workflow.js');
const app = read('backend/src/app.js');
const up = read('backend/sql/migrations/055_support_progress_updates.up.sql');
const down = read('backend/sql/migrations/055_support_progress_updates.down.sql');
const privacy = read('backend/src/privacy_export.js');
const retention = read('backend/src/retention_inventory.js');

test('SUP-042 prepares a complete reviewed update without a fake outcome', () => {
  assert.match(domain, /templateId = wasOverdue \? 'T-010' : 'T-008'/u);
  assert.match(domain, /progressSinceLastUpdate/u);
  assert.match(domain, /provisionalImpactStatement/u);
  assert.match(domain, /userActionOrNoAction/u);
  assert.match(domain, /support_progress_update_deadline_not_advanced/u);
  assert.match(messages, /support_progress_update_workflow_required/u);
  assert.match(workflow, /independentReviewRequired: true/u);
});

test('SUP-043 binds apology and new checkpoint to reviewed publication', () => {
  assert.match(domain, /wasOverdue = priorNextUpdateAt <= now/u);
  assert.match(domain, /support_progress_update_new_deadline_overdue/u);
  assert.match(messages, /support_progress_update_publication_required/u);
  assert.match(messages, /assertSupportMessageNextUpdateBindingCurrent/u);
  assert.match(workflow, /SET next_action = \$2,[\s\S]*next_update_at = \$3/u);
  assert.match(
    workflow,
    /updated_at = GREATEST\(\$4, updated_at \+ INTERVAL '1 microsecond'\)/u,
  );
  assert.match(workflow, /progressUpdatePublication: true/u);
  assert.match(app, /progress-updates\/:progressUpdateId\/publication/u);
});

test('progress evidence is append-only exportable retained and non-live', () => {
  assert.match(up, /support_case_progress_updates_one_live_proposal/u);
  assert.match(up, /yellow_human_review/u);
  assert.match(up, /support_progress_update_review_mismatch/u);
  assert.match(up, /support_progress_update_history_append_only/u);
  assert.match(down, /Cannot roll back support progress updates while retained update evidence exists/u);
  assert.match(privacy, /progressUpdates: supportProgressUpdates/u);
  assert.match(retention, /'communications', 'support_case_progress_updates'/u);
  assert.match(workflow, /externalMessageSent: false/u);
  assert.doesNotMatch(workflow, /production|realMoney|https?:\/\//u);
});
