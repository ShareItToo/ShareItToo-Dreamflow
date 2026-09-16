import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canTransitionSupportCase,
  supportCaseStatuses,
  supportStatusMachineSource,
} from '../../backend/src/support_case_domain.js';

const read = (path) => readFileSync(path, 'utf8');
const up = read('backend/sql/migrations/064_support_status_machine_v1_alignment.up.sql');
const down = read('backend/sql/migrations/064_support_status_machine_v1_alignment.down.sql');
const directUp = read('backend/sql/migrations/065_support_direct_decision_path.up.sql');
const directDown = read('backend/sql/migrations/065_support_direct_decision_path.down.sql');
const progress = read('backend/src/support_progress_update_domain.js');
const evidence = read('backend/src/support_evidence_workflow.js');
const messages = read('backend/src/support_message_domain.js');
const decisions = read('backend/src/support_decision_workflow.js');
const screen = read('lib/screens/support_cases_screen.dart');
const regression = read('scripts/technical_regression_check.sh');

const canonicalTransitions = [
  ['received', 'acknowledged'],
  ['acknowledged', 'waiting_for_user'],
  ['acknowledged', 'waiting_for_other_party'],
  ['acknowledged', 'under_review'],
  ['waiting_for_user', 'under_review'],
  ['waiting_for_other_party', 'under_review'],
  ['under_review', 'waiting_for_user'],
  ['under_review', 'waiting_for_other_party'],
  ['under_review', 'escalated'],
  ['escalated', 'under_review'],
  ['under_review', 'decision_pending_approval'],
  ['under_review', 'decided'],
  ['decision_pending_approval', 'decided'],
  ['decision_pending_approval', 'under_review'],
  ['decided', 'resolved'],
  ['resolved', 'closed'],
  ['closed', 'reopened'],
  ['reopened', 'under_review'],
];

test('SUP-001 through SUP-014 bind the exact Drive V1 status machine', () => {
  assert.equal(
    supportStatusMachineSource.sha256,
    '3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55',
  );
  assert.equal(supportStatusMachineSource.statusCount, 11);
  assert.equal(supportStatusMachineSource.transitionCount, 18);
  assert.equal(supportCaseStatuses.length, 11);
  assert.equal(supportCaseStatuses.includes('paused'), false);
  assert.equal(supportCaseStatuses.includes('implementation_pending'), false);

  const actual = [];
  for (const from of supportCaseStatuses) {
    for (const to of supportCaseStatuses) {
      if (canTransitionSupportCase(from, to)) actual.push([from, to]);
    }
  }
  assert.deepEqual(
    actual.map((entry) => entry.join('>')).sort(),
    canonicalTransitions.map((entry) => entry.join('>')).sort(),
  );
});

test('migration retires drift without rewriting existing case history', () => {
  assert.match(up, /support_status_machine_alignment_requires_manual_case_review/u);
  assert.match(up, /implementation_pending_action IS NOT NULL/u);
  assert.match(up, /support_cases_implementation_pending_action_retired/u);
  assert.match(up, /OLD\.status = 'under_review'[\s\S]*NEW\.status IN \([\s\S]*'waiting_for_user'[\s\S]*'waiting_for_other_party'[\s\S]*'decided'/u);
  assert.match(up, /OLD\.status = 'decided' AND NEW\.status = 'resolved'/u);
  assert.match(up, /OLD\.status = 'reopened' AND NEW\.status = 'under_review'/u);
  assert.doesNotMatch(up, /UPDATE support_cases SET status/u);

  assert.match(down, /DROP CONSTRAINT support_cases_implementation_pending_action_retired/u);
  assert.match(down, /'implementation_pending'/u);
  assert.match(down, /OLD\.status = 'implementation_pending'/u);
});

test('green and yellow direct decisions are reviewer-bound while red stays four-eyes', () => {
  assert.match(directUp, /approval_path IN \('separate_review', 'direct_single_reviewer'\)/u);
  assert.match(directUp, /approval_path = 'direct_single_reviewer' AND approved_by = decided_by/u);
  assert.match(directUp, /support_case\.approval_level IN \([\s\S]*'green_automatic', 'yellow_human_review'/u);
  assert.match(directUp, /reviewer\.role = 'admin'/u);
  assert.match(directUp, /support_case\.status = 'under_review'/u);
  assert.match(directUp, /status = 'decided'/u);
  assert.doesNotMatch(directUp, /status IN \('decided', 'implementation_pending'\)/u);
  assert.match(decisions, /\['green_automatic', 'yellow_human_review'\]/u);
  assert.match(decisions, /support_direct_decision_requires_admin/u);
  assert.match(directDown, /support_direct_decision_rollback_requires_manual_review/u);
  assert.doesNotMatch(directDown, /DELETE FROM support_decisions/u);
});

test('every runtime and user projection rejects the retired status', () => {
  for (const [name, source] of [
    ['progress', progress],
    ['evidence', evidence],
    ['messages', messages],
    ['decisions', decisions],
    ['screen', screen],
  ]) {
    assert.doesNotMatch(source, /['"]implementation_pending['"]/u, name);
  }
});

test('complete regression permanently runs the canonical status contract', () => {
  assert.match(
    regression,
    /node --test test\/tool\/support_status_machine_v1_alignment_wiring\.test\.mjs/u,
  );
});
