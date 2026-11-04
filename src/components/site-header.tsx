'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { ThemeSwitch } from './theme-switch';
import { LocaleSwitch, useI18n } from './locale-provider';
import type { Viewer } from './types';

export function SiteHeader({
  viewer,
  productName,
}: {
  viewer: Viewer | null;
  productName: string;
}) {
  const { locale, t } = useI18n();
  const words = productName.split(' ');
  const brandTop = words.length > 1 ? words.slice(0, -1).join(' ') : productName;
  const brandBottom =
    words.length > 1 ? words.at(-1) : t('Студенческие проекты', 'Студенттік жобалар');
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="site-header qosyl-header" lang={locale}>
      <div className="container qosyl-header-inner" id="header-navigation">
        <Link href="/" className="brand">
          <Image
            className="brand-logo"
            src="/brand/qosyl-logo.jpg"
            alt=""
            width={64}
            height={64}
            priority
          />
          <span className="brand-name">
            {brandTop}
            <span>{brandBottom}</span>
          </span>
        </Link>
        <nav className="qosyl-nav" aria-label={t('Основная навигация', 'Негізгі навигация')}>
          <Link href="/projects" aria-current={path.startsWith('/projects') ? 'page' : undefined}>
            {t('Проекты', 'Жобалар')}
          </Link>
          <Link
            href="/opportunities"
            aria-current={path.startsWith('/opportunities') ? 'page' : undefined}
          >
            {t('Возможности', 'Мүмкіндіктер')}
          </Link>
          <Link href="/help" aria-current={path === '/help' ? 'page' : undefined}>
            {t('Как это работает', 'Қалай жұмыс істейді')}
          </Link>
          {viewer && (
            <Link href="/dashboard" aria-current={path === '/dashboard' ? 'page' : undefined}>
              {t('Мой кабинет', 'Жеке кабинетім')}
            </Link>
          )}
        </nav>
        <div className="qosyl-header-actions">
          <ThemeSwitch />
          <LocaleSwitch />
          {viewer ? (
            <>
              <Link
                href="/onboarding"
                className="account-link"
              >
                <span className="avatar" aria-hidden="true">
                  {viewer.name.slice(0, 1)}
                </span>
                <span lang="und">{viewer.name.split(' ')[0]}</span>
              </Link>
              <button
                className="icon-button"
                onClick={signOut}
                disabled={busy}
                aria-label={t('Выйти', 'Шығу')}
              >
                <LogOut size={17} />
              </button>
              {viewer.roles.includes('client') && (
                <Link className="button small" href="/client/projects/new">
                  {t('Разместить заказ', 'Тапсырыс жариялау')}
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </>
          ) : (
            <>
              <Link className="login-link" href="/auth/login">
                {t('Войти', 'Кіру')}
              </Link>
              <Link className="button small" href="/auth/register">
                {t('Начать', 'Бастау')}
                <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
