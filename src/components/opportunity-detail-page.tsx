'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicContentPost } from '@/contracts/content-intake';
import { date } from '@/lib/labels';
import {
  localizedOpportunityCategoryLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { useI18n } from './locale-provider';
import { opportunityConditionEntries } from './opportunity-conditions';
import { useOpportunitySaved } from './opportunity-saved-state';
import { OpportunityFavoriteButton, OpportunitySavedFeedback } from './opportunity-saved-controls';

export function OpportunityDetail({
  post,
  returnTo,
  similar = [],
}: {
  post: PublicContentPost;
  returnTo: string;
  similar?: { post: PublicContentPost; reason: 'specialty' | 'category' }[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const saved = useOpportunitySaved();
  const labels = localizedOpportunityCategoryLabels(locale);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    // One timer at the expiry time; the server re-checks visibility when the page refreshes.
    const expiry = window.setTimeout(
      () => {
        if (Date.now() >= new Date(post.expiresAt).getTime()) setExpired(true);
        router.refresh();
      },
      Math.min(Math.max(0, new Date(post.expiresAt).getTime() - Date.now()), 2147483647),
    );
    return () => window.clearTimeout(expiry);
  }, [post.expiresAt, router]);
  // Deadline and event first, then the confirmed conditions; whatever is unknown is named once.
  const facts = [
    {
      label: t('Срок подачи', 'Өтінім мерзімі'),
      value: post.deadline
        ? t(
            `${date(post.deadline, true, locale)} (время Казахстана)`,
            `${date(post.deadline, true, locale)} (Қазақстан уақыты)`,
          )
        : null,
      verbatim: false,
    },
    ...(post.eventDate
      ? [
          {
            label: t('Событие', 'Іс-шара'),
            value: date(post.eventDate, true, locale),
            verbatim: false,
          },
        ]
      : []),
    ...opportunityConditionEntries(post, locale, t).map((entry) => ({
      label: entry.label,
      value: entry.value || entry.fallback,
      verbatim: Boolean(entry.value),
    })),
  ];
  const known = facts.filter((fact) => fact.value);
  const unknown = facts.filter((fact) => !fact.value);
  // "Удалённо" in the location line and again in the format would just repeat itself.
  const geographyRepeatsFormat = [post.workFormat, ...known.map((fact) => fact.value)].some(
    (value) =>
      value && post.geography && value.toLowerCase().includes(post.geography.toLowerCase()),
  );
  if (expired) {
    return (
      <div className="page-shell narrow stack" lang={locale}>
        <h1>{t('Возможность недоступна', 'Мүмкіндік қолжетімсіз')}</h1>
        <p>{t('Срок актуальности истёк.', 'Өзектілік мерзімі өтті.')}</p>
        <Link className="button secondary" href={returnTo}>
          {t('Вернуться к возможностям', 'Мүмкіндіктерге оралу')}
        </Link>
      </div>
    );
  }
  return (
    <div className="page-shell narrow stack detail-page" lang={locale}>
      <Link href={returnTo} className="text-link">
        {t('← Вернуться к возможностям', '← Мүмкіндіктерге оралу')}
      </Link>
      <article className="detail stack">
        <header className="stack">
          <p className="muted small-text">
            {labels[post.category]} ·{' '}
            <span lang={opportunityContentLanguage(post.language)}>{post.sourceName}</span>
          </p>
          <h1 lang={opportunityContentLanguage(post.language)}>{post.title}</h1>
        </header>
        {/* The facts that decide whether to apply come first; unknown ones are named once. */}
        <dl className="detail-facts">
          {known.map(({ label, value, verbatim }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd lang={verbatim ? opportunityContentLanguage(post.language) : undefined}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {unknown.length > 0 && (
          <p className="muted small-text">
            {t('Не указано: ', 'Көрсетілмеген: ')}
            {unknown.map(({ label }) => label.charAt(0).toLowerCase() + label.slice(1)).join(', ')}
            {t('. Уточняйте у организатора.', '. Ұйымдастырушыдан нақтылаңыз.')}
          </p>
        )}
        <div className="detail-actions">
          <a className="button" href={post.url} target="_blank" rel="noopener noreferrer">
            {t('Перейти к организатору', 'Ұйымдастырушыға өту')}
          </a>
          {saved.signedIn && <OpportunityFavoriteButton itemId={post.id} saved={saved} />}
        </div>
        {saved.signedIn && <OpportunitySavedFeedback saved={saved} />}
        <section className="stack" aria-labelledby="detail-description">
          <h2 id="detail-description" className="visually-hidden">
            {t('Описание', 'Сипаттама')}
          </h2>
          <p lang={opportunityContentLanguage(post.language)}>{post.summary}</p>
          {post.geography && !geographyRepeatsFormat && (
            <p lang={opportunityContentLanguage(post.language)}>{post.geography}</p>
          )}
        </section>
        <p className="muted small-text">
          {post.publishedAt
            ? t(
                `Опубликовано ${date(post.publishedAt, false, locale)}. `,
                `Жарияланған күні: ${date(post.publishedAt, false, locale)}. `,
              )
            : t('Дата публикации не указана. ', 'Жарияланған күні көрсетілмеген. ')}
          {t(
            'Условия и подачу заявки проверяйте у организатора.',
            'Шарттар мен өтінім беруді ұйымдастырушыдан нақтылаңыз.',
          )}
        </p>
      </article>
      {similar.length > 0 && (
        <section className="stack" aria-labelledby="similar-opportunities">
          <h2 id="similar-opportunities">{t('Похожие возможности', 'Ұқсас мүмкіндіктер')}</h2>
          <ul role="list" className="opportunity-similar">
            {similar.map(({ post: other, reason }) => (
              <li key={other.id} className="panel stack">
                <p className="muted small-text">
                  {reason === 'specialty'
                    ? t('То же направление', 'Сол бағыт')
                    : t('Тот же тип', 'Сол түрі')}
                  {' · '}
                  {labels[other.category]}
                </p>
                <Link
                  className="text-link"
                  lang={opportunityContentLanguage(other.language)}
                  href={`/opportunities/${encodeURIComponent(other.id)}?from=${encodeURIComponent(returnTo.split('#')[0])}`}
                >
                  {other.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
