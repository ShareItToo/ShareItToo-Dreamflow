import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const plan = readFileSync(
  new URL('../../docs/operations/PR7_INTEGRATION_AND_PILOT_CANDIDATE_PLAN.md', import.meta.url),
  'utf8',
);

test('PF4 binds the exact source and preserves every integration boundary', () => {
  for (const marker of [
    '76a3129d8e88e9e428f66be7e382ace5567da3fc',
    '6272264e985b1bc1d74a9891ddfd6074ce3caa61',
    'HOLD_PR7_DRAFT_UNMERGED',
    'forward-only and therefore cannot use SQL',
    'pilot/stage-a-android-rc1',
    'PILOT_STAGE_A_CANDIDATE_SIGNING_APPROVED',
    'PILOT_STAGE_A_INSTALL_APPROVED',
    'PR7_MERGE_APPROVED',
  ]) {
    assert.equal(plan.includes(marker), true, `PF4 marker missing: ${marker}`);
  }
  assert.equal(plan.includes('No candidate branch or artifact is created now.'), true);
  assert.equal(plan.includes('None is present now.'), true);
});

test('PF4 cannot claim current device proof or execute forbidden integration actions', () => {
  for (const marker of [
    'historical, not current-source evidence',
    'has no signed, installed,',
    'PR #7 remains draft, open and unmerged',
    'No force push, rebase, squash, history rewrite, branch deletion, merge,',
    'There is no production migration authorization in this package.',
  ]) {
    assert.equal(plan.includes(marker), true, `PF4 safety boundary missing: ${marker}`);
  }
});
