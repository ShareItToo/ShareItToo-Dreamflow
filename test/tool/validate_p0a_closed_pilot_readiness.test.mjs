import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateP0AClosedPilotReadiness,
} from '../../tool/validate_p0a_closed_pilot_readiness.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const matrix = JSON.parse(readFileSync(
  resolve(root, 'docs/evidence/p0a/closed-pilot-readiness-matrix.json'),
  'utf8',
));

test('P0A proves thirteen technical cells while retaining all gates', () => {
  assert.deepEqual(validateP0AClosedPilotReadiness({ root, matrix }), {
    state: 'hold-current-source-physical-device-and-external-gates',
    cells: 16,
    passed: 13,
    blocked: 1,
    historical: 1,
    notApplicable: 1,
    realMoneyAllowed: false,
    liveProviderTrafficExecuted: false,
  });
});

test('P0A rejects real money and live provider traffic', () => {
  const realMoney = structuredClone(matrix);
  realMoney.constraints.realMoneyAllowed = true;
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: realMoney }),
    /boundary must remain false/u,
  );

  const providerTraffic = structuredClone(matrix);
  providerTraffic.paymentBoundary.liveProviderTrafficExecuted = true;
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: providerTraffic }),
    /payment boundary permits real money or live provider traffic/u,
  );
});

test('historical Pixel evidence cannot become current-source evidence', () => {
  const historicalAsCurrent = structuredClone(matrix);
  historicalAsCurrent.matrix[14].status = 'passed';
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: historicalAsCurrent }),
    /invalid identity, status or scope/u,
  );

  const forcedGreen = structuredClone(matrix);
  forcedGreen.matrix[13].status = 'passed';
  forcedGreen.matrix[13].currentSourceBound = true;
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: forcedGreen }),
    /invalid identity, status or scope/u,
  );
});

test('P0A rejects hidden blockers and mismatched counts', () => {
  const hidden = structuredClone(matrix);
  hidden.evidencePolicy.blockedCellMayBeHidden = true;
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: hidden }),
    /evidence policy must remain false/u,
  );

  const wrongCount = structuredClone(matrix);
  wrongCount.statusCounts.passed = 14;
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: wrongCount }),
    /status count is invalid/u,
  );
});

test('P0A rejects missing evidence references', () => {
  const missing = structuredClone(matrix);
  missing.matrix[0].evidenceRefs = ['docs/evidence/p0a/not-present.json'];
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: missing }),
    /evidence reference does not exist/u,
  );
});

test('P0A rejects raw device identifier fields', () => {
  const identified = structuredClone(matrix);
  identified.matrix[13].serial = 'redacted-test-value';
  assert.throws(
    () => validateP0AClosedPilotReadiness({ root, matrix: identified }),
    /forbidden raw device identifier field/u,
  );
});

test('P0A validates payment defaults from source instead of prose alone', () => {
  const composePath = 'backend/compose.prod.yml';
  const compose = readFileSync(resolve(root, composePath), 'utf8');
  assert.throws(
    () => validateP0AClosedPilotReadiness({
      root,
      matrix,
      sourceOverrides: {
        [composePath]: compose.replace(
          'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-disabled}',
          'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-stripe}',
        ),
      },
    }),
    /production compose is missing/u,
  );
});
