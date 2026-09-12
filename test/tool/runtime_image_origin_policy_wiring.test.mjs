import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

function dartFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return dartFiles(path);
    return entry.isFile() && entry.name.endsWith('.dart') ? [path] : [];
  });
}

test('signed release image policy allows only managed SIT uploads', () => {
  const source = read('lib/services/backend_config.dart');
  assert.match(source, /static bool isPermittedRuntimeImageUrl\(/u);
  assert.match(source, /if \(isManagedImageUrl\(value\)\) return true;/u);
  assert.match(source, /final isRelease = releaseMode \?\? kReleaseMode;/u);
  assert.match(source, /if \(isRelease\) return false;/u);
});

test('AppImage fails closed before any external release fetch', () => {
  const source = read('lib/widgets/app_image.dart');
  assert.match(
    source,
    /if \(!BackendConfig\.isPermittedRuntimeImageUrl\(src\)\) \{\s*return _fallback\(\);/u,
  );
  assert.match(source, /Unknown schemes are never interpreted as network locations/u);
  assert.doesNotMatch(source, /Unknown scheme: try network/u);
});

test('all Flutter network image rendering is centralized in AppImage', () => {
  const libRoot = resolve(root, 'lib');
  const bypasses = dartFiles(libRoot)
    .filter((path) => !path.endsWith('/widgets/app_image.dart'))
    .filter((path) => /\b(?:Image\.network|NetworkImage)\s*\(/u.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(root.length + 1));
  assert.deepEqual(bypasses, []);
});

test('managed images retain authenticated loading and safe fallback', () => {
  const source = read('lib/widgets/app_image.dart');
  assert.match(source, /AuthService\.accessToken\(\)/u);
  assert.match(source, /'Authorization': 'Bearer \$token'/u);
  assert.match(source, /final Widget\? fallback;/u);
  assert.match(
    source,
    /errorBuilder: \(_, __, ___\) =>\s*widget\.fallback/u,
  );
});
