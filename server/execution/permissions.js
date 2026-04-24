/**
 * Permission helpers for the execution module.
 *
 * Reuses the existing `projects.owner_id` + `project_shares(role)` model:
 *
 *   owner  → full access
 *   editor → can CRUD epics / stories / tasks and log time on their own tasks
 *   viewer → read-only
 *   none   → pretend the project does not exist (404, not 403) so existence
 *            is never leaked to unshared users
 *
 * Used from route handlers rather than as middleware because permission
 * checks here depend on whichever entity is being manipulated (a task
 * resolves to its project via story → epic), so the check must happen
 * *after* the entity is loaded.
 */
import { db } from '../db.js';

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

/**
 * @param {string} projectId
 * @param {number} userId
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function getProjectRole(projectId, userId) {
  const row = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (!row) return null;
  if (row.owner_id === userId) return 'owner';
  const share = db.prepare(
    'SELECT role FROM project_shares WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
  return share ? share.role : null;
}

/**
 * True iff `actual` is at least as privileged as `required`.
 * @param {'viewer'|'editor'|'owner'|null} actual
 * @param {'viewer'|'editor'|'owner'} required
 */
export function hasRole(actual, required) {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Resolve the project id from any execution entity id. Returns null if the
 * entity does not exist, so callers can 404 without disclosing membership.
 */
export function projectIdForEpic(epicId) {
  const row = db.prepare('SELECT project_id FROM epics WHERE id = ?').get(epicId);
  return row ? row.project_id : null;
}

export function projectIdForStory(storyId) {
  const row = db.prepare(`
    SELECT e.project_id
    FROM stories s
    JOIN epics e ON e.id = s.epic_id
    WHERE s.id = ?
  `).get(storyId);
  return row ? row.project_id : null;
}

export function projectIdForTask(taskId) {
  const row = db.prepare(`
    SELECT e.project_id
    FROM tasks t
    JOIN stories s ON s.id = t.story_id
    JOIN epics e ON e.id = s.epic_id
    WHERE t.id = ?
  `).get(taskId);
  return row ? row.project_id : null;
}
