import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const evidence = JSON.parse(await readFile(
  new URL(
    '../../docs/evidence/b11/android-crash-release-mapping-2026081509.json',
    import.meta.url,
  ),
  'utf8',
));

test('records the exact candidate release monitor without closing the event gate', () => {
  assert.equal(evidence.candidate.versionName, '1.0.0');
  assert.equal(evidence.candidate.buildNumber, '2026081509');
  assert.equal(
    evidence.releaseMonitorObservation.observedRelease,
    '1.0.0 (2026081509)',
  );
  assert.equal(evidence.releaseMonitorObservation.source, 'firebase-console-read-only');
  assert.equal(evidence.releaseMonitorObservation.displayedState, 'operational');
  assert.equal(evidence.releaseMonitorObservation.crashFreeUsersPercent, 100);
  assert.equal(evidence.releaseMonitorObservation.crashFreeSessionsPercent, 100);
  assert.equal(evidence.releaseMonitorObservation.newIssuesDisplayed, false);
  assert.equal(evidence.releaseMonitorObservation.usedAsControlledEventProof, false);
  assert.equal(evidence.releaseMonitorObservation.settingsChanged, false);
  assert.equal(evidence.releaseMonitorObservation.eventGenerated, false);
  assert.equal(evidence.verifications.controlledSanitizedCrashEvent, 'pending');
  assert.equal(evidence.boundaries.controlledStagingEventGenerated, false);
});
