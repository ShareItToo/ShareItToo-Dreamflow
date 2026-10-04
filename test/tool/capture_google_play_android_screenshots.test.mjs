import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL(
  '../../tool/capture_google_play_android_screenshots.mjs', import.meta.url,
), 'utf8');

test('fails closed unless the installed APK is the exact archived release candidate', () => {
  for (const marker of [
    'apkSha256 !== archive.apkSha256',
    'apkSha256 !== candidate.android.apkSha256',
    'installed.versionName !== candidate.versionName',
    'installed.buildNumber !== candidate.buildNumber',
  ]) assert.ok(source.includes(marker), `missing exact-candidate guard: ${marker}`);
});

test('accepts Play splits only with one base package and the Play installer', () => {
  for (const marker of [
    "value.endsWith('/base.apk')",
    '/\\/split_[^/]+\\.apk$/u',
    'basePackages.length !== 1',
    "installer=com\\.android\\.vending",
    "delivery: 'google-play-split'",
  ]) assert.ok(source.includes(marker), `missing Play split guard: ${marker}`);
});

test('never enters the Android lock code', () => {
  assert.ok(source.includes('Unlock it manually; this tool never enters a passcode.'));
  assert.equal(source.includes('KEYCODE_0'), false);
  assert.equal(source.includes('input text'), false);
});

test('uses the reviewed Pixel crop and Play phone dimensions', () => {
  for (const marker of [
    'metadata.width !== 1440 || metadata.height !== 3120',
    '.extract({ left: 0, top: 144, width: 1440, height: 2560 })',
    ".resize(1080, 1920, { fit: 'fill' })",
    '.removeAlpha()',
    'value.includes(screenshotListingTitle)',
    'const screenshotListingTitle = storeScreenshotListings[0].title',
  ]) assert.ok(source.includes(marker), `missing screenshot guard: ${marker}`);
});

test('keeps capture private and makes no Play or production change', () => {
  for (const marker of [
    'privateCaptureOnly: true',
    'repositoryScreenshotsChanged: false',
    'screenshotUploaded: false',
    'playConsoleChanged: false',
    'productionChanged: false',
  ]) assert.ok(source.includes(marker), `missing boundary: ${marker}`);
});
