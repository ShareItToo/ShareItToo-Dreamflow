import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const categories = read('lib/services/data_service.dart');
const pilot = read('lib/config/private_pilot_config.dart');
const backendPilot = read('backend/src/private_pilot_domain.js');
const editor = read('lib/screens/create_listing_screen.dart');
const profile = read('lib/screens/profile_info_screen.dart');
const profileService = read('lib/services/profile_mutation_service.dart');
const repository = read('lib/services/backend_repository.dart');
const data = read('lib/services/data_service.dart');
const navigation = read('lib/navigation/main_navigation.dart');
const publicProfile = read('lib/screens/public_profile_screen.dart');

test('WP189 subcategory fallback is canonical, bounded and readable', () => {
  assert.match(categories, /result\.add\('Sonstiges'\)/u);
  assert.match(pilot, /'cat3': \{[^}]*'Sonstiges'/su);
  assert.match(backendPilot, /cat3: Object\.freeze\(\[[^\]]*'Sonstiges'/su);
  assert.match(pilot, /allowedCategoryIds = \{/u);
  assert.doesNotMatch(pilot, /'cat10'[\s\S]*'Sonstiges'/u);
  assert.match(editor, /height: kMinInteractiveDimension/u);
  assert.match(editor, /style:\s*const TextStyle\(fontSize: 15\)/u);
});

test('WP189 profile avatar uses managed upload, durable profile state and fanout', () => {
  assert.match(repository, /fields\['purpose'\] = purpose/u);
  assert.match(profileService, /purpose: 'profile_image'/u);
  assert.match(profileService, /BackendConfig\.isManagedImageUrl\(url\)/u);
  assert.match(profileService, /profile_image_invalid/u);
  assert.match(profile, /persistPhotoDraft\(/u);
  assert.match(profile, /_photoDraft = result\.user\.photoURL/u);
  assert.match(profile, /_photoDraft = u\.photoURL/u);
  assert.match(data, /SharedPersistenceSync\.accountSecurityStateKey/u);
  assert.match(navigation, /SharedPersistenceSync\.changes\.listen/u);
  assert.match(navigation, /_loadUser\(\)/u);
  assert.match(navigation, /ValueKey\(keySuffix\)/u);
  assert.match(navigation, /_ProfileNavIcon\(photoUrl: photoUrl/u);
  assert.match(publicProfile, /ProfileHeaderCard\(user: u/u);
  assert.doesNotMatch(
    publicProfile,
    /user\.photoURL\s*\?\?\s*['"]https:\/\/images\.unsplash\.com/u,
  );
});
