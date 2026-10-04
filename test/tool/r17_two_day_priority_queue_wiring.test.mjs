import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const evidence = JSON.parse(read(
  'docs/evidence/48h-remote/r17-two-day-priority-queue-20260825.json',
));
const matrix = JSON.parse(read('store/google-play/r17-stage-a-feature-flag-matrix.json'));

test('R17 gives Stage-A an explicit default-off non-binding build gate', () => {
  const config = read('lib/config/private_pilot_config.dart');
  assert.match(config, /SIT_STAGE_A_NON_BINDING_PILOT/u);
  assert.match(config, /defaultValue: false/u);
  assert.match(config, /!stageANonBindingPilot/u);
});

test('Stage-A keeps binding unreachable and permits only explicit simulation', () => {
  const checkout = read('lib/screens/private_pilot_checkout_screen.dart');
  assert.match(checkout, /Test-Mietanfrage senden/u);
  assert.match(checkout, /_simulationAcknowledged/u);
  assert.match(checkout, /simulationOnly: simulationOnly/u);
  assert.match(checkout, /Unverbindliche Stage-A-Vorschau/u);
  assert.match(checkout, /PrivatePilotConfig\.bindingCheckoutEnabled/u);
});

test('R17 couples every Blue Ocean release candidate to non-binding Stage-A', () => {
  const builder = read('scripts/build_android_release_candidate.sh');
  assert.match(builder, /stage_a_non_binding_pilot="\$blue_ocean_listing_assistant"/u);
  assert.match(builder, /--dart-define=SIT_STAGE_A_NON_BINDING_PILOT=\$stage_a_non_binding_pilot/u);
  assert.match(builder, /stageANonBindingPilotEnabled/u);
});

test('R17 carries the same gate in the bounded local Blue Ocean QA build', () => {
  const builder = read('scripts/build_android_local_qa_candidate.sh');
  assert.match(builder, /--dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true/u);
  assert.match(builder, /stageANonBindingPilotEnabled/u);
});

test('R17 private archive refuses a Blue Ocean candidate without the gate', () => {
  const archive = read('tool/archive_android_release_candidate.mjs');
  assert.match(archive, /typeof manifest\.stageANonBindingPilotEnabled/u);
  assert.match(archive, /manifest\.blueOceanListingAssistantEnabled === true/u);
  assert.match(archive, /manifest\.stageANonBindingPilotEnabled !== true/u);
});

test('R17 release notes describe only the reduced non-binding path', () => {
  const notes = read('store/google-play/de-DE/blue_ocean_internal_release_notes.txt');
  assert.match(notes, /nicht reservierender Mietkorb/u);
  assert.match(notes, /unverbindliche Test-Mietanfrage/u);
  assert.doesNotMatch(notes, /echte Buchung|echte Zahlung/u);
});

test('R17 historical human Wave-0 stays inactive while G3-G5 require the signed pilot envelope', () => {
  assert.equal(matrix.humanWave0.activated, false);
  assert.deepEqual(matrix.humanWave0.forbiddenTaskFamilies, [
    'rental-request-contract', 'accept-reject', 'payment-refund-payout',
    'handover-return-damage-needs-review', 'g3-g4-g5',
  ]);
  for (const path of [
    'lib/config/booking_group_technical_config.dart',
    'lib/config/planner_technical_config.dart',
    'lib/config/supply_enrichment_technical_config.dart',
    'lib/config/listing_sets_technical_config.dart',
  ]) {
    assert.match(read(path), /signedStageAInternalEnvelope/u);
    assert.match(read(path), /technicalSurfaceAvailableFor/u);
    assert.match(read(path), /publicReleaseAllowed/u);
  }
});

test('R17 records the P0 owner action without credential inspection', () => {
  const gate = read('docs/operations/48H_R17_GITGUARDIAN_HISTORY_REVIEW_OWNER_GATE.md');
  assert.match(gate, /R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE/u);
  assert.match(gate, /Do not paste the value/u);
  assert.equal(evidence.findings[0].rawCredentialInspected, false);
  assert.equal(evidence.findings[0].state, 'owner-action-required-final-gates-held');
});

test('R17 is permanent in regression and package-completion policy', () => {
  const regression = read('scripts/technical_regression_check.sh');
  const hook = read('.codex/hooks/sit_guardrail.py');
  assert.match(regression, /private_pilot_stage_a_non_binding_profile\.dart/u);
  assert.match(regression, /r17_two_day_priority_queue_wiring\.test\.mjs/u);
  assert.match(regression, /validate_r17_two_day_priority_queue\.test\.mjs/u);
  assert.match(regression, /validate_r17_two_day_priority_queue\.mjs/u);
  assert.match(hook, /R17_TWO_DAY_PRIORITY_QUEUE/u);
});
