import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('opportunity page shows at most three similar opportunities that open', async ({
  page,
}, info) => {
  await page.goto('/opportunities');
  const firstDetails = page.getByRole('link', { name: 'Подробнее' }).first();
  test.skip((await firstDetails.count()) === 0, 'The local catalogue has no published cards.');
  await firstDetails.click();
  await expect(page).toHaveURL(/\/opportunities\/[^/?#]+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const similar = page.getByRole('region', { name: 'Похожие возможности' });
  const shown = await similar.count();
  if (shown) {
    const links = similar.getByRole('link');
    expect(await links.count()).toBeLessThanOrEqual(3);
    await expect(similar.getByText(/То же направление|Тот же тип/).first()).toBeVisible();
    const href = await links.first().getAttribute('href');
    expect(href).toMatch(/^\/opportunities\/[^/?#]+\?from=/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('similar.png'), fullPage: true });
  if (shown) {
    const target = await similar.getByRole('link').first().getAttribute('href');
    await similar.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`^[^?]*${target!.split('?')[0]}`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});
