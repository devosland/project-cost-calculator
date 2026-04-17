import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { generateApiKey } from './apiKeys.js';
import { createApiKeyRecord, getApiKeysByUser, revokeApiKey } from './db.js';

const ALLOWED_SCOPES = ['roadmap:import', 'roadmap:read'];

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const keys = getApiKeysByUser(req.user.id).map(k => ({
    ...k,
    scopes: safeJson(k.scopes, []),
  }));
  res.json(keys);
});

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

router.delete('/:id', (req, res) => {
  const result = revokeApiKey(parseInt(req.params.id, 10), req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export default router;
