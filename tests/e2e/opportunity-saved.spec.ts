import { randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import {
  contentDetailDataSchema,
  contentIntakeDataSchema,
  contentMutationDataSchema,
} from '../../src/contracts/content-intake';
import {
  opportunitySavedDataSchema,
  opportunitySavedMutationSchema,
} from '../../src/contracts/opportunity-saved';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const endpoint = '/api/opportunities/saved';

async function readSaves(api: APIRequestContext) {
  const response = await api.get(endpoint);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  return parseDataResponse(opportunitySavedDataSchema, await response.json()).data;
}
async function save(api: APIRequestContext, command: Record<string, unknown>) {
  const response = await api.post(endpoint, { headers: { Origin: baseURL }, data: command });
  expect(response.status()).toBe(200);
  return parseDataResponse(opportunitySavedMutationSchema, await response.json()).data;
}
async function content(api: APIRequestContext, action: string, fields: Record<string, unknown>) {
  const response = await api.post('/api/admin/content', {
    headers: { Origin: baseURL },
    data: { action, ...fields },
  });
  expect(response.status()).toBe(200);
  return parseDataResponse(contentMutationDataSchema, await response.json()).data;
}
async function detail(api: APIRequestContext, itemId: string) {
  const response = await api.get(`/api/admin/content/${itemId}`);
  expect(response.status()).toBe(200);
  return parseDataResponse(contentDetailDataSchema, await response.json()).data;
}
async function checkSavedLayout(page: Page, info: TestInfo, name: string) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ layout, violations: axe.violations, incomplete: axe.incomplete }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(
    axe.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test('F04: личное избранное, сохранённый поиск, уведомления и недоступная публикация', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const itemTitle = `Медицинская стажировка F04 ${suffix}`;
  const searchName = `Мой медицинский поиск ${suffix}`;
  const privateTitle = `НЕПУБЛИЧНАЯ редакция F04 ${suffix}`;
  const sourceURL = `https://example.org/f04/${suffix}`;
  const adminContext = await browser.newContext({ baseURL });
  const clientContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  const clientPage = await clientContext.newPage();
  await signInDemo(page, 'student');
  await signInDemo(adminPage, 'admin');
  await signInDemo(clientPage, 'client');
  const beforeResponse = await adminPage.request.get('/api/admin/content');
  expect(beforeResponse.status()).toBe(200);
  const before = parseDataResponse(contentIntakeDataSchema, await beforeResponse.json()).data;
  let sourceId = '';
  let itemId = '';
  let favoriteId = '';
  let searchId = '';
  try {
    expect((await guestContext.request.get(endpoint)).status()).toBe(401);
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/opportunities/saved');
    await expect(guestPage).toHaveURL(/\/auth\/login/);
    expect(
      (
        await guestContext.request.post(endpoint, {
          headers: { Origin: baseURL },
          data: { action: 'saveSearch', name: 'Guest', filters: {} },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: 'https://other.example' },
          data: { action: 'saveSearch', name: 'Wrong origin', filters: {} },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: baseURL },
          data: {
            action: 'saveSearch',
            name: 'Injected owner',
            filters: {},
            userId: 'another-user',
          },
        })
      ).status(),
    ).toBe(400);

    await content(adminPage.request, 'setModuleEnabled', { enabled: true });
    const created = await content(adminPage.request, 'createSource', {
      name: `Синтетический источник F04 ${suffix}`,
      type: 'manual',
      allowedHost: 'example.org',
      enabled: true,
      rightsNote: 'Синтетическая проверка сохранений в изолированной E2E-БД; внешних запросов нет.',
    });
    if (!('sourceId' in created)) throw new Error('Source ID required.');
    sourceId = created.sourceId;
    const added = await content(adminPage.request, 'addManualContent', {
      sourceId,
      url: sourceURL,
      title: itemTitle,
      summary: 'Синтетическая медицинская стажировка для проверки личных сохранений.',
      category: 'internship',
      language: 'ru',
      geography: 'Алматы',
    });
    if (!('itemId' in added)) throw new Error('Item ID required.');
    itemId = added.itemId;
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: baseURL },
          data: { action: 'saveFavorite', itemId },
        })
      ).status(),
    ).toBe(404);
    const pending = await detail(adminPage.request, itemId);
    await content(adminPage.request, 'reviewContent', {
      itemId,
      expectedRevisionId: pending.item.revisions[0].id,
      expectedUpdatedAt: pending.item.updatedAt,
      decision: 'publish',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Явное одобрение синтетического материала для E2E F04.',
    });

    const query = new URLSearchParams({
      q: suffix,
      category: 'internship',
      specialty: 'health',
      geography: 'Алматы',
    });
    await page.goto(`/opportunities?${query}`);
    const criteria = page.getByRole('form', { name: 'Поиск возможностей', exact: true });
    await expect(criteria.locator('[name=q]')).toHaveValue(suffix);
    await expect(criteria.locator('[name=category]')).toHaveValue('internship');
    await expect(criteria.locator('[name=specialty]')).toHaveValue('health');
    await expect(criteria.locator('[name=geography]')).toHaveValue(/Алматы|алматы/);
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: itemTitle, exact: true }) });
    const favoriteButton = card.getByRole('button', { name: 'В избранное', exact: true });
    await expect(favoriteButton).toBeEnabled();
    await favoriteButton.focus();
    await favoriteButton.press('Enter');
    await expect(
      card.getByRole('button', { name: 'Убрать из избранного', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const saved = await readSaves(page.request);
    const favorite = saved.favorites.find((value) => value.itemId === itemId);
    expect(favorite?.post?.title).toBe(itemTitle);
    if (!favorite) throw new Error('Favorite required.');
    favoriteId = favorite.id;
    await save(page.request, { action: 'saveFavorite', itemId });
    expect(
      (await readSaves(page.request)).favorites.filter((value) => value.itemId === itemId),
    ).toHaveLength(1);
    await page.reload();
    await expect(
      page
        .locator('article')
        .filter({ hasText: itemTitle })
        .getByRole('button', { name: 'Убрать из избранного', exact: true }),
    ).toBeVisible();

    const searchForm = page.getByRole('form', { name: 'Сохранить текущий поиск', exact: true });
    await searchForm.locator('[name=name]').fill(searchName);
    await searchForm.getByRole('button', { name: 'Сохранить поиск', exact: true }).click();
    await expect
      .poll(async () =>
        (await readSaves(page.request)).searches.some((value) => value.name === searchName),
      )
      .toBe(true);
    const stored = (await readSaves(page.request)).searches.find(
      (value) => value.name === searchName,
    );
    if (!stored) throw new Error('Saved query required.');
    searchId = stored.id;
    expect(stored.filters).toEqual({
      q: suffix,
      category: 'internship',
      specialty: 'health',
      geography: 'алматы',
    });
    expect(stored.notificationFrequency).toBe('off');
    expect(stored.nextNotificationAt).toBeNull();

    const foreign = await readSaves(clientPage.request);
    expect(foreign.favorites.some((value) => value.id === favoriteId)).toBe(false);
    expect(foreign.searches.some((value) => value.id === searchId)).toBe(false);
    await save(clientPage.request, { action: 'removeFavorite', favoriteId });
    await save(clientPage.request, { action: 'removeSearch', searchId });
    expect(
      (
        await clientPage.request.post(endpoint, {
          headers: { Origin: baseURL },
          data: { action: 'setSearchNotifications', searchId, frequency: 'daily' },
        })
      ).status(),
    ).toBe(404);
    expect((await readSaves(page.request)).favorites.some((value) => value.id === favoriteId)).toBe(
      true,
    );
    expect((await readSaves(page.request)).searches.some((value) => value.id === searchId)).toBe(
      true,
    );

    await page.getByRole('link', { name: 'Моё избранное и поиски' }).click();
    await expect(page).toHaveURL(/\/opportunities\/saved$/);
    await expect(page.getByRole('heading', { name: itemTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: searchName, exact: true })).toBeVisible();
    const savedSearchCard = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: searchName, exact: true }) });
    const notificationForm = savedSearchCard.getByRole('form', {
      name: `Настройки уведомлений: ${searchName}`,
      exact: true,
    });
    const frequency = notificationForm.getByRole('combobox', { name: 'Уведомления в Qosyl' });
    const saveFrequency = notificationForm.getByRole('button', {
      name: 'Сохранить уведомления',
      exact: true,
    });
    await expect(frequency).toHaveValue('off');
    await expect(saveFrequency).toBeDisabled();
    await frequency.selectOption('weekly');
    const focusRefresh = page.waitForResponse(
      (response) => response.url().endsWith(endpoint) && response.request().method() === 'GET',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await focusRefresh;
    await expect(frequency).toHaveValue('weekly');
    expect(
      (await readSaves(page.request)).searches.find((value) => value.id === searchId)
        ?.notificationFrequency,
    ).toBe('off');
    await frequency.selectOption('daily');
    await saveFrequency.focus();
    await saveFrequency.press('Enter');
    await expect(page.getByText('Настройки уведомлений сохранены.', { exact: true })).toBeVisible();
    const daily = (await readSaves(page.request)).searches.find((value) => value.id === searchId);
    expect(daily?.notificationFrequency).toBe('daily');
    expect(daily?.nextNotificationAt).toBeTruthy();
    await page.reload();
    await expect(frequency).toHaveValue('daily');
    await expect(saveFrequency).toBeDisabled();
    await save(page.request, { action: 'setSearchNotifications', searchId, frequency: 'daily' });
    expect(
      (await readSaves(page.request)).searches.find((value) => value.id === searchId)
        ?.nextNotificationAt,
    ).toBe(daily?.nextNotificationAt);
    await frequency.selectOption('weekly');
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Тестовая ошибка сохранения уведомлений.' }),
      });
    });
    await saveFrequency.click();
    await expect(page.getByText('Тестовая ошибка сохранения уведомлений.')).toBeVisible();
    await expect(frequency).toHaveValue('weekly');
    await expect(saveFrequency).toBeEnabled();
    expect(
      (await readSaves(page.request)).searches.find((value) => value.id === searchId)
        ?.notificationFrequency,
    ).toBe('daily');
    await page.unroute(`**${endpoint}`);
    await saveFrequency.click();
    await expect(page.getByText('Настройки уведомлений сохранены.', { exact: true })).toBeVisible();
    await expect(saveFrequency).toBeDisabled();
    const weekly = (await readSaves(page.request)).searches.find((value) => value.id === searchId);
    expect(weekly?.notificationFrequency).toBe('weekly');
    expect(new Date(weekly?.nextNotificationAt ?? '').getTime()).toBeGreaterThan(
      new Date(daily?.nextNotificationAt ?? '').getTime(),
    );
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => localStorage.setItem('qosyl-theme', value), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { name: itemTitle, exact: true })).toBeVisible();
      for (const width of [375, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await checkSavedLayout(page, info, `saved-${theme}-${width}`);
      }
    }
    await expect(frequency).toHaveValue('weekly');
    await frequency.selectOption('off');
    await saveFrequency.click();
    await expect(page.getByText('Настройки уведомлений сохранены.', { exact: true })).toBeVisible();
    await expect(notificationForm.getByText('Сейчас уведомления выключены.')).toBeVisible();
    await expect(saveFrequency).toBeDisabled();
    const disabledSearch = (await readSaves(page.request)).searches.find(
      (value) => value.id === searchId,
    );
    expect(disabledSearch?.notificationFrequency).toBe('off');
    expect(disabledSearch?.nextNotificationAt).toBeNull();
    await savedSearchCard.locator('a[href^="/opportunities?"]').click();
    await expect(page).toHaveURL(/\/opportunities\?/);
    const restored = page.getByRole('form', { name: 'Поиск возможностей', exact: true });
    await expect(restored.locator('[name=q]')).toHaveValue(suffix);
    await expect(restored.locator('[name=category]')).toHaveValue('internship');
    await expect(restored.locator('[name=specialty]')).toHaveValue('health');
    await expect(restored.locator('[name=geography]')).toHaveValue('алматы');
    await expect(page.getByRole('heading', { name: itemTitle, exact: true })).toBeVisible();

    const published = await detail(adminPage.request, itemId);
    await content(adminPage.request, 'editContent', {
      itemId,
      expectedRevisionId: published.item.revisions[0].id,
      expectedUpdatedAt: published.item.updatedAt,
      url: sourceURL,
      title: privateTitle,
      summary: `НЕПУБЛИЧНЫЕ условия ${suffix}`,
      category: 'internship',
      language: 'ru',
      geography: 'Алматы',
      reason: 'Новая синтетическая редакция должна остаться закрытой до проверки.',
    });
    const hidden = await detail(adminPage.request, itemId);
    await content(adminPage.request, 'reviewContent', {
      itemId,
      expectedRevisionId: hidden.item.revisions[0].id,
      expectedUpdatedAt: hidden.item.updatedAt,
      decision: 'withdraw',
      reason: 'Отзыв синтетической публикации для проверки недоступного избранного.',
    });
    const unavailable = (await readSaves(page.request)).favorites.find(
      (value) => value.id === favoriteId,
    );
    expect(unavailable?.post).toBeNull();
    expect(JSON.stringify(unavailable)).not.toContain(privateTitle);
    expect(JSON.stringify(unavailable)).not.toContain(sourceURL);
    await page.goto('/opportunities/saved');
    await expect(page.getByText(/Материал недоступен/)).toBeVisible();
    await expect(page.getByRole('heading', { name: itemTitle, exact: true })).toHaveCount(0);
    await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'К организатору' })).toHaveCount(0);
    await page.getByRole('button', { name: /Убрать из избранного|Удалить из избранного/ }).click();
    await expect
      .poll(async () =>
        (await readSaves(page.request)).favorites.some((value) => value.id === favoriteId),
      )
      .toBe(false);
    const remainingSearch = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: searchName, exact: true }) });
    await remainingSearch.getByRole('button', { name: /Удалить поиск/ }).click();
    await expect
      .poll(async () =>
        (await readSaves(page.request)).searches.some((value) => value.id === searchId),
      )
      .toBe(false);
  } finally {
    if (favoriteId) await save(page.request, { action: 'removeFavorite', favoriteId });
    if (searchId) await save(page.request, { action: 'removeSearch', searchId });
    if (sourceId)
      await content(adminPage.request, 'setSourceEnabled', { sourceId, enabled: false });
    await content(adminPage.request, 'setModuleEnabled', { enabled: before.settings.enabled });
    await Promise.all([adminContext.close(), clientContext.close(), guestContext.close()]);
  }
});
