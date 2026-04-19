# Prism UI Screenshots

Automated UI capture via Playwright. Generates the screenshots referenced in the project README.

## What it does

1. Logs in (or registers) the test account `screenshots@test.local`.
2. Wipes any previous fixture data on that account.
3. Seeds a deterministic dataset (5 resources, 2 projects with phases/milestones/risks, 1 transition plan).
4. Launches headless Chromium at `1440×900` in light mode and walks the 13 routes defined in [`docs/ui-test-plan.md`](../../docs/ui-test-plan.md).
5. Saves PNGs to `docs/screenshots/`.

Re-running the script is **idempotent** — it produces the same output every time.

## Prerequisites

Two terminals, both at the repo root :

**Terminal 1 — backend (isolated DB, port 3099 to avoid colliding with other local services):**

```bash
PORT=3099 DATA_DIR=./data-test JWT_SECRET=dev-only-secret node server/index.js
```

> The `DATA_DIR` env var points the SQLite file at `./data-test/app.db`, keeping the dev DB untouched. The script's test data lives only in that directory (safe to `rm -rf data-test/` any time). The port 3099 avoids conflicts with unrelated services that may already hold :3000.

**Terminal 2 — frontend (proxy pointed at the screenshots backend):**

```bash
VITE_API_PROXY=http://localhost:3099 npm run dev
```

Vite serves on `http://localhost:5173` and proxies `/api` → `http://localhost:3099`.

## Run

```bash
node scripts/screenshots/capture.mjs
```

Output : 13 PNG files in `docs/screenshots/`.

## Layout

```
scripts/screenshots/
  capture.mjs          # Entry point : seed + Playwright capture
  README.md            # (this file)
docs/
  ui-test-plan.md      # Human-readable test plan (what's captured, why)
  screenshots/         # Generated PNGs, committed to repo
```

## Adding a new screenshot

1. Add the scenario to `docs/ui-test-plan.md`.
2. Append a `[slug, url]` pair to the `steps` array in `capture.mjs`.
3. Re-run the script.
4. Commit the new `.png` + the plan/script changes.

## Troubleshooting

- **Playwright browser not found**: run `npx playwright install chromium`.
- **`ECONNREFUSED` on :3000 or :5173**: one of the dev servers isn't running.
- **`HTTP 500` from seed**: the test account's data dir has stale lock files — delete `data-test/` and retry.
- **Screenshots look like wrong theme**: clear the Playwright browser data if a prior run left dark-mode state; the script sets `localStorage.theme = 'light'` but doesn't reset profile state.

## Future work

- Commit a pre-seeded SQLite fixture file as `data-test-seed.db` so the wipe-and-reseed cycle can be replaced with a file copy (~100× faster).
- Add mobile viewport + dark mode variants (requires extending the test plan).
- Pixel-diff regression against a baseline (via `pixelmatch` or Playwright's own screenshot comparison).
