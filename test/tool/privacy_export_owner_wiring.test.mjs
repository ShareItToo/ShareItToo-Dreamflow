import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('privacy export UI uses the owner-bound service and exact route handles', () => {
  const screen = read('lib/screens/privacy_info_screen.dart');
  assert.match(screen, /final owner = _owner;[\s\S]*final revision = _revision;/u);
  assert.match(screen, /widget\.exportService\.prepare\([\s\S]*?owner: owner,/u);
  assert.match(screen, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(screen, /_passwordDialog\?\.dismiss\(\)/u);
  assert.match(screen, /_outcomeDialog\?\.dismiss\(\)/u);
  assert.match(screen, /showTrackedDialog<String>/u);
  assert.doesNotMatch(screen, /Navigator\.of\([^)]*\)\.pop/u);
  assert.doesNotMatch(screen, /Future(?:<void>)?\.delayed/u);
  assert.doesNotMatch(screen, /BackendRepository\.exportAccountData/u);
  assert.match(screen, /if \(!await _current\(owner, revision\)\) return;[\s\S]*?shareExport/u);
});

test('export HTTP transport cannot refresh or fall back to the current principal', () => {
  const repository = read('lib/services/backend_repository.dart');
  const exportMethod = repository.slice(repository.indexOf('exportAccountData({'),
    repository.indexOf('static Future<void> deleteAccount'));
  assert.match(exportMethod, /required AuthSessionOwner owner/u);
  assert.match(exportMethod, /return _authorizedForOwner\([\s\S]*owner: owner,/u);
  assert.doesNotMatch(exportMethod, /return _authorized\(/u);
  const transport = repository.slice(repository.indexOf('static Future<Map<String, dynamic>> _authorizedForOwner'),
    repository.indexOf('static List<Map<String, dynamic>> _maps'));
  assert.match(transport, /accessTokenForOwner\(owner\)/u);
  assert.match(transport, /isSessionOwnerDefinitelyCurrent\(owner\)/u);
  assert.doesNotMatch(transport, /refreshAccessToken|_token\(/u);
});

test('all six privacy sections remain covered and HTTP profile is mandatory', () => {
  const service = read('lib/services/privacy_export_service.dart');
  for (const name of ['accountProfile', 'savedItems', 'ownedListings', 'reviews', 'operationalRecords', 'safetyPrivacy']) {
    assert.ok(service.includes(`PrivacyExportSection.${name}`));
  }
  assert.match(service, /await requireOwner\(owner\);\s*final value = await readLocal\(section\);\s*await requireOwner\(owner\);/u);
  assert.match(service, /remote\['accountId'\] != owner\.userId/u);
  const gate = read('scripts/technical_regression_check.sh');
  assert.match(gate, /--dart-define=SIT_BACKEND_ENABLED=true \\\n\s*--dart-define=SIT_API_BASE_URL=http:\/\/127\.0\.0\.1:1\/api\/v1 \\\n\s*test\/privacy_export_backend_owner_test\.dart/u);
});
