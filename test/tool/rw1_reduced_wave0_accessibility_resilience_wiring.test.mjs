import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

const matrix = source('test/reduced_wave0_accessibility_resilience_test.dart');
const listing = source('lib/screens/create_listing_screen.dart');
const cart = source('lib/screens/wishlists_screen.dart');
const popup = source('lib/widgets/app_popup.dart');
const options = source('lib/widgets/listing_options_dialog.dart');
const regression = source('scripts/technical_regression_check.sh');

test('retains the exact compact large-text matrix and profile', () => {
  assert.match(matrix, /physicalSize = const Size\(320, 568\)/u);
  assert.match(matrix, /textScaler: const TextScaler\.linear\(2\)/u);
  assert.match(matrix, /PrivatePilotConfig\.stageANonBindingPilotEnabled/u);
  assert.match(matrix, /PrivatePilotConfig\.blueOceanListingAssistantEnabled/u);
  assert.match(
    regression,
    /SIT_STAGE_A_NON_BINDING_PILOT=true[\s\S]*SIT_BLUE_OCEAN_LISTING_ASSISTANT=true[\s\S]*test\/reduced_wave0_accessibility_resilience_test\.dart/u,
  );
});

test('retains safe-height dialogs and explicit option semantics', () => {
  assert.match(options, /class _ScrollableOptionsPanel/u);
  assert.match(options, /maxHeight: availableHeight/u);
  assert.match(options, /SingleChildScrollView\(/u);
  assert.match(options, /minHeight: kMinInteractiveDimension/u);
  assert.match(options, /Semantics\([\s\S]*button: true,[\s\S]*onTap: onTap/u);
  assert.match(popup, /_scrollableGlassCard\(_GlassCard\(/u);
  assert.match(popup, /SingleChildScrollView\([\s\S]*primary: false/u);
});

test('retains compact Mietkorb and listing-form adaptations', () => {
  assert.match(cart, /final useUnifiedScroll =/u);
  assert.match(cart, /MediaQuery\.textScalerOf\(context\)\.scale\(1\) > 1\.3/u);
  assert.match(cart, /_buildFolderGrid\(context, embedded: true\)/u);
  assert.match(cart, /crossAxisAlignment: CrossAxisAlignment\.stretch/u);
  assert.match(listing, /DropdownButtonFormField<String>\([\s\S]*isExpanded: true/u);
  assert.match(listing, /SwitchListTile\.adaptive\(/u);
  assert.match(listing, /Flexible\([\s\S]*Stornierungsbedingungen/u);
});

test('retains focus, rapid interaction, semantics and route recreation proofs', () => {
  for (const marker of [
    'listing options retain keyboard focus and safe route recreation',
    'rapid repeated save activation opens only one selection flow',
    'listing declaration and publication controls survive compact large text',
    'non-reserving cart remains usable on compact 200 percent text surface',
    'SemanticsAction.tap',
    'handlePopRoute',
  ]) {
    assert.match(matrix, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});
