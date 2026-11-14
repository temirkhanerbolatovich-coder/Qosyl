import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

const post = (id: string, category: string) => ({
  id,
  title: `Карточка ${id}`,
  summary: 'Пример карточки.',
  category,
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
const favorite = (id: string, category: string, note: string | null) => ({
  id: `favorite-${id}`,
  itemId: id,
  createdAt: '2026-11-13T00:00:00.000Z',
  reminderDaysBefore: null,
  note,
  post: post(id, category),
});

test('favorites can be filtered by type and carry a private note', async ({ page }, info) => {
  await signInDemo(page, 'student');
  let note: string | null = 'Подготовить портфолио';
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/opportunities/saved', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (command.action === 'setFavoriteNote') note = command.note || null;
      return route.fulfill({ json: { data: { saved: true } } });
    }
    return route.fulfill({
      json: {
        data: {
          favorites: [
            favorite('grant-one', 'grant', note),
            favorite('internship-one', 'internship', null),
            favorite('internship-two', 'internship', null),
          ],
          searches: [],
        },
      },
    });
  });
  await page.goto('/opportunities/saved');
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(3);

  const filter = page.getByLabel('Показать тип');
  await expect(filter.locator('option')).toHaveText([
    'Все типы',
    'Грант (1)',
    'Стажировка / практика (2)',
  ]);
  await filter.selectOption('internship');
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('Карточка grant-one')).toBeHidden();
  await filter.selectOption('');
  await expect(cards).toHaveCount(3);

  const grant = cards.filter({ hasText: 'Карточка grant-one' });
  // Note and reminder sit in a disclosure; the summary already says a note exists.
  await expect(grant.getByText('есть заметка')).toBeVisible();
  await grant.getByText('Заметка и напоминание').click();
  const field = grant.getByLabel('Моя заметка');
  await expect(field).toHaveValue('Подготовить портфолио');
  await expect(grant.getByRole('button', { name: 'Сохранить заметку' })).toBeDisabled();
  await field.fill('Спросить рекомендателя');
  await expect(grant.getByText('Видна только вам')).toContainText('22');
  await grant.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect
    .poll(() => commands.at(-1))
    .toEqual({
      action: 'setFavoriteNote',
      favoriteId: 'favorite-grant-one',
      note: 'Спросить рекомендателя',
    });
  await expect(page.getByText('Заметка сохранена.')).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('favorites.png'), fullPage: true });
});

test('two or three favorites of one type can be compared side by side', async ({ page }, info) => {
  await signInDemo(page, 'student');
  await page.route('**/api/opportunities/saved', (route) =>
    route.fulfill({
      json: {
        data: {
          favorites: [
            favorite('grant-one', 'grant', null),
            {
              ...favorite('internship-one', 'internship', null),
              post: {
                ...post('internship-one', 'internship'),
                workMode: 'remote',
                workload: '15–20 часов в неделю',
                payStatus: 'unpaid',
                kazakhstanEligible: true,
              },
            },
            favorite('internship-two', 'internship', null),
          ],
          searches: [],
        },
      },
    }),
  );
  await page.goto('/opportunities/saved');
  const cards = page.getByRole('article');
  const one = cards.filter({ hasText: 'Карточка internship-one' }).getByLabel('Сравнить');
  const two = cards.filter({ hasText: 'Карточка internship-two' }).getByLabel('Сравнить');
  const grant = cards.filter({ hasText: 'Карточка grant-one' }).getByLabel('Сравнить');
  await expect(page.getByRole('region', { name: 'Сравнение возможностей' })).toHaveCount(0);

  await one.check();
  // One type per comparison: the grant cannot join an internship.
  await expect(grant).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Сравнение возможностей' })).toHaveCount(0);
  await two.check();
  // Selection alone does not open the table; the explicit button does.
  await expect(page.getByRole('region', { name: 'Сравнение возможностей' })).toHaveCount(0);
  await expect(page.getByText('Выбрано: 2 из 3')).toBeVisible();
  await page.getByRole('button', { name: 'Сравнить (2)' }).click();
  const compare = page.getByRole('region', { name: 'Сравнение возможностей' });
  const table = compare.getByRole('table', { name: 'Сравнение выбранных возможностей' });
  await expect(table.getByRole('columnheader', { name: 'Карточка internship-one' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Карточка internship-two' })).toBeVisible();
  // Known values are shown; unknown ones stay "to clarify" instead of turning into a "no".
  await expect(table.getByRole('row', { name: /Нагрузка/ })).toContainText('15–20 часов в неделю');
  await expect(table.getByRole('row', { name: /Нагрузка/ })).toContainText(
    'Уточнить у организатора',
  );
  await expect(table.getByRole('row', { name: /Оплата/ })).toContainText('Без оплаты');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('compare.png'), fullPage: true });

  await compare.getByRole('button', { name: 'Закрыть сравнение' }).click();
  await expect(compare).toHaveCount(0);
  await expect(one).not.toBeChecked();
  await expect(grant).toBeEnabled();
});
