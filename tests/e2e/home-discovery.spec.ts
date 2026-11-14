import { expect, test } from '@playwright/test';

test('главная ведёт в поиск, выбранную категорию и существующий раздел проектов', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Разместить задачу', exact: true }).last(),
  ).toHaveAttribute('href', '/client/projects/new');
  await expect(page.getByRole('link', { name: 'Найти проект', exact: true })).toHaveAttribute(
    'href',
    '/projects',
  );
  const search = page.getByRole('search');
  await search.getByRole('searchbox').fill('дизайн');
  await search.getByRole('button').click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/opportunities' && url.searchParams.get('q') === 'дизайн',
  );
  await expect(page.locator('input[name="q"]')).toHaveValue('дизайн');
  await page.goBack();
  await page.getByRole('link', { name: 'Стажировки', exact: true }).click();
  await expect(page.locator('select[name="category"]')).toHaveValue('internship');
});
