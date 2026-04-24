/**
 * Client for all capacity-planning endpoints (/api/capacity/*).
 * Covers the three core capacity entities — resources, assignments, and
 * transition plans — plus the Gantt data query used by CapacityGantt.
 */
import { api } from './api';

export const capacityApi = {
  // --- Resource pool ---

  /**
   * Fetch all resources (consultants + permanent employees) in the pool.
   * @returns {Promise<object[]>}
   */
  getResources: () => api.request('/capacity/resources'),

  /**
   * Add a new resource to the pool.
   * @param {object} data - Resource fields (name, role, level, type, maxCapacity).
   * @returns {Promise<object>} Created resource.
   */
  createResource: (data) => api.request('/capacity/resources', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Update an existing resource.
   * @param {string} id   - Resource ID.
   * @param {object} data - Partial or full resource fields to update.
   * @returns {Promise<object>} Updated resource.
   */
  updateResource: (id, data) => api.request(`/capacity/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /**
   * Delete a resource and all its assignments.
   * @param {string} id - Resource ID.
   * @returns {Promise<void>}
   */
  deleteResource: (id) => api.request(`/capacity/resources/${id}`, { method: 'DELETE' }),

  /**
   * List users eligible to be linked to a resource in the pool — the caller
   * plus anyone shared on one of their projects. Used by the Resource Pool
   * "Linked user" dropdown.
   * @returns {Promise<Array<{ id: number, email: string, name: string, linked_resource_id: number|null }>>}
   */
  getShareCandidates: () => api.request('/capacity/share-candidates'),

  /**
   * Link (or unlink, with userId=null) a resource to a user account. The
   * linked user is the one allowed to log time against that resource per
   * Decision 9.
   * @param {number} resourceId
   * @param {number|null} userId
   */
  linkResourceUser: (resourceId, userId) => api.request(
    `/capacity/resources/${resourceId}/user`,
    { method: 'PUT', body: JSON.stringify({ user_id: userId }) }
  ),

  // --- Assignments ---

  /**
   * Fetch assignments, optionally filtered by resource or date range.
   * Builds a query string from the filters object so callers don't need
   * to construct URLs manually.
   * @param {object} [filters={}] - e.g. { resource_id: '...', start_month: 'YYYY-MM' }
   * @returns {Promise<object[]>}
   */
  getAssignments: (filters = {}) => { const p = new URLSearchParams(filters).toString(); return api.request(`/capacity/assignments${p ? '?' + p : ''}`); },

  /**
   * Create a new assignment linking a resource to a project for a period.
   * @param {object} data - Assignment fields (resource_id, project_id, allocation, start_month, end_month).
   * @returns {Promise<object>} Created assignment.
   */
  createAssignment: (data) => api.request('/capacity/assignments', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Update an existing assignment (e.g. change allocation % or date range).
   * @param {string} id   - Assignment ID.
   * @param {object} data - Fields to update.
   * @returns {Promise<object>} Updated assignment.
   */
  updateAssignment: (id, data) => api.request(`/capacity/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /**
   * Delete an assignment.
   * @param {string} id - Assignment ID.
   * @returns {Promise<void>}
   */
  deleteAssignment: (id) => api.request(`/capacity/assignments/${id}`, { method: 'DELETE' }),

  // --- Gantt ---

  /**
   * Fetch pre-computed Gantt rows for the given date window.
   * The server aggregates assignments and resources into the shape expected
   * by CapacityGantt — one row per resource with monthly utilization cells.
   * @param {string} start - Start month in YYYY-MM format.
   * @param {string} end   - End month in YYYY-MM format.
   * @returns {Promise<object>} Gantt payload (rows, months, resources).
   */
  getGanttData: (start, end) => api.request(`/capacity/gantt?start=${start}&end=${end}`),

  // --- Transition plans ---

  /**
   * Fetch all transition plans for the authenticated user.
   * @returns {Promise<object[]>}
   */
  getTransitions: () => api.request('/capacity/transitions'),

  /**
   * Create a new transition plan (consultant → permanent replacement).
   * @param {object} data - Plan fields (name, transitions[], status).
   * @returns {Promise<object>} Created plan.
   */
  createTransition: (data) => api.request('/capacity/transitions', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Update a transition plan (e.g. change status from draft to planned).
   * @param {string} id   - Plan ID.
   * @param {object} data - Fields to update.
   * @returns {Promise<object>} Updated plan.
   */
  updateTransition: (id, data) => api.request(`/capacity/transitions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /**
   * Delete a transition plan.
   * @param {string} id - Plan ID.
   * @returns {Promise<void>}
   */
  deleteTransition: (id) => api.request(`/capacity/transitions/${id}`, { method: 'DELETE' }),

  /**
   * Fetch a single transition plan by ID.
   * Used by CapacityGantt preview mode to load plan details without re-fetching the full list.
   * @param {string|number} id - Plan ID.
   * @returns {Promise<object>} Transition plan object.
   */
  getTransitionPlan: (id) => api.request(`/capacity/transitions/${id}`),

  /**
   * Apply a transition plan — converts it from planned to applied state and
   * updates the resource pool accordingly on the server.
   * @param {string} id - Plan ID.
   * @returns {Promise<object>} Result summary.
   */
  applyTransition: (id) => api.request(`/capacity/transitions/${id}/apply`, { method: 'POST' }),

  /**
   * Compute the cost impact of a transition plan without applying it.
   * Returns consultant vs. replacement costs, overlap cost, projected savings,
   * and annualised savings. Used by the TransitionPlanner preview panel.
   * @param {string} id - Plan ID.
   * @returns {Promise<{consultantCost, replacementCost, overlapCost, savings, annualSavings}>}
   */
  getTransitionImpact: (id) => api.request(`/capacity/transitions/${id}/impact`),
};
