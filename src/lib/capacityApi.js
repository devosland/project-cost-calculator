import { api } from './api';

export const capacityApi = {
  getResources: () => api.request('/capacity/resources'),
  createResource: (data) => api.request('/capacity/resources', { method: 'POST', body: JSON.stringify(data) }),
  updateResource: (id, data) => api.request(`/capacity/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResource: (id) => api.request(`/capacity/resources/${id}`, { method: 'DELETE' }),
  getAssignments: (filters = {}) => { const p = new URLSearchParams(filters).toString(); return api.request(`/capacity/assignments${p ? '?' + p : ''}`); },
  createAssignment: (data) => api.request('/capacity/assignments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssignment: (id, data) => api.request(`/capacity/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssignment: (id) => api.request(`/capacity/assignments/${id}`, { method: 'DELETE' }),
  getGanttData: (start, end) => api.request(`/capacity/gantt?start=${start}&end=${end}`),
  getTransitions: () => api.request('/capacity/transitions'),
  createTransition: (data) => api.request('/capacity/transitions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransition: (id, data) => api.request(`/capacity/transitions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransition: (id) => api.request(`/capacity/transitions/${id}`, { method: 'DELETE' }),
  applyTransition: (id) => api.request(`/capacity/transitions/${id}/apply`, { method: 'POST' }),
  getTransitionImpact: (id) => api.request(`/capacity/transitions/${id}/impact`),
};
