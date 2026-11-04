'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useI18n } from '@/components/locale-provider';
import {
  authFeedbackText,
  authMessage,
  type AuthFeedback,
  type AuthMessageKey,
} from '@/lib/auth-feedback';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

const titles: Record<Mode, { title: string; description: string; submit: string }> = {
  login: {
    title: 'С возвращением',
    description: 'Продолжите работу над заказами и своим портфолио.',
    submit: 'Войти',
  },
  register: {
    title: 'Ваш первый реальный проект',
    description: 'Создайте аккаунт, затем выберите роль исполнителя или заказчика.',
    submit: 'Создать аккаунт',
  },
  forgot: {
    title: 'Восстановить доступ',
    description: 'Отправим ссылку для установки нового пароля.',
    submit: 'Отправить ссылку',
  },
  reset: {
    title: 'Новый пароль',
    description: 'После смены пароля все прежние сессии завершатся.',
    submit: 'Сохранить пароль',
  },
  verify: {
    title: 'Подтверждение email',
    description: 'Подтвердите адрес по ссылке из письма. При необходимости запросите новое письмо.',
    submit: 'Отправить письмо повторно',
  },
};

const kazakhTitles: typeof titles = {
  login: {
    title: 'Қайта қош келдіңіз',
    description: 'Тапсырыстар мен портфолио бойынша жұмысыңызды жалғастырыңыз.',
    submit: 'Кіру',
  },
  register: {
    title: 'Алғашқы нақты жобаңыз',
    description: 'Аккаунт жасап, орындаушы немесе тапсырыс беруші рөлін таңдаңыз.',
    submit: 'Аккаунт жасау',
  },
  forgot: {
    title: 'Қолжетімділікті қалпына келтіру',
    description: 'Жаңа құпиясөз орнату үшін сілтеме жібереміз.',
    submit: 'Сілтеме жіберу',
  },
  reset: {
    title: 'Жаңа құпиясөз',
    description: 'Құпиясөз өзгергеннен кейін барлық алдыңғы сессия аяқталады.',
    submit: 'Құпиясөзді сақтау',
  },
  verify: {
    title: 'Email мекенжайын растау',
    description: 'Хаттағы сілтеме арқылы мекенжайды растаңыз. Қажет болса, жаңа хат сұраңыз.',
    submit: 'Хатты қайта жіберу',
  },
};

export function AuthForm({
  mode,
  localMode,
  token,
  googleEnabled = false,
  googleError = false,
}: {
  mode: Mode;
  localMode: boolean;
  token?: string;
  googleEnabled?: boolean;
  googleError?: boolean;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<AuthFeedback | null>(null);
  const [success, setSuccess] = useState<AuthMessageKey | null>(null);
  const copy = (locale === 'kk' ? kazakhTitles : titles)[mode];
  const errorCopy = error ? authFeedbackText(error, locale) : null;
  const emailFormLabel =
    mode === 'register'
      ? t('Регистрация по email', 'Email арқылы тіркелу')
      : mode === 'login'
        ? t('Вход по email', 'Email арқылы кіру')
        : copy.title;

  async function signInWithGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: '/dashboard',
          newUserCallbackURL: '/onboarding',
          errorCallbackURL: '/auth/login?googleError=1',
          requestSignUp: mode === 'register',
          additionalData: {
            adultConfirmed: form.get('adultConfirmed') === 'on',
            privacyConsent: form.get('privacyConsent') === 'on',
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.url !== 'string') {
        setError({ kind: 'response', status: response.status, message: result?.message });
        return;
      }
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com') {
        setError({ kind: 'local', key: 'failed' });
        return;
      }
      window.location.assign(destination.href);
    } catch {
      setError({ kind: 'local', key: 'offline' });
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if ((mode === 'register' || mode === 'reset') && password !== form.get('confirmPassword')) {
      setError({ kind: 'local', key: 'mismatch' });
      setPending(false);
      return;
    }
    const endpoint = {
      login: 'sign-in/email',
      register: 'sign-up/email',
      forgot: 'request-password-reset',
      reset: 'reset-password',
      verify: 'send-verification-email',
    }[mode];
    const email = String(form.get('email') || '').trim();
    const body =
      mode === 'login'
        ? { email, password }
        : mode === 'register'
          ? {
              name: String(form.get('name') || '').trim(),
              email,
              password,
              adultConfirmed: form.get('adultConfirmed') === 'on',
              privacyConsent: form.get('privacyConsent') === 'on',
              callbackURL: `${window.location.origin}/dashboard`,
            }
          : mode === 'forgot'
            ? { email, redirectTo: `${window.location.origin}/auth/reset-password` }
            : mode === 'reset'
              ? {
                  newPassword: password,
                  token,
                }
              : { email, callbackURL: `${window.location.origin}/dashboard` };

    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result?.message === 'string'
            ? result.message
            : typeof result?.error === 'string'
              ? result.error
              : undefined;
        setError({
          kind: 'response',
          status: response.status,
          code: typeof result?.code === 'string' ? result.code : undefined,
          message,
        });
        return;
      }
      if (mode === 'login' || (mode === 'register' && localMode)) {
        router.push(mode === 'register' ? '/onboarding' : '/dashboard');
        router.refresh();
      } else if (mode === 'register') {
        setSuccess('confirmEmail');
      } else if (mode === 'reset') {
        setSuccess('passwordChanged');
      } else {
        setSuccess('emailRequested');
      }
    } catch (caught) {
      setError({
        kind: 'local',
        key:
          caught instanceof DOMException &&
          (caught.name === 'TimeoutError' || caught.name === 'AbortError')
            ? 'timeout'
            : 'offline',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container page-shell" lang={locale}>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow">{t('ОПЫТ НАЧИНАЕТСЯ С ДЕЛА', 'ТӘЖІРИБЕ ІСТЕН БАСТАЛАДЫ')}</span>
          <h1>
            {t('Небольшая задача.', 'Шағын тапсырма.')}
            <br />
            {t('Настоящий результат.', 'Нақты нәтиже.')}
          </h1>
          <p className="muted">
            {t(
              'Найдите заказ по своим навыкам, согласуйте понятные условия и добавьте принятый результат в портфолио.',
              'Дағдыларыңызға сай тапсырыс тауып, түсінікті шарттарды келісіңіз және қабылданған нәтижені портфолиоға қосыңыз.',
            )}
          </p>
          <div className="auth-benefits">
            <p>
              <CheckCircle2 size={20} aria-hidden="true" />{' '}
              {t('Бесплатные отклики без длинного резюме', 'Ұзақ түйіндемесіз тегін өтінімдер')}
            </p>
            <p>
              <Clock3 size={20} aria-hidden="true" />{' '}
              {t(
                'Бюджет и трудоёмкость до начала работы',
                'Бюджет пен жұмыс көлемі алдын ала белгілі',
              )}
            </p>
            <p>
              <LockKeyhole size={20} aria-hidden="true" />{' '}
              {t('Приёмка по согласованным критериям', 'Келісілген өлшемдер бойынша қабылдау')}
            </p>
          </div>
          <p className="muted">
            {t(
              'Пилот для участников 18+. Оплата — вне платформы, по договорённости сторон.',
              'Пилот 18 жастан асқан қатысушыларға арналған. Төлем тараптардың келісімі бойынша платформадан тыс жүргізіледі.',
            )}
          </p>
        </section>
        <section className="panel auth-panel" aria-labelledby="auth-heading">
          <h2 id="auth-heading">{copy.title}</h2>
          <p className="muted">{copy.description}</p>
          {localMode && (
            <div className="alert">
              {t(
                'Локальный режим разработки. Подтверждение почты отключено. Письма восстановления сохраняются только в папке',
                'Жергілікті әзірлеу режимі. Поштаны растау өшірілген. Қалпына келтіру хаттары тек осы компьютердегі мына бумада сақталады:',
              )}{' '}
              <code>.local/mail</code>
              {locale === 'ru' ? ' на этом компьютере.' : '.'}
            </div>
          )}
          {errorCopy && (
            <div className="alert error" role="alert">
              {errorCopy.original && (
                <span>
                  {t(
                    'Сообщение сервиса в исходном виде:',
                    'Қызмет хабарламасының түпнұсқасы:',
                  )}{' '}
                </span>
              )}
              <span lang={errorCopy.language}>{errorCopy.text}</span>
            </div>
          )}
          {googleError && (
            <div className="alert error" role="alert">
              {t(
                'Не удалось войти через Google. Если вы ещё не регистрировались, сначала создайте аккаунт через Google. Если email уже занят, войдите привычным способом.',
                'Google арқылы кіру мүмкін болмады. Алдымен Google арқылы тіркеліңіз. Егер email бұрын қолданылса, әдеттегі жолмен кіріңіз.',
              )}
            </div>
          )}
          {success && (
            <div className="alert success" role="status">
              {authMessage(success, locale)}{' '}
              {mode === 'reset' && (
                <Link href="/auth/login">{t('Перейти ко входу', 'Кіру бетіне өту')}</Link>
              )}
              {mode === 'register' && !localMode && (
                <p>
                  <Link href="/auth/verify-email">
                    {t('Запросить письмо повторно', 'Хатты қайта сұрау')}
                  </Link>
                </p>
              )}
            </div>
          )}
          {mode === 'reset' && !token ? (
            <div className="alert error" role="alert">
              {t('Ссылка недействительна или истекла.', 'Сілтеме жарамсыз немесе мерзімі өткен.')}{' '}
              <Link href="/auth/forgot-password">
                {t('Запросить новую ссылку', 'Жаңа сілтеме сұрау')}
              </Link>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="form-grid"
              aria-label={emailFormLabel}
              aria-busy={pending}
            >
              {mode === 'register' && (
                <label className="field">
                  {t('Отображаемое имя', 'Көрсетілетін есім')}
                  <input
                    className="input"
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder={t('Как к вам обращаться', 'Сізді қалай атаймыз')}
                  />
                </label>
              )}
              {mode !== 'reset' && (
                <label className="field">
                  Email
                  <input
                    className="input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                <div className="field">
                  <label htmlFor="auth-password">
                    {mode === 'reset'
                      ? t('Новый пароль', 'Жаңа құпиясөз')
                      : t('Пароль', 'Құпиясөз')}
                  </label>
                  <div className="password-field">
                    <input
                      id="auth-password"
                      className="input"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={mode === 'login' ? 1 : 12}
                      maxLength={128}
                      placeholder={
                        mode === 'login'
                          ? t('Ваш пароль', 'Құпиясөзіңіз')
                          : t('Минимум 12 символов', 'Кемінде 12 таңба')
                      }
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={
                        showPassword
                          ? t('Скрыть пароль', 'Құпиясөзді жасыру')
                          : t('Показать пароль', 'Құпиясөзді көрсету')
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff size={19} aria-hidden="true" />
                      ) : (
                        <Eye size={19} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}
              {(mode === 'register' || mode === 'reset') && (
                <div className="field">
                  <label htmlFor="auth-confirm-password">
                    {t('Повторите пароль', 'Құпиясөзді қайталаңыз')}
                  </label>
                  <div className="password-field">
                    <input
                      id="auth-confirm-password"
                      className="input"
                      type={showConfirmation ? 'text' : 'password'}
                      name="confirmPassword"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={
                        showConfirmation
                          ? t('Скрыть повтор пароля', 'Қайталанған құпиясөзді жасыру')
                          : t('Показать повтор пароля', 'Қайталанған құпиясөзді көрсету')
                      }
                      aria-pressed={showConfirmation}
                      onClick={() => setShowConfirmation(!showConfirmation)}
                    >
                      {showConfirmation ? (
                        <EyeOff size={19} aria-hidden="true" />
                      ) : (
                        <Eye size={19} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}
              {mode === 'register' && (
                <>
                  <label className="check-row">
                    <input type="checkbox" name="adultConfirmed" required />{' '}
                    {t('Мне исполнилось 18 лет', 'Мен 18 жасқа толдым')}
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="privacyConsent" required />{' '}
                    <span>
                      {t('Согласен с ', '')}
                      <Link href="/terms">{t('условиями пилота', 'Пилот шарттарымен')}</Link>{' '}
                      {t('и', 'және')}{' '}
                      <Link href="/privacy">
                        {t('обработкой персональных данных', 'дербес деректерді өңдеумен')}
                      </Link>
                      {t('', ' келісемін')}
                    </span>
                  </label>
                </>
              )}
              <button className="button" type="submit" disabled={pending}>
                {pending ? t('Подождите…', 'Күте тұрыңыз…') : copy.submit}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
          )}
          {googleEnabled && (mode === 'login' || mode === 'register') && (
            <>
              <p className="auth-method-divider">{t('Или через Google', 'Немесе Google арқылы')}</p>
              <form
                className="form-grid"
                onSubmit={signInWithGoogle}
                aria-label={
                  mode === 'register'
                    ? t('Регистрация через Google', 'Google арқылы тіркелу')
                    : t('Вход через Google', 'Google арқылы кіру')
                }
                aria-busy={pending}
              >
                {mode === 'register' && (
                  <>
                    <label className="check-row">
                      <input type="checkbox" name="adultConfirmed" required />{' '}
                      {t('Мне исполнилось 18 лет', 'Мен 18 жасқа толдым')}
                    </label>
                    <label className="check-row">
                      <input type="checkbox" name="privacyConsent" required />{' '}
                      <span>
                        {t('Согласен с ', '')}
                        <Link href="/terms">{t('условиями пилота', 'Пилот шарттарымен')}</Link>{' '}
                        {t('и', 'және')}{' '}
                        <Link href="/privacy">
                          {t('обработкой персональных данных', 'дербес деректерді өңдеумен')}
                        </Link>
                        {t('', ' келісемін')}
                      </span>
                    </label>
                  </>
                )}
                <button className="button secondary" type="submit" disabled={pending}>
                  {mode === 'login'
                    ? t('Войти через Google', 'Google арқылы кіру')
                    : t('Зарегистрироваться через Google', 'Google арқылы тіркелу')}
                </button>
              </form>
            </>
          )}
          <div className="auth-links">
            {mode === 'login' ? (
              <>
                <Link href="/auth/forgot-password">
                  {t('Забыли пароль?', 'Құпиясөзді ұмыттыңыз ба?')}
                </Link>
                <p>
                  {t('Ещё нет аккаунта?', 'Аккаунтыңыз жоқ па?')}{' '}
                  <Link href="/auth/register">{t('Зарегистрироваться', 'Тіркелу')}</Link>
                </p>
              </>
            ) : (
              <Link href="/auth/login">
                {t('Уже есть аккаунт? Войти', 'Аккаунтыңыз бар ма? Кіру')}
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
