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
} from './schemas.js';
import {
  getProjectRole, hasRole,
  projectIdForEpic, projectIdForStory, projectIdForTask,
} from './permissions.js';
import { nextKey } from './keys.js';

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

export default router;
