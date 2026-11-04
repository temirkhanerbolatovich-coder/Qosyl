import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

test('student details persist and only explicitly published experience reaches the guest', async ({
  page,
  browser,
}) => {
  await signInDemo(page, 'student');
  await page.goto('/student/profile');
  await page.locator('[name="studyYear"]').fill('2');
  await page.locator('[name="languages"]').fill('Қазақша, Русский');
  await page.getByRole('button', { name: 'Добавить ссылку', exact: true }).click();
  const personalLink = page.getByRole('group', { name: 'Ссылка 1', exact: true });
  await personalLink
    .getByLabel('HTTPS URL', { exact: true })
    .fill('https://example.com/private-profile-link');
  await page.getByRole('button', { name: 'Добавить опыт', exact: true }).click();
  const experience = page.getByRole('group', { name: 'Опыт 1', exact: true });
  await experience
    .getByLabel('Организация или проект', { exact: true })
    .fill('Личный закрытый учебный кейс');
  await experience.getByLabel('Ваша роль', { exact: true }).fill('Аналитик');
  await experience.getByLabel('Начало', { exact: true }).fill('2025-09');
  await experience
    .getByLabel('Задачи и личный вклад', { exact: true })
    .fill('Проверка обезличенной учебной таблицы');
  await page.locator('[name="isPublic"]').check();
  const save = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/profile') && response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await expect(page.getByRole('status')).toContainText('Профиль сохранён');
  };
  await save();
  await page.reload();
  await expect(page.locator('[name="studyYear"]')).toHaveValue('2');
  await expect(page.locator('[name="languages"]')).toHaveValue('Қазақша, Русский');
  await expect(experience.getByLabel('Ваша роль', { exact: true })).toHaveValue('Аналитик');
  const { data } = await (await page.request.get('/api/profile')).json();
  expect(data.studentProfile.experiences[0].isPublic).toBe(false);
  const guest = await browser.newContext();
  try {
    const publicPage = await guest.newPage();
    const hidden = await publicPage.goto(`/talent/${data.id}`);
    expect(await hidden!.text()).not.toContain('Личный закрытый учебный кейс');
    expect(await hidden!.text()).not.toContain('https://example.com/private-profile-link');
    await expect(
      publicPage.getByText('Личный закрытый учебный кейс', { exact: false }),
    ).toHaveCount(0);
    await experience.getByRole('checkbox').check();
    await personalLink.getByRole('checkbox').check();
    await save();
    await publicPage.reload();
    const visibleLink = publicPage.locator('a[href="https://example.com/private-profile-link"]');
    await expect(visibleLink).toBeVisible();
    await expect(visibleLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(
      publicPage.getByRole('heading', { name: 'Личный закрытый учебный кейс · Аналитик' }),
    ).toBeVisible();
    await expect(
      publicPage.getByText('Учебный проект · Добавлено пользователем', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Удалить запись 1', exact: true }).click();
    await save();
    await page.reload();
    await expect(page.getByRole('group', { name: 'Опыт 1', exact: true })).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
