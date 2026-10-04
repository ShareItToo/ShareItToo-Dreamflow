import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { profile } from '../../tool/staging_web_contract.mjs';

const root = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('P7-A2a has no normal app, API, job, flag, build or deployment dependency', async () => {
  for (const directory of ['lib', 'backend/src', 'backend/ops', 'tool', 'scripts', 'web']) {
    for (const name of await readdir(new URL(`${directory}/`, root), { recursive: true })) {
      const file = `${directory}/${name}`;
      if (!/\.(?:dart|js|mjs|json|sh|html)$/u.test(file)) continue;
      assert.doesNotMatch(await read(file), /mission_quorum_web|P7WebPreview|P7DisplayEnvelope|SIT_P7_SYNTHETIC_WEB/u, file);
    }
  }
  const staging = profile('0'.repeat(40), '1.0.0+2026092905');
  assert.equal(Object.keys(staging).some((key) => key.includes('P7')), false);
  for (const key of ['SIT_SYNTHETIC_CLONE_BOOKING_LANE', 'SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE',
    'SIT_PLANNER_TECHNICAL_UI_ENABLED', 'SIT_STAGE_A_NON_BINDING_PILOT']) assert.equal(staging[key], 'false');
});

test('test view uses injected data and a closed import surface without network or persistence mechanisms', async () => {
  const view = await read('test/support/mission_quorum_web_preview.dart');
  const imports = [...view.matchAll(/^import '([^']+)';$/gmu)].map((m) => m[1]);
  assert.deepEqual(imports, ['dart:convert', 'package:crypto/crypto.dart', 'package:flutter/material.dart']);
  assert.doesNotMatch(view, /\b(?:main|runApp|fetch|HttpClient|WebSocket|XMLHttpRequest|SharedPreferences|localStorage|sessionStorage|indexedDB|BackendRepository|AuthService|ImagePicker|MobileScanner)\s*[.(]/u);
  assert.doesNotMatch(view, /https?:\/\/|Image\.network|NetworkImage|MethodChannel|EventChannel|setMethodCallHandler/u);
  assert.doesNotMatch(view, /mission_quorum_web_golden|p7DisplayGolden/u, 'the view must not load default fixtures');
  assert.match(view, /const P7WebPreview\(\{super\.key\}\)\s*:\s*_envelope = null/u);
  assert.match(view, /_check\(flag is bool && flag\)/u);
  assert.match(view, /wrapper\['digest'\] == expectedDigest/u);
  assert.match(view, /p\['missionOwnerId'\] == expectedPrincipal/u);
  assert.match(view, /_scroll\.dispose\(\)/u);
  assert.match(view, /_resetFocus\.dispose\(\)/u);
});

test('backend display helper is a pure test-only whitelist, with no side-effect dependencies', async () => {
  const helper = await read('backend/test/support/mission_quorum_web_fixture.js');
  const imports = [...helper.matchAll(/from '([^']+)'/gu)].map((m) => m[1]);
  assert.deepEqual(imports, ['../../src/mission_need_workflow.js', '../../src/mission_quorum_projection.js', '../../src/booking_group_handover_domain.js']);
  assert.doesNotMatch(helper, /\b(?:fetch|query|writeFile|readFile|createServer|connect|spawn|execFile|localStorage|sessionStorage)\s*\(/u);
  assert.match(helper, /projectMissionQuorum\(source, fixtures\)/u);
  assert.match(helper, /digest\(\{ \.\.\.f, slotKey: c\.slotKey \}\) === c\.lifecycleDigest/u);
  assert.match(helper, /return \{ envelope, digest: digest\(envelope\) \}/u);
});
