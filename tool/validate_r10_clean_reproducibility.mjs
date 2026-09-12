#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidToolchain } from './validate_android_toolchain.mjs';

import {
  r10ExpectedPermissions,
  validateR10GeneratedFootprint,
} from './run_r10_clean_reproducibility.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultEvidencePath = path.join(
  repositoryRoot,
  'docs/evidence/48h-remote/r10-clean-reproducibility-20260824.json',
);
const technicalDebtPath = path.join(
  repositoryRoot,
  'docs/operations/48H_R10_TECHNICAL_DEBT_2026-08-24.md',
);
const implementationHead = '322e97ecc0c20c7f765054523dbcf1ddf45d0e9a';
const shaPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireExact(actual, expected, message) {
  if (!exact(actual, expected)) fail(message);
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value;
}

export function validateR10TechnicalDebtDocument(value) {
  if (!value.includes('Status: **TD-R10-001 AND TD-R10-002 CLOSED — EXACT CI VERIFIED**')
      || !value.includes('deliberately separate from the immutable 21-item PF18 snapshot')
      || !value.includes('No stale local properties, undocumented cache, manual cleanup, retry, reduced suite or false byte-identity claim may replace them.')
      || !value.includes('no race suppression, CodeQL dismissal, substring allowlist or weakened negative OpenAI-origin check may replace them')
      || !value.includes('Regression `32767155545`')
      || !value.includes('Advanced Security check `97559603226`')
      || (value.match(/^\| `TD-R10-\d{3}` \|/gmu) ?? []).length !== 2) {
    fail('R10 technical-debt exit contract is invalid or has drifted.');
  }
}

function validateSourceComparison(value, { executionOnly = false } = {}) {
  const expected = {
    dependencies: {
      count: 7,
      sha256: '1dd062cf4c609396138d0706388c4c305ff0d5ed418a6d106cad26c05a2a5288',
    },
    migrations: {
      count: 112,
      sha256: '129ddfb8ac3b9d1b55c4a6f24a0c7f647ec6cdffebf3118f293a27653bed9c00',
    },
    assets: {
      count: 84,
      sha256: 'f191cecc5902ee87d209a48a194273a3cd88ffa63aedfc6eaa40cb20ac3fd466',
    },
    fonts: {
      count: 3,
      sha256: '9446f0ff1abb65447f3b432feabfe67806bea222fe08aec22d8cbb50aa81b786',
    },
  };
  requireExact(Object.keys(value ?? {}), Object.keys(expected), 'R10 source comparison categories changed.');
  for (const [category, identity] of Object.entries(expected)) {
    if (executionOnly) {
      const comparison = value[category];
      const before = comparison?.before;
      if (!Number.isSafeInteger(before?.count) || before.count < 0
          || !shaPattern.test(before?.sha256 ?? '')
          || comparison?.exactMatch !== true) {
        fail(`R10 ${category} inventory is not exact.`);
      }
      requireExact(comparison.after, before, `R10 ${category} inventory is not exact.`);
      continue;
    }
    requireExact(value[category], {
      before: identity,
      after: identity,
      exactMatch: true,
    }, `R10 ${category} inventory is not exact.`);
  }
}

function validateCommands(value) {
  const expected = [
    'backendLockedRestore',
    'flutterLockedRestore',
    'backendSuite',
    'backendSyntax',
    'dependencyAudit',
    'secretScan',
    'postgresRunner',
    'fullTechnicalRegression',
    'secondAndroidBuild',
  ];
  requireExact(Object.keys(value ?? {}), expected, 'R10 command inventory changed.');
  for (const name of expected) {
    const command = value[name];
    if (command?.status !== 'passed'
        || !Number.isSafeInteger(command?.durationSeconds)
        || command.durationSeconds < 0
        || command.durationSeconds > 3_600) {
      fail(`R10 command result is invalid: ${name}.`);
    }
  }
}

function validateFootprint(value) {
  requireExact(value?.before, {
    pathsKiB: {
      '.dart_tool': 0,
      build: 0,
      'android/.gradle': 0,
      'backend/node_modules': 0,
    },
    projectGeneratedKiB: 0,
    isolatedPackageCachesKiB: 0,
    totalKiB: 0,
  }, 'R10 clean checkout did not start with zero generated footprint.');
  const after = value?.after;
  const paths = after?.pathsKiB;
  const expectedPaths = ['.dart_tool', 'build', 'android/.gradle', 'backend/node_modules'];
  requireExact(Object.keys(paths ?? {}), expectedPaths, 'R10 generated path inventory changed.');
  for (const amount of Object.values(paths)) {
    if (!Number.isSafeInteger(amount) || amount < 0) fail('R10 generated path size is invalid.');
  }
  if (Object.values(paths).reduce((sum, amount) => sum + amount, 0)
      !== after.projectGeneratedKiB) {
    fail('R10 project generated footprint total is invalid.');
  }
  const bounds = validateR10GeneratedFootprint(after);
  requireExact({
    maximumProjectGeneratedKiB: value.maximumProjectGeneratedKiB,
    maximumIsolatedPackageCachesKiB: value.maximumIsolatedPackageCachesKiB,
    withinBounds: value.withinBounds,
  }, bounds, 'R10 generated footprint bounds changed.');
}

function validateArtifactIdentity(value) {
  if (!Number.isSafeInteger(value?.bytes) || value.bytes <= 0
      || !shaPattern.test(value?.sha256 ?? '')
      || !shaPattern.test(value?.payloadInventorySha256 ?? '')
      || !Number.isSafeInteger(value?.entries) || value.entries <= 0) {
    fail('R10 APK artifact identity is invalid.');
  }
}

function validateReproduction(android) {
  const value = android.reproduction;
  const classifications = new Set([
    'byte-identical',
    'zip-container-or-signing-metadata-only',
    'd8-synthetic-checksum-metadata-only',
  ]);
  if (!classifications.has(value?.classification)
      || value?.knownEquivalent !== true
      || !Array.isArray(value?.differingEntries)
      || !Array.isArray(value?.knownD8MetadataOnlyEntries)
      || !exact(value?.unexplainedDifferingEntries, [])) {
    fail('R10 APK reproduction classification is invalid.');
  }
  if (value.classification === 'byte-identical') {
    if (!value.byteIdentical || !value.extractedEntriesIdentical
        || value.differingEntries.length !== 0
        || android.first.sha256 !== android.second.sha256
        || android.knownNondeterminism !== null) {
      fail('R10 byte-identical APK claim is invalid.');
    }
  } else if (value.classification === 'zip-container-or-signing-metadata-only') {
    if (value.byteIdentical || !value.extractedEntriesIdentical
        || value.differingEntries.length !== 0
        || android.first.sha256 === android.second.sha256
        || android.knownNondeterminism !== null) {
      fail('R10 ZIP metadata-only APK claim is invalid.');
    }
  } else {
    if (value.byteIdentical || value.extractedEntriesIdentical
        || value.differingEntries.length === 0
        || !exact(value.differingEntries, value.knownD8MetadataOnlyEntries)
        || value.differingEntries.some((entry) => !/^classes\d*\.dex$/u.test(entry))) {
      fail('R10 D8 metadata-only APK claim is invalid.');
    }
    requireExact(android.knownNondeterminism, {
      mechanism: 'D8 synthetic-class checksum metadata',
      normalizedBytes: [
        'DEX header checksum and SHA-1 signature bytes 8-31',
        'nine-hex-digit values in the embedded D8 synthetic-class checksum map',
      ],
      affectedEntries: value.knownD8MetadataOnlyEntries,
      rawBinaryIdentityClaimed: false,
    }, 'R10 known D8 nondeterminism description changed.');
  }
}

function currentRepositoryVersion() {
  const pubspec = readFileSync(path.join(repositoryRoot, 'pubspec.yaml'), 'utf8');
  const match = /^version:\s*([^+\s]+)\+(\d+)\s*$/mu.exec(pubspec);
  if (match === null) fail('R10 current repository version is invalid.');
  return { versionName: match[1], versionCode: match[2] };
}

function validateAndroid(value, { executionOnly = false } = {}) {
  if (value?.buildType !== 'debug' || value?.buildAttempts !== 2) {
    fail('R10 Android build scope changed.');
  }
  validateArtifactIdentity(value.first);
  validateArtifactIdentity(value.second);
  if (value.first.bytes !== value.second.bytes || value.first.entries !== value.second.entries) {
    fail('R10 equivalent APK shape changed.');
  }
  validateReproduction(value);
  const expectedVersion = executionOnly
    ? currentRepositoryVersion()
    : { versionName: '1.0.0', versionCode: '2026082302' };
  const expectedSdk = executionOnly
    ? { compileSdk: 36, targetSdk: 36 }
    : { compileSdk: 35, targetSdk: 35 };
  requireExact(value.identity, {
    applicationId: 'com.shareittoo.app',
    versionCode: expectedVersion.versionCode,
    versionName: expectedVersion.versionName,
    compileSdk: expectedSdk.compileSdk,
    minSdk: 24,
    targetSdk: expectedSdk.targetSdk,
    debuggable: true,
  }, 'R10 Android build identity changed.');
  requireExact(value.permissions, r10ExpectedPermissions, 'R10 Android permission surface changed.');
  requireExact(value.policies, {
    debugArtifact: true,
    backupDisabled: true,
    cleartextTrafficDisabled: true,
    legacyExternalStorageDisabled: true,
  }, 'R10 Android policy surface changed.');
  requireExact(value.runtimePayload, {
    format: 'debug-kernel-blob',
    entries: ['assets/flutter_assets/kernel_blob.bin'],
  }, 'R10 Flutter runtime payload changed.');
  requireExact(value.runtimeConfiguration, {
    backendEnabledInDebugByDefault: false,
    compiledDefaultBackendOriginPresent: true,
    externalAiNetworkAllowed: false,
    compiledOpenAiApiOriginPresent: false,
    realPaymentsEnabled: false,
    socialProvidersEnabledByDefault: { google: false, apple: false, facebook: false },
    firebaseSdkPresent: true,
    firebaseMessagingAutoInitDisabled: true,
    firebaseAnalyticsCollectionDisabled: true,
    firebaseCrashlyticsCollectionDisabled: true,
  }, 'R10 network or provider configuration changed.');
}

export function validateR10CleanReproducibility(value, { executionOnly = false } = {}) {
  validateR10TechnicalDebtDocument(readFileSync(technicalDebtPath, 'utf8'));
  const expectedStatus = executionOnly
    ? 'verified-local-clean-checkout-ci-pending'
    : 'verified-clean-checkout-regression-and-codeql-passed';
  const observedOnValid = executionOnly
    ? isIsoCalendarDate(value?.observedOn)
    : value?.observedOn === '2026-08-24';
  if (value?.schemaVersion !== 1
      || value?.kind !== 'sit-48h-r10-clean-reproducibility'
      || value?.status !== expectedStatus
      || !observedOnValid) {
    fail('R10 evidence identity or status is invalid.');
  }
  if (value.source?.branch !== 'codex/master-workflow-20260808'
      || !commitPattern.test(value.source?.implementationHead ?? '')
      || value.source.checkoutHead !== value.source.implementationHead
      || value.source.sourceTrackedTreeClean !== true
      || value.source.isolatedCheckoutInitiallyClean !== true
      || value.source.isolatedCheckoutFinallyClean !== true) {
    fail('R10 source identity or clean-checkout proof is invalid.');
  }
  if (!executionOnly && value.source.implementationHead !== implementationHead) {
    fail('R10 retained evidence is not bound to the implementation head.');
  }
  requireExact(value.boundaries, {
    localIsolatedCheckoutOnly: true,
    productionChanged: false,
    vpsChanged: false,
    cloudChanged: false,
    firebaseProjectChanged: false,
    storeChanged: false,
    paymentChanged: false,
    accountChanged: false,
    credentialsReadOrExtracted: false,
    privateInputsCopied: false,
    apiBillingUsed: false,
    pullRequestMerged: false,
  }, 'R10 live or credential boundary changed.');
  requireExact(value.cleanCheckout, {
    mechanism: 'local-git-clone-no-hardlinks-detached-head',
    dependencyCaches: 'fresh-bounded-temp-directories',
    undocumentedMachineCacheRequired: false,
    privateInputs: { checked: 6, present: 0 },
  }, 'R10 clean checkout contract changed.');
  if (value.toolchain?.flutter !== '3.41.7'
      || value.toolchain?.dart !== '3.11.5'
      || !/^v(?:2[2-9]|[3-9]\d)\.\d+\.\d+$/u.test(value.toolchain?.node ?? '')
      || value.toolchain?.pnpm !== '11.16.0'
      || value.toolchain?.javaMajor !== 17
      || value.toolchain?.gradle !== (executionOnly ? androidToolchain.gradle : '8.12')) {
    fail('R10 toolchain identity changed.');
  }
  validateSourceComparison(value.sourceComparison, { executionOnly });
  validateCommands(value.commands);
  validateFootprint(value.generatedFootprint);
  validateAndroid(value.android, { executionOnly });
  if (executionOnly) {
    requireExact(value.ciAndCodeql, {
      localCodeqlClaimed: false,
      exactGithubVerification: 'pending',
    }, 'R10 execution evidence must not claim GitHub or CodeQL verification.');
    if (value.githubVerification !== undefined) {
      fail('R10 execution evidence must not contain GitHub verification.');
    }
  } else {
    requireExact(value.ciAndCodeql, {
      localCodeqlClaimed: false,
      exactGithubVerification: 'passed',
    }, 'R10 exact GitHub or CodeQL verification changed.');
    requireExact(value.githubVerification, {
      headSha: '7d215e41e2c0f20f088152a19b4915b8bc2bdb45',
      pullRequest: {
        number: 7,
        draft: true,
        state: 'OPEN',
        merged: false,
      },
      regression: {
        runId: 32767155545,
        conclusion: 'success',
        jobs: {
          postgresRunnerProof: { jobId: 97559116901, conclusion: 'success' },
          backendRegression: { jobId: 97559117129, conclusion: 'success' },
          flutterRegression: {
            jobId: 97559117121,
            conclusion: 'success',
            parallelStressStep: 'skipped',
            signedCandidateStep: 'skipped',
          },
          r10CleanReproducibility: { jobId: 97559117227, conclusion: 'success' },
          publishApiImage: { jobId: 97561229688, conclusion: 'skipped' },
        },
      },
      codeqlWorkflow: {
        runId: 32767155548,
        jobId: 97559117104,
        conclusion: 'success',
      },
      advancedSecurity: {
        checkRunId: 97559603226,
        conclusion: 'success',
        title: 'No new alerts in code changed by this pull request',
        annotations: 0,
        openAlerts: 0,
        findingsDismissed: false,
      },
      gitGuardian: {
        state: 'failure',
        scope: 'documented-pre-existing-250-commit-pr-history',
        credentialDetailInspected: false,
      },
    }, 'R10 exact GitHub verification changed.');
  }
  requireExact(value.limitations, {
    debugArtifactOnly: true,
    signedInternalArtifactBuilt: false,
    binaryIdentityClaimedOnlyWhenRawShaMatches: value.android.reproduction.byteIdentical,
    knownMetadataClassificationRequiresExactNormalizedEntryMatch: true,
    retainedBuildArtifact: false,
  }, 'R10 limitations or binary identity claim changed.');
  requireExact(value.cleanup, {
    tempCheckoutRemoved: true,
    isolatedDependencyCachesRemoved: true,
    apkCopiesRemoved: true,
  }, 'R10 cleanup proof changed.');
  if (value.nextPackage !== 'R11') fail('R10 next package is invalid.');

  if (!executionOnly) {
    requireExact(value.toolchain, {
      flutter: '3.41.7',
      dart: '3.11.5',
      node: 'v22.23.2',
      pnpm: '11.16.0',
      javaMajor: 17,
      gradle: '8.12',
    }, 'R10 retained toolchain evidence changed.');
    requireExact(value.generatedFootprint.after, {
      pathsKiB: {
        '.dart_tool': 155768,
        build: 2989950,
        'android/.gradle': 8391,
        'backend/node_modules': 54354,
      },
      projectGeneratedKiB: 3208463,
      isolatedPackageCachesKiB: 6119769,
      totalKiB: 9328232,
    }, 'R10 retained footprint measurement changed.');
    requireExact({ first: value.android.first, second: value.android.second }, {
      first: {
        bytes: 230820487,
        sha256: '87eebd56283c0e255b31e30eaea87b2b4e9ebb73df42d180bd3236570c3121f2',
        payloadInventorySha256: '7f437d83562162b7011ecae9e88341e24b019aedb5a3aa3fb2b99f61ca76510a',
        entries: 795,
      },
      second: {
        bytes: 230820487,
        sha256: '97f28fc3d4ef8dafd9381e523b89775109d299c4041169c5cb29349873ec0338',
        payloadInventorySha256: '83003cd7a7f0f8b20ae4ef4882dcfe3feef3ac782d8472f35b9aba86070abd7a',
        entries: 795,
      },
    }, 'R10 retained APK identities changed.');
    requireExact(value.android.reproduction, {
      classification: 'd8-synthetic-checksum-metadata-only',
      byteIdentical: false,
      extractedEntriesIdentical: false,
      knownEquivalent: true,
      differingEntries: ['classes18.dex'],
      knownD8MetadataOnlyEntries: ['classes18.dex'],
      unexplainedDifferingEntries: [],
    }, 'R10 retained APK reproduction result changed.');
  }
  return Object.freeze({
    status: value.status,
    implementationHead: value.source.implementationHead,
    migrations: value.sourceComparison.migrations.before.count,
    assets: value.sourceComparison.assets.before.count,
    apkClassification: value.android.reproduction.classification,
    nextPackage: value.nextPackage,
  });
}

function parseArgs(argv) {
  let input = defaultEvidencePath;
  let executionOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execution-only') {
      executionOnly = true;
    } else if (arg === '--input' && argv[index + 1] !== undefined) {
      input = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      fail(`Unknown R10 validator argument: ${arg}`);
    }
  }
  return { input, executionOnly };
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(readFileSync(args.input, 'utf8'));
  const result = validateR10CleanReproducibility(evidence, {
    executionOnly: args.executionOnly,
  });
  process.stdout.write(
    `R10 clean reproducibility valid: migrations=${result.migrations}, `
      + `assets=${result.assets}, apk=${result.apkClassification}, next=${result.nextPackage}\n`,
  );
}
