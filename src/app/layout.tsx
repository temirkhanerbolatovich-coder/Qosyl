import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/session';
import { config } from '@/lib/config';
import { ViewerProvider } from '@/components/platform';
import { SiteHeader } from '@/components/site-header';
import { themeBootstrap } from '@/lib/theme';
import { localeCookieName, parseLocale } from '@/lib/locale';
import { LocaleProvider } from '@/components/locale-provider';
import { LocaleNotice, PilotBanner, SiteFooter, SkipLink } from '@/components/layout-copy';
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = parseLocale((await cookies()).get(localeCookieName)?.value);
  return {
    icons: { icon: '/brand/qosyl-logo.jpg' },
    title: {
      default:
        config.productName +
        (locale === 'kk' ? ' — алғашқы нақты тәжірибе' : ' — первый реальный опыт'),
      template: '%s · ' + config.productName,
    },
    description:
      locale === 'kk'
        ? 'Студенттерге арналған нәтижесі нақты жобалар. Түсінікті шарттар, тегін өтінім және расталған тәжірибе.'
        : 'Ограниченные по результату проекты для студентов. Понятные условия, бесплатный отклик и подтверждённый опыт.',
  };
}
export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const locale = parseLocale((await cookies()).get(localeCookieName)?.value);
  const viewer = user ? { id: user.id, name: user.name, roles: user.roles, demo: user.demo } : null;
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <LocaleProvider initialLocale={locale}>
          <SkipLink />
          <ViewerProvider viewer={viewer}>
            <SiteHeader viewer={viewer} productName={config.productName} />
            {config.localMode && <PilotBanner />}
            <LocaleNotice />
            <main id="main-content" lang="ru">
              {children}
            </main>
            <SiteFooter productName={config.productName} />
          </ViewerProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
