'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut, Menu, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { ThemeSwitch } from './theme-switch';
import type { Viewer } from './types';

export function SiteHeader({
  viewer,
  productName,
}: {
  viewer: Viewer | null;
  productName: string;
}) {
  const words = productName.split(' ');
  const brandTop = words.length > 1 ? words.slice(0, -1).join(' ') : productName;
  const brandBottom = words.length > 1 ? words.at(-1) : 'Студенческие проекты';
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
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
    <header className="site-header">
      <div className="container header-inner">
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
        <button
          className="icon-button mobile-menu"
          ref={menuButton}
          aria-controls="header-navigation"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <div
          id="header-navigation"
          className={`header-content ${open ? 'is-open' : ''}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              setOpen(false);
              menuButton.current?.focus();
            }
          }}
        >
          <nav className="main-nav" aria-label="Основная навигация">
            <Link
              onClick={() => setOpen(false)}
              className={path.startsWith('/projects') ? 'active' : ''}
              href="/projects"
            >
              Найти проект
            </Link>
            <Link
              onClick={() => setOpen(false)}
              className={path === '/help' ? 'active' : ''}
              href="/help"
            >
              Как это работает
            </Link>
            <Link
              href="/opportunities"
              onClick={() => setOpen(false)}
              className={path === '/opportunities' ? 'active' : ''}
            >
              Возможности
            </Link>
            {viewer && (
              <Link
                onClick={() => setOpen(false)}
                className={path === '/dashboard' ? 'active' : ''}
                href="/dashboard"
              >
                Мой кабинет
              </Link>
            )}
          </nav>
          <div className="header-actions">
            <ThemeSwitch />
            {viewer ? (
              <>
                <Link href="/onboarding" className="account-link">
                  <span className="avatar">{viewer.name.slice(0, 1)}</span>
                  <span>{viewer.name.split(' ')[0]}</span>
                </Link>
                <button
                  className="icon-button"
                  onClick={signOut}
                  disabled={busy}
                  aria-label="Выйти"
                >
                  <LogOut size={17} />
                </button>
                {viewer.roles.includes('client') && (
                  <Link
                    onClick={() => setOpen(false)}
                    className="button small"
                    href="/client/projects/new"
                  >
                    Разместить заказ
                    <ArrowUpRight size={15} />
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link onClick={() => setOpen(false)} className="login-link" href="/auth/login">
                  Войти
                </Link>
                <Link onClick={() => setOpen(false)} className="button small" href="/auth/register">
                  Начать
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
