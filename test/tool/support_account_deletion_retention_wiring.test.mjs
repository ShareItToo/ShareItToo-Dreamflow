import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const app = read('backend/src/app.js');
const workflow = read('backend/src/support_message_workflow.js');
const service = read('lib/services/account_deletion_service.dart');
const account = read('lib/screens/account_settings_screen.dart');
const help = read('lib/screens/help_center_screen.dart');
const migration = read(
  'backend/sql/migrations/041_support_closed_account_access_guard.up.sql',
);

test('open support records are disclosed but do not block account deletion', () => {
  assert.match(app, /const retainedRecords = \[[\s\S]*support_case_records/u);
  assert.doesNotMatch(
    app,
    /const definitions = \[[\s\S]*support_case_records[\s\S]*const blockers/u,
  );
  assert.match(app, /pseudonymous_support_case_records/u);
  assert.match(service, /remote\['retainedRecords'\]/u);
  assert.match(service, /List<AccountDeletionRetainedRecord> retainedRecords/u);
});

test('account deletion UI makes retained support records and access separation explicit', () => {
  assert.match(account, /_showRetainedRecordsConfirmation/u);
  assert.match(account, /Supportakte bleibt gespeichert/u);
  assert.match(account, /Du kannst dich danach nicht mehr anmelden/u);
  assert.match(account, /erhältst keine neuen In-App-Supportnachrichten/u);
  assert.match(help, /Eine offene Supportakte allein blockiert die Löschung nicht/u);
});

test('workflow and database reject delivery to a closed recipient account', () => {
  assert.match(workflow, /support_message_recipient_account_closed/u);
  assert.match(workflow, /recipient\.account_status AS recipient_account_status/u);
  assert.match(workflow, /FOR UPDATE OF message, recipient/u);
  assert.match(migration, /Support message recipient account must be active/u);
  assert.match(migration, /BEFORE INSERT ON support_messages/u);
  assert.match(migration, /BEFORE UPDATE OF send_status ON support_messages/u);
});

test('the independent legal-hold blocker remains fail closed', () => {
  assert.match(app, /\['active_legal_holds', 'Rechtliche Aufbewahrungssperre'\]/u);
});
