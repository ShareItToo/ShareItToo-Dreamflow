import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSupportBreakGlassRequest,
  normalizeSupportBreakGlassReview,
} from '../src/support_break_glass_domain.js';

test('break-glass requires a bounded explicit reason and justification', () => {
  assert.deepEqual(
    normalizeSupportBreakGlassRequest({
      reasonCode: 'p0_immediate_safety_response',
      justification: 'P0-Sicherheitsfall benötigt sofortige fachliche Sichtung.',
    }, 'grant-1'),
    {
      reasonCode: 'p0_immediate_safety_response',
      justification: 'P0-Sicherheitsfall benötigt sofortige fachliche Sichtung.',
      idempotencyKey: 'support.break_glass.create:grant-1',
    },
  );
  assert.throws(
    () => normalizeSupportBreakGlassRequest({}, 'grant-1'),
    /support_break_glass_reason_required/u,
  );
  assert.throws(
    () => normalizeSupportBreakGlassRequest({
      reasonCode: 'free_form_reason',
      justification: 'Dieser freie Grund darf den kontrollierten Pfad nicht erweitern.',
    }, 'grant-1'),
    /support_break_glass_reason_invalid/u,
  );
});

test('break-glass text rejects embedded credentials and markup', () => {
  for (const justification of [
    'password=should-never-be-stored',
    '<script>keine interne HTML-Ausführung</script>',
  ]) {
    assert.throws(
      () => normalizeSupportBreakGlassRequest({
        reasonCode: 'p0_incident_containment',
        justification,
      }, 'grant-2'),
      /support_break_glass_justification_invalid/u,
    );
  }
});

test('independent review accepts only explicit bounded outcomes', () => {
  assert.deepEqual(
    normalizeSupportBreakGlassReview({
      outcome: 'appropriate',
      notes: 'Zugriff war auf die belegte P0-Lage und den Fall beschränkt.',
    }, 'review-1'),
    {
      outcome: 'appropriate',
      notes: 'Zugriff war auf die belegte P0-Lage und den Fall beschränkt.',
      idempotencyKey: 'support.break_glass.review:review-1',
    },
  );
  assert.throws(
    () => normalizeSupportBreakGlassReview({
      outcome: 'ignored',
      notes: 'Dieser Ausgang ist nicht Teil der überprüfbaren Allowlist.',
    }, 'review-2'),
    /support_break_glass_review_outcome_invalid/u,
  );
});
