#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dossierPath = 'docs/evidence/p0b/pilot-go-no-go-dossier.json';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length
      || value.some((entry, index) => entry !== expected[index])) {
    fail(`${label} does not match the approved P0B contract.`);
  }
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return String(overrides[relativePath]);
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(contents, expected, label) {
  if (!contents.includes(expected)) fail(`${label} is missing ${expected}.`);
}

export function validateP0BPilotDossier({
  root = defaultRoot,
  dossier = undefined,
  sourceOverrides = {},
  pathExists = existsSync,
} = {}) {
  const readiness = object(
    dossier ?? JSON.parse(source(root, dossierPath, sourceOverrides)),
    'P0B dossier',
  );
  if (readiness.schemaVersion !== 1
      || readiness.kind !== 'p0b-pilot-go-no-go-dossier'
      || readiness.state !== 'hold-hard-gates'
      || readiness.decision !== 'no_go_now') {
    fail('P0B identity or NO-GO state is invalid.');
  }

  const binding = object(readiness.source, 'source');
  if (binding.drivePackage?.id !== '1d3JJLq-X36u9IwfhyhtNm1QYH38urVEq'
      || binding.drivePackage?.title !== '02_CODEX_WORK_PACKAGES_SIT_V2.4.md'
      || binding.p0aImplementationCommit !== '540583829361a402066f85c81716ba60d7d475cc'
      || binding.p0aCiRun !== '32433274526'
      || binding.p0aSyntheticMerge !== '6bff2509868afd3be4f5ac8ad3829d589e7f186d') {
    fail('P0B is not bound to the exact Drive and P0A baseline.');
  }
  const expectedDriveDocuments = [
    ['1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx', '01_V5.2_CORE_SPECIFICATION.md'],
    ['1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2', '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf'],
    ['1z9GdNlilUrpq1P34lrXdqv6RmJHYSQfJ', '01_SIT_MASTER_V2_DEUTSCHLAND_ZU_GLOBAL.pdf'],
    ['1R_JeRkFXTsFVusKlqeM5wS2-MZAV0fdx', '02_SIT_Growth_Product_Projektkorb_und_SIT_Planer.docx'],
    ['1UdwK9GB79Zlt1jIKcWoG43J8LQezJDdE', '04_SIT_BUSINESS_PRODUKTSTRATEGIE_UND_WACHSTUMSGATE.pdf'],
  ];
  if (!Array.isArray(binding.driveDocuments)
      || binding.driveDocuments.length !== expectedDriveDocuments.length) {
    fail('P0B Drive source set is incomplete.');
  }
  for (const [index, entry] of binding.driveDocuments.entries()) {
    const [id, title] = expectedDriveDocuments[index];
    if (entry?.id !== id || entry.title !== title
        || !Number.isFinite(Date.parse(entry.modifiedAt))) {
      fail(`P0B Drive source is invalid: ${title}`);
    }
  }
  if (!Array.isArray(binding.repoEvidenceRefs) || binding.repoEvidenceRefs.length < 8) {
    fail('P0B repository evidence set is incomplete.');
  }
  for (const evidenceRef of binding.repoEvidenceRefs) {
    if (!Object.hasOwn(sourceOverrides, evidenceRef)
        && !pathExists(resolve(root, evidenceRef))) {
      fail(`P0B repository evidence does not exist: ${evidenceRef}`);
    }
  }

  const constraints = object(readiness.constraints, 'constraints');
  for (const field of [
    'pilotActivationAllowed',
    'publicRegistrationAllowed',
    'realMoneyAllowed',
    'liveProviderTrafficAllowed',
    'productionMutationAllowed',
    'storeSubmissionAllowed',
    'signedCandidateAllowed',
    'accountPermissionChangeAllowed',
    'autoContinueAllowed',
  ]) {
    if (constraints[field] !== false) fail(`P0B boundary must remain false: ${field}`);
  }

  const expectedFeatures = [
    ['v52_single_item_core', 'implemented', 'hold'],
    ['g2_navigation_cart_and_gemerkt', 'implemented', 'hold'],
    ['g3_same_owner_booking_groups', 'implemented-technical', 'hold'],
    ['g4_deterministic_planner_and_inventory', 'implemented-technical', 'hold'],
    ['g5_supply_enrichment', 'implemented-technical', 'hold'],
    ['g5_listing_sets', 'implemented-technical', 'hold'],
    ['u0_pilot_cockpit', 'implemented-read-only', 'hold'],
    ['fi1_operational_delegation', 'role-model-and-runbooks-only', 'blocked'],
    ['p0a_technical_readiness', 'implemented-and-ci-verified', 'hold'],
    ['sit_business', 'strategy-only', 'not_authorized'],
    ['multi_provider_projects', 'not-implemented', 'not_authorized'],
    ['external_ai_and_control_tower', 'not-implemented-for-production', 'not_authorized'],
    ['global_country_launch', 'strategy-only', 'not_authorized'],
  ];
  if (!Array.isArray(readiness.featureMatrix)
      || readiness.featureMatrix.length !== expectedFeatures.length) {
    fail('P0B feature matrix must contain exactly thirteen entries.');
  }
  for (const [index, feature] of readiness.featureMatrix.entries()) {
    const [id, implementationState, state] = expectedFeatures[index];
    if (feature?.id !== id || feature.implementationState !== implementationState
        || feature.readiness !== state || feature.publicReleaseAllowed !== false
        || typeof feature.runtimeState !== 'string' || feature.runtimeState.trim() === ''
        || typeof feature.productionDefault !== 'string' || feature.productionDefault.trim() === ''
        || typeof feature.reason !== 'string' || feature.reason.trim() === '') {
      fail(`P0B feature entry is unsafe or overstated: ${id}`);
    }
    if (!Array.isArray(feature.evidenceRefs) || feature.evidenceRefs.length === 0) {
      fail(`P0B feature entry has no evidence: ${id}`);
    }
    for (const evidenceRef of feature.evidenceRefs) {
      if (!evidenceRef.startsWith('runtime:')
          && !Object.hasOwn(sourceOverrides, evidenceRef)
          && !pathExists(resolve(root, evidenceRef))) {
        fail(`P0B feature evidence does not exist: ${evidenceRef}`);
      }
    }
  }

  const legal = object(readiness.legalReview, 'legalReview');
  if (legal.required !== true || legal.state !== 'open-hard-gate'
      || legal.sourceStatus !== 'V5.2-decision-draft-not-professionally-approved'
      || legal.runtimeManifestState !== 'draft-active-v51-interim-with-v52-machinery-present'
      || !Array.isArray(legal.reviewScopes) || legal.reviewScopes.length !== 11
      || legal.approvedContentHashesAvailable !== false
      || legal.approvedPublicUrlsAvailable !== false
      || legal.professionalApprovalEvidenceAvailable !== false
      || legal.mayBeInferredFromTechnicalTests !== false) {
    fail('P0B legal review gate is incomplete or overstated.');
  }

  const payment = object(readiness.paymentAndProvider, 'paymentAndProvider');
  if (payment.state !== 'blocked' || payment.productionDefault !== 'disabled'
      || payment.stagingDefault !== 'memory' || payment.stripeLivemode !== false
      || payment.realMoneyAuthorized !== false
      || payment.liveProviderTrafficExecuted !== false
      || payment.marketplacePspContract !== 'open'
      || payment.providerLegalAndDpaFacts !== 'open'
      || payment.ownerOnboardingAndKyc !== 'open'
      || payment.sandboxEndToEnd !== 'not-started'
      || payment.captureRefundPayoutChargebackEvidence !== 'not-available'
      || payment.rentMoneyToSitAccountAllowed !== false
      || payment.damageCaptureAllowed !== false) {
    fail('P0B payment/provider gate is incomplete or unsafe.');
  }

  const operations = object(readiness.operations, 'operations');
  if (operations.state !== 'blocked' || operations.functionalRoleCount !== 6
      || operations.assignedRoleCount !== 0 || operations.assignedDelegateCount !== 0
      || operations.delegatedProcessCount !== 4 || operations.readyProcessCount !== 0
      || operations.absenceTestsPassed !== 0 || operations.minimumBusFactorTarget !== 2
      || operations.minimumBusFactorEvidenced !== false
      || operations.companySystemOwnership !== 'open'
      || operations.companyAccountRbac !== 'open'
      || operations.namedPersonDependencyAllowed !== false
      || operations.founderAutomaticEscalationAllowed !== false) {
    fail('P0B operational readiness must remain blocked.');
  }

  const economics = object(
    readiness.economicsAndFounderIndependence,
    'economicsAndFounderIndependence',
  );
  if (economics.state !== 'unavailable' || economics.profitability !== 'undetermined'
      || economics.positiveUnitEconomicsEvidenced !== false
      || economics.actualPilotPeriodAvailable !== false
      || economics.providerFees !== 'unavailable'
      || economics.vatComponent !== 'unavailable'
      || economics.cloudCosts !== 'unavailable'
      || economics.founderHours !== 'unavailable'
      || economics.founderReplacementRate !== 'unavailable'
      || economics.cartToBookingAttribution !== 'unavailable'
      || economics.disabledConfiguredZeroIsActualCostEvidence !== false
      || economics.planningTargets?.targetsAreObservedResults !== false) {
    fail('P0B unit economics must remain unavailable and undetermined.');
  }
  exactArray(economics.disabledConfiguredCostClasses,
    ['kyc', 'fraud', 'external-ai', 'marketing'],
    'economics.disabledConfiguredCostClasses');

  const risks = readiness.knownDefectsAndResidualRisk;
  if (!Array.isArray(risks) || risks.length !== 12
      || new Set(risks.map((risk) => risk.id)).size !== risks.length
      || risks.filter((risk) => risk.class === 'blocker').length !== 10
      || risks.filter((risk) => risk.class === 'residual').length !== 2
      || risks.some((risk) => typeof risk.detail !== 'string' || risk.detail.trim() === '')) {
    fail('P0B defects and residual-risk register is incomplete.');
  }

  const pilot = object(readiness.recommendedFuturePilot, 'recommendedFuturePilot');
  if (pilot.recommendationState !== 'conditional-after-separate-gates'
      || pilot.pilotType !== 'invited-private-synthetic-payment-flow-pilot'
      || pilot.publicRegistration !== false || pilot.realMoney !== false
      || pilot.liveProviderTraffic !== false
      || pilot.cohort?.invitedAdultPrivateUsers !== 30
      || pilot.cohort?.minimumAge !== 18 || pilot.cohort?.privateUseOnly !== true
      || pilot.cohort?.targetCompleteFlowRunsMinimum !== 30
      || pilot.cohort?.targetCompleteFlowRunsMaximum !== 50
      || pilot.region?.countryCode !== 'DE'
      || pilot.region?.label !== 'Spiegelberg, Rems-Murr-Kreis'
      || pilot.region?.recommendedAllowedRegionCode !== 'spiegelberg'
      || pilot.region?.currentlyConfigured !== false) {
    fail('P0B future pilot scope is not exact, bounded and conditional.');
  }
  const expectedCatalog = [
    ['cat8', 'Elektrowerkzeuge'],
    ['cat8', 'Bohrmaschinen'],
    ['cat8', 'Schleifer'],
  ];
  if (!Array.isArray(pilot.catalog) || pilot.catalog.length !== expectedCatalog.length
      || pilot.catalog.some((entry, index) => (
        entry.categoryId !== expectedCatalog[index][0]
        || entry.subcategory !== expectedCatalog[index][1]
      ))) {
    fail('P0B future pilot catalog is not the exact approved recommendation.');
  }
  exactArray(pilot.enabledProductScope,
    ['v52-single-item-only', 'g2-navigation-cart-and-gemerkt-non-reserving'],
    'recommendedFuturePilot.enabledProductScope');
  exactArray(pilot.disabledProductScope, [
    'g3-booking-groups',
    'g4-planner-inventory',
    'g5-supply-enrichment',
    'g5-listing-sets',
    'sit-business',
    'multi-provider-projects',
    'external-ai',
    'public-registration',
    'real-money',
  ], 'recommendedFuturePilot.disabledProductScope');

  const expectedTokens = [
    'P0B_NEXT_LEGAL_V52_REVIEW_ONLY',
    'P0B_NEXT_OPS_ROLES_BACKUP_ABSENCE_ONLY',
    'P0B_NEXT_SIGNED_DEVICE_EVIDENCE_ONLY',
    'P0B_NEXT_PSP_SANDBOX_E2E_ONLY',
    'P0B_NEXT_INVITED_SYNTHETIC_PILOT_SPIEGELBERG_CAT8_30',
  ];
  if (!Array.isArray(readiness.recommendedAuthorizationTokens)
      || readiness.recommendedAuthorizationTokens.length !== expectedTokens.length) {
    fail('P0B authorization-token sequence is incomplete.');
  }
  for (const [index, token] of readiness.recommendedAuthorizationTokens.entries()) {
    if (token?.order !== index + 1 || token.token !== expectedTokens[index]
        || token.autoExecute !== false
        || typeof token.purpose !== 'string' || token.purpose.trim() === '') {
      fail(`P0B authorization token is unsafe or invalid: ${expectedTokens[index]}`);
    }
  }

  const finalGate = object(readiness.finalGate, 'finalGate');
  if (finalGate.goNow !== false
      || finalGate.recommendedNextState !== 'hold-for-walid-decision'
      || finalGate.autoContinue !== false || finalGate.runwayEnded !== true) {
    fail('P0B must end the runway with NO-GO and no auto-continuation.');
  }
  for (const field of [
    'productionChanged',
    'paymentChanged',
    'providerChanged',
    'storeChanged',
    'cloudChanged',
    'publicActivationChanged',
  ]) {
    if (finalGate[field] !== false) fail(`P0B close boundary must remain false: ${field}`);
  }

  const legalManifest = JSON.parse(source(root, 'store/legal-readiness.json', sourceOverrides));
  if (legalManifest.state !== 'draft' || legalManifest.approvalAllowed !== false
      || legalManifest.interimPilotRules?.version !== 'V5.1-2026-08-16'
      || legalManifest.requiredApprovals?.legalReview?.status !== 'open') {
    fail('P0B source legal manifest no longer matches the recorded hard gate.');
  }
  for (const manifestPath of [
    'store/privacy-disclosures.json',
    'store/retention-deletion-readiness.json',
  ]) {
    const manifest = JSON.parse(source(root, manifestPath, sourceOverrides));
    if (manifest.state !== 'draft' || manifest.approvalAllowed !== false) {
      fail(`P0B source manifest no longer matches the recorded draft gate: ${manifestPath}`);
    }
  }

  const founder = JSON.parse(
    source(root, 'docs/operations/founder-independence-guardrails.json', sourceOverrides),
  );
  if (founder.roleModel?.functionalRoles?.length !== 6
      || founder.roleModel.functionalRoles.some((role) => (
        role.currentAssignee !== null || role.delegateAssignee !== null
        || role.assignmentState !== 'open'
      ))
      || founder.roleModel.minimumBusFactor !== 2
      || founder.externalGates?.absenceTests !== 'not-started') {
    fail('P0B founder-independence source no longer matches the blocked operations gate.');
  }
  const delegation = JSON.parse(
    source(root, 'docs/operations/fi1-operational-delegation.json', sourceOverrides),
  );
  if (delegation.processes?.length !== 4
      || delegation.processes.some((process) => process.readiness !== 'hold'
        || process.assignmentEvidenceAvailable !== false
        || process.absenceTestPassed !== false)) {
    fail('P0B FI1 source no longer matches the blocked operations gate.');
  }

  const p0a = JSON.parse(
    source(root, 'docs/evidence/p0a/closed-pilot-readiness-matrix.json', sourceOverrides),
  );
  if (p0a.statusCounts?.passed !== 13 || p0a.statusCounts?.blocked !== 1
      || p0a.matrix?.find((cell) => cell.id === 'pixel_current_source')?.status !== 'blocked') {
    fail('P0B P0A carry-forward evidence is invalid.');
  }

  const productionCompose = source(root, 'backend/compose.prod.yml', sourceOverrides);
  const stagingCompose = source(root, 'backend/compose.staging.yml', sourceOverrides);
  for (const flag of [
    'BOOKING_GROUPS_ENABLED',
    'PLANNER_CORE_ENABLED',
    'PLANNER_INVENTORY_ENABLED',
    'LISTING_SUPPLY_ENRICHMENT_ENABLED',
    'LISTING_SETS_ENABLED',
  ]) {
    requireIncludes(productionCompose, `${flag}: \${${flag}:-false}`, 'production compose');
    requireIncludes(stagingCompose, `${flag}: \${${flag}:-false}`, 'staging compose');
  }
  requireIncludes(productionCompose,
    'PRIVATE_PILOT_ALLOWED_REGIONS: ${PRIVATE_PILOT_ALLOWED_REGIONS:-}',
    'production compose');
  requireIncludes(stagingCompose,
    'PRIVATE_PILOT_ALLOWED_REGIONS: ${PRIVATE_PILOT_ALLOWED_REGIONS:-}',
    'staging compose');
  requireIncludes(productionCompose,
    'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-disabled}', 'production compose');
  requireIncludes(stagingCompose,
    'PAYMENT_TRANSPORT: ${PAYMENT_TRANSPORT:-memory}', 'staging compose');
  requireIncludes(productionCompose,
    'STRIPE_LIVEMODE: ${STRIPE_LIVEMODE:-false}', 'production compose');
  requireIncludes(stagingCompose,
    'STRIPE_LIVEMODE: ${STRIPE_LIVEMODE:-false}', 'staging compose');

  const catalogSource = source(root, 'backend/src/private_pilot_domain.js', sourceOverrides);
  for (const subcategory of ['Elektrowerkzeuge', 'Bohrmaschinen', 'Schleifer']) {
    requireIncludes(catalogSource, `'${subcategory}'`, 'private-pilot allowlist');
  }
  const cockpitSource = source(root, 'backend/src/pilot_cockpit.js', sourceOverrides);
  for (const expected of [
    "category: 'cloud',",
    "state: 'unavailable',",
    'founderReplacementRates: Object.freeze([])',
    "profitability: normalizedComplete",
    "? 'undetermined'",
    "sourceRef: 'no-bounded-cloud-billing-source'",
  ]) requireIncludes(cockpitSource, expected, 'pilot cockpit');

  const regression = source(root, 'scripts/technical_regression_check.sh', sourceOverrides);
  requireIncludes(regression, 'node tool/validate_p0b_pilot_dossier.mjs',
    'technical regression');
  const workPackage = source(root, 'docs/current_work_package.md', sourceOverrides);
  requireIncludes(workPackage, 'P0B-READINESS is the end of the V2.4',
    'current work package');
  requireIncludes(workPackage, 'There is no', 'current work package');
  requireIncludes(workPackage, 'automatic continuation after it', 'current work package');

  return {
    decision: readiness.decision,
    features: readiness.featureMatrix.length,
    blockers: risks.filter((risk) => risk.class === 'blocker').length,
    residualRisks: risks.filter((risk) => risk.class === 'residual').length,
    authorizationTokens: readiness.recommendedAuthorizationTokens.length,
    realMoneyAllowed: false,
    autoContinue: false,
  };
}

function run() {
  const result = validateP0BPilotDossier();
  console.log(
    `P0B pilot dossier: PASS (decision=${result.decision}, features=${result.features}, `
      + `blockers=${result.blockers}, residualRisks=${result.residualRisks}, `
      + `tokens=${result.authorizationTokens}, realMoney=false, autoContinue=false)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error?.message ?? 'P0B validation failed.'}`);
    process.exitCode = 1;
  }
}
