import { test, expect } from '@playwright/test';
import { register } from './helpers';

test('register lands on the dashboard and persists the session across reload', async ({ page }) => {
  // register() already asserts the dashboard is shown. The authenticated home
  // is the root URL (the hash is only set when navigating into a project).
  await register(page);

  await page.reload();
  // JWT persisted in localStorage → still authenticated, no login form.
  await expect(page.getByRole('button', { name: 'Nouveau projet' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toHaveCount(0);
});

test('logout then log back in', async ({ page }) => {
  const { email, password } = await register(page);

  await page.getByRole('button', { name: 'Menu utilisateur' }).click();
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Nouveau projet' }).first()).toBeVisible();
});
