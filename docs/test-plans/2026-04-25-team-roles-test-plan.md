# Team roles — manual test plan

> **Created:** 2026-04-25 (after PR #82 — team-friendly UX merged)
> **Purpose:** Walk through the new role-aware UX end-to-end with three pre-provisioned test accounts on production.

---

## Test accounts (created on prod)

All three were registered via `POST /api/auth/register` on `https://calculateur.danielvaliquette.com`. Same password for all: **`TestPass123!`** (each user can change it after first login).

| Email                   | Name      | DB user id | Role to share with on Chrono SAEIV |
| ----------------------- | --------- | ---------- | ---------------------------------- |
| `team-alice@test.local` | Alice Dev | 5          | **Team**                           |
| `team-bob@test.local`   | Bob Dev   | 6          | **Team**                           |
| `pm-carla@test.local`   | Carla PM  | 7          | **Editor**                         |

## Setup performed by the project owner (Daniel)

These steps are UI-only and were not automated; they require the owner's authenticated session:

1. **Share** the Chrono SAEIV project with the three accounts via the Share dialog, picking the role from the table above.
2. **Link** Alice and Bob to two distinct resources in the Chrono SAEIV pool (Capacity → Resources → "Utilisateur lié" dropdown). Carla does not need a linked resource — Editors don't log time as themselves.
3. **Assign** at least 2 tasks to each of Alice and Bob via the Work → Board / Backlog (TaskPanel → Assignee).

## Test scenarios

### Scenario 1 — Alice the developer (Team role)

Open a private window, log in as `team-alice@test.local`.

- [ ] **Sidebar shows "Mes tâches" entry** between Dashboard and Capacity.
- [ ] **Mes tâches** lists the assigned tasks grouped by project, with a status sub-grouping.
- [ ] Click a task → TaskPanel opens with editable fields. Title/description **read-only** (because she's a member, not editor).
- [ ] Log 2.5h on a task → entry appears in the panel, persists on close/reopen.
- [ ] Try to remove a time entry she did not create → 403 (`not_your_entry`).
- [ ] Open Chrono SAEIV from her Dashboard:
  - Card on Dashboard **does not show Total Cost**.
  - Tab bar contains only **Work** and **Timeline** (no Budget / Charts / Summary / Risks / Phases).
- [ ] In Work → Board, attempt to drag a task assigned to Bob → server returns 403, optimistic move rolls back.
- [ ] Transition her own task from To Do → In Progress → succeeds.

### Scenario 2 — Bob the developer (Team role)

Same as Alice but on a separate browser/session. Confirms two members can coexist without seeing each other's work as their own.

- [ ] My Work shows Bob's tasks only — none of Alice's.
- [ ] Logging time on Alice's tasks is rejected with `not_your_task`.

### Scenario 3 — Carla the PM (Editor role)

Log in as `pm-carla@test.local`.

- [ ] Dashboard card for Chrono SAEIV **shows Total Cost** (Editors see finance).
- [ ] Project tabs: **all 7** visible (Phases, Timeline, Budget, Work, Charts, Summary, Risks).
- [ ] In Work → can create a new Epic, Story, Task.
- [ ] Can transition any task, regardless of assignee.
- [ ] In Budget → can change budget value, contingency, tax rate.
- [ ] In Budget → Period lock section: try to **close a past period** → succeeds (editor permission).
- [ ] Verify she **cannot** delete the project (owner-only): expect 403 if attempted via API.

### Scenario 4 — Owner (Daniel)

Log in as the owner.

- [ ] Sees and can edit everything (regression check — no team-UX tab gating).
- [ ] Can override the "own task only" rule: log time on Alice's task → succeeds (owner override per Decision 9).
- [ ] Can close + reopen periods.

## Cleanup after testing

Once the test cycle is complete, the test data can be removed via SQL or by deleting the three users (cascade clears their shares + linked resources):

```sql
DELETE FROM users WHERE email LIKE '%@test.local';
```

Resources whose `linked_user_id` pointed to a deleted user get reset to `NULL` automatically (`ON DELETE SET NULL`) — no orphan rows.

## Known gaps to revisit after this round

- Members cannot see _who_ closed a period — the email is shown only when the user is in their visible scope (currently always true; flag if not).
- Timesheet groups by linked resource only; if a member is assigned a task whose assignee is not their linked resource, they will not see it. This is correct by design but worth confirming on a real project where assignment churn happens.
