import { Opportunities } from '@/components/opportunities';
import { OpportunitiesHeading } from '@/components/opportunities-heading';
import { normalizeOpportunityFilters, opportunitySearchUrl } from '@/lib/opportunity-saved';
import { opportunityHours, opportunitySort, opportunityWindow } from '@/lib/content-validation';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsedSort = opportunitySort.safeParse(params.sort);
  const requestedSort = parsedSort.success ? parsedSort.data : 'newest';
  const added = opportunityWindow.safeParse(params.added).data;
  const deadline = opportunityWindow.safeParse(params.deadline).data;
  const hours = opportunityHours.safeParse(params.hours).data;
  const noExperience = params.noExperience === 'true' ? ('true' as const) : undefined;
  const page =
    typeof params.page === 'string' && /^\d{1,5}$/.test(params.page)
      ? Math.min(10000, Math.max(1, Number(params.page)))
      : 1;
  let filters = normalizeOpportunityFilters({});
  let error = '';
  try {
    const input: Record<string, string> = {};
    for (const key of [
      'q',
      'category',
      'specialty',
      'geography',
      'workMode',
      'payStatus',
      'kazakhstanEligible',
    ]) {
      const value = params[key];
      if (Array.isArray(value)) throw Error('Repeated filter');
      if (value?.trim()) input[key] = value;
    }
    filters = normalizeOpportunityFilters(input);
  } catch {
    error = 'Фильтры в ссылке некорректны. Показаны все возможности; задайте условия заново.';
  }
  // Relevance only makes sense for a text query.
  const sort = requestedSort === 'relevance' && !filters.q ? 'newest' : requestedSort;
  return (
    <div className="page-shell">
      <OpportunitiesHeading />
      <Opportunities
        key={opportunitySearchUrl(filters, { page, sort, added, deadline, hours, noExperience })}
        catalogue
        initialPage={page}
        sort={sort}
        added={added}
        deadline={deadline}
        hours={hours}
        noExperience={noExperience}
        initialFilters={filters}
        initialError={error}
      />
    </div>
  );
}
