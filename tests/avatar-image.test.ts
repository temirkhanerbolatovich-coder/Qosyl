import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
import { sanitizeAvatar } from '../src/server/profile/avatar-image';
import { MAX_AVATAR_BYTES } from '../src/lib/avatar';

it('re-encodes pixels, strips metadata and appended content, and bounds dimensions', async () => {
  const original = await sharp({
    create: { width: 1000, height: 700, channels: 3, background: 'red' },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: 'PRIVATE ARTIST' } })
    .toBuffer();
  expect((await sharp(original).metadata()).exif).toBeDefined();
  const output = await sanitizeAvatar(
    Buffer.concat([original, Buffer.from('<script>private-tail</script>')]),
    'image/jpeg',
  );
  const metadata = await sharp(output).metadata();
  expect(metadata.format).toBe('jpeg');
  expect(metadata.width).toBe(512);
  expect(metadata.height).toBeLessThanOrEqual(512);
  expect(metadata.exif).toBeUndefined();
  expect(metadata.icc).toBeUndefined();
  expect(metadata.xmp).toBeUndefined();
  expect(output.includes(Buffer.from('PRIVATE ARTIST'))).toBe(false);
  expect(output.includes(Buffer.from('private-tail'))).toBe(false);
});
it('converts PNG transparency into a static JPEG', async () => {
  const source = await sharp({
    create: { width: 20, height: 30, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const metadata = await sharp(await sanitizeAvatar(source, 'image/png')).metadata();
  expect(metadata).toMatchObject({ format: 'jpeg', width: 20, height: 30, hasAlpha: false });
});
it('rejects empty, oversized, non-image, wrong MIME, and truncated inputs', async () => {
  const png = await sharp({ create: { width: 30, height: 30, channels: 3, background: 'blue' } })
    .png()
    .toBuffer();
  for (const [bytes, mime] of [
    [Buffer.alloc(0), 'image/png'],
    [Buffer.alloc(MAX_AVATAR_BYTES + 1), 'image/png'],
    [Buffer.from('<svg/>'), 'image/png'],
    [png, 'image/jpeg'],
    [png, 'image/svg+xml'],
    [png.subarray(0, 40), 'image/png'],
  ] as const) {
    await expect(sanitizeAvatar(bytes, mime)).rejects.toThrow();
  }
});
it('rejects compressed images exceeding the pixel limit', async () => {
  const large = await sharp({
    create: { width: 4001, height: 4000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  expect(large.length).toBeLessThan(MAX_AVATAR_BYTES);
  await expect(sanitizeAvatar(large, 'image/png')).rejects.toThrow();
});

it('rejects APNG control chunks even when the decoder would read only the first frame', async () => {
  const png = await sharp({ create: { width: 5, height: 5, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8, 0);
  animation.write('acTL', 4);
  await expect(
    sanitizeAvatar(Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]), 'image/png'),
  ).rejects.toThrow('Анимация');
});
