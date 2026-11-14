import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

const post = (id: string, deadline: string | null) => ({
  id,
  title: `Грант для проверки напоминаний ${id}`,
  summary: 'Пример карточки.',
  category: 'grant',
  geography: '',
  language: 'ru',
  url: `https://example.org/${id}`,
  sourceName: 'Пример организации',
  publishedAt: null,
  approvedAt: '2026-11-13T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  deadline,
  eventDate: null,
});

test('saved opportunity offers a deadline reminder only when a deadline is known', async ({
  page,
}, info) => {
  await signInDemo(page, 'student');
  let reminder: number | null = null;
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/opportunities/saved', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (command.action === 'setFavoriteReminder') reminder = command.daysBefore;
      return route.fulfill({ json: { data: { saved: true } } });
    }
    return route.fulfill({
      json: {
        data: {
          favorites: [
            {
              id: 'favorite-dated',
              itemId: 'dated',
              createdAt: '2026-11-13T00:00:00.000Z',
              reminderDaysBefore: reminder,
              note: null,
              post: post('dated', '2098-06-01T00:00:00.000Z'),
            },
            {
              id: 'favorite-undated',
              itemId: 'undated',
              createdAt: '2026-11-12T00:00:00.000Z',
              reminderDaysBefore: null,
              note: null,
              post: post('undated', null),
            },
          ],
          searches: [],
        },
      },
    });
  });
  await page.goto('/opportunities/saved');
  for (const summary of await page.getByText('Заметка и напоминание').all()) await summary.click();
  const select = page.getByLabel('Напомнить о сроке подачи');
  // Only the card with a confirmed deadline gets the control.
  await expect(select).toHaveCount(1);
  await expect(select).toHaveValue('');

  await select.selectOption('3');
  await expect
    .poll(() => commands.at(-1))
    .toEqual({
      action: 'setFavoriteReminder',
      favoriteId: 'favorite-dated',
      daysBefore: 3,
    });
  await expect(select).toHaveValue('3');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('reminder.png'), fullPage: true });

  await select.selectOption('');
  await expect.poll(() => commands.at(-1)).toMatchObject({ daysBefore: null });
});
