import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

const empty = { data: { posts: [], total: 0 } };
const post = {
  id: 'toast-item',
  title: 'Грант для проверки уведомлений',
  summary: 'Пример карточки.',
  category: 'grant',
  geography: '',
  language: 'ru',
  url: 'https://example.org/toast',
  sourceName: 'Пример организации',
  publishedAt: null,
  approvedAt: '2026-11-13T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  deadline: '2098-06-01T00:00:00.000Z',
  eventDate: null,
};

test('removing a favorite offers undo that restores its note and reminder', async ({
  page,
}, info) => {
  await signInDemo(page, 'student');
  let favorites = [
    {
      id: 'favorite-old',
      itemId: post.id,
      createdAt: '2026-11-13T00:00:00.000Z',
      reminderDaysBefore: 3,
      note: 'Подготовить портфолио',
      post,
    },
  ];
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/opportunities/saved', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (command.action === 'removeFavorite') favorites = [];
      if (command.action === 'saveFavorite')
        favorites = [
          {
            id: 'favorite-new',
            itemId: command.itemId,
            createdAt: '2026-11-14T00:00:00.000Z',
            reminderDaysBefore: null as never,
            note: null as never,
            post,
          },
        ];
      if (command.action === 'setFavoriteNote') favorites[0].note = command.note;
      if (command.action === 'setFavoriteReminder')
        favorites[0].reminderDaysBefore = command.daysBefore;
      return route.fulfill({ json: { data: { saved: true } } });
    }
    return route.fulfill({ json: { data: { favorites, searches: [] } } });
  });
  await page.goto('/opportunities/saved');
  const card = page.getByRole('article').filter({ hasText: post.title });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Убрать из избранного' }).click();
  const toast = page.locator('.toast').filter({ hasText: 'Возможность убрана из избранного.' });
  await expect(toast).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('toast.png') });

  await toast.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Действие отменено.' })).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Моя заметка')).toHaveValue('Подготовить портфолио');
  await expect(card.getByLabel('Напомнить о сроке подачи')).toHaveValue('3');
  expect(commands.map((command) => command.action)).toEqual([
    'removeFavorite',
    'saveFavorite',
    'setFavoriteNote',
    'setFavoriteReminder',
  ]);
});

test('resetting filters can be taken back, and the toast follows the motion preference', async ({
  page,
}) => {
  // The UI runner defaults to reduced motion so screenshots are stable; this test needs motion.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.goto('/opportunities?workMode=remote&payStatus=paid');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  await form.getByRole('button', { name: 'Сбросить' }).click();
  const toast = page.locator('.toast').filter({ hasText: 'Фильтры сброшены.' });
  await expect(toast).toBeVisible();
  await expect(page).toHaveURL(/\/opportunities$/);
  // Motion tokens reach the page, and the entrance uses them.
  // The stylesheet may serialize 150ms as .15s, so compare the duration, not the text.
  const base = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--motion-base').trim(),
  );
  expect(base.endsWith('ms') ? parseFloat(base) : parseFloat(base) * 1000).toBe(150);
  expect(await toast.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    'toast-in',
  );

  await toast.getByRole('button', { name: 'Отменить' }).click();
  await expect(page).toHaveURL(/workMode=remote/);
  await expect(page).toHaveURL(/payStatus=paid/);

  // The in-app switch removes the animation as the system setting does.
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'));
  await form.getByRole('button', { name: 'Сбросить' }).click();
  const second = page.locator('.toast').filter({ hasText: 'Фильтры сброшены.' });
  await expect(second).toBeVisible();
  expect(await second.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('with reduced motion the toast and the loading spinner do not animate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.goto('/opportunities?workMode=remote');
  await page
    .getByRole('form', { name: 'Поиск возможностей' })
    .getByRole('button', { name: 'Сбросить' })
    .click();
  const toast = page.locator('.toast').filter({ hasText: 'Фильтры сброшены.' });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('a slow load shows its note at once and the spinner only after a second', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/content/posts?**', async (route) => {
    await gate;
    return route.fulfill({ json: empty });
  });
  await page.goto('/opportunities');
  const note = page.getByRole('status').filter({ hasText: 'Ищем возможности' });
  await expect(note).toBeVisible();
  const spinner = note.locator('.state-spinner');
  expect(await spinner.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(0);
  await expect
    .poll(() => spinner.evaluate((element) => Number(getComputedStyle(element).opacity)), {
      timeout: 5000,
    })
    .toBeGreaterThan(0.9);
  release();
  await expect(page.getByText('Сейчас нет актуальных публикаций.')).toBeVisible();
});
