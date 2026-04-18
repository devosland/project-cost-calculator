/**
 * Client for the API-key management endpoints (/auth/api-keys).
 * API keys let external tools (e.g. roadmap integrations) authenticate
 * without a user session. This module is used by the API Keys settings page.
 */
import { api } from './api';

export const apiKeysApi = {
  /**
   * List all API keys belonging to the authenticated user.
   * @returns {Promise<object[]>} Array of key objects (id, name, scopes, lastUsed, revoked).
   */
  list: () => api.request('/auth/api-keys'),

  /**
   * Create a new API key with the given name and permission scopes.
   * The raw key value is returned only once in this response — it is never
   * retrievable again, so the UI must prompt the user to copy it immediately.
   * @param {string}   name   - Human-readable label for the key.
   * @param {string[]} scopes - Permission scopes (e.g. ['roadmap:import']).
   * @returns {Promise<{key: string, id: string}>}
   */
  create: (name, scopes) => api.request('/auth/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),

  /**
   * Revoke an existing API key by ID. Revoked keys are permanently disabled;
   * any integration using the key will stop working immediately.
   * @param {string} id - API key ID to revoke.
   * @returns {Promise<void>}
   */
  revoke: (id) => api.request(`/auth/api-keys/${id}`, { method: 'DELETE' }),
};
