#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = resolve(repositoryRoot, 'docs/evidence/release-readiness/wp105-current-candidate-oneplus-installation-20260910.json');

function fail(message) { throw new Error(message); }
function same(actual, expected, label) { if (actual !== expected) fail(`${label} is not exact.`); }

export function validateWp105CurrentCandidateOnePlusInstallation(evidence) {
  same(evidence?.schemaVersion, 1, 'schema version');
  same(evidence?.workPackage, 'WP105_CURRENT_CANDIDATE_ONEPLUS_INSTALLATION', 'work package');
  same(evidence?.status, 'passed-exact-oneplus-installation-and-launch', 'status');
  same(evidence?.source?.evidenceBaseHead, 'f193a41f3904f96cfc0bcffd6d0a710f7a307c11', 'evidence base');
  same(evidence?.source?.candidateArtifactSourceHead, 'fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5', 'candidate source');
  same(evidence?.source?.mobileRuntimeDriftAfterCandidate, false, 'mobile runtime drift');
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  same(evidence?.candidate?.versionCode, '2026091002', 'candidate version');
  same(evidence?.candidate?.apkSha256, 'd0ac7a80232536a4c2f5e1d659b8b9ba4f973581f816142dc6419931742c3637', 'candidate hash');
  same(evidence?.candidate?.signingCertificateSha256, '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4', 'candidate certificate');
  same(evidence?.candidate?.googlePlaySplitDelivery, false, 'Play delivery boundary');
  same(evidence?.onePlus?.model, 'CPH2581', 'device model');
  same(evidence?.onePlus?.adbAuthorized, true, 'ADB authorization');
  same(evidence?.onePlus?.authorizedDeviceCount, 1, 'authorized device count');
  same(evidence?.onePlus?.previousInstallation?.versionCode, '2026090711', 'previous version');
  same(evidence?.onePlus?.previousInstallation?.installer, 'google-play', 'previous installer');
  same(evidence?.onePlus?.previousInstallation?.signatureMismatchWithCandidate, true, 'signature mismatch');
  same(evidence?.onePlus?.replacement?.uninstalledApplicationIdOnly, true, 'scoped uninstall');
  same(evidence?.onePlus?.replacement?.localShareItTooDataReset, true, 'local data reset truth');
  same(evidence?.onePlus?.replacement?.otherPackagesOrDeviceDataChanged, false, 'other device data boundary');
  same(evidence?.onePlus?.replacement?.serverAccountOrContentChanged, false, 'server data boundary');
  same(evidence?.onePlus?.installed?.versionCode, '2026091002', 'installed version');
  same(evidence?.onePlus?.installed?.candidateHashVerifiedBeforeInstall, true, 'preinstall hash');
  same(evidence?.onePlus?.installed?.candidateSignatureVerifiedBeforeInstall, true, 'preinstall signature');
  same(evidence?.onePlus?.installed?.installedIdentityVerifiedAfterInstall, true, 'installed identity');
  same(evidence?.onePlus?.installed?.launchSmoke, 'passed', 'launch smoke');
  same(evidence?.onePlus?.installed?.crashObserved, false, 'crash boundary');
  same(evidence?.transfer?.temporaryServerStopped, true, 'temporary server');
  same(evidence?.transfer?.temporarySourceCopyDeleted, true, 'source transfer copy');
  same(evidence?.transfer?.temporaryMacBookCopyDeleted, true, 'MacBook transfer copy');
  same(evidence?.github?.regression?.runId, 34522790529, 'GitHub Regression');
  same(evidence?.github?.regression?.conclusion, 'success', 'GitHub Regression conclusion');
  same(evidence?.github?.codeql?.branchRefreshRunId, 34525457049, 'CodeQL branch refresh');
  same(evidence?.github?.codeql?.conclusion, 'success', 'CodeQL conclusion');
  same(evidence?.github?.codeScanning?.branchOpenAlerts, 0, 'branch alerts');
  same(evidence?.github?.codeScanning?.prMergeOpenAlerts, 0, 'PR-merge alerts');
  same(evidence?.github?.pullRequest?.draft, true, 'PR draft state');
  same(evidence?.github?.pullRequest?.merged, false, 'PR merge state');
  same(evidence?.remaining?.onePlusExactCandidateInstallAndLaunch, 'passed', 'OnePlus install truth');
  same(evidence?.remaining?.onePlusAuthenticatedProductJourney, 'not-run', 'OnePlus journey truth');
  same(evidence?.remaining?.twoPhysicalDeviceCrossAccountJourney, 'not-run', 'cross-device truth');
  same(evidence?.remaining?.googlePlaySplitDeliveryForThisCandidate, 'not-run', 'Play truth');
  for (const [key, expected] of Object.entries({
    productionChanged: false,
    googlePlayChanged: false,
    testerListChanged: false,
    publicRegistrationChanged: false,
    firebaseConsoleChanged: false,
    paymentProviderChanged: false,
    realMoneyUsed: false,
    listingAiExternalCallMade: false,
    pullRequestMerged: false,
    accountActionPerformed: false,
    containsSecrets: false,
    containsAccountIdentity: false,
    containsTokens: false,
    containsRawDeviceIdentifiers: false,
    containsPrivateFilesystemPaths: false
  })) same(evidence?.boundaries?.[key], expected, `boundary ${key}`);
  return Object.freeze({
    status: 'passed-wp105-current-candidate-oneplus-installation-evidence',
    evidenceBaseHead: evidence.source.evidenceBaseHead,
    versionCode: evidence.candidate.versionCode,
    containsPrivateState: false
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    process.stdout.write(`${JSON.stringify(validateWp105CurrentCandidateOnePlusInstallation(evidence))}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP105 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
