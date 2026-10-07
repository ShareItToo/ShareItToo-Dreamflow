import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync('lib/screens/support_flow_screen.dart', 'utf8');
const domain = readFileSync('backend/src/support_case_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');

test('SUP-028 exposes every canonical privacy subtype in normal support', () => {
  assert.match(screen, /'privacy': \{/u);
  for (const subtype of [
    'access_or_copy_request',
    'correction_or_deletion_request',
    'objection_or_restriction_request',
    'unauthorized_data_exposure',
    'suspected_personal_data_breach',
    'wrong_recipient_or_wrong_account',
    'identity_verification_for_rights_request',
  ]) {
    assert.match(screen, new RegExp(`'${subtype}'`, 'u'));
    assert.match(domain, new RegExp(`'${subtype}'`, 'u'));
  }
});

test('privacy receipt is bound to the server-confirmed route and update time', () => {
  assert.match(screen, /value\['caseType'\] != route\.caseType/u);
  assert.match(screen, /value\['caseSubType'\] != route\.caseSubType/u);
  assert.match(screen, /eigener Datenschutz-Fall/u);
  assert.match(screen, /Nächstes Update spätestens/u);
});

test('backend routes privacy cases to a privacy owner and keeps the audit flag', () => {
  assert.match(domain, /privacy_security: 'privacy_owner'/u);
  assert.match(domain, /privacyFlag: caseType === 'privacy_security'/u);
  assert.match(domain, /p2: 240/u);
  assert.match(workflow, /current_owner_role/u);
  assert.match(workflow, /next_update_at/u);
});
