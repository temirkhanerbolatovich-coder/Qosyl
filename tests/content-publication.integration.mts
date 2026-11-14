import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { db } from '../src/lib/db';
import {
  mutateContentIntake,
  queryContentDetail,
  queryContentIntake,
} from '../src/server/content/service';
import {
  queryPublicContent,
  queryPublicContentDetail,
  querySimilarOpportunities,
} from '../src/server/content/public';
import { runContentIntake } from '../src/server/content/worker';
import { AppError } from '../src/lib/permissions';
import { contentDetailDataSchema, publicContentDataSchema } from '../src/contracts/content-intake';
import { publicContentQueryInput } from '../src/lib/content-validation';

const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  target.toString() !== new URL(process.env.DATABASE_URL ?? 'invalid:').toString()
)
  throw new Error('Explicit isolated E2E database required.');
after(() => db.$disconnect());
const reason = 'Оригинал, даты и условия проверены в синтетическом сценарии.';
const future = () => new Date(Date.now() + 86400000).toISOString();
const status = (code: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.status, code);
  return true;
};
test('editorial lifecycle and public isolation', async (t) => {
  const original = await db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
  const admin = await db.user.create({
    data: {
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
      name: 'Editorial test',
      roles: ['admin'],
      emailVerified: true,
    },
  });
  const student = await db.user.create({
    data: {
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
      name: 'Editorial student',
      roles: ['student'],
    },
  });
  const source = await db.contentSource.create({
    data: {
      name: `Editorial fixture ${randomUUID()}`,
      type: 'manual',
      allowedHost: 'example.org',
      rightsNote: 'Synthetic private tests; no real source fetched.',
      enabled: true,
    },
  });
  async function create(overrides: Record<string, unknown> = {}) {
    const result = await mutateContentIntake(
      {
        action: 'addManualContent',
        sourceId: source.id,
        url: `https://example.org/${randomUUID()}`,
        title: 'Student opportunity synthetic test',
        summary: 'A short synthetic summary.',
        category: 'event',
        language: 'en',
        ...overrides,
      },
      admin,
    );
    assert.ok(result && 'itemId' in result);
    return result.itemId;
  }
  async function review(id: string, decision: string, extra: Record<string, unknown> = {}) {
    const item = await db.contentItem.findUniqueOrThrow({
      where: { id },
      include: { revisions: { orderBy: { number: 'desc' }, take: 1 } },
    });
    return mutateContentIntake(
      {
        action: 'reviewContent',
        itemId: id,
        expectedRevisionId: item.revisions[0].id,
        expectedUpdatedAt: item.updatedAt.toISOString(),
        decision,
        reason,
        ...(decision === 'publish' ? { expiresAt: future() } : {}),
        ...extra,
      },
      admin,
    );
  }
  const posts = async () =>
    publicContentDataSchema.parse(JSON.parse(JSON.stringify(await queryPublicContent()))).posts;
  try {
    await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
    await t.test('public totals and deadline order stay consistent across pages', async () => {
      const title = `Pagination fixture ${randomUUID()}`;
      const sortedIds = [];
      for (const hours of [12, 8, 4, 3, 2, 1, null]) {
        const id = await create({
          title,
          ...(hours ? { deadline: new Date(Date.now() + hours * 3600000).toISOString() } : {}),
        });
        await review(id, 'publish');
        sortedIds.push(id);
      }
      const deadlineOrder = [...sortedIds.slice(0, 6).reverse(), sortedIds[6]];
      const query = publicContentQueryInput.parse({ q: title, sort: 'deadline' });
      const first = await queryPublicContent(6, query);
      assert.equal(first.total, 7);
      assert.deepEqual(
        first.posts.map((post) => post.id),
        deadlineOrder.slice(0, 6),
      );
      const second = await queryPublicContent(6, { ...query, page: 2 });
      assert.equal(second.total, 7);
      assert.deepEqual(
        second.posts.map((post) => post.id),
        deadlineOrder.slice(6),
      );

      await review(sortedIds[0], 'withdraw');
      assert.deepEqual(await queryPublicContent(6, { ...query, page: 2 }), {
        posts: [],
        total: 6,
      });
      await mutateContentIntake(
        { action: 'setSourceEnabled', sourceId: source.id, enabled: false },
        admin,
      );
      assert.deepEqual(await queryPublicContent(6, query), { posts: [], total: 0 });
      await mutateContentIntake(
        { action: 'setSourceEnabled', sourceId: source.id, enabled: true },
        admin,
      );
      for (const id of sortedIds.slice(1)) await review(id, 'archive');
    });
    await t.test('detail exposes only a current approved and available revision', async () => {
      const id = await create();
      assert.equal(await queryPublicContentDetail(id), null);
      await review(id, 'publish');
      const published = await queryPublicContentDetail(id);
      assert.equal(published?.id, id);
      assert.ok(published && !('rightsNote' in published) && !('contentHash' in published));
      await mutateContentIntake(
        { action: 'setSourceEnabled', sourceId: source.id, enabled: false },
        admin,
      );
      assert.equal(await queryPublicContentDetail(id), null);
      await mutateContentIntake(
        { action: 'setSourceEnabled', sourceId: source.id, enabled: true },
        admin,
      );
      await mutateContentIntake({ action: 'setModuleEnabled', enabled: false }, admin);
      assert.equal(await queryPublicContentDetail(id), null);
      await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
      await db.contentItem.update({
        where: { id },
        data: { approvedAt: new Date(Date.now() - 5000), expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal(await queryPublicContentDetail(id), null);
      assert.equal(await queryPublicContentDetail('nonexistent'), null);
      await review(id, 'archive');
      assert.equal(await queryPublicContentDetail(id), null);
    });
    await t.test('structured filters use only confirmed approved values', async () => {
      // Catalogue synonyms and relevance order; the geography tag isolates these three items.
      const wordTag = `synonym${randomUUID().replaceAll('-', '')}`;
      const kazakhWord = await create({
        title: `${wordTag} тағылымдама`,
        geography: wordTag,
        category: 'internship',
      });
      const russianWord = await create({
        title: `${wordTag} стажировка`,
        geography: wordTag,
        category: 'internship',
      });
      const inSummary = await create({
        title: `${wordTag} отдельное описание`,
        summary: 'Практика в команде.',
        geography: wordTag,
        category: 'internship',
      });
      for (const id of [kazakhWord, russianWord, inSummary]) await review(id, 'publish');
      const bySynonym = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          q: 'стажировка',
          geography: wordTag,
          sort: 'relevance',
        }),
      );
      assert.deepEqual(
        new Set(bySynonym.posts.map((post) => post.id)),
        new Set([kazakhWord, russianWord, inSummary]),
      );
      // Title matches (the word itself or a synonym) outrank a summary-only match.
      assert.equal(bySynonym.posts.at(-1)?.id, inSummary);
      assert.equal(
        (
          await queryPublicContent(
            6,
            publicContentQueryInput.parse({ q: 'хакатон', geography: wordTag }),
          )
        ).total,
        0,
      );
      for (const id of [kazakhWord, russianWord, inSummary]) await review(id, 'archive');
      // Decision fields: extra formats count as formats, hours and experience need confirmation.
      const decisionTag = `decision${randomUUID().replaceAll('-', '')}`;
      const flexible = await create({
        title: `${decisionTag} flexible`,
        geography: decisionTag,
        category: 'internship',
        workMode: 'remote',
        alsoWorkModes: ['hybrid'],
        hoursPerWeekMax: 20,
        noExperience: true,
      });
      const office = await create({
        title: `${decisionTag} office`,
        geography: decisionTag,
        category: 'internship',
        workMode: 'in_person',
        hoursPerWeekMax: 30,
        noExperience: false,
      });
      const unconfirmed = await create({
        title: `${decisionTag} unconfirmed`,
        geography: decisionTag,
        category: 'internship',
      });
      for (const id of [flexible, office, unconfirmed]) await review(id, 'publish');
      const decided = async (extra: Record<string, unknown>) =>
        new Set(
          (
            await queryPublicContent(
              6,
              publicContentQueryInput.parse({ geography: decisionTag, ...extra }),
            )
          ).posts.map((post) => post.id),
        );
      assert.deepEqual(await decided({ workMode: 'remote' }), new Set([flexible]));
      assert.deepEqual(await decided({ workMode: 'hybrid' }), new Set([flexible]));
      assert.deepEqual(await decided({ workMode: 'in_person' }), new Set([office]));
      assert.deepEqual(await decided({ hours: '20' }), new Set([flexible]));
      assert.deepEqual(await decided({ hours: '30' }), new Set([flexible, office]));
      assert.deepEqual(await decided({ hours: '10' }), new Set());
      assert.deepEqual(await decided({ noExperience: 'true' }), new Set([flexible]));
      const decisionCounts = await queryPublicContent(
        6,
        publicContentQueryInput.parse({ geography: decisionTag, facets: 'true' }),
      );
      assert.deepEqual(decisionCounts.facets?.workMode, { remote: 1, hybrid: 1, in_person: 1 });
      const decisionNone = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          geography: decisionTag,
          workMode: 'in_person',
          hours: '10',
          facets: 'true',
        }),
      );
      assert.equal(decisionNone.total, 0);
      assert.equal(decisionNone.facets?.relaxed.hours, 1);
      assert.equal(decisionNone.facets?.relaxed.workMode, 0);
      const detail = (await queryPublicContentDetail(flexible))!;
      assert.deepEqual(
        [detail.workMode, detail.alsoWorkModes, detail.hoursPerWeekMax, detail.noExperience],
        ['remote', ['hybrid'], 20, true],
      );
      for (const id of [flexible, office, unconfirmed]) await review(id, 'archive');
      // Similar opportunities: same type only, same direction first, never itself or hidden items.
      const similarTag = `similar${randomUUID().replaceAll('-', '')}`;
      const mk = (title: string, category = 'training') => create({ title, category });
      const base = await mk(`${similarTag} педагогика курс`);
      const sameDirection = await mk(`${similarTag} педагог практикум`);
      const plain = await mk(`${similarTag} обычный курс`);
      const otherType = await mk(`${similarTag} педагог стажировка`, 'internship');
      const hidden = await mk(`${similarTag} педагог снятый`);
      const unclassified = await mk(`${similarTag} без типа`, 'other');
      for (const id of [base, sameDirection, plain, otherType, hidden, unclassified])
        await review(id, 'publish');
      await review(hidden, 'withdraw');
      const similar = await querySimilarOpportunities(base);
      const similarIds = similar.map((item) => item.post.id);
      assert.ok(similar.length <= 3);
      assert.ok(!similarIds.includes(base) && !similarIds.includes(otherType));
      assert.ok(!similarIds.includes(hidden));
      assert.ok(similar.every((item) => item.post.category === 'training'));
      assert.equal(similarIds[0], sameDirection);
      assert.equal(similar[0].reason, 'specialty');
      assert.ok(similarIds.includes(plain) || similar.length === 3);
      assert.deepEqual(await querySimilarOpportunities(unclassified), []);
      assert.deepEqual(await querySimilarOpportunities('no-such-item'), []);
      for (const id of [base, sameDirection, plain, otherType, unclassified])
        await review(id, 'archive');
      // Time slices: a deadline window needs a confirmed date; "added" uses the Qosyl approval time.
      const windowTag = `window${randomUUID().replaceAll('-', '')}`;
      const day = 86400000;
      const soon = await create({
        title: `${windowTag} soon`,
        geography: windowTag,
        deadline: new Date(Date.now() + 2 * day).toISOString(),
      });
      const later = await create({
        title: `${windowTag} later`,
        geography: windowTag,
        deadline: new Date(Date.now() + 20 * day).toISOString(),
      });
      const undated = await create({ title: `${windowTag} undated`, geography: windowTag });
      for (const id of [soon, later, undated]) await review(id, 'publish');
      await db.contentItem.update({
        where: { id: later },
        data: { approvedAt: new Date(Date.now() - 10 * day) },
      });
      const idsFor = async (extra: Record<string, unknown>) =>
        new Set(
          (
            await queryPublicContent(
              6,
              publicContentQueryInput.parse({ geography: windowTag, ...extra }),
            )
          ).posts.map((post) => post.id),
        );
      assert.deepEqual(await idsFor({ deadline: '7' }), new Set([soon]));
      assert.deepEqual(await idsFor({ deadline: '30' }), new Set([soon, later]));
      assert.deepEqual(await idsFor({ added: '7' }), new Set([soon, undated]));
      assert.deepEqual(await idsFor({ added: '30' }), new Set([soon, later, undated]));
      const none = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          geography: windowTag,
          added: '7',
          deadline: '30',
          facets: 'true',
        }),
      );
      assert.deepEqual(new Set(none.posts.map((post) => post.id)), new Set([soon]));
      const nothing = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          geography: windowTag,
          category: 'grant',
          deadline: '7',
          facets: 'true',
        }),
      );
      assert.equal(nothing.total, 0);
      assert.equal(nothing.facets?.relaxed.category, 1);
      assert.equal(nothing.facets?.relaxed.deadline, 0);
      for (const id of [soon, later, undated]) await review(id, 'archive');
      const tag = `statusfilter${randomUUID()}`;
      const confirmed = await create({
        title: `${tag} confirmed internship`,
        category: 'internship',
        workMode: 'remote',
        payStatus: 'paid',
        kazakhstanEligible: true,
      });
      const unknown = await create({
        title: `${tag} unknown internship`,
        category: 'internship',
        workFormat: 'Удалённо',
        compensation: 'Оплата есть',
        kazakhstanEligibility: 'Принимают из Казахстана',
      });
      const contrary = await create({
        title: `${tag} not eligible internship`,
        category: 'internship',
        workMode: 'remote',
        payStatus: 'unpaid',
        kazakhstanEligible: false,
      });
      for (const id of [confirmed, unknown, contrary]) await review(id, 'publish');
      const filter = publicContentQueryInput.parse({
        q: tag,
        workMode: 'remote',
        payStatus: 'paid',
        kazakhstanEligible: 'true',
      });
      assert.deepEqual(
        (await queryPublicContent(6, filter)).posts.map((post) => post.id),
        [confirmed],
      );
      // Facet counts ignore their own group, count only confirmed flags and explain empty results.
      const counted = await queryPublicContent(
        6,
        publicContentQueryInput.parse({ q: tag, facets: 'true' }),
      );
      assert.equal(counted.total, 3);
      assert.deepEqual(counted.facets?.workMode, { remote: 2 });
      assert.deepEqual(counted.facets?.payStatus, { paid: 1, unpaid: 1 });
      assert.equal(counted.facets?.kazakhstanEligible, 1);
      assert.equal(counted.facets?.category.internship, 3);
      assert.deepEqual(counted.facets?.relaxed, {});
      const narrowed = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          q: tag,
          workMode: 'remote',
          payStatus: 'paid',
          facets: 'true',
        }),
      );
      assert.equal(narrowed.facets?.workMode.remote, 1);
      assert.equal(narrowed.facets?.payStatus.unpaid, 1);
      const empty = await queryPublicContent(
        6,
        publicContentQueryInput.parse({
          q: tag,
          workMode: 'in_person',
          payStatus: 'paid',
          facets: 'true',
        }),
      );
      assert.equal(empty.total, 0);
      assert.equal(empty.facets?.relaxed.workMode, 1);
      assert.equal(empty.facets?.relaxed.payStatus, 0);
      const current = await queryContentDetail(admin, confirmed);
      await mutateContentIntake(
        {
          action: 'editContent',
          itemId: confirmed,
          expectedRevisionId: current.history[0].id,
          expectedUpdatedAt: current.item.updatedAt.toISOString(),
          url: current.item.canonicalUrl,
          title: current.history[0].title,
          category: current.history[0].category,
          language: 'en',
          payStatus: 'unpaid',
          reason,
        },
        admin,
      );
      assert.equal((await queryPublicContent(6, filter)).posts.length, 0);
      const edited = await queryContentDetail(admin, confirmed);
      assert.equal(edited.history[0].workMode, 'remote');
      assert.equal(edited.history[0].kazakhstanEligible, true);
      await review(confirmed, 'publish');
      assert.equal((await queryPublicContent(6, filter)).posts.length, 0);
      for (const id of [confirmed, unknown, contrary]) await review(id, 'archive');
    });
    await t.test(
      'conditions are revised, approved and deduplicated with the source snapshot',
      async () => {
        const id = await create({
          workFormat: 'Удалённо',
          kazakhstanEligibility: 'Принимают из Казахстана',
          workload: '20 часов в неделю',
          compensation: 'Без оплаты',
        });
        await review(id, 'publish');
        assert.equal((await posts()).find((post) => post.id === id)?.workload, '20 часов в неделю');
        const current = await queryContentDetail(admin, id);
        await mutateContentIntake(
          {
            action: 'editContent',
            itemId: id,
            expectedRevisionId: current.history[0].id,
            expectedUpdatedAt: current.item.updatedAt.toISOString(),
            url: current.item.canonicalUrl,
            title: current.history[0].title,
            summary: current.history[0].summary,
            category: current.history[0].category,
            language: 'en',
            workload: '10 часов в неделю',
            reason,
          },
          admin,
        );
        assert.ok(!(await posts()).some((post) => post.id === id));
        const edited = await queryContentDetail(admin, id);
        assert.equal(edited.history[0].compensation, 'Без оплаты');
        await review(id, 'publish');
        const approved = (await posts()).find((post) => post.id === id)!;
        assert.equal(approved.workload, '10 часов в неделю');
        assert.equal(approved.kazakhstanEligibility, 'Принимают из Казахстана');
        const repeated = await mutateContentIntake(
          {
            action: 'addManualContent',
            sourceId: source.id,
            url: current.item.canonicalUrl,
            title: current.history[0].title,
            summary: current.history[0].summary,
            category: current.history[0].category,
            language: 'en',
            workFormat: 'Удалённо',
            kazakhstanEligibility: 'Принимают из Казахстана',
            workload: '20 часов в неделю',
            compensation: 'Без оплаты',
          },
          admin,
        );
        assert.ok(repeated && 'kind' in repeated);
        assert.equal(repeated.kind, 'duplicate');
        assert.equal((await posts()).find((post) => post.id === id)?.workload, '10 часов в неделю');
        await review(id, 'archive');
      },
    );
    await t.test(
      'only the explicit approved revision is public, without internal data',
      async () => {
        const id = await create();
        assert.ok(!(await posts()).some((post) => post.id === id));
        await assert.rejects(
          mutateContentIntake({ action: 'reviewContent' }, student),
          status(403),
        );
        const pending = await queryContentDetail(admin, id);
        await review(id, 'publish');
        await assert.rejects(
          mutateContentIntake(
            {
              action: 'reviewContent',
              itemId: id,
              expectedRevisionId: pending.history[0].id,
              expectedUpdatedAt: pending.item.updatedAt.toISOString(),
              decision: 'withdraw',
              reason,
            },
            admin,
          ),
          status(409),
        );
        const post = (await posts()).find((post) => post.id === id)!;
        assert.ok(post);
        assert.equal(post.title, 'Student opportunity synthetic test');
        assert.equal(post.deadline, null);
        assert.equal(post.publishedAt, null);
        assert.ok(!('rightsNote' in post));
        assert.ok(!('contentHash' in post));
        assert.ok(!('revisionId' in post));
        const detail = await queryContentDetail(admin, id);
        contentDetailDataSchema.parse(JSON.parse(JSON.stringify(detail)));
        assert.equal(detail.item.approvedRevisionId, detail.history[0].id);
        assert.equal(detail.audits[0].revisionId, detail.history[0].id);
        assert.equal(detail.audits[0].actorId, admin.id);
        await assert.rejects(queryContentDetail(student, id), status(403));
        await review(id, 'archive');
      },
    );
    await t.test('stale review cannot approve or withdraw another revision', async () => {
      const id = await create();
      const stale = await queryContentDetail(admin, id);
      await mutateContentIntake(
        {
          action: 'editContent',
          itemId: id,
          expectedRevisionId: stale.history[0].id,
          expectedUpdatedAt: stale.item.updatedAt.toISOString(),
          url: stale.item.canonicalUrl,
          title: 'Changed and editorially checked title',
          summary: 'New editor text.',
          category: 'competition',
          language: 'en',
          reason,
        },
        admin,
      );
      await assert.rejects(
        mutateContentIntake(
          {
            action: 'reviewContent',
            itemId: id,
            expectedRevisionId: stale.history[0].id,
            expectedUpdatedAt: stale.item.updatedAt.toISOString(),
            decision: 'publish',
            expiresAt: future(),
            reason,
          },
          admin,
        ),
        status(409),
      );
      const current = await queryContentDetail(admin, id);
      assert.equal(current.historyTotal, 2);
      assert.equal(current.history[0].origin, 'editorial');
      assert.equal(current.history[1].title, 'Student opportunity synthetic test');
      await review(id, 'publish');
      assert.equal(
        (await posts()).find((post) => post.id === id)?.title,
        'Changed and editorially checked title',
      );
      const repeat = await mutateContentIntake(
        {
          action: 'addManualContent',
          sourceId: source.id,
          url: stale.item.canonicalUrl,
          title: 'Student opportunity synthetic test',
          summary: 'A short synthetic summary.',
          category: 'event',
          language: 'en',
        },
        admin,
      );
      assert.ok(repeat && 'kind' in repeat);
      assert.equal(repeat.kind, 'duplicate');
      assert.equal((await queryContentDetail(admin, id)).historyTotal, 2);
      assert.equal(
        (await posts()).find((post) => post.id === id)?.title,
        'Changed and editorially checked title',
      );
      await mutateContentIntake(
        {
          action: 'addManualContent',
          sourceId: source.id,
          url: stale.item.canonicalUrl,
          title: 'Upstream changed since editorial review',
          summary: 'Changed externally.',
          category: 'event',
          language: 'en',
        },
        admin,
      );
      const changed = await queryContentDetail(admin, id);
      assert.equal(changed.item.status, 'pending_review');
      assert.equal(changed.historyTotal, 3);
      assert.equal(changed.history[1].title, 'Changed and editorially checked title');
      assert.equal(changed.item.approvedRevisionId, changed.history[1].id);
      assert.ok(!(await posts()).some((post) => post.id === id));
      await review(id, 'archive');
    });
    await t.test(
      'changed import hides old publication and preserves the approved snapshot',
      async () => {
        const url = `https://example.org/${randomUUID()}`;
        const id = await create({ url });
        await review(id, 'publish');
        const approved = await db.contentItem.findUniqueOrThrow({ where: { id } });
        await mutateContentIntake(
          {
            action: 'addManualContent',
            sourceId: source.id,
            url,
            title: 'Changed external opportunity title',
            summary: 'Changed source.',
            category: 'event',
            language: 'en',
          },
          admin,
        );
        const detail = await queryContentDetail(admin, id);
        assert.equal(detail.item.status, 'pending_review');
        assert.equal(detail.item.approvedRevisionId, approved.approvedRevisionId);
        assert.equal(detail.history.length, 2);
        assert.ok(!(await posts()).some((post) => post.id === id));
        await review(id, 'publish');
        assert.equal(
          (await posts()).find((post) => post.id === id)?.title,
          'Changed external opportunity title',
        );
        await review(id, 'withdraw');
        const result = await mutateContentIntake(
          {
            action: 'addManualContent',
            sourceId: source.id,
            url,
            title: 'Attempted imported resurrection',
            summary: 'Source changed.',
            category: 'event',
          },
          admin,
        );
        assert.ok(result && 'kind' in result);
        assert.equal(result.kind, 'duplicate');
        assert.ok(!(await posts()).some((post) => post.id === id));
        await review(id, 'reopen');
        assert.ok(!(await posts()).some((post) => post.id === id));
        await review(id, 'reject');
      },
    );
    await t.test(
      'module and source flags hide cards; safety decisions work while disabled',
      async () => {
        const id = await create();
        await review(id, 'publish');
        await mutateContentIntake({ action: 'setModuleEnabled', enabled: false }, admin);
        assert.deepEqual(await posts(), []);
        await review(id, 'withdraw');
        await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
        assert.ok(!(await posts()).some((post) => post.id === id));
        await review(id, 'reopen');
        await review(id, 'publish');
        await mutateContentIntake(
          { action: 'setSourceEnabled', sourceId: source.id, enabled: false },
          admin,
        );
        assert.ok(!(await posts()).some((post) => post.id === id));
        await mutateContentIntake(
          { action: 'setSourceEnabled', sourceId: source.id, enabled: true },
          admin,
        );
        await review(id, 'archive');
      },
    );
    await t.test(
      'publication expiry is bounded and capped by known dates; stale cards hide without worker',
      async () => {
        const deadline = new Date(Date.now() + 3600000).toISOString();
        const id = await create({ deadline });
        await review(id, 'publish');
        const item = await db.contentItem.findUniqueOrThrow({ where: { id } });
        assert.equal(item.expiresAt?.toISOString(), deadline);
        await db.contentItem.update({
          where: { id },
          data: {
            approvedAt: new Date(Date.now() - 7200000),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        assert.ok(!(await posts()).some((post) => post.id === id));
        await runContentIntake(db, {
          sourceId: source.id,
          fetcher: async () => {
            throw new Error('No network expected');
          },
        });
        assert.equal(
          (await db.contentItem.findUniqueOrThrow({ where: { id } })).status,
          'archived',
        );
        assert.equal(
          (
            await db.contentAudit.findFirstOrThrow({
              where: { itemId: id, action: 'content_expired' },
            })
          ).actorId,
          null,
        );
        const expired = await create({ deadline: new Date(Date.now() - 1000).toISOString() });
        await assert.rejects(review(expired, 'publish'), status(400));
        const tooLong = await create();
        await assert.rejects(
          review(tooLong, 'publish', {
            expiresAt: new Date(Date.now() + 91 * 86400000).toISOString(),
          }),
          status(400),
        );
        await review(tooLong, 'reject');
        await review(expired, 'reject');
      },
    );
    await t.test(
      'legacy URL is never guessed, history pagination and status filters stay separate',
      async () => {
        const id = await create();
        const item = await db.contentItem.findUniqueOrThrow({ where: { id } });
        const previous = await db.contentRevision.findFirstOrThrow({
          where: { itemId: id },
          orderBy: { number: 'desc' },
        });
        await db.contentRevision.create({
          data: {
            itemId: id,
            number: 2,
            title: 'Historical URL unavailable example',
            summary: 'Legacy snapshot.',
            category: 'other',
            score: 40,
            contentHash: previous.contentHash,
          },
        });
        await assert.rejects(review(id, 'publish'), status(409));
        for (let number = 3; number <= 22; number++)
          await db.contentRevision.create({
            data: {
              itemId: id,
              number,
              title: `History fixture revision ${number}`,
              summary: 'Synthetic.',
              category: 'other',
              score: 40,
              contentHash: previous.contentHash,
            },
          });
        const detail = await queryContentDetail(admin, id, 2);
        assert.equal(detail.history.length, 2);
        assert.equal(detail.historyTotal, 22);
        assert.equal(detail.item.revisions[0].number, 22);
        const queue = await queryContentIntake(admin, 1, 'pending_review');
        assert.ok(queue.items.every((record) => record.status === 'pending_review'));
        assert.equal(item.status, 'pending_review');
        await review(id, 'reject');
      },
    );
    await t.test(
      'two concurrent decisions cannot publish twice or duplicate the audit',
      async () => {
        const id = await create(),
          item = await queryContentDetail(admin, id);
        const command = {
          action: 'reviewContent',
          itemId: id,
          expectedRevisionId: item.history[0].id,
          expectedUpdatedAt: item.item.updatedAt.toISOString(),
          decision: 'publish',
          reason,
          expiresAt: future(),
        };
        const results = await Promise.allSettled([
          mutateContentIntake(command, admin),
          mutateContentIntake(command, admin),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
        assert.equal(
          await db.contentAudit.count({ where: { itemId: id, action: 'content_published' } }),
          1,
        );
        await review(id, 'archive');
      },
    );
    await t.test('conflicting editorial URL rolls back the new revision and audit', async () => {
      const first = await create(),
        second = await create();
      const item = await queryContentDetail(admin, first),
        other = await queryContentDetail(admin, second);
      await assert.rejects(
        mutateContentIntake(
          {
            action: 'editContent',
            itemId: first,
            expectedRevisionId: item.history[0].id,
            expectedUpdatedAt: item.item.updatedAt.toISOString(),
            url: other.item.canonicalUrl,
            title: 'Conflicting editor URL fixture',
            reason,
          },
          admin,
        ),
        (error: unknown) => {
          assert.ok(error && typeof error === 'object' && 'code' in error);
          assert.equal(error.code, 'P2002');
          return true;
        },
      );
      assert.equal((await queryContentDetail(admin, first)).historyTotal, 1);
      assert.equal(
        await db.contentAudit.count({ where: { itemId: first, action: 'content_edited' } }),
        0,
      );
      await review(first, 'reject');
      await review(second, 'reject');
    });
    await t.test('public projection is bounded with stable ordering', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) {
        const id = await create();
        ids.push(id);
        await review(id, 'publish');
      }
      const first = await posts(),
        second = await posts();
      assert.equal(first.length, 6);
      assert.deepEqual(first, second);
      for (const id of ids) await review(id, 'archive');
    });
  } finally {
    await db.contentSource.update({ where: { id: source.id }, data: { enabled: false } });
    await db.contentModuleSettings.update({
      where: { id: 'content' },
      data: { enabled: original.enabled },
    });
  }
});
