import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('P2-B route and repository remain principal-bound and non-binding', () => {
  const profile = read('lib/screens/profile_screen.dart');
  const screen = read('lib/screens/mission_needs_screen.dart');
  const gateway = read('lib/services/mission_need_gateway.dart');
  const repository = read('lib/services/backend_repository.dart');

  assert.match(profile, /PlannerTechnicalConfig\.available/u);
  assert.match(profile, /'route': '\/missionNeeds'/u);
  assert.match(profile, /const MissionNeedsScreen\(\)/u);
  assert.match(screen, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(screen, /isContextCurrent\(context\)/u);
  assert.match(screen, /keine Reservierung, Buchung, kein Vertrag und keine Zahlung/u);
  assert.match(gateway, /AuthSessionOwner owner/u);
  assert.match(repository, /getMissionNeedsForOwner/u);
  assert.match(repository, /createMissionNeedForOwner/u);
  assert.match(repository, /correctMissionNeedForOwner/u);
  assert.match(repository, /_authorizedForOwner/u);
  assert.match(repository, /'Idempotency-Key': idempotencyKey/u);

  for (const forbidden of [
    'rental-cart',
    'booking-groups',
    'listing-ai',
    'image_picker',
    'payment',
  ]) {
    assert.doesNotMatch(
      `${screen}\n${gateway}`,
      new RegExp(forbidden, 'u'),
      `P2-B mission slice must not gain ${forbidden}`,
    );
  }
});
