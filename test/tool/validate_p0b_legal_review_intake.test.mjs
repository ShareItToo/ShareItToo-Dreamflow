import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateP0BLegalReviewIntake } from '../../tool/validate_p0b_legal_review_intake.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifest = JSON.parse(readFileSync(
  resolve(root, 'assets/legal/de/legal_review_intake_p0b_20260821.json'),
  'utf8',
));

test('accepts the source-bound fail-closed P0B-L1 intake package', () => {
  assert.deepEqual(validateP0BLegalReviewIntake({ root, manifest }), {
    packageVersion: 'P0B-L1-LEGAL-REVIEW-2026-08-21.1',
    status: 'prepared-awaiting-independent-professional-review',
    sourceCount: 9,
    reviewDocumentCount: 5,
    openDecisionCount: 18,
    professionallyReviewed: false,
    hardStop: true,
  });
});

test('rejects an invented professional approval or activation', () => {
  const changed = structuredClone(manifest);
  changed.professionallyReviewed = true;
  changed.publicActivationAllowed = true;
  assert.throws(
    () => validateP0BLegalReviewIntake({ root, manifest: changed }),
    /externally unreviewed and fail-closed/u,
  );
});

test('rejects source drift in V5.2 or G3', () => {
  assert.throws(
    () => validateP0BLegalReviewIntake({
      root,
      manifest,
      sourceOverrides: {
        'assets/legal/de/legal_manifest_g3l_draft.json': '{}',
      },
    }),
    /repository source drift/u,
  );
});

test('rejects stale or non-authoritative current-law baselines', () => {
  const changed = structuredClone(manifest);
  changed.officialSourceRegister.retrievedOn = '2025-01-01';
  changed.officialSourceRegister.authorityDomains.push('example.com');
  assert.throws(
    () => validateP0BLegalReviewIntake({ root, manifest: changed }),
    /official-law baseline is incomplete or stale/u,
  );
});

test('rejects closing a decision without external evidence', () => {
  const path = 'assets/legal/de/p0b-legal-review-2026-08-21.1/02_entscheidungsarbeitsblatt.md';
  const workbook = readFileSync(resolve(root, path), 'utf8').replace('| `open` |', '| `approved` |');
  assert.throws(
    () => validateP0BLegalReviewIntake({
      root,
      manifest,
      sourceOverrides: { [path]: workbook },
    }),
    /review document hash drift|exactly eighteen decisions open/u,
  );
});

test('rejects a softened professional and public release gate', () => {
  const changed = structuredClone(manifest);
  changed.releaseGate.professionalLegalApproval = true;
  changed.releaseGate.hardStopBeforePublicProductionStoreOrRealMoney = false;
  assert.throws(
    () => validateP0BLegalReviewIntake({ root, manifest: changed }),
    /release gate must remain a complete hard stop/u,
  );
});
