/**
 * Client for the execution-module endpoints (/api/execution/*).
 *
 * Mirrors the server router in `server/execution/index.js`. The 3 entity
 * families (epic / story / task) expose symmetric CRUD — `list`, `create`,
 * `get`, `update`, `remove` — plus a `transition` on tasks.
 *
 * This PR (PR 2 of the execution module) does NOT include time-entry
 * endpoints. Those land alongside rollups in PR 3.
 */
import { api } from './api';

const request = (path, opts) => api.request(`/execution${path}`, opts);

export const executionApi = {
  // --- Epics ---

  /** List all epics for a project (visible to the current user). */
  listEpics: (projectId) => request(`/projects/${projectId}/epics`),

  /** Create an epic under a project.
   *  Body: { title, status, priority?, description?, milestone_id?, phase_ids? } */
  createEpic: (projectId, body) => request(`/projects/${projectId}/epics`, {
    method: 'POST', body: JSON.stringify(body),
  }),

  /** Fetch a single epic by id (returns 404 if not accessible). */
  getEpic: (id) => request(`/epics/${id}`),

  /** Partial update. Any field left out keeps its current value. */
  updateEpic: (id, body) => request(`/epics/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),

  removeEpic: (id) => request(`/epics/${id}`, { method: 'DELETE' }),

  // --- Stories ---

  listStories: (epicId) => request(`/epics/${epicId}/stories`),
  createStory: (epicId, body) => request(`/epics/${epicId}/stories`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  getStory: (id) => request(`/stories/${id}`),
  updateStory: (id, body) => request(`/stories/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  removeStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),

  // --- Tasks ---

  /** List tasks for a project with optional filters.
   *  @param {object} [filters] - { status?: string, assignee?: number|'unassigned' } */
  listTasks: (projectId, filters = {}) => {
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.assignee !== undefined && filters.assignee !== null) qs.set('assignee', String(filters.assignee));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/projects/${projectId}/tasks${suffix}`);
  },

  createTask: (storyId, body) => request(`/stories/${storyId}/tasks`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  getTask: (id) => request(`/tasks/${id}`),
  updateTask: (id, body) => request(`/tasks/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  removeTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  /** Move a task to another status. Returns the updated task. */
  transitionTask: (id, to) => request(`/tasks/${id}/transition`, {
    method: 'POST', body: JSON.stringify({ to }),
  }),

  // --- Time entries ---

  /** List every time entry logged on a task. */
  listTime: (taskId) => request(`/tasks/${taskId}/time`),

  /** Log time on a task. The rate is snapshotted server-side from the project
   *  owner's rate card — clients never compute it.
   *  @param {object} body - { date, hours, note?, source?, resource_id? }.
   *    `resource_id` is only needed when the task has no assignee (project
   *    owner logging on behalf of a resource).
   */
  logTime: (taskId, body) => request(`/tasks/${taskId}/time`, {
    method: 'POST', body: JSON.stringify(body),
  }),

  /** Edit a time entry — only hours, date, note are mutable. */
  updateTime: (id, body) => request(`/time/${id}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),

  removeTime: (id) => request(`/time/${id}`, { method: 'DELETE' }),

  // --- Rollups ---

  /** Project-wide actuals: totals + by_month (YYYY-MM map) + by_phase map. */
  getActuals: (projectId) => request(`/projects/${projectId}/actuals`),

  /** Per-epic hours + cost, includes zero-cost epics. */
  getEpicCosts: (projectId) => request(`/projects/${projectId}/epic-costs`),
};
