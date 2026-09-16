import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/support_flow_screen.dart', 'utf8');
const domain = readFileSync('backend/src/support_case_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/040_support_single_issue_intake.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/040_support_single_issue_intake.down.sql',
  'utf8',
);

test('SUP-026 blocks category selection until one issue is confirmed', () => {
  assert.match(screen, /support_issue_scope_question/u);
  assert.match(screen, /support_issue_scope_multiple/u);
  assert.match(screen, /support_issue_separation_guidance/u);
  assert.match(screen, /Ein Problem für diesen Fall auswählen/u);
  assert.match(screen, /_singleIssueConfirmed != true/u);
});

test('server requires versioned scope evidence and stores it in audit truth', () => {
  assert.match(domain, /sit_support_single_issue_scope_v1/u);
  assert.match(domain, /support_single_issue_confirmation_required/u);
  assert.match(workflow, /intake_scope_evidence/u);
  assert.match(workflow, /issueScope: normalized\.issueScope/u);
  assert.match(workflow, /issueScopeVersion: normalized\.issueScope\.version/u);
});

test('database evidence is exact, immutable and rollback guarded', () => {
  assert.match(migration, /support_cases_intake_scope_evidence_shape_check/u);
  assert.match(migration, /support_issue_scope_immutable/u);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON support_cases/u);
  assert.match(
    rollback,
    /Cannot roll back support single-issue intake while evidence exists/u,
  );
});
