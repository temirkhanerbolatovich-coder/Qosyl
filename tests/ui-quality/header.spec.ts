import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';

test('client header retains logo size and separates branding from controls', async ({
  page,
}, info) => {
  await signInDemo(page, 'client');
  await page.goto('/client/projects/new');
  const initialWidth = page.viewportSize()!.width;
  const widths = initialWidth === 768 ? [700, 701, 768, 769] : [initialWidth];
  const observations = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const locale of ['ru', 'kk'] as const) {
      await page.locator('.locale-switch select').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const rectangle = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return {
            x: bounds.x,
            y: bounds.y,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        const brand = rectangle(document.querySelector('.brand-name')!);
        const logo = rectangle(document.querySelector('.brand-logo')!);
        const controls = [...document.querySelectorAll('.qosyl-header-actions > *')].map(rectangle);
        const overlaps = controls.some(
          (control) =>
            brand.x < control.right - 1 &&
            brand.right > control.x + 1 &&
            brand.y < control.bottom - 1 &&
            brand.bottom > control.y + 1,
        );
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          brand,
          logo,
          controls,
          overlaps,
        };
      });
      observations.push({ locale, ...geometry });
      const action = page.locator('header a[href="/client/projects/new"]');
      await expect(action).toBeVisible();
      await action.focus();
      await expect(action).toBeFocused();
      await page.screenshot({ path: info.outputPath(`client-header-${width}-${locale}.png`) });
    }
  }
  await info.attach('client-header-geometry', {
    body: JSON.stringify({ mode: baselineOnly ? 'observation' : 'enforced', observations }),
    contentType: 'application/json',
  });
  if (!baselineOnly) {
    for (const observation of observations) {
      expect(observation.overlaps, JSON.stringify(observation)).toBe(false);
      expect(observation.logo.width, JSON.stringify(observation)).toBeGreaterThanOrEqual(44);
      expect(Math.abs(observation.logo.width - observation.logo.height)).toBeLessThanOrEqual(1);
      expect(observation.documentWidth).toBeLessThanOrEqual(observation.viewport + 1);
    }
  }
});
