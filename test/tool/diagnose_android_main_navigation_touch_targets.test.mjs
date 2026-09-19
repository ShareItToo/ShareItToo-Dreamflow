import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  androidMainNavigationLabels,
  evaluateAndroidMainNavigationTouchTargets,
  parseAndroidEffectiveDisplayMetrics,
} from '../../tool/diagnose_android_main_navigation_touch_targets.mjs';

function hierarchy({ width = 144, step = 160, className = 'android.widget.Button' } = {}) {
  return `<hierarchy>${androidMainNavigationLabels.map((label, index) => {
    const x1 = index * step;
    return `<node text="" content-desc="${label}" class="${className}" clickable="true" enabled="true" bounds="[${x1},1800][${x1 + width},1950]" />`;
  }).join('')}</hierarchy>`;
}

test('uses Android override display metrics when present', () => {
  assert.deepEqual(
    parseAndroidEffectiveDisplayMetrics(
      'Physical size: 1440x3120\nOverride size: 1080x2340',
      'Physical density: 560\nOverride density: 480',
    ),
    { widthPixels: 1080, heightPixels: 2340, densityDpi: 480 },
  );
  assert.throws(
    () => parseAndroidEffectiveDisplayMetrics('Physical size: bad', 'Physical density: 560'),
    /invalid effective display metrics/,
  );
});

test('accepts exactly five unique non-overlapping 48dp Android Buttons', () => {
  const result = evaluateAndroidMainNavigationTouchTargets({
    hierarchy: hierarchy(),
    metrics: { widthPixels: 1000, heightPixels: 2000, densityDpi: 480 },
  });
  assert.deepEqual(result, {
    targetCount: 5,
    minimumWidthDp: 48,
    minimumHeightDp: 50,
    allTargetsAtLeast48Dp: true,
    allTargetsWithinDisplay: true,
    allTargetsPairwiseNonOverlapping: true,
    allTargetsEnabledClickableAndroidButtons: true,
  });
});

test('rejects a target that is even one physical pixel below 48dp', () => {
  assert.throws(
    () => evaluateAndroidMainNavigationTouchTargets({
      hierarchy: hierarchy({ width: 143 }),
      metrics: { widthPixels: 1000, heightPixels: 2000, densityDpi: 480 },
    }),
    /smaller than 48dp/,
  );
});

test('rejects overlapping navigation targets', () => {
  assert.throws(
    () => evaluateAndroidMainNavigationTouchTargets({
      hierarchy: hierarchy({ step: 120 }),
      metrics: { widthPixels: 1000, heightPixels: 2000, densityDpi: 480 },
    }),
    /overlap/,
  );
});

test('rejects non-button accessibility nodes', () => {
  assert.throws(
    () => evaluateAndroidMainNavigationTouchTargets({
      hierarchy: hierarchy({ className: 'android.view.View' }),
      metrics: { widthPixels: 1000, heightPixels: 2000, densityDpi: 480 },
    }),
    /exactly one enabled clickable Android Button/,
  );
});

test('diagnostic source retains no raw hierarchy and records no manual claims', async () => {
  const source = await readFile(
    new URL('../../tool/diagnose_android_main_navigation_touch_targets.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /rawHierarchyRetained: false/);
  assert.match(source, /manualVisualReviewPassed: false/);
  assert.match(source, /manualTalkBackTraversalPassed: false/);
  assert.match(source, /talkBackSettingModified: false/);
  assert.doesNotMatch(source, /hierarchy:\s*hierarchy/u);
});
