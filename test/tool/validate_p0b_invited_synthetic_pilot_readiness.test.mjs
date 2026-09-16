import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BInvitedSyntheticPilotReadiness } from '../../tool/validate_p0b_invited_synthetic_pilot_readiness.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'docs/evidence/p0b-next/invited-synthetic-pilot-spiegelberg-cat8-readiness.json'),
  'utf8',
));

test('accepts the exact authorized pilot envelope while all four prerequisites stay open', () => {
  assert.deepEqual(validateP0BInvitedSyntheticPilotReadiness({ root, manifest }), {
    version: 'P0B-PILOT-2026-08-21.1',
    state: 'prepared-hold-prerequisite-gates-open',
    repositorySources: 10,
    driveSources: 5,
    invitedAdults: 30,
    targetFlows: '30-50',
    passedPrerequisites: 0,
    requiredPrerequisites: 4,
    exactScopeValid: true,
    controlledPilotEligible: false,
    publicLaunchReady: false,
    realMoneyReady: false,
  });
});

test('rejects invented prerequisite success or activation', () => {
  const changed = structuredClone(manifest);
  changed.prerequisites[0].passed = true;
  changed.execution.regionConfigured = true;
  changed.execution.invitesSent = true;
  assert.throws(
    () => validateP0BInvitedSyntheticPilotReadiness({ root, manifest: changed }),
    /prerequisite set must remain exact and open|execution must remain completely inactive/u,
  );
});

test('rejects scope expansion beyond Spiegelberg Cat8 and synthetic payment', () => {
  const changed = structuredClone(manifest);
  changed.scope.invitedAdultPrivateUsers = 31;
  changed.scope.publicRegistration = true;
  changed.scope.realMoney = true;
  assert.throws(
    () => validateP0BInvitedSyntheticPilotReadiness({ root, manifest: changed }),
    /scope drifted from the approved recommendation/u,
  );
});

test('rejects turning KPI targets into invented observations', () => {
  const changed = structuredClone(manifest);
  changed.targetMetrics.status = 'observed';
  changed.targetMetrics.observedAovMinor = 5000;
  assert.throws(
    () => validateP0BInvitedSyntheticPilotReadiness({ root, manifest: changed }),
    /targets must not be presented as observations/u,
  );
});

test('rejects source drift in any prerequisite artifact', () => {
  assert.throws(
    () => validateP0BInvitedSyntheticPilotReadiness({
      root,
      manifest,
      sourceOverrides: {
        'docs/evidence/p0b-next/signed-device-evidence.json': '{}',
      },
    }),
    /repository source drift/u,
  );
});

test('rejects participant data, account mutation or real-money boundary changes', () => {
  const changed = structuredClone(manifest);
  changed.boundaries.containsPersonalData = true;
  changed.boundaries.participantOrAccountMutationPerformed = true;
  changed.boundaries.realMoneyUsed = true;
  assert.throws(
    () => validateP0BInvitedSyntheticPilotReadiness({ root, manifest: changed }),
    /boundary must remain false/u,
  );
});
