import { test, expect } from '@playwright/test';
import { register } from './helpers';

test('navigating every project tab loads without an uncaught error (exercises the lazy tabs)', async ({ page }) => {
  // Uncaught exceptions are the reliable signal that a lazy chunk failed to load
  // or a view crashed on mount — collect them and assert none occurred.
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await register(page);
  await page.getByRole('button', { name: 'Nouveau projet' }).first().click();

  // Graphiques / Risques / Pilotage are the React.lazy tabs — clicking them
  // downloads their chunk through a Suspense boundary.
  const tabs = ['Ligne de temps', 'Budget', 'Travail', 'Graphiques', 'Rapport', 'Risques', 'Pilotage', 'Phases'];
  for (const tab of tabs) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    // The header total stays mounted across tab swaps — its presence confirms
    // the tab rendered rather than throwing.
    await expect(page.getByTestId('project-total-cost')).toBeVisible();
  }

  // Let any in-flight lazy-chunk fetch settle so a failed import surfaces as a
  // pageerror before we assert — otherwise the loop could finish first.
  await page.waitForLoadState('networkidle');
  expect(pageErrors).toEqual([]);
});
