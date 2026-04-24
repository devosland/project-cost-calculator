/**
 * Execution module router — mounts all Epic / Story / Task CRUD routes under
 * `/api/execution`. Authentication is enforced by the top-level
 * `authMiddleware` attached at mount time. Per-project permission is checked
 * per-route via the helpers in `permissions.js`.
 *
 * Route conventions:
 *   - 404 on unknown or unshared entities (existence not leaked).
 *   - 403 only when the caller knows the entity but lacks the required role.
 *   - 400 on validation failures; body shape is `{ error, issues? }`.
 *   - 200 on successful read or update; 201 on create; 204 on delete.
 *
 * This module deliberately does NOT include time-entry routes — those land
 * in PR 3 so the CRUD surface can be reviewed independently.
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware.js';
import { db } from '../db.js';
import {
  epicCreateSchema, epicUpdateSchema,
  storyCreateSchema, storyUpdateSchema,
  taskCreateSchema, taskUpdateSchema,
  transitionSchema,
  timeEntryCreateSchema, timeEntryUpdateSchema,
} from './schemas.js';
import {
  getProjectRole, hasRole,
  projectIdForEpic, projectIdForStory, projectIdForTask,
} from './permissions.js';
import { nextKey } from './keys.js';
import { loadProjectRates, getHourlyRate } from './rates.js';
import { getProjectActuals, getEpicCosts } from './rollups.js';

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/**
 * Respond with a 400 derived from a ZodError. Keeps the body shape small and
 * predictable for the frontend.
 */
function respondValidationError(res, err) {
  res.status(400).json({
    error: 'validation_error',
    issues: err.issues?.map((i) => ({ path: i.path, message: i.message })) ?? [],
  });
}

/**
 * Verify a named status exists for the given project. Returns true when it is
 * defined, false otherwise; route handlers 400 on false.
 */
function statusExists(projectId, statusName) {
  const row = db.prepare(
    'SELECT 1 FROM project_statuses WHERE project_id = ? AND name = ?'
  ).get(projectId, statusName);
  return !!row;
}

/**
 * Given a role the caller has, respond 404 (no access at all) or 403 (insufficient
 * privilege). Returns true if the handler should abort.
 */
function gateAccess(res, actual, required) {
  if (!actual) {
    res.status(404).json({ error: 'not_found' });
    return true;
  }
  if (!hasRole(actual, required)) {
    res.status(403).json({ error: 'forbidden' });
    return true;
  }
  return false;
}

/**
 * Normalise the Zod-parsed payload into the subset of columns that map
 * directly to the DB row. `undefined` keys are left out so partial updates do
 * not clobber existing values.
 */
function pickDefined(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

/** GET /api/execution/projects/:projectId/epics */
router.get('/projects/:projectId/epics', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;

  const epics = db.prepare(`
    SELECT e.*, (
      SELECT json_group_array(ep.phase_id)
      FROM epic_phases ep
      WHERE ep.epic_id = e.id
    ) AS phase_ids_json
    FROM epics e
    WHERE e.project_id = ?
    ORDER BY e.id DESC
  `).all(projectId).map((row) => ({
    ...row,
    phase_ids: row.phase_ids_json ? JSON.parse(row.phase_ids_json) : [],
    phase_ids_json: undefined,
  }));
  res.json(epics);
});

/** POST /api/execution/projects/:projectId/epics */
router.post('/projects/:projectId/epics', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'editor')) return;

  const parsed = epicCreateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (!statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  try {
    const tx = db.transaction(() => {
      const key = nextKey(db, projectId, 'epic');
      const r = db.prepare(`
        INSERT INTO epics (project_id, key, title, description, status, priority, milestone_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        projectId, key, data.title, data.description ?? null, data.status,
        data.priority ?? 'medium', data.milestone_id ?? null
      );
      const epicId = Number(r.lastInsertRowid);
      if (Array.isArray(data.phase_ids)) {
        const insertEp = db.prepare('INSERT OR IGNORE INTO epic_phases (epic_id, phase_id) VALUES (?, ?)');
        for (const pid of data.phase_ids) insertEp.run(epicId, pid);
      }
      return epicId;
    });
    const id = tx();
    const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(id);
    const phase_ids = db.prepare('SELECT phase_id FROM epic_phases WHERE epic_id = ?').all(id).map((r) => r.phase_id);
    res.status(201).json({ ...epic, phase_ids });
  } catch (err) {
    console.error('Create epic error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** GET /api/execution/epics/:id */
router.get('/epics/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForEpic(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'viewer')) return;

  const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(id);
  const phase_ids = db.prepare('SELECT phase_id FROM epic_phases WHERE epic_id = ?').all(id).map((r) => r.phase_id);
  res.json({ ...epic, phase_ids });
});

/** PUT /api/execution/epics/:id */
router.put('/epics/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForEpic(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = epicUpdateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (data.status && !statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  const columns = pickDefined(data, ['title', 'description', 'status', 'priority', 'milestone_id']);
  const sets = Object.keys(columns).map((k) => `${k} = @${k}`);
  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE epics SET ${sets.join(', ')} WHERE id = @id`).run({ ...columns, id });
  }

  // phase_ids update: replace the set atomically.
  if (Array.isArray(data.phase_ids)) {
    const tx = db.transaction((phaseIds) => {
      db.prepare('DELETE FROM epic_phases WHERE epic_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO epic_phases (epic_id, phase_id) VALUES (?, ?)');
      for (const pid of phaseIds) ins.run(id, pid);
    });
    tx(data.phase_ids);
  }

  const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(id);
  const phase_ids = db.prepare('SELECT phase_id FROM epic_phases WHERE epic_id = ?').all(id).map((r) => r.phase_id);
  res.json({ ...epic, phase_ids });
});

/** DELETE /api/execution/epics/:id */
router.delete('/epics/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForEpic(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;
  db.prepare('DELETE FROM epics WHERE id = ?').run(id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** GET /api/execution/epics/:epicId/stories */
router.get('/epics/:epicId/stories', (req, res) => {
  const epicId = Number(req.params.epicId);
  const projectId = projectIdForEpic(epicId);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'viewer')) return;
  const stories = db.prepare('SELECT * FROM stories WHERE epic_id = ? ORDER BY id').all(epicId);
  res.json(stories);
});

/** POST /api/execution/epics/:epicId/stories */
router.post('/epics/:epicId/stories', (req, res) => {
  const epicId = Number(req.params.epicId);
  const projectId = projectIdForEpic(epicId);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = storyCreateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (!statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  try {
    const id = db.transaction(() => {
      const key = nextKey(db, projectId, 'story');
      const r = db.prepare(`
        INSERT INTO stories (epic_id, key, title, description, status, priority, estimate_hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        epicId, key, data.title, data.description ?? null, data.status,
        data.priority ?? 'medium', data.estimate_hours ?? null
      );
      return Number(r.lastInsertRowid);
    })();
    res.status(201).json(db.prepare('SELECT * FROM stories WHERE id = ?').get(id));
  } catch (err) {
    console.error('Create story error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** GET /api/execution/stories/:id */
router.get('/stories/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForStory(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'viewer')) return;
  res.json(db.prepare('SELECT * FROM stories WHERE id = ?').get(id));
});

/** PUT /api/execution/stories/:id */
router.put('/stories/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForStory(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = storyUpdateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (data.status && !statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  const columns = pickDefined(data, ['title', 'description', 'status', 'priority', 'estimate_hours']);
  if (Object.keys(columns).length > 0) {
    const sets = Object.keys(columns).map((k) => `${k} = @${k}`);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE stories SET ${sets.join(', ')} WHERE id = @id`).run({ ...columns, id });
  }
  res.json(db.prepare('SELECT * FROM stories WHERE id = ?').get(id));
});

/** DELETE /api/execution/stories/:id */
router.delete('/stories/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForStory(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;
  db.prepare('DELETE FROM stories WHERE id = ?').run(id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * GET /api/execution/projects/:projectId/tasks
 * Query params (optional):
 *   - status=To+Do
 *   - assignee=<resource_id>  or  assignee=unassigned
 */
router.get('/projects/:projectId/tasks', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;

  const conditions = ['e.project_id = ?'];
  const params = [projectId];
  if (req.query.status) {
    conditions.push('t.status = ?');
    params.push(req.query.status);
  }
  if (req.query.assignee === 'unassigned') {
    conditions.push('t.assignee_id IS NULL');
  } else if (req.query.assignee) {
    conditions.push('t.assignee_id = ?');
    params.push(Number(req.query.assignee));
  }

  const tasks = db.prepare(`
    SELECT t.*, s.epic_id, e.project_id
    FROM tasks t
    JOIN stories s ON s.id = t.story_id
    JOIN epics e ON e.id = s.epic_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.id DESC
  `).all(...params);
  res.json(tasks);
});

/** POST /api/execution/stories/:storyId/tasks */
router.post('/stories/:storyId/tasks', (req, res) => {
  const storyId = Number(req.params.storyId);
  const projectId = projectIdForStory(storyId);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = taskCreateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (!statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  try {
    const id = db.transaction(() => {
      const key = nextKey(db, projectId, 'task');
      const r = db.prepare(`
        INSERT INTO tasks (story_id, key, title, description, status, priority, assignee_id, estimate_hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        storyId, key, data.title, data.description ?? null, data.status,
        data.priority ?? 'medium', data.assignee_id ?? null, data.estimate_hours ?? null
      );
      return Number(r.lastInsertRowid);
    })();
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** GET /api/execution/tasks/:id */
router.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForTask(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'viewer')) return;
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

/** PUT /api/execution/tasks/:id */
router.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForTask(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = taskUpdateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;
  if (data.status && !statusExists(projectId, data.status)) {
    return res.status(400).json({ error: 'unknown_status', status: data.status });
  }

  const columns = pickDefined(data, ['title', 'description', 'status', 'priority', 'assignee_id', 'estimate_hours']);
  if (Object.keys(columns).length > 0) {
    const sets = Object.keys(columns).map((k) => `${k} = @${k}`);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run({ ...columns, id });
  }
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

/** DELETE /api/execution/tasks/:id */
router.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForTask(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ success: true });
});

/**
 * POST /api/execution/tasks/:id/transition
 * Body: { to: string }
 *
 * If the project has zero rows in `project_transitions`, any status change is
 * allowed (Jira-style "no workflow configured = free transitions"). Otherwise
 * the (from, to) pair must exist in `project_transitions`.
 */
router.post('/tasks/:id/transition', (req, res) => {
  const id = Number(req.params.id);
  const projectId = projectIdForTask(id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const to = parsed.data.to;
  if (!statusExists(projectId, to)) {
    return res.status(400).json({ error: 'unknown_status', status: to });
  }
  const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id);
  const from = task.status;

  const hasTransitions = db.prepare(
    'SELECT 1 FROM project_transitions WHERE project_id = ? LIMIT 1'
  ).get(projectId);
  if (hasTransitions) {
    const allowed = db.prepare(
      'SELECT 1 FROM project_transitions WHERE project_id = ? AND from_status = ? AND to_status = ?'
    ).get(projectId, from, to);
    if (!allowed) {
      return res.status(400).json({ error: 'transition_not_allowed', from, to });
    }
  }

  db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(to, id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

/**
 * True iff `date` (YYYY-MM-DD) falls inside a period that the project's
 * owner / editor has marked closed. No API to close yet (PR 5), so this is
 * effectively a no-op today — wiring it now means PR 5 does not need to
 * retrofit any endpoint.
 */
function isPeriodClosed(projectId, dateStr) {
  const period = dateStr.slice(0, 7); // YYYY-MM
  const row = db.prepare(
    'SELECT 1 FROM project_closed_periods WHERE project_id = ? AND period = ?'
  ).get(projectId, period);
  return !!row;
}

/**
 * True iff `dateStr` is strictly after today (local wallclock). Prevents
 * post-dated entries from inflating forecasts that haven't happened yet.
 */
function isFutureDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr > today;
}

/**
 * Resolve which resource the caller is logging time against, and the rate
 * to snapshot. Encapsulates Decision 9 ("own tasks only") plus the owner
 * override for unassigned backlog tasks.
 *
 * Returns either `{ ok: true, resourceId, rate, role, level }` or a failure
 * `{ ok: false, status, body }` that the caller passes straight to res.
 *
 * The caller has already verified project access; this only layers on the
 * logging-specific checks.
 */
function resolveLogger({ userId, role, task, bodyResourceId, rates }) {
  let resourceId = task.assignee_id;

  if (resourceId === null) {
    // Unassigned backlog — Decision 9: only the project owner can log time
    // on these, and they must explicitly name the resource they are logging
    // on behalf of (so the rate lookup has inputs).
    if (role !== 'owner') {
      return { ok: false, status: 403, body: { error: 'unassigned_task_owner_only' } };
    }
    if (!bodyResourceId) {
      return { ok: false, status: 400, body: { error: 'resource_id_required', hint: 'Include resource_id when logging on an unassigned task.' } };
    }
    resourceId = bodyResourceId;
  }

  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId);
  if (!resource) {
    return { ok: false, status: 400, body: { error: 'unknown_resource' } };
  }

  // Ownership: caller is either the project owner (override) or the linked
  // user for this resource. Linked-user flow is fully unlocked once PR 4
  // lands the UI; before then, only owners can log (linked_user_id stays
  // null on every resource).
  const isOwner = role === 'owner';
  const isLinked = resource.linked_user_id === userId;
  if (!isOwner && !isLinked) {
    return { ok: false, status: 403, body: { error: 'not_your_task' } };
  }

  const rate = getHourlyRate(rates, resource.role, resource.level);
  return { ok: true, resource, rate };
}

/**
 * GET /api/execution/tasks/:taskId/time
 * List all entries logged on a task. Anyone who can read the project can see them.
 */
router.get('/tasks/:taskId/time', (req, res) => {
  const taskId = Number(req.params.taskId);
  const projectId = projectIdForTask(taskId);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'viewer')) return;
  const entries = db.prepare(`
    SELECT * FROM time_entries WHERE task_id = ? ORDER BY date DESC, id DESC
  `).all(taskId);
  res.json(entries);
});

/**
 * POST /api/execution/tasks/:taskId/time
 * Body: { date, hours, note?, source?, resource_id? }
 *
 * Creates a time_entry with rate SNAPSHOTTED from the project owner's rate
 * card at this moment. The IPC May rate bump is the motivating case: April
 * entries logged today must freeze at today's rate, not get repriced in May.
 */
router.post('/tasks/:taskId/time', (req, res) => {
  const taskId = Number(req.params.taskId);
  const projectId = projectIdForTask(taskId);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  const parsed = timeEntryCreateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;

  if (isFutureDate(data.date)) {
    return res.status(400).json({ error: 'future_date' });
  }
  if (isPeriodClosed(projectId, data.date)) {
    return res.status(423).json({ error: 'period_closed', period: data.date.slice(0, 7) });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  const rates = loadProjectRates(projectId);
  const resolved = resolveLogger({
    userId: req.user.id, role, task, bodyResourceId: data.resource_id, rates,
  });
  if (!resolved.ok) return res.status(resolved.status).json(resolved.body);
  const { resource, rate } = resolved;

  try {
    const r = db.prepare(`
      INSERT INTO time_entries (task_id, resource_id, date, hours, note, rate_hourly, rate_role, rate_level, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(taskId, resource.id, data.date, data.hours, data.note ?? null, rate, resource.role, resource.level, data.source ?? 'manual');
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(Number(r.lastInsertRowid));
    res.status(201).json(entry);
  } catch (err) {
    console.error('Create time entry error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * PUT /api/execution/time/:id
 * Only hours / date / note are editable. Rate and task/resource are frozen —
 * to re-log against a different resource, delete and recreate.
 *
 * Both the OLD and NEW date must be in open periods. Moving an entry out of
 * a closed month is forbidden (the row is locked); moving one into a closed
 * month is also forbidden (preserves the closure's integrity).
 */
router.put('/time/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const projectId = projectIdForTask(existing.task_id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  // Own-entry check: editors can edit only their own entries; owners can
  // edit any. The resource's linked_user_id is the identity tie-in.
  if (role !== 'owner') {
    const resource = db.prepare('SELECT linked_user_id FROM resources WHERE id = ?').get(existing.resource_id);
    if (!resource || resource.linked_user_id !== req.user.id) {
      return res.status(403).json({ error: 'not_your_entry' });
    }
  }

  const parsed = timeEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationError(res, parsed.error);
  const data = parsed.data;

  if (data.date) {
    if (isFutureDate(data.date)) return res.status(400).json({ error: 'future_date' });
    if (isPeriodClosed(projectId, data.date)) {
      return res.status(423).json({ error: 'period_closed', period: data.date.slice(0, 7) });
    }
  }
  if (isPeriodClosed(projectId, existing.date)) {
    return res.status(423).json({ error: 'period_closed', period: existing.date.slice(0, 7) });
  }

  const columns = {};
  if (data.date !== undefined) columns.date = data.date;
  if (data.hours !== undefined) columns.hours = data.hours;
  if (data.note !== undefined) columns.note = data.note;

  if (Object.keys(columns).length > 0) {
    const sets = Object.keys(columns).map((k) => `${k} = @${k}`);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = @id`).run({ ...columns, id });
  }
  res.json(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id));
});

/** DELETE /api/execution/time/:id */
router.delete('/time/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const projectId = projectIdForTask(existing.task_id);
  const role = projectId ? getProjectRole(projectId, req.user.id) : null;
  if (gateAccess(res, role, 'editor')) return;

  if (role !== 'owner') {
    const resource = db.prepare('SELECT linked_user_id FROM resources WHERE id = ?').get(existing.resource_id);
    if (!resource || resource.linked_user_id !== req.user.id) {
      return res.status(403).json({ error: 'not_your_entry' });
    }
  }
  if (isPeriodClosed(projectId, existing.date)) {
    return res.status(423).json({ error: 'period_closed', period: existing.date.slice(0, 7) });
  }
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Rollups — read-only views over time_entries
// ---------------------------------------------------------------------------

/**
 * GET /api/execution/projects/:projectId/actuals
 * Returns { hours, cost, by_month, by_phase }. by_month is a map 'YYYY-MM' →
 * { hours, cost }; by_phase is a map phase_id → { hours, cost } with epic
 * costs equal-split across linked phases.
 */
router.get('/projects/:projectId/actuals', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;
  res.json(getProjectActuals(projectId));
});

/**
 * GET /api/execution/projects/:projectId/epic-costs
 * Per-epic rollup including zero-cost epics, for Board/Dashboard widgets.
 */
router.get('/projects/:projectId/epic-costs', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;
  res.json(getEpicCosts(projectId));
});

// ---------------------------------------------------------------------------
// Period lock (Decision 8)
// ---------------------------------------------------------------------------

/** Format a (year, month) 1-indexed tuple as 'YYYY-MM'. */
function periodString(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Validate a `YYYY-MM` path param and reject closing of future months.
 * Returns { ok: true, period } or { ok: false, status, body }.
 */
function parsePeriodParam(yyyyMM) {
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) {
    return { ok: false, status: 400, body: { error: 'invalid_period_format' } };
  }
  const now = new Date();
  const current = periodString(now.getFullYear(), now.getMonth() + 1);
  // Allow closing the current or any past month; reject strictly-future.
  if (yyyyMM > current) {
    return { ok: false, status: 400, body: { error: 'cannot_close_future_period' } };
  }
  return { ok: true, period: yyyyMM };
}

/**
 * GET /api/execution/projects/:projectId/periods
 * Returns the status of every month in a 12-month window ending at the
 * current month (inclusive). Closed entries carry who closed them + when.
 * The frontend is a dumb renderer — no client-side date math required.
 */
router.get('/projects/:projectId/periods', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;

  const closed = db.prepare(`
    SELECT cp.period, cp.closed_at, cp.closed_by_user, u.email AS closed_by_email
    FROM project_closed_periods cp
    LEFT JOIN users u ON u.id = cp.closed_by_user
    WHERE cp.project_id = ?
  `).all(projectId);
  const closedMap = new Map(closed.map((r) => [r.period, r]));

  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = periodString(d.getFullYear(), d.getMonth() + 1);
    const entry = closedMap.get(period);
    out.push({
      period,
      closed_at: entry?.closed_at ?? null,
      closed_by_user: entry?.closed_by_user ?? null,
      closed_by_email: entry?.closed_by_email ?? null,
    });
  }
  res.json(out);
});

/**
 * POST /api/execution/projects/:projectId/periods/:yyyyMM
 * Close the period. Idempotent: closing an already-closed period is a no-op
 * and returns the existing row. Editor or owner only.
 */
router.post('/projects/:projectId/periods/:yyyyMM', (req, res) => {
  const { projectId, yyyyMM } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'editor')) return;

  const parsed = parsePeriodParam(yyyyMM);
  if (!parsed.ok) return res.status(parsed.status).json(parsed.body);

  try {
    db.prepare(`
      INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(project_id, period) DO NOTHING
    `).run(projectId, parsed.period, req.user.id);

    const row = db.prepare(`
      SELECT cp.period, cp.closed_at, cp.closed_by_user, u.email AS closed_by_email
      FROM project_closed_periods cp
      LEFT JOIN users u ON u.id = cp.closed_by_user
      WHERE cp.project_id = ? AND cp.period = ?
    `).get(projectId, parsed.period);
    res.status(201).json(row);
  } catch (err) {
    console.error('Close period error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * DELETE /api/execution/projects/:projectId/periods/:yyyyMM
 * Reopen the period. Editor or owner only. Returns 200 even if the period
 * was already open — keeps the UI optimistic-update code simple.
 */
router.delete('/projects/:projectId/periods/:yyyyMM', (req, res) => {
  const { projectId, yyyyMM } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'editor')) return;
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) {
    return res.status(400).json({ error: 'invalid_period_format' });
  }
  db.prepare(
    'DELETE FROM project_closed_periods WHERE project_id = ? AND period = ?'
  ).run(projectId, yyyyMM);
  res.json({ success: true });
});

export default router;
