import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, type Cookie, type Page } from '@playwright/test';

/** Reuse three test sessions across viewports, keeping the real login rate limit enabled. */
export async function signInDemo(page: Page, role: 'student' | 'client' | 'admin') {
  const database = process.env.E2E_DATABASE_NAME;
  if (!database || !/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(database))
    throw new Error('An isolated E2E database is required for UI test sessions.');
  const folder = '.local/ui-quality/sessions';
  const file = `${folder}/${database}-${role}.json`;
  try {
    const state: { cookies: Cookie[] } = JSON.parse(await readFile(file, 'utf8'));
    // Reusing a login must not import another test's language preference.
    await page.context().addCookies(state.cookies.filter((cookie) => cookie.httpOnly));
    return;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const accounts = JSON.parse(await readFile('.local/demo-accounts.json', 'utf8'));
  const response = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: 'http://localhost:3100' },
    data: { email: accounts[role], password: accounts.password },
  });
  expect(response.status(), 'Demo role authentication').toBe(200);
  await mkdir(folder, { recursive: true });
  const { cookies } = await page.context().storageState();
  await writeFile(file, JSON.stringify({ cookies: cookies.filter((cookie) => cookie.httpOnly) }), {
    mode: 0o600,
  });
}
