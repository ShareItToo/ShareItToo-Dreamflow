import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import { ImageProcessingError, sanitizeImage } from '../src/media_pipeline.js';

test('uploaded images are decoded, metadata-stripped, resized, hashed and thumbnailed', async () => {
  const source = await sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 20, g: 100, b: 200 },
    },
  }).jpeg().toBuffer();
  const result = await sanitizeImage(source, { purpose: 'listing_image' });
  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.extension, 'webp');
  assert.equal(result.width, 1600);
  assert.equal(result.height, 1200);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  const fullMetadata = await sharp(result.full).metadata();
  const thumbnailMetadata = await sharp(result.thumbnail).metadata();
  assert.equal(fullMetadata.format, 'webp');
  assert.equal(thumbnailMetadata.width, 480);
  assert.equal(thumbnailMetadata.height, 480);
});

test('listing images below the quality floor are rejected', async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).png().toBuffer();
  await assert.rejects(
    sanitizeImage(source, { purpose: 'listing_image' }),
    (error) => error instanceof ImageProcessingError && error.code === 'image_dimensions_too_small',
  );
});
