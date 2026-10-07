import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  accountSuspensionProposalVersion,
  approvedAccountMeasureNotice,
  normalizeAccountSuspensionProposalReview,
  normalizePermanentAccountSuspensionProposal,
  provisionalAccountMeasureNotice,
} from '../src/moderation_account_measure_domain.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function permanentDecision() {
  return {
    facts: 'Human-reviewed facts remain separated from unresolved allegations.',
    basis: 'Controlled account-safety policy fixture.',
    reasoning: 'The proposed account restriction remains subject to independent approval.',
    detectionMethod: 'human',
    statementOfReasons: {
      decisionGround: 'terms_violation',
      decisionOrigin: 'notice',
      territorialScope: 'SIT account surfaces.',
      durationType: 'until_reversed',
      automationRole: 'none',
    },
  };
}

test('permanent account proposal normalizes an immutable no-guilt payload', () => {
  const input = normalizePermanentAccountSuspensionProposal({
    reasonCode: 'Account.Takeover_Review',
    note: 'Human proposal note.',
    decision: permanentDecision(),
  }, 'target-user');

  assert.equal(input.reasonCode, 'account.takeover_review');
  assert.equal(input.payload.version, accountSuspensionProposalVersion);
  assert.equal(input.payload.scope, 'account');
  assert.equal(input.payload.durationType, 'until_reversed');
  assert.equal(input.payload.noGuiltDetermination, true);
  assert.equal(input.payload.userFacingMeasureNotice, approvedAccountMeasureNotice);
  assert.equal(input.payload.decision.statementOfReasons.endsAt, null);
  assert.ok(Object.isFrozen(input));
  assert.ok(Object.isFrozen(input.payload));
  assert.ok(Object.isFrozen(input.payload.decision));
});

test('permanent proposal rejects a fixed or malformed direct measure', () => {
  assert.throws(
    () => normalizePermanentAccountSuspensionProposal({
      reasonCode: 'account_review',
      endsAt: '2027-01-01T00:00:00.000Z',
      decision: permanentDecision(),
    }, 'target-user'),
    /permanent_account_suspension_end_not_applicable/u,
  );
  assert.throws(
    () => normalizePermanentAccountSuspensionProposal({
      reasonCode: 'account_review',
      decision: {
        ...permanentDecision(),
        statementOfReasons: {
          ...permanentDecision().statementOfReasons,
          durationType: 'fixed',
          endsAt: '2027-01-01T00:00:00.000Z',
        },
      },
    }, 'target-user'),
    /permanent_account_suspension_duration_required/u,
  );
});

test('proposal review requires an exact version, hash and rejection reason', () => {
  assert.deepEqual(normalizeAccountSuspensionProposalReview({
    outcome: 'approved',
    expectedVersion: 1,
    expectedPayloadSha256: 'a'.repeat(64),
  }), {
    outcome: 'approved',
    expectedVersion: 1,
    expectedPayloadSha256: 'a'.repeat(64),
    rejectionReason: null,
  });
  assert.throws(
    () => normalizeAccountSuspensionProposalReview({
      outcome: 'approved', expectedVersion: 0, expectedPayloadSha256: 'a'.repeat(64),
    }),
    /account_suspension_proposal_version_invalid/u,
  );
  assert.throws(
    () => normalizeAccountSuspensionProposalReview({
      outcome: 'rejected', expectedVersion: 1, expectedPayloadSha256: 'a'.repeat(64),
    }),
    /account_suspension_proposal_rejection_reason_required/u,
  );
});

test('database migration binds provisional labels and four-eyes approval evidence', () => {
  const up = fs.readFileSync(path.resolve(
    currentDir,
    '../sql/migrations/058_moderation_account_measure_approval.up.sql',
  ), 'utf8');
  const down = fs.readFileSync(path.resolve(
    currentDir,
    '../sql/migrations/058_moderation_account_measure_approval.down.sql',
  ), 'utf8');

  assert.match(up, /payload_sha256 CHAR\(64\) GENERATED ALWAYS AS/u);
  assert.match(up, /approved_by IS NOT NULL AND approved_by <> proposed_by/u);
  assert.match(up, /approval_payload_sha256 = payload_sha256/u);
  assert.match(up, /DEFERRABLE INITIALLY DEFERRED/u);
  assert.match(up, /account_suspension_proposal_payload_immutable/u);
  assert.match(up, /new_legacy_suspension_forbidden/u);
  assert.match(up, new RegExp(provisionalAccountMeasureNotice.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(up, new RegExp(approvedAccountMeasureNotice.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(down, /rollback refused/u);
});
