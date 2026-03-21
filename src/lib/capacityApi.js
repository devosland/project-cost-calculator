import { api } from './api';

export const capacityApi = {
  getResources: () => api.request('/api/capacity/resources'),
  createResource: (data) => api.request('/api/capacity/resources', { method: 'POST', body: JSON.stringify(data) }),
  updateResource: (id, data) => api.request(`/api/capacity/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResource: (id) => api.request(`/api/capacity/resources/${id}`, { method: 'DELETE' }),
  getAssignments: (filters = {}) => { const p = new URLSearchParams(filters).toString(); return api.request(`/api/capacity/assignments${p ? '?' + p : ''}`); },
  createAssignment: (data) => api.request('/api/capacity/assignments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssignment: (id, data) => api.request(`/api/capacity/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssignment: (id) => api.request(`/api/capacity/assignments/${id}`, { method: 'DELETE' }),
  getGanttData: (start, end) => api.request(`/api/capacity/gantt?start=${start}&end=${end}`),
  getTransitions: () => api.request('/api/capacity/transitions'),
  createTransition: (data) => api.request('/api/capacity/transitions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransition: (id, data) => api.request(`/api/capacity/transitions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransition: (id) => api.request(`/api/capacity/transitions/${id}`, { method: 'DELETE' }),
  applyTransition: (id) => api.request(`/api/capacity/transitions/${id}/apply`, { method: 'POST' }),
  getTransitionImpact: (id) => api.request(`/api/capacity/transitions/${id}/impact`),
};
