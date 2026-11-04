import { randomUUID } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import { dashboardDataSchema } from '../../src/contracts/api-responses';

test('F04: все загруженные уведомления доступны после раскрытия списка', async ({ page }, info) => {
  const target = new URL(process.env.DATABASE_URL || 'invalid:');
  const databaseName = process.env.E2E_DATABASE_NAME;
  if (
    !databaseName ||
    !/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(databaseName) ||
    target.pathname !== '/' + databaseName ||
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    process.env.E2E_EXTERNAL_SERVER
  )
    throw Error('This fixture requires the managed isolated local E2E database.');
  const connection = new pg.Client({ connectionString: target.toString() });
  await connection.connect();
  const fixtureIds: string[] = [];
  const texts = Array.from(
    { length: 12 },
    (_, index) => `Синтетическое уведомление F04 ${index + 1}`,
  );
  try {
    const owner = await connection.query<{ id: string }>(
      'SELECT id FROM "User" WHERE id = $1 AND demo = true AND status = $2',
      ['demo-student', 'active'],
    );
    expect(owner.rows).toHaveLength(1);
    const fixtureClock = Date.now();
    for (const [index, text] of texts.entries()) {
      const id = randomUUID();
      fixtureIds.push(id);
      await connection.query(
        'INSERT INTO "Notification" (id, "userId", text, url, "createdAt") VALUES ($1, $2, $3, $4, $5)',
        [id, owner.rows[0].id, text, '/opportunities/saved', new Date(fixtureClock + index)],
      );
    }
    await signInDemo(page, 'student');
    const response = await page.request.get('/api/platform?view=dashboard');
    expect(response.status()).toBe(200);
    const body = parseDataResponse(dashboardDataSchema, await response.json());
    expect(body.data.user.id).toBe(owner.rows[0].id);
    const loaded = body.data.notifications.length;
    expect(loaded).toBeGreaterThanOrEqual(12);
    expect(loaded).toBeLessThanOrEqual(30);
    await page.goto('/dashboard');
    const inbox = page.getByRole('region', { name: 'Уведомления', exact: true });
    await expect(inbox.locator('article.notification')).toHaveCount(8);
    await expect(inbox.getByText('Здесь доступны последние 30 уведомлений.')).toBeVisible();
    const expand = inbox.getByRole('button', {
      name: `Показать все загруженные уведомления (${loaded})`,
      exact: true,
    });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.focus();
    await page.keyboard.press('Enter');
    await expect(inbox.locator('article.notification')).toHaveCount(loaded);
    for (const text of texts) await expect(inbox.getByText(text, { exact: true })).toBeVisible();
    const collapse = inbox.getByRole('button', { name: 'Свернуть уведомления', exact: true });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    for (const [theme, width] of [
      ['light', 375],
      ['dark', 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
      if (await menu.isVisible()) await menu.click();
      await page
        .getByRole('combobox', { name: 'Тема оформления', exact: true })
        .selectOption(theme);
      const closeMenu = page.getByRole('button', { name: 'Закрыть меню', exact: true });
      if (await closeMenu.isVisible()) await closeMenu.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      // Theme colors transition together; audit the settled theme rather than an intermediate frame.
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.all(
          document.getAnimations().map((animation) => animation.finished.catch(() => {})),
        );
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow).toBe(false);
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`inbox-${theme}-${width}.png`),
        fullPage: true,
      });
    }
    await collapse.click();
    await expect(inbox.locator('article.notification')).toHaveCount(8);
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.click();
    await page.reload();
    await expect(inbox.locator('article.notification')).toHaveCount(8);
  } finally {
    if (fixtureIds.length)
      await connection.query(
        'DELETE FROM "Notification" WHERE id = ANY($1::text[]) AND "dedupeKey" IS NULL',
        [fixtureIds],
      );
    await connection.end();
  }
});
