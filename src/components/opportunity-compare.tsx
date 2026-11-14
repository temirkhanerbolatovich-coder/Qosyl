'use client';
import type { PublicContentPost } from '@/contracts/content-intake';
import { date } from '@/lib/labels';
import {
  localizedOpportunityCategoryLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { useI18n } from './locale-provider';
import { opportunityConditionEntries } from './opportunity-conditions';

/** Side-by-side view of 2–3 saved opportunities of one type. Unknown values stay "to clarify". */
export function OpportunityCompare({
  posts,
  onClose,
}: {
  posts: PublicContentPost[];
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const categoryLabels = localizedOpportunityCategoryLabels(locale);
  const unknown = t('Уточнить у организатора', 'Ұйымдастырушыдан нақтылау');
  const conditionRows = opportunityConditionEntries(posts[0], locale, t).map((entry, index) => ({
    label: entry.label,
    cells: posts.map((post) => {
      const condition = opportunityConditionEntries(post, locale, t)[index];
      return { text: condition.value || condition.fallback, verbatim: Boolean(condition.value) };
    }),
  }));
  const rows = [
    {
      label: t('Организатор', 'Ұйымдастырушы'),
      cells: posts.map((post) => ({ text: post.sourceName, verbatim: true })),
    },
    ...conditionRows,
    {
      label: t('Срок подачи', 'Өтінім мерзімі'),
      cells: posts.map((post) => ({
        text: post.deadline ? date(post.deadline, true, locale) : null,
        verbatim: false,
      })),
    },
  ];
  return (
    <section
      lang={locale}
      className="panel stack"
      aria-labelledby="compare-title"
      id="opportunity-compare"
    >
      <div className="button-row">
        <h2 id="compare-title">{t('Сравнение возможностей', 'Мүмкіндіктерді салыстыру')}</h2>
        <button type="button" className="button secondary small" onClick={onClose}>
          {t('Закрыть сравнение', 'Салыстыруды жабу')}
        </button>
      </div>
      <p className="muted small-text">
        {t(
          `Тип: ${categoryLabels[posts[0].category]}. Пустые значения означают, что условие не подтверждено, а не что его нет.`,
          `Түрі: ${categoryLabels[posts[0].category]}. Бос мәндер шарттың расталмағанын білдіреді, жоқ дегенді емес.`,
        )}
      </p>
      <div className="opportunity-compare-scroll">
        <table className="opportunity-compare" role="table">
          <caption className="visually-hidden">
            {t('Сравнение выбранных возможностей', 'Таңдалған мүмкіндіктерді салыстыру')}
          </caption>
          <thead>
            <tr role="row">
              <th scope="col" role="columnheader">
                <span className="visually-hidden">{t('Условие', 'Шарт')}</span>
              </th>
              {posts.map((post) => (
                <th
                  key={post.id}
                  scope="col"
                  role="columnheader"
                  lang={opportunityContentLanguage(post.language)}
                >
                  {post.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} role="row">
                <th scope="row" role="rowheader">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={posts[index].id}
                    role="cell"
                    data-label={posts[index].title}
                    lang={
                      cell.verbatim ? opportunityContentLanguage(posts[index].language) : undefined
                    }
                  >
                    {cell.text || <span className="muted">{unknown}</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr role="row">
              <th scope="row" role="rowheader">
                {t('Источник', 'Дереккөз')}
              </th>
              {posts.map((post) => (
                <td key={post.id} role="cell" data-label={post.title}>
                  <a href={post.url} target="_blank" rel="noopener noreferrer">
                    {t('К организатору →', 'Ұйымдастырушыға өту →')}
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
