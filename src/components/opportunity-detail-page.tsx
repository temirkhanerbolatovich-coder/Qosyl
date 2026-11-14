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
import { OpportunityConditions } from './opportunity-conditions';
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
    <div className="page-shell narrow stack" lang={locale}>
      <Link href={returnTo} className="text-link">
        {t('← Вернуться к возможностям', '← Мүмкіндіктерге оралу')}
      </Link>
      <article className="panel stack opportunity-card">
        <p className="muted small-text">
          {labels[post.category]} ·{' '}
          <span lang={opportunityContentLanguage(post.language)}>{post.sourceName}</span>
        </p>
        <h1 lang={opportunityContentLanguage(post.language)}>{post.title}</h1>
        <p lang={opportunityContentLanguage(post.language)}>{post.summary}</p>
        {post.geography && <p lang={opportunityContentLanguage(post.language)}>{post.geography}</p>}
        <OpportunityConditions post={post} />
        <p>
          {post.deadline
            ? t(
                `Приём заявок до ${date(post.deadline, true, locale)} (время Казахстана)`,
                `Өтінім қабылдау мерзімі: ${date(post.deadline, true, locale)} (Қазақстан уақыты)`,
              )
            : t(
                'Срок подачи уточняйте у организатора.',
                'Өтінім беру мерзімін ұйымдастырушыдан нақтылаңыз.',
              )}
        </p>
        {post.eventDate && (
          <p>
            {t('Событие:', 'Іс-шара:')} {date(post.eventDate, true, locale)}
          </p>
        )}
        <p className="muted small-text">
          {post.publishedAt
            ? t(
                `Опубликовано ${date(post.publishedAt, false, locale)}`,
                `Жарияланған күні: ${date(post.publishedAt, false, locale)}`,
              )
            : t('Дата публикации не указана.', 'Жарияланған күні көрсетілмеген.')}
        </p>
        <p className="muted small-text">
          {t(
            'Условия и подачу заявки проверяйте у организатора.',
            'Шарттар мен өтінім беруді ұйымдастырушыдан нақтылаңыз.',
          )}
        </p>
        <div className="button-row">
          <a className="button" href={post.url} target="_blank" rel="noopener noreferrer">
            {t('Перейти к организатору', 'Ұйымдастырушыға өту')}
          </a>
          {saved.signedIn && <OpportunityFavoriteButton itemId={post.id} saved={saved} />}
        </div>
        {saved.signedIn && <OpportunitySavedFeedback saved={saved} />}
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
