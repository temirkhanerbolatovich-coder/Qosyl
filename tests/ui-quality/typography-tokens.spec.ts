import { expect, test, type Page } from '@playwright/test';
import { signInDemo } from './demo-session';

/** The shipped sizes in px for a viewport width: clamp(min, vw, max). */
const clamp = (min: number, vw: number, max: number, width: number) =>
  Math.min(Math.max(min, (vw / 100) * width), max);

async function measure(page: Page) {
  return page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'token-probe';
    host.innerHTML = [
      '<h1>h1</h1>',
      '<h2>h2</h2>',
      '<h3>h3</h3>',
      '<h4>h4</h4>',
      '<p class="text-display">display</p>',
      '<p class="text-body-lg">body-lg</p>',
      '<p class="text-body">body</p>',
      '<p class="text-body-sm">body-sm</p>',
      '<p class="text-caption">caption</p>',
      '<p class="text-numeric">1 234</p>',
      '<div class="surface-flat">flat</div>',
      '<div class="surface-raised">raised</div>',
      '<div class="surface-overlay">overlay</div>',
    ].join('');
    document.body.append(host);
    const style = (selector: string) => getComputedStyle(host.querySelector(selector)!);
    const size = (selector: string) => parseFloat(style(selector).fontSize);
    const result = {
      h1: size('h1'),
      h2: size('h2'),
      h3: size('h3'),
      h4: size('h4'),
      display: size('.text-display'),
      bodyLg: size('.text-body-lg'),
      body: size('.text-body'),
      bodySm: size('.text-body-sm'),
      caption: size('.text-caption'),
      captionWeight: style('.text-caption').fontWeight,
      h1Line: parseFloat(style('h1').lineHeight) / size('h1'),
      bodyLine: parseFloat(style('.text-body').lineHeight) / size('.text-body'),
      numeric: style('.text-numeric').fontVariantNumeric,
      flat: style('.surface-flat').boxShadow,
      raised: style('.surface-raised').boxShadow,
      overlay: style('.surface-overlay').boxShadow,
      overlayBorder: style('.surface-overlay').borderTopWidth,
      flatBorder: style('.surface-flat').borderTopWidth,
    };
    host.remove();
    return result;
  });
}

test('text roles and surface levels resolve to the shipped sizes in the browser', async ({
  page,
}) => {
  await page.goto('/help');
  const width = page.viewportSize()!.width;
  const m = await measure(page);
  expect(m.h1).toBeCloseTo(clamp(32, 3.2, 44, width), 1);
  expect(m.h2).toBeCloseTo(clamp(24, 2.2, 32, width), 1);
  expect(m.h3).toBe(22);
  expect(m.h4).toBe(18);
  expect(m.display).toBeCloseTo(clamp(34, 4.2, 56, width), 1);
  expect(m.bodyLg).toBe(17);
  expect(m.body).toBe(16);
  expect(m.bodySm).toBe(14);
  expect(m.caption).toBe(12);
  expect(m.captionWeight).toBe('500');
  expect(m.h1Line).toBeCloseTo(1.15, 2);
  expect(m.bodyLine).toBeCloseTo(1.6, 2);
  expect(m.numeric).toContain('tabular-nums');
  expect(m.flat).toBe('none');
  expect(m.raised).not.toBe('none');
  expect(m.overlay).not.toBe('none');
  expect(m.flatBorder).toBe('1px');
  expect(m.overlayBorder).toBe('0px');
});

test('no page sets a font size by hand, and the panel titles use the h4 role', async ({ page }) => {
  await page.goto('/help');
  await expect(page.locator('main h2.text-h4').first()).toBeVisible();
  expect(await page.locator('[style*="font-size"]').count()).toBe(0);
  const help = await page
    .locator('main h2.text-h4')
    .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
  expect(help.length).toBeGreaterThan(0);
  expect(new Set(help)).toEqual(new Set([18]));

  await signInDemo(page, 'client');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Следующий шаг' })).toBeVisible();
  expect(await page.locator('[style*="font-size"]').count()).toBe(0);
  for (const name of ['Уведомления', 'Следующий шаг']) {
    const heading = page.getByRole('heading', { name, exact: true });
    await expect(heading).toHaveClass(/text-h4/);
    expect(await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBe(18);
  }
});
