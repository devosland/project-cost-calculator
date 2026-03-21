# Capacity Management Module — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Context

The project cost calculator currently manages team members as anonymous role+level+quantity tuples within each project's JSON blob. The capacity management module introduces named resources, cross-project allocation tracking, and consultant-to-permanent transition planning — similar to MS Project resource views.

## Requirements

1. Cross-project consolidated view of all named resources on a monthly Gantt-like timeline
2. Named individuals (not anonymous roles) in a central resource pool
3. Internal employee (level "Employé interne") = permanent; all other seniority levels = consultant
4. Consultant-to-permanent transition planning: quick individual transitions AND multi-transition scenario planner with cost impact preview
5. Max capacity per resource to show over/under-allocation
6. Monthly Gantt-like timeline, scrollable 12-month horizon
7. Full backward compatibility — anonymous project members continue to work unchanged

## Architecture

### Navigation

New "Capacité" button in the app header, at the same level as "Projets". The app has two top-level views:

- **Projets** — existing dashboard and project views (unchanged)
- **Capacité** — new view with 3 sub-tabs: Gantt, Ressources, Transitions

### Data Model

Three new SQLite tables. Existing tables and JSON blob storage remain untouched.

#### `resources`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| user_id | INTEGER NOT NULL | FK → users(id), owner of this resource pool |
| name | TEXT NOT NULL | Person's full name |
| role | TEXT NOT NULL | Primary role (e.g., "Développeur Frontend") |
| level | TEXT NOT NULL | Seniority level — "Employé interne" means permanent, all others are consultants |
| max_capacity | INTEGER DEFAULT 100 | Maximum allocation % (for part-time resources) |
| created_at | TEXT DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT DEFAULT CURRENT_TIMESTAMP | |

The `type` (permanent vs consultant) is derived: `level === 'Employé interne'` → permanent, else → consultant. No separate column needed.

**Constraints:**
- `UNIQUE(user_id, name)` — prevents duplicate names within a user's resource pool

#### `resource_assignments`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| resource_id | INTEGER NOT NULL | FK → resources(id) ON DELETE CASCADE |
| project_id | TEXT NOT NULL | FK → projects(id) ON DELETE CASCADE |
| phase_id | TEXT NOT NULL | Phase ID within the project JSON |
| allocation | INTEGER NOT NULL | Allocation % (0–100) |
| start_month | TEXT NOT NULL | ISO month "YYYY-MM" |
| end_month | TEXT NOT NULL | ISO month "YYYY-MM" |
| created_at | TEXT DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT DEFAULT CURRENT_TIMESTAMP | |

**Constraints:**
- `UNIQUE(resource_id, project_id, phase_id)` — one assignment per resource per phase (update allocation/dates instead of duplicating)
- `ON DELETE CASCADE` on both `resource_id` and `project_id` foreign keys

**Phase deletion cleanup:** When a project is saved via `PUT /api/projects/:id`, the save handler compares the current phase IDs in the JSON with existing `resource_assignments` for that project. Any assignments referencing deleted phase IDs are automatically pruned. This is an API-level hook, not a DB constraint, since phase IDs live in the JSON blob.

This table enables cross-project capacity queries without touching the project JSON blob.

#### `transition_plans`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| user_id | INTEGER NOT NULL | FK → users(id) |
| name | TEXT NOT NULL | Plan name (e.g., "Plan de transition Q2-2026") |
| status | TEXT DEFAULT 'draft' | One of: draft, planned, applied |
| data | TEXT NOT NULL DEFAULT '{}' | JSON blob with transitions array (see below) |
| created_at | TEXT DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT DEFAULT CURRENT_TIMESTAMP | |

The `data` JSON structure:

```json
{
  "transitions": [
    {
      "id": "unique-id",
      "consultant_resource_id": 5,
      "replacement_resource_id": 12,
      "replacement_is_new": false,
      "transition_date": "2026-05",
      "overlap_weeks": 2,
      "notes": ""
    }
  ]
}
```

**Resource validation:** When applying a transition plan (`POST .../apply`), the API validates that all referenced `consultant_resource_id` and `replacement_resource_id` values still exist. If any resource has been deleted since the plan was created, the apply fails with a clear error identifying the missing resources.

#### Indexes

```sql
CREATE INDEX idx_resources_user ON resources(user_id);
CREATE INDEX idx_assignments_resource_months ON resource_assignments(resource_id, start_month, end_month);
CREATE INDEX idx_assignments_project ON resource_assignments(project_id);
CREATE INDEX idx_transition_plans_user ON transition_plans(user_id);
```

### Over-Allocation Detection

A resource is over-allocated in a given month when the sum of all its `resource_assignments.allocation` values overlapping that month exceeds `resources.max_capacity`. For example, a resource with `max_capacity = 100` and two overlapping assignments of 60% each (total 120%) is over-allocated. A part-time resource with `max_capacity = 50` and a single 60% assignment is also over-allocated.

### Week-to-Month Conversion

Existing phases use `durationWeeks` (integer). The capacity module uses `start_month`/`end_month` (YYYY-MM). When creating an assignment from PhaseEditor:

1. A **project start date** field is added to project settings (default: current month). This is the anchor point.
2. Each phase's position is computed from dependencies and `durationWeeks` (using the existing `calculateProjectDurationWithDependencies` function) to derive `startWeek` and `endWeek`.
3. The assignment's `start_month` = project start date + `startWeek` weeks (rounded to month). `end_month` = project start date + `endWeek` weeks (rounded to month).
4. Users can manually adjust `start_month`/`end_month` on assignments independently of phase duration for flexibility.

### API Endpoints

All new endpoints under `/api/capacity/`, protected by `authMiddleware`. All queries are scoped to the authenticated user by joining `resource_assignments` → `resources` where `resources.user_id = req.user.id`.

#### Resources

- `GET /api/capacity/resources` — list user's resource pool
- `POST /api/capacity/resources` — create a resource
- `PUT /api/capacity/resources/:id` — update a resource
- `DELETE /api/capacity/resources/:id` — delete a resource (cascades assignments via FK)

#### Assignments

- `GET /api/capacity/assignments` — list all assignments (filters: `?month=YYYY-MM`, `?resource_id=`, `?project_id=`)
- `POST /api/capacity/assignments` — create an assignment (validates no duplicate resource+project+phase)
- `PUT /api/capacity/assignments/:id` — update an assignment
- `DELETE /api/capacity/assignments/:id` — remove an assignment

#### Gantt Data

- `GET /api/capacity/gantt?start=YYYY-MM&end=YYYY-MM` — aggregated view: resources with their assignments and utilization per month, grouped by project or by type

#### Transitions

- `GET /api/capacity/transitions` — list transition plans
- `POST /api/capacity/transitions` — create a plan
- `PUT /api/capacity/transitions/:id` — update a plan
- `POST /api/capacity/transitions/:id/apply` — apply a plan (validates resources exist, creates/updates assignments, marks consultant end dates)
- `DELETE /api/capacity/transitions/:id` — delete a plan
- `GET /api/capacity/transitions/:id/impact` — calculate cost impact for a plan

### Frontend Components

#### Top-Level

- **`CapacityView.jsx`** — main container with sub-tab navigation (Gantt / Ressources / Transitions)

#### Gantt Sub-Tab

- **`CapacityGantt.jsx`** — the Gantt-like timeline view
  - Default view: grouped by project (collapsible sections)
  - Toggle to: grouped by type (Permanent / Consultant sections)
  - 12-month scrollable horizon with month columns
  - Color-coded bars per project, green/orange dots for permanent/consultant
  - Red highlight for over-allocation (>max_capacity), dashed gray for availability gaps
  - Global utilization bar at the bottom per month
- **`GanttBar.jsx`** — individual allocation bar (project color, % label, click to edit)
- **`UtilizationSummary.jsx`** — bottom bar showing aggregate utilization per month

#### Resources Sub-Tab

- **`ResourcePool.jsx`** — CRUD table for the resource pool
  - Columns: Name, Role, Level, Type (auto-derived badge), Max Capacity, Assignments count
  - Add/Edit/Delete actions
  - Search/filter by name or role
- **`ResourceForm.jsx`** — add/edit form (name, role dropdown from rates config, level dropdown, max capacity)

#### Transitions Sub-Tab

- **`TransitionList.jsx`** — list of transition plans with status badges
- **`TransitionPlanner.jsx`** — the scenario planner panel
  - Add multiple transitions to a plan
  - Each transition: consultant selector → replacement selector (existing or new) → date → overlap
  - Conflict detection: warns when transition date falls within an active project phase
  - Cost comparison: current annual cost vs post-transition cost, projected savings
  - Timeline preview mini-Gantt
  - Save/Compare scenarios
- **`QuickTransition.jsx`** — popover triggered from Gantt view on consultant click
  - Current consultant summary (name, role, rate, assignments)
  - Replacement picker (existing resource or "New permanent")
  - Transition date and overlap period
  - Instant cost impact calculation
  - "Apply" button

#### Integration with PhaseEditor

- When adding a team member in a phase, an autocomplete field appears for name
- Typing a name searches the resource pool
- Selecting an existing resource auto-fills role/level and creates a `resource_assignment`
- Typing a new name offers "Add to resource pool" which creates the resource and the assignment
- Leaving name blank keeps the anonymous mode (backward compatible)

### Backward Compatibility

The two systems coexist permanently:

1. **Anonymous members** — existing `teamMembers` array in project JSON, quantity-based. Continue to work for cost calculation, phase editor, and all existing features. These do NOT appear in the capacity Gantt.
2. **Named resources** — linked via `resource_assignments` table. These appear in the capacity Gantt and support transition planning.
3. **No forced migration** — users choose when to name their resources. A project can have a mix of anonymous and named members.

### Cost Impact Calculation

For transition cost impact, using the existing `getHourlyRate(rates, role, level)` function and `HOURS_PER_WEEK = 37.5`:

```
consultant_rate = getHourlyRate(rates, consultant.role, consultant.level)
replacement_rate = getHourlyRate(rates, replacement.role, replacement.level)
allocation_factor = assignment.allocation / 100

consultant_remaining_cost = consultant_rate × HOURS_PER_WEEK × remaining_weeks × allocation_factor
replacement_cost = replacement_rate × HOURS_PER_WEEK × same_period_weeks × allocation_factor
overlap_cost = (consultant_rate + replacement_rate) × HOURS_PER_WEEK × overlap_weeks × allocation_factor
savings = consultant_remaining_cost - replacement_cost - overlap_cost
```

Annual projection extrapolates the rate difference over 52 weeks at the same allocation.

### i18n

All new UI strings added to `src/lib/i18n.jsx` under the `capacity.*`, `resources.*`, and `transitions.*` namespaces, in both French and English.

### Scope Boundaries

**In scope:**
- Resource pool CRUD
- Resource assignment to project phases
- Monthly Gantt view (by project + by type toggle)
- Over/under-allocation detection (vs max_capacity)
- Quick transition (popover)
- Scenario planner with cost impact
- Autocomplete resource names in PhaseEditor
- Project start date in settings

**Out of scope (future):**
- Drag-and-drop on Gantt bars
- Resource skills/competency matrix
- Integration with HR systems
- Timesheet tracking
- Multi-user resource pool sharing (each user has their own pool)
