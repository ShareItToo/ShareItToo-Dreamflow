import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('account export remains an exact purpose-bound authenticated POST contract', () => {
  const app = read('backend/src/app.js');
  const route = app.slice(
    app.indexOf("app.post('/v1/account/export'"),
    app.indexOf("app.post('/v1/account/deletion'"),
  );
  assert.match(route, /Object\.keys\(raw\)\.length !== 2/u);
  assert.match(route, /Object\.hasOwn\(raw, 'currentPassword'\)/u);
  assert.match(route, /Object\.hasOwn\(raw, 'exportPurpose'\)/u);
  assert.match(route, /validateAccountExportPurpose\(raw\.exportPurpose\)/u);
  assert.match(route, /schemaVersion: '2\.0'/u);
  assert.match(route, /buildAccountExport\(client, req\.auth\.userId, \{\s*purpose: exportPurpose,\s*\}\)/u);
  assert.match(route, /shareittoo-access-copy\.json/u);
  assert.match(route, /shareittoo-data-portability\.json/u);
  assert.doesNotMatch(app, /app\.get\('\/v1\/account\/export'/u);
});

test('policy ratchet keeps known credential, provider, security, and moderation internals withheld', () => {
  const policy = read('backend/src/privacy_export_policy.js');
  for (const key of [
    'device_label',
    'user_agent',
    'ip_address',
    'provider_subject',
    'firebase_user_id',
    'session_id',
    'idempotency_key',
    'request_hash',
    'response_payload',
    'payment_configuration_key',
    'compatibility_hash',
    'moderation_status',
    'moderation_reason_code',
    'facts',
    'basis',
    'reasoning',
    'detection_method',
    'request_id',
  ]) {
    assert.match(policy, new RegExp(`'${key}'`, 'u'), key);
  }
  assert.match(policy, /credentialKeyPattern/u);
  assert.match(policy, /assertSanitized\(data, references\)/u);
  assert.match(policy, /rawInternalIdentifiersIncluded: false/u);
  assert.match(policy, /authenticationSecretsIncluded: false/u);
});

test('portability is own-or-observed only and quote positions follow owned quotes', () => {
  const policy = read('backend/src/privacy_export_policy.js');
  assert.match(policy, /const ownQuotes = own\(groups\.quotes, 'proposed_by_me'\)/u);
  assert.match(policy, /ownQuoteIds\.has\(entry\?\.group_quote_id\)/u);
  assert.match(policy, /messages: own\(communication\.messages, 'sent_by_me'\)/u);
  assert.match(policy, /messages: own\(support\.messages, 'sent_by_me'\)/u);
  assert.match(policy, /entry\?\.relationship === 'submitted'/u);
  assert.match(policy, /portabilityExcludesReceivedAndInferredRecords/u);
  assert.doesNotMatch(
    policy.slice(policy.indexOf('function portabilityProjection'), policy.indexOf('function collectIdentifiers')),
    /auditEvents|moderationDecisions|notifications:\s*\{[\s\S]*history/u,
  );
});

test('Flutter keeps purpose selection, principal binding, and exact private filenames coupled', () => {
  const service = read('lib/services/privacy_export_service.dart');
  const screen = read('lib/screens/privacy_info_screen.dart');
  const store = read('lib/services/privacy_export_file_store.dart');
  assert.match(service, /enum PrivacyExportPurpose/u);
  assert.match(service, /accessCopy\('access_copy'\)/u);
  assert.match(service, /dataPortability\('data_portability'\)/u);
  assert.match(service, /remote\['exportPurpose'\] != purpose\.wireValue/u);
  assert.match(service, /remote\['accountId'\] != owner\.userId/u);
  assert.match(screen, /DropdownButtonFormField<PrivacyExportPurpose>/u);
  assert.match(screen, /purpose: authorization\.purpose/u);
  assert.match(store, /privacyExportFilenames\.contains\(filename\)/u);
  assert.match(store, /shareittoo-access-copy\.json/u);
  assert.match(store, /shareittoo-data-portability\.json/u);
});
