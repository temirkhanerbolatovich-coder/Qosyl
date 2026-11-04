import { mkdir, writeFile } from 'node:fs/promises';
import { fetchFeed, ContentFetchError } from '../src/server/content/fetch-feed';
import { parseHtmlOpportunities } from '../src/lib/content-html';
import { parseFeed, ContentFeedError } from '../src/lib/content-feed';
import { specialtyLabels, specialtyTerms } from '../src/lib/opportunity-search';
import { opportunitySources } from './opportunity-sources';

// Read-only: no database, no source scheduling changes and no automatic approval.
async function main() {
  const results = [];
  for (const source of opportunitySources) {
    try {
      const response = await fetchFeed(source.feedUrl, source.allowedHost, {
        format: source.type === 'rss' ? 'xml' : 'html',
      });
      const parse = source.type === 'rss' ? parseFeed : parseHtmlOpportunities;
      const parsed = parse(response.body, source.feedUrl, source.allowedHost, 50);
      const repeated = parse(response.body, source.feedUrl, source.allowedHost, 50);
      results.push({
        source: source.name,
        url: source.feedUrl,
        status: 'parsed',
        bytes: Buffer.byteLength(response.body),
        count: parsed.items.length,
        stableReplay: JSON.stringify(parsed) === JSON.stringify(repeated),
        uniqueUrls: new Set(parsed.items.map((item) => item.canonicalUrl)).size,
        items: parsed.items.map((item) => ({
          title: item.title,
          url: item.canonicalUrl,
          category: item.category,
          publishedAt: item.publishedAt,
          publishedAtRaw: item.publishedAtRaw,
          deadline: item.deadline,
          geography: item.geography,
          specialties: Object.keys(specialtyLabels).filter((key) =>
            specialtyTerms[key as keyof typeof specialtyLabels].some((term) =>
              `${item.title} ${item.summary} ${item.geography}`
                .toLowerCase()
                .includes(term.toLowerCase()),
            ),
          ),
        })),
      });
    } catch (error) {
      results.push({
        source: source.name,
        url: source.feedUrl,
        status: 'failed',
        error:
          error instanceof ContentFetchError || error instanceof ContentFeedError
            ? error.code
            : 'SOURCE_CHECK_FAILED',
      });
    }
  }
  const items = results.flatMap((result) => result.items ?? []);
  const coverage = Object.entries(specialtyLabels).map(([key, label]) => {
    const matches = items.filter((item) => item.specialties.includes(key));
    return {
      specialty: key,
      label,
      textMatches: matches.length,
      categories: [...new Set(matches.map((item) => item.category))],
      knownDeadlines: matches.filter((item) => item.deadline).length,
      examples: matches
        .slice(0, 3)
        .map((item) => ({ title: item.title, url: item.url, category: item.category })),
    };
  });
  const evidence = {
    checkedAt: new Date().toISOString(),
    mode: 'read_only_live_source_audit',
    results,
    coverage,
    limitations: [
      'Text matches are not eligibility or availability confirmation.',
      'Replay checks parsing determinism, not a second network fetch or database idempotency.',
      'Unknown deadlines and geography remain unknown. No public approval.',
    ],
  };
  await mkdir('outputs/opportunities', { recursive: true });
  await writeFile(
    'outputs/opportunities/source-audit.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        checkedAt: evidence.checkedAt,
        sources: results.map((result) => ({
          source: result.source,
          url: result.url,
          status: result.status,
          count: result.count,
          error: result.error,
          stableReplay: result.stableReplay,
          uniqueUrls: result.uniqueUrls,
        })),
        coverage,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
}
main().catch(() => {
  console.error('Source audit failed.');
  process.exitCode = 1;
});
