import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classifyWp132ExactSearchFailure,
  exactMessageListingVisible,
  runCurrentCandidateReportBlockLifecycle,
} from '../../tool/diagnose_android_current_candidate_report_block.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091306',
  commit: 'a56570921ce47448b38324ee3208598a8f299ca7',
  android: {
    apkSha256: 'c921a34e446b4b06515b106a86ac5fa3f0df69f6a4b4c7c56fd12eb927fd183f',
  },
});

test('keeps the report action reachable from an exact search result', () => {
  const runner = readFileSync(
    'tool/diagnose_android_current_candidate_report_block.mjs',
    'utf8',
  );
  const options = readFileSync('lib/widgets/listing_options_dialog.dart', 'utf8');
  const searchResults = readFileSync('lib/screens/search_results_screen.dart', 'utf8');
  assert.match(options, /label: 'Melden',\s*onTap: reportListing/u);
  assert.match(
    searchResults,
    /class _SquareTitleOnlyCardState[\s\S]*?Future<void> _showOptions\(\) => showListingOptionsDialog\([\s\S]*?contextType: ListingOptionsContext\.explore[\s\S]*?final optionsLabel = 'Anzeigenoptionen: \$\{widget\.item\.title\}'/u,
  );
  assert.match(
    runner,
    /currentHeadAndroidNamedNodes\(value, 'Anzeigenoptionen'\)\.length >= 1/u,
  );
  assert.match(
    runner,
    /async function scrollToListingReportAction[\s\S]*?currentHeadAndroidNamedNodes\(hierarchy, 'Melden'\)\.length === 1[\s\S]*?'shell', 'input', 'swipe'/u,
  );
  assert.match(
    runner,
    /tapLabel\(commandRunner, adbPath, device, hierarchy, 'Melden'\);/u,
  );
  assert.match(
    runner,
    /currentHeadAndroidNamedNodes\((?:value|hierarchy), 'Mehr Optionen'\)\.length >= 1/u,
  );
  assert.match(
    runner,
    /value\.includes\('Profil konnte nicht geladen werden'\)[\s\S]*?tapLabel\(commandRunner, adbPath, device, hierarchy, 'Erneut laden'\)[\s\S]*?attempts: 48/u,
  );
  assert.equal(
    runner.match(/`Anzeigenoptionen: \$\{journal\.targetListing\.title\}`/gu)?.length,
    2,
  );
});

function operations(calls) {
  return {
    exercise: async () => { calls.push('exercise'); return true; },
    cleanup: async () => {
      calls.push('cleanup');
      return {
        status: 'cleanup-server-confirmed-recovery-required',
        exactListingsEnded: 3,
        exactBlockCount: 0,
        retainedModerationReportCount: 1,
        exactRoleSessionsRevoked: true,
      };
    },
    restoreOwner: async () => { calls.push('restore-owner'); return true; },
    markRestored: async () => { calls.push('mark-restored'); },
  };
}

test('recognizes the exact cancelled-booking chat semantics label', () => {
  const title = 'SIT Rollenprüfung n22-safe-run';
  assert.equal(exactMessageListingVisible(`<node content-desc="· ${title}"/>`, title), true);
  assert.equal(exactMessageListingVisible(`<node content-desc="${title}"/>`, title), true);
  assert.equal(exactMessageListingVisible('<node content-desc="Andere Anzeige"/>', title), false);
});

test('classifies exact-search failures without retaining private details', () => {
  assert.equal(
    classifyWp132ExactSearchFailure(
      new Error('The sanitized preserved exact search principal surface did not appear.'),
    ),
    'preserved-exact-search-principal',
  );
  assert.equal(
    classifyWp132ExactSearchFailure(
      new Error('The sanitized settled public catalog surface did not appear.'),
    ),
    'settled-public-catalog',
  );
  assert.equal(
    classifyWp132ExactSearchFailure(
      new Error('The exact filtered search result did not settle (header1-open0-favorite0-saved0-cards0-progress0-error0-empty1-savederror0).'),
    ),
    'exact-result-header1-open0-favorite0-saved0-cards0-progress0-error0-empty1-savederror0',
  );
  assert.equal(
    classifyWp132ExactSearchFailure(new Error('private account detail@example.test')),
    'session-or-navigation',
  );
});

test('closes exact-current report, block, unblock and reversible cleanup', async () => {
  const calls = [];
  const result = await runCurrentCandidateReportBlockLifecycle({
    candidate,
    deviceSummary: { model: 'Pixel 7 Pro', physical: true },
    operations: operations(calls),
    capturedAt: '2026-09-12T22:45:00.000Z',
  });
  assert.deepEqual(calls, ['exercise', 'cleanup', 'restore-owner', 'mark-restored']);
  assert.equal(result.status, 'passed-exact-current-pixel-report-block-restored');
  assert.equal(result.pixel.reportAcceptedExactlyOnce, true);
  assert.equal(result.pixel.bothSameOwnerListingsHidden, true);
  assert.equal(result.cleanup.moderationReportRetainedAsAudit, true);
  assert.equal(result.cleanup.recoveryRequired, false);
  assert.equal(result.boundaries.onePlusContacted, false);
  assert.equal(JSON.stringify(result).includes('example.test'), false);
});

test('still cleans up and restores the owner after a physical failure', async () => {
  const calls = [];
  const ops = operations(calls);
  ops.exercise = async () => {
    calls.push('exercise');
    throw new Error('The physical report did not settle.');
  };
  await assert.rejects(
    () => runCurrentCandidateReportBlockLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations: ops,
    }),
    /did not settle/u,
  );
  assert.deepEqual(calls, ['exercise', 'cleanup', 'restore-owner', 'mark-restored']);
});

test('fails closed for a predecessor candidate before any operation', async () => {
  const calls = [];
  await assert.rejects(
    () => runCurrentCandidateReportBlockLifecycle({
      candidate: { ...candidate, buildNumber: '2026091110' },
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations: operations(calls),
    }),
    /candidate binding/u,
  );
  assert.deepEqual(calls, []);
});

test('does not accept cleanup that drops the retained moderation audit', async () => {
  const calls = [];
  const ops = operations(calls);
  const baseCleanup = ops.cleanup;
  ops.cleanup = async () => ({
    ...(await baseCleanup()),
    retainedModerationReportCount: 0,
  });
  await assert.rejects(
    () => runCurrentCandidateReportBlockLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations: ops,
    }),
    /cleanup is incomplete/u,
  );
});
