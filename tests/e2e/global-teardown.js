import fs from 'fs';

/**
 * Removes the throwaway SQLite database directory created in
 * playwright.config.js for the test run. Best-effort: a failure here must not
 * fail the suite.
 */
export default function globalTeardown() {
  const dir = process.env.PCC_E2E_DB_DIR;
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* tmp gets reclaimed by the OS anyway */
  }
}
