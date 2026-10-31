import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL(
  '../../tool/upload_exact_crashlytics_mapping.init.gradle', import.meta.url,
), 'utf8');

test('uploads only caller-supplied exact Crashlytics mapping inputs', () => {
  for (const marker of [
    'SIT_EXACT_CRASHLYTICS_MAPPING_FILE',
    'SIT_EXACT_CRASHLYTICS_MAPPING_ID_FILE',
    "findByName('uploadCrashlyticsMappingFileRelease')",
    'task.mergedMappingFile.set(app.file(exactMapping))',
    'task.mappingFileIdFile.set(app.file(exactMappingId))',
    'task.setDependsOn([])',
  ]) assert.ok(source.includes(marker), `missing exact mapping guard: ${marker}`);
});

test('does not generate or discover a replacement mapping identity', () => {
  assert.equal(source.includes('injectCrashlyticsMappingFileIdRelease'), false);
  assert.equal(source.includes('minifyReleaseWithR8'), false);
  assert.equal(source.includes('UUID'), false);
});
