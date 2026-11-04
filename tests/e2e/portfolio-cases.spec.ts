import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
const draft = {
  title: 'Личный кейс A',
  description: 'Описание без подтверждения',
  role: 'Дизайнер',
  problem: 'Неудобная таблица',
  contribution: 'Переработал структуру',
  period: '2026',
  tools: ['Excel'],
  result: 'Учебный результат',
  url: 'https://example.com/case',
  links: [],
  visibility: 'draft',
  publicationAllowed: false,
};
test('independent cases preserve identities, privacy, order and profile data', async ({
  page,
  browser,
}) => {
  await signInDemo(page, 'student');
  const api = page.request;
  const own = (await (await api.get('/api/profile')).json()).data;
  const command = async (body: unknown) =>
    api.post('/api/profile/portfolio', {
      headers: { Origin: 'http://localhost:3100' },
      data: body,
    });
  const list = async () => (await (await api.get('/api/profile/portfolio')).json()).data.items;
  await page.goto('/student/profile');
  await page.getByRole('tab', { name: 'Портфолио', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить кейс', exact: true }).click();
  const form = page.getByRole('form', { name: 'Редактор кейса' });
  await form.getByLabel('Название кейса', { exact: true }).fill(draft.title);
  await form.getByLabel('Мой вклад', { exact: true }).fill('Закрытый вклад 123');
  await form.getByRole('button', { name: 'Сохранить кейс', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Портфолио сохранено' })).toBeVisible();
  let a = (await list()).find((i: { title: string }) => i.title === draft.title);
  expect(a.visibility).toBe('draft');
  const id = a.id;
  expect(
    (
      await command({
        action: 'update',
        id,
        revision: a.revision,
        data: { ...draft, visibility: 'public' },
      })
    ).status(),
  ).toBe(400);
  const guest = await browser.newContext();
  const client = await browser.newPage();
  await signInDemo(client, 'client');
  try {
    expect(
      (
        await guest.request.post('/api/profile/portfolio', {
          headers: { Origin: 'http://localhost:3100' },
          data: { action: 'delete', id, revision: a.revision },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await client.request.post('/api/profile/portfolio', {
          headers: { Origin: 'http://localhost:3100' },
          data: { action: 'delete', id, revision: a.revision },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api.post('/api/profile/portfolio', {
          headers: { Origin: 'https://evil.example' },
          data: { action: 'delete', id, revision: a.revision },
        })
      ).status(),
    ).toBe(403);
    await api.post('/api/profile', {
      headers: { Origin: 'http://localhost:3100' },
      data: { role: 'student', name: own.name, city: 'Семей', isPublic: true },
    });
    let html = await (await guest.request.get(`/talent/${own.id}`)).text();
    expect(html).not.toContain('Закрытый вклад 123');
    expect(html).not.toContain(draft.title);
    expect(
      (
        await command({
          action: 'update',
          id,
          revision: a.revision,
          data: { ...draft, visibility: 'public', publicationAllowed: true },
        })
      ).ok(),
    ).toBe(true);
    expect((await command({ action: 'delete', id, revision: a.revision })).status()).toBe(409);
    a = (await list()).find((i: { id: string }) => i.id === id);
    expect(a.id).toBe(id);
    html = await (await guest.request.get(`/talent/${own.id}`)).text();
    expect(html).toContain(draft.title);
    expect(html).toContain('self_reported');
    expect(
      (
        await command({
          action: 'create',
          data: {
            ...draft,
            title: 'Личный кейс B',
            visibility: 'public',
            publicationAllowed: true,
          },
        })
      ).ok(),
    ).toBe(true);
    let items = await list();
    const reordered = [...items]
      .reverse()
      .map(({ id, revision }: { id: string; revision: string }) => ({ id, revision }));
    expect((await command({ action: 'reorder', items: reordered })).ok()).toBe(true);
    expect((await command({ action: 'reorder', items: reordered })).status()).toBe(409);
    items = await list();
    expect(items.map((i: { id: string }) => i.id)).toEqual(reordered.map((i) => i.id));
    const visible = await guest.newPage();
    await visible.goto(`/talent/${own.id}`);
    const titles = await visible
      .locator('[aria-labelledby="external-work-heading"] h3')
      .allTextContents();
    expect(titles.indexOf('Личный кейс B')).toBeLessThan(titles.indexOf(draft.title));
    const before = await list();
    expect(
      (
        await api.post('/api/profile', {
          headers: { Origin: 'http://localhost:3100' },
          data: { role: 'student', name: own.name, city: 'Семей', externalWorks: [] },
        })
      ).status(),
    ).toBe(409);
    expect(await list()).toEqual(before);
    expect(
      (
        await api.post('/api/profile', {
          headers: { Origin: 'http://localhost:3100' },
          data: { role: 'student', name: own.name, city: 'Семей', bio: 'Сохранён отдельно' },
        })
      ).ok(),
    ).toBe(true);
    expect(await list()).toEqual(before);
    a = items.find((i: { id: string }) => i.id === id);
    expect(
      (
        await command({
          action: 'update',
          id,
          revision: a.revision,
          data: { ...draft, visibility: 'private' },
        })
      ).ok(),
    ).toBe(true);
    expect(await (await guest.request.get(`/talent/${own.id}`)).text()).not.toContain(draft.title);
    a = (await list()).find((i: { id: string }) => i.id === id);
    expect((await command({ action: 'delete', id, revision: a.revision })).ok()).toBe(true);
    expect((await list()).some((i: { id: string }) => i.id === id)).toBe(false);
    // Different student session cannot edit even when the exact ID and revision are known.
    const other = await browser.newContext();
    try {
      const registration = await other.request.post('/api/auth/sign-up/email', {
        headers: { Origin: 'http://localhost:3100' },
        data: {
          name: 'Другой студент',
          email: `portfolio-${Date.now()}@example.test`,
          password: 'Portfolio-Test-Password-123',
          adultConfirmed: true,
          privacyConsent: true,
        },
      });
      expect(registration.ok()).toBe(true);
      expect(
        (
          await other.request.post('/api/profile', {
            headers: { Origin: 'http://localhost:3100' },
            data: { role: 'student', name: 'Другой студент', city: 'Семей' },
          })
        ).ok(),
      ).toBe(true);
      const b = (await list())[0];
      expect(
        (
          await other.request.post('/api/profile/portfolio', {
            headers: { Origin: 'http://localhost:3100' },
            data: { action: 'delete', id: b.id, revision: b.revision },
          })
        ).status(),
      ).toBe(404);
    } finally {
      await other.close();
    }
  } finally {
    await guest.close();
    await client.close();
  }
});

test('case quota, concurrent revisions and request boundaries are enforced', async ({
  page,
  browser,
}) => {
  const origin = 'http://localhost:3100';
  const registration = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: origin },
    data: {
      name: 'Проверка лимитов',
      email: `case-quota-${Date.now()}@example.test`,
      password: 'Portfolio-Test-Password-123',
      adultConfirmed: true,
      privacyConsent: true,
    },
  });
  expect(registration.ok()).toBe(true);
  expect(
    (
      await page.request.post('/api/profile', {
        headers: { Origin: origin },
        data: { role: 'student', name: 'Проверка лимитов', city: 'Семей' },
      })
    ).ok(),
  ).toBe(true);
  const command = (data: unknown) =>
    page.request.post('/api/profile/portfolio', { headers: { Origin: origin }, data });
  expect(
    (await command({ action: 'create', data: { ...draft, source: 'platform_verified' } })).status(),
  ).toBe(400);
  expect(
    (
      await command({
        action: 'create',
        data: { ...draft, links: ['https://example.com/api/attachments/private'] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await command({ action: 'create', data: { ...draft, description: 'a'.repeat(33000) } })
    ).status(),
  ).toBe(413);
  let items: { id: string; revision: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const response = await command({
      action: 'create',
      data: { ...draft, title: `Проверка ${i}` },
    });
    expect(response.ok()).toBe(true);
    items = (await response.json()).data.items;
  }
  expect((await command({ action: 'create', data: draft })).status()).toBe(409);
  expect(
    (
      await command({
        action: 'reorder',
        items: items.slice(1).map(({ id, revision }) => ({ id, revision })),
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await command({
        action: 'reorder',
        items: items.map(() => ({ id: items[0].id, revision: items[0].revision })),
      })
    ).status(),
  ).toBe(409);
  const edit = {
    action: 'update',
    id: items[0].id,
    revision: items[0].revision,
    data: { ...draft, title: 'Одновременное изменение' },
  };
  const concurrent = await Promise.all([command(edit), command(edit)]);
  expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 409]);
  items = (await concurrent.find((r) => r.status() === 200)!.json()).data.items;
  for (let i = 0; i < 9; i++) {
    const response = await command({
      action: 'reorder',
      items: items.map(({ id, revision }) => ({ id, revision })),
    });
    expect(response.ok()).toBe(true);
    items = (await response.json()).data.items;
  }
  expect(
    (
      await command({
        action: 'reorder',
        items: items.map(({ id, revision }) => ({ id, revision })),
      })
    ).status(),
  ).toBe(429);
  const admin = await browser.newPage();
  try {
    await signInDemo(admin, 'admin');
    expect(
      (
        await admin.request.post('/api/profile/portfolio', {
          headers: { Origin: origin },
          data: { action: 'delete', ...items[0] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await admin.request.post('/api/profile/portfolio', {
          headers: { Origin: origin },
          data: { action: 'delete', id: items[0].id, revision: items[0].revision },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await admin.close();
  }
});
