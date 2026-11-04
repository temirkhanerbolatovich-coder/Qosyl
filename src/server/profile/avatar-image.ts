import 'server-only';
import sharp from 'sharp';
import { AppError, assert } from '@/lib/permissions';
import { MAX_AVATAR_BYTES, MAX_AVATAR_PIXELS, MAX_STORED_AVATAR_BYTES } from '@/lib/avatar';

/** Decode pixels and re-encode; never retain original bytes, EXIF, filenames or appended content. */
export async function sanitizeAvatar(bytes: Uint8Array, mediaType: string): Promise<Buffer> {
  assert(bytes.length > 0, 400, 'Выберите непустое изображение.');
  assert(bytes.length <= MAX_AVATAR_BYTES, 413, 'Аватар должен быть не больше 2 МиБ.');
  assert(['image/jpeg', 'image/png'].includes(mediaType), 415, 'Разрешены только JPEG и PNG.');
  const input = Buffer.from(bytes);
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  if (png) {
    // libvips may decode only the first APNG frame; reject the animation control chunk explicitly.
    for (let offset = 8; offset + 12 <= input.length;) {
      const length = input.readUInt32BE(offset);
      assert(
        input.toString('ascii', offset + 4, offset + 8) !== 'acTL',
        415,
        'Анимация не поддерживается.',
      );
      if (length > input.length - offset - 12) break;
      offset += length + 12;
    }
  }
  assert(
    (mediaType === 'image/png' && png) || (mediaType === 'image/jpeg' && jpeg),
    415,
    'Содержимое не соответствует типу изображения.',
  );
  const pipeline = sharp(input, {
    limitInputPixels: MAX_AVATAR_PIXELS,
    failOn: 'warning',
    animated: true,
  });
  try {
    const metadata = await pipeline.metadata();
    assert(
      ['png', 'jpeg'].includes(metadata.format ?? '') && (metadata.pages ?? 1) === 1,
      415,
      'Анимация и другие форматы не поддерживаются.',
    );
    assert(
      !!metadata.width &&
        !!metadata.height &&
        metadata.width * metadata.height <= MAX_AVATAR_PIXELS,
      413,
      'Изображение должно содержать не больше 16 мегапикселей.',
    );
    const output = await pipeline
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer();
    assert(
      output.length <= MAX_STORED_AVATAR_BYTES,
      413,
      'Не удалось уменьшить изображение. Выберите другое.',
    );
    return output;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      'Не удалось прочитать изображение. Выберите корректный JPEG или PNG до 16 мегапикселей.',
    );
  } finally {
    pipeline.destroy();
  }
}
