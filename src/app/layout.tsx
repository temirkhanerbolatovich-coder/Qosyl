import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import Image from 'next/image';
import { getCurrentUser } from '@/lib/session';
import { config } from '@/lib/config';
import { ViewerProvider } from '@/components/platform';
import { SiteHeader } from '@/components/site-header';
import { themeBootstrap } from '@/lib/theme';
import './globals.css';
import './design-system.css';

const inter = localFont({
  src: './fonts/Inter.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});
const manrope = localFont({
  src: './fonts/Manrope.woff2',
  variable: '--font-manrope',
  display: 'swap',
  weight: '200 800',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  icons: { icon: '/brand/qosyl-logo.jpg' },
  title: {
    default: `${config.productName} — первый реальный опыт`,
    template: `%s · ${config.productName}`,
  },
  description:
    'Ограниченные по результату проекты для студентов. Понятные условия, бесплатный отклик и подтверждённый опыт.',
};
export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const viewer = user ? { id: user.id, name: user.name, roles: user.roles, demo: user.demo } : null;
  return (
    <html lang="ru" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Перейти к содержимому
        </a>
        <ViewerProvider viewer={viewer}>
          <SiteHeader viewer={viewer} productName={config.productName} />
          {config.localMode && (
            <div className="pilot-banner">
              <span className="pilot-dot" />
              Локальный пилот 18+<span className="banner-separator">/</span>Примеры отмечены «ДЕМО».
              Оплата — вне платформы.
            </div>
          )}
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <div className="container footer-inner">
              <div>
                <Image
                  className="footer-logo"
                  src="/brand/qosyl-logo.jpg"
                  alt="Логотип Qosyl"
                  width={64}
                  height={64}
                />
                <strong>{config.productName}</strong>
                <p>Первый опыт начинается с понятной задачи.</p>
              </div>
              <nav aria-label="Информация о платформе">
                <Link href="/help">Помощь</Link>
                <Link href="/terms">Условия пилота</Link>
                <Link href="/privacy">Конфиденциальность</Link>
              </nav>
              <span className="footer-note">Пилот · Казахстан · 18+</span>
            </div>
          </footer>
        </ViewerProvider>
      </body>
    </html>
  );
}
