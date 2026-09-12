import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assessRetentionExecutionReadiness,
  validateRetentionDeletionReadiness,
} from '../../tool/validate_retention_deletion_readiness.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseRetention = JSON.parse(readFileSync(resolve(root, 'store/retention-deletion-readiness.json'), 'utf8'));
const basePrivacy = JSON.parse(readFileSync(resolve(root, 'store/privacy-disclosures.json'), 'utf8'));
const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function validate({ retentionManifest = clone(baseRetention), privacyManifest = clone(basePrivacy), sourceTexts = {}, evidenceTexts = {}, requireApproved = false } = {}) {
  return validateRetentionDeletionReadiness({ root, retentionManifest, privacyManifest, sourceTexts, evidenceTexts, requireApproved });
}

function closeProcessorVerification(processor, { ownerEvidence = true } = {}) {
  processor.retentionOwnerVerified = true;
  processor.deletionProcedureVerified = true;
  if (!processor.officialDocumentationReviewed) {
    processor.officialDocumentationReviewed = true;
    processor.officialEvidenceRef =
      'docs/evidence/b11/retention-active-provider-official.json';
    processor.serviceReadinessRef =
      'docs/evidence/b11/retention-active-provider-readiness.json';
  }
  if (ownerEvidence) {
    processor.ownerEvidenceRef = 'docs/evidence/b11/retention-external-owner.json';
  }
}

test('accepts the honest fail-closed retention draft', () => {
  assert.deepEqual(validate(), {state: 'draft', approvalAllowed: false, openDecisionCount: 10, storeGate: 'open'});
});

test('rejects unbounded or cross-principal local safety/privacy retention', () => {
  const unbounded = clone(baseRetention);
  unbounded.implementedControls.localSafetyPrivacyPrincipalState
    .maximumRetainedPrincipals = 0;
  assert.throws(
    () => validate({ retentionManifest: unbounded }),
    /retention controls must stay technically enforced/u,
  );

  const failOpen = clone(baseRetention);
  failOpen.implementedControls.localSafetyPrivacyPrincipalState
    .corruptPrincipalData = 'replace-with-empty';
  assert.throws(
    () => validate({ retentionManifest: failOpen }),
    /retention controls must stay technically enforced/u,
  );
});

test('inventories active hosting and mail processors as explicit open retention gates', () => {
  for (const processorId of ['hostingerVps', 'googleWorkspaceSmtpRelay']) {
    assert.deepEqual(baseRetention.externalProcessors[processorId], {
      retentionOwnerVerified: false,
      deletionProcedureVerified: false,
      officialDocumentationReviewed: false,
      officialEvidenceRef: null,
      serviceReadinessRef: null,
      ownerEvidenceRef: null,
    });
  }
});

test('rejects omitting an active processor from retention readiness', () => {
  const retentionManifest = clone(baseRetention);
  delete retentionManifest.externalProcessors.hostingerVps;
  assert.throws(
    () => validate({ retentionManifest }),
    /externalProcessors must contain exactly/,
  );
});

test('rejects active-provider classification drift behind retention readiness', () => {
  const path =
    'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.services.find((service) => service.id === 'googleWorkspaceSmtpRelay')
    .candidateState = 'inactive';
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /googleWorkspaceSmtpRelay must remain bound to the active provider classification/,
  );
});

test('rejects drift in support draft invalidation and owned route cleanup', () => {
  const path = 'lib/widgets/support_principal_controller.dart';
  const changed = `${readFileSync(resolve(root, path), 'utf8')}\n// drift\n`;
  assert.throws(
    () => validate({ sourceTexts: { [path]: changed } }),
    /sourceInventory hash is stale: lib\/widgets\/support_principal_controller.dart/,
  );
});

test('rejects drift in the retained user support case display', () => {
  const path = 'lib/screens/support_cases_screen.dart';
  const changed = `${readFileSync(resolve(root, path), 'utf8')}\n// drift\n`;
  assert.throws(
    () => validate({ sourceTexts: { [path]: changed } }),
    /sourceInventory hash is stale: lib\/screens\/support_cases_screen.dart/,
  );
});

test('execution preflight reports only stable blocker codes and exposes no destructive route', () => {
  const result = assessRetentionExecutionReadiness({
    retentionManifest: clone(baseRetention),
    privacyManifest: clone(basePrivacy),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.destructiveRouteExposed, false);
  assert.equal(result.blockerCount, 23);
  assert.deepEqual(result.blockers.slice(0, 3), [
    'retention-policy-approval-open',
    'decision-open:inactiveAccountPeriod',
    'decision-open:transactionalRecordPeriod',
  ]);
  assert.ok(result.blockers.includes('external-processor-open:firebaseCloudMessaging'));
  assert.ok(result.blockers.includes('external-processor-open:firebaseCrashlytics'));
  assert.ok(result.blockers.includes('external-processor-open:hostingerVps'));
  assert.ok(result.blockers.includes('external-processor-open:googleWorkspaceSmtpRelay'));
  assert.ok(result.blockers.includes('privacy-retention-schedule-open'));
  assert.doesNotMatch(JSON.stringify(result), /@|password|token|secret/iu);
});

test('execution preflight never reflects unsafe decision values into its output', () => {
  const retentionManifest = clone(baseRetention);
  retentionManifest.requiredDecisions.communicationPeriod.value = 'unsafe-owner@example.com';
  const result = assessRetentionExecutionReadiness({
    retentionManifest,
    privacyManifest: clone(basePrivacy),
  });
  assert.ok(result.blockers.includes('decision-open:communicationPeriod'));
  assert.doesNotMatch(JSON.stringify(result), /unsafe-owner|example\.com/iu);
});

test('approved paperwork alone cannot make retention execution ready', () => {
  const retentionManifest = clone(baseRetention);
  const privacyManifest = clone(basePrivacy);
  retentionManifest.state = 'approved';
  retentionManifest.approvalAllowed = true;
  retentionManifest.boundaries.legalApproval = true;
  retentionManifest.storeGate.status = 'closed';
  privacyManifest.requiredDecisions.retentionAndDeletionSchedule.status = 'closed';
  for (const [key, decision] of Object.entries(retentionManifest.requiredDecisions)) {
    decision.status = 'closed';
    decision.value = `approved-${key}`;
    decision.evidenceRef = `docs/evidence/b11/retention-${key}.json`;
  }
  for (const processor of Object.values(retentionManifest.externalProcessors)) {
    closeProcessorVerification(processor);
  }
  const result = assessRetentionExecutionReadiness({ retentionManifest, privacyManifest });
  assert.equal(result.executionAllowed, false);
  assert.deepEqual(result.blockers, [
    'category-purge-not-staging-verified',
    'retention-periods-not-applied',
    'eligible-rows-not-calculated',
    'retention-execution-disabled',
  ]);
});

test('execution preflight requires policy, processors, cutoffs, dry run and Store gate together', () => {
  const retentionManifest = clone(baseRetention);
  const privacyManifest = clone(basePrivacy);
  retentionManifest.state = 'approved';
  retentionManifest.approvalAllowed = true;
  retentionManifest.boundaries.legalApproval = true;
  retentionManifest.storeGate.status = 'closed';
  retentionManifest.implementedControls.categoryPurge.status =
    'implemented-staging-dry-run-verified';
  retentionManifest.implementedControls.retentionInventory.retentionPeriodsApplied = true;
  retentionManifest.implementedControls.retentionInventory.eligibleRowsCalculated = true;
  retentionManifest.implementedControls.retentionInventory.executionEnabled = true;
  privacyManifest.requiredDecisions.retentionAndDeletionSchedule.status = 'closed';
  for (const [key, decision] of Object.entries(retentionManifest.requiredDecisions)) {
    decision.status = 'closed';
    decision.value = `approved-${key}`;
    decision.evidenceRef = `docs/evidence/b11/retention-${key}.json`;
  }
  for (const processor of Object.values(retentionManifest.externalProcessors)) {
    closeProcessorVerification(processor);
  }
  const result = assessRetentionExecutionReadiness({ retentionManifest, privacyManifest });
  assert.deepEqual(result, {
    status: 'executable',
    executionAllowed: true,
    destructiveRouteExposed: false,
    blockerCount: 0,
    blockers: [],
  });
});

test('rejects preflight evidence that claims a destructive route was added', () => {
  const path = 'docs/evidence/b11/v51-retention-execution-preflight-20260817T130000Z.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.boundaries.deletionRouteAdded = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /non-destructive boundary/u,
  );
});

test('binds all ten prepared recommendations without pretending they are approved', () => {
  const preparation = baseRetention.decisionPreparation;
  assert.equal(preparation.preparedDecisionCount, 10);
  assert.equal(preparation.closedDecisionCount, 0);
  assert.equal(preparation.categoryPurgeEnabled, false);
  for (const decision of Object.values(baseRetention.requiredDecisions)) {
    assert.deepEqual(decision, { status: 'open', value: null, evidenceRef: null });
  }
});

test('rejects decision preparation that silently enables category purge', () => {
  const retentionManifest = clone(baseRetention);
  retentionManifest.decisionPreparation.categoryPurgeEnabled = true;
  assert.throws(() => validate({ retentionManifest }), /remain fail closed/u);
});

test('rejects decision evidence that treats recommendations as approval', () => {
  const path = 'docs/evidence/b11/retention-deletion-decision-preparation-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.boundaries.recommendationsAreApproval = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /must not claim approval or enable deletion/u,
  );
});

test('protects the separate default-off Push and Crash decision in the matrix', () => {
  const path = 'docs/compliance/retention-deletion-decision-matrix.md';
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace('Push darf Crashdiagnose niemals automatisch aktivieren.', 'Push kann Crashdiagnose aktivieren.');
  assert.throws(
    () => validate({ evidenceTexts: { [path]: changed } }),
    /Push darf Crashdiagnose niemals automatisch aktivieren/u,
  );
});

test('protects the documented default-off Crashlytics stored-report deletion gap', () => {
  const path = 'docs/compliance/retention-deletion-decision-matrix.md';
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace(
      'Eine standardmäßig ausgeschaltete serverseitige Löschwarteschlange mit Wiederholung und ohne SIT-Konto-ID ist vorbereitet.',
      'SIT löscht alle gespeicherten Berichte vollständig',
    );
  assert.throws(
    () => validate({ evidenceTexts: { [path]: changed } }),
    /standardmäßig ausgeschaltete serverseitige Löschwarteschlange/u,
  );
});

test('rejects decision preparation that omits a separate Firebase service authority', () => {
  const path = 'docs/evidence/b11/retention-deletion-decision-preparation-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.decisions.externalProcessorRetention.authorityRefs =
    evidence.decisions.externalProcessorRetention.authorityRefs.filter(
      (ref) => !ref.includes('firebase-crashlytics-retention-deletion-readiness'),
    );
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /missing separate authority/u,
  );
});

test('strict approval rejects the current retention draft', () => {
  assert.throws(() => validate({ requireApproved: true }), /Approved retention and deletion readiness is required/);
});

test('rejects source drift after retention review', () => {
  assert.throws(() => validate({ sourceTexts: {'backend/ops/backup.sh': '# changed\n'} }), /sourceInventory hash is stale/);
});

test('rejects a rehashed runtime that stops deleting the Firebase installation', () => {
  const path = 'lib/services/firebase_runtime.dart';
  const retentionManifest = clone(baseRetention);
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace('FirebaseInstallations.instance.delete()', 'Future<void>.value()');
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(
    () => validate({ retentionManifest, sourceTexts: { [path]: changed } }),
    /FirebaseInstallations.instance.delete\(\)/u,
  );
});

test('rejects account erasure that leaves notification payloads behind', () => {
  const path = 'backend/src/app.js';
  const retentionManifest = clone(baseRetention);
  const changed = readFileSync(resolve(root, path), 'utf8').replace("payload = '{}'::jsonb", 'payload = payload');
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(() => validate({ retentionManifest, sourceTexts: {[path]: changed} }), /residual-data control/);
});

test('rejects expired credential cleanup that leaves booking confirmation digests behind', () => {
  const path = 'backend/src/credential_cleanup.js';
  const retentionManifest = clone(baseRetention);
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace("code_digest = repeat('0', 64)", 'code_digest = code_digest');
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(
    () => validate({ retentionManifest, sourceTexts: {[path]: changed} }),
    /Expired credential cleanup is missing the contract/u,
  );
});

test('rejects claiming automatic credential purge when the API worker is disconnected', () => {
  const path = 'backend/src/server.js';
  const retentionManifest = clone(baseRetention);
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace('startCredentialCleanupWorker({ client: pool })', 'null');
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(
    () => validate({ retentionManifest, sourceTexts: {[path]: changed} }),
    /cleanup worker must start and stop/u,
  );
});

test('rejects legal-hold readiness when account deletion no longer checks active holds', () => {
  const path = 'backend/src/app.js';
  const changed = readFileSync(resolve(root, path), 'utf8').replaceAll('active_legal_holds', 'removed_legal_hold_gate');
  const retentionManifest = clone(baseRetention);
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(
    () => validate({ retentionManifest, sourceTexts: { [path]: changed } }),
    /legal-hold contract: active_legal_holds/u,
  );
});

test('rejects invented legal periods in an open decision', () => {
  const retentionManifest = clone(baseRetention);
  retentionManifest.requiredDecisions.transactionalRecordPeriod.value = 'ten years';
  assert.throws(() => validate({ retentionManifest }), /must not claim a value or evidence/);
});

test('rejects Store-gate drift from the privacy manifest', () => {
  const privacyManifest = clone(basePrivacy);
  privacyManifest.requiredDecisions.retentionAndDeletionSchedule.status = 'closed';
  assert.throws(() => validate({ privacyManifest }), /must match the privacy retentionAndDeletionSchedule decision/);
});

test('rejects account data in the retention manifest', () => {
  const retentionManifest = clone(baseRetention);
  retentionManifest.requiredDecisions.inactiveAccountPeriod.value = 'owner@example.com';
  assert.throws(() => validate({ retentionManifest }), /must not contain an email address/);
});

test('rejects a provider evidence reference whose official facts are incomplete', () => {
  const path = 'docs/evidence/b11/privacy-provider-retention-sources-20260812.json';
  const changed = readFileSync(resolve(root, path), 'utf8').replace('within 180 days', 'after an unspecified period');
  assert.throws(
    () => validate({ evidenceTexts: { [path]: changed } }),
    /Firebase Cloud Messaging source contract: within 180 days/,
  );
});

test('rejects provider evidence that prematurely claims owner approval', () => {
  const path = 'docs/evidence/b11/privacy-provider-retention-sources-20260812.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.boundaries.providerContractAcceptedByOwner = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /reviewed-but-unapproved release boundary/,
  );
});

test('binds Push and Crashlytics to separate service-readiness evidence', () => {
  const push = baseRetention.externalProcessors.firebaseCloudMessaging;
  const crash = baseRetention.externalProcessors.firebaseCrashlytics;
  assert.equal(
    push.serviceReadinessRef,
    'docs/evidence/b11/firebase-cloud-messaging-retention-deletion-readiness-20260817.json',
  );
  assert.equal(
    crash.serviceReadinessRef,
    'docs/evidence/b11/firebase-crashlytics-retention-deletion-readiness-20260817.json',
  );
  assert.notEqual(push.serviceReadinessRef, crash.serviceReadinessRef);
});

test('binds Firebase Authentication and Maps to their own readiness evidence', () => {
  const auth = baseRetention.externalProcessors.firebaseAuthentication;
  const maps = baseRetention.externalProcessors.googleMapsPlatform;
  assert.equal(
    auth.serviceReadinessRef,
    'docs/evidence/b11/firebase-authentication-retention-deletion-readiness-20260817.json',
  );
  assert.equal(
    maps.serviceReadinessRef,
    'docs/evidence/b11/google-maps-platform-retention-deletion-readiness-20260817.json',
  );
  assert.notEqual(auth.serviceReadinessRef, maps.serviceReadinessRef);
});

test('rejects regressing persistent Firebase social identity deletion', () => {
  const path =
    'docs/evidence/b11/firebase-authentication-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.currentTechnicalControls
    .persistentSocialIdentityDeletionOnAccountErasureImplemented = false;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /persistentSocialIdentityDeletionOnAccountErasureImplemented must remain true/u,
  );
});

test('rejects inventing a fixed Google Maps retention period', () => {
  const path =
    'docs/evidence/b11/google-maps-platform-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.retentionAndDeletionReality.singleFixedProviderRetentionPeriodAvailable = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /singleFixedProviderRetentionPeriodAvailable must remain false/u,
  );
});

test('rejects using Push readiness as Crashlytics readiness', () => {
  const retentionManifest = clone(baseRetention);
  retentionManifest.externalProcessors.firebaseCrashlytics.serviceReadinessRef =
    retentionManifest.externalProcessors.firebaseCloudMessaging.serviceReadinessRef;
  assert.throws(
    () => validate({ retentionManifest }),
    /firebaseCrashlytics must reference only its own service-specific readiness evidence/u,
  );
});

test('rejects a Push readiness artifact that can enable Crashlytics', () => {
  const path =
    'docs/evidence/b11/firebase-cloud-messaging-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.currentTechnicalControls.runtimeEnablementCanEnableCrashlytics = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /runtimeEnablementCanEnableCrashlytics must remain false/u,
  );
});

test('rejects pretending that server-side Crashlytics report deletion is implemented', () => {
  const path =
    'docs/evidence/b11/firebase-crashlytics-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.currentTechnicalControls.storedCrashReportDeletionInvocationImplemented = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /storedCrashReportDeletionInvocationImplemented must remain false/u,
  );
});

test('rejects silently enabling Crashlytics subject transmission or provider deletion', () => {
  const path =
    'docs/evidence/b11/firebase-crashlytics-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.currentTechnicalControls.pseudonymousSdkSubjectTransmissionImplemented = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /pseudonymousSdkSubjectTransmissionImplemented must remain false/u,
  );
});

test('rejects premature provider or replacement-candidate approval in service readiness', () => {
  const path =
    'docs/evidence/b11/firebase-cloud-messaging-retention-deletion-readiness-20260817.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.retentionAndDeletionReality.currentAccountContractAcceptanceVerified = true;
  evidence.activationBoundary.replacementCandidateBuilt = true;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /currentAccountContractAcceptanceVerified must remain false/u,
  );
});

test('rejects credential cleanup evidence that claims deployment without proof', () => {
  const path = 'docs/evidence/b11/expired-credential-cleanup-20260815.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.status = 'staging-runtime-verified';
  evidence.verification.stagingRuntime = 'passed';
  evidence.deployment.status = 'verified';
  evidence.deployment.commit = null;
  evidence.deployment.evidenceRef = null;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /exact Staging deployment proof/u,
  );
});

test('rejects legal-hold evidence that claims deployment without proof', () => {
  const path = 'docs/evidence/b11/account-legal-hold-20260815.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.status = 'staging-runtime-verified';
  evidence.verification.fullBackendSuite = 'passed-example';
  evidence.verification.fullTechnicalRegression = 'passed-candidate-rollover-mode';
  evidence.verification.stagingRuntime = 'passed';
  evidence.deployment.status = 'verified';
  evidence.deployment.commit = null;
  evidence.deployment.evidenceRef = null;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /exact Staging deployment proof/u,
  );
});

test('rejects omitting Firebase Authentication retention and deletion evidence', () => {
  const path = 'docs/evidence/b11/privacy-provider-retention-sources-20260812.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.sources = evidence.sources.filter(
    (source) => source.provider !== 'Firebase Authentication',
  );
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /Firebase Authentication source contract/,
  );
});

test('rejects owner verification without a separate owner evidence reference', () => {
  const retentionManifest = clone(baseRetention);
  const privacyManifest = clone(basePrivacy);
  privacyManifest.requiredDecisions.retentionAndDeletionSchedule.status = 'closed';
  const externalDecision = retentionManifest.requiredDecisions.externalProcessorRetention;
  externalDecision.status = 'closed';
  externalDecision.value = 'approved-external-retention';
  externalDecision.evidenceRef = 'docs/evidence/b11/retention-external-owner.json';
  for (const processor of Object.values(retentionManifest.externalProcessors)) {
    closeProcessorVerification(processor, { ownerEvidence: false });
  }
  retentionManifest.storeGate.status = 'closed';
  assert.throws(
    () => validate({ retentionManifest, privacyManifest }),
    /requires separate owner evidence/,
  );
});

test('rejects a retention inventory that gains a destructive statement', () => {
  const path = 'backend/src/retention_inventory.js';
  const retentionManifest = clone(baseRetention);
  const changed = `${readFileSync(resolve(root, path), 'utf8')}\n// DELETE FROM messages\n`;
  retentionManifest.sourceInventory.find((entry) => entry.path === path).sha256 = sha256(changed);
  assert.throws(
    () => validate({ retentionManifest, sourceTexts: { [path]: changed } }),
    /Retention inventory must remain read-only/u,
  );
});

test('rejects retention-inventory evidence that claims deployment without proof', () => {
  const path = 'docs/evidence/b11/retention-inventory-20260815.json';
  const evidence = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  evidence.status = 'staging-runtime-verified';
  evidence.verification.fullBackendSuite = 'passed-example';
  evidence.verification.fullTechnicalRegression = 'passed-candidate-rollover-mode';
  evidence.verification.stagingRuntime = 'passed';
  evidence.deployment.status = 'verified';
  evidence.deployment.commit = null;
  evidence.deployment.evidenceRef = null;
  assert.throws(
    () => validate({ evidenceTexts: { [path]: JSON.stringify(evidence) } }),
    /exact Staging deployment proof/u,
  );
});

test('accepts a fully evidence-backed approved fixture', () => {
  const retentionManifest = clone(baseRetention);
  const privacyManifest = clone(basePrivacy);
  retentionManifest.state = 'approved';
  retentionManifest.approvalAllowed = true;
  retentionManifest.boundaries.legalApproval = true;
  retentionManifest.storeGate.status = 'closed';
  privacyManifest.requiredDecisions.retentionAndDeletionSchedule.status = 'closed';
  for (const [key, decision] of Object.entries(retentionManifest.requiredDecisions)) {
    decision.status = 'closed';
    decision.value = `approved-${key}`;
    decision.evidenceRef = `docs/evidence/b11/retention-${key}.json`;
  }
  for (const processor of Object.values(retentionManifest.externalProcessors)) {
    closeProcessorVerification(processor);
  }
  assert.equal(validate({ retentionManifest, privacyManifest, requireApproved: true }).state, 'approved');
});
