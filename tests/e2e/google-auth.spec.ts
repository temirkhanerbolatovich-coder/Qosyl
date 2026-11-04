import { expect, test } from '@playwright/test';

test('Google registration requires both checkboxes in the interface', async ({ page }) => {
  await page.goto('/auth/register');
  const google = page.getByRole('button', { name: 'Зарегистрироваться через Google' });
  await expect(google).toBeVisible();
  const form = page.locator('form').filter({ has: google });
  await expect(form.getByRole('checkbox')).toHaveCount(2);
  await google.click();
  await expect(page).toHaveURL(/\/auth\/register/);
  await expect(form.getByRole('checkbox').first()).toBeFocused();
});

test('Google registration requires both consents and rejects direct ID tokens', async ({
  request,
}) => {
  const incomplete = await request.post('/api/auth/sign-in/social', {
    headers: { Origin: 'http://localhost:3100' },
    data: { provider: 'google', requestSignUp: true, additionalData: { adultConfirmed: true } },
  });
  expect(incomplete.status()).toBe(400);

  const directToken = await request.post('/api/auth/sign-in/social', {
    headers: { Origin: 'http://localhost:3100' },
    data: { provider: 'google', idToken: { token: 'not-a-real-token' } },
  });
  expect(directToken.status()).toBe(400);
});

test('Google sign-in generates an authorization request without creating an account', async ({
  request,
}) => {
  const response = await request.post('/api/auth/sign-in/social', {
    headers: { Origin: 'http://localhost:3100' },
    data: { provider: 'google', callbackURL: '/dashboard' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const authorization = new URL(body.url);
  expect(authorization.hostname).toBe('accounts.google.com');
  expect(authorization.searchParams.get('redirect_uri')).toBe(
    'http://localhost:3100/api/auth/callback/google',
  );
  expect(authorization.searchParams.get('state')).toBeTruthy();
});
