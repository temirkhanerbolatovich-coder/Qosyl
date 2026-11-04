import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, firefox, webkit, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

type Locale = 'ru' | 'kk';
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const languageControl = (page: Page) =>
  page.locator('select[aria-label="Язык интерфейса"], select[aria-label="Интерфейс тілі"]');
const menuControl = (page: Page) => page.locator('button[aria-controls="header-navigation"]');

async function openHeader(page: Page) {
  const menu = menuControl(page);
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
}
async function closeHeader(page: Page) {
  const menu = menuControl(page);
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
    await menu.click();
}
async function setLocale(page: Page, locale: Locale) {
  await openHeader(page);
  await languageControl(page).selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await closeHeader(page);
}
async function settle(page: Page) {
  await page.bringToFront();
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          fonts: document.fonts.status,
          animations: document
            .getAnimations()
            .filter(
              (animation) =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
                !['finished', 'idle'].includes(animation.playState),
            ).length,
        })),
      {
        timeout: 10000,
        message: 'Fonts and current finite transitions must settle before locale QA',
      },
    )
    .toEqual({ fonts: 'loaded', animations: 0 });
}
async function inspect(page: Page, info: TestInfo, name: string) {
  await settle(page);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    locale: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ layout, violations: audit.violations, incomplete: audit.incomplete }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth, `${name}: document overflow`).toBeLessThanOrEqual(
    layout.viewport + 1,
  );
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    `${name}: serious/critical axe findings`,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}
const empty = { data: { posts: [] } };

test('F06a: language defaults, SSR cookie, keyboard selection and persistence', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const russianHeading = await page.getByRole('heading', { level: 1 }).innerText();
  await openHeader(page);
  await expect(languageControl(page).locator('option[value=kk]')).toHaveText('Қазақша (ішінара)');
  await languageControl(page).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await expect(page.locator('.locale-notice')).toContainText('ішінара');
  await closeHeader(page);
  const kazakhHeading = await page.getByRole('heading', { level: 1 }).innerText();
  expect(kazakhHeading).not.toBe(russianHeading);
  expect(kazakhHeading).toMatch(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/u);
  const cookie = (await page.context().cookies()).find((value) => value.name === 'qosyl-locale');
  expect(cookie).toMatchObject({
    value: 'kk',
    path: '/',
    sameSite: 'Lax',
    httpOnly: false,
    secure: false,
  });
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 86400);
  const rendered = await page.request.get('/');
  expect(rendered.status()).toBe(200);
  const html = await rendered.text();
  expect(html).toMatch(/<html[^>]*lang="kk"/);
  for (const word of kazakhHeading.split(/\s+/u).filter((value) => value.length > 5))
    expect(html).toContain(word);
  await info.attach('locale-ssr-evidence', {
    body: JSON.stringify({
      cookie: { value: cookie?.value, path: cookie?.path, sameSite: cookie?.sameSite },
      russianHeading,
      kazakhHeading,
      ssrLanguage: 'kk',
    }),
    contentType: 'application/json',
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(kazakhHeading, {
    useInnerText: true,
  });
  await openHeader(page);
  await page.locator('#header-navigation a[href="/projects"]').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await setLocale(page, 'ru');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const invalid = await browser.newContext({ baseURL, locale: 'kk-KZ' });
  try {
    await invalid.addCookies([{ name: 'qosyl-locale', value: 'unsupported', url: baseURL }]);
    const invalidPage = await invalid.newPage();
    await invalidPage.goto('/');
    await expect(invalidPage.locator('html')).toHaveAttribute('lang', 'ru');
  } finally {
    await invalid.close();
  }
});

test('F06a: switching preserves URL, pending filters and an untranslated project draft', async ({
  page,
}) => {
  await page.goto('/projects?q=Excel&category=it');
  await page.locator('input[name=q]').fill('Менің іздеуім — ещё не применено');
  await page.locator('select[name=category]').selectOption('design');
  const url = page.url();
  await setLocale(page, 'kk');
  expect(page.url()).toBe(url);
  await expect(page.locator('input[name=q]')).toHaveValue('Менің іздеуім — ещё не применено');
  await expect(page.locator('select[name=category]')).toHaveValue('design');
  await setLocale(page, 'ru');
  await expect(page.locator('input[name=q]')).toHaveValue('Менің іздеуім — ещё не применено');
  await page.goto('/opportunities?q=грант&specialty=health');
  await page.locator('input[name=q]').fill('Қазақша және русский длинный запрос');
  await page.locator('input[name=geography]').fill('Шығыс Қазақстан облысы — онлайн');
  await page.locator('select[name=specialty]').selectOption('engineering');
  const opportunitiesURL = page.url();
  await setLocale(page, 'kk');
  expect(page.url()).toBe(opportunitiesURL);
  await expect(page.locator('input[name=q]')).toHaveValue('Қазақша және русский длинный запрос');
  await expect(page.locator('input[name=geography]')).toHaveValue(
    'Шығыс Қазақстан облысы — онлайн',
  );
  await expect(page.locator('select[name=specialty]')).toHaveValue('engineering');
  await signInDemo(page, 'client');
  await page.goto('/client/projects/new');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.locale-notice')).toContainText('ішінара');
  await page.locator('input[name=title]').fill('Менің тапсырмам — мой неизменённый черновик');
  await page
    .locator('textarea[name=description]')
    .fill('Самостоятельно введённый объём остаётся на месте при смене языка интерфейса.');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      ['/api/platform', '/api/leads'].includes(new URL(request.url()).pathname)
    )
      mutations.push(request.url());
  });
  const draftURL = page.url();
  await setLocale(page, 'ru');
  await setLocale(page, 'kk');
  expect(page.url()).toBe(draftURL);
  await expect(page.locator('input[name=title]')).toHaveValue(
    'Менің тапсырмам — мой неизменённый черновик',
  );
  await expect(page.locator('textarea[name=description]')).toHaveValue(
    'Самостоятельно введённый объём остаётся на месте при смене языка интерфейса.',
  );
  expect(mutations).toEqual([]);
});

test('F06a: translated public layouts remain readable across languages, themes and widths', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  for (const locale of ['ru', 'kk'] as const) {
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(width === 375 || width === 1440 ? '/' : '/opportunities');
        await setLocale(page, locale);
        await openHeader(page);
        await page.locator('.theme-switch:not(.locale-switch) select').selectOption(theme);
        await closeHeader(page);
        await inspect(page, info, `locale-${locale}-${theme}-${width}`);
      }
    }
  }
});

test('F06a: opportunity loading, empty and failed responses stay distinct in Kazakh', async ({
  page,
}, info) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let phase: 'hold' | 'empty' | 'error' = 'hold';
  await page.route('**/api/content/posts?**', async (route) => {
    if (phase === 'hold') await hold;
    await route.fulfill(
      phase === 'error'
        ? { status: 503, json: { error: 'Synthetic upstream failure, not a live source' } }
        : { json: empty },
    );
  });
  await page.goto('/opportunities');
  await setLocale(page, 'kk');
  const loading = page
    .getByRole('status')
    .filter({ hasText: /мүмкіндіктер|Мүмкіндіктер|ізде|Ізде/u });
  await expect(loading).toBeVisible();
  phase = 'empty';
  release();
  await expect(loading).toHaveCount(0);
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByText(
      'Сұрауыңыз бойынша жарияланған материал әзірше жоқ. Жаңа материалдарды алдымен әкімші тексереді.',
      { exact: true },
    ),
  ).toBeVisible();
  await info.attach('empty-opportunities-copy', {
    body: await page.locator('main').innerText(),
    contentType: 'text/plain',
  });
  phase = 'error';
  await page.reload();
  const failure = page.locator('main').getByRole('alert');
  await expect(failure).toBeVisible();
  const kazakhError = await failure.innerText();
  expect(kazakhError).not.toContain('Не удалось загрузить возможности');
  expect(kazakhError).toMatch(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/u);
  await inspect(page, info, 'locale-kk-opportunities-error');
  await setLocale(page, 'ru');
  await expect(failure).toContainText('Не удалось загрузить возможности');
});

test('F06a: Kazakh text-size and reflow proxies, with honest browser availability evidence', async ({
  page,
}, info) => {
  await page.route('**/api/content/posts?**', (route) => route.fulfill({ json: empty }));
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/opportunities');
  await setLocale(page, 'kk');
  await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        'h1,h2,h3,p,a,label,small,span,strong,summary,legend,input,select,button,textarea',
      ),
    ];
    const sizes = elements.map((element) => ({
      element,
      size: parseFloat(getComputedStyle(element).fontSize),
    }));
    for (const { element, size } of sizes)
      if (Number.isFinite(size))
        element.style.setProperty('font-size', `${size * 2}px`, 'important');
  });
  const headerGeometry = await page.locator('header').evaluate((header) => {
    const bounds = header.getBoundingClientRect();
    const brand = header.querySelector('.brand-name')!.getBoundingClientRect();
    return {
      headerTop: bounds.top,
      headerBottom: bounds.bottom,
      brandTop: brand.top,
      brandBottom: brand.bottom,
    };
  });
  expect(headerGeometry.brandTop).toBeGreaterThanOrEqual(headerGeometry.headerTop);
  expect(headerGeometry.brandBottom).toBeLessThanOrEqual(headerGeometry.headerBottom);
  const skipLink = page.locator('.skip-link');
  expect(
    await skipLink.evaluate((link) => link.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);
  await inspect(page, info, 'locale-kk-computed-text-200percent-reflow-640');
  await skipLink.focus();
  await expect(skipLink).toBeInViewport();
  expect(
    await skipLink.evaluate((link) => link.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0);
  await info.attach('browser-and-zoom-scope', {
    body: JSON.stringify({
      chromium: 'executed by configured project',
      firefox: { executablePresent: existsSync(firefox.executablePath()), executed: false },
      webkit: { executablePresent: existsSync(webkit.executablePath()), executed: false },
      resize: {
        computedTextScale: 2,
        viewportCSSPixels: 640,
        nativeBrowserZoom: false,
        physicalDevice: false,
      },
      screenReaderExecuted: false,
    }),
    contentType: 'application/json',
  });
});
