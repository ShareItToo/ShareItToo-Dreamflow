#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { boundDigest, materializeBoundSourceTexts, resolveBoundSnapshot } from
  './read_bound_source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp150-completed-payment-command-replay-integrity-20260914.json';
const handoverPath =
  'docs/operations/WP150_COMPLETED_PAYMENT_COMMAND_REPLAY_INTEGRITY_2026-09-14.md';

export const wp150SourcePaths = Object.freeze([
  'backend/sql/migrations/007_b8_payments_and_ledger.up.sql',
  'backend/sql/migrations/076_payment_command_result_immutability.down.sql',
  'backend/sql/migrations/076_payment_command_result_immutability.up.sql',
  'backend/src/app.js',
  'backend/src/payment_domain.js',
  'backend/src/payment_workflow.js',
  'backend/test/payment_command_completion_replay.test.js',
  'backend/test/payment_command_replay_expiry.test.js',
  'backend/test/payment_command_replay_integrity.test.js',
  'backend/test/payment_command_result_immutability.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'docs/current_state.md',
  'docs/current_work_package.md',
  'docs/operations/WP150_COMPLETED_PAYMENT_COMMAND_REPLAY_INTEGRITY_2026-09-14.md',
  'scripts/technical_regression_check.sh',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'test/tool/payment_provider_truthfulness_wiring.test.mjs',
  'test/tool/run_r9_database_recovery.test.mjs',
  'test/tool/validate_privacy_disclosures.test.mjs',
  'test/tool/validate_retention_deletion_readiness.test.mjs',
  'test/tool/validate_wp150_completed_payment_command_replay_integrity.test.mjs',
  'tool/run_r9_database_recovery.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_wp150_completed_payment_command_replay_integrity.mjs',
]);

const boundaryKeys = Object.freeze([
  'providerRequestPerformed',
  'stripeConfigurationChanged',
  'paymentPerformed',
  'moneyMoved',
  'deploymentChanged',
  'productionChanged',
  'publicActivationChanged',
  'storeChanged',
  'firebaseChanged',
  'credentialReadOrRecorded',
  'deviceChanged',
  'pullRequestMerged',
]);

function fail(message) {
  throw new Error(`WP150 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function includes(text, marker, label) {
  if (!text.includes(marker)) fail(`${label} is incomplete.`);
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function digest(repositoryRoot, path, sourceTexts, revision, expectedDigest) {
  try {
    return boundDigest({ repositoryRoot, path, sourceTexts, revision, expectedDigest });
  } catch (error) {
    fail(error?.message ?? `bound source digest invalid: ${path}`);
  }
}

function inventoryDigest(inventory) {
  return createHash('sha256')
    .update(Object.entries(inventory)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(''))
    .digest('hex');
}

function ordered(text, markers, label) {
  let cursor = -1;
  for (const marker of markers) {
    const found = text.indexOf(marker, cursor + 1);
    if (found < 0 || found <= cursor) fail(`${label} ordering is invalid.`);
    cursor = found;
  }
}

function validateRuntime(repositoryRoot, sourceTexts) {
  const migration = source(
    repositoryRoot,
    'backend/sql/migrations/076_payment_command_result_immutability.up.sql',
    sourceTexts,
  );
  const workflow = source(repositoryRoot, 'backend/src/payment_workflow.js', sourceTexts);
  const app = source(repositoryRoot, 'backend/src/app.js', sourceTexts);
  const completionTests = source(
    repositoryRoot,
    'backend/test/payment_command_completion_replay.test.js',
    sourceTexts,
  );

  for (const marker of [
    'payment_command_historical_completion_malformed',
    'ADD COLUMN response_payload_sha256 CHAR(64)',
    'ADD COLUMN completion_integrity_version SMALLINT',
    'ADD COLUMN settlement_refunded_minor BIGINT',
    'ADD COLUMN settlement_transferred_minor BIGINT',
    'payment_commands_result_null_parity',
    'payment_commands_result_object',
    'payment_commands_result_hash',
    'payment_commands_completion_integrity_version',
    'payment_commands_settlement_snapshot',
    'settlement_refunded_minor IS NOT NULL',
    'settlement_transferred_minor IS NOT NULL',
    'payment_command_direct_completion_forbidden',
    'payment_command_identity_immutable',
    'payment_command_payment_binding_immutable',
    'payment_command_completed_result_immutable',
    'payment_command_completed_deletion_forbidden',
    'payment_command_completion_hash_invalid',
    'BEFORE INSERT OR UPDATE OR DELETE ON payment_commands',
  ]) includes(migration, marker, 'migration');

  const completion = workflow.slice(
    workflow.indexOf('async function completeCommand'),
    workflow.indexOf('function replayIntegrityFailure'),
  );
  for (const marker of [
    'command.idempotency_key !== key',
    'command.command_type !== type',
    'command.actor_id !== actorId',
    'command.booking_id !== bookingId',
    'command.request_hash !== requestHash(request)',
    'settlementSnapshotValid',
    'completion_integrity_version = 1',
    'settlement_refunded_minor = $4',
    'settlement_transferred_minor = $5',
    'command.response_payload_hash_valid !== true',
    'AND completed_at IS NULL',
    'RETURNING idempotency_key',
    'completed.rowCount !== 1',
    'payment_command_completion_conflict',
  ]) includes(completion, marker, 'one-shot command completion');

  const trusted = workflow.slice(
    workflow.indexOf('function validTrustedCompletedCommand'),
    workflow.indexOf('function validStoredConnectOnboardingResponse'),
  );
  for (const marker of [
    'command.idempotency_key === key',
    'command.command_type === type',
    'command.actor_id === actorId',
    'command.booking_id === bookingId',
    'command.payment_id === paymentId',
    'command.request_hash === requestHash(request)',
    'command.completion_integrity_version === 1',
    'command.response_payload_hash_valid === true',
  ]) includes(trusted, marker, 'trusted completed command binding');

  const common = workflow.slice(
    workflow.indexOf('function validCompletedCommand'),
    workflow.indexOf('export function validateCompletedRefundCommandReplay'),
  );
  for (const marker of [
    'validTrustedCompletedCommand({',
    'bookingId: payment.booking_id',
    'paymentId: payment.id',
    'settlement_refunded_minor',
    'settlement_transferred_minor',
    'validStoredPaymentReceipt(command.response_payload.payment, payment, type)',
    'command.response_payload.payment.refundedMinor === Number(refundedSnapshot)',
    'command.response_payload.payment.transferredMinor === Number(transferredSnapshot)',
  ]) includes(common, marker, 'completed command binding');

  const refundValidator = workflow.slice(
    workflow.indexOf('export function validateCompletedRefundCommandReplay'),
    workflow.indexOf('export function validateCompletedPayoutCommandReplay'),
  );
  for (const marker of [
    'refund.idempotency_key !== key',
    'refund.payment_id !== paymentId',
    "refund.status !== 'succeeded'",
    'refund.provider_charge_id !== payment.provider_charge_id',
    'ledger.idempotency_key !== `${key}:refund-ledger`',
    "ledger.transaction_type !== 'payment_refunded'",
    'ledger.provider_reference !== refund.provider_refund_id',
    'validLedgerEntries(ledgerEntries, refundLedger({',
  ]) includes(refundValidator, marker, 'refund replay binding');

  const payoutValidator = workflow.slice(
    workflow.indexOf('export function validateCompletedPayoutCommandReplay'),
    workflow.indexOf('async function paymentCommandForUpdate'),
  );
  for (const marker of [
    'payout.idempotency_key !== key',
    'payout.payment_id !== paymentId',
    'payout.booking_id !== payment.booking_id',
    'payout.payee_id !== payment.owner_id',
    'ledger.idempotency_key === `${key}:transfer-ledger`',
    "ledger.transaction_type === 'owner_transfer'",
    'ledger.provider_reference === payout.provider_transfer_id',
    'validLedgerEntries(ledgerEntries, transferLedger({',
    'ledgers.length === 0',
    'ledgerEntries.length === 0',
  ]) includes(payoutValidator, marker, 'payout replay binding');

  const lookup = workflow.slice(
    workflow.indexOf('async function paymentCommandForUpdate'),
    workflow.indexOf('async function validatedRefundCommandReplay'),
  );
  for (const marker of [
    'command.response_payload_sha256 IS NOT NULL',
    "digest(command.response_payload::text, 'sha256')",
    'AS response_payload_hash_valid',
    'FOR UPDATE',
  ]) includes(lookup, marker, 'stored-response hash readback');

  const refund = workflow.slice(
    workflow.indexOf('export async function refundPayment'),
    workflow.indexOf('async function markPayoutTransferFailure'),
  );
  ordered(refund, [
    'completedCommand?.completed_at',
    'validatedRefundCommandReplay',
    'assertPaymentExecutionActive(config);',
    'beginCommand(client',
  ], 'refund replay-before-authorization');

  const payout = workflow.slice(
    workflow.indexOf('export async function releasePayout'),
    workflow.indexOf('export async function reviewFailedPayout'),
  );
  ordered(payout, [
    'completedCommand?.completed_at && !internalRecovery',
    'validatedPayoutCommandReplay',
    'assertPaymentExecutionActive(config);',
    'beginCommand(client',
  ], 'payout replay-before-authorization');
  includes(payout, 'if (prepared.commandReplay) return', 'payout no-provider replay');

  const connect = workflow.slice(
    workflow.indexOf('export async function createConnectOnboarding'),
    workflow.indexOf('async function ensureCustomer'),
  );
  for (const marker of [
    'validTrustedCompletedCommand({',
    "type: 'connect.onboard'",
    'paymentId: null',
    'validStoredConnectOnboardingResponse',
    'allowCompletedReplay: true',
    'if (!completion.completed)',
    'completionReplayed = true',
    '? { ...resolvedResponse, replayed: true }',
  ]) includes(connect, marker, 'Connect completion collision');
  ordered(connect, [
    'const response = {',
    'if (!validStoredConnectOnboardingResponse(response, { country, currency }))',
    'await inTransaction(async (client)',
  ], 'fresh Connect response validation');

  const checkout = workflow.slice(
    workflow.indexOf('export async function createPaymentCheckout'),
    workflow.indexOf('export async function getBookingPayment'),
  );
  for (const marker of [
    'validTrustedCompletedCommand({',
    "type: 'payment.checkout'",
    'validStoredCheckoutResponse',
    'paymentCommandForUpdate(client, payment.checkout_command_key)',
    'await completeCommand(client, {',
    'allowCompletedReplay: true',
    'if (completion.completed)',
    'completionReplayed = true',
  ]) includes(checkout, marker, 'Checkout completion collision');
  ordered(checkout, [
    "'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))'",
    'beginCommand(client',
    'FROM bookings AS booking',
  ], 'Checkout advisory lock');
  ordered(checkout, [
    'const response = {',
    'if (!validStoredCheckoutResponse(response, {',
    'await inTransaction(async (client)',
  ], 'fresh Checkout response validation');
  for (const marker of [
    'concurrent Refund finalization replays the owner-bound completed result without financial DML',
    'different checkout key aliases the trusted canonical command under one lock order',
    'assertCheckoutAdvisoryPrecedesStateLocks',
    'wp150-checkout-canonical-k0',
    'wp150-checkout-alias-k1',
  ]) includes(completionTests, marker, 'completion race proof');

  const review = workflow.slice(
    workflow.indexOf('export async function reviewFailedPayout'),
    workflow.indexOf('export async function reconcilePaymentLifecycle'),
  );
  for (const marker of [
    'command.booking_id !== payout.booking_id',
    'command.response_payload_sha256 != null',
    'actorId: command.actor_id',
  ]) includes(review, marker, 'admin payout cancellation command binding');

  const refundRoute = app.slice(
    app.indexOf("app.post('/v1/payments/:id/refunds'"),
    app.indexOf("app.post('/v1/payments/:id/payout-release'"),
  );
  const payoutRoute = app.slice(
    app.indexOf("app.post('/v1/payments/:id/payout-release'"),
    app.indexOf("app.post('/v1/admin/payouts/:id/review'"),
  );
  for (const [name, route] of [['refund', refundRoute], ['payout', payoutRoute]]) {
    includes(route, 'if (!result.replayed) kickNotificationWorker();', `${name} worker guard`);
    exact(route.match(/kickNotificationWorker\(\)/gu)?.length, 1, `${name} worker count`);
  }
}

export function validateWp150CompletedPaymentCommandReplayIntegrity({
  evidence,
  handover,
  repositoryRoot = root,
  sourceTexts,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  let boundSnapshot;
  try {
    boundSnapshot = resolveBoundSnapshot({
      repositoryRoot,
      baselineHead: value.repository?.baselineHead,
      inventory: value.sourceInventory,
      anchorPath: evidencePath,
      finalHead: value.repository?.finalHead,
    });
  } catch (error) {
    fail(error?.message ?? 'bound source snapshot unavailable.');
  }
  const boundRevision = boundSnapshot.revision;
  sourceTexts = {
    ...materializeBoundSourceTexts({ repositoryRoot, snapshot: boundSnapshot }),
    ...sourceTexts,
  };

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp150-completed-payment-command-replay-integrity', 'kind');
  exact(value?.status, 'technical-closure-external-gates-hold', 'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '0fd6e9ff63405486b79590804cc2e476d4c2287c',
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository state');
  if (!/^2026-09-14T\d{2}:\d{2}:\d{2}Z$/u.test(value?.capturedAt ?? '')) {
    fail('capture instant is invalid.');
  }
  exact(value?.captureAttestation?.semantics,
    'declared-after-final-source-inventory-assembly-not-external-time-proof',
    'capture semantics');
  exact(value?.captureAttestation?.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory algorithm');

  for (const key of [
    'completedReplayAllowedAfterAuthorizationExpiry',
    'commandBindingExact',
    'principalBindingExact',
    'bookingBindingExact',
    'paymentBindingExact',
    'requestHashBindingExact',
    'responseHashBindingExact',
    'businessRowBindingExact',
    'commandTimeSettlementSnapshotExact',
    'ledgerHeaderBindingExact',
    'ledgerEntriesBindingExact',
    'freshOrIncompleteCommandRequiresActiveAuthorization',
    'replayHasNoProviderMutation',
    'replayHasNoFinancialDml',
    'replayDoesNotWakeNotificationWorker',
    'databaseCompletionIsOneShot',
    'completedCommandIdentityAndResultImmutable',
    'connectCompletionCollisionCanonical',
    'checkoutCompletionCollisionCanonical',
    'adminPayoutCancelUsesOriginalCommandActor',
  ]) exact(value?.invariant?.[key], true, `invariant.${key}`);
  exact(value?.invariant?.trustedCompletionIntegrityVersion, 1,
    'trusted completion integrity version');
  exact(value?.invariant?.legacyCompletedCommandReplayTrusted, false,
    'legacy completed-command trust');
  exact(value?.invariant?.freshOrIncompleteExpiredAuthorizationStatus, 503,
    'expired fresh-command status');
  exact(value?.invariant?.integrityMismatchStatus, 409, 'integrity mismatch status');

  exact(value?.historicalHashSemantics, {
    malformedHistoricalCompletionRejectedNotRepaired: true,
    completedPayloadHashBackfilledAtMigration: true,
    completedPayloadImmutableFromMigration: true,
    legacyCompletionIntegrityVersion: null,
    legacyCompletedCommandReplayTrusted: false,
    hashAuthenticatesPreMigrationProvenance: false,
  }, 'historical hash semantics');
  exact(value?.technicalDebt, {
    paymentCommandActorForeignKeyHardDeleteCollision: {
      priority: 'P2',
      status: 'open',
      currentErasureBehavior: 'soft-anonymization',
      foreignKeyBehavior: 'ON DELETE SET NULL',
    },
    refundPlatformFeeDurableSemantics: {
      priority: 'P2',
      status: 'open-separate-scope',
      databaseFlag: true,
      providerOption: false,
      truthMismatchOpen: true,
    },
  }, 'technical debt');
  exact(value?.verification, {
    focusedWp150Tests: 'passed-18-of-18',
    backendTests: 'passed-939-skipped-2',
    postgresIntegrationTests: 'passed-2-of-2-and-cleaned',
    migrationInventoryUpdated: true,
    r9InventoryUpdated: true,
    migrationNullSettlementConstraintProved: true,
    refundOwnerBoundRaceReplayProved: true,
    checkoutAdvisoryLockK0K1Proved: true,
    freshResponseValidationProved: true,
    privacyClassificationUnchanged: true,
    retentionClassificationUnchanged: true,
    dependentPrivacyInventoryHashRefreshOnly: true,
    dependentRetentionInventoryHashRefreshOnly: true,
    deterministicClosureValidator: true,
    fullTechnicalRegression: 'passed',
    githubRegression: 'pending',
    githubCodeql: 'pending',
  }, 'verification');
  exact(value?.gates, {
    professionalLegalApproval: false,
    ownerAdoptionRecorded: false,
    realMoneyAllowed: false,
    providerActivationAllowed: false,
    publicActivationAllowed: false,
    productionAllowed: false,
  }, 'external gates');
  exact(Object.keys(value?.boundaries ?? {}).sort(), [...boundaryKeys].sort(),
    'external boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundaries.${key}`);

  exact(Object.keys(value?.sourceInventory ?? {}).sort(), [...wp150SourcePaths],
    'source inventory paths');
  exact(value?.captureAttestation?.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp150SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) {
      fail(`source inventory ${path} does not contain a SHA-256 digest.`);
    }
    exact(
      digest(repositoryRoot, path, sourceTexts, boundRevision, value.sourceInventory[path]),
      value.sourceInventory[path],
      `source inventory ${path}`,
    );
  }

  validateRuntime(repositoryRoot, sourceTexts);
  const handoverText = handover
    ?? source(repositoryRoot, handoverPath, sourceTexts);
  for (const marker of [
    'abgelaufener Sandbox-Autorisierung',
    '503',
    'keine Provider-',
    'keine DML-',
    'Notification-Worker',
    'one-shot',
    'Connect',
    'Checkout',
    'Original-Actor',
    'keine authentische Provenienz',
    'ON DELETE SET NULL',
    'soft-anonymisiert',
    'refund_platform_fee',
    'K0/K1',
    'frische Antwort',
    'Privacy/Retention',
    'reine Hash-Refreshes',
    'Alle externen Gates bleiben geschlossen',
  ]) includes(handoverText, marker, 'handover');

  const serialized = JSON.stringify({ value, handoverText });
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    baselineHead: value.repository.baselineHead,
    focusedWp150Tests: value.verification.focusedWp150Tests,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
    githubRegression: value.verification.githubRegression,
    githubCodeql: value.verification.githubCodeql,
    realMoneyAllowed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp150CompletedPaymentCommandReplayIntegrity(),
    )}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP150 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
