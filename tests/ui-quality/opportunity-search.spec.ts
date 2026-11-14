import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const empty = { data: { posts: [], total: 0 } };

test('search suggestions work by keyboard and apply a type', async ({ page }, info) => {
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.goto('/opportunities');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  const box = form.getByRole('combobox', { name: 'Что ищете?' });
  await box.fill('стажир');
  const list = page.getByRole('listbox', { name: 'Подсказки' });
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('option', { name: 'Тип: Стажировка / практика' })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('suggestions.png') });

  // Escape closes the list without changing the typed text.
  await box.press('Escape');
  await expect(list).toBeHidden();
  await expect(box).toHaveValue('стажир');

  await box.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', /.+/);
  const request = page.waitForRequest((r) => {
    const url = new URL(r.url());
    return (
      url.pathname === '/api/content/posts' && url.searchParams.get('category') === 'internship'
    );
  });
  await box.press('Enter');
  expect(new URL((await request).url()).searchParams.has('q')).toBe(false);
  await expect(page).toHaveURL(/category=internship/);
  await expect(page).not.toHaveURL(/q=/);
});

test('recent searches stay on the device and can be cleared', async ({ page }) => {
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.goto('/opportunities');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  const box = form.getByRole('combobox', { name: 'Что ищете?' });
  await box.fill('хакатон по данным');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=/);

  await page.goto('/opportunities');
  await box.focus();
  const recent = page.getByRole('listbox', { name: 'Недавние запросы' });
  await expect(recent.getByRole('option', { name: 'хакатон по данным' })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить недавние запросы' }).click();
  await expect(recent).toBeHidden();
  await box.press('Escape');
  await box.blur();
  await box.focus();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('relevance sorting is offered only with a text query', async ({ page }) => {
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.goto('/opportunities');
  const sort = page.getByLabel('Сортировка');
  await expect(sort.locator('option[value=relevance]')).toHaveCount(0);

  await page.goto('/opportunities?q=грант');
  await expect(sort.locator('option[value=relevance]')).toHaveText('По соответствию');
  const request = page.waitForRequest((r) => {
    const url = new URL(r.url());
    return url.pathname === '/api/content/posts' && url.searchParams.get('sort') === 'relevance';
  });
  await sort.selectOption('relevance');
  await request;
  await expect(page).toHaveURL(/sort=relevance/);
  // Without a query the saved sort falls back to newest.
  await page.goto('/opportunities?sort=relevance');
  await expect(sort).toHaveValue('newest');
});

test('time slices are sent to the API, shown as chips and removable', async ({ page }, info) => {
  const requests: URL[] = [];
  await page.route('**/api/content/posts?**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        data: {
          posts: [],
          total: 0,
          facets: {
            category: {},
            workMode: {},
            payStatus: {},
            kazakhstanEligible: 0,
            relaxed: { deadline: 3 },
          },
        },
      },
    });
  });
  await page.goto('/opportunities?added=7&deadline=30');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  await expect(form.locator('[name=added]')).toHaveValue('7');
  await expect(form.locator('[name=deadline]')).toHaveValue('30');
  await expect.poll(() => requests.at(-1)?.searchParams.get('deadline')).toBe('30');
  expect(requests.at(-1)?.searchParams.get('added')).toBe('7');

  const applied = page.getByRole('list', { name: 'Применённые фильтры' });
  await expect(
    applied.getByRole('link', { name: 'Снять фильтр: Добавлено за 7 дн.' }),
  ).toBeVisible();
  await expect(
    applied.getByRole('link', { name: 'Снять фильтр: Срок подачи: до 30 дн.' }),
  ).toBeVisible();
  // Nothing matched: removing the deadline slice is offered with its result count.
  await expect(
    page
      .getByRole('list', { name: 'Что можно изменить' })
      .getByRole('link', { name: 'Снять «Срок подачи: до 30 дн.» · найдётся: 3' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.screenshot({ path: info.outputPath('time-slices.png'), fullPage: true });

  await applied.getByRole('link', { name: 'Снять фильтр: Добавлено за 7 дн.' }).press('Enter');
  await expect(page).toHaveURL(/deadline=30/);
  await expect(page).not.toHaveURL(/added=/);
});

test('hours and experience filters are sent, shown as chips and removable', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/content/posts?**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: empty });
  });
  await page.goto('/opportunities?hours=20&noExperience=true');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  await expect(form.locator('[name=hours]')).toHaveValue('20');
  await expect(form.locator('[name=noExperience]')).toHaveValue('true');
  await expect.poll(() => requests.at(-1)?.searchParams.get('hours')).toBe('20');
  expect(requests.at(-1)?.searchParams.get('noExperience')).toBe('true');

  const applied = page.getByRole('list', { name: 'Применённые фильтры' });
  await expect(
    applied.getByRole('link', { name: 'Снять фильтр: Нагрузка: до 20 ч в неделю' }),
  ).toBeVisible();
  await expect(
    applied.getByRole('link', { name: 'Снять фильтр: Опыт не требуется' }),
  ).toBeVisible();
  await applied.getByRole('link', { name: 'Снять фильтр: Опыт не требуется' }).press('Enter');
  await expect(page).toHaveURL(/hours=20/);
  await expect(page).not.toHaveURL(/noExperience/);
});
