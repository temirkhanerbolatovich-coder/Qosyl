import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { applicationsDataSchema } from '../../src/contracts/api-responses';
import { signInDemo } from './demo-session';

const projectId = 'demo-it';
const publicStudentId = 'test-candidate-public';
const hiddenStudentId = 'test-candidate-hidden';
const fallbackStudentId = 'test-candidate-fallback';
const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwCqgwCqhggFAAGk4D6c8pJKYAAAAASUVORK5CYII=',
  'base64',
);

async function setKazakh(page: Page) {
  const menu = page.locator('button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('.locale-switch select').selectOption('kk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  if (await menu.isVisible()) await menu.click();
}

async function inspect(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ mode: baselineOnly ? 'observation' : 'enforced', layout, ...audit }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  if (!baselineOnly) {
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(
      audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    ).toEqual([]);
  }
}

test('applicant cards show available profiles and respect hidden fields', async ({
  page,
}, info) => {
  await signInDemo(page, 'client');
  const response = await page.request.get('/api/platform', {
    params: { view: 'applications', projectId },
  });
  expect(response.status()).toBe(200);
  const { project } = (await response.json()).data;
  const time = '2026-11-15T00:00:00.000Z';
  const candidate = (
    id: string,
    name: string,
    options: { available: boolean; photo: string | null; hiddenEducation: boolean },
  ) => ({
    id: `application-${id}`,
    projectId,
    studentId: id,
    message: `Тестовое сообщение: ${name}`,
    links: ['https://example.com/synthetic-work'],
    status: 'active' as const,
    createdAt: time,
    updatedAt: time,
    student: {
      id,
      name,
      demo: true,
      profileAvailable: options.available,
      avatarRevision: options.photo,
      confirmedWorks: options.available ? 2 : null,
      externalWorks: [],
      studentProfile: {
        userId: id,
        bio: '',
        headline: options.hiddenEducation ? '' : 'Тестовый дизайнер',
        studyYear: options.hiddenEducation ? null : 3,
        languages: [],
        experiences: [],
        profileLinks: [],
        hiddenFields: options.hiddenEducation ? ['headline', 'education', 'skills'] : [],
        city: '',
        institution: options.hiddenEducation ? '' : 'Учебный университет',
        discipline: '',
        weeklyHours: 5,
        skills: options.hiddenEducation ? [] : ['Тестовый навык'],
        formats: ['remote'],
        isPublic: options.available,
        updatedAt: time,
      },
    },
  });
  const data = applicationsDataSchema.parse({
    project,
    applications: [
      candidate(publicStudentId, 'Айдар Тестовый', {
        available: true,
        photo: 'test-revision-public',
        hiddenEducation: false,
      }),
      candidate(hiddenStudentId, 'Мира Тестовая', {
        available: false,
        photo: null,
        hiddenEducation: true,
      }),
      candidate(fallbackStudentId, 'Самат Тестовый', {
        available: true,
        photo: 'test-revision-missing',
        hiddenEducation: false,
      }),
    ],
  });
  await page.route('**/api/platform?**', (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get('view') === 'applications'
      ? route.fulfill({ json: { data } })
      : route.continue();
  });
  await page.route('**/api/avatars/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    return pathname.endsWith(`/${publicStudentId}`)
      ? route.fulfill({ status: 200, contentType: 'image/png', body: sampleImage })
      : route.fulfill({ status: 404 });
  });

  await page.goto(`/client/projects/${projectId}/applications`);
  const publicCard = page.locator('article.panel').filter({ hasText: 'Айдар Тестовый' });
  const hiddenCard = page.locator('article.panel').filter({ hasText: 'Мира Тестовая' });
  const fallbackCard = page.locator('article.panel').filter({ hasText: 'Самат Тестовый' });
  const profileLink = publicCard.getByRole('link', { name: 'Открыть профиль', exact: true });
  await expect(profileLink).toHaveAttribute('href', `/talent/${publicStudentId}`);
  await expect(publicCard.getByText('Тестовый дизайнер', { exact: true })).toBeVisible();
  await expect(publicCard.getByText('Учебный университет', { exact: true })).toBeVisible();
  await expect(publicCard).toContainText('3 курс');
  await expect(publicCard.getByText('Тестовый навык', { exact: true })).toBeVisible();
  await expect(publicCard.getByText('Подтверждённые работы · 2', { exact: true })).toBeVisible();
  await expect(publicCard.getByRole('img', { name: 'Айдар Тестовый' })).toBeVisible();
  await expect
    .poll(() => publicCard.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(hiddenCard.getByText('Профиль скрыт исполнителем', { exact: true })).toBeVisible();
  await expect(hiddenCard.getByRole('link', { name: 'Открыть профиль' })).toHaveCount(0);
  await expect(hiddenCard.getByText('Учебный университет')).toHaveCount(0);
  await expect(hiddenCard.getByText('Тестовый навык')).toHaveCount(0);
  await expect(hiddenCard.getByText(/Подтверждённые работы/)).toHaveCount(0);
  await expect(hiddenCard.locator('img')).toHaveCount(0);
  await expect(fallbackCard.locator('.avatar[aria-label="Самат Тестовый"]')).toBeVisible();
  await expect(publicCard.getByRole('link', { name: /Работа 1/ })).toHaveAttribute(
    'href',
    'https://example.com/synthetic-work',
  );
  await publicCard.getByRole('button', { name: 'Выбрать исполнителя' }).focus();
  await page.keyboard.press('Tab');
  await expect(profileLink).toBeFocused();

  await publicCard.getByRole('button', { name: 'Выбрать исполнителя' }).click();
  await expect(publicCard.getByRole('button', { name: 'Подтвердить выбор' })).toBeVisible();
  await publicCard.getByRole('button', { name: 'Отмена' }).click();
  await inspect(page, info, 'applicant-cards-ru');

  await setKazakh(page);
  await expect(publicCard.getByRole('link', { name: 'Профильді ашу' })).toHaveAttribute(
    'href',
    `/talent/${publicStudentId}`,
  );
  await expect(hiddenCard.getByText('Профильді орындаушы жасырды', { exact: true })).toBeVisible();
  await expect(publicCard.getByText('Расталған жұмыстар · 2', { exact: true })).toBeVisible();
  await expect(publicCard).toContainText('3-курс');
  await inspect(page, info, 'applicant-cards-kk');

  const kazakhProfileLink = publicCard.getByRole('link', { name: 'Профильді ашу' });
  await publicCard.getByRole('button', { name: 'Орындаушыны таңдау' }).focus();
  await page.keyboard.press('Tab');
  await expect(kazakhProfileLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/talent/${publicStudentId}$`));
});

test('applicant loading errors retain retry rather than showing candidates', async ({ page }) => {
  await signInDemo(page, 'client');
  await page.route('**/api/platform?**', (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get('view') === 'applications'
      ? route.fulfill({ status: 403, json: { error: 'Синтетическая ошибка доступа' } })
      : route.continue();
  });
  await page.goto(`/client/projects/${projectId}/applications`);
  await expect(page.getByRole('heading', { name: 'Не удалось открыть страницу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  await expect(page.getByText('Профиль скрыт исполнителем')).toHaveCount(0);
});
