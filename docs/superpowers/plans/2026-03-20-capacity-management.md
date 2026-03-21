# Capacity Management Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a capacity management module with named resources, cross-project Gantt view, and consultant-to-permanent transition planning.

**Architecture:** New SQLite tables (resources, resource_assignments, transition_plans) with Express REST API under `/api/capacity/`. React frontend adds top-level "Capacite" view with Gantt, Resource Pool, and Transition sub-tabs. Vitest for TDD.

**Tech Stack:** React 18, Tailwind CSS, Express 4, SQLite (better-sqlite3), Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-03-20-capacity-management-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `vitest.config.js` | Vitest test configuration |
| `server/__tests__/setup.js` | Test DB helpers (create, seed, destroy) |
| `server/__tests__/capacity.test.js` | Backend tests for schema + API logic |
| `server/capacity.js` | Express router for all capacity endpoints |
| `src/lib/capacityApi.js` | Frontend HTTP client for capacity API |
| `src/lib/capacityCalculations.js` | Week-to-month, utilization, cost impact |
| `src/__tests__/capacityCalculations.test.js` | Unit tests for calculations |
| `src/components/CapacityView.jsx` | Top container with 3 sub-tabs |
| `src/components/ResourcePool.jsx` | CRUD table for named resources |
| `src/components/ResourceForm.jsx` | Add/edit resource form |
| `src/components/CapacityGantt.jsx` | Monthly Gantt timeline |
| `src/components/GanttBar.jsx` | Allocation bar element |
| `src/components/UtilizationSummary.jsx` | Bottom utilization bar |
| `src/components/QuickTransition.jsx` | Popover for single transition |
| `src/components/TransitionList.jsx` | List of transition plans |
| `src/components/TransitionPlanner.jsx` | Scenario planner panel |

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add vitest + testing-library deps |
| `server/db.js` | Add 3 tables, indexes, helper functions |
| `server/index.js` | Register capacity router |
| `server/projects.js` | Phase deletion cleanup hook |
| `src/App.jsx` | Add capacity view state + navigation |
| `src/lib/i18n.jsx` | Add capacity/resources/transitions keys |
| `src/components/PhaseEditor.jsx` | Resource name autocomplete |

---

## Task 1: Test Infrastructure Setup

**Files:**
- Create: `vitest.config.js`
- Create: `server/__tests__/setup.js`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

Run: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`

- [ ] **Step 2: Create vitest.config.js**

- [ ] **Step 3: Create server/__tests__/setup.js with test DB helpers**

Helpers: `createTestDb()`, `destroyTestDb()`, `seedSchema()`, `seedUser()`, `seedProject()`. The `seedSchema()` function creates all tables including the 3 new capacity tables so tests can run independently of server/db.js.

- [ ] **Step 4: Add test scripts to package.json**

Add `"test": "vitest run"` and `"test:watch": "vitest"` to scripts.

- [ ] **Step 5: Verify infra works**

Run: `npm test` — Expected: 0 tests, no errors.

- [ ] **Step 6: Commit**

`chore: set up Vitest test infrastructure`

---

## Task 2: Database Schema + Helper Functions

**Files:**
- Modify: `server/db.js`
- Add tests to: `server/__tests__/capacity.test.js`

- [ ] **Step 1: Write schema tests**

Test: resource creation, UNIQUE(user_id, name) constraint, same name for different users, assignment creation, UNIQUE(resource_id, project_id, phase_id) constraint, cascade on resource delete, cascade on project delete, transition plan creation with JSON data.

- [ ] **Step 2: Run tests — they pass against seedSchema()**

- [ ] **Step 3: Add tables to server/db.js**

3 CREATE TABLE statements + 4 CREATE INDEX statements after existing tables.

- [ ] **Step 4: Add prepared statement helpers to server/db.js**

Resource CRUD, assignment CRUD with joins, transition plan CRUD. Export them all.

- [ ] **Step 5: Run tests — all pass**

- [ ] **Step 6: Commit**

`feat: add capacity management DB schema with tests`

---

## Task 3: Capacity REST API

**Files:**
- Create: `server/capacity.js`
- Modify: `server/index.js`
- Add tests to: `server/__tests__/capacity.test.js`

- [ ] **Step 1: Write tests for API logic**

Test: resource CRUD (list, create with duplicate name error, update, delete with cascade), assignment creation with UNIQUE violation, transition apply with missing resource validation (must return error with IDs), gantt query returns resources + assignments within date range.

- [ ] **Step 2: Implement server/capacity.js**

Full Express router with: Resources (GET/POST/PUT/DELETE), Assignments (GET with filters/POST/PUT/DELETE), Gantt (GET with date range), Transitions (GET/POST/PUT/DELETE + /apply + /impact). All routes use authMiddleware, scope queries by user_id.

- [ ] **Step 3: Register router in server/index.js**

Add `app.use('/api/capacity', capacityRouter)`.

- [ ] **Step 4: Run tests + verify build**

- [ ] **Step 5: Commit**

`feat: add capacity management API endpoints`

---

## Task 4: Frontend Calculations + API Client

**Files:**
- Create: `src/lib/capacityCalculations.js`
- Create: `src/__tests__/capacityCalculations.test.js`
- Create: `src/lib/capacityApi.js`

- [ ] **Step 1: Write failing tests for calculations**

Test: `weekToMonth()` (offset conversion, year boundary), `getMonthRange()` (inclusive range, year boundary), `calculateUtilization()` (sum allocations, overlapping periods), `calculateTransitionCostImpact()` (consultant cost, replacement cost, overlap cost, savings).

- [ ] **Step 2: Run tests — FAIL (module not found)**

- [ ] **Step 3: Implement capacityCalculations.js**

Functions: `weekToMonth`, `getMonthRange`, `calculateUtilization`, `calculateTransitionCostImpact`. Uses `getHourlyRate` and `HOURS_PER_WEEK` from existing costCalculations.

- [ ] **Step 4: Run tests — all PASS**

- [ ] **Step 5: Create capacityApi.js**

Thin wrapper over `api.request()` for all capacity endpoints. Methods: getResources, createResource, updateResource, deleteResource, getAssignments, createAssignment, updateAssignment, deleteAssignment, getGanttData, getTransitions, createTransition, updateTransition, deleteTransition, applyTransition, getTransitionImpact.

- [ ] **Step 6: Commit**

`feat: add capacity calculations with tests and API client`

---

## Task 5: Project Start Date Setting

**Files:**
- Modify: `src/components/ProjectView.jsx`
- Modify: `src/lib/projectStore.js`

The spec requires a project start date as anchor for week-to-month conversion. Without it, `weekToMonth()` has no reference point.

- [ ] **Step 1: Add `startDate` to project settings defaults**

In `projectStore.js`, add `startDate: null` (YYYY-MM string) to the `settings` object in `createProject()`. Default null means "current month".

- [ ] **Step 2: Add start date input to ProjectView settings panel**

Add a month input (`type="month"`) in the project settings area (alongside contingency/taxes/currency). Label: `t('project.startDate')`. When null, display current month as placeholder.

- [ ] **Step 3: Add i18n keys for start date**

FR: `'project.startDate': 'Date de debut'`, EN: `'project.startDate': 'Start date'`.

- [ ] **Step 4: Verify build**

- [ ] **Step 5: Commit**

`feat: add project start date setting for capacity planning`

---

## Task 6: i18n Keys for Capacity Module

**Files:**
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1: Add FR keys under capacity.*, resources.*, transitions.* namespaces**

~40 keys covering all UI labels for the capacity module.

- [ ] **Step 2: Add EN keys under same namespaces**

Mirror of FR keys in English.

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

`feat: add i18n keys for capacity module (FR + EN)`

---

## Task 7: ResourcePool + ResourceForm UI

**Files:**
- Create: `src/components/ResourcePool.jsx`
- Create: `src/components/ResourceForm.jsx`

- [ ] **Step 1: Create ResourceForm**

Modal form: name (text), role (select from rates config), level (select from LEVEL_KEYS), max_capacity (number, default 100). Submit calls capacityApi.createResource or updateResource.

- [ ] **Step 2: Create ResourcePool**

Table: Name, Role, Level, Type (green/orange badge derived from level), Max Capacity, assignment count. Search bar. Add/Edit/Delete buttons. Uses capacityApi for CRUD, useLocale for translations.

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

`feat: add ResourcePool and ResourceForm components`

---

## Task 8: CapacityView + App Navigation

**Files:**
- Create: `src/components/CapacityView.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create CapacityView**

3 sub-tabs: Gantt (placeholder), Ressources (renders ResourcePool), Transitions (placeholder). Tab styling matches ProjectView pattern.

- [ ] **Step 2: Add navigation to App.jsx**

Add `view` state ('projects' | 'capacity'). Add "Capacite" button in header. Render CapacityView when view is 'capacity'. Pass rates prop.

- [ ] **Step 3: Verify build + manual test**

- [ ] **Step 4: Commit**

`feat: add CapacityView with navigation and ResourcePool tab`

---

## Task 9: Capacity Gantt View

**Files:**
- Create: `src/components/CapacityGantt.jsx`
- Create: `src/components/GanttBar.jsx`
- Create: `src/components/UtilizationSummary.jsx`
- Modify: `src/components/CapacityView.jsx`

- [ ] **Step 1: Create GanttBar** — colored bar with allocation %, click handler

- [ ] **Step 2: Create UtilizationSummary** — monthly aggregate bars (green/amber/red)

- [ ] **Step 3: Create CapacityGantt** — fetches gantt data, 12-month grid, toggle by project (default) / by type, resource rows with GanttBars, green/orange dot for permanent/consultant, red highlight on over-allocation

- [ ] **Step 4: Wire into CapacityView Gantt tab**

- [ ] **Step 5: Verify build**

- [ ] **Step 6: Commit**

`feat: add Capacity Gantt view with project/type grouping`

---

## Task 10: Quick Transition Popover

**Files:**
- Create: `src/components/QuickTransition.jsx`
- Modify: `src/components/CapacityGantt.jsx`

- [ ] **Step 1: Create QuickTransition** — popover with consultant summary, replacement picker, date, overlap, cost impact preview, apply button

- [ ] **Step 2: Wire into CapacityGantt** — onClick on consultant bars shows QuickTransition

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

`feat: add QuickTransition popover for consultant replacement`

---

## Task 11: Transition Scenario Planner

**Files:**
- Create: `src/components/TransitionList.jsx`
- Create: `src/components/TransitionPlanner.jsx`
- Modify: `src/components/CapacityView.jsx`

- [ ] **Step 1: Create TransitionList** — list of plans with status badges, new plan button

- [ ] **Step 2: Create TransitionPlanner** — add multiple transitions, cost comparison, conflict detection, timeline preview, save/apply

- [ ] **Step 3: Wire into CapacityView Transitions tab**

- [ ] **Step 4: Verify build**

- [ ] **Step 5: Commit**

`feat: add transition scenario planner with cost comparison`

---

## Task 12: PhaseEditor Resource Autocomplete

**Files:**
- Modify: `src/components/PhaseEditor.jsx`
- Modify: `server/projects.js`

- [ ] **Step 1: Add phase cleanup to server/projects.js PUT handler**

After saving project data, delete resource_assignments with phase_ids not in the updated project's phase list.

- [ ] **Step 2: Add name autocomplete to PhaseEditor**

Optional name field above role/level. Searches resource pool with autocomplete. On select existing: auto-fill role/level, create assignment. On type new name: show "Add to resource pool" option which creates the resource first, then the assignment. Blank = anonymous (backward compatible).

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

`feat: add resource autocomplete in PhaseEditor + phase cleanup`

---

## Task 13: Integration Test + Deploy

- [ ] **Step 1: Run all tests** — `npx vitest run` — all PASS
- [ ] **Step 2: Verify build** — `npx vite build` — succeeds
- [ ] **Step 3: Manual smoke test** — resources CRUD, Gantt view, transitions, FR/EN
- [ ] **Step 4: Create PR** — `feat/capacity-management` branch
- [ ] **Step 5: Deploy to VPS** — git pull + docker compose up -d --build

---

## Dependency Graph

```
Task 1 (test infra)
  -> Task 2 (DB schema)
    -> Task 3 (API router)
      -> Task 4 (calculations + API client)
        -> Task 5 (project start date)
          -> Task 6 (i18n)
            -> Task 7 (ResourcePool UI)
              -> Task 8 (CapacityView + nav)
                -> Task 9 (Gantt view)
                  -> Task 10 (Quick transition)
                -> Task 11 (Scenario planner)
              -> Task 12 (PhaseEditor autocomplete)
            -> Task 13 (integration + deploy)
```

Tasks 9+10 and Task 11 can run in parallel after Task 8.
Task 10 depends on Task 9 (modifies CapacityGantt).
Task 12 can run in parallel with Tasks 9-11 after Task 8.
