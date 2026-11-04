import { expect, test } from '@playwright/test';

test('project search updates results without submit and retains other filters', async ({
  page,
}) => {
  await page.goto('/projects?category=design');
  const search = page.getByRole('textbox', { name: 'Поиск проектов' });
  await expect(page.getByLabel('Категория')).toHaveValue('design');
  await search.fill('Excel');
  await expect(page).toHaveURL(/q=Excel/);
  await expect(page).toHaveURL(/category=design/);
  await expect(search).toHaveValue('Excel');
  await search.clear();
  await expect(page).not.toHaveURL(/q=/);
  await expect(page).toHaveURL(/category=design/);
});

test('password visibility controls preserve values and do not submit', async ({ page }) => {
  await page.goto('/auth/register');
  const password = page.locator('input[name=password]');
  const confirmation = page.locator('input[name=confirmPassword]');
  await password.fill('Example-password-123!');
  await confirmation.fill('Example-password-123!');
  await page.getByRole('button', { name: 'Показать пароль', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(confirmation).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Показать повтор пароля' }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрыть пароль', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('Example-password-123!');
  await expect(page).toHaveURL(/\/auth\/register/);
});
