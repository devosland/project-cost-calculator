/**
 * HTTP client layer — the single boundary between the React frontend and the
 * Express backend. Every request is routed through `request()` which
 * automatically prepends the /api prefix, attaches the JWT from localStorage,
 * and throws a normalised Error when the server responds with a non-2xx status.
 *
 * All higher-level API modules (capacityApi, apiKeysApi, …) delegate to
 * `api.request()` so auth and base-URL logic stays in one place.
 */

// All backend routes live under /api; request() prepends this automatically.
// Callers must never include /api in the path they pass — e.g. use '/projects',
// not '/api/projects'.
const API_BASE = '/api';

/**
 * Read the JWT stored by the login flow.
 * Returns null when no user is authenticated.
 * @returns {string|null}
 */
function getToken() {
  return localStorage.getItem('auth_token');
}

/**
 * Persist a JWT after a successful login or register response.
 * @param {string} token
 */
function setToken(token) {
  localStorage.setItem('auth_token', token);
}

/**
 * Remove the stored JWT, effectively logging the user out on the client side.
 */
function clearToken() {
  localStorage.removeItem('auth_token');
}

/**
 * Core fetch wrapper used by every API call in this application.
 *
 * Behaviour:
 * - Prepends API_BASE (/api) to every path.
 * - Attaches `Authorization: Bearer <token>` when a JWT is present.
 * - Always sends/receives JSON (`Content-Type: application/json`).
 * - On non-2xx responses, parses the server error body and throws an Error
 *   using `data.error` or the fallback string 'Request failed'.
 *
 * @param {string} path    - Route relative to /api (e.g. '/projects/123').
 * @param {object} options - Fetch init options (method, body, headers, …).
 * @returns {Promise<any>} Parsed JSON body from a successful response.
 * @throws {Error} With message from server's `error` field on failure.
 */
async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  // Attach bearer token when present; unauthenticated endpoints (login,
  // register, forgot-password) work without it.
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/**
 * Centralised API client object. Import this everywhere you need to call the
 * backend — never construct fetch calls directly in components.
 *
 * Auth helpers (`setToken`, `getToken`, `clearToken`) are re-exported here so
 * callers can manage the JWT lifecycle without importing from this file
 * internally.
 */
export const api = {
  // --- Auth ---
  register: (email, name, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  getMe: () => request('/auth/me'),
  loadData: () => request('/data'),
  saveData: (projects, rates) => request('/data', { method: 'PUT', body: JSON.stringify({ projects, rates }) }),

  // Projects
  getProjects: () => request('/projects'),
  createProject: (project) => request('/projects', { method: 'POST', body: JSON.stringify(project) }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

  // Sharing
  getShares: (projectId) => request(`/projects/${projectId}/shares`),
  shareProject: (projectId, email, role) => request(`/projects/${projectId}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  unshareProject: (projectId, userId) => request(`/projects/${projectId}/share/${userId}`, { method: 'DELETE' }),

  // Snapshots
  getSnapshots: (projectId) => request(`/projects/${projectId}/snapshots`),
  createSnapshot: (projectId, label) => request(`/projects/${projectId}/snapshots`, { method: 'POST', body: JSON.stringify({ label }) }),
  restoreSnapshot: (snapshotId) => request(`/projects/snapshots/${snapshotId}/restore`, { method: 'POST' }),

  // Templates
  getTemplates: () => request('/templates'),
  saveTemplate: (name, data) => request('/templates', { method: 'POST', body: JSON.stringify({ name, data }) }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  // Escape hatches — exposed so modules with non-standard needs (e.g.
  // apiKeysApi) can call arbitrary routes without duplicating auth logic.
  request,
  setToken,
  getToken,
  clearToken,
};
