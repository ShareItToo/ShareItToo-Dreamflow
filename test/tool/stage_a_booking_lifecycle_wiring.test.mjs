import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const booking = readFileSync('lib/screens/booking_detail_screen.dart', 'utf8');
const owner = readFileSync('lib/screens/ongoing_owner_detail_screen.dart', 'utf8');
const stepper = readFileSync('lib/widgets/return_handover_stepper_sheet.dart', 'utf8');

test('Stage-A lifecycle actions require the exact internal Staging config', () => {
  assert.match(booking, /_simulationOnly && PrivatePilotConfig\.stageANonBindingPilotAvailable/u);
  assert.match(booking, /!_simulationOnly \|\| _simulationLifecycleActionsEnabled/u);
  assert.match(owner, /!req\.simulationOnly \|\|\s*PrivatePilotConfig\.stageANonBindingPilotAvailable/u);
  assert.match(booking, /allowDamageCase: !_simulationOnly/u);
  assert.match(owner, /allowDamageCase: !req\.simulationOnly/u);
});

test('simulation return retains four-photo/QR sequence and cannot open damage review case', () => {
  assert.match(stepper, /base\.add\(_StepKind\.photos\);[\s\S]*if \(isReturn && widget\.allowDamageCase\) base\.add\(_StepKind\.damage\);[\s\S]*base\.add\(_StepKind\.codes\);/u);
  assert.match(stepper, /_presenterEvidenceCount \+ _checkoutPhotos\.length >= 4/u);
  assert.match(stepper, /opensReview: true/u);
});

test('simulation completion keeps finance and review actions out of the UI', () => {
  assert.match(booking, /if \(!_simulationOnly &&\s*SyntheticCloneConfig\.reviewActionsEnabled/u);
  assert.match(booking, /if \(!_simulationOnly &&\s*\n\s*SyntheticCloneConfig\.reviewActionsEnabled/u);
  assert.match(booking, /if \(_simulationOnly\) \{\s*return const _SimulationPaymentNotice\(\);/u);
  assert.match(owner, /if \(!req\.simulationOnly\)\s*Container\([\s\S]*?'Zahlungsübersicht'/u);
  assert.match(owner, /!SyntheticCloneConfig\.reviewActionsEnabled \|\|\s*_req\?\.simulationOnly == true/u);
  assert.match(owner, /req\.simulationOnly\s*\? 'Kein Zahlungsbeleg – unverbindliche Simulation\.'/u);
  assert.match(booking, /!_simulationOnly &&\s*ReturnCaseEntryPointPolicy\.isEligible/u);
  assert.match(owner, /!request\.simulationOnly &&\s*ReturnCaseEntryPointPolicy\.isEligible/u);
});

test('owner detail maps active and completed simulation statuses to their proper views', () => {
  assert.match(owner, /if \(s == 'running'\) return 'ongoing';/u);
  assert.match(owner, /if \(s == 'completed' \|\| s == 'cancelled' \|\| s == 'declined'\) \{\s*return 'completed';/u);
  assert.match(owner, /case 'completed':\s*return r\.needsReview\s*\? 'Vermietung in Prüfung'\s*: 'Abgeschlossene Vermietung';/u);
  assert.match(owner, /case 'ongoing':\s*default:\s*return 'Laufende Vermietung';/u);
});
