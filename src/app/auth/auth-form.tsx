'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clock3, LockKeyhole } from 'lucide-react';

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

export function AuthForm({
  mode,
  localMode,
  token,
}: {
  mode: Mode;
  localMode: boolean;
  token?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const copy = titles[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if ((mode === 'register' || mode === 'reset') && password !== form.get('confirmPassword')) {
      setError('Пароли не совпадают.');
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
          response.status === 429
            ? 'Слишком много попыток. Подождите минуту и повторите.'
            : response.status >= 500
              ? 'Сервис временно недоступен. Попробуйте ещё раз позже.'
              : result?.message ||
                result?.error ||
                'Не удалось выполнить действие. Проверьте введённые данные.';
        setError(typeof message === 'string' ? message : 'Не удалось выполнить действие.');
        return;
      }
      if (mode === 'login' || (mode === 'register' && localMode)) {
        router.push(mode === 'register' ? '/onboarding' : '/dashboard');
        router.refresh();
      } else if (mode === 'register') {
        setSuccess('Проверьте почту и подтвердите адрес. Затем войдите в аккаунт.');
      } else if (mode === 'reset') {
        setSuccess('Пароль изменён. Войдите с новым паролем.');
      } else {
        setSuccess(
          'Если для этого адреса доступно действие, письмо отправлено. Проверьте входящие и спам.',
        );
      }
    } catch (caught) {
      setError(
        caught instanceof DOMException &&
          (caught.name === 'TimeoutError' || caught.name === 'AbortError')
          ? 'Сервер не ответил вовремя. Проверьте соединение и повторите.'
          : 'Нет связи с сервером. Проверьте соединение и повторите.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container page-shell">
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow">ОПЫТ НАЧИНАЕТСЯ С ДЕЛА</span>
          <h1>
            Небольшая задача.
            <br />
            Настоящий результат.
          </h1>
          <p className="muted">
            Найдите заказ по своим навыкам, согласуйте понятные условия и добавьте принятый
            результат в портфолио.
          </p>
          <div className="auth-benefits">
            <p>
              <CheckCircle2 size={20} aria-hidden="true" /> Бесплатные отклики без длинного резюме
            </p>
            <p>
              <Clock3 size={20} aria-hidden="true" /> Бюджет и трудоёмкость до начала работы
            </p>
            <p>
              <LockKeyhole size={20} aria-hidden="true" /> Приёмка по согласованным критериям
            </p>
          </div>
          <p className="muted">
            Пилот для участников 18+. Оплата — вне платформы, по договорённости сторон.
          </p>
        </section>
        <section className="panel auth-panel" aria-labelledby="auth-heading">
          <h2 id="auth-heading">{copy.title}</h2>
          <p className="muted">{copy.description}</p>
          {localMode && (
            <div className="alert">
              Локальный режим разработки. Подтверждение почты отключено. Письма восстановления
              сохраняются только в папке <code>.local/mail</code> на этом компьютере.
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="alert success" role="status">
              {success} {mode === 'reset' && <Link href="/auth/login">Перейти ко входу</Link>}
              {mode === 'register' && !localMode && (
                <p>
                  <Link href="/auth/verify-email">Запросить письмо повторно</Link>
                </p>
              )}
            </div>
          )}
          {mode === 'reset' && !token ? (
            <div className="alert error" role="alert">
              Ссылка недействительна или истекла.{' '}
              <Link href="/auth/forgot-password">Запросить новую ссылку</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="form-grid">
              {mode === 'register' && (
                <label className="field">
                  Отображаемое имя
                  <input
                    className="input"
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Как к вам обращаться"
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
                <label className="field">
                  {mode === 'reset' ? 'Новый пароль' : 'Пароль'}
                  <input
                    className="input"
                    type="password"
                    name="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'login' ? 1 : 12}
                    maxLength={128}
                    placeholder={mode === 'login' ? 'Ваш пароль' : 'Минимум 12 символов'}
                  />
                </label>
              )}
              {(mode === 'register' || mode === 'reset') && (
                <label className="field">
                  Повторите пароль
                  <input
                    className="input"
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              )}
              {mode === 'register' && (
                <>
                  <label className="check-row">
                    <input type="checkbox" name="adultConfirmed" required /> Мне исполнилось 18 лет
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="privacyConsent" required />{' '}
                    <span>
                      Согласен с <Link href="/terms">условиями пилота</Link> и{' '}
                      <Link href="/privacy">обработкой персональных данных</Link>
                    </span>
                  </label>
                </>
              )}
              <button className="button" type="submit" disabled={pending}>
                {pending ? 'Подождите…' : copy.submit}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
          )}
          <div className="auth-links">
            {mode === 'login' ? (
              <>
                <Link href="/auth/forgot-password">Забыли пароль?</Link>
                <p>
                  Ещё нет аккаунта? <Link href="/auth/register">Зарегистрироваться</Link>
                </p>
              </>
            ) : (
              <Link href="/auth/login">Уже есть аккаунт? Войти</Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
