import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { expect, test } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

test('a student previews and downloads a private multilingual resume', async ({ page }, info) => {
  await page.goto('/student/profile');
  await expect(page).toHaveURL(/\/auth\/login/);
  await signInDemo(page, 'student');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/student/profile');
  await page.getByRole('tab', { name: 'Резюме', exact: true }).click();
  const builder = page.getByRole('region', { name: 'Конструктор резюме' });
  await builder.getByLabel('Язык заголовков').selectOption('kk');
  await builder.getByLabel('Имя', { exact: true }).fill('Әли Құсайын');
  await builder
    .getByRole('textbox', { name: 'Білім', exact: true })
    .fill('Қазақ тілі · Русский · English');
  await builder
    .getByRole('textbox', { name: 'Тәжірибе және белсенділік', exact: true })
    .fill('Жоба · 2026\n'.repeat(65).trim());
  await builder.getByRole('checkbox', { name: 'Сілтемелер', exact: true }).check();
  await builder
    .getByRole('textbox', { name: 'Сілтемелер', exact: true })
    .fill('https://example.org/work');
  const preview = builder.getByRole('region', { name: 'Предпросмотр резюме' });
  await expect(preview.getByText('Әли Құсайын')).toBeVisible();
  const email = builder.getByRole('checkbox', { name: /Добавить адрес электронной почты/ });
  await expect(email).not.toBeChecked();
  await expect(preview.getByText(/@demo\.local/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  const downloading = page.waitForEvent('download');
  await builder.getByRole('button', { name: 'Скачать PDF' }).click();
  const download = await downloading;
  const filename = info.outputPath('resume.pdf');
  await download.saveAs(filename);
  expect(download.suggestedFilename()).toBe('qosyl-resume.pdf');
  const pdf = await PDFDocument.load(await readFile(filename));
  expect(pdf.getTitle()).toBe('Әли Құсайын');
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  const annotations = pdf
    .getPages()
    .flatMap((page) => page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.asArray() ?? []);
  expect(annotations).toHaveLength(1);
  const action = pdf.context.lookup(annotations[0], PDFDict).lookup(PDFName.of('A'), PDFDict);
  expect(action.lookup(PDFName.of('URI'), PDFString).decodeText()).toBe('https://example.org/work');
  await email.check();
  await expect(preview.getByText(/@demo\.local/)).toBeVisible();
});
