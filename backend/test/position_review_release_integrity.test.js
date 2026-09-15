import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  readFile(new URL('../src/payment_workflow.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/v52_handover_return_workflow.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/booking_group_handover_workflow.js', import.meta.url), 'utf8'),
  readFile(new URL('../../lib/models/booking_group.dart', import.meta.url), 'utf8'),
]);

const [paymentWorkflow, returnWorkflow, groupWorkflow, groupClient] = sources;
const releaseStart = paymentWorkflow.indexOf('export async function releasePayout');
const releaseEnd = paymentWorkflow.indexOf('\nexport async function', releaseStart + 1);
const releasePayout = paymentWorkflow.slice(
  releaseStart,
  releaseEnd === -1 ? paymentWorkflow.length : releaseEnd,
);
const openCaseStart = returnWorkflow.indexOf('export async function openV52ReturnCase');
const openCase = returnWorkflow.slice(openCaseStart);

test('payout release derives a position hold only from canonical exact-booking truth', () => {
  assert.ok(releaseStart >= 0);
  assert.match(releasePayout, /canonicalPositionReviewHold\(\{/u);
  assert.match(releasePayout, /FROM v52_return_cases AS return_case/u);
  assert.match(releasePayout, /WHERE return_case\.booking_id = booking\.id/u);
  assert.match(releasePayout, /WHERE booking_id = \$1 AND \(/u);
  assert.match(releasePayout, /reviewScope:[\s\S]*'booking_position'/u);
  assert.match(releasePayout, /reviewCaseId:[\s\S]*reviewReasonCode:/u);
  assert.doesNotMatch(releasePayout, /booking_payload/u);
  assert.doesNotMatch(releasePayout, /payload\.contestedAuthorizedMinor/u);
  assert.doesNotMatch(releasePayout, /JOIN rental_requests/u);
});

test('return-case opening uses the post-lock database clock and refuses payout races', () => {
  assert.ok(openCaseStart >= 0);
  const lockIndex = openCase.indexOf("bookingBinding(client, bookingId, { lock: true })");
  const clockIndex = openCase.indexOf('SELECT clock_timestamp() AS database_now');
  const payoutFenceIndex = openCase.indexOf('SELECT payout.id');
  const evidenceIndex = openCase.indexOf('SELECT upload.id, upload.content_sha256');
  assert.ok(lockIndex >= 0 && clockIndex > lockIndex);
  assert.ok(payoutFenceIndex > clockIndex && evidenceIndex > payoutFenceIndex);
  assert.match(openCase, /payout\.status IN \('scheduled', 'pending', 'paid', 'reversed'\)/u);
  assert.match(openCase, /v52_return_case_conflicts_with_payout/u);
  assert.doesNotMatch(openCase, /binding\.database_now \?\?/u);
});

test('group projection and client parser preserve item review isolation fail closed', () => {
  assert.match(groupWorkflow, /return_case\.booking_id = ANY\(\$1::text\[\]\)/u);
  assert.match(groupWorkflow, /booking_case\.status AS case_status/u);
  assert.match(groupWorkflow, /groupNeedsReview: null/u);
  assert.match(groupWorkflow, /itemReviewIsolation: true/u);
  assert.match(groupClient, /review\['scope'\] != 'booking_position'/u);
  assert.match(groupClient, /review\['unrelatedPositionsBlocked'\] != false/u);
  assert.match(groupClient, /Invalid item review truth/u);
  assert.match(groupClient, /Item review isolation is not guaranteed/u);
});
