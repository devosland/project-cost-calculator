import { expect } from '@playwright/test';

let seq = 0;

/** Unique address per call so retries / reruns never collide on the email UNIQUE constraint. */
export function uniqueEmail() {
  seq += 1;
  return `e2e-${Date.now()}-${seq}@test.local`;
}

/**
 * Registers a fresh account and lands on the dashboard. Field selectors use the
 * input ids (htmlFor="email"/"name"/"password") so they are locale-proof.
 * @returns the credentials used, for a later login.
 */
export async function register(page, opts = {}) {
  const email = opts.email || uniqueEmail();
  const name = opts.name || 'E2E User';
  const password = opts.password || 'E2ePassw0rd!';

  await page.goto('/');
  await page.getByRole('button', { name: /Inscrivez-vous/ }).click();
  await page.locator('#email').fill(email);
  await page.locator('#name').fill(name);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Créer un compte' }).click();

  // A brand-new account shows two "Nouveau projet" buttons (onboarding guide +
  // empty-state), so scope to the first.
  await expect(page.getByRole('button', { name: 'Nouveau projet' }).first()).toBeVisible();
  return { email, name, password };
}
