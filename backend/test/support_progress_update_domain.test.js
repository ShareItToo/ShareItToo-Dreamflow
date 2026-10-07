import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSupportProgressPublication,
  normalizeSupportProgressUpdate,
  supportProgressUpdateVersion,
} from '../src/support_progress_update_domain.js';

const actor = { id: 'support-1', role: 'support' };

function caseRow(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reporter_user_id: 'user-1',
    affected_user_ids: ['user-2'],
    current_owner_id: 'support-1',
    operating_mode: 'simulation',
    status: 'under_review',
    next_update_at: new Date('2026-08-22T10:00:00.000Z'),
    lock_version: 7,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    expectedVersion: 7,
    recipientUserId: 'user-1',
    firstName: 'Walid',
    progressSinceLastUpdate: 'Die technischen Eingangsdaten wurden geprüft.',
    openCheck: 'Die genaue Ursache wird noch mit dem Serverprotokoll abgeglichen.',
    userActionOrNoAction: 'Du musst im Moment nichts weiter tun.',
    provisionalImpactStatement: 'Die bisherige vorläufige Auswirkung bleibt unverändert.',
    nextAction: 'Serverprotokoll mit der aktuellen App-Version abgleichen.',
    nextUpdateAt: '2026-08-23T10:00:00.000Z',
    ...overrides,
  };
}

test('due progress uses reviewed T-008 with all required update facts', () => {
  const result = normalizeSupportProgressUpdate(caseRow(), input(), {
    actor,
    now: new Date('2026-08-22T09:00:00.000Z'),
  });
  assert.equal(result.version, supportProgressUpdateVersion);
  assert.equal(result.templateId, 'T-008');
  assert.equal(result.wasOverdue, false);
  assert.equal(result.variables.progress_since_last_update,
    'Die technischen Eingangsdaten wurden geprüft.');
  assert.match(result.variables.open_check, /Vorläufige Auswirkung:/u);
  assert.equal(result.variables.user_action_or_no_action,
    'Du musst im Moment nichts weiter tun.');
  assert.equal('next_update_date' in result.variables, false);
});

test('overdue progress uses apology template T-010 without inventing an outcome', () => {
  const result = normalizeSupportProgressUpdate(caseRow(), input(), {
    actor,
    now: new Date('2026-08-22T10:00:00.001Z'),
  });
  assert.equal(result.templateId, 'T-010');
  assert.equal(result.wasOverdue, true);
  assert.match(result.variables.current_status_plain, /wird weiter geprüft/u);
  assert.match(result.variables.current_status_plain, /Seit dem letzten Update/u);
  assert.match(result.variables.open_check, /Für dich gilt:/u);
  assert.doesNotMatch(JSON.stringify(result.variables), /entschieden|erstattet|ausgezahlt/iu);
});

test('progress update rejects live inactive unassigned and stale cases', () => {
  for (const [supportCase, expected] of [
    [caseRow({ operating_mode: 'production' }), /support_progress_update_live_forbidden/u],
    [caseRow({ status: 'closed' }), /support_progress_update_case_inactive/u],
    [caseRow({ current_owner_id: 'support-2' }), /support_case_assignment_required/u],
    [caseRow({ lock_version: 8 }), /support_case_version_conflict/u],
  ]) {
    assert.throws(
      () => normalizeSupportProgressUpdate(supportCase, input(), {
        actor,
        now: new Date('2026-08-22T09:00:00.000Z'),
      }),
      expected,
    );
  }
});

test('new checkpoint must be future bounded and later than the prior promise', () => {
  for (const value of [
    '2026-08-22T08:59:59.000Z',
    '2026-08-22T09:30:00.000Z',
    '2026-10-01T10:00:00.000Z',
  ]) {
    assert.throws(
      () => normalizeSupportProgressUpdate(caseRow(), input({ nextUpdateAt: value }), {
        actor,
        now: new Date('2026-08-22T09:00:00.000Z'),
      }),
      /support_progress_update_(?:next_deadline_invalid|deadline_not_advanced)/u,
    );
  }
});

test('recipient and every substantive update fact are mandatory', () => {
  assert.throws(
    () => normalizeSupportProgressUpdate(caseRow(), input({ recipientUserId: 'outsider' }), {
      actor,
      now: new Date('2026-08-22T09:00:00.000Z'),
    }),
    /support_message_recipient_forbidden/u,
  );
  for (const field of [
    'progressSinceLastUpdate',
    'openCheck',
    'userActionOrNoAction',
    'provisionalImpactStatement',
    'nextAction',
  ]) {
    assert.throws(
      () => normalizeSupportProgressUpdate(caseRow(), input({ [field]: '' }), {
        actor,
        now: new Date('2026-08-22T09:00:00.000Z'),
      }),
      /support_progress_update_/u,
    );
  }
});

function approvedProgress(overrides = {}) {
  return {
    proposal_status: 'approved',
    expected_case_version: 7,
    prior_next_update_at: new Date('2026-08-22T10:00:00.000Z'),
    proposed_next_update_at: new Date('2026-08-23T10:00:00.000Z'),
    next_action: 'Serverprotokoll prüfen.',
    lock_version: 2,
    ...overrides,
  };
}

function approvedMessage(overrides = {}) {
  return {
    send_status: 'approved',
    approval_level: 'yellow_human_review',
    approved_by: 'admin-1',
    approval_payload_sha256: 'a'.repeat(64),
    rendered_content_sha256: 'a'.repeat(64),
    lock_version: 2,
    ...overrides,
  };
}

test('publication binds independent approval and exact case and message versions', () => {
  const result = normalizeSupportProgressPublication(
    caseRow(),
    approvedProgress(),
    approvedMessage(),
    {
      expectedProgressVersion: 2,
      expectedMessageVersion: 2,
      expectedPayloadSha256: 'a'.repeat(64),
    },
    { actor, now: new Date('2026-08-22T11:00:00.000Z') },
  );
  assert.equal(result.expectedProgressVersion, 2);
  assert.equal(result.expectedMessageVersion, 2);
  assert.equal(result.nextUpdateAt.toISOString(), '2026-08-23T10:00:00.000Z');
});

test('publication fails closed after case drift, missing review or expired new time', () => {
  const request = {
    expectedProgressVersion: 2,
    expectedMessageVersion: 2,
    expectedPayloadSha256: 'a'.repeat(64),
  };
  assert.throws(
    () => normalizeSupportProgressPublication(
      caseRow({ lock_version: 8 }), approvedProgress(), approvedMessage(), request,
      { actor, now: new Date('2026-08-22T11:00:00.000Z') },
    ),
    /support_progress_update_case_changed/u,
  );
  assert.throws(
    () => normalizeSupportProgressPublication(
      caseRow(), approvedProgress({ proposal_status: 'pending_review' }),
      approvedMessage(), request,
      { actor, now: new Date('2026-08-22T11:00:00.000Z') },
    ),
    /support_progress_update_not_approved/u,
  );
  assert.throws(
    () => normalizeSupportProgressPublication(
      caseRow(),
      approvedProgress({ proposed_next_update_at: new Date('2026-08-22T10:30:00.000Z') }),
      approvedMessage(), request,
      { actor, now: new Date('2026-08-22T11:00:00.000Z') },
    ),
    /support_progress_update_new_deadline_overdue/u,
  );
});
