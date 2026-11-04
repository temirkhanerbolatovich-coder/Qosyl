import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import pg from 'pg';
import { signInDemo } from '../ui-quality/demo-session';

test('avatar upload, privacy, publish, stale versions, replacement, revoke, deletion and fallback', async ({
  page,
  browser,
}) => {
  await signInDemo(page, 'student');
  const own = (await (await page.request.get('/api/profile')).json()).data;
  const origin = 'http://localhost:3100';
  const endpoint = `/api/avatars/${own.id}`;
  const image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#123456' },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: 'SECRET-METADATA' } })
    .toBuffer();
  await page.goto('/student/profile');
  const editor = page.getByRole('region', { name: 'Фотография профиля' });
  await expect(editor.getByLabel('Файл аватара', { exact: true })).toBeEnabled();
  await editor
    .getByLabel('Файл аватара', { exact: true })
    .setInputFiles({ name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: image });
  await editor.getByRole('button', { name: 'Загрузить фотографию' }).click();
  await expect(editor.getByText('Фотография доступна только вам.', { exact: true })).toBeVisible();
  const initial = (await (await page.request.get('/api/profile/avatar')).json()).data.avatar;
  const ownerImage = await page.request.get(endpoint);
  expect(ownerImage.status()).toBe(200);
  expect(ownerImage.headers()['cache-control']).toContain('no-store');
  expect(ownerImage.headers()['x-content-type-options']).toBe('nosniff');
  expect(await sharp(await ownerImage.body()).metadata()).toMatchObject({
    format: 'jpeg',
    width: 512,
  });
  expect((await ownerImage.body()).includes(Buffer.from('SECRET-METADATA'))).toBe(false);
  await page.reload();
  await expect(editor.getByRole('img')).toBeVisible();
  await expect
    .poll(() => editor.getByRole('img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(512);
  const guest = await browser.newContext();
  const client = await browser.newContext();
  try {
    const clientPage = await client.newPage();
    await signInDemo(clientPage, 'client');
    expect((await guest.request.get(`http://localhost:3100${endpoint}`)).status()).toBe(404);
    expect((await client.request.get(`http://localhost:3100${endpoint}`)).status()).toBe(404);
    expect(
      (
        await guest.request.post('http://localhost:3100/api/profile/avatar', {
          headers: { Origin: origin, 'Content-Type': 'image/jpeg' },
          data: image,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await client.request.post('http://localhost:3100/api/profile/avatar', {
          headers: { Origin: origin, 'Content-Type': 'image/jpeg' },
          data: image,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: 'https://other.example', 'Content-Type': 'image/jpeg' },
          data: image,
        })
      ).status(),
    ).toBe(403);
    await page.locator('[name="isPublic"]').check();
    const [saved] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/profile') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click(),
    ]);
    expect(saved.ok()).toBe(true);
    await editor.getByRole('button', { name: 'Разрешить публикацию фотографии' }).click();
    await expect(editor.getByRole('button', { name: 'Скрыть фотографию' })).toBeVisible();
    expect((await guest.request.get(`http://localhost:3100${endpoint}`)).status()).toBe(200);
    const publicPage = await guest.newPage();
    await publicPage.goto(`http://localhost:3100/talent/${own.id}`);
    await expect(publicPage.locator(`img[src^="${endpoint}"]`)).toBeVisible();
    expect(
      (
        await page.request.delete('/api/profile/avatar', {
          headers: { Origin: origin },
          data: { revision: initial.revision },
        })
      ).status(),
    ).toBe(409);
    // Broken/oversized images cannot erase or modify the current valid avatar.
    const before = (await (await page.request.get('/api/profile/avatar')).json()).data.avatar;
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: origin, 'Content-Type': 'image/png' },
          data: Buffer.from('not a PNG'),
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: origin, 'Content-Type': 'image/png' },
          data: Buffer.alloc(2 * 1024 * 1024 + 1),
        })
      ).status(),
    ).toBe(413);
    expect((await (await page.request.get('/api/profile/avatar')).json()).data.avatar).toEqual(
      before,
    );
    await editor
      .getByLabel('Файл аватара', { exact: true })
      .setInputFiles({ name: 'replacement.jpg', mimeType: 'image/jpeg', buffer: image });
    await editor.getByRole('button', { name: 'Загрузить фотографию' }).click();
    await expect(
      editor.getByText('Фотография доступна только вам.', { exact: true }),
    ).toBeVisible();
    expect((await guest.request.get(`http://localhost:3100${endpoint}`)).status()).toBe(404);
    await editor.getByRole('button', { name: 'Разрешить публикацию фотографии' }).click();
    await expect(editor.getByRole('button', { name: 'Скрыть фотографию' })).toBeVisible();
    await editor.getByRole('button', { name: 'Скрыть фотографию' }).click();
    await expect(
      editor.getByText('Фотография доступна только вам.', { exact: true }),
    ).toBeVisible();
    expect((await guest.request.get(`http://localhost:3100${endpoint}`)).status()).toBe(404);
    await editor.getByRole('button', { name: 'Удалить фотографию' }).click();
    await expect(editor.getByRole('img')).toHaveCount(0);
    expect((await page.request.get(endpoint)).status()).toBe(404);
    expect((await (await page.request.get('/api/profile/avatar')).json()).data.avatar).toBeNull();
  } finally {
    await guest.close();
    await client.close();
  }
});

test('malformed upload attempts consume the real account rate limit', async ({ page }) => {
  // Separate account avoids interference with the full lifecycle test.
  const email = `avatar-rate-${Date.now()}@example.test`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3100' },
    data: {
      name: 'Аватар тест',
      email,
      password: 'Avatar-test-12345678!',
      adultConfirmed: true,
      privacyConsent: true,
    },
  });
  expect(signup.ok()).toBe(true);
  const profile = await page.request.post('/api/profile', {
    headers: { Origin: 'http://localhost:3100' },
    data: { name: 'Аватар тест', role: 'student', city: 'Семей' },
  });
  expect(profile.ok()).toBe(true);
  for (let index = 0; index < 10; index++)
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: 'http://localhost:3100', 'Content-Type': 'image/svg+xml' },
          data: '<svg/>',
        })
      ).status(),
    ).toBe(415);
  expect(
    (
      await page.request.post('/api/profile/avatar', {
        headers: { Origin: 'http://localhost:3100', 'Content-Type': 'image/svg+xml' },
        data: '<svg/>',
      })
    ).status(),
  ).toBe(429);
});

test('profile privacy and suspension revoke image access and mutation rights', async ({
  page,
  browser,
}) => {
  const origin = 'http://localhost:3100';
  const email = `avatar-access-${Date.now()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: {
          name: 'Аватар доступ',
          email,
          password: 'Avatar-access-12345678!',
          adultConfirmed: true,
          privacyConsent: true,
        },
      })
    ).ok(),
  ).toBe(true);
  const update = (isPublic: boolean) =>
    page.request.post('/api/profile', {
      headers: { Origin: origin },
      data: { role: 'student', name: 'Аватар доступ', city: 'Семей', isPublic },
    });
  expect((await update(true)).ok()).toBe(true);
  const owner = (await (await page.request.get('/api/profile')).json()).data;
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const upload = await page.request.post('/api/profile/avatar', {
    headers: { Origin: origin, 'Content-Type': 'image/png' },
    data: image,
  });
  expect(upload.ok()).toBe(true);
  const { data } = await upload.json();
  expect(
    (
      await page.request.patch('/api/profile/avatar', {
        headers: { Origin: origin },
        data: { revision: data.avatar.revision, isPublic: true },
      })
    ).ok(),
  ).toBe(true);
  const guest = await browser.newContext();
  const url = `http://localhost:3100/api/avatars/${owner.id}`;
  const database = new URL(process.env.DATABASE_URL!);
  if (
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(database.pathname) ||
    !['localhost', '127.0.0.1'].includes(database.hostname)
  )
    throw new Error('Isolated database required');
  const db = new pg.Client({ connectionString: database.toString() });
  try {
    expect((await guest.request.get(url)).status()).toBe(200);
    expect((await update(false)).ok()).toBe(true);
    expect((await guest.request.get(url)).status()).toBe(404);
    expect((await page.request.get(url)).status()).toBe(200);
    expect((await update(true)).ok()).toBe(true);
    await db.connect();
    await db.query('UPDATE "User" SET status=$1 WHERE id=$2', ['suspended', owner.id]);
    expect((await guest.request.get(url)).status()).toBe(404);
    expect((await page.request.get(url)).status()).toBe(404);
    expect(
      (
        await page.request.post('/api/profile/avatar', {
          headers: { Origin: origin, 'Content-Type': 'image/png' },
          data: image,
        })
      ).status(),
    ).toBe(401);
  } finally {
    await guest.close();
    await db.end();
  }
});
