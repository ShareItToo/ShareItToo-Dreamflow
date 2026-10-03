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
];
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('D6 location has only its exact five unrouteable consumers', () => {
  for (const directory of ['lib', 'backend/src', 'backend/test', 'backend/ops', 'tool', 'scripts', 'web', 'test']) {
    for (const name of readdirSync(new URL(`${directory}/`, root), { recursive: true })) {
      const path = `${directory}/${name}`;
      if (!/\.(dart|js|mjs|json|sh|html)$/u.test(name) || files.includes(path)) continue;
      assert.doesNotMatch(read(path), /mission_web_location|MissionWebLocation|readMissionWebLocation/u, path);
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
