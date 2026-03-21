const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('auth_token');
}

function setToken(token) {
  localStorage.setItem('auth_token', token);
}

function clearToken() {
  localStorage.removeItem('auth_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
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

  request,
  setToken,
  getToken,
  clearToken,
};
