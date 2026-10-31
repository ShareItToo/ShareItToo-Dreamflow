import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const allowed = new Set([
  'backend/test/support/mission_quorum_web_fixture_v2.js',
  'backend/test/mission_quorum_web_envelope_v2.test.js',
  'test/support/mission_quorum_web_preview_v2.dart',
  'test/support/mission_quorum_web_golden_v2.dart',
  'test/mission_quorum_web_view_v2_test.dart',
  'test/tool/mission_quorum_web_preview_v2_contract.test.mjs',
  'backend/test/mission_quorum_projection_v2.test.js',
  'test/support/mission_quorum_web_browser_v2.mjs',
  'test/tool/mission_quorum_web_browser_v2.test.mjs',
  '.github/workflows/mission-quorum-web-v2-proof.yml',
]);
test('V2 display has only exact test consumers and isolated test runner, never product, PG, flag or deployment wiring', async () => {
  for (const dir of ['lib', 'web', 'tool', 'scripts', 'backend/src', 'backend/ops', 'backend/test', 'test', '.github']) {
    for (const p of await readdir(new URL(`${dir}/`, root), { recursive: true })) {
      const path = `${dir}/${p}`;
      if (!/\.(?:dart|js|mjs|json|sh|html|ya?ml)$/u.test(path) || allowed.has(path)) continue;
      assert.doesNotMatch(await read(path), /mission_quorum_web_(?:fixture|envelope|preview|golden|view)_v2|P7V2WebPreview|P7V2DisplayEnvelope/u, path);
    }
  }
});
test('V2 helper validates before clone/hash, rejects rather than strips, no side-effect imports', async () => {
  const s = await read('backend/test/support/mission_quorum_web_fixture_v2.js');
  assert.deepEqual([...s.matchAll(/from '([^']+)'/gu)].map((m) => m[1]), [
    '../../src/mission_need_workflow.js', '../../src/mission_quorum_projection_v2.js', '../../src/booking_group_handover_domain.js',
  ]);
  assert.match(s, /projectMissionQuorumV2\(input\);[\s\S]*structuredClone\(input\)/u);
  assert.doesNotMatch(s, /\b(?:process|console|fetch|query|writeFile|readFile|createServer|connect|spawn|execFile|setTimeout|setInterval)\b|Date\.now|Math\.random|import\s*\(/u);
  assert.match(s, /quoteHash: digest\(x\.source\.assignments\.find/u);
  assert.match(s, /return freeze\(\{ envelope, digest: digest\(envelope\) \}\)/u);
});
test('V2 test view has no default fixture or network/storage; explicit disclosure and disposal', async () => {
  const s = await read('test/support/mission_quorum_web_preview_v2.dart');
  assert.deepEqual([...s.matchAll(/^import '([^']+)';$/gmu)].map((m) => m[1]),
    ['dart:convert', 'package:crypto/crypto.dart', 'package:flutter/material.dart']);
  assert.doesNotMatch(s, /\b(?:main|runApp|fetch|HttpClient|WebSocket|SharedPreferences|localStorage|sessionStorage|indexedDB|BackendRepository|AuthService|ImagePicker|MobileScanner)\s*[.(]|https?:\/\/|Image\.network|NetworkImage|MethodChannel|EventChannel/u);
  assert.doesNotMatch(s, /mission_quorum_web_golden|p7V2DisplayGolden/u);
  assert.match(s, /const P7V2WebPreview\(\{super\.key\}\)\s*:\s*_envelope = null/u);
  assert.match(s, /_check\(flag is bool && flag\)/u);
  assert.match(s, /_scroll\.dispose\(\)/u); assert.match(s, /_resetFocus\.dispose\(\)/u);
  assert.match(s, /Kein PG-Readback, keine persistierte Replay- oder Parallelitätsgarantie/u);
  assert.match(s, /Keine echte Miete\. D1–D4 offen/u);
});
