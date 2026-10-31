import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('P3-B remains internal, private, owner-bound and non-public', () => {
  const profile = read('lib/screens/profile_screen.dart');
  const screen = read('lib/screens/private_shelf_screen.dart');
  const gateway = read('lib/services/private_shelf_gateway.dart');
  const repository = read('lib/services/backend_repository.dart');
  const start = repository.indexOf('getPrivateShelfItemsForOwner');
  const end = repository.indexOf('static Future<Map<String, dynamic>> updateListing', start);
  assert.ok(start >= 0 && end > start);
  const privateRepository = repository.slice(start, end);

  assert.match(profile, /if \(PlannerTechnicalConfig\.available\)[\s\S]*?'private_shelf'/u);
  assert.match(profile, /'route': '\/privateShelf'/u);
  assert.match(profile, /const PrivateShelfScreen\(\)/u);
  assert.match(screen, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(screen, /_accountGeneration/u);
  assert.match(screen, /_clearPrivateMedia\(\)/u);
  assert.match(screen, /isContextCurrent\(context\)/u);
  assert.match(screen, /Privat · kein Inserat/u);
  assert.match(screen, /Image\.memory/u);
  assert.doesNotMatch(screen, /AppImage/u);
  assert.doesNotMatch(screen, /Image\.network/u);

  assert.match(gateway, /AuthSessionOwner owner/u);
  assert.match(gateway, /await _requireCurrent\(owner\);[\s\S]*?await BackendRepository/u);
  assert.match(gateway, /await BackendRepository[\s\S]*?await _requireCurrent\(owner\);/u);
  assert.match(gateway, /cacheControl\.contains\('private'\)/u);
  assert.match(gateway, /cacheControl\.contains\('no-store'\)/u);
  assert.match(privateRepository, /'\/private-shelf'/u);
  assert.match(privateRepository, /http\.MultipartRequest/u);
  assert.match(privateRepository, /BackendHttp\.requestBytes/u);
  assert.doesNotMatch(privateRepository, /['"]\/uploads/u);

  for (const forbidden of [
    '/listings',
    '/search',
    '/rental-cart',
    '/bookings',
    '/payments',
    'listing-ai',
    'location',
  ]) {
    assert.doesNotMatch(
      `${screen}\n${gateway}\n${privateRepository}`,
      new RegExp(forbidden, 'u'),
      `P3-B must not gain ${forbidden}`,
    );
  }
});

test('P3-B upload is one-shot and an unknown outcome requires readback', () => {
  const screen = read('lib/screens/private_shelf_screen.dart');
  assert.match(screen, /_uploadOutcomeUnknown/u);
  assert.match(screen, /Das Foto wird nicht automatisch erneut gesendet/u);
  assert.match(screen, /Serverstand vor erneutem Upload laden/u);
  assert.doesNotMatch(screen, /retryUpload|uploadRetry/u);
});

test('P3-B modals and authoritative refresh preserve principal truth', () => {
  const screen = read('lib/screens/private_shelf_screen.dart');
  const agents = read('AGENTS.md');

  assert.match(screen, /_deleteFlowActive/u);
  assert.match(screen, /_photoFlowActive/u);
  assert.match(screen, /_pickerFlowActive/u);
  assert.ok(
    screen.indexOf('setState(() => _deleteFlowActive = true)')
      < screen.indexOf('showTrackedDialog<bool>'),
  );
  assert.ok(
    screen.indexOf('setState(() => _photoFlowActive = true)')
      < screen.indexOf('await _loadMedia('),
  );
  assert.match(screen, /deleteDialog\?\.dismiss\(false\)/u);
  assert.match(screen, /photoDialog\?\.dismiss\(\)/u);
  assert.match(screen, /final selectedId = _selected\?\.shelfItemId/u);
  assert.match(screen, /_mediaGeneration \+= 1/u);
  assert.match(screen, /mediaGeneration != _mediaGeneration/u);
  assert.match(screen, /_mediaLoads\.clear\(\)/u);
  assert.match(screen, /_applyServerItem\(refreshed\)/u);
  assert.match(screen, /preserveDraft = _creating/u);
  assert.match(screen, /_sameOwner\(previousContext, attemptedContext\)/u);
  assert.match(screen, /AlwaysScrollableScrollPhysics/u);
  assert.match(agents, /Account-bound modal\/read flows must become single-flight/u);
  assert.match(agents, /preserving same-principal unsent drafts and idempotency keys/u);
});

test('P3-B owner HTTP proof is mandatory in the standard regression runner', () => {
  const runner = read('scripts/technical_regression_check.sh');
  const command = [
    'flutter test --no-pub --test-randomize-ordering-seed=7 \\',
    '  --dart-define=SIT_BACKEND_ENABLED=true \\',
    '  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1 \\',
    '  test/private_shelf_gateway_http_test.dart',
  ].join('\n');
  assert.equal(runner.split(command).length - 1, 1);
});
