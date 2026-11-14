import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const post = (id: string) => ({
  id,
  title: `Карточка главной ${id}`,
  summary: 'Пример карточки.',
  category: 'internship',
  geography: '',
  language: 'ru',
  url: `https://example.org/${id}`,
  sourceName: 'Пример организации',
  publishedAt: null,
  approvedAt: '2026-11-13T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  deadline: null,
  eventDate: null,
});

test('home shows three fresh opportunities and routes to the full catalogue', async ({
  page,
}, info) => {
  const limits: (string | null)[] = [];
  await page.route('**/api/content/posts?**', (route) => {
    limits.push(new URL(route.request().url()).searchParams.get('limit'));
    return route.fulfill({
      json: { data: { posts: ['a', 'b', 'c'].map(post), total: 3 } },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(limits).toContain('3');
  await expect(page.getByRole('link', { name: /Все возможности и поиск/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Гид по поступлению/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Найти проект' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
});

test('pilot banner stays on one line and keeps its message', async ({ page }) => {
  await page.goto('/');
  const banner = page.locator('.pilot-banner');
  await expect(banner).toContainText('Локальный пилот 18+');
  const height = (await banner.boundingBox())!.height;
  // One line of 12px text with padding; two lines would pass 44px.
  expect(height).toBeLessThan(44);
});

test('projects offer quick filters for a few hours, a near deadline and no experience', async ({
  page,
}) => {
  await page.goto('/projects');
  const group = page.getByRole('group', { name: 'Быстрые фильтры' });
  const hours = group.getByRole('button', { name: 'До 5 часов' });
  await expect(hours).toHaveAttribute('aria-pressed', 'false');
  await hours.click();
  await expect(page).toHaveURL(/maxHours=5/);
  await expect(hours).toHaveAttribute('aria-pressed', 'true');

  await group.getByRole('button', { name: 'Срок до 3 дней' }).click();
  await expect(page).toHaveURL(/dueBefore=\d{4}-\d{2}-\d{2}/);
  await group.getByRole('button', { name: 'Можно без опыта' }).click();
  await expect(page).toHaveURL(/difficulty=beginner_friendly/);

  // The same presets switch off again and the other filters stay.
  await hours.click();
  await expect(page).not.toHaveURL(/maxHours/);
  await expect(page).toHaveURL(/difficulty=beginner_friendly/);
});
