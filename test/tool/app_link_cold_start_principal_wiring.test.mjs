import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const main = await readFile(new URL('../../lib/main.dart', import.meta.url), 'utf8');
const links = await readFile(
  new URL('../../lib/services/app_link_service.dart', import.meta.url),
  'utf8',
);

test('cold notification ownership starts after Firebase retention and session settling', () => {
  const firebase = main.indexOf('await FirebaseRuntime.initialize();');
  const settle = main.indexOf('await settleInitialAppLinkPrincipal();');
  const runApp = main.indexOf('runApp(\n    MyApp(');

  assert.ok(firebase >= 0);
  assert.ok(settle > firebase);
  assert.ok(runApp > settle);
  assert.match(
    links,
    /if \(!\(backendEnabled \?\? BackendConfig\.enabled\)\) return;[\s\S]*final session = await[\s\S]*if \(session == null\) return;[\s\S]*await \(resolveAccessToken \?\? AuthService\.accessToken\)\(\);/u,
  );
});

test('principal-bound operations retain before-and-after owner checks', () => {
  assert.match(
    links,
    /if \(!await owner\.isCurrent\(\)\) throw const AppLinkPrincipalChanged\(\);[\s\S]*final result = await operation\(\);[\s\S]*if \(!await owner\.isCurrent\(\)\) throw const AppLinkPrincipalChanged\(\);/u,
  );
});
