'use client';
import { useI18n } from './locale-provider';

export function OpportunitiesHeading() {
  const { locale, t } = useI18n();
  return (
    <h1 lang={locale}>
      {t(
        'Возможности для студентов всех специальностей',
        'Барлық мамандық студенттеріне арналған мүмкіндіктер',
      )}
    </h1>
  );
}
