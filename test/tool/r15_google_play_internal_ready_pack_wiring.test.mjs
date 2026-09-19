import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const pack = read('docs/operations/48H_R15_GOOGLE_PLAY_INTERNAL_READY_PACK_2026-08-24.md');
const matrix = JSON.parse(read('store/google-play/r15-stage-a-feature-flag-matrix.json'));
const evidence = JSON.parse(read('docs/evidence/48h-remote/r15-google-play-internal-ready-pack-20260824.json'));
const builder = read('scripts/build_android_release_candidate.sh');
const preflight = read('scripts/release_candidate_preflight.sh');
const archive = read('tool/archive_android_release_candidate.mjs');

test('R15 release builder carries Blue Ocean only into the Internal Staging lane', () => {
  assert.match(builder, /SIT_BLUE_OCEAN_LISTING_ASSISTANT/u);
  assert.match(builder, /--dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=\$blue_ocean_listing_assistant/u);
  assert.match(builder, /\$CHANNEL" != "internal"/u);
  assert.match(
    builder,
    /^API_BASE_URL="\$\{SIT_API_BASE_URL:-https:\/\/staging\.shareittoo\.com\/api\/v1\}"$/mu,
  );
  assert.match(builder, /SIT_REQUIRE_STORE_SUBMISSION/u);
});

test('R15 can require canonical Internal signing without claiming Store submission', () => {
  assert.match(builder, /SIT_REQUIRE_CANONICAL_SIGNING/u);
  assert.match(preflight, /SIT_REQUIRE_CANONICAL_SIGNING/u);
  assert.match(preflight, /validate_android_signing_config\.mjs --require-canonical/u);
  assert.match(pack, /no Store-submission mode/u);
});

test('R15 binds the enabled Blue Ocean flag into the private archive manifest', () => {
  assert.match(builder, /blueOceanListingAssistantEnabled/u);
  assert.match(archive, /typeof manifest\.blueOceanListingAssistantEnabled !== 'boolean'/u);
  assert.match(archive, /blueOceanListingAssistantEnabled: manifest\.blueOceanListingAssistantEnabled/u);
});

test('R15 keeps build, Play upload and human activation as three closed gates', () => {
  assert.deepEqual(Object.keys(evidence.gateSeparation), [
    'BUILD_READY', 'PLAY_UPLOAD_APPROVED', 'HUMAN_PILOT_ACTIVATED',
  ]);
  assert.ok(Object.values(evidence.gateSeparation).every(({ state }) => state === 'not-granted'));
  assert.match(pack, /GOOGLE_PLAY_INTERNAL_RELEASE_GO/u);
});

test('R15 feature truth enables only the reduced Blue Ocean release envelope', () => {
  const states = Object.fromEntries(matrix.surfaces.map(({ id, targetState }) => [id, targetState]));
  assert.equal(states.blue_ocean_listing_assistant, 'on-internal-staging-candidate-only');
  assert.equal(states.g3_booking_groups, 'off-release-mode-lock');
  assert.equal(states.g4_planner_technical_ui, 'off-release-mode-lock');
  assert.equal(states.g5_supply_enrichment_technical_ui, 'off-release-mode-lock');
  assert.equal(states.external_listing_ai, 'disabled-manual-fallback');
  assert.equal(matrix.wave0Impact.blocksHumanPilotActivationForFullN9Envelope, true);
});

test('R15 covers every requested owner-minimization process', () => {
  for (const marker of [
    'Exact candidate build sequence', 'Signing and AAB hash binding',
    'Internal Testing owner checklist', 'Tester opt-in and data-preserving update',
    'Exact Stage-A feature truth', 'Privacy copy checklist and feedback route',
    'Rollback, tester removal and pilot shutdown',
  ]) assert.match(pack, new RegExp(marker, 'u'));
  assert.equal(Object.keys(evidence.preparedProcesses).length, 12);
  assert.ok(Object.values(evidence.preparedProcesses).every((state) => state === 'complete'));
});

test('R15 retains no live, tester, money or provider action', () => {
  assert.ok(Object.values(evidence.boundaries).every((state) => state === false));
  assert.ok(Object.values(matrix.boundaries).every((state) => state === false));
  assert.match(pack, /No step in this document performs a Console, Firebase, Cloud/u);
});

test('R15 machine evidence contains no identity, secret or local path', () => {
  const machine = `${JSON.stringify(evidence)}\n${JSON.stringify(matrix)}`;
  assert.doesNotMatch(machine, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
  assert.doesNotMatch(machine, /\bsk-[A-Za-z0-9]/u);
  assert.doesNotMatch(machine, /\/Users\//u);
});

test('R15 validator is permanent in regression and package completion policy', () => {
  const regression = read('scripts/technical_regression_check.sh');
  const guard = read('.codex/hooks/sit_guardrail.py');
  assert.match(regression, /r15_google_play_internal_ready_pack_wiring\.test\.mjs/u);
  assert.match(regression, /validate_r15_google_play_internal_ready_pack\.test\.mjs/u);
  assert.match(regression, /validate_r15_google_play_internal_ready_pack\.mjs/u);
  assert.match(guard, /R15_GOOGLE_PLAY_INTERNAL_READY_PACK/u);
});
