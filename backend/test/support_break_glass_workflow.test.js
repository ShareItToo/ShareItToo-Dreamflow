import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';

const {
  createSupportBreakGlassGrant,
  listSupportBreakGlassReviews,
  reviewSupportBreakGlassGrant,
  verifySupportBreakGlassGrant,
} = await import('../src/support_break_glass_workflow.js');

const now = new Date('2026-08-21T10:00:00.000Z');
const expiresAt = new Date('2026-08-21T10:05:00.000Z');
const reviewAt = new Date('2026-08-21T10:06:00.000Z');
const caseId = '11111111-1111-4111-8111-111111111111';
const grantId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const elevationId = '44444444-4444-4444-8444-444444444444';

function grantRow(overrides = {}) {
  return {
    id: grantId,
    case_id: caseId,
    actor_id: 'support-1',
    session_id: sessionId,
    staff_elevation_id: elevationId,
    token_hash: 'a'.repeat(64),
    reason_code: 'p0_immediate_safety_response',
    justification: 'P0-Sicherheitsfall benötigt sofortige fachliche Sichtung.',
    idempotency_key: 'support.break_glass.create:grant-1',
    created_at: now,
    expires_at: expiresAt,
    last_used_at: null,
    revoked_at: null,
    review_due_at: expiresAt,
    review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    review_outcome: null,
    review_notes: null,
    review_idempotency_key: null,
    ...overrides,
  };
}

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
  }

  async query(sql, params = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.check) step.check({ sql, params });
    return typeof step.result === 'function' ? step.result({ sql, params }) : step.result;
  }

  done() {
    assert.equal(this.steps.length, 0, 'not all scripted queries were used');
  }
}

const noRows = { rowCount: 0, rows: [] };

test('P0 grant is step-up-bound, five-minute-limited and queues review', async () => {
  let insertedRow;
  const client = new ScriptedClient([
    { match: /FROM support_break_glass_grants/u, result: noRows },
    {
      match: /FROM support_cases[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: caseId,
          priority: 'p0',
          status: 'under_review',
          current_owner_id: 'support-2',
          operating_mode: 'simulation',
        }],
      },
    },
    {
      match: /FROM staff_elevations/u,
      check: ({ params }) => assert.deepEqual(params, [
        elevationId,
        'support-1',
        sessionId,
        now,
      ]),
      result: { rowCount: 1, rows: [{ id: elevationId, expires_at: expiresAt }] },
    },
    {
      match: /INSERT INTO support_break_glass_grants/u,
      check: ({ params }) => {
        assert.equal(params[1], caseId);
        assert.equal(params[2], 'support-1');
        assert.equal(params[5].length, 64);
        assert.equal(params[10].toISOString(), expiresAt.toISOString());
        insertedRow = grantRow({ id: params[0], token_hash: params[5] });
      },
      result: () => ({ rowCount: 1, rows: [insertedRow] }),
    },
    {
      match: /INSERT INTO audit_log/u,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 4), [
          'support-1',
          'support',
          'support.break_glass_grant_created',
          caseId,
        ]);
        assert.deepEqual(JSON.parse(params[4]), {
          grantId: insertedRow.id,
          reasonCode: 'p0_immediate_safety_response',
          expiresAt: expiresAt.toISOString(),
          reviewDueAt: expiresAt.toISOString(),
          p0Only: true,
        });
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await createSupportBreakGlassGrant(client, {
    actor: { id: 'support-1', role: 'support' },
    sessionId,
    staffElevationId: elevationId,
    caseId,
    raw: {
      reasonCode: 'p0_immediate_safety_response',
      justification: 'P0-Sicherheitsfall benötigt sofortige fachliche Sichtung.',
    },
    idempotencyKey: 'grant-1',
    now,
  });
  assert.equal(result.replayed, false);
  assert.equal(result.token.length, 43);
  assert.equal(result.grant.reviewStatus, 'pending');
  assert.equal(result.grant.reviewDueAt, expiresAt.toISOString());
  client.done();

  const replay = new ScriptedClient([{
    match: /FROM support_break_glass_grants/u,
    result: { rowCount: 1, rows: [insertedRow] },
  }]);
  const replayed = await createSupportBreakGlassGrant(replay, {
    actor: { id: 'support-1', role: 'support' },
    sessionId,
    staffElevationId: elevationId,
    caseId,
    raw: {
      reasonCode: 'p0_immediate_safety_response',
      justification: 'P0-Sicherheitsfall benötigt sofortige fachliche Sichtung.',
    },
    idempotencyKey: 'grant-1',
    now,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.token, result.token);
  replay.done();
});

test('non-P0 or assigned cases cannot open break-glass access', async () => {
  for (const row of [
    {
      id: caseId,
      priority: 'p1',
      status: 'under_review',
      current_owner_id: 'support-2',
      operating_mode: 'simulation',
    },
    {
      id: caseId,
      priority: 'p0',
      status: 'under_review',
      current_owner_id: 'support-1',
      operating_mode: 'simulation',
    },
  ]) {
    const client = new ScriptedClient([
      { match: /FROM support_break_glass_grants/u, result: noRows },
      { match: /FROM support_cases[\s\S]*FOR UPDATE/u, result: { rowCount: 1, rows: [row] } },
    ]);
    await assert.rejects(
      createSupportBreakGlassGrant(client, {
        actor: { id: 'support-1', role: 'support' },
        sessionId,
        staffElevationId: elevationId,
        caseId,
        raw: {
          reasonCode: 'p0_incident_containment',
          justification: 'P0-Incident benötigt eng begrenzte fachliche Sichtung.',
        },
        idempotencyKey: `grant-${row.priority}-${row.current_owner_id}`,
        now,
      }),
      row.priority === 'p0'
        ? /support_break_glass_not_required/u
        : /support_break_glass_unavailable/u,
    );
    client.done();
  }
});

test('concurrent create returns the exact unique-key winner as an idempotent replay', async () => {
  const winner = grantRow();
  const client = new ScriptedClient([
    { match: /FROM support_break_glass_grants/u, result: noRows },
    {
      match: /FROM support_cases[\s\S]*FOR UPDATE/u,
      result: {
        rowCount: 1,
        rows: [{
          id: caseId,
          priority: 'p0',
          status: 'under_review',
          current_owner_id: 'support-2',
          operating_mode: 'simulation',
        }],
      },
    },
    {
      match: /FROM staff_elevations/u,
      result: { rowCount: 1, rows: [{ id: elevationId, expires_at: expiresAt }] },
    },
    {
      match: /ON CONFLICT \(actor_id, session_id, idempotency_key\) DO NOTHING/u,
      result: noRows,
    },
    {
      match: /FROM support_break_glass_grants/u,
      result: { rowCount: 1, rows: [winner] },
    },
  ]);
  const result = await createSupportBreakGlassGrant(client, {
    actor: { id: 'support-1', role: 'support' },
    sessionId,
    staffElevationId: elevationId,
    caseId,
    raw: {
      reasonCode: winner.reason_code,
      justification: winner.justification,
    },
    idempotencyKey: 'grant-1',
    now,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.grant.id, grantId);
  client.done();
});

test('grant use stays bound to case, actor, session, elevation and active P0 state', async () => {
  const used = grantRow({ last_used_at: new Date('2026-08-21T10:01:00.000Z') });
  const client = new ScriptedClient([{
    match: /UPDATE support_break_glass_grants AS access_grant/u,
    check: ({ sql, params }) => {
      assert.deepEqual(params.slice(0, 4), [caseId, 'support-1', sessionId, elevationId]);
      assert.equal(params[4].length, 64);
      assert.match(sql, /support_case\.priority = 'p0'/u);
      assert.match(sql, /support_case\.status NOT IN \('resolved', 'closed'\)/u);
    },
    result: { rowCount: 1, rows: [used] },
  }]);
  const result = await verifySupportBreakGlassGrant(client, {
    actor: { id: 'support-1', role: 'support' },
    sessionId,
    staffElevationId: elevationId,
    caseId,
    token: 'x'.repeat(43),
    now: new Date('2026-08-21T10:01:00.000Z'),
  });
  assert.equal(result.id, grantId);
  assert.equal(result.reasonCode, 'p0_immediate_safety_response');
  client.done();
});

test('independent administrator review is due only after the grant window', async () => {
  const client = new ScriptedClient([
    { match: /review_idempotency_key = \$1/u, result: noRows },
    {
      match: /FROM support_break_glass_grants WHERE id::text = \$1 FOR UPDATE/u,
      result: { rowCount: 1, rows: [grantRow()] },
    },
    {
      match: /UPDATE support_break_glass_grants/u,
      check: ({ params }) => {
        assert.deepEqual(params.slice(0, 7), [
          grantId,
          'completed',
          'admin-1',
          sessionId,
          elevationId,
          reviewAt,
          'appropriate',
        ]);
      },
      result: {
        rowCount: 1,
        rows: [grantRow({
          review_status: 'completed',
          reviewed_by: 'admin-1',
          reviewed_at: reviewAt,
          review_outcome: 'appropriate',
          review_notes: 'Zugriff war auf die belegte P0-Lage und den Fall beschränkt.',
          review_idempotency_key: 'support.break_glass.review:review-1',
          revoked_at: reviewAt,
        })],
      },
    },
    {
      match: /INSERT INTO audit_log/u,
      check: ({ params }) => {
        assert.equal(params[2], 'support.break_glass_grant_reviewed');
        assert.equal(JSON.parse(params[4]).originalActorId, 'support-1');
      },
      result: { rowCount: 1, rows: [] },
    },
  ]);
  const result = await reviewSupportBreakGlassGrant(client, {
    actor: { id: 'admin-1', role: 'admin' },
    sessionId,
    staffElevationId: elevationId,
    grantId,
    raw: {
      outcome: 'appropriate',
      notes: 'Zugriff war auf die belegte P0-Lage und den Fall beschränkt.',
    },
    idempotencyKey: 'review-1',
    now: reviewAt,
  });
  assert.equal(result.grant.reviewStatus, 'completed');
  assert.equal(result.grant.reviewedBy, 'admin-1');
  client.done();
});

test('concurrent review returns the completed exact winner as an idempotent replay', async () => {
  const reviewed = grantRow({
    review_status: 'completed',
    reviewed_by: 'admin-1',
    reviewed_session_id: sessionId,
    review_staff_elevation_id: elevationId,
    reviewed_at: reviewAt,
    review_outcome: 'appropriate',
    review_notes: 'Zugriff war auf die belegte P0-Lage und den Fall beschränkt.',
    review_idempotency_key: 'support.break_glass.review:review-1',
    revoked_at: reviewAt,
  });
  const client = new ScriptedClient([
    { match: /review_idempotency_key = \$1/u, result: noRows },
    {
      match: /FROM support_break_glass_grants WHERE id::text = \$1 FOR UPDATE/u,
      result: { rowCount: 1, rows: [reviewed] },
    },
  ]);
  const result = await reviewSupportBreakGlassGrant(client, {
    actor: { id: 'admin-1', role: 'admin' },
    sessionId,
    staffElevationId: elevationId,
    grantId,
    raw: {
      outcome: 'appropriate',
      notes: reviewed.review_notes,
    },
    idempotencyKey: 'review-1',
    now: reviewAt,
  });
  assert.equal(result.replayed, true);
  assert.equal(result.grant.reviewStatus, 'completed');
  client.done();
});

test('review queue is admin-only, bounded and includes the stored reason', async () => {
  await assert.rejects(
    listSupportBreakGlassReviews(new ScriptedClient([]), {
      actor: { id: 'support-1', role: 'support' },
    }),
    /support_break_glass_admin_review_required/u,
  );
  const client = new ScriptedClient([{
    match: /WHERE review_status = \$1/u,
    check: ({ params }) => assert.deepEqual(params, ['pending', 25]),
    result: { rowCount: 1, rows: [grantRow()] },
  }]);
  const result = await listSupportBreakGlassReviews(client, {
    actor: { id: 'admin-1', role: 'admin' },
    status: 'pending',
    limit: 25,
  });
  assert.equal(result[0].justification, grantRow().justification);
  client.done();
});
