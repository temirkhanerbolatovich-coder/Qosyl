import type { Locale } from './locale';

export type ProfileFailure =
  { kind: 'network' } | { kind: 'response'; status: number; code: string; original: string };

const responseMessages: Record<string, readonly [number, string, string]> = {
  VALIDATION_ERROR: [
    400,
    'Проверьте имя, город, ссылки и остальные поля профиля.',
    'Аты-жөніңізді, қаланы, сілтемелерді және профильдің басқа өрістерін тексеріңіз.',
  ],
  UNAUTHENTICATED: [401, 'Войдите в аккаунт.', 'Аккаунтқа кіріңіз.'],
  FORBIDDEN: [
    403,
    'Нет доступа к сохранению профиля. Проверьте аккаунт и обновите страницу.',
    'Профильді сақтауға рұқсат жоқ. Аккаунтты тексеріп, бетті жаңартыңыз.',
  ],
  CONFLICT: [
    409,
    'Действие уже выполнено или данные изменились. Обновите страницу.',
    'Әрекет орындалған немесе деректер өзгерген. Бетті жаңартыңыз.',
  ],
  PAYLOAD_TOO_LARGE: [
    413,
    'Объём данных профиля слишком большой. Сократите введённые данные.',
    'Профиль деректерінің көлемі тым үлкен. Енгізілген деректерді қысқартыңыз.',
  ],
  UNSUPPORTED_MEDIA_TYPE: [
    415,
    'Сервер не принял формат запроса. Обновите страницу и повторите сохранение.',
    'Сервер сұрау пішімін қабылдамады. Бетті жаңартып, қайта сақтаңыз.',
  ],
  RATE_LIMITED: [
    429,
    'Слишком много запросов. Подождите и повторите сохранение.',
    'Сұраулар тым көп. Күтіп, қайта сақтаңыз.',
  ],
  INTERNAL_ERROR: [
    500,
    'Не удалось сохранить профиль. Повторите позже.',
    'Профильді сақтау мүмкін болмады. Кейінірек қайталап көріңіз.',
  ],
  SERVICE_UNAVAILABLE: [
    503,
    'Не удалось сохранить профиль. Повторите позже.',
    'Профильді сақтау мүмкін болмады. Кейінірек қайталап көріңіз.',
  ],
};

/** Preserve the server's original detail; only stable code/status summaries are translated. */
export function profileFailureCopy(failure: ProfileFailure, locale: Locale) {
  if (failure.kind === 'network')
    return {
      summary:
        locale === 'kk'
          ? 'Сервер қолжетімсіз немесе уақытында жауап бермеді. Байланысты тексеріп, қайталаңыз.'
          : 'Сервер недоступен или не ответил вовремя. Проверьте соединение и повторите.',
      original: '',
    };
  const known = Object.hasOwn(responseMessages, failure.code)
    ? responseMessages[failure.code]
    : undefined;
  const summary =
    known?.[0] === failure.status
      ? known[locale === 'kk' ? 2 : 1]
      : locale === 'kk'
        ? 'Профильді сақтау мүмкін болмады. Сервердің бастапқы хабарламасын тексеріңіз немесе кейінірек қайталаңыз.'
        : 'Не удалось сохранить профиль. Проверьте исходное сообщение сервера или повторите позже.';
  return { summary, original: failure.original === summary ? '' : failure.original };
}

export function profileFailureFromResponse(status: number, result: unknown): ProfileFailure {
  const body = result && typeof result === 'object' ? result : {};
  return {
    kind: 'response',
    status,
    code: 'code' in body && typeof body.code === 'string' ? body.code : '',
    original: 'error' in body && typeof body.error === 'string' ? body.error : '',
  };
}
