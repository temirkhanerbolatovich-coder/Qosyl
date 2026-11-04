import { Opportunities } from '@/components/opportunities';
import { OpportunitiesHeading } from '@/components/opportunities-heading';
import { normalizeOpportunityFilters, opportunitySearchUrl } from '@/lib/opportunity-saved';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let filters = normalizeOpportunityFilters({});
  let error = '';
  try {
    const input: Record<string, string> = {};
    for (const key of ['q', 'category', 'specialty', 'geography']) {
      const value = params[key];
      if (Array.isArray(value)) throw Error('Repeated filter');
      if (value?.trim()) input[key] = value;
    }
    filters = normalizeOpportunityFilters(input);
  } catch {
    error = 'Фильтры в ссылке некорректны. Показаны все возможности; задайте условия заново.';
  }
  return (
    <div className="page-shell">
      <OpportunitiesHeading />
      <Opportunities
        key={opportunitySearchUrl(filters)}
        catalogue
        initialFilters={filters}
        initialError={error}
      />
    </div>
  );
}
