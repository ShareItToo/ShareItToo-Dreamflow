import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const files = [
  'lib/services/mission_web_location.dart',
  'lib/services/mission_web_location_web.dart',
  'lib/services/mission_web_location_stub.dart',
  'test/mission_web_location_test.dart',
  'test/tool/mission_web_location_boundary.test.mjs',
  'lib/services/app_link_service.dart',
  'test/app_link_service_test.dart',
];
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('D6 location has only its exact observation and initial-ingress consumers', () => {
  for (const directory of ['lib', 'backend/src', 'backend/test', 'backend/ops', 'tool', 'scripts', 'web', 'test']) {
    for (const name of readdirSync(new URL(`${directory}/`, root), { recursive: true })) {
      const path = `${directory}/${name}`;
      if (!/\.(dart|js|mjs|json|sh|html)$/u.test(name) || files.includes(path)) continue;
      assert.doesNotMatch(read(path), /mission_web_location|MissionWebLocation|readMissionWebLocation/u, path);
    }
  }
});

test('initial integration uses captured metadata and legacy-only fallback, with no MultiEntry activation', () => {
  const source = read('lib/services/app_link_service.dart');
  const initial = source.slice(source.indexOf('  void initialize()'), source.indexOf('  @override\n  Future<bool> didPushRouteInformation'));
  assert.match(initial, /if \(_disposed \|\| _initialized\) return;/u);
  assert.match(initial, /if \(_initialIsWeb\)/u);
  assert.match(initial, /_initialWebCapture\?\.target/u);
  assert.match(initial, /_initialWebCapture == null && !kReleaseMode/u);
  assert.match(source, /AppLinkParser\.parse\(readLegacyUri\(\)\)/u);
  assert.doesNotMatch(initial, /parseRaw|Uri\.base\.toString|history|pushState|replaceState|addEventListener|print\(|debugPrint/u);
  assert.match(source, /_initialIsWeb = kReleaseMode \? kIsWeb/u);
  assert.match(source, /@visibleForTesting\s+MissionWebLocation Function\(\)\? readInitialBrowserLocation/u);
  assert.match(source, /_readInitialBrowserLocation = kReleaseMode\s*\? readMissionWebLocation\s*:\s*\(readInitialBrowserLocation \?\? readMissionWebLocation\)/u);
  assert.match(source, /_initialWebCapture = kReleaseMode\s*\? _takeInitialWebCapture\(\)/u);
  assert.match(source, /@visibleForTesting InitialWebAppLinkCapture\? initialWebCapture/u);
  assert.match(source, /Future<bool> didPushRouteInformation\(\s*RouteInformation routeInformation,\s*\) async \{\s*_capture\(routeInformation\.uri\.toString\(\)\);\s*return true;\s*\}/u);
  assert.doesNotMatch(source, /fromEnvironment|SIT_|pushState|replaceState|addEventListener/u);
});

test('production captures before binding, then configures conditional SDK path strategy; history is still pending', () => {
  const main = read('lib/main.dart');
  assert.ok(main.indexOf('prepareInitialWebAppLinks();') > main.indexOf('Future<void> main()'));
  assert.ok(main.indexOf('prepareInitialWebAppLinks();') < main.indexOf('WidgetsFlutterBinding.ensureInitialized();'));
  const source = read('lib/services/app_link_service.dart');
  assert.match(source, /if \(!kIsWeb \|\| _initialWebCapturePrepared\) return;/u);
  assert.match(source, /readLocation: readMissionWebLocation/u);
  assert.match(source, /configurePaths: web_paths\.configureCleanWebPaths/u);
  assert.match(source, /bool get multiEntryHistoryVerified => false;/u);
  assert.match(source, /if \(dart\.library\.html\) 'web_path_strategy_web.dart'/u);
  assert.match(read('lib/services/web_path_strategy_web.dart'), /void configureCleanWebPaths\(\) => usePathUrlStrategy\(\);/u);
  assert.match(read('lib/services/web_path_strategy_stub.dart'), /void configureCleanWebPaths\(\) \{\}/u);
  assert.doesNotMatch(source, /selectMultiEntryHistory|pushState\(|replaceState\(/u);
  assert.match(read('pubspec.yaml'), /flutter_web_plugins:\s+sdk: flutter/u);
  const allowed = new Set(['lib/services/app_link_service.dart', 'lib/services/web_path_strategy_web.dart',
    'lib/services/web_path_strategy_stub.dart', 'test/app_link_service_test.dart', 'test/tool/mission_web_location_boundary.test.mjs']);
  for (const directory of ['lib', 'test', 'web']) {
    for (const name of readdirSync(new URL(`${directory}/`, root), { recursive: true })) {
      const path = `${directory}/${name}`;
      if (!/\.(dart|js|mjs|html)$/u.test(name) || allowed.has(path)) continue;
      assert.doesNotMatch(read(path), /web_path_strategy_|configureCleanWebPaths|usePathUrlStrategy/u, path);
    }
  }
});

test('web adapter only observes serialized href; stub cannot fabricate one', () => {
  const web = read(files[1]);
  assert.deepEqual([...web.matchAll(/^import '([^']+)'(?: as [a-zA-Z]+)?;/gmu)].map((m) => m[1]), ['package:web/web.dart']);
  assert.equal((web.match(/web\.window\.location\.href/gu) ?? []).length, 1);
  assert.match(web, /return web\.window\.location\.href;/u);
  assert.match(web.replace(/\/\/[^\n]*/gu, '').trim(),
    /^import 'package:web\/web\.dart' as web;\s+String\? readBrowserSerializedHref\(\) \{\s+try \{\s+return web\.window\.location\.href;\s+\} catch \(_\) \{\s+return null;\s+\}\s+\}$/u);
  assert.doesNotMatch(web, /location\.[a-zA-Z]+\s*=|\.href\s*=|Uri\.|\.decode|\.trim|\.toLowerCase/u);
  assert.match(read(files[2]), /String\? readBrowserSerializedHref\(\) => null;/u);
});

test('observation/controller imports no routes or capability and performs no effects', () => {
  for (const file of files.slice(0, 3)) {
    assert.doesNotMatch(read(file), /history\.|pushState|replaceState|addEventListener|removeEventListener|Navigator|AppLink|fromEnvironment|SIT_|Backend|AuthService|SharedPreferences|HttpClient|WebSocket|fetch\(|localStorage|sessionStorage|analytics|firebase|Timer|DateTime|Random|print\(|debugPrint|originalUrl/u, file);
  }
  const source = read(files[0]);
  assert.deepEqual([...source.matchAll(/'(package:[^']+)'/gu)].map((m) => m[1]), [
    'package:lendify/services/mission_web_location_stub.dart',
    'package:lendify/services/mission_web_location_web.dart',
  ]);
  assert.match(source, /if \(dart\.library\.html\)/u);
  assert.doesNotMatch(source, /Uri\.|package:(?!lendify\/services\/mission_web_location_)/u);
  assert.match(source, /browserSerialized/u);
  assert.match(source, /bool get activationAllowed => false;/u);
  assert.match(source, /final MissionWebLocationHost\? host;/u);
  assert.doesNotMatch(source, /final String\?? (?:href|url|browserSerializedHref)|String\?? _/u);
});
