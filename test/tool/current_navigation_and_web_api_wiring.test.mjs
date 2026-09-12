import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainNavigation = readFileSync(
  new URL('../../lib/navigation/main_navigation.dart', import.meta.url),
  'utf8',
);
const webDownload = readFileSync(
  new URL('../../lib/services/file_download_web.dart', import.meta.url),
  'utf8',
);
const pubspec = readFileSync(new URL('../../pubspec.yaml', import.meta.url), 'utf8');
const lockfile = readFileSync(new URL('../../pubspec.lock', import.meta.url), 'utf8');

test('main navigation preserves explore-first back handling through PopScope', () => {
  assert.match(mainNavigation, /PopScope\(/);
  assert.match(mainNavigation, /canPop: _currentIndex == 0/);
  assert.match(
    mainNavigation,
    /onPopInvokedWithResult: \(didPop, _\) \{[\s\S]*?if \(!didPop && _currentIndex != 0\)[\s\S]*?setIndex\(0\)/,
  );
  assert.doesNotMatch(mainNavigation, /WillPopScope|onWillPop/);
});

test('web download uses package:web with the same temporary-anchor lifecycle', () => {
  assert.match(webDownload, /import 'dart:js_interop';/);
  assert.match(webDownload, /import 'package:web\/web\.dart' as web;/);
  assert.match(webDownload, /web\.Blob\(/);
  assert.match(webDownload, /web\.URL\.createObjectURL\(blob\)/);
  assert.match(webDownload, /web\.document\.body\?\.append\(anchor\)/);
  assert.match(webDownload, /anchor\.click\(\);[\s\S]*?anchor\.remove\(\);/);
  assert.match(webDownload, /web\.URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(webDownload, /dart:html/);
});

test('package:web is a locked direct runtime dependency', () => {
  assert.match(pubspec, /^  web: \^1\.1\.1$/m);
  assert.match(
    lockfile,
    /  web:\n    dependency: "direct main"[\s\S]*?version: "1\.1\.1"/,
  );
});
