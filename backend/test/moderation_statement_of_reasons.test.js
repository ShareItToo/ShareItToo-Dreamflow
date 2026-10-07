import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ModerationDomainError,
  moderationStatementVersion,
  normalizeModerationDecisionInput,
} from '../src/moderation_domain.js';
import {
  ModerationDecisionError,
  persistModerationDecision,
} from '../src/moderation_decision_workflow.js';

const issuedAt = new Date('2026-08-22T10:00:00.000Z');

function rawDecision(overrides = {}) {
  return {
    facts: 'Die geprüfte Anzeige enthält die dokumentierte unzulässige Angabe.',
    basis: 'Community-Regel 4.2',
    reasoning: 'Die dokumentierte Angabe fällt unter die genannte Regel.',
    detectionMethod: 'human',
    statementOfReasons: {
      decisionGround: 'terms_violation',
      decisionOrigin: 'notice',
      territorialScope: 'Alle SIT-Oberflächen; keine geografische Teilbeschränkung.',
      durationType: 'until_reversed',
      automationRole: 'none',
    },
    ...overrides,
  };
}

test('Statement of Reasons normalizes the exact human-reviewed contract', () => {
  const normalized = normalizeModerationDecisionInput(rawDecision(), {
    statementRequired: true,
  });

  assert.equal(normalized.statementOfReasons.version, moderationStatementVersion);
  assert.equal(normalized.statementOfReasons.decisionOrigin, 'notice');
  assert.equal(normalized.statementOfReasons.durationType, 'until_reversed');
  assert.equal(normalized.statementOfReasons.endsAt, null);
  assert.equal(normalized.statementOfReasons.automationRole, 'none');
});

test('Statement of Reasons rejects missing, inconsistent or solely automated decisions', () => {
  assert.throws(
    () => normalizeModerationDecisionInput({
      facts: 'Dokumentierte Tatsachen',
      basis: 'Community-Regel 4.2',
      reasoning: 'Dokumentierte Begründung',
      detectionMethod: 'human',
    }, { statementRequired: true }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'moderation_statement_of_reasons_required',
  );

  assert.throws(
    () => normalizeModerationDecisionInput(rawDecision({
      detectionMethod: 'automated',
      automatedMeans: 'Klassifikator v1',
      statementOfReasons: {
        ...rawDecision().statementOfReasons,
        automationRole: 'decision_support',
      },
    }), { statementRequired: true }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'moderation_human_review_required',
  );

  assert.throws(
    () => normalizeModerationDecisionInput(rawDecision({
      statementOfReasons: {
        ...rawDecision().statementOfReasons,
        automationRole: 'signal',
      },
    }), { statementRequired: true }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'moderation_automation_role_not_applicable',
  );

  assert.throws(
    () => normalizeModerationDecisionInput(rawDecision({
      statementOfReasons: {
        ...rawDecision().statementOfReasons,
        durationType: 'fixed',
      },
    }), { statementRequired: true }),
    (error) => error instanceof ModerationDomainError
      && error.code === 'moderation_statement_end_required',
  );
});

test('hybrid detection discloses the bounded role and concrete automated means', () => {
  const normalized = normalizeModerationDecisionInput(rawDecision({
    detectionMethod: 'hybrid',
    automatedMeans: 'Regelbasiertes Risikosignal v1; keine autonome Entscheidung.',
    statementOfReasons: {
      ...rawDecision().statementOfReasons,
      automationRole: 'signal',
    },
  }), { statementRequired: true });

  assert.equal(normalized.detectionMethod, 'hybrid');
  assert.equal(normalized.statementOfReasons.automationRole, 'signal');
  assert.match(normalized.automatedMeans, /keine autonome Entscheidung/u);
});

test('a reversal records duration as not applicable instead of inventing an end', () => {
  const normalized = normalizeModerationDecisionInput(rawDecision({
    statementOfReasons: {
      ...rawDecision().statementOfReasons,
      durationType: 'not_applicable',
    },
  }), { statementRequired: true });

  assert.equal(normalized.statementOfReasons.durationType, 'not_applicable');
  assert.equal(normalized.statementOfReasons.endsAt, null);
});

function scriptedClient(steps) {
  return {
    async query(statement, values = []) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${statement}`);
      assert.match(statement, step.pattern);
      step.assertValues?.(values);
      return step.result;
    },
  };
}

test('significant moderation persists decision, Statement and audit atomically', async () => {
  const decisionRow = {
    id: '11111111-1111-4111-8111-111111111111',
    target_type: 'listing',
    target_id: 'listing-1',
    measure_type: 'listing_restriction',
    measure_state: 'hidden',
    facts: rawDecision().facts,
    basis: rawDecision().basis,
    reasoning: rawDecision().reasoning,
    detection_method: 'human',
    automated_means: null,
    review_available: true,
    review_deadline_at: new Date('2027-02-22T10:00:00.000Z'),
    created_at: issuedAt,
  };
  const statementRow = {
    statement_version: moderationStatementVersion,
    decision_ground: 'terms_violation',
    decision_origin: 'notice',
    territorial_scope: rawDecision().statementOfReasons.territorialScope,
    duration_type: 'until_reversed',
    starts_at: issuedAt,
    ends_at: null,
    automation_role: 'none',
    human_reviewed: true,
    review_channel: 'authenticated_in_app',
    published_at: issuedAt,
  };
  const steps = [
    { pattern: /FROM moderation_decisions AS decision[\s\S]*LEFT JOIN moderation_statements_of_reasons/u, result: { rowCount: 0, rows: [] } },
    { pattern: /SELECT id FROM users/u, result: { rowCount: 1, rows: [{ id: 'owner-1' }] } },
    { pattern: /INSERT INTO moderation_decisions/u, result: { rowCount: 1, rows: [decisionRow] } },
    {
      pattern: /INSERT INTO moderation_statements_of_reasons/u,
      assertValues: (values) => {
        assert.equal(values[0], decisionRow.id);
        assert.equal(values[1], moderationStatementVersion);
        assert.equal(values[9], 'admin-1');
      },
      result: { rowCount: 1, rows: [statementRow] },
    },
    {
      pattern: /INSERT INTO audit_log/u,
      assertValues: (values) => {
        const metadata = JSON.parse(values[5]);
        assert.equal(metadata.statementVersion, moderationStatementVersion);
        assert.equal(metadata.automationRole, 'none');
        assert.equal(Object.hasOwn(metadata, 'facts'), false);
      },
      result: { rowCount: 1, rows: [] },
    },
  ];

  const result = await persistModerationDecision(scriptedClient(steps), {
    actor: { id: 'admin-1', role: 'admin' },
    recipientUserId: 'owner-1',
    targetType: 'listing',
    targetId: 'listing-1',
    measureType: 'listing_restriction',
    measureState: 'hidden',
    raw: rawDecision(),
    idempotencyKey: 's3p-listing-hide',
    issuedAt,
    expectedStatement: { durationType: 'until_reversed', endsAt: null },
  });

  assert.equal(result.replayed, false);
  assert.equal(result.decision.statementOfReasons.version, moderationStatementVersion);
  assert.equal(result.decision.statementOfReasons.humanReviewed, true);
  assert.equal(steps.length, 0);
});

test('significant moderation is admin-only and duration-bound before database writes', async () => {
  const unusedClient = { query: () => assert.fail('database must not be queried') };
  await assert.rejects(
    persistModerationDecision(unusedClient, {
      actor: { id: 'support-1', role: 'support' },
      recipientUserId: 'owner-1',
      targetType: 'listing',
      targetId: 'listing-1',
      measureType: 'listing_restriction',
      measureState: 'hidden',
      raw: rawDecision(),
      idempotencyKey: 's3p-support-forbidden',
    }),
    (error) => error instanceof ModerationDecisionError
      && error.code === 'admin_role_required',
  );

  await assert.rejects(
    persistModerationDecision(unusedClient, {
      actor: { id: 'admin-1', role: 'admin' },
      recipientUserId: 'owner-1',
      targetType: 'listing',
      targetId: 'listing-1',
      measureType: 'listing_restriction',
      measureState: 'hidden',
      raw: rawDecision(),
      idempotencyKey: 's3p-duration-mismatch',
      expectedStatement: {
        durationType: 'fixed',
        endsAt: '2026-08-23T10:00:00.000Z',
      },
    }),
    (error) => error instanceof ModerationDecisionError
      && error.code === 'moderation_statement_duration_mismatch',
  );
});

test('migration requires one append-only Statement for every significant new measure', () => {
  const migration = readFileSync(
    new URL('../sql/migrations/044_moderation_statement_of_reasons.up.sql', import.meta.url),
    'utf8',
  );
  const rollback = readFileSync(
    new URL('../sql/migrations/044_moderation_statement_of_reasons.down.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /moderation_decision_id UUID PRIMARY KEY/u);
  assert.match(migration, /human_reviewed BOOLEAN NOT NULL CHECK \(human_reviewed\)/u);
  assert.match(migration, /moderation_statement_human_reviewer_mismatch/u);
  assert.match(migration, /moderation_statement_admin_reviewer_required/u);
  assert.match(migration, /CREATE TRIGGER moderation_statements_of_reasons_append_only/u);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER moderation_decisions_statement_required/u);
  for (const measure of [
    'account_suspension',
    'scope_suspension',
    'listing_restriction',
    'private_marketplace_review',
    'measure_reversal',
  ]) {
    assert.match(migration, new RegExp(`'${measure}'`, 'u'));
  }
  assert.match(rollback, /rollback refused: moderation Statement of Reasons evidence exists/u);
});
