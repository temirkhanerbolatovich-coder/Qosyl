import { assert } from './permissions';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_USER_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_PROJECT_ATTACHMENTS = 20;
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.txt';
export const attachmentMediaTypes = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const;

/** Private download endpoints belong in attachmentIds, never in public links or unbound delivery links. */
export function isPrivateAttachmentLink(value: string) {
  try {
    const pathname = decodeURIComponent(new URL(value).pathname)
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/');
    return /^\/api\/attachments(?:\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

/** Format checks reduce mistakes; they do not establish that a download is malware-free. */
export function validateProjectAttachment(input: {
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
}) {
  assert(
    typeof input.filename === 'string' &&
      typeof input.mediaType === 'string' &&
      input.bytes instanceof Uint8Array,
    400,
    'Некорректный файл.',
  );
  const filename = input.filename.normalize('NFKC').trim();
  assert(
    filename.length > 0 &&
      filename.length <= 120 &&
      !filename.startsWith('.') &&
      !/[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(filename),
    400,
    'Имя файла должно быть до 120 символов, без путей и управляющих знаков.',
  );
  assert(input.bytes.byteLength > 0, 400, 'Пустой файл не принимается.');
  assert(
    input.bytes.byteLength <= MAX_ATTACHMENT_BYTES,
    413,
    'Размер файла не должен превышать 5 МиБ.',
  );
  const mediaType = input.mediaType.split(';', 1)[0].trim().toLowerCase();
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const extensions: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'image/png': ['png'],
    'image/jpeg': ['jpg', 'jpeg'],
    'text/plain': ['txt'],
  };
  assert(
    extensions[mediaType]?.includes(extension),
    415,
    'Разрешены только PDF, PNG, JPEG и TXT с соответствующим типом файла.',
  );
  const bytes = input.bytes;
  let matches = false;
  if (mediaType === 'application/pdf') {
    const header = String.fromCharCode(...bytes.subarray(0, 9));
    matches =
      /^%PDF-(?:1\.[0-7]|2\.0)/.test(header) &&
      new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes('%%EOF');
  } else if (mediaType === 'image/png') {
    matches =
      bytes.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
      String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR';
    if (matches) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16),
        height = view.getUint32(20);
      matches =
        width > 0 &&
        height > 0 &&
        width <= 16000 &&
        height <= 16000 &&
        width * height <= 40_000_000;
    }
  } else if (mediaType === 'image/jpeg') {
    matches =
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217;
  } else {
    try {
      matches = !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      matches = false;
    }
  }
  assert(
    matches,
    415,
    'Содержимое не соответствует разрешённому формату. Антивирусная проверка не выполнялась.',
  );
  return {
    filename,
    mediaType: mediaType as (typeof attachmentMediaTypes)[number],
    byteSize: bytes.byteLength,
  };
}
