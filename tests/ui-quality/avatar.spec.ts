import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { signInDemo } from './demo-session';

test('avatar image, keyboard controls and upload error fit every theme and viewport', async ({
  page,
}, info) => {
  await signInDemo(page, 'student');
  const state = await (await page.request.get('/api/profile/avatar')).json();
  if (!state.data.avatar) {
    const bytes = await sharp({
      create: { width: 120, height: 120, channels: 3, background: '#087f8c' },
    })
      .png()
      .toBuffer();
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: 'http://localhost:3100', 'Content-Type': 'image/png' },
          data: bytes,
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto('/student/profile');
  const editor = page.getByRole('region', { name: 'Фотография профиля' });
  const file = editor.getByLabel('Файл аватара', { exact: true });
  await expect(file).toBeEnabled();
  await expect
    .poll(() => editor.getByRole('img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(120);
  await file.focus();
  await page.keyboard.press('Tab');
  await expect(
    editor.getByRole('button', { name: 'Разрешить публикацию фотографии' }),
  ).toBeFocused();
  await file.setInputFiles({
    name: 'wrong.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a photo'),
  });
  await editor.getByRole('button', { name: 'Загрузить фотографию' }).click();
  await expect(editor.getByRole('alert')).toContainText('Выберите корректное');
  await expect(editor.getByRole('img')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page }).analyze();
  await info.attach('avatar-audit', {
    body: JSON.stringify({
      mode: 'enforced',
      layout,
      violations: audit.violations,
      incomplete: audit.incomplete,
    }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('avatar.png'), fullPage: true });
});
