import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test('authentication email follows each request language without changing the token flow', async ({
  page,
}) => {
  if (!/^student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(process.env.E2E_DATABASE_NAME ?? ''))
    throw new Error('An isolated E2E database is required.');
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
  const email = `f06-mail-${randomBytes(8).toString('hex')}@example.test`;
  const password = `Synthetic-${randomBytes(18).toString('base64url')}`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: base },
    data: {
      name: 'Синтетический пользователь',
      email,
      password,
      adultConfirmed: true,
      privacyConsent: true,
    },
  });
  expect(signup.status()).toBe(200);
  const directory = path.join(process.cwd(), '.local', 'mail');
  for (const [locale, endpoint, marker] of [
    ['kk', 'request-password-reset', 'Құпиясөзді өзгерту'],
    ['ru', 'request-password-reset', 'Ссылка для смены пароля'],
    ['kk', 'send-verification-email', 'Email мекенжайын мына сілтеме'],
    ['ru', 'send-verification-email', 'Подтвердите email по ссылке'],
  ] as const) {
    await page.context().addCookies([{ name: 'qosyl-locale', value: locale, url: base }]);
    const before = new Set(await readdir(directory).catch(() => []));
    const response = await page.request.post(`/api/auth/${endpoint}`, {
      headers: { Origin: base },
      data:
        endpoint === 'request-password-reset'
          ? { email, redirectTo: `${base}/auth/reset-password` }
          : { email, callbackURL: `${base}/dashboard` },
    });
    expect(response.status()).toBe(200);
    let delivered: { to?: string; text?: string } | undefined;
    await expect
      .poll(async () => {
        for (const file of await readdir(directory).catch(() => [])) {
          if (before.has(file)) continue;
          const item = JSON.parse(
            await readFile(path.join(directory, file), 'utf8'),
          ) as typeof delivered;
          if (item?.to === email) delivered = item;
        }
        return Boolean(delivered);
      })
      .toBe(true);
    expect(delivered?.text).toContain(marker);
    if (endpoint === 'request-password-reset') expect(delivered?.text).toContain('30');
    expect(delivered?.text).toMatch(/https?:\/\/\S+/);
  }
});
