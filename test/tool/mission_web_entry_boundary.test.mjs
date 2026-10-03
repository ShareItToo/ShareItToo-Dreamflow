import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const widget = 'lib/widgets/mission_web_entry.dart';
const read = (path) => readFileSync(root + path, 'utf8');

test('D6 presentation imports only Flutter and declares no runtime effects or hardcoded copy', () => {
  const source = read(widget);
  assert.deepEqual([...source.matchAll(/^import '([^']+)';$/gmu)].map((m) => m[1]), ['package:flutter/material.dart']);
  assert.doesNotMatch(source, /test\/support|Backend|AuthService|Navigator|AppLink|fromEnvironment|SIT_|SharedPreferences|HttpClient|fetch|WebSocket|Image\.network|MethodChannel|Timer|DateTime|Random|storage|provider\/|firebase|analytics/u);
  assert.doesNotMatch(source, /Text\(\s*['"][A-Za-zÄÖÜäöü]/u);
  assert.match(source, /view == null|_view == null/u);
});

test('D6 consumers are limited to the isolated route and its exact tests', () => {
  const references = [];
  for (const directory of ['lib', 'backend/src', 'backend/ops', 'tool', 'scripts', 'web', 'test']) {
    for (const name of readdirSync(root + directory, { recursive: true })) {
      if (!/\.(?:dart|js|mjs|json|sh|html)$/u.test(name)) continue;
      const path = `${directory}/${name}`;
      if ([widget, 'test/tool/mission_web_entry_boundary.test.mjs', 'test/tool/staging_web_contract.test.mjs'].includes(path)) continue;
      if (/mission_web_entry|MissionWebEntry/u.test(read(path))) references.push(path);
    }
  }
  assert.deepEqual(references.sort(), [
    'lib/config/mission_web_entry_config.dart',
    'lib/screens/app_link_destination_screen.dart',
    'lib/screens/mission_web_entry_screen.dart',
    'test/mission_web_entry_route_test.dart',
    'test/mission_web_entry_test.dart',
  ].sort());
});

test('route uses only local synthetic presentation and its independent default-off web gate', () => {
  const source = read('lib/screens/mission_web_entry_screen.dart');
  assert.deepEqual([...source.matchAll(/^import '([^']+)';$/gmu)].map((m) => m[1]), [
    'package:flutter/foundation.dart', 'package:flutter/material.dart', 'package:provider/provider.dart',
    'package:lendify/config/mission_web_entry_config.dart', 'package:lendify/services/localization_service.dart', 'package:lendify/widgets/mission_web_entry.dart',
  ]);
  assert.doesNotMatch(source, /test\/support|Backend|AuthService|SharedPreferences|HttpClient|WebSocket|Image\.network|MethodChannel|Timer|DateTime|Random|firebase|analytics|P7|StageA|Planner/u);
  assert.match(source, /!kReleaseMode/u);
  const config = read('lib/config/mission_web_entry_config.dart');
  assert.match(config, /SIT_MISSION_WEB_PREVIEW_ENABLED/u);
  assert.match(config, /defaultValue: false/u);
  assert.match(config, /isWeb && enabled/u);
  assert.match(config, /isWeb: kIsWeb/u);
  assert.doesNotMatch(config, /PLANNER|STAGE_A|Backend|AuthService/u);
  const destination = read('lib/screens/app_link_destination_screen.dart');
  assert.match(destination, /const MissionWebEntryScreen\(\)/u);
  assert.doesNotMatch(destination, /testWeb:|testEnabled:/u);
});
