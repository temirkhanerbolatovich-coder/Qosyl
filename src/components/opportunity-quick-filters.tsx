'use client';
import Link from 'next/link';
import type { OpportunityFacets } from '@/contracts/content-intake';
import {
  opportunitySearchUrl,
  type OpportunityView,
  type SavedOpportunityFilters,
} from '@/lib/opportunity-saved';
import { useI18n } from './locale-provider';

/** One-tap toggles for the most common conditions; counts appear once the search has loaded. */
export function OpportunityQuickFilters({
  filters,
  view,
  facets,
}: {
  filters: SavedOpportunityFilters;
  view: OpportunityView;
  facets?: OpportunityFacets;
}) {
  const { locale, t } = useI18n();
  const chips = [
    {
      key: 'internship',
      label: t('Стажировки', 'Тағылымдамалар'),
      active: filters.category === 'internship',
      next: (on: boolean): SavedOpportunityFilters =>
        on ? omit(filters, 'category') : { ...filters, category: 'internship' },
      count: facets?.category.internship ?? (facets ? 0 : undefined),
    },
    {
      key: 'remote',
      label: t('Удалённо', 'Қашықтан'),
      active: filters.workMode === 'remote',
      next: (on: boolean): SavedOpportunityFilters =>
        on ? omit(filters, 'workMode') : { ...filters, workMode: 'remote' },
      count: facets?.workMode.remote ?? (facets ? 0 : undefined),
    },
    {
      key: 'kazakhstan',
      label: t('Принимают из Казахстана', 'Қазақстаннан қабылданады'),
      active: Boolean(filters.kazakhstanEligible),
      next: (on: boolean): SavedOpportunityFilters =>
        on ? omit(filters, 'kazakhstanEligible') : { ...filters, kazakhstanEligible: 'true' },
      count: facets?.kazakhstanEligible,
    },
  ];
  return (
    <nav
      lang={locale}
      className="opportunity-quick-filters"
      aria-label={t('Быстрые условия', 'Жылдам шарттар')}
    >
      <ul role="list" className="button-row">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              className={`button small ${chip.active ? '' : 'secondary'}`}
              href={opportunitySearchUrl(chip.next(chip.active), view)}
              scroll={false}
              aria-current={chip.active ? 'true' : undefined}
            >
              {chip.label}
              {chip.count !== undefined && <span> · {chip.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function omit(filters: SavedOpportunityFilters, key: keyof SavedOpportunityFilters) {
  const rest = { ...filters };
  delete rest[key];
  return rest;
}
