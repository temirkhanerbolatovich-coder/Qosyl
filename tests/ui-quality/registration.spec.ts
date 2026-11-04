import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';

for (const locale of ['ru', 'kk'] as const) {
  test(`registration ${locale}: independent email and Google consents have accessible targets`, async ({
    page,
  }, info) => {
    await page.goto('/auth/register');
    await page.locator('.locale-switch select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const email = page.locator('main form').filter({ has: page.locator('input[name="email"]') });
    const google = page.locator('main form').filter({
      has: page.getByRole('button', {
        name: locale === 'ru' ? 'Зарегистрироваться через Google' : 'Google арқылы тіркелу',
        exact: true,
      }),
    });
    await expect(email).toBeVisible();
    await expect(google).toBeVisible();
    const commands: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') commands.push(new URL(request.url()).pathname);
    });
    await email.locator('[name="name"]').fill('Синтетический черновик регистрации');
    await email.locator('[name="email"]').fill('unsent-ui-registration@example.test');
    await email.locator('[name="password"]').fill('Synthetic-unsent-password-123');
    await email.locator('[name="confirmPassword"]').fill('Synthetic-unsent-password-123');
    const emailConsent = email.getByRole('checkbox');
    await emailConsent.nth(0).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(emailConsent.nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(emailConsent.nth(0)).toBeChecked();
    await expect(emailConsent.nth(1)).toBeChecked();

    // Email consent must not authorize a separate Google registration.
    const googleConsent = google.getByRole('checkbox');
    await expect(googleConsent.nth(0)).not.toBeChecked();
    await expect(googleConsent.nth(1)).not.toBeChecked();
    await google.getByRole('button', { name: /Google/u }).click();
    await expect(googleConsent.nth(0)).toBeFocused();
    await page.keyboard.press('Space');
    await google.getByRole('button', { name: /Google/u }).click();
    await expect(googleConsent.nth(1)).toBeFocused();
    await expect(emailConsent.nth(0)).toBeChecked();
    await expect(emailConsent.nth(1)).toBeChecked();
    expect(commands).toEqual([]);

    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const targets = await page.locator('main form input[type="checkbox"]').evaluateAll((inputs) =>
      inputs.map((input) => {
        const bounds = input.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
    );
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await info.attach(`registration-${locale}-audit`, {
      body: JSON.stringify({
        mode: baselineOnly ? 'observation' : 'enforced',
        layout,
        targets,
        violations: audit.violations,
        incomplete: audit.incomplete,
      }),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: info.outputPath(`registration-${locale}.png`),
      fullPage: true,
    });
    if (!baselineOnly) {
      await expect(email).toHaveAttribute(
        'aria-label',
        locale === 'ru' ? 'Регистрация по email' : 'Email арқылы тіркелу',
      );
      await expect(google).toHaveAttribute(
        'aria-label',
        locale === 'ru' ? 'Регистрация через Google' : 'Google арқылы тіркелу',
      );
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(24);
        expect(target.height).toBeGreaterThanOrEqual(24);
      }
      expect(
        audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
      ).toEqual([]);
    }
  });
}
