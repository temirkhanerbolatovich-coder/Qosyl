'use client';

import type { PublicContentPost } from '@/contracts/content-intake';
import {
  localizedOpportunityConditionLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { useI18n } from './locale-provider';

/**
 * The four conditions of an opportunity: the editor's wording when there is one, otherwise the
 * confirmed filter value. Both missing means unknown, which is never shown as "no" or zero.
 */
export function opportunityConditionEntries(
  post: PublicContentPost,
  locale: 'ru' | 'kk',
  t: (ru: string, kk: string) => string,
) {
  const labels = localizedOpportunityConditionLabels(locale);
  // A main format plus the extra ones it also offers: "Remotely or in the office".
  const formats = [post.workMode, ...(post.alsoWorkModes ?? [])]
    .filter((mode): mode is NonNullable<typeof mode> => Boolean(mode))
    .map((mode) => labels.workMode[mode]);
  return [
    {
      label: t('Формат', 'Формат'),
      value: post.workFormat,
      fallback: formats.length ? formats.join(t(' или ', ' немесе ')) : null,
    },
    {
      label: t('Участие из Казахстана', 'Қазақстаннан қатысу'),
      value: post.kazakhstanEligibility,
      fallback:
        post.kazakhstanEligible === true
          ? t('Подтверждено', 'Расталған')
          : post.kazakhstanEligible === false
            ? t('Не предусмотрено', 'Қарастырылмаған')
            : null,
    },
    {
      label: t('Нагрузка', 'Жүктеме'),
      value: post.workload,
      fallback: post.hoursPerWeekMax
        ? t(
            `До ${post.hoursPerWeekMax} часов в неделю`,
            `Аптасына ${post.hoursPerWeekMax} сағатқа дейін`,
          )
        : null,
    },
    {
      label: t('Опыт', 'Тәжірибе'),
      value: null,
      fallback:
        post.noExperience === true
          ? t('Не требуется', 'Қажет емес')
          : post.noExperience === false
            ? t('Требуется', 'Қажет')
            : null,
    },
    {
      label: t('Оплата', 'Төлем'),
      value: post.compensation,
      fallback: post.payStatus ? labels.payStatus[post.payStatus] : null,
    },
  ];
}

export function OpportunityConditions({ post }: { post: PublicContentPost }) {
  const { locale, t } = useI18n();
  const conditions = opportunityConditionEntries(post, locale, t);
  if (
    post.category !== 'internship' &&
    conditions.every((condition) => !condition.value && !condition.fallback)
  ) {
    return null;
  }

  return (
    <dl className="opportunity-conditions">
      {conditions.map(({ label, value, fallback }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd lang={value ? opportunityContentLanguage(post.language) : undefined}>
            {value || fallback || t('Уточняйте у организатора', 'Ұйымдастырушыдан нақтылаңыз')}
          </dd>
        </div>
      ))}
    </dl>
  );
}
