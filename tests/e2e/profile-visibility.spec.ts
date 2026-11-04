import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
test('hidden profile fields persist privately and do not reach guest HTML', async ({
  page,
  browser,
}) => {
  await signInDemo(page, 'student');
  await page.goto('/student/profile');
  const secret = 'Скрытый заголовок для проверки приватности';
  await page.locator('[name="headline"]').fill(secret);
  const visibility = page.getByRole('group', { name: 'Видимость полей профиля', exact: true });
  await visibility
    .getByRole('checkbox', { name: 'Профессиональный заголовок', exact: true })
    .uncheck();
  await page.locator('[name="isPublic"]').check();
  const save = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/profile') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
  };
  await save();
  await page.reload();
  await expect(page.locator('[name="headline"]')).toHaveValue(secret);
  await expect(
    visibility.getByRole('checkbox', { name: 'Профессиональный заголовок', exact: true }),
  ).not.toBeChecked();
  const { data } = await (await page.request.get('/api/profile')).json();
  expect(data.studentProfile.headline).toBe(secret);
  const guest = await browser.newContext();
  try {
    const visitor = await guest.newPage();
    const response = await visitor.goto(`/talent/${data.id}`);
    expect(await response!.text()).not.toContain(secret);
    await expect(visitor.getByText(secret)).toHaveCount(0);
    await visibility
      .getByRole('checkbox', { name: 'Профессиональный заголовок', exact: true })
      .check();
    await save();
    await visitor.reload();
    await expect(visitor.getByText(secret, { exact: true })).toBeVisible();
  } finally {
    await guest.close();
  }
});
