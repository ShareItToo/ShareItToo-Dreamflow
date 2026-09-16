import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const gradle = read('android/app/build.gradle');
const activity = read('android/app/src/main/kotlin/com/shareittoo/app/MainActivity.kt');
const analyzer = read(
  'android/app/src/main/kotlin/com/shareittoo/app/OnDeviceListingAnalyzer.kt',
);

test('Android Listing-AI uses only exact bundled ML Kit dependencies', () => {
  assert.match(gradle, /com\.google\.mlkit:image-labeling:17\.0\.9/u);
  assert.match(gradle, /com\.google\.mlkit:text-recognition:16\.0\.1/u);
  assert.doesNotMatch(gradle, /play-services-mlkit-(?:image-labeling|text-recognition)/u);
});

test('native analyzer accepts only bounded app-owned image files', () => {
  for (const marker of [
    'maximumImageCount = 4',
    'maximumImageBytes = 16L * 1024L * 1024L',
    'maximumLabelCount = 20',
    'maximumOcrLength = 1_000',
    'maximumAnalysisSeconds = 30L',
    'context.cacheDir.canonicalFile',
    'context.filesDir.canonicalFile',
    'context.getExternalFilesDirs(null)',
    'file.isFile && file.length() in 1..maximumImageBytes',
  ]) assert.ok(analyzer.includes(marker), marker);
  assert.doesNotMatch(analyzer, /Log\.|println\(|printStackTrace/u);
});

test('native bridge hides failure details and drops late callbacks after engine cleanup', () => {
  assert.match(activity, /onDeviceListingEngineActive = true/u);
  assert.match(activity, /if \(!onDeviceListingEngineActive\) return@runOnUiThread/u);
  assert.match(
    activity,
    /override fun cleanUpFlutterEngine[\s\S]*onDeviceListingEngineActive = false[\s\S]*setMethodCallHandler\(null\)[\s\S]*onDeviceListingAnalyzer\.close\(\)/u,
  );
  assert.match(activity, /Die lokale Bildanalyse konnte nicht abgeschlossen werden\./u);
  assert.doesNotMatch(activity, /it\.message|stackTrace|printStackTrace/u);
});
