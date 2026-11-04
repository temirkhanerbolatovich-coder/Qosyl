import 'dotenv/config';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import {
  mutateContentIntake,
  storeContentItem,
  queryContentIntake,
} from '../src/server/content/service';
import { runContentIntake } from '../src/server/content/worker';
import { publicContentQueryInput } from '../src/lib/content-validation';
import { normalizeContentItem, type ContentCategory } from '../src/lib/content-feed';
import { localDemoSettings } from './local-demo-config.mjs';
import { specialtyLabels } from '../src/lib/opportunity-search';

import { opportunitySources as sources } from './opportunity-sources';

async function main() {
  localDemoSettings(process.env);
  if (!process.argv.includes('--collect'))
    throw Error(
      'Use --collect to explicitly enable these public sources in the local closed queue.',
    );
  const accounts = JSON.parse(await readFile('.local/demo-accounts.json', 'utf8'));
  const admin = await db.user.findUniqueOrThrow({ where: { email: accounts.admin } });
  await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
  const results = [];
  for (const input of sources) {
    let source = await db.contentSource.findFirst({
      where: { allowedHost: input.allowedHost, feedUrl: input.feedUrl },
    });
    if (!source) {
      const created = await mutateContentIntake(
        {
          action: 'createSource',
          ...input,
          enabled: true,
          maxItems: 50,
          intervalMinutes: 360,
          rightsNote:
            'Публичные страницы или опубликованный RSS. Только ссылка и краткий фрагмент в закрытой очереди; право повторной публикации и условия участия проверяет редактор. Не заявляем партнёрство или доступность всех программ студентам.',
        },
        admin,
      );
      if (!('sourceId' in created)) throw Error('Source not created');
      source = await db.contentSource.findUniqueOrThrow({ where: { id: created.sourceId } });
    }
    const result = await runContentIntake(db, { sourceId: source.id });
    const items = await db.contentItem.findMany({
      where: { sourceId: source.id },
      include: { revisions: { orderBy: { number: 'desc' }, take: 1 } },
    });
    let duplicateCheck = 'not_checked';
    if (items[0]?.revisions[0]) {
      const r = items[0].revisions[0];
      const normalized = normalizeContentItem(
        {
          url: r.canonicalUrl!,
          title: r.title,
          summary: r.summary,
          category: r.category as ContentCategory,
          language: r.language,
          geography: r.geography,
          publishedAt: r.publishedAt,
          publishedAtRaw: r.publishedAtRaw,
          deadline: r.deadline,
          eventDate: r.eventDate,
          externalId: items[0].externalId,
        },
        source.feedUrl!,
        source.allowedHost,
      );
      duplicateCheck = (await db.$transaction((tx) => storeContentItem(tx, source!.id, normalized)))
        .kind;
    }
    results.push({
      source: input.name,
      url: input.feedUrl,
      ...result,
      count: items.length,
      duplicateCheck,
      examples: items.slice(0, 5).map((i) => ({
        title: i.revisions[0]?.title,
        url: i.canonicalUrl,
        category: i.revisions[0]?.category,
        status: i.status,
      })),
      regionalExamples: items
        .filter((i) =>
          /semey|atyrau|pavlodar|otyrar|шымкент|семей/i.test(i.revisions[0]?.title || ''),
        )
        .slice(0, 5)
        .map((i) => ({ title: i.revisions[0].title, url: i.canonicalUrl })),
    });
  }
  const search = [];
  for (const specialty of Object.keys(specialtyLabels) as (keyof typeof specialtyLabels)[]) {
    const result = await queryContentIntake(
      admin,
      1,
      undefined,
      publicContentQueryInput.parse({ specialty }),
    );
    search.push({
      specialty,
      total: result.total,
      examples: result.items.slice(0, 2).map((i) => i.revisions[0]?.title),
    });
  }
  const evidence = {
    checkedAt: new Date().toISOString(),
    mode: 'real_sources_closed_review_queue',
    results,
    search,
    publishedByThisRun: 0,
    limitations: [
      'Eligibility and deadlines require review',
      'No automatic public approval',
      'Only configured sources; not exhaustive',
    ],
  };
  await mkdir('outputs/opportunities', { recursive: true });
  await writeFile(
    'outputs/opportunities/live-collection.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence));
}
main()
  .catch(() => {
    console.error('Opportunity collection failed; inspect source run status without credentials.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
