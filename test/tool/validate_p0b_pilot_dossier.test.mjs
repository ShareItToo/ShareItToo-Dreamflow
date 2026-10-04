import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BPilotDossier } from '../../tool/validate_p0b_pilot_dossier.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dossier = JSON.parse(readFileSync(
  resolve(root, 'docs/evidence/p0b/pilot-go-no-go-dossier.json'),
  'utf8',
));

test('P0B closes the runway with a source-bound NO-GO dossier', () => {
  assert.deepEqual(validateP0BPilotDossier({ root, dossier }), {
    decision: 'no_go_now',
    features: 13,
    blockers: 10,
    residualRisks: 2,
    authorizationTokens: 5,
    realMoneyAllowed: false,
    autoContinue: false,
  });
});

test('P0B cannot become GO or auto-continue', () => {
  const go = structuredClone(dossier);
  go.decision = 'go';
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: go }),
    /identity or NO-GO state is invalid/u,
  );

  const continued = structuredClone(dossier);
  continued.finalGate.autoContinue = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: continued }),
    /end the runway with NO-GO/u,
  );
});

test('P0B rejects real money and public activation', () => {
  const money = structuredClone(dossier);
  money.constraints.realMoneyAllowed = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: money }),
    /boundary must remain false/u,
  );

  const publicFeature = structuredClone(dossier);
  publicFeature.featureMatrix[0].publicReleaseAllowed = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: publicFeature }),
    /unsafe or overstated/u,
  );
});

test('P0B cannot infer legal approval from technical tests', () => {
  const changed = structuredClone(dossier);
  changed.legalReview.professionalApprovalEvidenceAvailable = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: changed }),
    /legal review gate is incomplete or overstated/u,
  );
});

test('P0B cannot invent staffing or positive economics', () => {
  const staffed = structuredClone(dossier);
  staffed.operations.assignedRoleCount = 6;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: staffed }),
    /operational readiness must remain blocked/u,
  );

  const profitable = structuredClone(dossier);
  profitable.economicsAndFounderIndependence.profitability = 'positive';
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: profitable }),
    /unit economics must remain unavailable/u,
  );
});

test('P0B future pilot stays bounded and not configured', () => {
  const expanded = structuredClone(dossier);
  expanded.recommendedFuturePilot.region.currentlyConfigured = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: expanded }),
    /future pilot scope is not exact/u,
  );

  const extraCategory = structuredClone(dossier);
  extraCategory.recommendedFuturePilot.catalog.push({
    categoryId: 'cat7',
    subcategory: 'Gartengeräte',
  });
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: extraCategory }),
    /future pilot catalog is not/u,
  );
});

test('P0B authorization tokens are recommendations and never execute automatically', () => {
  const executing = structuredClone(dossier);
  executing.recommendedAuthorizationTokens[0].autoExecute = true;
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: executing }),
    /authorization token is unsafe or invalid/u,
  );
});

test('P0B rejects a missing repository evidence reference', () => {
  const missing = structuredClone(dossier);
  missing.source.repoEvidenceRefs.push('docs/evidence/p0b/not-present.json');
  assert.throws(
    () => validateP0BPilotDossier({ root, dossier: missing }),
    /repository evidence does not exist/u,
  );
});
