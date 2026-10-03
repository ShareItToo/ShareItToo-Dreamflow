import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('Web router owns one stable root navigator and preserves production wrappers', () => {
  const main = read('lib/main.dart');
  assert.match(main, /if \(kIsWeb\) \{\s*return WebAppRouterHost/u);
  assert.match(main, /controller: context\.read<AppLinkController>\(\)/u);
  assert.match(main, /root: const AppLinkHost\(child: AppRoot\(\)\)/u);
  assert.match(main, /MaterialApp\.router\(\s*routerConfig: config/u);
  for (const surface of ['PrivacyExportCacheLifecycleHost', 'ForegroundPushHost', 'AppGradientBackground', 'buildSyntheticCloneMaterialAppShell']) {
    assert.ok(main.includes(surface));
  }
  const router = read('lib/navigation/web_app_router.dart');
  assert.match(router, /late final RouterConfig<Object> _config/u);
  assert.match(router, /late final Page<void> _anchor/u);
  assert.match(router, /pages: \[_anchor\]/u);
  assert.match(router, /PopNavigatorRouterDelegateMixin/u);
  assert.doesNotMatch(router, /reportsRouteUpdateToEngine:\s*true|pushState|replaceState|selectSingleEntryHistory/u);
});

test('browser ingress is exclusive and serialized before parser normalization', () => {
  const router = read('lib/navigation/web_app_router.dart');
  const service = read('lib/services/app_link_service.dart');
  assert.match(router, /_classify\(platform\.readBrowserSerializedHref\(\), information\.state\)/u);
  assert.match(service, /if \(_webRouterOwnsIngress\) return false;/u);
  assert.match(router, /setInitialRoutePath\(Object configuration\) async \{/u);
  assert.match(router, /Router\.navigate\(context, notifyListeners\)/u);
  assert.match(router, /Router\.neglect\(context, notifyListeners\)/u);
  assert.match(router, /if \(kReleaseMode\) return Future<void>\.value\(\);/u);
  assert.doesNotMatch(router, /fromEnvironment|SIT_|HttpClient|WebSocket|SharedPreferences|localStorage|sessionStorage|FirebaseRuntime|print\(|debugPrint\(/u);
});

test('history state is an exact non-private cursor; ownership is in memory and rechecked', () => {
  const router = read('lib/navigation/web_app_router.dart');
  const state = router.match(/state: <String, Object>\{([^}]+)\}/u)?.[1];
  assert.equal(state?.replace(/\s+/gu, ' ').trim(), "'version': 1, 'instance': instance, 'entry': entry");
  assert.match(router, /request\.instance != _instance/u);
  assert.match(router, /restoredOwner: retained\?\.action\.owner/u);
  assert.match(router, /generation == _generation/u);
  assert.match(router, /_entries\.clear\(\)/u);
  assert.match(router, /route\.navigator\?\.removeRoute\(route\)/u);
  assert.doesNotMatch(router, /popUntil|pushAndRemoveUntil/u);
});

test('only the production bootstrap, owned-route host and exact tests consume bridge', () => {
  const allowed = new Set(['lib/navigation/web_app_router.dart', 'lib/main.dart',
    'lib/screens/app_link_destination_screen.dart', 'test/web_app_router_test.dart',
    'test/tool/web_app_router_boundary.test.mjs', 'test/tool/mission_web_location_boundary.test.mjs',
    'tool/validate_privacy_disclosures.mjs', 'tool/validate_retention_deletion_readiness.mjs',
    'test/tool/validate_privacy_disclosures.test.mjs', 'test/tool/validate_retention_deletion_readiness.test.mjs']);
  for (const directory of ['lib', 'backend/src', 'test', 'web', 'tool']) {
    for (const name of readdirSync(new URL(`../../${directory}/`, import.meta.url), { recursive: true })) {
      const path = `${directory}/${name}`;
      if (!/\.(dart|mjs|js|html)$/u.test(name) || allowed.has(path)) continue;
      assert.doesNotMatch(read(path), /web_app_router|WebAppRouterHost|WebOwnedRouteBridge/u, path);
    }
  }
});
