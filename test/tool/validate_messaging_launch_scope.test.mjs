import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const threadScreen = readFileSync(resolve(root, 'lib/screens/message_thread_screen.dart'), 'utf8');
const backend = readFileSync(resolve(root, 'backend/src/app.js'), 'utf8');
const messageWorkflow = readFileSync(resolve(root, 'backend/src/message_workflow.js'), 'utf8');
const technicalRegression = readFileSync(
  resolve(root, 'scripts/technical_regression_check.sh'),
  'utf8',
);

test('launch chat keeps text, image and location flows', () => {
  assert.match(threadScreen, /Future<void> _sendText\(\)/);
  assert.match(threadScreen, /ImageSource\.camera/);
  assert.match(threadScreen, /ImageSource\.gallery/);
  assert.match(threadScreen, /_sendLocationShareData/);
  assert.match(threadScreen, /class _PrivateChatImage/);
  assert.match(threadScreen, /Geschütztes Chatfoto öffnen/);
  assert.match(backend, /'message_attachment'/);
  assert.match(messageWorkflow, /thumbnailStorageName: row\.thumbnail_storage_name/);
});

test('launch chat accepts only server-sanitized images and no free documents or videos', () => {
  assert.match(threadScreen, /allowedExtensions: const \['jpg', 'jpeg', 'png', 'webp'\]/);
  assert.doesNotMatch(threadScreen, /allowedExtensions:[^\n]*pdf/i);
  assert.doesNotMatch(threadScreen, /pickVideo|ImageSource\.video|video_attachment/);
  assert.match(backend, /new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
  assert.match(backend, /await sanitizeImage\(req\.file\.buffer, \{ purpose \}\)/);
  assert.doesNotMatch(backend, /application\/pdf|message_document|message_video/);
});

test('the technical regression gate permanently checks the messaging launch scope', () => {
  assert.match(
    technicalRegression,
    /node --test test\/tool\/validate_messaging_launch_scope\.test\.mjs/,
  );
});
