import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/support_flow_screen.dart', 'utf8');
const casesScreen = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');
const domain = readFileSync('backend/src/support_case_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/042_support_dsa_notice_intake.up.sql',
  'utf8',
);

test('SUP-027 has a separate user-facing DSA intake with required evidence', () => {
  assert.match(screen, /Rechtswidrigen Inhalt melden/u);
  assert.match(screen, /support_dsa_content_locator/u);
  assert.match(screen, /support_dsa_illegality_statement/u);
  assert.match(screen, /support_dsa_good_faith/u);
  assert.match(screen, /moderation_content/u);
  assert.match(screen, /illegal_content_notice/u);
  assert.match(screen, /keine automatische Entfernung/u);
});

test('server derives reporter identity and returns only the opaque Notice ID', () => {
  assert.match(domain, /sit_dsa_notice_intake_v1/u);
  assert.match(domain, /support_dsa_notice_good_faith_required/u);
  assert.match(workflow, /profile ->> 'displayName'/u);
  assert.match(workflow, /newHumanReadableDsaNoticeNumber/u);
  assert.match(workflow, /dsaNoticeNumber: row\.dsa_notice_number/u);
  assert.doesNotMatch(workflow, /dsaNoticeEvidence: row\.dsa_notice_evidence/u);
  assert.match(casesScreen, /Notice-ID:/u);
});

test('DSA evidence is immutable, privacy-exported and remains human-review only', () => {
  assert.match(domain, /moderation_content: 'moderation_owner'/u);
  assert.match(domain, /caseSubType === 'illegal_content_notice'/u);
  assert.match(domain, /red_explicit_decision/u);
  assert.match(migration, /support_dsa_notice_required/u);
  assert.match(migration, /support_dsa_notice_immutable/u);
  assert.match(privacyExport, /support_case\.dsa_notice_number/u);
  assert.match(privacyExport, /support_case\.dsa_notice_evidence/u);
  assert.match(
    privacyExport,
    /CASE WHEN support_case\.reporter_user_id = \$1[\s\S]*THEN support_case\.dsa_notice_evidence ELSE NULL/u,
  );
});
