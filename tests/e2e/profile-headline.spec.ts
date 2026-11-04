import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

test('headline survives saving and reload, respects public profile visibility', async ({
  page,
  browser,
}) => {
  await signInDemo(page, 'student');
  await page.goto('/student/profile');
  const headline = 'Начинающий дизайнер · учебные проекты';
  await page.locator('input[name="headline"]').fill(headline);
  await page.locator('input[name="isPublic"]').check();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Профиль сохранён');
  await page.reload();
  await expect(page.locator('input[name="headline"]')).toHaveValue(headline);
  const response = await page.request.get('/api/profile');
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  expect(data.studentProfile.headline).toBe(headline);
  const guest = await browser.newContext();
  try {
    const publicPage = await guest.newPage();
    await publicPage.goto(`/talent/${data.id}`);
    await expect(publicPage.getByText(headline, { exact: true })).toBeVisible();
    await expect(publicPage.getByText(data.email, { exact: true })).toHaveCount(0);
    await page.locator('input[name="isPublic"]').uncheck();
    const [save] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/profile') && response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click(),
    ]);
    expect(save.ok()).toBe(true);
    await expect(page.getByRole('status')).toContainText('Профиль сохранён');
    const own = await page.request.get('/api/profile');
    expect((await own.json()).data.studentProfile.isPublic).toBe(false);
    await publicPage.goto(`/talent/${data.id}`);
    await expect(
      publicPage.getByRole('heading', { name: 'Эта страница недоступна' }),
    ).toBeVisible();
    await expect(publicPage.getByText(headline, { exact: true })).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
