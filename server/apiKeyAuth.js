import { hashApiKey } from './apiKeys.js';
import { findApiKeyByHash, findUserById, touchApiKey, logApiKeyUsage } from './db.js';

export function apiKeyAuth({ requiredScope }) {
  return (req, res, next) => {
    const rawKey = req.headers['x-api-key'];
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('ckc_live_')) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    const hash = hashApiKey(rawKey);
    const record = findApiKeyByHash(hash);
    if (!record) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    let scopes = [];
    try { scopes = JSON.parse(record.scopes); } catch {}
    if (requiredScope && !scopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'insufficient_scope', required: requiredScope });
    }

    const user = findUserById(record.user_id);
    if (!user) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    req.apiKey = { id: record.id, scopes, rateLimit: record.rate_limit_per_min };
    req.user = { id: user.id, email: user.email, name: user.name };

    touchApiKey(record.id);

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
