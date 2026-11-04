import { z } from 'zod';

export const CLIENT_READ_ERROR =
  'Не удалось прочитать ответ сервера. Обновите данные и повторите попытку.';
export const CLIENT_WRITE_UNCONFIRMED =
  'Ответ сервера не подтверждает выполнение. Обновите данные перед повторной попыткой.';
export const CLIENT_WRITE_REFRESH_ERROR =
  'Действие выполнено, но данные не обновились. Обновите список перед следующим действием.';

/** Keep strict wire validation, but never display JSON/Zod diagnostics to the user. */
export function clientData<S extends z.ZodType>(schema: S, body: unknown, mutation = false) {
  const parsed = z.strictObject({ data: schema }).safeParse(body);
  if (!parsed.success) throw new Error(mutation ? CLIENT_WRITE_UNCONFIRMED : CLIENT_READ_ERROR);
  return (parsed.data as { data: z.output<S> }).data;
}

/** A failed write response may have arrived after the server committed the command. */
export async function requestClientData<S extends z.ZodType>(
  schema: S,
  url: string,
  init?: RequestInit,
) {
  const mutation = !!init?.method && init.method !== 'GET';
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(20000),
  }).catch(() => {
    throw new Error(mutation ? CLIENT_WRITE_UNCONFIRMED : CLIENT_READ_ERROR);
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null;
    throw new Error(reason || (mutation ? CLIENT_WRITE_UNCONFIRMED : CLIENT_READ_ERROR));
  }
  return clientData(schema, body, mutation);
}
