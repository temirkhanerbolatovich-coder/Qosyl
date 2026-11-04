'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from './locale-provider';

export function SkipLink() {
  const { locale, t } = useI18n();
  return (
    <a className="skip-link" lang={locale} href="#main-content">
      {t('Перейти к содержимому', 'Мазмұнға өту')}
    </a>
  );
}
export function LocaleNotice() {
  const { locale, persistenceError, t } = useI18n();
  return (
    <>
      {locale === 'kk' && (
        <p className="locale-notice container" lang="kk">
          Қазақша аударма ішінара: басты бет, каталог, мүмкіндіктер, кіру, профиль, кабинеттер мен
          жұмыс аймағы аударылған. Кейбір бөлімдер, үлгілер, сервер хабарлары мен хаттар әзірше
          орысша. Жобалар мен дереккөз мәтіндері түпнұсқа тілінде сақталады.
        </p>
      )}
      {persistenceError && (
        <p className="locale-notice container" lang={locale} role="status">
          {t(
            'Язык изменён для этой страницы, но браузер не сохранил выбор. После перезагрузки выберите его снова.',
            'Бұл бетте тіл өзгерді, бірақ браузер таңдауды сақтамады. Бетті қайта жүктегеннен кейін қайта таңдаңыз.',
          )}
        </p>
      )}
    </>
  );
}
export function PilotBanner() {
  const { locale, t } = useI18n();
  return (
    <div className="pilot-banner" lang={locale}>
      <span className="pilot-dot" />
      {t('Локальный пилот 18+', 'Жергілікті пилот 18+')}
      <span className="banner-separator">/</span>
      {t(
        'Примеры отмечены «ДЕМО». Оплата — вне платформы.',
        'Мысалдар «ДЕМО» деп белгіленген. Төлем платформадан тыс жүргізіледі.',
      )}
    </div>
  );
}
export function SiteFooter({ productName }: { productName: string }) {
  const { locale, t } = useI18n();
  return (
    <footer className="site-footer" lang={locale}>
      <div className="container footer-inner">
        <div>
          <Image
            className="footer-logo"
            src="/brand/qosyl-logo.jpg"
            alt={t('Логотип Qosyl', 'Qosyl логотипі')}
            width={64}
            height={64}
          />
          <strong>{productName}</strong>
          <p>
            {t(
              'Первый опыт начинается с понятной задачи.',
              'Алғашқы тәжірибе түсінікті тапсырмадан басталады.',
            )}
          </p>
        </div>
        <nav aria-label={t('Информация о платформе', 'Платформа туралы ақпарат')}>
          <Link href="/help">{t('Помощь', 'Көмек')}</Link>
          <Link href="/terms">{t('Условия пилота', 'Пилот шарттары')}</Link>
          <Link href="/privacy">{t('Конфиденциальность', 'Құпиялық')}</Link>
        </nav>
      </div>
    </footer>
  );
}
