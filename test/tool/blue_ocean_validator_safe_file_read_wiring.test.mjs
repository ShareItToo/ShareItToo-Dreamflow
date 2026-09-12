import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (let packageNumber = 1; packageNumber <= 13; packageNumber += 1) {
  test(`N${packageNumber} validator uses the atomic repository reader`, () => {
    const names = [
      'listing_flow_audit',
      'listing_ai_foundation',
      'listing_ai_gateway',
      'image_privacy_pipeline',
      'regional_price_engine_v2',
      'listing_workflow',
      'evaluation_corpus',
      'synthetic_pilot_harness',
      'heilbronn_wave0',
      'internal_testing',
      'codex_local_guardrails',
      'owner_action_pack',
      'final_handover',
    ];
    const source = readFileSync(
      new URL(`../../tool/validate_blue_ocean_n${packageNumber}_${names[packageNumber - 1]}.mjs`, import.meta.url),
      'utf8',
    );
    assert.match(source, /readRepositoryFile/u);
    assert.doesNotMatch(source, /lstatSync|statSync|existsSync/u);
  });
}
