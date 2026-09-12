import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('explicit background family is the sole Material theme override', async () => {
  const [main, service] = await Promise.all([
    read('lib/main.dart'),
    read('lib/services/background_theme_service.dart'),
  ]);

  assert.match(main, /themeMode:\s*backgroundTheme\.themeMode/);
  assert.doesNotMatch(main, /themeMode:\s*ThemeMode\.system/);
  assert.match(
    service,
    /ThemeMode get themeMode[\s\S]*Brightness\.dark => ThemeMode\.dark[\s\S]*Brightness\.light => ThemeMode\.light[\s\S]*null => ThemeMode\.system/,
  );
  assert.match(
    service,
    /Future<void> clearChoice\(\)[\s\S]*_selectedChoice = null[\s\S]*prefs\.remove\(_prefsKey\)/,
  );
});

test('persisted background choice is hydrated before the first app frame', async () => {
  const main = await read('lib/main.dart');

  const createIndex = main.indexOf(
    'final backgroundThemeController = BackgroundThemeController();',
  );
  const hydrateIndex = main.indexOf(
    'await backgroundThemeController.loadFromPrefs();',
  );
  const runAppIndex = main.indexOf('runApp(\n    MyApp(');

  assert.notEqual(createIndex, -1);
  assert.ok(hydrateIndex > createIndex);
  assert.ok(runAppIndex > hydrateIndex);
  assert.match(
    main,
    /MyApp\([\s\S]*backgroundThemeController: backgroundThemeController[\s\S]*ChangeNotifierProvider<BackgroundThemeController>\.value\([\s\S]*value: backgroundThemeController/,
  );
  assert.doesNotMatch(
    main,
    /create:\s*\(_\) => BackgroundThemeController\(\)\.\.loadFromPrefs\(\)/,
  );
});

test('background surface keeps family-aware contrast and exact selection semantics', async () => {
  const [theme, screen] = await Promise.all([
    read('lib/theme.dart'),
    read('lib/screens/background_settings_screen.dart'),
  ]);

  assert.match(
    theme,
    /choice\.family == Brightness\.dark[\s\S]*\? Colors\.black[\s\S]*: Colors\.white/,
  );
  assert.match(screen, /label: 'Systemeinstellung verwenden'/);
  assert.match(screen, /selected: selected == null/);
  assert.match(screen, /label: '\$\{choice\.uiLabel\} Hintergrund'/);
  assert.match(screen, /selected: selected/);
  assert.match(screen, /previewIsDark \? Colors\.white : const Color\(0xFF0F172A\)/);
});
