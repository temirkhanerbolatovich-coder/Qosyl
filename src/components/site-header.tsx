'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, Bookmark, LogOut, Menu, X } from 'lucide-react';
import { useRef, useState } from 'react';
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
    words.length > 1
      ? words.at(-1)
      : t('Возможности для студентов', 'Студенттерге арналған мүмкіндіктер');
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setOpen(false);
  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      closeMenu();
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <header
      className="site-header qosyl-header"
      lang={locale}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape' && toggle.current?.offsetWidth) {
          closeMenu();
          toggle.current.focus();
        }
      }}
    >
      <div className="container qosyl-header-inner">
        <Link href="/" className="brand" onNavigate={closeMenu}>
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
        <div className="header-shortcuts">
          {viewer && (
            <Link
              href="/opportunities/saved"
              aria-label={t('Избранное', 'Таңдаулылар')}
              className="icon-button"
              onNavigate={closeMenu}
            >
              <Bookmark size={19} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            ref={toggle}
            className="button secondary small"
            aria-expanded={open}
            aria-controls="header-navigation"
            aria-label={t(open ? 'Закрыть меню' : 'Открыть меню', 'Мәзір')}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
            {t('Меню', 'Мәзір')}
          </button>
        </div>
        <div id="header-navigation" className="header-sections" data-open={open}>
          <nav className="qosyl-nav" aria-label={t('Основная навигация', 'Негізгі навигация')}>
            <Link
              onNavigate={closeMenu}
              href="/opportunities"
              aria-current={path === '/opportunities' ? 'page' : undefined}
            >
              {t('Возможности', 'Мүмкіндіктер')}
            </Link>
            <Link
              onNavigate={closeMenu}
              href="/admissions"
              aria-current={path.startsWith('/admissions') ? 'page' : undefined}
            >
              {t('Поступление', 'Оқуға түсу')}
            </Link>
            <Link
              onNavigate={closeMenu}
              href="/projects"
              aria-current={path.startsWith('/projects') ? 'page' : undefined}
            >
              {t('Проекты', 'Жобалар')}
            </Link>
            <Link
              onNavigate={closeMenu}
              href="/help"
              aria-current={path === '/help' ? 'page' : undefined}
            >
              {t('Как это работает', 'Қалай жұмыс істейді')}
            </Link>
            {viewer && (
              <Link
                onNavigate={closeMenu}
                href="/opportunities/saved"
                className="desktop-saved"
                aria-current={path === '/opportunities/saved' ? 'page' : undefined}
              >
                {t('Избранное', 'Таңдаулылар')}
              </Link>
            )}
            {viewer && (
              <Link
                onNavigate={closeMenu}
                href="/dashboard"
                aria-current={path === '/dashboard' ? 'page' : undefined}
              >
                {t('Мой кабинет', 'Жеке кабинетім')}
              </Link>
            )}
          </nav>
          <div className="qosyl-header-actions">
            <ThemeSwitch />
            <LocaleSwitch />
            {viewer ? (
              <>
                <Link onNavigate={closeMenu} href="/onboarding" className="account-link">
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
                  <Link onNavigate={closeMenu} className="button small" href="/client/projects/new">
                    {t('Разместить заказ', 'Тапсырыс жариялау')}
                    <ArrowUpRight size={15} />
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link onNavigate={closeMenu} className="login-link" href="/auth/login">
                  {t('Войти', 'Кіру')}
                </Link>
                <Link onNavigate={closeMenu} className="button small" href="/auth/register">
                  {t('Начать', 'Бастау')}
                  <ArrowUpRight size={15} />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
