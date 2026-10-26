import { AppError } from './permissions';

/** Bound the stream itself; Content-Length is optional and cannot be trusted. */
export async function readLimitedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new AppError(413, 'Запрос слишком большой.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(413, 'Запрос слишком большой.');
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
