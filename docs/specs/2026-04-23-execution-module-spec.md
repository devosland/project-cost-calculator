# Execution Module — Spec

> **Status:** Draft — pending approval
> **Author:** Daniel Valiquette, with Claude (Opus 4.7)
> **Date:** 2026-04-23
> **Scope:** Add a Jira-like execution module to Prism so day-to-day team work (Epics → Stories → Tasks) can be tracked alongside the existing high-level pilotage, and so logged time automatically flows back as "actuals" into the project's financial tracking.

---

## 1. Vision

Prism currently covers the **pilotage** side of a project: phases, budgets, estimates, capacity planning. There is no **execution** side — no way for the team to break work down, assign it, and track actual effort against the plan.

This module closes that gap. It turns Prism into a single system where:

- A director opens the project and sees estimated cost, capacity allocation, and a Gantt (today).
- **AND** a real-time "Réels" column that updates as the team logs work (new).
- A team member opens the same project and sees their backlog, their board, and logs time on the tasks they complete.
- The project's **RAF** (`Budget − Réels`) becomes real, not just `Budget − Estimé`.

The end goal: the finance Excel template the team uses today, where the "Réels cumulés" column is filled manually every month, is filled automatically by Prism the moment a task is logged.

---

## 2. Design decisions (agreed)

| #   | Question               | Decision                                                                                                                |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Epic ↔ Phase coupling  | **Flexible.** Epic → 0..n phases; Epic → 0..1 milestone (for billing linkage).                                          |
| 2   | Time tracking          | **Hybrid.** Optional live timer that pre-fills a daily log. User can also log manually.                                 |
| 3   | Actuals → cost         | **Resource rate at log time.** Snapshot the rate when the entry is created (audit-stable).                              |
| 4   | Workflow               | **Jira-like.** Default `To Do / In Progress / Done` but customisable per project.                                       |
| 5   | Permissions            | **Jira-like per-project.** Reuses the existing `project_shares` model (viewer / editor / owner).                        |
| 6   | Delivery               | **Phased (MVP → V2 → V3).**                                                                                             |
| 7   | Unassigned tasks       | **Allowed.** Backlog tasks without an assignee are valid (matches Jira).                                                |
| 8   | Accounting period lock | **Manual, per project, per month.** Only project owner/editor can close/reopen. Closed periods reject writes.           |
| 9   | Logging scope          | **Own tasks only** (task.assignee_id must match the logger's linked resource). Project **owner** can override as admin. |
| 10  | Sprint length          | **Customisable per project from day 1.** Default 2 weeks, stored on the sprint config.                                  |
| 11  | Hours format           | **Decimal** (`1.5`, not `1:30`). One source of truth throughout UI + DB.                                                |

---

## 3. Data model

### 3.1 New tables

Normalised SQL, not JSON blobs. The existing pattern (project-as-JSON-blob) was fine for 10 phases but will not scale to 1 000+ tasks × 10 000+ time entries per project.

```sql
-- Epics: large buckets of work, optionally tied to phases / milestones
CREATE TABLE epics (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key           TEXT    NOT NULL,        -- e.g. "PRISM-E1"
  title         TEXT    NOT NULL,
  description   TEXT,
  status        TEXT    NOT NULL,        -- free-text, validated against project_statuses
  priority      TEXT    NOT NULL DEFAULT 'medium',
  milestone_id  INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE (project_id, key)
);

-- Many-to-many: Epic ↔ Phase
CREATE TABLE epic_phases (
  epic_id  INTEGER NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  PRIMARY KEY (epic_id, phase_id)
);

-- Stories: child of an Epic
CREATE TABLE stories (
  id             INTEGER PRIMARY KEY,
  epic_id        INTEGER NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  key            TEXT    NOT NULL,       -- e.g. "PRISM-S42"
  title          TEXT    NOT NULL,
  description    TEXT,
  status         TEXT    NOT NULL,
  priority       TEXT    NOT NULL DEFAULT 'medium',
  estimate_hours REAL,                   -- team's estimate in hours
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  UNIQUE (epic_id, key)
);

-- Tasks: child of a Story
CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY,
  story_id       INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  key            TEXT    NOT NULL,       -- e.g. "PRISM-T123"
  title          TEXT    NOT NULL,
  description    TEXT,
  status         TEXT    NOT NULL,
  priority       TEXT    NOT NULL DEFAULT 'medium',
  assignee_id    INTEGER REFERENCES resources(id) ON DELETE SET NULL,
  estimate_hours REAL,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  UNIQUE (story_id, key)
);

-- Time entries: the source of "actuals"
CREATE TABLE time_entries (
  id              INTEGER PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_id     INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date            TEXT    NOT NULL,      -- YYYY-MM-DD, the day the work was done
  hours           REAL    NOT NULL,
  note            TEXT,
  -- SNAPSHOT OF RATE AT LOG TIME — not a live lookup
  rate_hourly     REAL    NOT NULL,      -- copied from the rates table at create
  rate_role       TEXT,                  -- audit trail: role used at snapshot
  rate_level      TEXT,                  -- audit trail: level used at snapshot
  source          TEXT    NOT NULL DEFAULT 'manual',  -- 'manual' | 'timer'
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- Per-project custom workflow
CREATE TABLE project_statuses (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,          -- "To Do", "In Review", "Done", …
  category    TEXT    NOT NULL,          -- 'todo' | 'inprogress' | 'done' — for metrics
  order_idx   INTEGER NOT NULL,
  UNIQUE (project_id, name)
);

-- Per-project allowed transitions (empty = any-to-any, Jira-like)
CREATE TABLE project_transitions (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status TEXT    NOT NULL,
  to_status   TEXT    NOT NULL,
  PRIMARY KEY (project_id, from_status, to_status)
);

-- Active timers (one per user). Replaces a running state column on tasks so
-- switching tasks doesn't require schema gymnastics.
CREATE TABLE active_timers (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT    NOT NULL
);

-- Closed accounting periods (per project, per month). When a period is
-- closed, inserts / updates / deletes of time_entries dated within that month
-- are rejected at the API layer. Only the project owner or editor shares can
-- close/reopen. Rationale: the Decision 2 requirement — month-end financial
-- close triggered manually by the project manager, not automatic after N days.
CREATE TABLE project_closed_periods (
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period         TEXT    NOT NULL,   -- 'YYYY-MM'
  closed_at      TEXT    NOT NULL,
  closed_by_user INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (project_id, period)
);
```

### 3.1.a Modification to an existing table

```sql
-- Link a resource in the pool to a user account, so that a user shared on a
-- project can log time only against the resource entry they map to. Nullable —
-- resources that represent people who don't have a Prism account (common for
-- consultants) remain usable for estimates and capacity but cannot log time.
-- This is the model change required by Decision 9 ("own tasks only").
ALTER TABLE resources ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_resources_user ON resources(user_id) WHERE user_id IS NOT NULL;
```

### 3.1.b Sprint config (V2, declared here for coherence)

```sql
-- V2 table — not in MVP, but keyed here so Decision 10 is traceable.
CREATE TABLE sprints (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  start_date    TEXT    NOT NULL,       -- YYYY-MM-DD
  end_date      TEXT    NOT NULL,       -- YYYY-MM-DD
  goal          TEXT,
  state         TEXT    NOT NULL,       -- 'future' | 'active' | 'closed'
  created_at    TEXT    NOT NULL
);
-- Sprint length is derived from (end_date - start_date). A per-project default
-- length (in days) lives on projects.default_sprint_days (new column, nullable,
-- defaults to 14) so the "New Sprint" form pre-fills it. Added when sprints
-- land in V2, not in MVP.
```

### 3.2 Indexes

```sql
CREATE INDEX idx_epics_project      ON epics(project_id);
CREATE INDEX idx_stories_epic       ON stories(epic_id);
CREATE INDEX idx_tasks_story        ON tasks(story_id);
CREATE INDEX idx_tasks_assignee     ON tasks(assignee_id);
CREATE INDEX idx_time_task          ON time_entries(task_id);
CREATE INDEX idx_time_resource_date ON time_entries(resource_id, date);
CREATE INDEX idx_epic_phases_phase  ON epic_phases(phase_id);
CREATE INDEX idx_closed_project     ON project_closed_periods(project_id, period);
```

The `(resource_id, date)` index is critical — the main pivot query is "hours logged by this resource this month for this project".

### 3.3 Keys

Human-readable keys (`PRISM-E1`, `PRISM-S42`, `PRISM-T123`) are unique per project, not globally. Generated from an auto-increment counter per `(project, entity_type)` — simple and no collision.

### 3.4 Rate snapshotting

Time entry cost = `hours × rate_hourly` where `rate_hourly` is **frozen at log time**. Rate cards can change (promotions, annual raises, vendor renegotiations) without touching historical actuals. This is the industry standard for audit-grade cost tracking (Tempo, Harvest, Jira Capitalisation).

**Real-world anchor** — Prism rates bump with the Consumer Price Index every early May. Work logged in April at the old rate must remain at that rate when exported in June; otherwise the April "Réels" column would retroactively inflate, breaking reconciliation with the finance team's Excel. Snapshotting is the only safe semantic.

A follow-up migration / "repricing" tool can be added later to recompute at current rates if needed, but the default is immutable.

---

## 4. Cost rollup (the heart of the feature)

The rollup is a set of SQL-friendly views, not a trigger — triggers are painful to test and debug.

### 4.1 Task-level actuals

```sql
SELECT task_id,
       SUM(hours)              AS hours_logged,
       SUM(hours * rate_hourly) AS cost_logged
FROM time_entries
GROUP BY task_id;
```

### 4.2 Story-level

`SUM` of the task-level over all tasks in a story.

### 4.3 Epic-level

`SUM` of the story-level.

### 4.4 Phase-level (the tricky one)

An Epic can be linked to multiple phases. Default apportionment: **equal split** across linked phases. Advanced users can override with a per-(epic, phase) weight in a follow-up (`epic_phases.weight`).

```sql
-- For a given project:
SELECT p.id AS phase_id,
       SUM(ec.cost_logged / ep_count.count) AS cost_logged
FROM phases p
JOIN epic_phases ep  ON ep.phase_id = p.id
JOIN epic_costs ec   ON ec.epic_id  = ep.epic_id       -- CTE from §4.3
JOIN (SELECT epic_id, COUNT(*) AS count FROM epic_phases GROUP BY epic_id) ep_count
     ON ep_count.epic_id = ep.epic_id
WHERE p.project_id = ?
GROUP BY p.id;
```

### 4.5 Monthly breakdown (for the Excel "Réels" column)

```sql
SELECT strftime('%Y-%m', te.date) AS month,
       SUM(te.hours * te.rate_hourly) AS cost_logged
FROM time_entries te
JOIN tasks   t ON t.id = te.task_id
JOIN stories s ON s.id = t.story_id
JOIN epics   e ON e.id = s.epic_id
WHERE e.project_id = ?
GROUP BY month;
```

This is what plugs into the existing `ganttExcelExport.js` to fill a real "Réels" row matching the Plateforme Web 2026 template.

---

## 5. API surface (MVP)

All under `/api/execution` with existing JWT auth. Permission check: user must have a `project_shares` role on the project (or own it).

```
# Epics
GET    /api/execution/projects/:projectId/epics
POST   /api/execution/projects/:projectId/epics
GET    /api/execution/epics/:id
PUT    /api/execution/epics/:id
DELETE /api/execution/epics/:id

# Stories
GET    /api/execution/epics/:epicId/stories
POST   /api/execution/epics/:epicId/stories
GET    /api/execution/stories/:id
PUT    /api/execution/stories/:id
DELETE /api/execution/stories/:id

# Tasks (nested or flat query)
GET    /api/execution/projects/:projectId/tasks?assignee=&status=&sprint=
POST   /api/execution/stories/:storyId/tasks
GET    /api/execution/tasks/:id
PUT    /api/execution/tasks/:id
DELETE /api/execution/tasks/:id
POST   /api/execution/tasks/:id/transition   # Body: { to: 'In Progress' }

# Time tracking
GET    /api/execution/tasks/:taskId/time
POST   /api/execution/tasks/:taskId/time     # Manual log
PUT    /api/execution/time/:id
DELETE /api/execution/time/:id
POST   /api/execution/tasks/:id/timer/start
POST   /api/execution/tasks/:id/timer/stop   # Converts to a time_entry

# Project workflow config
GET    /api/execution/projects/:projectId/statuses
PUT    /api/execution/projects/:projectId/statuses      # Replace list
GET    /api/execution/projects/:projectId/transitions
PUT    /api/execution/projects/:projectId/transitions

# Rollup endpoints (read-only, computed)
GET    /api/execution/projects/:projectId/actuals            # { hours, cost, by_month, by_phase }
GET    /api/execution/projects/:projectId/epic-costs

# Accounting period lock (Decision 8)
GET    /api/execution/projects/:projectId/periods            # [{ period: '2026-04', closed_at, closed_by }]
POST   /api/execution/projects/:projectId/periods/:yyyyMM    # Close the period. Idempotent.
DELETE /api/execution/projects/:projectId/periods/:yyyyMM    # Reopen. Owner only.

# Resource ↔ User linkage (Decision 9)
GET    /api/execution/projects/:projectId/share-candidates   # Shared users not yet linked to a resource
PUT    /api/capacity/resources/:id/user                      # Body: { user_id: number | null }. Owner only.
```

### 5.1 Write patterns

All write endpoints return the full updated entity. The frontend does optimistic UI on the Kanban (moving a card) but rolls back on 4xx.

### 5.2 Validation

Zod schemas in `server/execution/schemas.js`, consistent with `server/mapping/roadmapToProject.js`. Key invariants:

- `status` must exist in `project_statuses` for that project.
- `time_entry.hours > 0 && hours <= 24`.
- `time_entry.date` not in the future.
- `assignee_id`, if set, must be in the project's resource pool (transitively: tied to an assignment on that project).
- **Period lock (Decision 8):** any create/update/delete of a `time_entry` whose `date` falls in a project's closed period returns 423 Locked. Bulk writes fail atomically.
- **Ownership (Decision 9):** `time_entry.resource_id` must equal `req.user.resource_id` (via `resources.user_id` lookup) **unless** the logger owns the project — in which case they can log on any assignee's behalf (treated as an admin action and audited in `note`). If `task.assignee_id` is null (unassigned backlog), only the project owner can log time on it.

---

## 6. UX / screens

### 6.1 Navigation

A new top-level route: **`#/projects/:id/work`** — a sibling to the existing project tabs (Phases / Timeline / Budget / Charts / Summary / Risks). The new tab label: **Work** / **Travail**.

The sub-navigation inside Work:

- **Board** (Kanban) — default view
- **Backlog** (flat list, groupable by epic)
- **Sprints** (V2)
- **Timesheet** (my hours, week view)

Keeping Work as a project tab, not a global module, matches the mental model: "I open the project, I see everything for this project".

### 6.2 Board view (primary)

Columns come from `project_statuses`, order from `order_idx`. Each card: `KEY • title • assignee avatar • estimate • progress bar`. Drag-and-drop between columns fires a transition API call.

### 6.3 Task detail side panel

Click a card → side panel (shadcn `Sheet`) opens from the right:

- Editable fields (title, description, status, priority, assignee, estimate)
- Time log widget: "Log 2h" button + list of past entries for this task
- Timer controls (Start / Pause / Stop)
- Comment thread (V3)
- Activity log (V3)

### 6.4 Timesheet

Week-view grid: days as columns, tasks as rows. Click a cell to log hours. Auto-summed at the right.

### 6.5 Integration with Pilotage

- **BudgetTracker**: add a "Réels" line below "Estimé", showing `hours_logged × rate` cumulated. Variance = Estimé − Réels, shown as a progress bar.
- **Excel export**: the existing generator gets a new `réels_by_month` block below the `estimé_by_month` rows, fed by §4.5.
- **ProjectSummary**: add "Heures loggées" and "Coût réel" sections.
- **CapacityGantt**: optional overlay "actual vs planned allocation" (V2). Not in MVP to avoid scope creep.

---

## 7. Phasing

### Phase A — MVP (targets 7 PRs, ~4–5 weeks of focused work)

- **PR 1:** DB schema + migrations for the 7 new tables (epics, epic_phases, stories, tasks, time_entries, project_statuses, project_transitions, active_timers, project_closed_periods) + the `resources.user_id` column + project_statuses seed for existing projects (default `To Do / In Progress / Done`).
- **PR 2:** API: epics + stories + tasks CRUD + Zod validation + permission middleware (includes Decision 9 "own tasks only" + owner override).
- **PR 3:** API: time entries CRUD + manual log only (no timer yet) + rollup endpoints.
- **PR 4:** API + minimal UI: resource ↔ user linkage (Decision 9 prerequisite). New section in Resource Pool to map a shared user to a resource.
- **PR 5:** API + UI: accounting period lock (Decision 8). Period list + close/reopen buttons in a new "Pilotage financier" sub-section of BudgetTracker. Server-side 423 on write to closed periods.
- **PR 6:** UI: Board view with drag-and-drop transitions + task-detail panel + manual time log widget in the panel + Timesheet week view.
- **PR 7:** Integration: BudgetTracker "Réels" line + ProjectSummary actuals section + Excel export "Réels cumulés" monthly block fed from §4.5.

### Phase B — V2 (5–8 PRs, ~2 months)

- Timer: start/stop + active-timer indicator in top bar.
- Sprints: `sprints` table + velocity chart + sprint planning view.
- Workflow customisation UI: per-project editor for statuses + transitions.
- Capacity Gantt overlay: actual vs planned.
- Burn-down / burn-up chart on dashboard.
- Import from Jira CSV / Linear CSV (so existing teams can migrate).

### Phase C — V3 (ongoing)

- Comments on tasks + @mentions.
- Notifications (email + in-app).
- Full-text search across epics/stories/tasks.
- Bulk operations (move 20 tasks to next sprint).
- Webhooks for integration (Slack, Teams).
- Automations ("when task moves to Done, log 0h and transition parent story if all tasks done").
- Attachment support (image upload, linking to external docs).

---

## 8. Risks & open questions

### Risks

| #   | Risk                                                                                                            | Mitigation                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Performance at scale** — 10 000 time entries × 100 resources × multi-year                                     | Proper indexes (§3.2), pagination on list endpoints, rollup endpoints compute with CTEs not in-memory aggregation.                          |
| 2   | **Existing projects have no epics** — suddenly they look empty                                                  | Migration inserts a default epic per phase for projects >1 phase, plus the 3 default statuses. Opt-in UI prompt.                            |
| 3   | **Conflict between capacity allocation and logged time**                                                        | Surface both. Allocation = plan, logged = real. Show the gap in a dashboard widget ("this resource was allocated 50% but logged only 30%"). |
| 4   | **Epic-to-phase N:N split for cost** — equal split is an approximation                                          | Document it clearly. Add weighted split in V2 (`epic_phases.weight`).                                                                       |
| 5   | **SQLite write contention** — time entries written by many users simultaneously                                 | SQLite in WAL mode (already configured). Benchmark at PR 3.                                                                                 |
| 6   | **Permissions drift** — a project owner removes a share, but the ex-member has hundreds of time entries         | Soft-keep the entries (by resource_id), invalidate the share, and surface a "resource was unshared" badge in rollups.                       |
| 7   | **Timer abandonment** — user starts a timer, closes the tab, never stops it. 48h of "logged time" next morning. | Auto-stop after 12h of continuous running, with a toast on login: "we auto-stopped your timer at 12h, confirm entry?"                       |
| 8   | **Dual source of truth** — assignment % in capacity + task assignee. Which drives cost?                         | Capacity stays the plan (estimé). Time entries are the real (réels). Neither is canonical for the other.                                    |

### Open questions

All original Q1–Q5 were answered; see §2 rows 7–11.

One derived question emerged from Decision 9 (user ↔ resource linkage):

- **Q6 (minor):** The linkage flow — owner manually picks a shared user from a dropdown in Resource Pool ("link this resource to…") and maps. Confirmed implicit: no automatic email match, no invite flow. A resource without a linked user simply cannot have time logged on its tasks by anyone other than the project owner. That's fine for consultants who are only estimated, not operated.

### Non-goals (explicit, to scope control)

- Git / PR integration.
- Burndown prediction / ML estimation.
- External client-facing portal (read-only share link to a board). Could be a future follow-up.
- Multi-language task descriptions — content is whatever language the team types in.
- Email-to-ticket.

---

## 9. Acceptance criteria (MVP)

The MVP is done when:

1. I can create an Epic, Stories under it, Tasks under them — all with keyboard-friendly forms.
2. I can log time manually on a task. The task's and epic's `cost_logged` update.
3. The Phase-level `cost_logged` shows up on BudgetTracker as a "Réels" progress bar, distinct from "Estimé".
4. The Excel export has a "Réels cumulés" row under the monthly prévisions, filled from time entries.
5. All of this works with 2 projects, 3 resources, 10 epics, 50 stories, 200 tasks, 1 000 time entries — with board drag < 200ms, rollup query < 500ms.

---

## 10. Files that will change (MVP only)

- New:
  - `server/execution/index.js` (routes)
  - `server/execution/schemas.js` (Zod validation)
  - `server/execution/queries.js` (SQL queries + CTEs)
  - `server/execution/permissions.js` (middleware)
  - `src/components/execution/Board.jsx`
  - `src/components/execution/TaskPanel.jsx`
  - `src/components/execution/Timesheet.jsx`
  - `src/components/execution/TimeLogWidget.jsx`
  - `src/lib/executionApi.js`
- Modified:
  - `server/db.js` — migrations block 0007–0012 for the 6 new tables.
  - `server/index.js` — mount `/api/execution`.
  - `src/components/ProjectView.jsx` — new Work tab.
  - `src/components/BudgetTracker.jsx` — Réels line.
  - `src/lib/ganttExcelExport.js` — Réels monthly row.
  - `src/lib/i18n.jsx` — ~60 new keys in FR + EN.

Estimated LOC for MVP: ~3 000 new lines across 17 files (up from initial ~2 500 to account for the period-lock + user-linkage additions).

Added files beyond the original list:

- `server/execution/periods.js` — period-lock CRUD + middleware enforcement.
- `src/components/execution/PeriodLock.jsx` — the close/reopen UI inside BudgetTracker.
- `src/components/capacity/LinkUserToResource.jsx` — the dropdown on ResourcePool rows.

Modified beyond the original list:

- `server/db.js` — migrations block 0007–0014 (9 new tables + 1 ALTER).
- `server/capacity.js` — expose `resources.user_id` in GET/PUT responses.
- `src/components/ResourcePool.jsx` — slot for the user-link dropdown.

---

## 11. Next step

1. User answers Q1–Q5 in §8.
2. The spec is adjusted and approved.
3. `docs/superpowers/plans/2026-XX-XX-execution-module-mvp.md` is drafted — the implementation plan with task-by-task steps and TDD structure — before any code is written.
4. PR 1 (schema + migrations) goes first and lands on its own so subsequent PRs can build on the tables.
