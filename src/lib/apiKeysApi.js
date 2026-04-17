import { api } from './api';

export const apiKeysApi = {
  list: () => api.request('/auth/api-keys'),
  create: (name, scopes) => api.request('/auth/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revoke: (id) => api.request(`/auth/api-keys/${id}`, { method: 'DELETE' }),
};
