import { test, expect } from '@playwright/test';
import { register } from './helpers';

test('creating a project and adding a member updates and persists the total cost', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'Nouveau projet' }).first().click();

  const total = page.getByTestId('project-total-cost');
  await expect(total).toHaveText(/^0,00/); // fresh project starts at zero

  // Wait for the actual debounced auto-save (PUT /api/data) to land on the
  // server rather than a UI "saved" label — that's the deterministic signal
  // the member round-trips. The create+member edits coalesce into one PUT.
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/data') && r.request().method() === 'PUT' && r.ok()
  );
  // Adding a member with the default role/level yields a non-zero cost.
  await page.getByRole('button', { name: /Ajouter un membre/ }).first().click();
  await expect(total).not.toHaveText(/^0,00/);
  await saved;

  await page.reload();
  await expect(page.getByTestId('project-total-cost')).not.toHaveText(/^0,00/);
});
