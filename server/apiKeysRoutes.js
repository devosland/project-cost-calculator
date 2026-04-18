/**
 * Express router for user-facing API key management (/api/auth/api-keys/*).
 * All routes require a valid JWT session (authMiddleware applied to the whole router).
 * Only scopes defined in ALLOWED_SCOPES can be requested — unknown scopes are rejected
 * at creation time to prevent privilege escalation.
 */
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { generateApiKey } from './apiKeys.js';
import { createApiKeyRecord, getApiKeysByUser, revokeApiKey } from './db.js';

// Whitelist of scopes that can be granted to API keys.
// Adding new scopes here and in publicApi.js is the single change needed to extend the API.
const ALLOWED_SCOPES = ['roadmap:import', 'roadmap:read'];

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/auth/api-keys
 * Lists all API keys for the authenticated user (including revoked ones).
 * Scopes are stored as a JSON string in SQLite and are parsed before returning.
 * Returns: 200 [{ id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, created_at, revoked_at }]
 */
router.get('/', (req, res) => {
  const keys = getApiKeysByUser(req.user.id).map(k => ({
    ...k,
    scopes: safeJson(k.scopes, []),
  }));
  res.json(keys);
});

/**
 * POST /api/auth/api-keys
 * Creates a new API key for the authenticated user.
 * The plaintext key is returned only at creation — it cannot be recovered later.
 * Rate limit is hardcoded to 60 req/min per key; adjustable in createApiKeyRecord if needed.
 * Body: { name: string (1–100 chars), scopes: string[] (subset of ALLOWED_SCOPES) }
 * Returns: 201 { id, name, scopes, key, prefix, created_at }
 * Errors: 400 invalid_name | 400 invalid_scopes
 */
router.post('/', (req, res) => {
  const { name, scopes } = req.body;
  if (!name || typeof name !== 'string' || name.length === 0 || name.length > 100) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(s => !ALLOWED_SCOPES.includes(s))) {
    return res.status(400).json({ error: 'invalid_scopes', allowed: ALLOWED_SCOPES });
  }

  const { key, prefix, hash } = generateApiKey();
  const id = createApiKeyRecord(req.user.id, name, prefix, hash, scopes, 60);
  res.status(201).json({ id, name, scopes, key, prefix, created_at: new Date().toISOString() });
});

/**
 * DELETE /api/auth/api-keys/:id
 * Revokes (soft-deletes) an API key by setting revoked_at.
 * Soft-delete is intentional: it preserves usage log entries and the audit trail
 * without requiring cascading deletes on api_key_usage.
 * Returns: 200 { success: true }
 * Errors: 404 if key not found or not owned by the authenticated user
 */
router.delete('/:id', (req, res) => {
  const result = revokeApiKey(parseInt(req.params.id, 10), req.user.id);
  // result.changes === 0 means no row was updated (wrong id or already revoked)
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

/** Safely parses a JSON string, returning fallback on any parse error. */
function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export default router;
