import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import {
  commandDataSchemas,
  workDataSchema,
  type CommandData,
} from '../../src/contracts/api-responses';
import {
  projectAttachmentListSchema,
  projectAttachmentMutationSchema,
} from '../../src/contracts/project-attachments';
import type { Action } from '../../src/lib/validation';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
async function command<A extends Action>(
  api: APIRequestContext,
  action: A,
  fields: Record<string, unknown>,
) {
  const response = await api.post('/api/platform', {
    headers: { Origin: baseURL },
    data: { action, ...fields },
  });
  expect(response.status()).toBe(200);
  return parseDataResponse(commandDataSchemas[action], await response.json())
    .data as CommandData<A>;
}
async function work(api: APIRequestContext, id: string) {
  const response = await api.get('/api/platform', { params: { view: 'work', id } });
  expect(response.status()).toBe(200);
  return parseDataResponse(workDataSchema, await response.json()).data;
}
async function files(api: APIRequestContext, projectId: string) {
  const response = await api.get(`/api/projects/${projectId}/attachments`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain('"bytes"');
  expect(JSON.stringify(body)).not.toContain('"sha256"');
  return parseDataResponse(projectAttachmentListSchema, body).data.attachments;
}
async function layout(page: Page, info: TestInfo, theme: string, width: number) {
  await page.bringToFront();
  await page.setViewportSize({ width, height: 1000 });
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('combobox', { name: 'Тема оформления', exact: true }).selectOption(theme);
  const close = page.getByRole('button', { name: 'Закрыть меню', exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Read current finite transitions instead of retaining Animation.finished promises:
  // a captured promise or background requestAnimationFrame can remain pending after a viewport change.
  // Keep a short, explicit diagnostic boundary; the axe gate below still checks the settled real theme.
  const settlingState = () =>
    page.evaluate(() => {
      const background = getComputedStyle(document.body).backgroundColor;
      return {
        theme: document.documentElement.dataset.theme,
        visibility: document.visibilityState,
        fontStatus: document.fonts.status,
        background,
        finiteAnimations: document
          .getAnimations()
          .filter(
            (animation) =>
              Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
              animation.playState !== 'finished' &&
              animation.playState !== 'idle',
          )
          .map((animation) => ({
            playState: animation.playState,
            currentTime: animation.currentTime,
            endTime: animation.effect?.getComputedTiming().endTime,
            target:
              animation.effect instanceof KeyframeEffect &&
              animation.effect.target instanceof Element
                ? animation.effect.target.outerHTML.slice(0, 160)
                : null,
          })),
      };
    });
  try {
    await expect
      .poll(settlingState, {
        timeout: 10000,
        message: `F05 ${theme}/${width}: page visibility, font load or finite theme transition did not settle`,
      })
      .toMatchObject({ theme, visibility: 'visible', fontStatus: 'loaded', finiteAnimations: [] });
  } catch (error) {
    await info.attach(`attachments-${theme}-${width}-settling-failure`, {
      body: JSON.stringify(await settlingState().catch(() => ({ pageUnavailable: true }))),
      contentType: 'application/json',
    });
    throw error;
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(`attachments-${theme}-${width}-audit`, {
    body: JSON.stringify({ overflow, violations: audit.violations, incomplete: audit.incomplete }),
    contentType: 'application/json',
  });
  expect(overflow).toBe(false);
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`attachments-${theme}-${width}.png`),
    fullPage: true,
  });
  await page.getByRole('region', { name: 'Закрытые файлы проекта', exact: true }).screenshot({
    path: info.outputPath(`attachments-panel-${theme}-${width}.png`),
  });
}

test('F05: закрытый файл, сдача без ссылки, доработка и приёмка', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const textName = `ДЕМО-Ф05-обезличенные-итоги-${suffix}.txt`;
  const textBytes = Buffer.from(
    'Синтетический результат F05. Персональных данных нет.\nПроверены оба согласованных критерия.\n',
    'utf8',
  );
  const pdfName = `ДЕМО-Ф05-исходные-материалы-${suffix}.pdf`;
  const pdfBytes = Buffer.from(
    '%PDF-1.4\n% Synthetic fixture only, not a real client document.\n%%EOF\n',
  );
  const revisionName = `ДЕМО-Ф05-доработка-${suffix}.txt`;
  const revisionBytes = Buffer.from('Синтетическая доработка F05: исправлен второй критерий.\n');
  const longName = 'я'.repeat(116) + '.txt';
  const longBytes = Buffer.from('Synthetic unbound long-filename fixture F05, safe to remove.\n');
  const clientContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const strangerContext = await browser.newContext({ baseURL });
  const clientPage = await clientContext.newPage();
  const adminPage = await adminContext.newPage();
  try {
    await signInDemo(page, 'student');
    await signInDemo(clientPage, 'client');
    await signInDemo(adminPage, 'admin');
    const signup = await strangerContext.request.post('/api/auth/sign-up/email', {
      headers: { Origin: baseURL },
      data: {
        name: 'Синтетический посторонний F05',
        email: `f05-stranger-${suffix}@example.test`,
        password: `F05-${randomBytes(20).toString('hex')}`,
        adultConfirmed: true,
        privacyConsent: true,
      },
    });
    expect(signup.status()).toBe(200);
    const project = await command(clientPage.request, 'createProject', {
      title: `ДЕМО F05: проверка закрытой передачи результата ${suffix}`,
      category: 'spreadsheets',
      problem: 'Нужна проверяемая сводка по синтетическим обезличенным строкам.',
      description:
        'Явно синтетический сценарий проверки закрытых файлов. Никакие реальные документы заказчика не используются.',
      deliverables: 'Обезличенный текстовый итог с методикой и контрольными суммами.',
      acceptanceCriteria: [
        'Все синтетические строки учтены.',
        'Контрольные суммы и методика описаны.',
      ],
      skills: ['Excel'],
      difficulty: 'beginner_friendly',
      mode: 'remote',
      city: '',
      locationPrivate: '',
      contactPrivate: '',
      budgetKzt: 5000,
      estimatedHours: 2,
      dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      preferredTime: '',
    });
    const projectId = project.id;
    const endpoint = `/api/projects/${projectId}/attachments`;
    await command(clientPage.request, 'submitForModeration', { projectId });
    await command(adminPage.request, 'moderateProject', {
      projectId,
      approve: true,
      reason: 'Синтетический сценарий автоматической проверки F05.',
    });
    const application = await command(page.request, 'applyToProject', {
      projectId,
      message: 'ДЕМО: выполню синтетическую проверку критериев и передам текстовый результат.',
      links: [],
    });
    await command(clientPage.request, 'selectApplicant', {
      projectId,
      applicationId: application.id,
    });
    await page.goto(`/work/${projectId}`);
    const panel = page.getByRole('region', { name: 'Закрытые файлы проекта', exact: true });
    await expect(
      panel.getByText('Передача файлов станет доступна после обоюдного подтверждения условий.'),
    ).toBeVisible();
    await expect(panel.locator('input[type=file]')).toHaveCount(0);
    expect([403, 409]).toContain((await page.request.get(endpoint)).status());
    const agreementId = (await work(page.request, projectId)).agreements[0].id;
    await command(clientPage.request, 'approveAgreement', { projectId, agreementId });
    await command(page.request, 'approveAgreement', { projectId, agreementId });
    await page.reload();
    await expect(panel.getByText('Файлов проекта пока нет.')).toBeVisible();
    await expect(panel.getByText(/Антивирусная проверка не выполнялась/)).toBeVisible();
    // Faults are browser-only: no file is written by these intercepted commands.
    let confirmed = false,
      interceptedPosts = 0;
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: { data: { attachments: 'private-schema-marker' } } });
      interceptedPosts++;
      return route.fulfill({
        json: confirmed
          ? {
              data: {
                attachment: {
                  id: 'synthetic-response',
                  projectId,
                  uploaderId: 'demo-student',
                  filename: 'synthetic.txt',
                  mediaType: 'text/plain',
                  byteSize: 10,
                  createdAt: new Date().toISOString(),
                  submissionIds: [],
                  scanStatus: 'unscanned',
                },
              },
            }
          : { data: { attachment: 'private-schema-marker' } },
      });
    });
    await page.reload();
    await expect(panel.getByRole('alert')).toContainText('Не удалось прочитать ответ сервера.');
    await expect(panel.getByRole('alert')).not.toContainText('private-schema-marker');
    const testInput = panel.locator('input[type=file]');
    await testInput.setInputFiles({
      name: 'synthetic.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('synthetic'),
    });
    await panel.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText(
      'Ответ сервера не подтверждает выполнение.',
    );
    expect(await testInput.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe(
      'synthetic.txt',
    );
    confirmed = true;
    await panel.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText(
      'Изменение файла выполнено, но список не обновился.',
    );
    const menu = page.locator('header button[aria-controls="header-navigation"]');
    if (await menu.isVisible()) await menu.click();
    await page.locator('header .locale-switch select').selectOption('kk');
    if (await menu.isVisible()) await menu.click();
    await expect(
      page.getByRole('region', { name: 'Жобаның жабық файлдары', exact: true }).getByRole('alert'),
    ).toContainText('Файл өзгертілді');
    expect(interceptedPosts).toBe(2);
    if (await menu.isVisible()) await menu.click();
    await page.locator('header .locale-switch select').selectOption('ru');
    if (await menu.isVisible()) await menu.click();
    await page.unroute(`**${endpoint}`);
    await panel.getByRole('button', { name: 'Обновить список файлов', exact: true }).click();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    const upload = panel.getByRole('form', { name: 'Загрузка закрытого файла', exact: true });
    await upload
      .getByLabel('Файл проекта')
      .setInputFiles({ name: textName, mimeType: 'text/plain', buffer: textBytes });
    await upload.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    const ownFile = panel.getByRole('link', { name: `Скачать ${textName}`, exact: false });
    await expect(ownFile).toBeVisible();
    const stored = (await files(page.request, projectId)).find(
      (file) => file.filename === textName,
    );
    if (!stored) throw new Error('Uploaded metadata required.');
    expect(stored.scanStatus).toBe('unscanned');
    expect(stored.submissionIds).toEqual([]);

    const duplicate = await page.request.post(endpoint, {
      headers: {
        Origin: baseURL,
        'Content-Type': 'text/plain',
        'X-File-Name': encodeURIComponent(textName),
      },
      data: textBytes,
    });
    expect(duplicate.status()).toBe(200);
    expect(
      parseDataResponse(projectAttachmentMutationSchema, await duplicate.json()).data.attachment.id,
    ).toBe(stored.id);
    expect(
      (await files(page.request, projectId)).filter((file) => file.filename === textName),
    ).toHaveLength(1);
    expect(
      (
        await page.request.post(endpoint, {
          headers: {
            Origin: 'https://example.org',
            'Content-Type': 'text/plain',
            'X-File-Name': 'blocked.txt',
          },
          data: textBytes,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(endpoint, {
          headers: {
            Origin: baseURL,
            'Content-Type': 'text/plain',
            'X-File-Name': 'too-large.txt',
          },
          data: Buffer.alloc(5 * 1024 * 1024 + 1, 120),
        })
      ).status(),
    ).toBe(413);

    await upload.getByLabel('Файл проекта').setInputFiles({
      name: 'not-an-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<script>synthetic invalid image</script>'),
    });
    await upload.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Содержимое не соответствует');
    await expect(ownFile).toBeVisible();
    expect(await files(page.request, projectId)).toHaveLength(1);

    expect(longName).toHaveLength(120);
    await upload.getByLabel('Файл проекта').setInputFiles({
      name: longName,
      mimeType: 'text/plain',
      buffer: longBytes,
    });
    await upload.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    await expect(
      panel.getByRole('link', { name: `Скачать ${longName}`, exact: false }),
    ).toBeVisible();
    const longFile = (await files(page.request, projectId)).find(
      (file) => file.filename === longName,
    );
    if (!longFile) throw new Error('Long filename metadata required.');

    await clientPage.goto(`/work/${projectId}`);
    const clientPanel = clientPage.getByRole('region', {
      name: 'Закрытые файлы проекта',
      exact: true,
    });
    const clientUpload = clientPanel.getByRole('form', {
      name: 'Загрузка закрытого файла',
      exact: true,
    });
    await clientUpload
      .getByLabel('Файл проекта')
      .setInputFiles({ name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes });
    await clientUpload
      .getByRole('button', { name: 'Загрузить закрытый файл', exact: true })
      .click();
    await expect(
      clientPanel.getByRole('link', { name: `Скачать ${pdfName}`, exact: false }),
    ).toBeVisible();
    const pdf = (await files(clientPage.request, projectId)).find(
      (file) => file.filename === pdfName,
    );
    if (!pdf) throw Error('PDF metadata required.');
    const pdfResponse = await page.request.get(`/api/attachments/${pdf.id}`);
    expect(pdfResponse.status()).toBe(200);
    expect(await pdfResponse.body()).toEqual(pdfBytes);
    expect(pdfResponse.headers()['content-type']).toContain('application/octet-stream');
    expect(pdfResponse.headers()['content-disposition']).toContain('attachment;');
    expect(pdfResponse.headers()['x-content-type-options']).toBe('nosniff');
    expect(pdfResponse.headers()['cache-control']).toContain('no-store');
    for (const api of [adminPage.request, strangerContext.request]) {
      expect((await api.get(endpoint)).status()).toBe(404);
      expect((await api.get(`/api/attachments/${stored.id}`)).status()).toBe(404);
    }
    expect((await guestContext.request.get(`/api/attachments/${stored.id}`)).status()).toBe(401);
    expect([403, 404]).toContain(
      (
        await page.request.delete(`/api/attachments/${pdf.id}`, { headers: { Origin: baseURL } })
      ).status(),
    );
    const adminProjection = await adminPage.request.get('/api/platform', {
      params: { view: 'project', id: projectId },
    });
    expect(adminProjection.status()).toBe(200);
    expect(JSON.stringify(await adminProjection.json())).not.toContain(textName);
    const downloadEvent = clientPage.waitForEvent('download');
    await clientPanel.getByRole('link', { name: `Скачать ${textName}`, exact: false }).click();
    const browserDownload = await downloadEvent;
    expect(browserDownload.suggestedFilename()).toBe(textName);
    const downloadedPath = await browserDownload.path();
    expect(downloadedPath).toBeTruthy();
    expect(await readFile(downloadedPath!)).toEqual(textBytes);

    await page.reload();
    const resultForm = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Сдать результат', exact: true }) });
    await resultForm
      .getByLabel('Комментарий к сдаче')
      .fill('Синтетический текстовый файл содержит оба согласованных критерия.');
    await resultForm.getByRole('button', { name: 'Сдать результат', exact: true }).click();
    await expect(resultForm.getByRole('alert')).toContainText('хотя бы одну');
    await resultForm.getByRole('checkbox', { name: textName, exact: true }).check();
    for (const theme of ['light', 'dark'])
      for (const width of [375, 768, 1440, 1920]) await layout(page, info, theme, width);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.getByRole('button', { name: `Удалить ${longName}`, exact: true }).click();
    await expect(
      panel.getByRole('link', { name: `Скачать ${longName}`, exact: false }),
    ).toHaveCount(0);
    expect((await files(page.request, projectId)).some((file) => file.id === longFile.id)).toBe(
      false,
    );
    expect((await page.request.get(`/api/attachments/${longFile.id}`)).status()).toBe(404);
    await expect(resultForm.getByRole('checkbox', { name: textName, exact: true })).toBeChecked();
    await resultForm.getByRole('button', { name: 'Сдать результат', exact: true }).click();
    await expect(
      page.getByText('Результат передан заказчику на проверку', { exact: true }),
    ).toBeVisible();
    const first = (await work(page.request, projectId)).submissions[0];
    expect(first.links).toEqual([]);
    expect(
      (await files(page.request, projectId)).find((file) => file.id === stored.id)?.submissionIds,
    ).toEqual([first.id]);
    expect(
      (
        await page.request.delete(`/api/attachments/${stored.id}`, { headers: { Origin: baseURL } })
      ).status(),
    ).toBe(409);
    await clientPage.reload();
    const results = clientPage
      .getByRole('heading', { name: 'Результаты и приёмка', exact: true })
      .locator('..');
    await expect(
      results.getByRole('link', { name: `Скачать ${textName}`, exact: false }),
    ).toBeVisible();
    await results.getByText('Запросить конкретные правки', { exact: true }).click();
    const revisionForm = results.locator('form');
    await revisionForm.locator('input[name=criteria][value="1"]').check();
    await revisionForm
      .getByLabel('Что именно исправить?')
      .fill('Синтетическая проверка: уточните методику по второму согласованному критерию.');
    await revisionForm.getByRole('button', { name: 'Отправить замечания', exact: true }).click();
    await expect(
      clientPage.getByText('Список правок передан исполнителю', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await upload
      .getByLabel('Файл проекта')
      .setInputFiles({ name: revisionName, mimeType: 'text/plain', buffer: revisionBytes });
    await upload.getByRole('button', { name: 'Загрузить закрытый файл', exact: true }).click();
    await expect(
      panel.getByRole('link', { name: `Скачать ${revisionName}`, exact: false }),
    ).toBeVisible();
    await resultForm.getByRole('checkbox', { name: revisionName, exact: true }).check();
    await resultForm
      .getByLabel('Комментарий к сдаче')
      .fill('Синтетическая доработка: методика дополнена, второй критерий можно проверить.');
    await resultForm.getByRole('button', { name: 'Сдать результат', exact: true }).click();
    await expect(
      page.getByText('Результат передан заказчику на проверку', { exact: true }),
    ).toBeVisible();
    expect((await work(page.request, projectId)).submissions).toHaveLength(2);
    await clientPage.reload();
    await clientPage.getByRole('button', { name: 'Принять результат', exact: true }).click();
    await expect(
      clientPage.getByText('Результат принят. Подтвердите оплату и закрытие отдельно.', {
        exact: true,
      }),
    ).toBeVisible();
    expect((await work(clientPage.request, projectId)).project.status).toBe('accepted');
    const privatePortfolioLink = await page.request.post('/api/platform', {
      headers: { Origin: baseURL },
      data: {
        action: 'setPortfolio',
        projectId,
        title: 'Синтетическая проверка запрета закрытой ссылки',
        summary:
          'Синтетический текст портфолио, попытка добавить защищённую ссылку должна отклоняться.',
        role: 'Исполнитель теста',
        skills: ['Excel'],
        visibility: 'redacted_public',
        publicLinks: [`https://example.org/api//attachments/${stored.id}`],
      },
    });
    expect(privatePortfolioLink.status()).toBe(400);
    expect(await (await clientPage.request.get(`/api/attachments/${stored.id}`)).body()).toEqual(
      textBytes,
    );
    expect(await (await clientPage.request.get(`/api/attachments/${pdf.id}`)).body()).toEqual(
      pdfBytes,
    );
    const talent = await guestContext.request.get('/talent/demo-student');
    expect(talent.status()).toBe(200);
    expect(await talent.text()).not.toContain(textName);
    expect(await talent.text()).not.toContain(`/api/attachments/${stored.id}`);
  } finally {
    await Promise.all(
      [clientContext, adminContext, guestContext, strangerContext].map((context) =>
        context.close(),
      ),
    );
  }
});
