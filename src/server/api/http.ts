import 'server-only';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { config } from '@/lib/config';
import { AppError, assert } from '@/lib/permissions';
import { readLimitedBody } from '@/lib/http';

const headers = { 'Cache-Control': 'private, no-store' };
const codes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

export function apiSuccess(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers });
}

export function requireSameOrigin(request: Request) {
  assert(
    request.headers.get('origin') === new URL(config.baseUrl).origin,
    403,
    'Запрос должен быть отправлен с сайта платформы.',
  );
}

/** Content-Length is only an early check; the stream itself is bounded too. */
export async function readJsonObject(request: Request, maxBytes: number) {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  assert(mediaType === 'application/json', 415, 'Ожидается JSON.');
  const body = await readLimitedBody(request, maxBytes);
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    throw new AppError(400, 'Некорректный JSON.');
  }
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    400,
    'Некорректное тело запроса.',
  );
  return input as Record<string, unknown>;
}

interface FailureOptions {
  fallbackStatus?: number;
  fallbackMessage?: string;
  validationMessage?: string;
  includeFields?: boolean;
}

export function apiFailure(error: unknown, operation: string, options: FailureOptions = {}) {
  let status = options.fallbackStatus ?? 500;
  let message = options.fallbackMessage ?? 'Сервер временно недоступен. Попробуйте позже.';
  let fields: Record<string, string[] | undefined> | undefined;
  if (error instanceof AppError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    message =
      options.validationMessage ??
      error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    if (options.includeFields) fields = error.flatten().fieldErrors;
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) {
    status = 409;
    message = 'Действие уже выполнено или данные изменились. Обновите страницу.';
  } else {
    // Never log request bodies, database URLs, tokens, or exception messages.
    console.error('api_operation_failed', {
      operation,
      type: error instanceof Error ? error.name : 'UnknownError',
    });
  }
  return Response.json(
    { error: message, code: codes[status] ?? 'INTERNAL_ERROR', ...(fields ? { fields } : {}) },
    { status, headers },
  );
}
