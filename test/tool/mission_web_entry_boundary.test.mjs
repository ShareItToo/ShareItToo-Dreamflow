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

test('D6 has no consumer outside its own widget test; app/router/config/API stay disconnected', () => {
  const references = [];
  for (const directory of ['lib', 'backend/src', 'backend/ops', 'tool', 'scripts', 'web', 'test']) {
    for (const name of readdirSync(root + directory, { recursive: true })) {
      if (!/\.(?:dart|js|mjs|json|sh|html)$/u.test(name)) continue;
      const path = `${directory}/${name}`;
      if ([widget, 'test/tool/mission_web_entry_boundary.test.mjs'].includes(path)) continue;
      if (/mission_web_entry|MissionWebEntry/u.test(read(path))) references.push(path);
    }
  }
  assert.deepEqual(references, ['test/mission_web_entry_test.dart']);
});
