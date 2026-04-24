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
};
