# Execution Module — MVP Implementation Plan

> **Spec:** [`docs/specs/2026-04-23-execution-module-spec.md`](../../specs/2026-04-23-execution-module-spec.md)
> **Approved:** 2026-04-22
> **Goal:** Deliver the MVP of the Jira-like execution module in 7 atomic PRs, with each PR independently merge-able and each earlier PR a prerequisite for the next.

---

## Ground rules for every PR

1. **Branch from latest `main`** — never stack unmerged branches.
2. **Each PR has green tests before opening.** `npm test` (full suite, not just new cases).
3. **Each PR has a test plan in the description** — at minimum one manual scenario the reviewer can exercise locally.
4. **Each PR has both FR and EN i18n keys if it touches UI strings.** Zero `t('…') || 'fallback'` patterns (see `feedback_prism_patterns.md`).
5. **Permission checks happen in middleware, not scattered per route** — one decision point per protected resource family.
6. **No business logic in React components.** Rollups, cost derivations, date math live in `src/lib/*` or `server/execution/*` and are exported for testability.
7. **Rate is snapshotted at time_entry create.** Never reference the live rates table after the fact.

---

## PR 1 — Schema + migrations

**Branch:** `feature/execution-schema`
**Goal:** Create every new table and column the module will need. No code depends on these yet — this PR is infrastructure.

### Files

- Modified: `server/db.js` — append migrations 0007–0016 after the last existing one. Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN` guarded by a check-column-exists helper).
- Modified: `server/db.js` — seed function `seedDefaultStatuses(projectId)` called once per existing project inside a one-time data migration row in a new `_migrations_applied` table.
- New: `server/__tests__/executionSchema.test.js` — asserts every table exists after a fresh boot and that re-running migrations is a no-op.

### Migrations

- 0007 `epics`
- 0008 `epic_phases`
- 0009 `stories`
- 0010 `tasks`
- 0011 `time_entries`
- 0012 `project_statuses` + data migration seeding `To Do / In Progress / Done` for every existing project
- 0013 `project_transitions` (empty by default = any-to-any)
- 0014 `active_timers`
- 0015 `project_closed_periods`
- 0016 `ALTER TABLE resources ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL` + unique partial index

### Acceptance

- Boot the server fresh → all tables exist, no errors in the log.
- Boot twice → no duplicate seed rows, no migration errors.
- Existing test DB (`data-test/app.db` from the screenshots fixture) upgrades without manual intervention.

### Out of scope

- No API routes yet.
- No UI.

---

## PR 2 — Epics / Stories / Tasks CRUD API

**Branch:** `feature/execution-crud`
**Requires:** PR 1 merged.

### Files

- New: `server/execution/index.js` — express router, mounts sub-routers, guards `/api/execution/*` with the JWT middleware.
- New: `server/execution/schemas.js` — Zod schemas for `Epic`, `Story`, `Task`, reused on POST + PUT.
- New: `server/execution/queries.js` — pure SQL helpers (`listEpics(projectId)`, `createEpic(...)`, etc.). One file per entity internally is OK; keep the public surface flat.
- New: `server/execution/permissions.js` — middleware `assertProjectRole(req, projectId, minRole)`. Roles: `owner > editor > viewer > none`. Reads from existing `project_shares` + project ownership.
- New: `server/execution/keys.js` — generates `PRISM-E1 / -S1 / -T1` style keys via a per-(project, type) counter. Uses a dedicated `project_key_counters(project_id, entity_type, last)` table that this PR adds.
- Modified: `server/index.js` — mount `/api/execution`.
- New: `src/lib/executionApi.js` — frontend API client mirror of the server routes.
- New: `server/__tests__/executionCrud.test.js` — ~30 cases covering CRUD × 3 entities × happy path + 403 + 404 + validation errors.

### Endpoints (see spec §5)

```
GET/POST   /api/execution/projects/:projectId/epics
GET/PUT/DELETE /api/execution/epics/:id
GET/POST   /api/execution/epics/:epicId/stories
GET/PUT/DELETE /api/execution/stories/:id
GET        /api/execution/projects/:projectId/tasks?assignee=&status=
POST       /api/execution/stories/:storyId/tasks
GET/PUT/DELETE /api/execution/tasks/:id
POST       /api/execution/tasks/:id/transition
```

### Permission rule

- `viewer` → GET only.
- `editor` → GET + POST + PUT + DELETE on entities belonging to projects they are shared on.
- `owner` → same as editor, plus the Decision 9 override (can set any `assignee_id`).
- Anyone not shared on the project → 404 (not 403) on any endpoint referencing that project's entities, so existence is not leaked.

### Transition endpoint

- Body: `{ to: string }`. Validates `to` exists in `project_statuses`.
- If `project_transitions` has any rows for this project, the `(from, to)` pair must be present, else 400.
- If empty, any transition is allowed (Jira "any-to-any" default).

### Acceptance

- Creating an Epic with a phase_id not on the project → 400.
- Listing Epics as a non-shared user → 404.
- Transitioning a Task to a non-existent status → 400.
- All existing tests still pass. Full suite green.

---

## PR 3 — Time entries + rollup endpoints

**Branch:** `feature/execution-time-entries`
**Requires:** PR 2 merged.

### Files

- New: `server/execution/timeEntries.js` — routes + queries.
- New: `server/execution/rollups.js` — the 5 views from spec §4, each as a prepared statement returning rows.
- Modified: `server/execution/index.js` — mount time + rollup routers.
- Modified: `server/execution/permissions.js` — add `assertCanLogOnTask(userId, taskId)` helper that combines Decision 9 logic (own task unless owner).
- New: `src/lib/executionApi.js` additions — `logTime`, `updateTimeEntry`, `getActuals`.
- New: `server/__tests__/executionTimeEntries.test.js` — ~20 cases.
- New: `server/__tests__/executionRollups.test.js` — ~10 cases, each seeds a known set of entries and asserts the aggregated values.

### Endpoints

```
GET/POST   /api/execution/tasks/:taskId/time
PUT/DELETE /api/execution/time/:id
GET        /api/execution/projects/:projectId/actuals
GET        /api/execution/projects/:projectId/epic-costs
```

### Rate snapshotting (critical)

On `POST /tasks/:taskId/time`:

1. Load the task, its assignee (a resource).
2. Apply the ownership check — reject with 403 if the caller's `user_id` doesn't match `resources.user_id` for that assignee AND the caller isn't the project owner.
3. If the task has no assignee, only the project owner can log (400 for anyone else; 403 for the owner who tries without naming a resource_id).
4. Resolve the rate by `getHourlyRate(rates, resource.role, resource.level)` using the **user's current rate card** (the one we'd pass to `calculateProjectCost` for that project).
5. Insert `time_entry` with `rate_hourly = <resolved>`, `rate_role`, `rate_level`.
6. **Never** edit these 3 rate fields afterwards, even if `hours` is updated. Only `hours / date / note` can be edited.

### Period lock hook

PR 3 reads the `project_closed_periods` table but doesn't expose the close/reopen endpoints (that's PR 5). However, the write rejection middleware is already in place here: before any insert/update/delete, we look up the period of `date` (YYYY-MM) and 423 if closed. Without the UI to close periods yet, this middleware is a no-op in practice but the enforcement point is right.

### Acceptance

- Logging 2.5 hours on a task increases `epic-costs` for that epic by `2.5 × rate`.
- Editing the rate card after logging does NOT change the logged cost.
- Calling `getActuals` on a project with no time entries returns `{ hours: 0, cost: 0, by_month: {}, by_phase: {} }`, not 404.
- 423 is returned when trying to log on a date whose month is in `project_closed_periods`.

---

## PR 4 — Resource ↔ User linkage

**Branch:** `feature/resource-user-linkage`
**Requires:** PR 3 merged.

### Files

- Modified: `server/capacity.js` — GET `/resources` includes `user_id` + `user_email` (joined); PUT `/resources/:id` accepts `user_id`.
- New: `server/execution/shareCandidates.js` — GET `/api/execution/projects/:projectId/share-candidates` returns users shared on this project who are not yet linked to a resource on the same user's pool.
- Modified: `src/components/ResourcePool.jsx` — new "Linked user" column with a dropdown containing shared users. Only project owner can change it (readonly UI otherwise).
- New: `src/components/capacity/LinkUserToResource.jsx` — the dropdown itself; small enough to inline in ResourcePool, but extracted for testability.
- Modified: `src/lib/capacityApi.js` — add the new endpoint.
- Modified: `src/lib/i18n.jsx` — keys like `capacity.linkedUser`, `capacity.unlink`, `capacity.noUser`.
- New: `src/components/capacity/__tests__/LinkUserToResource.test.jsx` — interaction test.

### UX

- Resource Pool gets a new column between "Type" and "Max capacity": **Linked user** (or "Utilisateur lié").
- The cell shows either the user email (if linked) or `— Not linked —` with a pencil icon.
- Click → opens a searchable dropdown of shared users + one `(unlink)` option.
- Edge case: if the user saves a link to a user already linked to another resource, show an inline error "This user is already linked to [name]". Server enforces via the unique partial index.

### Acceptance

- Project owner can link a resource to any shared user.
- Non-owner shared users see the column read-only.
- A resource with no linked user can still be selected as a task assignee (MVP doesn't gate assignment by linkage — Decision 9 only gates logging).

---

## PR 5 — Accounting period lock

**Branch:** `feature/period-lock`
**Requires:** PR 3 merged (PR 4 not strictly required, but reviewer may want to merge PR 4 first for linear history).

### Files

- New: `server/execution/periods.js` — the router implementing GET + POST + DELETE.
- Modified: `server/execution/timeEntries.js` — middleware `assertPeriodOpen(projectId, date)` now resolves against the table; before PR 5 it was a no-op.
- New: `src/components/execution/PeriodLock.jsx` — renders the list of past 12 months with a lock/unlock toggle per month.
- Modified: `src/components/BudgetTracker.jsx` — add a new section **"Clôture comptable"** / **"Financial close"** that renders `<PeriodLock />` (visible only to project owner/editor).
- Modified: `src/lib/i18n.jsx` — `close.close`, `close.reopen`, `close.closedBy`, `close.writeLockedBanner`, etc.
- New: `src/components/execution/__tests__/PeriodLock.test.jsx` — interaction test with mocked API.
- New: `server/__tests__/periods.test.js` — close, reopen, idempotency, 423 on write.

### UX

- Section header: "Clôture comptable" with a subtitle "Verrouillez les périodes déjà publiées pour que personne ne puisse modifier les heures rétroactivement."
- List: past 12 months (reverse-chronological), with status chip `Ouverte / Fermée` + date closed + who closed it.
- Button on each row: `Fermer` for open months, `Rouvrir` for closed ones.
- If the user tries to log time in a closed month (from any UI later), a red banner: "La période [avril 2026] est fermée. Heures non enregistrées."

### Audit

- Every close/reopen writes to `project_closed_periods.closed_by_user` and `closed_at` — no separate audit log table in MVP, the row itself is the audit.
- On reopen, we **delete the row** — we do not soft-delete. Reopened periods become fully editable again.

### Acceptance

- Closing April 2026, then trying to POST a time entry with `date = '2026-04-15'` returns 423 with body `{ error: 'period_closed', period: '2026-04', closed_at, closed_by }`.
- Reopening the period, then POSTing the same time entry succeeds.
- Only owner/editor can close/reopen (403 otherwise).

---

## PR 6 — Execution UI: Board, Backlog, Task panel, Timesheet

**Branch:** `feature/execution-ui`
**Requires:** PR 2, PR 3, PR 4 merged. (PR 5 strongly recommended.)

This is the biggest PR of the MVP. ~1 200 LOC of React.

### Files

- New: `src/components/execution/WorkView.jsx` — parent, handles sub-tab state (`board` / `backlog` / `timesheet`) + sync with the URL hash `#/projects/:id/work/:subtab`.
- New: `src/components/execution/Board.jsx` — Kanban board.
- New: `src/components/execution/Backlog.jsx` — flat list grouped by epic, collapsible.
- New: `src/components/execution/TaskPanel.jsx` — slide-in side panel (shadcn `Sheet`) with the task details + time log widget.
- New: `src/components/execution/TimeLogWidget.jsx` — the "Log 2h" + past entries list + inline edit / delete.
- New: `src/components/execution/Timesheet.jsx` — week grid, days × tasks.
- New: `src/components/execution/TaskCard.jsx` — the card used in Board and Backlog.
- Modified: `src/components/ProjectView.jsx` — new tab labeled **Work** / **Travail**, routed to `WorkView`.
- Modified: `src/lib/i18n.jsx` — ~60 new keys.
- Modified: `src/lib/useHashRouter.js` — support for the 3-segment hash `#/projects/:id/work/:subtab`.

### DnD library decision

Use `@dnd-kit/core` + `@dnd-kit/sortable`. Reasons: actively maintained, 11 KB minified core, accessible by default, no React 19 drama, same one Linear and Vercel's own dashboards use. Alternatives considered: `react-beautiful-dnd` (deprecated), native HTML5 DnD (accessibility gaps).

Install only in PR 6 to keep earlier bundles clean.

### Keyboard UX

- `C` anywhere in WorkView → "Create task" modal.
- `J / K` in the Board → move focus between cards.
- `Enter` on a focused card → open TaskPanel.
- `Esc` in TaskPanel → close.

### No tests in this PR

Heavy UI with DnD is expensive to test with JSDOM and provides low ROI at MVP. Strong manual test plan instead; unit tests for the non-trivial helpers (date math in Timesheet, drag transition calculator).

### Acceptance (manual)

- Create Epic / Story / Task via UI works end-to-end.
- Drag a card between columns; refresh; card is in the new column.
- Open TaskPanel, log 1.5h, refresh; entry persists, cost rollup updates.
- Timesheet week view sums correctly; clicking a cell opens a "Log time on…" dialog with the task prefilled.
- Hash-route `#/projects/42/work/timesheet` deep-links correctly.

---

## PR 7 — Pilotage integration: Réels in BudgetTracker, Summary, Excel

**Branch:** `feature/execution-integration`
**Requires:** PR 6 merged.

### Files

- Modified: `src/components/BudgetTracker.jsx` — add a "Réels" line below "Estimé", fed from `GET /api/execution/projects/:id/actuals`. Show variance Estimé − Réels as a secondary progress bar.
- Modified: `src/components/ProjectSummary.jsx` — new "Heures loggées" + "Coût réel" sections in the printable summary.
- Modified: `src/lib/ganttExcelExport.js` — add a `réels_by_month` row under the `prévisions` block, filled from the `by_month` field of the rollup endpoint. Formula cell = literal value (not a formula) since this comes from a DB rollup.
- New: `src/lib/__tests__/ganttExcelExport.test.js` additions — 2 test cases: "Réels row appears when provided" and "Réels row is omitted when data is empty".
- Modified: `src/lib/i18n.jsx` — `budget.actuals`, `budget.variance`, `summary.hoursLogged`, etc.

### Passing actuals to the Excel generator

`generateGanttExcelBuffer` gains an optional `actuals` param:

```js
generateGanttExcelBuffer({
  projects, resources, assignments, months, rates, locale,
  actuals: { projectId: { by_month: { '2026-01': 12530.50, … } } }, // new
})
```

The caller (CapacityGantt's export handler) fetches `/actuals` for every project in scope and passes the map. If `actuals` is absent, the export falls back to the current behaviour (no Réels row, backward-compatible).

### Acceptance

- Open a project with logged time, click Export; Excel contains a "Réels cumulés" row with the correct monthly totals matching the in-app actuals display.
- Open a project with no logged time; Excel export is unchanged from today's behaviour.
- BudgetTracker shows a two-bar display (Estimé / Réels) with a computed variance.

---

## Sequencing summary

```
PR 1 (schema)
  ↓
PR 2 (CRUD API)
  ↓
PR 3 (time entries + rollups)
  ↓        ↓
PR 4    PR 5  (parallel)
(user link) (period lock)
  ↓        ↓
      PR 6 (UI)
        ↓
      PR 7 (integration)
```

PR 4 and PR 5 can be worked in parallel after PR 3. Everything else is strictly sequential.

---

## Memory / habits this plan respects

- **Single source of truth** — rate snapshotted at log time = only one place the cost lives. No duplication between live rates and historical entries.
- **Single user workflow per PR** — each PR is tight, reviewable in ~30 min.
- **No half-finished implementations** — each PR delivers a usable, coherent slice. The UI PR doesn't ship with backend stubs; the backend PRs don't leave dead columns.
- **i18n real keys, never fallbacks** — verified by the scan added to `fix/missing-i18n-keys`.
- **Mobile-responsive patterns** applied to all new UI per `feedback_prism_patterns.md`: `flex-col sm:flex-row`, icon-only buttons with aria-label, stacking grids.

---

## Kickoff checklist (before PR 1)

- [ ] Spec is approved and merged (or at least on `main`).
- [ ] This plan is committed to `docs/superpowers/plans/` on `main` as a reference.
- [ ] No open unrelated PRs against `main` (clean base).
- [ ] `data-test/` fixture accounts work — we'll use them to exercise PR 1 migrations.
