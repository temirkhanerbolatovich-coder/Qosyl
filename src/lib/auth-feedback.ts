import type { Locale } from './locale';

const messages = {
  mismatch: ['Пароли не совпадают.', 'Құпиясөздер сәйкес келмейді.'],
  rateLimited: [
    'Слишком много попыток. Подождите минуту и повторите.',
    'Әрекет тым көп. Бір минут күтіп, қайталаңыз.',
  ],
  unavailable: [
    'Сервис временно недоступен. Попробуйте ещё раз позже.',
    'Қызмет уақытша қолжетімсіз. Кейінірек қайталап көріңіз.',
  ],
  failed: [
    'Не удалось выполнить действие. Проверьте введённые данные.',
    'Әрекетті орындау мүмкін болмады. Енгізілген деректерді тексеріңіз.',
  ],
  timeout: [
    'Сервер не ответил вовремя. Проверьте соединение и повторите.',
    'Сервер уақытында жауап бермеді. Қосылымды тексеріп, қайталаңыз.',
  ],
  offline: [
    'Нет связи с сервером. Проверьте соединение и повторите.',
    'Сервермен байланыс жоқ. Қосылымды тексеріп, қайталаңыз.',
  ],
  confirmEmail: [
    'Проверьте почту и подтвердите адрес. Затем войдите в аккаунт.',
    'Поштаңызды тексеріп, мекенжайды растаңыз. Содан кейін аккаунтқа кіріңіз.',
  ],
  passwordChanged: [
    'Пароль изменён. Войдите с новым паролем.',
    'Құпиясөз өзгертілді. Жаңа құпиясөзбен кіріңіз.',
  ],
  emailRequested: [
    'Если для этого адреса доступно действие, письмо отправлено. Проверьте входящие и спам.',
    'Бұл мекенжай үшін әрекет қолжетімді болса, хат жіберілді. Кіріс хаттар мен спамды тексеріңіз.',
  ],
  invalidCredentials: ['Неверный email или пароль.', 'Email немесе құпиясөз қате.'],
  invalidEmail: ['Проверьте адрес email.', 'Email мекенжайын тексеріңіз.'],
  emailNotVerified: [
    'Сначала подтвердите email по ссылке из письма.',
    'Алдымен хаттағы сілтеме арқылы email мекенжайын растаңыз.',
  ],
  invalidToken: [
    'Ссылка недействительна или истекла. Запросите новую ссылку.',
    'Сілтеме жарамсыз немесе мерзімі өткен. Жаңа сілтеме сұраңыз.',
  ],
  shortPassword: [
    'Пароль должен содержать минимум 12 символов.',
    'Құпиясөз кемінде 12 таңбадан тұруы керек.',
  ],
  longPassword: [
    'Пароль должен содержать не более 128 символов.',
    'Құпиясөз 128 таңбадан аспауы керек.',
  ],
  existingAccount: [
    'Аккаунт с таким email уже существует. Войдите или восстановите пароль.',
    'Бұл email мекенжайымен аккаунт бар. Кіріңіз немесе құпиясөзді қалпына келтіріңіз.',
  ],
  sessionExpired: [
    'Сессия истекла. Войдите в аккаунт повторно.',
    'Сессияның мерзімі өтті. Аккаунтқа қайта кіріңіз.',
  ],
  alreadyVerified: ['Email уже подтверждён.', 'Email мекенжайы расталған.'],
  consentRequired: [
    'Для участия в пилоте подтвердите возраст 18+ и согласие с условиями обработки данных.',
    'Пилотқа қатысу үшін 18 жасқа толғаныңызды және деректерді өңдеу шарттарына келісіміңізді растаңыз.',
  ],
  invalidName: [
    'Укажите имя длиной от 2 до 100 символов.',
    'Ұзындығы 2–100 таңба болатын есімді көрсетіңіз.',
  ],
  demoUnavailable: [
    'Демонстрационный аккаунт недоступен в этом окружении.',
    'Бұл ортада демонстрациялық аккаунт қолжетімсіз.',
  ],
} as const;

export type AuthMessageKey = keyof typeof messages;
export type AuthFeedback =
  | { kind: 'local'; key: AuthMessageKey }
  | { kind: 'response'; status: number; code?: string; message?: string };

// Codes are from the installed Better Auth version; provider messages are never fuzzy matched.
const providerMessages: Record<string, AuthMessageKey> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  INVALID_PASSWORD: 'invalidCredentials',
  USER_NOT_FOUND: 'invalidCredentials',
  INVALID_EMAIL: 'invalidEmail',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  INVALID_TOKEN: 'invalidToken',
  TOKEN_EXPIRED: 'invalidToken',
  PASSWORD_TOO_SHORT: 'shortPassword',
  PASSWORD_TOO_LONG: 'longPassword',
  USER_ALREADY_EXISTS: 'existingAccount',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'existingAccount',
  SESSION_EXPIRED: 'sessionExpired',
  EMAIL_ALREADY_VERIFIED: 'alreadyVerified',
};
const applicationMessages: Record<string, AuthMessageKey> = {
  [messages.consentRequired[0]]: 'consentRequired',
  [messages.invalidName[0]]: 'invalidName',
  [messages.demoUnavailable[0]]: 'demoUnavailable',
};

export const authMessage = (key: AuthMessageKey, locale: Locale) =>
  messages[key][locale === 'kk' ? 1 : 0];

/** Keep response identity in state so changing language also updates an existing error. */
export function authFeedbackText(
  feedback: AuthFeedback,
  locale: Locale,
): { text: string; language: Locale | 'und'; original: boolean } {
  let key: AuthMessageKey | undefined;
  if (feedback.kind === 'local') key = feedback.key;
  else if (feedback.status === 429) key = 'rateLimited';
  else if (feedback.status >= 500) key = 'unavailable';
  else {
    key =
      (feedback.code && Object.hasOwn(providerMessages, feedback.code)
        ? providerMessages[feedback.code]
        : undefined) ??
      (feedback.message && Object.hasOwn(applicationMessages, feedback.message)
        ? applicationMessages[feedback.message]
        : undefined);
    if (!key && feedback.message)
      return { text: feedback.message, language: 'und', original: true };
  }
  return { text: authMessage(key ?? 'failed', locale), language: locale, original: false };
}
