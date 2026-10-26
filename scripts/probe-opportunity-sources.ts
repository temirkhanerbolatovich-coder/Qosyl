import { mkdir, writeFile } from 'node:fs/promises';
import { fetchFeed } from '../src/server/content/fetch-feed';
import { parseHtmlOpportunities } from '../src/lib/content-html';

// Read-only check through the same bounded transport and parser as the worker.
const urls = [
  'https://www.kaznaru.edu.kz/ru/news',
  'https://www.kaznaru.edu.kz/ru/anons',
  'https://abai.university/ru/news',
  'https://iuth.edu.kz/ru/',
  'https://kaznai.kz/ru/',
  'https://www.gov.kz/org/sci/press/news/details/1182110?lang=ru',
];

async function main() {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const host = new URL(url).hostname;
        const response = await fetchFeed(url, host, { format: 'html' });
        const parsed = parseHtmlOpportunities(response.body, url, host);
        return {
          url,
          status: response.status,
          bytes: Buffer.byteLength(response.body),
          count: parsed.items.length,
          examples: parsed.items.slice(0, 8).map((item) => ({
            title: item.title,
            url: item.canonicalUrl,
            category: item.category,
          })),
        };
      } catch (error) {
        return { url, error: error instanceof Error ? error.message : 'SOURCE_CHECK_FAILED' };
      }
    }),
  );
  const evidence = { checkedAt: new Date().toISOString(), results };
  await mkdir('outputs/opportunities', { recursive: true });
  await writeFile(
    'outputs/opportunities/source-probes.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
}
void main();
