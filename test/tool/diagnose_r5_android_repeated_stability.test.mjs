import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildR5AndroidRepeatedStabilityEvidence,
  parseR5AndroidStartMetrics,
  parseR5AndroidTotalPssKib,
  r5DeviceResultClassification,
  runR5AndroidCycles,
} from '../../tool/diagnose_r5_android_repeated_stability.mjs';

test('parses Android start and memory observations without accepting partial output', () => {
  assert.deepEqual(parseR5AndroidStartMetrics(`
Status: ok
Activity: com.shareittoo.app/.MainActivity
TotalTime: 420
WaitTime: 431
Complete
`), { totalTimeMs: 420, waitTimeMs: 431 });
  assert.equal(parseR5AndroidTotalPssKib('TOTAL PSS: 123456'), 123456);
  assert.equal(parseR5AndroidTotalPssKib('  TOTAL  234567  10  20'), 234567);
  assert.throws(
    () => parseR5AndroidStartMetrics('Status: timeout'),
    /activity-start metrics are invalid/u,
  );
  assert.throws(
    () => parseR5AndroidTotalPssKib('TOTAL PSS: 0'),
    /memory observation is unavailable/u,
  );
});

test('runs exactly 25 device cycles and records trends without certification', async () => {
  let calls = 0;
  const cycles = await runR5AndroidCycles({
    cycle: async (index) => {
      calls += 1;
      return {
        totalTimeMs: 400 + index,
        waitTimeMs: 410 + index,
        totalPssKib: 100_000 + (index * 10),
        mainNavigationRestored: true,
        fatalOrAnrEntries: 0,
        uncaughtFlutterErrors: 0,
        unexpectedNetworkTargetCount: 0,
      };
    },
  });
  assert.equal(calls, 25);
  assert.equal(cycles.completedCycles, 25);
  assert.deepEqual(cycles.start, {
    minimumMs: 400,
    maximumMs: 424,
    firstFiveMeanMs: 402,
    lastFiveMeanMs: 422,
    trendDeltaMs: 20,
  });
  assert.equal(cycles.memory.trendDeltaTotalPssKib, 200);
  assert.deepEqual(cycles.failures, {
    crashesOrAnr: 0,
    uncaughtFlutterErrors: 0,
    failedMainNavigationRestorations: 0,
    unexpectedNetworkTargetsInErrorLogs: 0,
  });
});

test('fails closed on the first crash, restoration or network anomaly', async () => {
  let calls = 0;
  await assert.rejects(
    runR5AndroidCycles({
      cycle: async (index) => {
        calls += 1;
        return {
          totalTimeMs: 400,
          waitTimeMs: 410,
          totalPssKib: 100_000,
          mainNavigationRestored: true,
          fatalOrAnrEntries: index === 2 ? 1 : 0,
          uncaughtFlutterErrors: 0,
          unexpectedNetworkTargetCount: 0,
        };
      },
    }),
    /cycle 3 failed closed/u,
  );
  assert.equal(calls, 3);
});

test('builds sanitized physical evidence only with exact app-data preservation', () => {
  const snapshot = {
    versionName: '1.0.0',
    buildNumber: '2026082405',
    firstInstallTime: '2026-08-23 12:00:00',
    ceDataInode: '12345',
  };
  const cycles = {
    completedCycles: 25,
    start: { minimumMs: 300, maximumMs: 500 },
    memory: { minimumTotalPssKib: 100_000, maximumTotalPssKib: 110_000 },
    failures: {
      crashesOrAnr: 0,
      uncaughtFlutterErrors: 0,
      failedMainNavigationRestorations: 0,
      unexpectedNetworkTargetsInErrorLogs: 0,
    },
  };
  const evidence = buildR5AndroidRepeatedStabilityEvidence({
    candidate: {
      commit: 'a'.repeat(40),
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber: '2026082405',
    },
    deviceSummary: {
      platform: 'android',
      physical: true,
      model: 'Pixel 7 Pro',
      containsRawDeviceIdentifier: false,
    },
    before: snapshot,
    after: { ...snapshot },
    cycles,
    capturedAt: '2026-08-24T15:00:00.000Z',
  });
  assert.equal(evidence.resultClassification, r5DeviceResultClassification);
  assert.equal(evidence.state.appDataIdentityPreserved, true);
  assert.equal(evidence.limitations.fullBlueOceanUiFlowRepeatedOnDevice, false);
  assert.equal(evidence.limitations.performanceCertificationClaimed, false);
  assert.equal(evidence.boundaries.rawDeviceIdentifierRecorded, false);

  assert.throws(
    () => buildR5AndroidRepeatedStabilityEvidence({
      candidate: {
        commit: 'a'.repeat(40),
        applicationId: 'com.shareittoo.app',
        versionName: '1.0.0',
        buildNumber: '2026082405',
      },
      deviceSummary: {
        physical: true,
        containsRawDeviceIdentifier: false,
      },
      before: snapshot,
      after: { ...snapshot, ceDataInode: 'changed' },
      cycles,
    }),
    /app-data preservation evidence is invalid/u,
  );
});
