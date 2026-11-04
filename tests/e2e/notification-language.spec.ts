import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInDemo } from '../ui-quality/demo-session';

test('recipient language is separate from interface and applies only to new notifications', async ({
  browser,
}, info) => {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
  const database = new URL(process.env.DATABASE_URL ?? 'invalid:');
  if (
    process.env.E2E_EXTERNAL_SERVER ||
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(database.pathname) ||
    !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    !['http://localhost:3100', 'http://127.0.0.1:3100'].includes(base)
  )
    throw new Error('Only the isolated local E2E setup is allowed.');
  const studentContext = await browser.newContext({ baseURL: base });
  const clientContext = await browser.newContext({ baseURL: base });
  const student = await studentContext.newPage();
  const client = await clientContext.newPage();
  try {
    expect((await student.request.get('/api/notification-language')).status()).toBe(401);
    await signInDemo(student, 'student');
    await signInDemo(client, 'client');
    const invalid = await student.request.post('/api/notification-language', {
      headers: { Origin: base },
      data: { language: 'kk', userId: 'other' },
    });
    expect(invalid.status()).toBe(400);
    const foreignOrigin = await student.request.post('/api/notification-language', {
      headers: { Origin: 'https://example.test' },
      data: { language: 'kk' },
    });
    expect(foreignOrigin.status()).toBe(403);
    await student.goto('/dashboard');
    const selector = student.getByLabel('Язык новых уведомлений');
    await expect(selector).toBeEnabled();
    const before = (await (await student.request.get('/api/platform?view=dashboard')).json()).data
      .notifications;
    await selector.selectOption('kk');
    await student.getByRole('button', { name: 'Сохранить язык уведомлений' }).click();
    await expect(
      student.getByRole('status').filter({ hasText: 'Язык уведомлений сохранён.' }),
    ).toBeVisible();
    await student.reload();
    await expect(selector).toHaveValue('kk');
    expect(
      (await (await student.request.get('/api/platform?view=dashboard')).json()).data.notifications,
    ).toEqual(before);
    expect(
      (await (await client.request.get('/api/notification-language')).json()).data.language,
    ).toBe('ru');
    for (const width of [375, 768, 1440, 1920]) {
      await student.setViewportSize({ width, height: 900 });
      const layout = await student.evaluate(() => ({
        view: innerWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(layout.page).toBeLessThanOrEqual(layout.view + 1);
      const audit = await new AxeBuilder({ page: student })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([]);
      await student
        .getByRole('region', { name: 'Уведомления' })
        .screenshot({ path: info.outputPath(`notifications-${width}.png`) });
    }
    const projects = (await (await student.request.get('/api/platform?view=catalog')).json()).data
      .projects;
    const project = projects.find(
      (item: { demo: boolean; demoApplicationsAllowed?: boolean }) =>
        item.demo && item.demoApplicationsAllowed,
    );
    expect(project, 'an enabled isolated demo project').toBeTruthy();
    const apply = await student.request.post('/api/platform', {
      headers: { Origin: base },
      data: {
        action: 'applyToProject',
        projectId: project.id,
        message: 'Синтетический отклик на тестовую задачу.',
        links: [],
      },
    });
    expect(apply.status()).toBe(200);
    const application = (await apply.json()).data;
    const choose = await client.request.post('/api/platform', {
      headers: { Origin: base },
      data: { action: 'selectApplicant', projectId: project.id, applicationId: application.id },
    });
    expect(choose.status()).toBe(200);
    const received = (await (await student.request.get('/api/platform?view=dashboard')).json()).data
      .notifications;
    expect(
      received.some(
        (item: { text: string }) =>
          item.text === 'Сізді таңдады. Жұмысты бастамас бұрын шарттарды растаңыз.',
      ),
    ).toBe(true);
    const clientInbox = (await (await client.request.get('/api/platform?view=dashboard')).json())
      .data.notifications;
    expect(
      clientInbox.some((item: { text: string }) => item.text === 'Новый отклик на заказ.'),
    ).toBe(true);
  } finally {
    await studentContext.close();
    await clientContext.close();
  }
});
