import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import { publicContentDataSchema } from '../../src/contracts/content-intake';
import {
  opportunitySavedDataSchema,
  opportunitySavedMutationSchema,
} from '../../src/contracts/opportunity-saved';
import { signInDemo } from '../ui-quality/demo-session';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const savedEndpoint = '/api/opportunities/saved';

async function changeLocale(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
    await menu.click();
}

test('F06a: synthetic cookie denial keeps an in-memory language and reports persistence failure', async ({
  page,
}, info) => {
  // Only this preference write is denied; browser authentication/storage behavior is unchanged.
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (!descriptor?.get || !descriptor.set)
      throw new Error('Cookie accessor is required for the synthetic denial fixture.');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return descriptor.get!.call(document);
      },
      set(value: string) {
        if (!value.startsWith('qosyl-locale=')) descriptor.set!.call(document, value);
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const heading = page.locator('main').getByRole('heading', { level: 1 });
  const russianHeading = await heading.innerText();
  await changeLocale(page, 'kk');
  await expect(heading).not.toHaveText(russianHeading);
  const notice = page.locator('.locale-notice[role="status"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('lang', 'kk');
  await expect(notice).toContainText('браузер таңдауды сақтамады');
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'qosyl-locale')).toBe(
    false,
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(heading).toHaveText(russianHeading, { useInnerText: true });
  await expect(notice).toHaveCount(0);
  await info.attach('synthetic-cookie-denial-scope', {
    body: JSON.stringify({
      fixture: 'Synthetic denial of qosyl-locale writes through a document cookie accessor',
      actualBrowserCookiePolicyTested: false,
      inMemorySelection: 'kk',
      languageAfterReload: 'ru',
    }),
    contentType: 'application/json',
  });
});

test('F06a: language changes preserve a saved-search name draft and unsaved notification frequency', async ({
  page,
}) => {
  const databaseName = process.env.E2E_DATABASE_NAME;
  const database = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !databaseName ||
    !/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(databaseName) ||
    database.pathname !== '/' + databaseName ||
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    process.env.E2E_EXTERNAL_SERVER
  )
    throw new Error('Saved-search fixtures require the managed isolated local E2E database.');
  await signInDemo(page, 'student');
  const suffix = randomBytes(6).toString('hex');
  const searchName = `Синтетический поиск F06a ${suffix}`;
  const draftName = `Менің іздеуім — неподтверждённое название ${suffix}`;
  let searchId = '';
  const mutations: string[] = [];
  const recordMutation = (request: Request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === savedEndpoint)
      mutations.push(request.url());
  };
  try {
    const response = await page.request.post(savedEndpoint, {
      headers: { Origin: baseURL },
      data: { action: 'saveSearch', name: searchName, filters: { q: suffix } },
    });
    expect(response.status()).toBe(200);
    parseDataResponse(opportunitySavedMutationSchema, await response.json());
    const readResponse = await page.request.get(savedEndpoint);
    expect(readResponse.status()).toBe(200);
    const data = parseDataResponse(opportunitySavedDataSchema, await readResponse.json()).data;
    const stored = data.searches.find((search) => search.name === searchName);
    expect(stored).toBeDefined();
    searchId = stored!.id;
    expect(stored!.notificationFrequency).toBe('off');

    await page.goto(`/opportunities?q=${suffix}`);
    const name = page.locator('main .opportunities-catalogue input[name="name"]');
    await expect(name).toBeVisible();
    await name.fill(draftName);
    const searchURL = page.url();
    page.on('request', recordMutation);
    await changeLocale(page, 'kk');
    await expect(name).toHaveValue(draftName);
    expect(page.url()).toBe(searchURL);
    await changeLocale(page, 'ru');
    await expect(name).toHaveValue(draftName);

    await page.goto('/opportunities/saved');
    const search = page.locator('main article').filter({
      has: page.getByRole('heading', { name: searchName, exact: true }),
    });
    const frequency = search.locator('select[name="notificationFrequency"]');
    await expect(frequency).toBeEnabled();
    await expect(frequency).toHaveValue('off');
    await frequency.selectOption('weekly');
    const savedURL = page.url();
    await changeLocale(page, 'kk');
    await expect(frequency).toHaveValue('weekly');
    await expect(search.getByRole('heading', { name: searchName, exact: true })).toBeVisible();
    await expect(
      search.getByRole('button', { name: 'Хабарламаларды сақтау', exact: true }),
    ).toBeEnabled();
    expect(page.url()).toBe(savedURL);
    await changeLocale(page, 'ru');
    await expect(frequency).toHaveValue('weekly');
    await expect(
      search.getByRole('button', { name: 'Сохранить уведомления', exact: true }),
    ).toBeEnabled();
    const unchangedResponse = await page.request.get(savedEndpoint);
    expect(unchangedResponse.status()).toBe(200);
    const unchanged = parseDataResponse(
      opportunitySavedDataSchema,
      await unchangedResponse.json(),
    ).data.searches.find((value) => value.id === searchId);
    expect(unchanged).toMatchObject({ name: searchName, notificationFrequency: 'off' });
    expect(mutations).toEqual([]);
  } finally {
    page.off('request', recordMutation);
    if (searchId) {
      const response = await page.request.post(savedEndpoint, {
        headers: { Origin: baseURL },
        data: { action: 'removeSearch', searchId },
      });
      expect(response.status()).toBe(200);
    }
  }
});

test('F06a: synthetic public content keeps its original text and language when UI labels change', async ({
  page,
}, info) => {
  const originalTitle = 'Synthetic English internship — original publication';
  const originalSummary =
    'Synthetic public DTO for language verification; no live source was queried.';
  const now = Date.now();
  const fixture = publicContentDataSchema.parse({
    posts: [
      {
        id: 'synthetic-f06a-language-publication',
        title: originalTitle,
        summary: originalSummary,
        category: 'internship',
        geography: 'Online — synthetic location',
        language: 'en',
        url: 'https://example.org/synthetic-f06a-language-publication',
        sourceName: 'Synthetic English source',
        publishedAt: new Date(now - 60_000).toISOString(),
        approvedAt: new Date(now - 30_000).toISOString(),
        expiresAt: new Date(now + 86_400_000).toISOString(),
        deadline: '2030-11-10T00:00:00.000Z',
        eventDate: null,
      },
    ],
  });
  await page.route('**/api/content/posts?**', (route) =>
    route.fulfill({ json: { data: fixture } }),
  );
  await page.goto('/opportunities');
  const card = page.locator('main .opportunities-catalogue article').filter({
    has: page.getByRole('heading', { name: originalTitle, exact: true }),
  });
  await expect(card).toBeVisible();
  const title = card.getByRole('heading', { name: originalTitle, exact: true });
  const summary = card.getByText(originalSummary, { exact: true });
  await expect(title).toHaveAttribute('lang', 'en');
  await expect(summary).toHaveAttribute('lang', 'en');
  await expect(card.getByRole('link', { name: 'К организатору →', exact: true })).toBeVisible();
  for (const locale of ['kk', 'ru'] as const) {
    await changeLocale(page, locale);
    if (locale === 'kk') {
      await expect(card).toContainText('10.11.2030');
      await expect(card).not.toContainText(/M11/u);
    }
    await expect(title).toHaveText(originalTitle);
    await expect(title).toHaveAttribute('lang', 'en');
    await expect(summary).toHaveText(originalSummary);
    await expect(summary).toHaveAttribute('lang', 'en');
    await expect(card.getByText('Synthetic English source', { exact: true })).toHaveAttribute(
      'lang',
      'en',
    );
    await expect(
      card.getByRole('link', {
        name: locale === 'kk' ? 'Ұйымдастырушыға өту →' : 'К организатору →',
        exact: true,
      }),
    ).toHaveAttribute('href', fixture.posts[0].url);
  }
  await info.attach('synthetic-publication-language-scope', {
    body: JSON.stringify({
      fixture: 'Intercepted synthetic public DTO',
      liveSourceQueried: false,
      originalLanguage: 'en',
      interfaceLanguages: ['ru', 'kk'],
    }),
    contentType: 'application/json',
  });
});

test('F06a: client header keeps navigation, language controls and project action within each viewport', async ({
  page,
}, info) => {
  await signInDemo(page, 'client');
  await page.goto('/client/projects/new');
  await page.evaluate(() => document.fonts.ready);
  const observations: {
    locale: string;
    width: number;
    documentWidth: number;
    offenders: { tag: string; className: string; left: number; right: number; width: number }[];
  }[] = [];
  for (const width of [375, 768, 1440, 1600, 1601, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const locale of ['ru', 'kk'] as const) {
      await changeLocale(page, locale);
      const menu = page.locator('header button[aria-controls="header-navigation"]');
      await expect(menu).toHaveCount(0);
      if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
        await menu.click();
      const action = page.locator('header a[href="/client/projects/new"]');
      await expect(action).toBeVisible();
      await action.focus();
      await expect(action).toBeFocused();
      const geometry = await page.evaluate(() => ({
        locale: document.documentElement.lang,
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>('header, header *')]
          .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
          .filter(
            ({ bounds }) => bounds.width > 0 && (bounds.right > innerWidth + 1 || bounds.left < -1),
          )
          .slice(0, 20)
          .map(({ element, bounds }) => ({
            tag: element.tagName,
            className: element.getAttribute('class') ?? '',
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
          })),
      }));
      observations.push(geometry);
      await page.screenshot({ path: info.outputPath(`client-header-${locale}-${width}.png`) });
      await expect(
        page.getByRole('navigation', {
          name: locale === 'ru' ? 'Основная навигация' : 'Негізгі навигация',
        }),
      ).toBeVisible();
    }
  }
  await info.attach('client-header-geometry', {
    body: JSON.stringify(observations),
    contentType: 'application/json',
  });
  for (const observation of observations) {
    expect(observation.documentWidth, JSON.stringify(observation)).toBeLessThanOrEqual(
      observation.width + 1,
    );
    expect(observation.offenders, JSON.stringify(observation)).toEqual([]);
  }
});
