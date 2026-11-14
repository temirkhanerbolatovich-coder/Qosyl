'use client';
import Link from 'next/link';
import { useI18n } from '@/components/locale-provider';

export default function OpportunityNotFound() {
  const { locale, t } = useI18n();
  return (
    <div className="page-shell narrow" lang={locale}>
      <div className="panel stack">
        <h1>{t('Возможность недоступна', 'Мүмкіндік қолжетімсіз')}</h1>
        <p>
          {t(
            'Публикация снята, срок актуальности истёк или ссылка неверна.',
            'Жарияланым алынып тасталды, өзектілік мерзімі өтті немесе сілтеме қате.',
          )}
        </p>
        <Link className="button" href="/opportunities">
          {t('К поиску возможностей', 'Мүмкіндіктерді іздеуге өту')}
        </Link>
      </div>
    </div>
  );
}
