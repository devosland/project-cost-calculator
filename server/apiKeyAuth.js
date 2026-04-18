/**
 * Express middleware factory for API key authentication on public routes.
 * Validates keys from the X-API-Key header through a five-step sequence:
 *   1. Parse header — reject if absent or not a known "ckc_live_" key
 *   2. Hash lookup — reject if no active (non-revoked) record matches
 *   3. Scope check — reject with 403 if the key lacks the required scope
 *   4. User resolve — reject if the owning user no longer exists
 *   5. Attach & log — populate req.apiKey and req.user, touch last_used_at,
 *      and write a usage log entry after the response is sent (via 'finish' event).
 */
import { hashApiKey } from './apiKeys.js';
import { findApiKeyByHash, findUserById, touchApiKey, logApiKeyUsage } from './db.js';

/**
 * Returns an Express middleware that authenticates the request via an API key
 * and enforces a required scope.
 *
 * On success, populates:
 *   - req.apiKey  — { id, scopes, rateLimit }
 *   - req.user    — { id, email, name }
 *
 * On failure, responds with 401 (invalid/missing key or orphaned user)
 * or 403 (key valid but missing the required scope).
 *
 * Usage logging is deferred to the 'finish' event so the status code is known.
 *
 * @param {{ requiredScope: string }} options
 * @returns {import('express').RequestHandler}
 */
export function apiKeyAuth({ requiredScope }) {
  return (req, res, next) => {
    // Step 1: parse header — only accept keys with the known prefix to fail fast
    // before hitting the database.
    const rawKey = req.headers['x-api-key'];
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('ckc_live_')) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    // Step 2: hash lookup — we store the hash, never the plaintext key.
    const hash = hashApiKey(rawKey);
    const record = findApiKeyByHash(hash);
    if (!record) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    // Step 3: scope check — scopes are stored as a JSON array string in SQLite.
    let scopes = [];
    try { scopes = JSON.parse(record.scopes); } catch {}
    if (requiredScope && !scopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'insufficient_scope', required: requiredScope });
    }

    // Step 4: user resolve — guard against orphaned keys if the user was deleted
    // outside a cascade (defensive; the FK cascade should handle normal deletions).
    const user = findUserById(record.user_id);
    if (!user) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    // Step 5: attach context to the request for downstream handlers.
    req.apiKey = { id: record.id, scopes, rateLimit: record.rate_limit_per_min };
    req.user = { id: user.id, email: user.email, name: user.name };

    // Update last_used_at synchronously (cheap single-row write).
    touchApiKey(record.id);

    // Log usage after the response is flushed so we capture the real status code.
    res.on('finish', () => {
      try {
        logApiKeyUsage(record.id, req.originalUrl, req.method, res.statusCode, req.ip || null);
      } catch (e) {
        console.error('usage log failed:', e);
      }
    });

    next();
  };
}
