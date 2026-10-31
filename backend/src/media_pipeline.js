import crypto from 'node:crypto';

import sharp from 'sharp';

export class ImageProcessingError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export async function sanitizeImage(buffer, { purpose = 'listing_image' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageProcessingError('invalid_image');
  }
  const minimumWidth = purpose === 'listing_image' ? 320 : 32;
  const minimumHeight = purpose === 'listing_image' ? 240 : 32;
  try {
    const source = sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height
        || metadata.width < minimumWidth || metadata.height < minimumHeight) {
      throw new ImageProcessingError('image_dimensions_too_small');
    }
    if (metadata.width > 12_000 || metadata.height > 12_000 || (metadata.pages ?? 1) > 1) {
      throw new ImageProcessingError('unsupported_image_dimensions');
    }

    const full = await sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 480, height: 480, fit: 'cover', position: 'attention' })
      .webp({ quality: 78, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      full: full.data,
      thumbnail: thumbnail.data,
      mimeType: 'image/webp',
      extension: 'webp',
      width: full.info.width,
      height: full.info.height,
      sha256: crypto.createHash('sha256').update(full.data).digest('hex'),
    };
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw new ImageProcessingError('image_processing_failed');
  }
}
