import { auth } from '@/lib/auth';
import { config } from '@/lib/config';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(config.baseUrl).origin) {
    return Response.json({ error: 'Запрос разрешён только с сайта платформы.' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') || 0) > 16_384) {
    return Response.json({ error: 'Слишком большой запрос.' }, { status: 413 });
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return Response.json({ error: 'Слишком большой запрос.' }, { status: 413 });
      }
      chunks.push(next.value);
    }
  }
  const bodyText = Buffer.concat(chunks).toString('utf8');
  // The native hook also checks consent, so server callers cannot bypass this guard.
  if (new URL(request.url).pathname.endsWith('/sign-up/email')) {
    try {
      const body = JSON.parse(bodyText);
      if (body?.adultConfirmed !== true || body?.privacyConsent !== true) {
        return Response.json(
          { message: 'Подтвердите возраст 18+ и согласие с условиями обработки данных.' },
          { status: 400 },
        );
      }
    } catch {
      return Response.json({ message: 'Некорректный JSON.' }, { status: 400 });
    }
  }
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete('content-length');
  return handlers.POST(
    new Request(request.url, {
      method: 'POST',
      headers: forwardedHeaders,
      body: bodyText,
      signal: request.signal,
    }),
  );
}
