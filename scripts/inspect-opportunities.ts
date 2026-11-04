import { mkdir, writeFile } from 'node:fs/promises';
import { fetchFeed, ContentFetchError } from '../src/server/content/fetch-feed';
import { inspectOpportunityHtml } from '../src/lib/opportunity-detail';
import { ContentFeedError } from '../src/lib/content-feed';
import { opportunitySources } from './opportunity-sources';

async function main() {
  const urls = [...new Set(process.argv.slice(2))];
  if (!urls.length || urls.length > 12)
    throw Error('Pass 1–12 explicit HTTPS article URLs from configured source hosts.');
  const hosts = new Set(opportunitySources.map((source) => source.allowedHost));
  // Validate the entire batch before making any requests.
  for (const url of urls) {
    const parsed = new URL(url);
    if (
      !hosts.has(parsed.hostname) ||
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      throw Error('Only configured HTTPS source hosts are allowed.');
  }
  const results = [];
  for (const url of urls) {
    try {
      const host = new URL(url).hostname;
      const response = await fetchFeed(url, host, { format: 'html' });
      results.push({
        fetchStatus: 'succeeded',
        ...inspectOpportunityHtml(response.body, url, host, new Date()),
      });
    } catch (error) {
      results.push({
        url,
        fetchStatus: 'failed',
        error:
          error instanceof ContentFetchError || error instanceof ContentFeedError
            ? error.code
            : 'DETAIL_INSPECTION_FAILED',
      });
    }
  }
  await mkdir('outputs/opportunities', { recursive: true });
  const file =
    'outputs/opportunities/detail-inspection-' +
    new Date().toISOString().replace(/[:.]/g, '-') +
    '.json';
  await writeFile(
    file,
    JSON.stringify({ mode: 'read_only_editorial_evidence', results }, null, 2) + '\n',
  );
  console.log(JSON.stringify({ file, results }, null, 2));
  if (results.some((result) => result.fetchStatus === 'failed')) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof Error && /Pass 1|Only configured/.test(error.message)
      ? error.message
      : 'Detail inspection failed: check arguments and local output permissions.',
  );
  process.exitCode = 1;
});
