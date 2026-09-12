import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../../lib/main.dart', import.meta.url), 'utf8');
const screen = readFileSync(
  new URL('../../lib/screens/privacy_info_screen.dart', import.meta.url),
  'utf8',
);
const host = readFileSync(
  new URL('../../lib/widgets/privacy_export_cache_lifecycle_host.dart', import.meta.url),
  'utf8',
);
const ioStore = readFileSync(
  new URL('../../lib/services/privacy_export_file_platform_io.dart', import.meta.url),
  'utf8',
);

test('privacy export uses a controlled source instead of XFile.fromData on IO', () => {
  assert.match(screen, /exportFileStore\.prepare\(bytes\)/u);
  assert.match(screen, /prepared\.removeControlledSource\(\)/u);
  assert.doesNotMatch(screen, /XFile\.fromData/u);
  assert.match(ioStore, /sit_privacy_export_/u);
});

test('retained copies are purged on cold start and every safe resume', () => {
  assert.match(main, /PrivacyExportFileStore\(\)\.purgeRetainedCopies\(\)/u);
  assert.match(main, /PrivacyExportCacheLifecycleHost/u);
  assert.match(host, /state == AppLifecycleState\.resumed/u);
  assert.match(host, /fileStore\.purgeRetainedCopies\(\)/u);
});

test('cache cleanup targets only exact privacy export paths', () => {
  assert.match(ioStore, /sit_privacy_export_/u);
  assert.match(ioStore, /share_plus/u);
  assert.match(ioStore, /shareittoo-data-export\.json/u);
  assert.match(ioStore, /entries\.length == 1/u);
  assert.doesNotMatch(ioStore, /root\.delete\(recursive: true\)/u);
});
